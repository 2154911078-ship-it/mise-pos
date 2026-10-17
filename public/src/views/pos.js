/**
 * pos.js —— 点单台（菜单列表 + 小票）
 *
 * 视觉隐喻取自真实菜单：编号、菜名、点线引导、右对齐价格。
 * 加入购物车不做飞球，而是让条目「打印」到右侧小票上，更贴合收银场景。
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { money, paymentMeta, PAYMENT_LIST } from '../format.js';
import { escapeHtml, flip, animateNumber, toast, openModal } from '../ui.js';

export const meta = { title: '点单台', eyebrow: 'ORDER' };

let view = { category: 'all', keyword: '' };
let rootEl = null;
let ctxRef = null;

/* ------------------------------------------------------------------ 渲染 */
export function render(ctx) {
  ctxRef = ctx;
  const { categories } = ctx.store.state.menu;

  return `
  <div class="pos">
    <nav class="pos__cats" aria-label="商品分类">
      <button class="pos__cat is-active" data-cat="all">
        <span class="pos__cat__no">00</span>
        <span class="pos__cat__name">全部</span>
      </button>
      ${categories
        .map(
          (c, i) => `
        <button class="pos__cat" data-cat="${c.id}">
          <span class="pos__cat__no">${String(i + 1).padStart(2, '0')}</span>
          <span class="pos__cat__name">${escapeHtml(c.name)}</span>
        </button>`
        )
        .join('')}
    </nav>

    <section class="pos__menu">
      <header class="pos__menu-head">
        <div class="pos__menu-title">
          <h2>菜单</h2>
          <span class="label" id="pos-count">22 ITEMS</span>
        </div>
        <div class="pos__search search">
          ${icon('search', 13)}
          <input class="input" id="pos-search" placeholder="搜索菜名或编号" autocomplete="off" />
        </div>
        <button class="ghost-btn" data-action="refresh-menu" title="刷新菜单">${icon('refresh', 15)}</button>
      </header>
      <div class="menu-list" id="pos-grid"></div>
    </section>

    <aside class="receipt" aria-label="当前单据">
      <header class="receipt__head">
        <div class="receipt__title">
          <h2>单据</h2>
          <span class="receipt__no" id="receipt-no">未开单</span>
        </div>
        <div class="receipt__table">
          <span class="label">桌号</span>
          <input class="input" id="table-no" placeholder="外带" maxlength="8" style="width:70px" />
          <span class="label" id="receipt-count" style="margin-left:auto">0 件</span>
        </div>
      </header>
      <div class="receipt__body" id="cart-body"></div>
      <footer class="receipt__foot" id="cart-foot"></footer>
    </aside>

    <!-- 窄屏：小票让位给一条常驻结算栏，保证手机上也能结账 -->
    <div class="pos__dock" id="pos-dock" hidden>
      <div class="pos__dock-info">
        <span class="label">应收</span>
        <span class="pos__dock-total" id="dock-total">¥0</span>
      </div>
      <button class="btn btn--primary" data-dock="checkout">结账</button>
    </div>
  </div>`;
}

export function mount(root, ctx) {
  rootEl = root;
  ctxRef = ctx;

  paintGrid();
  paintCart();

  root.querySelector('#pos-search').addEventListener('input', (e) => {
    view.keyword = e.target.value.trim();
    paintGrid();
  });

  root.querySelector('.pos__cats').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    view.category = btn.dataset.cat;
    root.querySelectorAll('.pos__cat').forEach((b) => b.classList.toggle('is-active', b === btn));
    paintGrid();
  });

  root.querySelector('#pos-grid').addEventListener('click', (e) => {
    const row = e.target.closest('[data-product]');
    if (!row) return;
    addProduct(Number(row.dataset.product), row);
  });

  root.querySelector('#cart-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qty]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const result = ctx.store.changeQty(id, Number(btn.dataset.qty));
    if (!result.ok && result.reason === 'stock') {
      toast('已达当前库存上限', 'warn');
      return;
    }
    paintCart();
    paintGrid();
  });

  root.querySelector('#cart-foot').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-cart"]')) {
      ctx.store.clearCart();
      paintCart();
      paintGrid();
    }
    if (e.target.closest('[data-action="checkout"]')) openCheckout();
  });

  root.querySelector('#pos-dock').addEventListener('click', (e) => {
    if (e.target.closest('[data-dock="checkout"]')) openCheckout();
  });

  root.querySelector('[data-action="refresh-menu"]').addEventListener('click', async () => {
    await ctx.refreshMenu();
    paintGrid();
    paintCart();
    toast('菜单已刷新', 'info');
  });

  root.querySelector('#table-no').value = sessionStorage.getItem('mise.table') || '';
  root.querySelector('#table-no').addEventListener('input', (e) => {
    sessionStorage.setItem('mise.table', e.target.value.trim());
  });
}

