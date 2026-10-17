/**
 * dashboard.js —— 经营看板。
 * 所有聚合都来自后端 SQL，前端只负责把数字与图形拼起来。
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { areaChart } from '../charts.js';
import { money, compactMoney, pct, signedPct } from '../format.js';
import { escapeHtml, hydrateCounters, observeReveal, animateNumber } from '../ui.js';

export const meta = { title: '经营看板', eyebrow: 'INSIGHTS' };

let rootEl = null;
let ctxRef = null;
let range = 14;

export function render(ctx) {
  ctxRef = ctx;
  return `
  <div class="view__inner">
    <div class="kpis stagger" id="kpis">${kpiSkeleton()}</div>

    <div class="grid-2">
      <section class="card" data-reveal>
        <header class="card__head">
          <div>
            <div class="card__title">营收趋势</div>
            <div class="card__sub" id="series-sub">按营业日统计，含未支付订单不计入</div>
          </div>
          <div class="seg" id="range-seg" style="margin-left:auto">
            <span class="seg__thumb"></span>
            ${[7, 14, 30]
              .map(
                (d) =>
                  `<button class="seg__btn ${range === d ? 'is-active' : ''}" data-range="${d}">${d} 天</button>`
              )
              .join('')}
          </div>
        </header>
        <div class="card__body">
          <div class="chart" id="series-chart">
            <div class="skeleton" style="height:250px"></div>
          </div>
        </div>
      </section>

      <section class="card" data-reveal style="--i:1">
        <header class="card__head">
          <div>
            <div class="card__title">品类结构</div>
            <div class="card__sub">近 30 天商品营收占比</div>
          </div>
        </header>
        <div class="card__body" id="category-chart">
          <div class="skeleton" style="height:180px"></div>
        </div>
      </section>
    </div>

    <div class="grid-3">
      <section class="card" data-reveal style="--i:2">
        <header class="card__head"><div class="card__title">畅销商品</div><span class="card__sub" style="margin-left:auto">近 30 天</span></header>
        <div class="card__body" id="top-list" style="padding-top:6px;padding-bottom:10px">
          ${[1, 2, 3, 4, 5].map(() => '<div class="skeleton" style="height:44px;margin:8px 0"></div>').join('')}
        </div>
      </section>

      <section class="card card--fill" data-reveal style="--i:3">
        <header class="card__head"><div class="card__title">时段分布</div><span class="card__sub" style="margin-left:auto">近 7 天</span></header>
        <div class="card__body" id="hourly-chart"></div>
      </section>

      <section class="card card--fill" data-reveal style="--i:4">
        <header class="card__head"><div class="card__title">支付方式</div><span class="card__sub" style="margin-left:auto">近 30 天</span></header>
        <div class="card__body" id="payment-chart">
          <div class="skeleton" style="height:140px"></div>
        </div>
      </section>
    </div>
  </div>`;
}

export function mount(root, ctx) {
  rootEl = root;
  ctxRef = ctx;

  loadAll();

  root.querySelector('#range-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-range]');
    if (!btn) return;
    range = Number(btn.dataset.range);
    root.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('is-active', b === btn));
    moveThumb(root.querySelector('#range-seg'));
    loadSeries();
  });

  requestAnimationFrame(() => moveThumb(root.querySelector('#range-seg')));
  observeReveal(root);
}

function moveThumb(seg) {
  const active = seg?.querySelector('.seg__btn.is-active');
  const thumb = seg?.querySelector('.seg__thumb');
  if (!active || !thumb) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

async function loadAll() {
  loadOverview();
  loadSeries();
  loadCategories();
  loadTop();
  loadHourly();
  loadPayments();
}

/* ------------------------------------------------------------------ KPI */
async function loadOverview() {
  try {
    const data = await api.overview();
    const box = rootEl?.querySelector('#kpis');
    if (!box) return;

    const { today, month, openOrders, lowStock } = data;

    box.innerHTML = `
      ${kpiCard({
        label: '今日营收',
        icon: 'wallet',
        value: today.revenue / 100,
        prefix: '¥',
        delta: today.revenueDelta,
        hint: `昨日 ${money(data.yesterday.revenue)}`,
        i: 0,
      })}
      ${kpiCard({
        label: '今日单量',
        icon: 'receipt',
        value: today.orders,
        suffix: ' 单',
        delta: today.ordersDelta,
        hint: `待结账 ${openOrders} 单`,
        i: 1,
      })}
      ${kpiCard({
        label: '客单价',
        icon: 'trend',
        value: today.avgTicket / 100,
        prefix: '¥',
        decimals: 1,
        hint: `本月 ${compactMoney(month.revenue)}`,
        i: 2,
      })}
      ${kpiCard({
        label: '毛利率',
        icon: 'chart',
        value: today.margin * 100,
        suffix: '%',
        decimals: 1,
        hint: lowStock > 0 ? `${lowStock} 个商品库存偏低` : '库存水位健康',
        warn: lowStock > 0,
        i: 3,
      })}`;

    hydrateCounters(box);
  } catch (err) {
    console.error(err);
  }
}

