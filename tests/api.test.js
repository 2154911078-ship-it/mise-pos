/**
 * API 集成测试 —— node:test + 真实 HTTP 请求，跑在内存数据库上。
 *
 *   npm test
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createDb } from '../server/db.js';

let server;
let base;
let db;
let token;

async function api(path, { method = 'GET', body, auth = true, raw = false } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return raw ? { status: res.status, json } : json;
}

before(async () => {
  db = createDb(':memory:', { demo: false });
  const app = createApp(db);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'owner', password: '123456' },
    auth: false,
  });
  token = res.data.token;
});

after(() => {
  server?.close();
  db?.close();
});

describe('鉴权', () => {
  it('正确账号密码可换取令牌', () => {
    assert.ok(token.split('.').length === 3, '应返回三段式 JWT');
  });

  it('密码错误返回 401', async () => {
    const { status } = await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'owner', password: 'wrong' },
      auth: false,
      raw: true,
    });
    assert.equal(status, 401);
  });

  it('未携带令牌访问业务接口返回 401', async () => {
    const { status } = await api('/api/menu', { auth: false, raw: true });
    assert.equal(status, 401);
  });

  it('伪造签名的令牌被拒绝', async () => {
    const forged = token.split('.').slice(0, 2).join('.') + '.deadbeef';
    const res = await fetch(`${base}/api/menu`, { headers: { Authorization: `Bearer ${forged}` } });
    assert.equal(res.status, 401);
  });

  it('同一账号连续失败会被限流', async () => {
    const body = { username: 'nobody', password: 'nope' };
    for (let i = 0; i < 5; i += 1) {
      const { status } = await api('/api/auth/login', { method: 'POST', body, auth: false, raw: true });
      assert.equal(status, 401);
    }
    const { status, json } = await api('/api/auth/login', { method: 'POST', body, auth: false, raw: true });
    assert.equal(status, 429);
    assert.equal(json.error.code, 'TOO_MANY_ATTEMPTS');
  });
});

describe('菜单', () => {
  it('返回 5 个分类与 22 个商品', async () => {
    const res = await api('/api/menu');
    assert.equal(res.data.categories.length, 5);
    assert.equal(res.data.products.length, 22);
  });
});

describe('订单事务', () => {
  let orderId;
  let product;
  let stockBefore;

  it('下单金额由服务端重新计算，忽略前端传的价格', async () => {
    const menu = await api('/api/menu');
    product = menu.data.products.find((p) => p.stock > 5);
    stockBefore = product.stock;

    const res = await api('/api/orders', {
      method: 'POST',
      body: {
        tableNo: 'A1',
        items: [{ productId: product.id, qty: 2, price: 1 }],
        discountCents: 500,
      },
    });

    assert.equal(res.ok, true);
    const order = res.data.order;
    orderId = order.id;

    assert.equal(order.subtotal, product.price * 2, '小计应按数据库单价计算');
    assert.equal(order.discount, 500);
    assert.equal(order.total, product.price * 2 - 500);
    assert.equal(order.status, 'open');
  });

  it('下单后库存同步扣减', async () => {
    const row = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id);
    assert.equal(row.stock, stockBefore - 2);
  });

  it('库存不足时整单回滚，不产生脏数据', async () => {
    const before = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    const stock = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;

    const { status, json } = await api('/api/orders', {
      method: 'POST',
      body: { items: [{ productId: product.id, qty: stock + 1 }] },
      raw: true,
    });

    assert.equal(status, 409);
    assert.equal(json.error.code, 'OUT_OF_STOCK');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c, before, '订单数不应变化');
    assert.equal(
      db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock,
      stock,
      '库存应回滚到下单前'
    );
  });

  it('支付后订单进入已结账状态并记录支付方式', async () => {
    const res = await api(`/api/orders/${orderId}/pay`, {
      method: 'POST',
      body: { paymentMethod: 'wechat' },
    });
    assert.equal(res.data.order.status, 'paid');
    assert.equal(res.data.order.paymentMethod, 'wechat');
    assert.ok(res.data.order.paidAt);
  });

  it('重复支付被拒绝', async () => {
    const { status } = await api(`/api/orders/${orderId}/pay`, {
      method: 'POST',
      body: { paymentMethod: 'cash' },
      raw: true,
    });
    assert.equal(status, 409);
  });

  it('作废订单按原路回补库存', async () => {
    const before = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    const res = await api(`/api/orders/${orderId}/void`, { method: 'POST' });
    assert.equal(res.data.order.status, 'void');

    const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    assert.equal(after, before + 2);

    const logs = db
      .prepare("SELECT COUNT(*) AS c FROM inventory_logs WHERE order_id = ? AND reason = 'void'")
      .get(orderId).c;
    assert.ok(logs > 0, '应写入作废回补流水');
  });

  it('作废订单不计入营收统计', async () => {
    const res = await api('/api/stats/overview');
    assert.equal(res.data.today.revenue, 0);
  });
});

describe('报表', () => {
  it('series 按天补零，长度与请求天数一致', async () => {
    const res = await api('/api/stats/series?days=14');
    assert.equal(res.data.points.length, 14);
    assert.equal(res.data.points.at(-1).day, new Date().toLocaleDateString('sv-SE'));
  });

  it('非法的 days 参数返回 400', async () => {
    const { status } = await api('/api/stats/series?days=999', { raw: true });
    assert.equal(status, 400);
  });

  it('小时分布默认覆盖营业时段 8–22 点', async () => {
    const res = await api('/api/stats/hourly');
    assert.equal(res.data.hours[0].hour, 8);
    assert.equal(res.data.hours.at(-1).hour, 22);
  });
});

describe('权限', () => {
  it('收银员不能改商品价格', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'cashier', password: '123456' },
      auth: false,
    });
    const res = await fetch(`${base}/api/menu/products/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.data.token}` },
      body: JSON.stringify({ price: 100 }),
    });
    assert.equal(res.status, 403);
  });
});

/* ---------------------------------------------------------------- 边界回归 */
describe('边界与一致性', () => {
  const ymd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };
  const pickProduct = async () => (await api('/api/menu')).data.products.find((p) => p.stock > 5);

  it('优惠金额超过小计时被夹到小计，实收不会为负', async () => {
    const p = await pickProduct();
    const res = await api('/api/orders', {
      method: 'POST',
      body: { items: [{ productId: p.id, qty: 1 }], discountCents: p.price + 99900 },
    });
    assert.equal(res.data.order.discount, p.price, '优惠应被夹到小计');
    assert.equal(res.data.order.total, 0);
    assert.equal(res.data.order.status, 'open');
  });

  it('同一商品拆成两行也守 99 件上限', async () => {
    const p = await pickProduct();
    const { status, json } = await api('/api/orders', {
      method: 'POST',
      body: { items: [{ productId: p.id, qty: 60 }, { productId: p.id, qty: 60 }] },
      raw: true,
    });
    assert.equal(status, 400);
    assert.match(json.error.message, /1–99/);
  });

  it('补货拒绝负数，避免流水 delta 与实际库存不符', async () => {
    const p = await pickProduct();
    const { status } = await api(`/api/menu/products/${p.id}/restock`, {
      method: 'POST',
      body: { qty: -5 },
      raw: true,
    });
    assert.equal(status, 400);
  });

  it('补货后流水 delta 与库存变化一致', async () => {
    const p = await pickProduct();
    const before = db.prepare('SELECT stock FROM products WHERE id = ?').get(p.id).stock;
    const res = await api(`/api/menu/products/${p.id}/restock`, { method: 'POST', body: { qty: 10 } });
    assert.equal(res.data.stock, before + 10);

    const log = db
      .prepare("SELECT delta, balance FROM inventory_logs WHERE product_id = ? AND reason = 'restock' ORDER BY id DESC")
      .get(p.id);
    assert.equal(log.delta, 10);
    assert.equal(log.balance, before + 10);
  });

  it('单日流水号超过 999 后仍然唯一', async () => {
    const p = await pickProduct();
    const fake = db.prepare('INSERT INTO orders (order_no, status, subtotal_cents, total_cents) VALUES (?, ?, 100, 100)');
    fake.run(`${ymd()}-999`, 'open');

    const res = await api('/api/orders', { method: 'POST', body: { items: [{ productId: p.id, qty: 1 }] } });
    assert.equal(res.data.order.orderNo, `${ymd()}-1000`, '不能因为 substr(-3) 取到 000 而重号');

    db.prepare('DELETE FROM orders WHERE order_no = ?').run(`${ymd()}-999`);
  });

  it('CSV 导出遵循当前筛选条件', async () => {
    const list = await api('/api/orders?status=open&limit=1');
    const target = list.data.orders[0];
    await api(`/api/orders/${target.id}/pay`, { method: 'POST', body: { paymentMethod: 'cash' } });

    const res = await fetch(`${base}/api/orders/export.csv?status=paid`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = (await res.text()).replace(/^\uFEFF/, '');
    const lines = text.split('\r\n');

    assert.ok(lines[0].startsWith('单号'), '应有表头');
    assert.equal(lines.length, 2, '只导出已结账的那一笔');
    assert.ok(lines[1].includes(target.orderNo));
  });

  it('营业时段外的订单也会出现在时段分布里', async () => {
    const p = await pickProduct();
    const at = new Date();
    at.setHours(7, 15, 0, 0);
    const iso = at.toISOString();

    db.prepare(
      `INSERT INTO orders (order_no, status, subtotal_cents, total_cents, payment_method, created_at, paid_at)
       VALUES (?, 'paid', ?, ?, 'cash', ?, ?)`
    ).run(`${ymd()}-777`, p.price, p.price, iso, iso);

    const res = await api('/api/stats/hourly');
    assert.equal(res.data.hours[0].hour, 7, '7 点的单不能被丢掉');
    assert.ok(res.data.hours.some((h) => h.hour === 7 && h.orders === 1));
  });
});

describe('令牌传递方式', () => {
  it('普通接口不接受 query 里的令牌（避免令牌进日志）', async () => {
    const res = await fetch(`${base}/api/menu?token=${encodeURIComponent(token)}`);
    assert.equal(res.status, 401);
  });

  it('SSE 允许 query 传令牌，因为 EventSource 无法设置请求头', async () => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/events?token=${encodeURIComponent(token)}`, { signal: ac.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    ac.abort();
  });
});
