-- ============================================================================
--  Mise POS · SQLite Schema
--
--  设计要点：
--   1. 金额一律用「分」为单位的 INTEGER 存储，杜绝浮点误差
--   2. 商品名 / 单价在下单瞬间快照进 order_items —— 之后改价不会污染历史账单
--   3. 库存只能通过 inventory_logs 追溯，扣减与订单写入放在同一个事务里
--   4. 报表聚合下沉到视图 + 窗口函数，应用层只做格式化
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,                     -- scrypt: salt:hash
  display_name  TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'cashier')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    NOT NULL DEFAULT '#FF7A45',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sku          TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents   INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock        INTEGER NOT NULL DEFAULT 0,
  low_stock    INTEGER NOT NULL DEFAULT 10,
  unit         TEXT    NOT NULL DEFAULT '份',
  emoji        TEXT    NOT NULL DEFAULT '🍽',
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no       TEXT    NOT NULL UNIQUE,
  table_no       TEXT,
  status         TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents    INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_method TEXT    CHECK (payment_method IN ('cash', 'wechat', 'alipay', 'card')),
  cashier_id     INTEGER REFERENCES users(id),
  note           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at        TEXT,
  voided_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name_snapshot    TEXT    NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty              INTEGER NOT NULL CHECK (qty > 0),
  line_total_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,                       -- 负数出库，正数入库
  balance     INTEGER NOT NULL,                       -- 变更后余额，便于对账
  reason      TEXT    NOT NULL CHECK (reason IN ('sale', 'restock', 'void', 'adjust')),
  order_id    INTEGER REFERENCES orders(id),
  operator_id INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_product ON inventory_logs(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
--  报表视图：把「营业日」口径统一收口在这里（本地时区，凌晨跨天订单不串账）
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_paid_orders AS
SELECT
  o.*,
  date(o.paid_at, 'localtime') AS biz_date,
  strftime('%H', o.paid_at, 'localtime') AS biz_hour
FROM orders o
WHERE o.status = 'paid';

CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT
  biz_date                       AS day,
  COUNT(*)                       AS order_count,
  SUM(total_cents)               AS revenue_cents,
  SUM(discount_cents)            AS discount_cents,
  CAST(ROUND(AVG(total_cents)) AS INTEGER) AS avg_ticket_cents
FROM v_paid_orders
GROUP BY biz_date;

CREATE VIEW IF NOT EXISTS v_product_sales AS
SELECT
  i.product_id,
  p.name,
  p.emoji,
  SUM(i.qty)                          AS qty,
  SUM(i.line_total_cents)             AS revenue_cents,
  SUM(i.qty * p.cost_cents)           AS cost_cents
FROM order_items i
JOIN orders   o ON o.id = i.order_id AND o.status = 'paid'
JOIN products p ON p.id = i.product_id
GROUP BY i.product_id;
