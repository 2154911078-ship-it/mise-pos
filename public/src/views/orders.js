/**
 * orders.js —— 账单列表 + 详情抽屉。
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { money, dateTime, timeHM, statusMeta, paymentMeta, relative, PAYMENT_LIST } from '../format.js';
import { escapeHtml, toast, openDrawer, confirmDialog, openModal, animateNumber } from '../ui.js';

export const meta = { title: '账单流水', eyebrow: 'ORDERS' };

const filters = { status: 'all', keyword: '', date: '' };
let rootEl = null;
let ctxRef = null;

export function render(ctx) {
  ctxRef = ctx;
  return `
  <div class="view__inner">
    <div class="toolbar">
      <div class="seg" id="order-status">
        <span class="seg__thumb"></span>
        <button class="seg__btn is-active" data-status="all">全部</button>
        <button class="seg__btn" data-status="open">待结账</button>
        <button class="seg__btn" data-status="paid">已结账</button>
        <button class="seg__btn" data-status="void">已作废</button>
      </div>
      <div class="search" style="width:230px">
        ${icon('search', 15)}
        <input class="input" id="order-search" placeholder="单号 / 桌号 / 商品" />
      </div>
      <input class="input" id="order-date" type="date" style="width:172px" />
      <div class="toolbar__spacer"></div>
      <span class="dim" id="order-total" style="font-size:12px"></span>
      <button class="btn" id="export-csv">${icon('download', 15)} 导出 CSV</button>
    </div>

    <div class="card" style="overflow:hidden">
      <div class="table-wrap" style="max-height:calc(100dvh - 230px)">
        <table class="table">
          <thead>
            <tr>
              <th>单号</th>
              <th>时间</th>
              <th>桌号</th>
              <th>商品</th>
              <th class="cell-num">金额</th>
              <th>支付</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody id="order-rows">
            ${skeletonRows(7)}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

export function mount(root, ctx) {
  rootEl = root;
  ctxRef = ctx;

  load();

  root.querySelector('#order-status').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    filters.status = btn.dataset.status;
    root.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('is-active', b === btn));
    moveThumb(root.querySelector('#order-status'));
    load();
  });

  let timer;
  root.querySelector('#order-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.keyword = e.target.value.trim();
      load();
    }, 260);
  });

  root.querySelector('#order-date').addEventListener('change', (e) => {
    filters.date = e.target.value;
    load();
  });

  root.querySelector('#export-csv').addEventListener('click', exportCsv);
  root.querySelector('#order-rows').addEventListener('click', (e) => {
    const row = e.target.closest('[data-order]');
    if (row) openDetail(Number(row.dataset.order));
  });

  requestAnimationFrame(() => moveThumb(root.querySelector('#order-status')));
}

function moveThumb(seg) {
  if (!seg) return;
  const active = seg.querySelector('.seg__btn.is-active');
  const thumb = seg.querySelector('.seg__thumb');
  if (!active || !thumb) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

async function load() {
  const tbody = rootEl?.querySelector('#order-rows');
  if (!tbody) return;

  try {
    const data = await api.listOrders({
      status: filters.status,
      q: filters.keyword,
      date: filters.date,
      limit: 60,
    });

    const totalEl = rootEl.querySelector('#order-total');
    if (totalEl) totalEl.textContent = `共 ${data.total} 笔`;

    if (!data.orders.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty">
          <div class="empty__art">∅</div>
          <div class="empty__title">没有符合条件的账单</div>
          <div class="empty__desc">试试切换状态或清空搜索条件</div>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = data.orders
      .map((o) => {
        const st = statusMeta(o.status);
        const pay = paymentMeta(o.paymentMethod);
        return `
        <tr data-order="${o.id}" style="cursor:pointer">
          <td><span class="order-no">${escapeHtml(o.orderNo)}</span></td>
          <td>
            <div style="color:var(--text)">${timeHM(o.createdAt)}</div>
            <div class="dim" style="font-size:11px">${relative(o.createdAt)}</div>
          </td>
          <td>${o.tableNo ? `<span class="badge badge--flat">${escapeHtml(o.tableNo)}</span>` : '<span class="dim">—</span>'}</td>
          <td><div class="order-items-mini">${escapeHtml(o.itemsSummary || '—')}</div></td>
          <td class="cell-num cell-strong">${money(o.total)}</td>
          <td>${o.paymentMethod ? `<span class="pay-mark">${pay.abbr}</span><span class="pay-name">${pay.text}</span>` : '<span class="dim">未支付</span>'}</td>
          <td><span class="badge ${st.cls}">${st.text}</span></td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty__art">!</div><div class="empty__title">加载失败</div><div class="empty__desc">${escapeHtml(err.message)}</div></div></td></tr>`;
  }
}

async function openDetail(id) {
  let data;
  try {
    data = await api.getOrder(id);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const { order, items, logs } = data;
  const st = statusMeta(order.status);

  const body = `
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:18px">
      <div>
        <div class="order-no" style="font-size:15px;color:var(--text)">${escapeHtml(order.orderNo)}</div>
        <div class="dim" style="font-size:11.5px;margin-top:2px">
          ${dateTime(order.createdAt)} · ${order.cashier || '未知收银员'}
        </div>
      </div>
      <span class="badge ${st.cls}" style="margin-left:auto">${st.text}</span>
    </div>

    <div style="border-top:1px solid var(--ink);border-bottom:1px solid var(--line);padding:14px 0;margin-bottom:22px">
      <div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <span class="label">应收金额</span>
        <span class="receipt__total-value">${money(order.total)}</span>
      </div>
      <div class="receipt__sum"><span>小计</span><span>${money(order.subtotal)}</span></div>
      ${order.discount ? `<div class="receipt__sum"><span>优惠</span><span style="color:var(--brand)">-${money(order.discount)}</span></div>` : ''}
      <div class="receipt__sum"><span>支付方式</span><span>${paymentMeta(order.paymentMethod).text}</span></div>
      ${order.tableNo ? `<div class="receipt__sum"><span>桌号</span><span>${escapeHtml(order.tableNo)}</span></div>` : ''}
      ${order.note ? `<div class="receipt__sum"><span>备注</span><span>${escapeHtml(order.note)}</span></div>` : ''}
    </div>

    <div class="card__title" style="margin-bottom:10px">商品明细</div>
    <div class="card" style="overflow:hidden;margin-bottom:20px">
      <table class="table">
        <tbody>
          ${items
            .map(
              (i) => `
            <tr>
              <td class="cell-strong">${escapeHtml(i.name)}</td>
              <td class="cell-num">${money(i.unitPrice)} × ${i.qty}</td>
              <td class="cell-num cell-strong" style="width:90px">${money(i.lineTotal)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="card__title" style="margin-bottom:12px">流转记录</div>
    <div class="timeline">
      <div class="timeline__item">开单${order.cashier ? ` · ${escapeHtml(order.cashier)}` : ''}
        <div class="timeline__time">${dateTime(order.createdAt)}</div>
      </div>
      ${
        order.paidAt
          ? `<div class="timeline__item">完成收款 · ${paymentMeta(order.paymentMethod).text}
               <div class="timeline__time">${dateTime(order.paidAt)}</div></div>`
          : ''
      }
      ${
        order.voidedAt
          ? `<div class="timeline__item">订单作废 · 库存已回补
               <div class="timeline__time">${dateTime(order.voidedAt)}</div></div>`
          : ''
      }
      ${logs
        .filter((l) => l.reason === 'sale')
        .slice(0, 4)
        .map(
          (l) => `<div class="timeline__item" style="opacity:.7">扣减库存 ${escapeHtml(l.product)} ${l.delta}
             <div class="timeline__time">${dateTime(l.createdAt)}</div></div>`
        )
        .join('')}
    </div>`;

  const footer =
    order.status === 'open'
      ? `<button class="btn btn--danger" data-void>作废</button>
         <button class="btn btn--primary" style="flex:1" data-pay>收款 ${money(order.total)}</button>`
      : order.status === 'paid'
        ? `<button class="btn btn--danger btn--block" data-void>作废并回补库存</button>`
        : `<button class="btn btn--ghost btn--block" data-close>关闭</button>`;

  const close = openDrawer({
    title: '账单详情',
    subtitle: `#${order.id}`,
    body,
    footer,
    onMount(host, closeFn) {
      host.querySelector('[data-pay]')?.addEventListener('click', () => {
        closeFn();
        openPayDialog(order, () => load());
      });
      host.querySelector('[data-void]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '确认作废这笔账单？',
          message: '作废后该笔金额将不计入营收，已扣减的库存会自动回补。此操作不可撤销。',
          confirmText: '确认作废',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.voidOrder(order.id);
          closeFn();
          toast('订单已作废，库存已回补', 'success');
          load();
          ctxRef.refreshMenu?.();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });

  return close;
}

function openPayDialog(order, onDone) {
  const methods = PAYMENT_LIST;
  let method = 'wechat';

  openModal({
    title: '收款',
    subtitle: order.orderNo,
    width: 420,
    body: `
      <div style="text-align:center;padding:4px 0 18px">
        <div class="receipt__total-value" style="font-size:38px">${money(order.total)}</div>
      </div>
      <div class="pay-grid">
        ${methods
          .map(
            (m) => `<button class="pay-opt ${m.key === method ? 'is-active' : ''}" data-method="${m.key}">
              <span class="pay-opt__icon">${m.mark}</span><span class="pay-opt__name">${m.text}</span>
            </button>`
          )
          .join('')}
      </div>`,
    footer: `<button class="btn btn--ghost" data-close>取消</button>
             <button class="btn btn--primary" id="do-pay">确认收款</button>`,
    onMount(host, close) {
      host.querySelectorAll('[data-method]').forEach((btn) => {
        btn.addEventListener('click', () => {
          method = btn.dataset.method;
          host.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('is-active', b === btn));
        });
      });
      host.querySelector('#do-pay').addEventListener('click', async (e) => {
        e.currentTarget.classList.add('btn--loading');
        try {
          await api.payOrder(order.id, method);
          close();
          toast('收款成功', 'success');
          onDone?.();
          ctxRef.refreshMenu?.();
        } catch (err) {
          e.currentTarget.classList.remove('btn--loading');
          toast(err.message, 'error');
        }
      });
    },
  });
}

async function exportCsv() {
  try {
    const res = await fetch('/api/orders/export.csv', {
      headers: { Authorization: `Bearer ${localStorage.getItem('mise.token')}` },
    });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mise-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV 已导出', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function skeletonRows(n) {
  return Array.from({ length: n })
    .map(
      () => `<tr>
        <td><div class="skeleton" style="width:96px;height:14px"></div></td>
        <td><div class="skeleton" style="width:64px;height:14px"></div></td>
        <td><div class="skeleton" style="width:36px;height:14px"></div></td>
        <td><div class="skeleton" style="width:180px;height:14px"></div></td>
        <td><div class="skeleton" style="width:60px;height:14px;margin-left:auto"></div></td>
        <td><div class="skeleton" style="width:70px;height:14px"></div></td>
        <td><div class="skeleton" style="width:56px;height:14px"></div></td>
      </tr>`
    )
    .join('');
}
