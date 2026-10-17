/**
 * menu.js —— 菜单与商品管理（改价 / 上下架 / 补货）。
 */
import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware.js';
import { asyncHandler, badRequest, notFound } from '../utils.js';

export default function menuRouter(db, hub) {
  const router = Router();
  router.use(requireAuth);

  const listCategories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id');
  const listProducts = db.prepare(`
    SELECT p.*, c.name AS category_name, c.color AS category_color
    FROM products p JOIN categories c ON c.id = p.category_id
    ORDER BY p.category_id, p.sort_order, p.id
  `);
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');

  const mapProduct = (p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryId: p.category_id,
    categoryName: p.category_name,
    categoryColor: p.category_color,
    price: p.price_cents,
    cost: p.cost_cents,
    stock: p.stock,
    lowStock: p.low_stock,
    unit: p.unit,
    emoji: p.emoji,
    active: !!p.is_active,
    margin: p.price_cents ? Math.round(((p.price_cents - p.cost_cents) / p.price_cents) * 100) : 0,
  });

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json({
        ok: true,
        data: {
          categories: listCategories.all().map((c) => ({ id: c.id, name: c.name, color: c.color })),
          products: listProducts.all().map(mapProduct),
        },
      });
    })
  );

  router.patch(
    '/products/:id',
    requireOwner,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const product = getProduct.get(id);
      if (!product) throw notFound('商品不存在');

      const patch = {};
      const { price, cost, lowStock, active, name } = req.body ?? {};

      if (price !== undefined) {
        if (!Number.isInteger(price) || price < 0) throw badRequest('价格必须是正整数（分）');
        patch.price_cents = price;
      }
      if (cost !== undefined) {
        if (!Number.isInteger(cost) || cost < 0) throw badRequest('成本必须是正整数（分）');
        patch.cost_cents = cost;
      }
      if (lowStock !== undefined) {
        if (!Number.isInteger(lowStock) || lowStock < 0) throw badRequest('预警值不合法');
        patch.low_stock = lowStock;
      }
      if (active !== undefined) patch.is_active = active ? 1 : 0;
      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) throw badRequest('商品名不能为空');
        patch.name = trimmed.slice(0, 40);
      }

      const keys = Object.keys(patch);
      if (!keys.length) throw badRequest('没有需要更新的字段');

      db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({
        ...patch,
        id,
      });

      const updated = listProducts.all().find((p) => p.id === id);
      hub.broadcast('product:updated', mapProduct(updated));
      res.json({ ok: true, data: { product: mapProduct(updated) } });
    })
  );

  router.post(
    '/products/:id/restock',
    requireOwner,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const product = getProduct.get(id);
      if (!product) throw notFound('商品不存在');

      const qty = Number(req.body?.qty);
      if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 999) {
        throw badRequest('补货数量需为 1–999 的整数');
      }

      const tx = db.transaction(() => {
        db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(qty, id);
        const balance = getProduct.get(id).stock;
        db.prepare(
          `INSERT INTO inventory_logs (product_id, delta, balance, reason, operator_id, note)
           VALUES (?, ?, ?, 'restock', ?, ?)`
        ).run(id, qty, balance, req.user.id, '手动补货');
        return balance;
      });

      const balance = tx();
      hub.broadcast('stock:updated', { productId: id, stock: balance });
      res.json({ ok: true, data: { productId: id, stock: balance } });
    })
  );

  return router;
}