/* -------------------------------------------------------------- 菜单列表 */
function visibleProducts() {
  const { products } = ctxRef.store.state.menu;
  const kw = view.keyword.toLowerCase();
  return products.filter((p) => {
    if (!p.active) return false;
    if (view.category !== 'all' && p.categoryId !== Number(view.category)) return false;
    if (kw && !p.name.toLowerCase().includes(kw) && !p.sku.toLowerCase().includes(kw)) return false;
    return true;
  });
}

function paintGrid() {
  const grid = rootEl?.querySelector('#pos-grid');
  if (!grid) return;

  const items = visibleProducts();
  const counter = rootEl.querySelector('#pos-count');
  if (counter) counter.textContent = `${items.length} ITEMS`;

  if (!items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty__art">∅</div>
      <div class="empty__title">没有匹配的菜品</div>
      <div class="empty__desc">换个关键词，或切回「全部」分类</div>
    </div>`;
    return;
  }

  grid.innerHTML = items
    .map((p, i) => {
      const qty = ctxRef.store.cartQtyOf(p.id);
      const soldout = p.stock <= 0;
      const low = p.stock <= p.lowStock;
      return `
      <button class="menu-row ${soldout ? 'is-soldout' : ''}" data-product="${p.id}" style="--i:${Math.min(i, 16)}">
        <span class="menu-row__no">${String(i + 1).padStart(2, '0')}</span>
        <span class="menu-row__body">
          <span class="menu-row__name">${escapeHtml(p.name)}</span>
          <span class="menu-row__meta ${low ? 'is-low' : ''}">${escapeHtml(p.categoryName)} · ${soldout ? '售罄' : `余 ${p.stock}`}</span>
        </span>
        <span class="menu-row__dots"></span>
        <span class="menu-row__price">${money(p.price)}</span>
        ${
          qty
            ? `<span class="menu-row__qty">${qty}</span>`
            : `<span class="menu-row__add">${icon('plus', 13)}</span>`
        }
      </button>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ 小票 */
function paintCart(addedId = null) {
  const body = rootEl?.querySelector('#cart-body');
  const foot = rootEl?.querySelector('#cart-foot');
  if (!body || !foot) return;

  const { cart } = ctxRef.store.state;
  const totals = ctxRef.store.totals;

  const countEl = rootEl.querySelector('#receipt-count');
  if (countEl) countEl.textContent = `${totals.count} 件`;

  const dock = rootEl.querySelector('#pos-dock');
  if (dock) {
    dock.hidden = cart.length === 0;
    const dockTotal = dock.querySelector('#dock-total');
    if (dockTotal) dockTotal.textContent = money(totals.subtotal);
  }

  if (!cart.length) {
    body.innerHTML = `
      <div class="empty" style="margin:14px 0;border-style:dashed">
        <div class="empty__art">∅</div>
        <div class="empty__title">尚未点单</div>
        <div class="empty__desc">点击左侧菜品，条目会打印到这张小票上</div>
      </div>`;
    foot.innerHTML = `
      <div class="receipt__total">
        <span class="receipt__total-label">应收</span>
        <span class="receipt__total-value"><small>¥</small>0</span>
      </div>
      <button class="btn btn--block" disabled>请先选择菜品</button>`;
    return;
  }

  flip(body, () => {
    body.innerHTML = cart
      .map(
        (item) => `
      <div class="receipt-line ${item.productId === addedId ? 'is-new' : ''}" data-flip-key="${item.productId}">
        <span class="receipt-line__name">${escapeHtml(item.name)}</span>
        <span class="receipt-line__qty">×${item.qty}</span>
        <span class="receipt-line__amount">${money(item.price * item.qty)}</span>
        <span class="receipt-line__ctrl">
          <button data-qty="-1" data-id="${item.productId}" aria-label="减少">−</button>
          <button data-qty="1" data-id="${item.productId}" aria-label="增加">+</button>
        </span>
      </div>`
      )
      .join('');
  });

  foot.innerHTML = `
    <div class="receipt__sum"><span>商品小计</span><span>${money(totals.subtotal)}</span></div>
    <div class="receipt__sum"><span>件数</span><span>${totals.count} 件 / ${totals.kinds} 种</span></div>
    <div class="receipt__total">
      <span class="receipt__total-label">应收</span>
      <span class="receipt__total-value"><small>¥</small><span data-total="${totals.subtotal}">0</span></span>
    </div>
    <div class="receipt__actions">
      <button class="btn btn--ghost" data-action="clear-cart">清空</button>
      <button class="btn btn--primary" data-action="checkout">结账</button>
    </div>`;

  animateNumber(foot.querySelector('[data-total]'), totals.subtotal / 100, { duration: 420 });
}

/* ------------------------------------------------------------- 加入菜品 */
function addProduct(id, rowEl) {
  const product = ctxRef.store.state.menu.products.find((p) => p.id === id);
  if (!product) return;

  const result = ctxRef.store.addToCart(product, 1);
  if (!result.ok) {
    rowEl?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
      { duration: 260, easing: 'ease-in-out' }
    );
    toast(result.reason === 'stock' ? '库存不足，无法继续添加' : '添加失败', 'warn');
    return;
  }

  paintCart(id);
  updateRowQty(id, result.qty);
}

function updateRowQty(productId, qty) {
  const row = rootEl?.querySelector(`[data-product="${productId}"]`);
  if (!row) return;
  let badge = row.querySelector('.menu-row__qty');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'menu-row__qty';
    const add = row.querySelector('.menu-row__add');
    if (add) add.replaceWith(badge);
    else row.append(badge);
  }
  badge.textContent = qty;
  badge.style.animation = 'none';
  void badge.offsetWidth;
  badge.style.animation = '';
}

