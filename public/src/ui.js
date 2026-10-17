/**
 * ui.js —— 通用交互层：提示、弹窗、抽屉、涟漪、光斑、入场观察。
 * 全部基于原生 DOM，不引入框架。
 */
import { icon } from './icons.js';

const layer = () => document.getElementById('layer');
const toastRoot = () => document.getElementById('toasts');

/* ------------------------------------------------------------------ 提示 */
const TOAST_ICON = { success: 'check', error: 'close', info: 'sparkles', warn: 'alert' };

export function toast(message, type = 'success', duration = 3400) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICON[type] ?? 'check', 13)}</span>
    <span>${escapeHtml(message)}</span>
    <span class="toast__bar" style="animation-duration:${duration}ms"></span>
  `;
  toastRoot().append(el);

  const remove = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  return remove;
}

/* ------------------------------------------------------------------ 弹窗 */
let openStack = [];

function closeTop() {
  const top = openStack.pop();
  top?.();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openStack.length) closeTop();
});

function mountOverlay(innerHtml, { onMount, onClose, kind = 'modal' } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const host = document.createElement('div');
  host.className = kind === 'drawer' ? '' : 'modal';
  host.innerHTML = innerHtml;

  layer().append(scrim, host);
  requestAnimationFrame(() => {
    scrim.classList.add('is-in');
    (host.querySelector('.modal__panel') ?? host.querySelector('.drawer'))?.classList.add('is-in');
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scrim.classList.remove('is-in');
    (host.querySelector('.modal__panel') ?? host.querySelector('.drawer'))?.classList.remove('is-in');
    setTimeout(() => {
      scrim.remove();
      host.remove();
    }, 380);
    onClose?.();
  };

  scrim.addEventListener('click', close);
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });

  openStack.push(close);
  onMount?.(host, close);
  return close;
}

export function openDrawer({ title, subtitle = '', body, footer = '', onMount }) {
  return mountOverlay(
    `
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <header class="drawer__head">
        <div class="stack" style="gap:2px;min-width:0">
          <h3 class="card__title" style="font-size:15px">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="card__sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <div class="row" style="margin-left:auto">
          <button class="icon-btn" data-close aria-label="关闭">${icon('close', 16)}</button>
        </div>
      </header>
      <div class="drawer__body">${body}</div>
      ${footer ? `<footer class="drawer__foot">${footer}</footer>` : ''}
    </aside>`,
    { onMount, kind: 'drawer' }
  );
}

export function openModal({ title, subtitle = '', body, footer = '', onMount, width }) {
  return mountOverlay(
    `
    <div class="modal__panel" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}"
         ${width ? `style="width:min(${width}px, 96vw)"` : ''}>
      <header class="modal__head">
        <div class="stack" style="gap:2px">
          <h3 class="card__title" style="font-size:15px">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="card__sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" data-close aria-label="关闭" style="margin-left:auto">${icon('close', 16)}</button>
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
    </div>`,
    { onMount }
  );
}

export function confirmDialog({ title, message, confirmText = '确认', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const close = openModal({
      title,
      body: `<p class="muted" style="font-size:13px;line-height:1.7">${escapeHtml(message)}</p>`,
      footer: `
        <button class="btn btn--ghost" data-close>取消</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${escapeHtml(confirmText)}</button>`,
      onMount(host, closeFn) {
        host.querySelector('[data-confirm]').addEventListener('click', () => {
          finish(true);
          closeFn();
        });
        host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => finish(false)));
      },
      width: 420,
    });
    // 遮罩点击也视为取消
    const scrim = layer().querySelector('.scrim:last-of-type');
    scrim?.addEventListener('click', () => {
      finish(false);
      close();
    });
  });
}

/* -------------------------------------------------------------- 涟漪 */
document.addEventListener('pointerdown', (e) => {
  const target = e.target.closest('.btn, .chip, .pos__cat, .pay-opt');
  if (!target || target.hasAttribute('disabled')) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - rect.left - size / 2}px`;
  span.style.top = `${e.clientY - rect.top - size / 2}px`;
  target.append(span);
  setTimeout(() => span.remove(), 640);
});

/* ------------------------------------------------------------- 入场观察器 */
let observer = null;

export function observeReveal(root = document) {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px' }
    );
  }
  root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => observer.observe(el));
}

/* ------------------------------------------------------------- 数字滚动 */
export function animateNumber(el, target, { duration = 900, decimals = 0, prefix = '', suffix = '' } = {}) {
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const format = (v) =>
    prefix + (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('zh-CN')) + suffix;

  if (reduce) {
    el.textContent = format(target);
    return;
  }

  const from = 0;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function hydrateCounters(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    animateNumber(el, target, {
      decimals,
      prefix: el.dataset.prefix || '',
      suffix: el.dataset.suffix || '',
      duration: Number(el.dataset.duration || 900),
    });
  });
}

/* --------------------------------------------------------------- FLIP */
export function flip(container, mutate) {
  const items = [...container.children];
  const first = new Map(items.map((el) => [el.dataset.flipKey, el.getBoundingClientRect()]));

  mutate();

  for (const el of container.children) {
    const key = el.dataset.flipKey;
    const before = first.get(key);
    if (!before) continue;
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (!dx && !dy) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }
}

/* ------------------------------------------------------------- 转义工具 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export const escapeAttr = escapeHtml;
