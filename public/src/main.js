/**
 * main.js —— 应用入口。
 * 外壳结构：横向报头（masthead）+ 版面（view）+ 状态栏（statusbar）。
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
  { key: 'pos', label: '点单', no: '01' },
  { key: 'orders', label: '账单', no: '02' },
  { key: 'dashboard', label: '看板', no: '03' },
  { key: 'inventory', label: '库存', no: '04' },
  { key: 'settings', label: '设置', no: '05' },
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
  syncPending();
}

/* ------------------------------------------------------------------ 外壳 */
function renderShell() {
  const settings = store.state.settings;
  const user = store.state.user;

  app.className = 'app';
  app.innerHTML = `
    <header class="masthead">
      <a class="masthead__brand" href="#/pos">
        <span class="masthead__mark">Mise<i>.</i></span>
        <span class="masthead__sub" id="brand-sub">${settings.store_name || '门店经营台'}</span>
      </a>

      <nav class="masthead__nav" id="nav" aria-label="主导航">
        ${NAV.map(
          (item) => `
          <a class="mnav" href="#/${item.key}" data-nav="${item.key}">
            <span class="mnav__no">${item.no}</span>${item.label}
            ${item.key === 'orders' ? '<span class="mnav__badge" id="open-badge" hidden>0</span>' : ''}
          </a>`
        ).join('')}
      </nav>

      <div class="masthead__meta">
        <div class="masthead__clock">
          <span class="masthead__time" id="clock">--:--</span>
          <span class="masthead__date" id="today">—</span>
        </div>
        <div class="masthead__actions">
          <button class="ghost-btn" id="theme-btn" title="切换主题">${icon(store.state.theme === 'dark' ? 'sun' : 'moon', 16)}</button>
          <button class="ghost-btn" id="refresh-btn" title="刷新数据">${icon('refresh', 16)}</button>
        </div>
        <button class="masthead__user" id="userchip" title="退出登录">
          <span class="avatar">${(user?.name || 'U').slice(0, 1)}</span>
          <span>${user?.name || '未知'}</span>
        </button>
      </div>
    </header>

    <main class="main">
      <div class="view" id="view"></div>
    </main>

    <footer class="statusbar" id="statusbar">
      <span class="statusbar__item"><i class="statusbar__dot"></i><span id="conn-text">连接中</span></span>
      <span class="statusbar__item" id="status-orders">待结账 0</span>
      <span class="statusbar__item">SQLite · WAL</span>
      <span class="statusbar__spacer"></span>
      <span class="statusbar__item">${settings.store_slogan || '现磨手冲 · 每日新鲜烘焙'}</span>
      <span class="statusbar__item"><kbd>1</kbd>–<kbd>5</kbd> 切换</span>
    </footer>`;

  shell = { view: app.querySelector('#view') };

  app.querySelector('#theme-btn').addEventListener('click', () => {
    const next = store.state.theme === 'dark' ? 'light' : 'dark';
    store.setTheme(next);
    app.querySelector('#theme-btn').innerHTML = icon(next === 'dark' ? 'sun' : 'moon', 16);
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

  app.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === key));

  const head =
    key === 'pos'
      ? ''
      : `<div class="page-head">
           <span class="page-head__no">${NAV.find((n) => n.key === key)?.no ?? '00'}</span>
           <h1 class="page-head__title">${view.meta.title}</h1>
           <span class="page-head__eyebrow">${view.meta.eyebrow}</span>
         </div>`;

  const html = view.render(ctx);
  const apply = () => {
    shell.view.className = `view${key === 'pos' ? ' view--flush' : ''}`;
    shell.view.innerHTML = head + html;
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
    if (today) {
      today.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} 周${'日一二三四五六'[now.getDay()]}`;
    }
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
  const status = document.getElementById('status-orders');
  const count = store.state.pendingOrders;
  if (badge) {
    badge.hidden = !count;
    badge.textContent = count;
  }
  if (status) status.textContent = `待结账 ${count}`;
}

/** 待结账数以后端为准：多终端同时收银时，本地自增会漂移 */
let pendingTimer = null;
function syncPending() {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(async () => {
    try {
      const { openOrders } = await api.overview();
      store.set({ pendingOrders: openOrders }, { silent: true });
      updateOpenBadge();
    } catch {
      /* 离线时忽略 */
    }
  }, 260);
}

/** 改价 / 补货来自别的终端时，重拉菜单并让当前页重绘 */
let menuTimer = null;
function syncMenuSoon() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(async () => {
    await refreshMenu().catch(() => {});
    if (currentKey === 'pos' || currentKey === 'inventory') await route({ silent: true });
  }, 220);
}

/* ------------------------------------------------------------- 实时事件 */
function startLive() {
  if (unsubscribeSSE) return;

  const setConn = (state, text) => {
    const bar = document.getElementById('statusbar');
    const label = document.getElementById('conn-text');
    if (!bar) return;
    bar.classList.toggle('is-live', state === 'live');
    bar.classList.toggle('is-off', state === 'off');
    if (label) label.textContent = text;
  };

  unsubscribeSSE = subscribeEvents({
    hello: () => setConn('live', '实时连接'),
    'order:created': (order) => {
      syncPending();
      toast(`新订单 ${order.orderNo} · ${money(order.total)}`, 'info', 2600);
    },
    'order:paid': () => syncPending(),
    'order:void': () => syncPending(),
    'product:updated': () => syncMenuSoon(),
    'stock:updated': () => syncMenuSoon(),
    'stock:low': (payload) => {
      const names = payload.items.map((i) => i.name).slice(0, 2).join('、');
      toast(`库存预警：${names}${payload.items.length > 2 ? ' 等' : ''}`, 'warn', 4200);
      syncMenuSoon();
    },
    error: () => setConn('off', '连接断开'),
  });

  setTimeout(() => {
    if (document.getElementById('statusbar')?.classList.contains('is-live')) return;
    setConn('off', '离线');
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
  store.set({ pendingOrders: 0 }, { silent: true });
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

// 设置页切主题时，报头那颗按钮也要跟着换图标
window.addEventListener('mise:theme', (e) => {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = icon(e.detail === 'dark' ? 'sun' : 'moon', 16);
});