function kpiCard({ label, icon: iconName, value, prefix = '', suffix = '', decimals = 0, delta, hint, warn, i }) {
  const chip = delta === undefined ? '' : deltaChip(delta);
  return `
    <article class="kpi spotlight" style="--i:${i}">
      <div class="kpi__label">${icon(iconName, 14)} ${label}</div>
      <div class="kpi__value" data-count="${value}" data-prefix="${prefix}" data-suffix="${suffix}"
           data-decimals="${decimals}" data-duration="1000">0</div>
      <div class="kpi__foot">
        ${chip}
        <span style="color:${warn ? 'var(--amber)' : 'var(--text-3)'}">${escapeHtml(hint)}</span>
      </div>
    </article>`;
}

function deltaChip(n) {
  if (Math.abs(n) < 0.0005) return `<span class="delta delta--flat">持平</span>`;
  const up = n > 0;
  return `<span class="delta delta--${up ? 'up' : 'down'}">${icon(up ? 'arrowUp' : 'arrowDown', 9)}${signedPct(n)}</span>`;
}

/* --------------------------------------------------------------- 趋势图 */
async function loadSeries() {
  try {
    const data = await api.series(range);
    const box = rootEl?.querySelector('#series-chart');
    if (!box) return;

    box.innerHTML = areaChart(data.points, { height: 250, id: 'rev' });

    const total = data.points.reduce((sum, p) => sum + p.revenue, 0);
    const sub = rootEl.querySelector('#series-sub');
    if (sub) sub.textContent = `${range} 天累计 ${money(total)} · 日均 ${money(total / data.points.length)}`;
  } catch (err) {
    console.error(err);
  }
}

