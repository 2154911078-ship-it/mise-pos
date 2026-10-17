/**
 * pos.js —— 点单台。
 *
 * 交互要点：
 *   · 加入购物车时用 WAAPI 让商品「飞」进右侧栏，形成空间连续感
 *   · 购物车重排走 FLIP，条目不会瞬间跳位
 *   · 金额变化做数字滚动，收银时读数更稳
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { money } from '../format.js';
import { escapeHtml, flip, animateNumber, toast, openModal } from '../ui.js';

export const meta = { title: '点单台', eyebrow: 'ORDER' };

const CATEGORY_ICON = { 咖啡: 'coffee', 茶饮: 'cup', 简餐: 'fries', 甜点: 'cake', 小食: 'fries' };

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
        ${icon('grid', 18)}<span>全部</span><span class="pos__cat-dot"></span>
      </button>
      ${categories
        .map(
          (c) => `
        <button class="pos__cat" data-cat="${c.id}">
          ${icon(CATEGORY_ICON[c.name] ?? 'bag', 18)}<span>${escapeHtml(c.name)}</span>
          <span class="pos__cat-dot" style="color:${c.color}"></span>
        </button>`
        )
        .join('')}
    </nav>

    <section class="pos__menu">
      <div class="pos__menu-head">
        <div class="search" style="flex:1;max-width:280px">
          ${icon('search', 15)}
          <input class="input" id="pos-search" placeholder="搜索商品…" autocomplete="off" />
        </div>
        <div class="row" style="margin-left:auto;gap:8px">
          <span class="badge badge--flat" id="pos-count"></span>
          <button class="icon-btn" data-action="refresh-menu" title="刷新菜单">${icon('refresh', 16)}</button>
        </div>
      </div>
      <div class="pos__grid stagger" id="pos-grid"></div>
    </section>

    <aside class="cart" aria-label="购物车">
      <header class="cart__head">
        <span style="color:var(--text-2)">${icon('bag', 17)}</span>
        <span class="card__title">当前订单</span>
        <span class="cart__count" id="cart-count">0</span>
        <input class="input" id="table-no" placeholder="桌号 / 外带"
               style="margin-left:auto;width:104px;height:30px;font-size:12px" maxlength="8" />
      </header>
      <div class="cart__body" id="cart-body"></div>
      <footer class="cart__foot" id="cart-foot"></footer>
    </aside>
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
    const card = e.target.closest('[data-product]');
    if (!card) return;
    addProduct(Number(card.dataset.product), card);
  });

  root.querySelector('#cart-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qty]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const delta = Number(btn.dataset.qty);
    const result = ctx.store.changeQty(id, delta);
    if (!result.ok && result.reason === 'stock') {
      toast('已达当前库存上限', 'warn');
      return;
    }
    paintCart();
  });

  root.querySelector('#cart-foot').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-cart"]')) {
      ctx.store.clearCart();
      paintCart();
      paintGrid();
    }
    if (e.target.closest('[data-action="checkout"]')) openCheckout();
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

/* -------------------------------------------------------------- 商品网格 */
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
  if (counter) counter.textContent = `${items.length} 款在售`;

  if (!items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty__art">🔍</div>
      <div class="empty__title">没有匹配的商品</div>
      <div class="empty__desc">换个关键词，或切回「全部」分类</div>
    </div>`;
    return;
  }

  grid.innerHTML = items
    .map((p, i) => {
      const qty = ctxRef.store.cartQtyOf(p.id);
      const soldout = p.stock <= 0;
      return `
      <button class="product ${soldout ? 'is-soldout' : ''}" data-product="${p.id}" style="--i:${Math.min(i, 12)}">
        <span class="product__emoji">${p.emoji}</span>
        <span class="product__name">${escapeHtml(p.name)}</span>
        <span class="product__meta">
          <span class="product__price"><small>¥</small>${priceText(p.price)}</span>
          <span class="product__stock ${p.stock <= p.lowStock ? 'is-low' : ''}">${soldout ? '售罄' : `余 ${p.stock}`}</span>
        </span>
        <span class="product__add">${icon('plus', 14)}</span>
        ${qty ? `<span class="product__qty">${qty}</span>` : ''}
      </button>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ 购物车 */
function paintCart() {
  const body = rootEl?.querySelector('#cart-body');
  const foot = rootEl?.querySelector('#cart-foot');
  if (!body || !foot) return;

  const { cart } = ctxRef.store.state;
  const totals = ctxRef.store.totals;

  if (!cart.length) {
    body.innerHTML = `
      <div class="empty" style="padding:44px 10px">
        <div class="empty__art">🧾</div>
        <div class="empty__title">还没有选商品</div>
        <div class="empty__desc">点击左侧菜单即可加入，支持边点边结</div>
      </div>`;
    foot.innerHTML = `
      <div class="cart__total">
        <span class="cart__total-label">应收</span>
        <span class="cart__total-value"><small>¥</small>0</span>
      </div>
      <button class="btn btn--primary btn--block btn--lg" disabled>请先选择商品</button>`;
  } else {
    flip(body, () => {
      body.innerHTML = cart
        .map(
          (item) => `
        <div class="cart-item" data-flip-key="${item.productId}">
          <span class="cart-item__emoji">${item.emoji}</span>
          <div style="min-width:0">
            <div class="cart-item__name truncate">${escapeHtml(item.name)}</div>
            <div class="cart-item__price">${money(item.price)} × ${item.qty}</div>
          </div>
          <div class="qty">
            <button class="qty__btn" data-qty="-1" data-id="${item.productId}" aria-label="减少">−</button>
            <span class="qty__value">${item.qty}</span>
            <button class="qty__btn" data-qty="1" data-id="${item.productId}" aria-label="增加">+</button>
          </div>
        </div>`
        )
        .join('');
    });

    foot.innerHTML = `
      <div class="cart__line"><span>商品小计</span><span class="num">${money(totals.subtotal)}</span></div>
      <div class="cart__line"><span>共 ${totals.count} 件 · ${totals.kinds} 种</span><span class="dim">未含优惠</span></div>
      <div class="cart__total">
        <span class="cart__total-label">应收</span>
        <span class="cart__total-value" id="cart-total"><small>¥</small><span data-total="${totals.subtotal}">0</span></span>
      </div>
      <div class="cart__actions">
        <button class="btn btn--ghost" data-action="clear-cart">${icon('trash', 15)} 清空</button>
        <button class="btn btn--primary" data-action="checkout">结账 ${icon('arrowRight', 15)}</button>
      </div>`;

    animateNumber(foot.querySelector('[data-total]'), totals.subtotal / 100, { duration: 480 });
  }

  const badge = rootEl.querySelector('#cart-count');
  if (badge) {
    badge.textContent = totals.count;
    badge.classList.remove('is-bump');
    void badge.offsetWidth;
    badge.classList.add('is-bump');
  }
}

/* ------------------------------------------------------------- 加入购物车 */
function addProduct(id, cardEl) {
  const product = ctxRef.store.state.menu.products.find((p) => p.id === id);
  if (!product) return;

  const result = ctxRef.store.addToCart(product, 1);
  if (!result.ok) {
    cardEl?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'ease-in-out' }
    );
    toast(result.reason === 'stock' ? '库存不足，无法继续添加' : '添加失败', 'warn');
    return;
  }

  flyToCart(cardEl, product.emoji);
  paintCart();
  updateCardBadge(id, result.qty);
}

