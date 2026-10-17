/**
 * inventory.js —— 商品与库存管理。
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { money } from '../format.js';
import { escapeHtml, toast, openModal, confirmDialog } from '../ui.js';

export const meta = { title: '商品库存', eyebrow: 'INVENTORY' };

let rootEl = null;
let ctxRef = null;
let keyword = '';

export function render(ctx) {
  ctxRef = ctx;
  return `
  <div class="view__inner">
    <div class="toolbar">
      <div class="search" style="width:240px">
        ${icon('search', 15)}
        <input class="input" id="inv-search" placeholder="搜索商品名或 SKU" value="${escapeHtml(keyword)}" />
      </div>
      <span class="badge badge--flat" id="inv-total"></span>
      <span class="badge badge--rose" id="inv-low" hidden></span>
      <div class="toolbar__spacer"></div>
      <button class="btn" id="inv-refresh">${icon('refresh', 15)} 刷新</button>
    </div>

    <div class="card" style="overflow:hidden">
      <div class="table-wrap" style="max-height:calc(100dvh - 230px)">
        <table class="table">
          <thead>
            <tr>
              <th>商品</th>
              <th>分类</th>
              <th class="cell-num">售价</th>
              <th class="cell-num">成本</th>
              <th class="cell-num">毛利</th>
              <th>库存水位</th>
              <th style="width:170px">操作</th>
            </tr>
          </thead>
          <tbody id="inv-rows">
            ${Array.from({ length: 8 })
              .map(
                () => `<tr><td colspan="7"><div class="skeleton" style="height:22px"></div></td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

export function mount(root, ctx) {
  rootEl = root;
  ctxRef = ctx;

  paint();

  let timer;
  root.querySelector('#inv-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      keyword = e.target.value.trim();
      paint();
    }, 200);
  });

  root.querySelector('#inv-refresh').addEventListener('click', async () => {
    await ctx.refreshMenu();
    paint();
    toast('库存已同步', 'info');
  });

  root.querySelector('#inv-rows').addEventListener('click', (e) => {
    const restockBtn = e.target.closest('[data-restock]');
    if (restockBtn) return openRestock(Number(restockBtn.dataset.restock));

    const priceBtn = e.target.closest('[data-price]');
    if (priceBtn) return openPrice(Number(priceBtn.dataset.price));

    const toggle = e.target.closest('[data-toggle]');
    if (toggle) return toggleActive(Number(toggle.dataset.toggle));
  });
}

function paint() {
  const tbody = rootEl?.querySelector('#inv-rows');
  if (!tbody) return;

  const products = ctxRef.store.state.menu.products;
  const kw = keyword.toLowerCase();
  const list = products.filter(
    (p) => !kw || p.name.toLowerCase().includes(kw) || p.sku.toLowerCase().includes(kw)
  );
  const low = products.filter((p) => p.stock <= p.lowStock && p.active);
  const isOwner = ctxRef.store.state.user?.role === 'owner';

  const totalEl = rootEl.querySelector('#inv-total');
  if (totalEl) totalEl.textContent = `${products.length} 个 SKU · 在售 ${products.filter((p) => p.active).length}`;

  const lowEl = rootEl.querySelector('#inv-low');
  if (lowEl) {
    lowEl.hidden = low.length === 0;
    lowEl.textContent = `${low.length} 个库存告急`;
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty__art">∅</div><div class="empty__title">没有找到商品</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((p) => {
      const ratio = Math.min(p.stock / Math.max(p.lowStock * 4, 1), 1);
      const isLow = p.stock <= p.lowStock;
      return `
      <tr>
        <td>
          <div class="row" style="gap:10px">
            <span class="item-thumb">${escapeHtml(p.name.slice(0, 1))}</span>
            <div style="min-width:0">
              <div class="cell-strong">${escapeHtml(p.name)}</div>
              <div class="dim mono" style="font-size:9.5px">${escapeHtml(p.sku)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge--flat">${escapeHtml(p.categoryName)}</span></td>
        <td class="cell-num cell-strong">${money(p.price)}</td>
        <td class="cell-num">${money(p.cost)}</td>
        <td class="cell-num" style="color:${p.margin >= 55 ? 'var(--green)' : p.margin >= 35 ? 'var(--amber)' : 'var(--rose)'}">${p.margin}%</td>
        <td>
          <div class="stock-cell ${isLow ? 'is-low' : ''}">
            <span class="stock-cell__num">${p.stock}</span>
            <div class="stock-cell__bar"><i style="width:${ratio * 100}%"></i></div>
            <span class="dim" style="font-size:10.5px;min-width:34px;text-align:right">预警 ${p.lowStock}</span>
          </div>
        </td>
        <td>
          <div class="row" style="gap:6px">
            <button class="btn btn--sm" data-restock="${p.id}" ${isOwner ? '' : 'disabled'}>补货</button>
            <button class="btn btn--sm btn--ghost" data-price="${p.id}" ${isOwner ? '' : 'disabled'}>改价</button>
            <button class="switch ${p.active ? 'is-on' : ''}" data-toggle="${p.id}"
                    ${isOwner ? '' : 'disabled'} aria-label="上架状态"></button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function openRestock(id) {
  const product = ctxRef.store.state.menu.products.find((p) => p.id === id);
  if (!product) return;
  let qty = 20;

  openModal({
    title: '补货入库',
    subtitle: `${product.name} · 当前 ${product.stock} ${product.unit}`,
    width: 400,
    body: `
      <label class="field">
        <span class="field__label">入库数量</span>
        <input class="input" id="restock-qty" type="number" min="1" max="999" value="20" />
      </label>
      <div class="row" style="gap:8px;margin-top:12px">
        ${[10, 20, 50, 100].map((n) => `<button class="chip" data-quick="${n}">+${n}</button>`).join('')}
      </div>`,
    footer: `<button class="btn btn--ghost" data-close>取消</button>
             <button class="btn btn--primary" id="restock-confirm">确认入库</button>`,
    onMount(host, close) {
      const input = host.querySelector('#restock-qty');
      host.querySelectorAll('[data-quick]').forEach((b) =>
        b.addEventListener('click', () => {
          input.value = b.dataset.quick;
        })
      );
      host.querySelector('#restock-confirm').addEventListener('click', async (e) => {
        qty = Number(input.value);
        if (!Number.isInteger(qty) || qty <= 0) return toast('请输入正整数', 'warn');
        // currentTarget 只在事件派发期间有效，await 之后会变成 null
        const btn = e.currentTarget;
        btn.classList.add('btn--loading');
        try {
          await api.restock(id, qty);
          close();
          await ctxRef.refreshMenu();
          paint();
          toast(`已入库 ${qty} ${product.unit}`, 'success');
        } catch (err) {
          btn.classList.remove('btn--loading');
          toast(err.message, 'error');
        }
      });
    },
  });
}

function openPrice(id) {
  const product = ctxRef.store.state.menu.products.find((p) => p.id === id);
  if (!product) return;

  openModal({
    title: '调整价格',
    subtitle: product.name,
    width: 400,
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">
          <span class="field__label">售价（元）</span>
          <input class="input" id="new-price" type="number" min="0" step="0.5" value="${(product.price / 100).toFixed(1)}" />
        </label>
        <label class="field">
          <span class="field__label">成本（元）</span>
          <input class="input" id="new-cost" type="number" min="0" step="0.5" value="${(product.cost / 100).toFixed(1)}" />
        </label>
      </div>
      <p class="dim" style="font-size:11.5px;margin-top:12px">
        改价只影响之后的订单，历史账单保留成交时的价格快照。
      </p>`,
    footer: `<button class="btn btn--ghost" data-close>取消</button>
             <button class="btn btn--primary" id="price-confirm">保存</button>`,
    onMount(host, close) {
      host.querySelector('#price-confirm').addEventListener('click', async (e) => {
        const price = Math.round(Number(host.querySelector('#new-price').value) * 100);
        const cost = Math.round(Number(host.querySelector('#new-cost').value) * 100);
        if (!Number.isInteger(price) || price < 0) return toast('价格不合法', 'warn');
        const btn = e.currentTarget;
        btn.classList.add('btn--loading');
        try {
          await api.updateProduct(id, { price, cost });
          close();
          await ctxRef.refreshMenu();
          paint();
          toast('价格已更新', 'success');
        } catch (err) {
          btn.classList.remove('btn--loading');
          toast(err.message, 'error');
        }
      });
    },
  });
}

async function toggleActive(id) {
  const product = ctxRef.store.state.menu.products.find((p) => p.id === id);
  if (!product) return;
  const next = !product.active;

  if (!next) {
    const ok = await confirmDialog({
      title: '下架这个商品？',
      message: `「${product.name}」下架后将从点单台隐藏，已产生的账单不受影响。`,
      confirmText: '确认下架',
      danger: true,
    });
    if (!ok) return;
  }

  try {
    await api.updateProduct(id, { active: next });
    await ctxRef.refreshMenu();
    paint();
    toast(next ? '商品已上架' : '商品已下架', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}
