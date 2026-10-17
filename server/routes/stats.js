/**
 * stats.js —— 经营分析接口。
 *
 * 聚合全部下推到 SQL：日期补零用递归 CTE，环比用窗口函数 LAG，
 * 应用层只负责把「分」格式化成「元」。
 */
import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import { asyncHandler, badRequest } from '../utils.js';

export default function statsRouter(db) {
  const router = Router();
  router.use(requireAuth);

  const dayRange = (days) => `-${Math.max(days - 1, 0)} day`;

  const kpiStmt = db.prepare(`
    SELECT
      COUNT(*)                                  AS orders,
      COALESCE(SUM(total_cents), 0)             AS revenue,
      COALESCE(SUM(discount_cents), 0)          AS discount,
      CAST(COALESCE(AVG(total_cents), 0) AS INTEGER) AS avg_ticket
    FROM v_paid_orders
    WHERE biz_date = date('now', 'localtime', ?)
  `);

  const costStmt = db.prepare(`
    SELECT COALESCE(SUM(oi.qty * p.cost_cents), 0) AS cost
    FROM order_items oi
    JOIN orders   o ON o.id = oi.order_id AND o.status = 'paid'
    JOIN products p ON p.id = oi.product_id
    WHERE date(o.paid_at, 'localtime') = date('now', 'localtime', ?)
  `);

  router.get(
    '/overview',
    asyncHandler(async (_req, res) => {
      const today = kpiStmt.get('0 day');
      const yesterday = kpiStmt.get('-1 day');
      const costToday = costStmt.get('0 day').cost;

      const month = db
        .prepare(
          `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue
           FROM v_paid_orders WHERE biz_date >= date('now', 'localtime', 'start of month')`
        )
        .get();

      const openOrders = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = 'open'`).get().c;

      const lowStock = db
        .prepare(`SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND stock <= low_stock`)
        .get().c;

      const week = db
        .prepare(
          `SELECT
             (SELECT COALESCE(SUM(total_cents), 0) FROM v_paid_orders
                WHERE biz_date >= date('now', 'localtime', '-6 day')) AS current,
             (SELECT COALESCE(SUM(total_cents), 0) FROM v_paid_orders
                WHERE biz_date BETWEEN date('now', 'localtime', '-13 day')
                                   AND date('now', 'localtime', '-7 day')) AS previous`
        )
        .get();

      const margin = today.revenue > 0 ? (today.revenue - costToday) / today.revenue : 0;

      res.json({
        ok: true,
        data: {
          today: {
            orders: today.orders,
            revenue: today.revenue,
            discount: today.discount,
            avgTicket: today.avg_ticket,
            cost: costToday,
            margin,
            revenueDelta: delta(today.revenue, yesterday.revenue),
            ordersDelta: delta(today.orders, yesterday.orders),
          },
          yesterday: { orders: yesterday.orders, revenue: yesterday.revenue },
          month: { orders: month.orders, revenue: month.revenue },
          week: { current: week.current, previous: week.previous, delta: delta(week.current, week.previous) },
          openOrders,
          lowStock,
        },
      });
    })
  );

  router.get(
    '/series',
    asyncHandler(async (req, res) => {
      const days = clampDays(req.query.days);
      const rows = db
        .prepare(
          `WITH RECURSIVE seq(d) AS (
             SELECT date('now', 'localtime', @offset)
             UNION ALL
             SELECT date(d, '+1 day') FROM seq WHERE d < date('now', 'localtime')
           )
           SELECT s.d AS day,
                  COALESCE(v.revenue_cents, 0)    AS revenue,
                  COALESCE(v.order_count, 0)      AS orders,
                  COALESCE(v.avg_ticket_cents, 0) AS avgTicket,
                  COALESCE(LAG(v.revenue_cents) OVER (ORDER BY s.d), 0) AS prevRevenue
           FROM seq s
           LEFT JOIN v_daily_sales v ON v.day = s.d
           ORDER BY s.d`
        )
        .all({ offset: dayRange(days) });

      res.json({
        ok: true,
        data: {
          days,
          points: rows.map((r) => ({
            day: r.day,
            revenue: r.revenue,
            orders: r.orders,
            avgTicket: r.avgTicket,
            prevRevenue: r.prevRevenue,
          })),
        },
      });
    })
  );

  router.get(
    '/top',
    asyncHandler(async (req, res) => {
      const days = clampDays(req.query.days, 30);
      const rows = db
        .prepare(
          `SELECT i.product_id AS id, p.name, p.emoji,
                  SUM(i.qty)                        AS qty,
                  SUM(i.line_total_cents)           AS revenue,
                  SUM(i.qty * p.cost_cents)         AS cost
           FROM order_items i
           JOIN orders   o ON o.id = i.order_id AND o.status = 'paid'
           JOIN products p ON p.id = i.product_id
           WHERE date(o.paid_at, 'localtime') >= date('now', 'localtime', @offset)
           GROUP BY i.product_id
           ORDER BY revenue DESC
           LIMIT 8`
        )
        .all({ offset: dayRange(days) });

      const total = rows.reduce((sum, r) => sum + r.revenue, 0) || 1;
      res.json({
        ok: true,
        data: {
          days,
          items: rows.map((r, index) => ({
            rank: index + 1,
            id: r.id,
            name: r.name,
            emoji: r.emoji,
            qty: r.qty,
            revenue: r.revenue,
            cost: r.cost,
            share: r.revenue / total,
          })),
        },
      });
    })
  );

  router.get(
    '/categories',
    asyncHandler(async (req, res) => {
      const days = clampDays(req.query.days, 30);
      const rows = db
        .prepare(
          `SELECT c.id, c.name, c.color,
                  SUM(i.line_total_cents) AS revenue,
                  SUM(i.qty)              AS qty
           FROM order_items i
           JOIN orders     o ON o.id = i.order_id AND o.status = 'paid'
           JOIN products   p ON p.id = i.product_id
           JOIN categories c ON c.id = p.category_id
           WHERE date(o.paid_at, 'localtime') >= date('now', 'localtime', @offset)
           GROUP BY c.id
           ORDER BY revenue DESC`
        )
        .all({ offset: dayRange(days) });

      const total = rows.reduce((sum, r) => sum + r.revenue, 0) || 1;
      res.json({
        ok: true,
        data: {
          total,
          items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            revenue: r.revenue,
            qty: r.qty,
            share: r.revenue / total,
          })),
        },
      });
    })
  );

  router.get(
    '/hourly',
    asyncHandler(async (req, res) => {
      const days = clampDays(req.query.days, 7);
      const rows = db
        .prepare(
          `SELECT biz_hour AS hour, COUNT(*) AS orders, SUM(total_cents) AS revenue
           FROM v_paid_orders
           WHERE biz_date >= date('now', 'localtime', @offset)
           GROUP BY biz_hour`
        )
        .all({ offset: dayRange(days) });

      const map = new Map(rows.map((r) => [Number(r.hour), r]));
      const hours = [];
      for (let h = 8; h <= 22; h += 1) {
        const hit = map.get(h);
        hours.push({ hour: h, orders: hit?.orders ?? 0, revenue: hit?.revenue ?? 0 });
      }

      res.json({ ok: true, data: { days, hours } });
    })
  );

  router.get(
    '/payments',
    asyncHandler(async (req, res) => {
      const days = clampDays(req.query.days, 30);
      const rows = db
        .prepare(
          `SELECT payment_method AS method, COUNT(*) AS orders, SUM(total_cents) AS revenue
           FROM v_paid_orders
           WHERE biz_date >= date('now', 'localtime', @offset)
           GROUP BY payment_method`
        )
        .all({ offset: dayRange(days) });

      const total = rows.reduce((sum, r) => sum + r.revenue, 0) || 1;
      res.json({
        ok: true,
        data: {
          items: rows.map((r) => ({
            method: r.method,
            orders: r.orders,
            revenue: r.revenue,
            share: r.revenue / total,
          })),
        },
      });
    })
  );

  return router;
}

function delta(current, previous) {
  if (!previous) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

function clampDays(value, fallback = 14) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 2 || n > 90) throw badRequest('days 需在 2–90 之间');
  return Math.round(n);
}
