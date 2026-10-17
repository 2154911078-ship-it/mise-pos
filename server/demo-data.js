/**
 * demo-data.js —— 生成 21 天演示订单。
 *
 * 目的：让 clone 下来的人第一次打开就能看到真实的经营曲线，而不是空图表。
 * 做法：走与真实下单一致的写入路径（订单 + 明细 + 库存流水），最后做一次「期初盘点」
 *      把库存校正到合理水位，保证库存页也有内容可看。
 */
import { mulberry32 } from './utils.js';

const DAYS = 21;

export function seedDemoOrders(db) {
  const products = db.prepare('SELECT id, name, price_cents, cost_cents FROM products WHERE is_active = 1').all();
  if (!products.length) return;

  const cashiers = db.prepare('SELECT id FROM users').all();
  const rand = mulberry32(20261017);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_no, table_no, status, subtotal_cents, discount_cents, total_cents,
                        payment_method, cashier_id, note, created_at, paid_at)
    VALUES (@order_no, @table_no, @status, @subtotal, @discount, @total,
            @payment, @cashier_id, @note, @created_at, @paid_at)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty, line_total_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const logStock = db.prepare(`
    INSERT INTO inventory_logs (product_id, delta, balance, reason, order_id, operator_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 虚拟期初库存，只为让流水的 balance 连续
  const balance = new Map(products.map((p) => [p.id, 400]));
  const payments = ['wechat', 'wechat', 'wechat', 'alipay', 'alipay', 'cash', 'card'];
  const tables = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', '外带', '外带', '外带'];

  const run = db.transaction(() => {
    const today = new Date();
    for (let d = DAYS - 1; d >= 0; d -= 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);

      const weekend = [0, 6].includes(day.getDay());
      const count = Math.round((weekend ? 22 : 15) + rand() * 9);
      const isToday = d === 0;
      const maxHour = isToday ? Math.max(9, today.getHours()) : 21;

      for (let n = 1; n <= count; n += 1) {
        const hour = Math.min(maxHour, 8 + Math.floor(rand() * 14));
        const minute = Math.floor(rand() * 60);
        const at = new Date(day);
        at.setHours(hour, minute, Math.floor(rand() * 60), 0);
        if (isToday && at > today) continue;

        const createdAt = at.toISOString();
        const itemCount = 1 + Math.floor(rand() * 3);
        const chosen = new Map();
        for (let k = 0; k < itemCount; k += 1) {
          const p = pick(products);
          chosen.set(p.id, { product: p, qty: 1 + Math.floor(rand() * 2) });
        }

        const lines = [...chosen.values()];
        const subtotal = lines.reduce((sum, l) => sum + l.product.price_cents * l.qty, 0);
        const discount = rand() > 0.88 ? Math.round((subtotal * 0.1) / 100) * 100 : 0;
        const total = subtotal - discount;
        const isVoid = rand() > 0.97;

        const info = insertOrder.run({
          order_no: `${ymd(at)}-${String(n).padStart(3, '0')}`,
          table_no: pick(tables),
          status: isVoid ? 'void' : 'paid',
          subtotal,
          discount,
          total,
          payment: isVoid ? null : pick(payments),
          cashier_id: pick(cashiers)?.id ?? null,
          note: rand() > 0.9 ? '少冰 / 少糖' : null,
          created_at: createdAt,
          paid_at: isVoid ? null : createdAt,
        });

        for (const line of lines) {
          insertItem.run(
            info.lastInsertRowid,
            line.product.id,
            line.product.name,
            line.product.price_cents,
            line.qty,
            line.product.price_cents * line.qty
          );
          if (!isVoid) {
            const before = balance.get(line.product.id) ?? 400;
            const after = Math.max(0, before - line.qty);
            balance.set(line.product.id, after);
            logStock.run(
              line.product.id,
              -line.qty,
              after,
              'sale',
              info.lastInsertRowid,
              null,
              null,
              createdAt
            );
          }
        }
      }
    }

    // 期初盘点：把库存校正到今天的真实水位
    const adjust = db.prepare(`
      INSERT INTO inventory_logs (product_id, delta, balance, reason, note, created_at)
      VALUES (?, ?, ?, 'adjust', '期初盘点', ?)
    `);
    const setStock = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
    const now = new Date().toISOString();
    for (const p of products) {
      const target = Math.floor(12 + rand() * 90);
      const delta = target - (balance.get(p.id) ?? 0);
      setStock.run(target, p.id);
      adjust.run(p.id, delta, target, now);
    }
  });

  run();
  db.prepare("UPDATE settings SET value = '1' WHERE key = 'demo_seeded'").run();
}

function ymd(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
}
