/**
 * store.js —— 极简响应式状态容器。
 *
 * 不引入框架：一个不可变 state + 订阅者集合，足以支撑这种规模的界面，
 * 同时让「购物车」这类跨组件状态有唯一真相来源。
 */

const CART_KEY = 'mise.cart';

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((i) => i && i.productId && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function loadTheme() {
  // 门店场景默认深色（夜间收银居多），用户手动切换后以本地记录为准
  return localStorage.getItem('mise.theme') || 'dark';
}

const listeners = new Set();

export const store = {
  state: {
    user: null,
    menu: { categories: [], products: [] },
    cart: loadCart(),
    settings: {},
    theme: loadTheme(),
    online: false,
    today: { orders: 0, revenue: 0 },
    pendingOrders: 0,
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  set(patch, { silent = false } = {}) {
    Object.assign(this.state, patch);
    if (!silent) listeners.forEach((fn) => fn(this.state));
  },

  /* ------------------------------------------------------------ 购物车 */
  addToCart(product, qty = 1) {
    const existing = this.state.cart.find((i) => i.productId === product.id);
    const nextQty = (existing?.qty ?? 0) + qty;
    if (nextQty > product.stock) return { ok: false, reason: 'stock' };

    if (existing) {
      existing.qty = nextQty;
      this.set({ cart: [...this.state.cart] });
    } else {
      this.set({
        cart: [
          ...this.state.cart,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            emoji: product.emoji,
            stock: product.stock,
            unit: product.unit,
            qty,
          },
        ],
      });
    }
    this.persistCart();
    return { ok: true, qty: nextQty };
  },

  changeQty(productId, delta) {
    const item = this.state.cart.find((i) => i.productId === productId);
    if (!item) return { ok: false };
    const next = item.qty + delta;
    if (next > item.stock) return { ok: false, reason: 'stock' };
    if (next <= 0) {
      this.removeFromCart(productId);
      return { ok: true, removed: true };
    }
    item.qty = next;
    this.set({ cart: [...this.state.cart] });
    this.persistCart();
    return { ok: true };
  },

  removeFromCart(productId) {
    this.set({ cart: this.state.cart.filter((i) => i.productId !== productId) });
    this.persistCart();
  },

  clearCart() {
    this.set({ cart: [] });
    this.persistCart();
  },

  get totals() {
    const items = this.state.cart;
    return {
      count: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal: items.reduce((sum, i) => sum + i.price * i.qty, 0),
      kinds: items.length,
    };
  },

  cartQtyOf(productId) {
    return this.state.cart.find((i) => i.productId === productId)?.qty ?? 0;
  },

  persistCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(this.state.cart));
  },

  /* -------------------------------------------------------------- 主题 */
  setTheme(theme) {
    localStorage.setItem('mise.theme', theme);
    document.documentElement.dataset.theme = theme;
    this.set({ theme });
  },

  /* ------------------------------------------------------------ 菜单同步 */
  /** 用最新菜单刷新购物车里的库存快照，避免用旧库存下单 */
  syncMenu(menu) {
    const byId = new Map(menu.products.map((p) => [p.id, p]));
    const cart = this.state.cart
      .map((item) => {
        const fresh = byId.get(item.productId);
        if (!fresh || !fresh.active) return null;
        return {
          ...item,
          name: fresh.name,
          price: fresh.price,
          emoji: fresh.emoji,
          stock: fresh.stock,
          qty: Math.min(item.qty, fresh.stock),
        };
      })
      .filter((i) => i && i.qty > 0);

    this.set({ menu, cart });
    this.persistCart();
  },
};
