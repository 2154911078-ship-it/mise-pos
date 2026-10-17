/**
 * orders.js —— 订单生命周期：开单 → 支付 / 作废。
 *
 * 关键设计：
 *  · 下单即锁库存（`UPDATE ... WHERE stock >= ?` 做原子条件扣减，避免超卖）
 *  · 订单、明细、库存流水三张表写在同一个 SQLite 事务里，任一步失败整体回滚
 *  · 作废时按流水原路回补库存，账实始终一致
 */
import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import { ApiError, asyncHandler, badRequest, conflict, nextOrderNo, pagination } from '../utils.js';

const PAYMENT_METHODS = new Set(['cash', 'wechat', 'alipay', 'card']);

export default function ordersRouter(db, hub) {
  const router = Router();
  router.use(requireAuth);

  const getProduct = db.prepare('SELECT id, name, price_cents, stock, is_active, unit FROM products WHERE id = ?');
  const insertOrder = db.prepare(`
    INSERT INTO orders (order_no, table_no, status, subtotal_cents, discount_cents, total_cents, payment_method, cashier_id, note, created_at)
    VALUES (@orderNo, @tableNo, 'open', @subtotal, @discount, @total, NULL, @cashierId, @note, @createdAt)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty, line_total_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  const incStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  const logStock = db.prepare(`
    INSERT INTO inventory_logs (product_id, delta, balance, reason, order_id, operator_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getOrderRow = db.prepare(`
    SELECT o.*, u.display_name AS cashier_name
    FROM orders o LEFT JOIN users u ON u.id = o.cashier_id
    WHERE o.id = ?
  `);
  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
  const getLogs = db.prepare(`
    SELECT l.*, p.name AS product_name FROM inventory_logs l
    JOIN products p ON p.id = l.product_id
    WHERE l.order_id = ? ORDER BY l.id
  `);

  const mapOrder = (row) => {
    if (!row) return null;
    return {
      id: row.id,
      orderNo: row.order_no,
      tableNo: row.table_no,
      status: row.status,
      subtotal: row.subtotal_cents,
      discount: row.discount_cents,
      total: row.total_cents,
      paymentMethod: row.payment_method,
      cashier: row.cashier_name || null,
      note: row.note,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      voidedAt: row.voided_at,
      itemCount: row.item_count ?? undefined,
      itemsSummary: row.items_summary ?? undefined,
    };
  };

  function detail(id) {
    const row = getOrderRow.get(id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', '订单不存在');
    return {
      order: mapOrder(row),
      items: getItems.all(id).map((i) => ({
        id: i.id,
        productId: i.product_id,
        name: i.name_snapshot,
        unitPrice: i.unit_price_cents,
        qty: i.qty,
        lineTotal: i.line_total_cents,
      })),
      logs: getLogs.all(id).map((l) => ({
        id: l.id,
        product: l.product_name,
        delta: l.delta,
        balance: l.balance,
        reason: l.reason,
        createdAt: l.created_at,
      })),
    };
  }

  const createTx = db.transaction((payload) => {
    // 1. 合并同商品行，做基础校验
    const merged = new Map();
    for (const raw of payload.items) {
      const productId = Number(raw?.productId);
      const qty = Number(raw?.qty);
      if (!Number.isInteger(productId) || productId <= 0) throw badRequest('商品参数不合法');
      if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw badRequest('单品数量需在 1–99 之间');
      // 合并后仍要守上限，否则「同一商品拆成两行各 99」就能绕过
      const total = (merged.get(productId) ?? 0) + qty;
      if (total > 99) throw badRequest('单品数量需在 1–99 之间');
      merged.set(productId, total);
    }
    if (!merged.size) throw badRequest('请至少选择一个商品');

    // 2. 服务端重新计价，绝不信任前端传来的金额
    const lines = [];
    let subtotal = 0;
    for (const [productId, qty] of merged) {
      const product = getProduct.get(productId);
      if (!product || !product.is_active) throw badRequest('商品已下架或不存在', 'PRODUCT_UNAVAILABLE');
      const lineTotal = product.price_cents * qty;
      subtotal += lineTotal;
      lines.push({ product, qty, lineTotal });
    }

    const discount = Math.min(Math.max(Number(payload.discountCents) || 0, 0), subtotal);
    const total = subtotal - discount;
    const createdAt = new Date().toISOString();

    // 3. 写订单头
    const info = insertOrder.run({
      orderNo: nextOrderNo(db),
      tableNo: payload.tableNo ? String(payload.tableNo).slice(0, 16) : null,
      subtotal,
      discount,
      total,
      cashierId: payload.cashierId,
      note: payload.note ? String(payload.note).slice(0, 120) : null,
      createdAt,
    });

    // 4. 写明细 + 原子扣库存 + 记流水
    for (const line of lines) {
      insertItem.run(
        info.lastInsertRowid,
        line.product.id,
        line.product.name,
        line.product.price_cents,
        line.qty,
        line.lineTotal
      );

      const result = decStock.run(line.qty, line.product.id, line.qty);
      if (result.changes === 0) {
        throw conflict(
          `「${line.product.name}」库存不足，当前仅剩 ${line.product.stock} ${line.product.unit}`,
          'OUT_OF_STOCK'
        );
      }
      const balance = getProduct.get(line.product.id).stock;
      logStock.run(line.product.id, -line.qty, balance, 'sale', info.lastInsertRowid, payload.cashierId, null, createdAt);
    }

    return Number(info.lastInsertRowid);
  });

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { items, tableNo, note, discountCents } = req.body ?? {};
      if (!Array.isArray(items) || items.length === 0) throw badRequest('购物车是空的');

      let orderId;
      // 并发下流水号可能撞唯一约束，重试一次即可
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          orderId = createTx({ items, tableNo, note, discountCents, cashierId: req.user.id });
          break;
        } catch (err) {
          if (attempt === 1 || !String(err.message).includes('UNIQUE')) throw err;
        }
      }

      const payload = detail(orderId);
      hub.broadcast('order:created', payload.order);
      notifyLowStock(payload.items.map((i) => i.productId));
      res.status(201).json({ ok: true, data: payload });
    })
  );

  /** 账单筛选条件：列表与 CSV 导出共用，保证「看到什么就导出什么」 */
  function orderFilter(query = {}) {
    const { status = 'all', date = '', q = '' } = query;
    const where = [];
    const params = {};

    if (status !== 'all') {
      if (!['open', 'paid', 'void'].includes(status)) throw badRequest('未知的订单状态');
      where.push('o.status = @status');
      params.status = status;
    }
    if (date === 'today') {
      where.push("date(o.created_at, 'localtime') = date('now', 'localtime')");
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      where.push("date(o.created_at, 'localtime') = @date");
      params.date = date;
    }
    if (q) {
      where.push(`(
        o.order_no LIKE @kw OR IFNULL(o.table_no, '') LIKE @kw OR
        EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.name_snapshot LIKE @kw)
      )`);
      params.kw = `%${String(q).trim()}%`;
    }

    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { limit, offset } = pagination(req.query, { limit: 20, max: 100 });
      const { clause, params } = orderFilter(req.query);

      const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${clause}`).get(params).c;

      const rows = db
        .prepare(
          `SELECT o.*, u.display_name AS cashier_name,
                  (SELECT GROUP_CONCAT(oi.name_snapshot || ' ×' || oi.qty, ' · ')
                     FROM order_items oi WHERE oi.order_id = o.id) AS items_summary,
                  (SELECT SUM(oi.qty) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
           FROM orders o LEFT JOIN users u ON u.id = o.cashier_id
           ${clause}
           ORDER BY o.created_at DESC
           LIMIT @limit OFFSET @offset`
        )
        .all({ ...params, limit, offset });

      res.json({ ok: true, data: { orders: rows.map(mapOrder), total, limit, offset } });
    })
  );

  router.get(
    '/export.csv',
    asyncHandler(async (req, res) => {
      const { clause, params } = orderFilter(req.query);
      const rows = db
        .prepare(
          `SELECT o.order_no, o.created_at, o.paid_at, o.status, IFNULL(o.table_no, '') AS table_no,
                  o.subtotal_cents, o.discount_cents, o.total_cents, IFNULL(o.payment_method, '') AS payment_method,
                  IFNULL(u.display_name, '') AS cashier,
                  (SELECT GROUP_CONCAT(oi.name_snapshot || ' x' || oi.qty, ' / ')
                     FROM order_items oi WHERE oi.order_id = o.id) AS items
           FROM orders o LEFT JOIN users u ON u.id = o.cashier_id
           ${clause}
           ORDER BY o.created_at DESC LIMIT 5000`
        )
        .all(params);

      const header = ['单号', '下单时间', '支付时间', '状态', '桌号', '小计(元)', '优惠(元)', '实收(元)', '支付方式', '收银员', '商品明细'];
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.order_no,
            r.created_at,
            r.paid_at ?? '',
            r.status,
            r.table_no,
            (r.subtotal_cents / 100).toFixed(2),
            (r.discount_cents / 100).toFixed(2),
            (r.total_cents / 100).toFixed(2),
            r.payment_method,
            r.cashier,
            r.items ?? '',
          ]
            .map(escape)
            .join(',')
        );
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mise-orders-${Date.now()}.csv"`);
      res.send('\uFEFF' + lines.join('\r\n')); // BOM：Excel 打开中文不乱码
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json({ ok: true, data: detail(Number(req.params.id)) });
    })
  );

  const payTx = db.transaction((id, method, discountCents) => {
    const row = getOrderRow.get(id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', '订单不存在');
    if (row.status !== 'open') throw conflict('该订单已结算或已作废', 'ORDER_NOT_OPEN');
    if (!PAYMENT_METHODS.has(method)) throw badRequest('不支持的支付方式');

    const discount = Math.min(Math.max(Number(discountCents ?? row.discount_cents) || 0, 0), row.subtotal_cents);
    const total = row.subtotal_cents - discount;

    db.prepare(
      `UPDATE orders SET status = 'paid', payment_method = ?, discount_cents = ?, total_cents = ?, paid_at = ? WHERE id = ?`
    ).run(method, discount, total, new Date().toISOString(), id);

    return id;
  });

  router.post(
    '/:id/pay',
    asyncHandler(async (req, res) => {
      const { paymentMethod, discountCents } = req.body ?? {};
      const id = payTx(Number(req.params.id), paymentMethod, discountCents);
      const payload = detail(id);
      hub.broadcast('order:paid', payload.order);
      res.json({ ok: true, data: payload });
    })
  );

  const voidTx = db.transaction((id, operatorId) => {
    const row = getOrderRow.get(id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', '订单不存在');
    if (row.status === 'void') throw conflict('订单已作废', 'ORDER_VOIDED');

    const now = new Date().toISOString();
    // 原路回补库存
    for (const item of getItems.all(id)) {
      incStock.run(item.qty, item.product_id);
      const balance = getProduct.get(item.product_id).stock;
      logStock.run(item.product_id, item.qty, balance, 'void', id, operatorId, '订单作废回补', now);
    }

    db.prepare(`UPDATE orders SET status = 'void', voided_at = ? WHERE id = ?`).run(now, id);
    return id;
  });

  router.post(
    '/:id/void',
    asyncHandler(async (req, res) => {
      const id = voidTx(Number(req.params.id), req.user.id);
      const payload = detail(id);
      hub.broadcast('order:void', payload.order);
      res.json({ ok: true, data: payload });
    })
  );

  function notifyLowStock(productIds) {
    if (!productIds.length) return;
    const placeholders = productIds.map(() => '?').join(',');
    const lows = db
      .prepare(`SELECT id, name, stock, low_stock FROM products WHERE id IN (${placeholders}) AND stock <= low_stock`)
      .all(...productIds);
    if (lows.length) {
      hub.broadcast('stock:low', {
        items: lows.map((p) => ({ id: p.id, name: p.name, stock: p.stock, lowStock: p.low_stock })),
      });
    }
  }

  return router;
}