function updateCardBadge(productId, qty) {
  const card = rootEl?.querySelector(`[data-product="${productId}"]`);
  if (!card) return;
  let badge = card.querySelector('.product__qty');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'product__qty';
    card.append(badge);
  }
  badge.textContent = qty;
  badge.style.animation = 'none';
  void badge.offsetWidth;
  badge.style.animation = '';
}

function flyToCart(fromEl, emoji) {
  const target = rootEl?.querySelector('.cart__head');
  if (!fromEl || !target) return;

  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 30;

  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.textContent = emoji;
  dot.style.cssText = `left:${a.left + a.width / 2 - size / 2}px;top:${a.top + a.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
  document.body.append(dot);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);

  const anim = dot.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.15 },
    ],
    { duration: 620, easing: 'cubic-bezier(.4,0,.55,1)' }
  );

  anim.onfinish = () => {
    dot.remove();
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'ease-out' }
    );
  };
}

/* ------------------------------------------------------------------ 结账 */
function openCheckout() {
  const totals = ctxRef.store.totals;
  if (!totals.count) return;

  let method = 'wechat';
  let discount = 0;

  const methods = [
    { key: 'wechat', name: '微信支付', emoji: '💚' },
    { key: 'alipay', name: '支付宝', emoji: '🔵' },
    { key: 'cash', name: '现金', emoji: '💵' },
    { key: 'card', name: '银行卡', emoji: '💳' },
  ];

  openModal({
    title: '确认收款',
    subtitle: `共 ${totals.count} 件商品`,
    width: 460,
    body: `
      <div style="text-align:center;padding:6px 0 14px">
        <div class="dim" style="font-size:11.5px;letter-spacing:.08em">应收金额</div>
        <div class="cart__total-value" style="font-size:38px;margin-top:2px"><small>¥</small><span id="pay-amount">${(totals.subtotal / 100).toFixed(0)}</span></div>
      </div>
      <div class="field__label" style="margin-bottom:8px">支付方式</div>
      <div class="pay-grid">
        ${methods
          .map(
            (m) => `
          <button class="pay-opt ${m.key === 'wechat' ? 'is-active' : ''}" data-method="${m.key}">
            <span class="pay-opt__icon">${m.emoji}</span>
            <span class="pay-opt__name">${m.name}</span>
          </button>`
          )
          .join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
        <label class="field">
          <span class="field__label">优惠金额（元）</span>
          <input class="input" id="pay-discount" type="number" min="0" step="1" value="0" />
        </label>
        <label class="field">
          <span class="field__label">桌号</span>
          <input class="input" id="pay-table" value="${escapeHtml(sessionStorage.getItem('mise.table') || '')}" placeholder="可选" />
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
        animateNumber(amountEl, totals.subtotal / 100 - discount, { duration: 300 });
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
      <div class="dim" style="font-size:12px">${order.orderNo} · ${order.paymentMethod === 'cash' ? '现金' : order.paymentMethod === 'wechat' ? '微信支付' : order.paymentMethod === 'alipay' ? '支付宝' : '银行卡'}</div>
      <div class="badge badge--paid" style="margin-top:10px">已完成收款</div>
    </div>`;
  const foot = panel.querySelector('.modal__foot');
  if (foot) foot.style.display = 'none';

  ctxRef.store.clearCart();
  paintCart();
  sessionStorage.removeItem('mise.table');
  ctxRef.refreshMenu?.().then(() => paintGrid());

  setTimeout(() => {
    close();
    toast(`收款成功 ${money(order.total)}`, 'success');
  }, 1700);
}

/* ------------------------------------------------------------------ 工具 */
function priceText(cents) {
  const yuan = cents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(1);
}
