/**
 * main.js —— 应用入口。
 * 负责：登录态判定、外壳渲染、路由、实时事件、全局快捷键。
 */
import { api, session, subscribeEvents } from './api.js';
import { icon } from './icons.js';
import { store } from './store.js';
import { toast, observeReveal, hydrateCounters, confirmDialog } from './ui.js';
import { money } from './format.js';

import * as loginView from './views/login.js';
import * as posView from './views/pos.js';
import * as ordersView from './views/orders.js';
import * as dashboardView from './views/dashboard.js';
import * as inventoryView from './views/inventory.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  pos: posView,
  orders: ordersView,
  dashboard: dashboardView,
  inventory: inventoryView,
  settings: settingsView,
};

const NAV = [
  { group: '营业', items: [
    { key: 'pos', label: '点单台', icon: 'pos' },
    { key: 'orders', label: '账单流水', icon: 'receipt' },
  ] },
  { group: '分析', items: [
    { key: 'dashboard', label: '经营看板', icon: 'chart' },
  ] },
  { group: '管理', items: [
    { key: 'inventory', label: '商品库存', icon: 'box' },
    { key: 'settings', label: '设置', icon: 'settings' },
  ] },
];

const app = document.getElementById('app');
let shell = null;
let unsubscribeSSE = null;
let clockTimer = null;
let currentKey = null;

const ctx = {
  store,
  api,
  toast,
  navigate,
  refreshMenu,
  refreshBrand,
  logout,
  onLogin: (user) => {
    store.set({ user });
    startApp();
  },
};

/* ------------------------------------------------------------------ 启动 */
boot();

async function boot() {
  document.documentElement.dataset.theme = store.state.theme;

  if (!session.token) return showLogin();

  try {
    const { user } = await api.me();
    store.set({ user }, { silent: true });
    await Promise.all([refreshMenu(), loadSettings()]);
    startApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  stopLive();
  app.className = '';
  app.innerHTML = loginView.render();
  loginView.mount(app, ctx);
  hydrateCounters(app);
}

async function startApp() {
  // 首次登录时 boot() 的预加载还没跑过，这里补齐，避免点单台空白
  if (!store.state.menu.products.length || !store.state.settings.store_name) {
    await Promise.all([refreshMenu().catch(() => {}), loadSettings()]);
  }
  renderShell();
  await route();
  startLive();
}

/* ------------------------------------------------------------------ 外壳 */
function renderShell() {
  const settings = store.state.settings;
  const user = store.state.user;

  app.className = 'app';
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand__mark">${icon('coffee', 20)}</span>
        <div class="brand__text">
          <div class="brand__name">MISE</div>
          <div class="brand__sub" id="brand-sub">${settings.store_name || '门店经营台'}</div>
        </div>
      </div>

      <nav class="nav" id="nav">
        <span class="nav-indicator" id="nav-indicator"></span>
        ${NAV.map(
          (section) => `
          <div class="nav__label">${section.group}</div>
          ${section.items
            .map(
              (item) => `
            <a class="nav-item" href="#/${item.key}" data-nav="${item.key}">
              ${icon(item.icon, 17)}<span>${item.label}</span>
              ${item.key === 'orders' ? '<span class="nav-item__badge" id="open-badge" hidden>0</span>' : ''}
            </a>`
            )
            .join('')}`
        ).join('')}
      </nav>

      <div class="sidebar__foot">
        <div class="conn" id="conn">
          <span class="conn__dot"></span>
          <span id="conn-text">连接中…</span>
        </div>
        <button class="userchip" id="userchip" title="退出登录">
          <span class="avatar">${(user?.name || 'U').slice(0, 1)}</span>
          <span class="userchip__meta">
            <span class="userchip__name">${user?.name || '未知用户'}</span>
            <span class="userchip__role">${user?.role === 'owner' ? '店长' : '收银员'}</span>
          </span>
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar__title">
          <span class="topbar__eyebrow" id="top-eyebrow">ORDER</span>
          <h1 class="topbar__heading" id="top-heading">点单台</h1>
        </div>
        <div class="topbar__spacer"></div>
        <div class="topbar__clock">
          <span class="topbar__time" id="clock">--:--</span>
          <span class="topbar__date" id="today">—</span>
        </div>
        <button class="icon-btn" id="theme-btn" title="切换主题">${icon(store.state.theme === 'dark' ? 'sun' : 'moon', 17)}</button>
        <button class="icon-btn" id="refresh-btn" title="刷新数据">${icon('refresh', 17)}</button>
      </header>
      <div class="view" id="view"></div>
    </main>`;

  shell = {
    view: app.querySelector('#view'),
    indicator: app.querySelector('#nav-indicator'),
    heading: app.querySelector('#top-heading'),
    eyebrow: app.querySelector('#top-eyebrow'),
  };

  app.querySelector('#theme-btn').addEventListener('click', () => {
    const next = store.state.theme === 'dark' ? 'light' : 'dark';
    store.setTheme(next);
    app.querySelector('#theme-btn').innerHTML = icon(next === 'dark' ? 'sun' : 'moon', 17);
    toast(next === 'dark' ? '已切换深色模式' : '已切换浅色模式', 'info', 1800);
  });

  app.querySelector('#refresh-btn').addEventListener('click', async (e) => {
    e.currentTarget.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], {
      duration: 520,
      easing: 'cubic-bezier(.22,1,.36,1)',
    });
    await refreshMenu();
    await route({ silent: true });
    toast('数据已刷新', 'info', 1600);
  });

  app.querySelector('#userchip').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '退出登录？',
      message: `当前登录：${store.state.user?.name ?? ''}。未结账的订单会保留在账单列表中。`,
      confirmText: '退出',
      danger: true,
    });
    if (ok) logout();
  });

  app.querySelector('#nav').addEventListener('click', (e) => {
    const link = e.target.closest('[data-nav]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.nav);
  });

  startClock();
  updateOpenBadge();
}

/* ------------------------------------------------------------------ 路由 */
function parseHash() {
  const m = location.hash.match(/^#\/([a-z]+)/i);
  const key = m?.[1]?.toLowerCase();
  return key && VIEWS[key] ? key : 'pos';
}

export function navigate(key) {
  if (location.hash === `#/${key}`) return;
  location.hash = `#/${key}`;
}

async function route({ silent = false } = {}) {
  const key = parseHash();
  const view = VIEWS[key];
  const first = currentKey === null;
  currentKey = key;

  if (shell.heading) shell.heading.textContent = view.meta.title;
  if (shell.eyebrow) shell.eyebrow.textContent = view.meta.eyebrow;

  // 侧栏高亮 + 指示器
  app.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === key));
  moveIndicator();

  const html = view.render(ctx);
  const apply = () => {
    shell.view.className = `view${key === 'pos' ? ' view--flush' : ''}`;
    shell.view.innerHTML = html;
  };

  if (!silent && !first && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      const transition = document.startViewTransition(apply);
      await transition.finished;
    } catch {
      apply();
    }
  } else {
    apply();
  }

  shell.view.classList.add('view-enter');
  view.mount?.(shell.view, ctx);
  observeReveal(shell.view);
  hydrateCounters(shell.view);
  moveIndicator();
}