/* --------------------------------------------------------------- 品类 */
async function loadCategories() {
  try {
    const data = await api.categories(30);
    const box = rootEl?.querySelector('#category-chart');
    if (!box) return;

    if (!data.items.length) {
      box.innerHTML = `<div class="empty"><div class="empty__art">∅</div><div class="empty__title">暂无销售数据</div></div>`;
      return;
    }

    const total = data.items.reduce((sum, c) => sum + c.revenue, 0);

    box.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <span class="label">30 天商品营收 · 未扣优惠</span>
        <span class="mono" style="font-size:15px">${money(total)}</span>
      </div>
      <div class="catbar">
        ${data.items
          .map(
            (c) =>
              `<span class="catbar__seg" style="width:${(c.share * 100).toFixed(2)}%;background:${c.color}" title="${escapeHtml(c.name)} ${pct(c.share)}"></span>`
          )
          .join('')}
      </div>
      <div class="cat-list">
        ${data.items
          .map(
            (c) => `
          <div class="cat-row">
            <span class="cat-row__swatch" style="background:${c.color}"></span>
            <span class="cat-row__name">${escapeHtml(c.name)}</span>
            <span class="cat-row__pct">${pct(c.share)}</span>
            <span class="cat-row__val">${money(c.revenue)}</span>
          </div>`
          )
          .join('')}
      </div>`;
  } catch (err) {
    console.error(err);
  }
}

/* --------------------------------------------------------------- Top */
async function loadTop() {
  try {
    const data = await api.topProducts(30);
    const box = rootEl?.querySelector('#top-list');
    if (!box) return;

    box.innerHTML = `<div class="rank-list">
      ${data.items
        .map(
          (p) => `
        <div class="rank-row">
          <span class="rank-row__no">${String(p.rank).padStart(2, '0')}</span>
          <div style="min-width:0">
            <div class="rank-row__name truncate">${escapeHtml(p.name)}</div>
            <div class="rank-row__meta">售出 ${p.qty} 份 · 占比 ${pct(p.share)}</div>
          </div>
          <span class="rank-row__val">${money(p.revenue)}</span>
        </div>`
        )
        .join('')}
    </div>`;
  } catch (err) {
    console.error(err);
  }
}

/* --------------------------------------------------------------- 时段 */
async function loadHourly() {
  try {
    const data = await api.hourly(7);
    const box = rootEl?.querySelector('#hourly-chart');
    if (!box) return;

    const max = Math.max(...data.hours.map((h) => h.orders), 1);
    const peak = data.hours.reduce((best, h) => (h.orders > best.orders ? h : best), data.hours[0]);

    box.innerHTML = `
      <div class="bars">
        ${data.hours
          .map(
            (h, i) => `
          <div class="bars__col" title="${h.hour}:00 · ${h.orders} 单 · ${money(h.revenue)}">
            <div class="bars__fill" style="height:${Math.max((h.orders / max) * 100, 3)}%;--i:${i}"></div>
            <span class="bars__x">${i % 2 === 0 || i === data.hours.length - 1 ? h.hour : ''}</span>
          </div>`
          )
          .join('')}
      </div>
      <div class="row hourly__foot" style="justify-content:space-between">
        <span class="label">高峰时段</span>
        <span class="badge badge--brand">${peak.hour}:00 · ${peak.orders} 单</span>
      </div>`;
  } catch (err) {
    console.error(err);
  }
}

/* --------------------------------------------------------------- 支付 */
async function loadPayments() {
  try {
    const data = await api.payments(30);
    const box = rootEl?.querySelector('#payment-chart');
    if (!box) return;

    const meta = {
      wechat: '微信支付',
      alipay: '支付宝',
      cash: '现金',
      card: '银行卡',
    };

    const total = data.items.reduce((sum, i) => sum + i.revenue, 0) || 1;
    const top = Math.max(...data.items.map((i) => i.revenue), 1);

    box.innerHTML = `
      <div class="pay-list">
        ${data.items
          .map((p, i) => {
            const share = p.revenue / total;
            return `
          <div class="pay-row">
            <span class="pay-row__name">${escapeHtml(meta[p.method] ?? p.method)}</span>
            <span class="pay-row__track">
              <span class="pay-row__fill" style="width:${(p.revenue / top) * 100}%;--i:${i}"></span>
            </span>
            <span class="pay-row__val">${money(p.revenue)}<em>${pct(share)}</em></span>
          </div>`;
          })
          .join('')}
        <div class="pay-total">
          <span class="label">30 天总收款</span>
          <span class="pay-total__val">${money(total)}</span>
        </div>
      </div>`;
  } catch (err) {
    console.error(err);
  }
}

function kpiSkeleton() {
  return Array.from({ length: 4 })
    .map(
      () => `<div class="kpi"><div class="skeleton" style="width:70px;height:12px"></div>
        <div class="skeleton" style="width:110px;height:26px;margin-top:12px"></div>
        <div class="skeleton" style="width:90px;height:12px;margin-top:10px"></div></div>`
    )
    .join('');
}
