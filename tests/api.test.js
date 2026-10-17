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

  it('小时分布覆盖 8–22 点共 15 个时段', async () => {
    const res = await api('/api/stats/hourly');
    assert.equal(res.data.hours.length, 15);
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