/* ------------------------------------------------------------------ 结账 */
function openCheckout() {
  const totals = ctxRef.store.totals;
  if (!totals.count) return;

  let method = 'wechat';
  let discount = 0;

  const methods = PAYMENT_LIST;

  openModal({
    title: '确认收款',
    subtitle: `${totals.count} 件商品 · ${totals.kinds} 种`,
    width: 452,
    body: `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;padding:8px 0 20px;border-bottom:1px solid var(--ink)">
        <span class="label">应收金额</span>
        <span class="receipt__total-value" style="font-size:44px"><small>¥</small><span id="pay-amount">${(totals.subtotal / 100).toFixed(0)}</span></span>
      </div>
      <div class="label" style="margin:18px 0 8px">支付方式</div>
      <div class="pay-grid">
        ${methods
          .map(
            (m) => `
          <button class="pay-opt ${m.key === 'wechat' ? 'is-active' : ''}" data-method="${m.key}">
            <span class="pay-opt__icon">${m.mark}</span>
            <span class="pay-opt__name">${m.text}</span>
          </button>`
          )
          .join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
        <label class="field">
          <span class="field__label">优惠金额（元）</span>
          <input class="input" id="pay-discount" type="number" min="0" step="1" value="0" />
        </label>
        <label class="field">
          <span class="field__label">桌号</span>
          <input class="input" id="pay-table" value="${escapeHtml(sessionStorage.getItem('mise.table') || '')}" placeholder="外带" />
        </label>
      </div>`,
    footer: `
      <button class="btn btn--ghost" data-close>取消</button>
      <button class="btn btn--primary" id="pay-confirm">确认收款</button>`,
    onMount(host, close) {
      const amountEl = host.querySelector('#pay-amount');
      const discountInput = host.querySelector('#pay-discount');

      host.querySelectorAll('[data-method]').forEach((btn) => {
        btn.addEventListener('click', () => {
          method = btn.dataset.method;
          host.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('is-active', b === btn));
        });
      });

      discountInput.addEventListener('input', () => {
        discount = Math.min(Math.max(Number(discountInput.value) || 0, 0), totals.subtotal / 100);
        animateNumber(amountEl, totals.subtotal / 100 - discount, { duration: 280 });
      });

      const confirmBtn = host.querySelector('#pay-confirm');
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.classList.add('btn--loading');
        try {
          const table = host.querySelector('#pay-table').value.trim();
          const created = await api.createOrder({
            tableNo: table || null,
            items: ctxRef.store.state.cart.map((i) => ({ productId: i.productId, qty: i.qty })),
            discountCents: Math.round(discount * 100),
          });

          const paid = await api.payOrder(created.order.id, method);
          showSuccess(host, paid.order, close);
        } catch (err) {
          confirmBtn.classList.remove('btn--loading');
          toast(err.message || '收款失败', 'error');
        }
      });
    },
  });
}

function showSuccess(host, order, close) {
  const panel = host.querySelector('.modal__panel');
  panel.querySelector('.modal__head').style.display = 'none';
  panel.querySelector('.modal__body').innerHTML = `
    <div class="success">
      <div class="success__ring">
        <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
      </div>
      <div class="success__amount">${money(order.total)}</div>
      <div class="label" style="margin-top:6px">${order.orderNo} · ${paymentMeta(order.paymentMethod).text}</div>
    </div>`;
  const foot = panel.querySelector('.modal__foot');
  if (foot) foot.style.display = 'none';

  ctxRef.store.clearCart();
  paintCart();
  sessionStorage.removeItem('mise.table');
  const noEl = rootEl?.querySelector('#receipt-no');
  if (noEl) noEl.textContent = order.orderNo;
  ctxRef.refreshMenu?.().then(() => paintGrid());

  setTimeout(() => {
    close();
    toast(`收款成功 ${money(order.total)}`, 'success');
  }, 1700);
}