function moveIndicator() {
  const active = app.querySelector('.nav-item.is-active');
  const indicator = shell?.indicator;
  if (!active || !indicator) return;
  indicator.style.transform = `translateY(${active.offsetTop}px)`;
  indicator.style.height = `${active.offsetHeight}px`;
  indicator.classList.add('is-on');
}

window.addEventListener('hashchange', () => route());

/* ------------------------------------------------------------------ 时钟 */
function startClock() {
  clearInterval(clockTimer);
  const tick = () => {
    const now = new Date();
    const clock = document.getElementById('clock');
    const today = document.getElementById('today');
    if (clock) clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (today) today.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · 周${'日一二三四五六'[now.getDay()]}`;
  };
  tick();
  clockTimer = setInterval(tick, 15000);
}

/* ------------------------------------------------------------------ 数据 */
async function refreshMenu() {
  try {
    const menu = await api.menu();
    store.syncMenu(menu);
    return menu;
  } catch (err) {
    if (err.status !== 401) toast('菜单加载失败：' + err.message, 'error');
    throw err;
  }
}

async function loadSettings() {
  try {
    const settings = await api.settings();
    store.set({ settings }, { silent: true });
  } catch {
    /* 忽略 */
  }
}

function refreshBrand() {
  const sub = document.getElementById('brand-sub');
  if (sub) sub.textContent = store.state.settings.store_name || '门店经营台';
}

function updateOpenBadge() {
  const badge = document.getElementById('open-badge');
  if (!badge) return;
  const count = store.state.pendingOrders;
  badge.hidden = !count;
  badge.textContent = count;
}

/* ------------------------------------------------------------- 实时事件 */
function startLive() {
  if (unsubscribeSSE) return;

  const setConn = (state, text) => {
    const el = document.getElementById('conn');
    const label = document.getElementById('conn-text');
    if (!el) return;
    el.classList.toggle('is-live', state === 'live');
    el.classList.toggle('is-off', state === 'off');
    if (label) label.textContent = text;
  };

  unsubscribeSSE = subscribeEvents({
    hello: () => setConn('live', '实时连接正常'),
    'order:created': (order) => {
      store.set({ pendingOrders: store.state.pendingOrders + 1 });
      updateOpenBadge();
      toast(`新订单 ${order.orderNo} · ${money(order.total)}`, 'info', 2600);
    },
    'order:paid': () => {
      store.set({ pendingOrders: Math.max(store.state.pendingOrders - 1, 0) });
      updateOpenBadge();
    },
    'stock:low': (payload) => {
      const names = payload.items.map((i) => i.name).slice(0, 2).join('、');
      toast(`库存预警：${names}${payload.items.length > 2 ? ' 等' : ''} 库存偏低`, 'warn', 4200);
    },
    error: () => setConn('off', '连接已断开'),
  });

  setTimeout(() => {
    if (document.getElementById('conn')?.classList.contains('is-live')) return;
    setConn('off', '实时连接不可用');
  }, 4000);
}

function stopLive() {
  unsubscribeSSE?.();
  unsubscribeSSE = null;
  clearInterval(clockTimer);
}

/* ------------------------------------------------------------------ 退出 */
function logout() {
  stopLive();
  session.clear();
  store.clearCart();
  currentKey = null;
  location.hash = '';
  showLogin();
  toast('已退出登录', 'info', 1800);
}

/* --------------------------------------------------------------- 快捷键 */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const map = { 1: 'pos', 2: 'orders', 3: 'dashboard', 4: 'inventory', 5: 'settings' };
  if (map[e.key]) {
    e.preventDefault();
    navigate(map[e.key]);
  }
});

window.addEventListener('mise:unauthorized', () => {
  if (currentKey === null) return;
  logout();
  toast('登录已过期，请重新登录', 'warn');
});

window.addEventListener('resize', () => moveIndicator());
