/**
 * settings.js —— 门店设置、外观与数据导出。
 */
import { api } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml, toast, confirmDialog } from '../ui.js';

export const meta = { title: '设置', eyebrow: 'SETTINGS' };

let rootEl = null;
let ctxRef = null;

export function render(ctx) {
  ctxRef = ctx;
  const s = ctx.store.state.settings;
  const isOwner = ctx.store.state.user?.role === 'owner';

  return `
  <div class="view__inner">
    <div class="settings-grid">
      <section class="card" data-reveal>
        <header class="card__head">
          <div>
            <div class="card__title">门店资料</div>
            <div class="card__sub">显示在报头与小票上</div>
          </div>
          ${isOwner ? '' : '<span class="badge badge--flat" style="margin-left:auto">只读</span>'}
        </header>
        <div class="card__body">
          <div class="form-row">
            <span class="form-row__label">门店名称</span>
            <input class="input" id="set-name" value="${escapeHtml(s.store_name || '')}" ${isOwner ? '' : 'disabled'} />
          </div>
          <div class="form-row">
            <span class="form-row__label">副标题</span>
            <input class="input" id="set-slogan" value="${escapeHtml(s.store_slogan || '')}" ${isOwner ? '' : 'disabled'} />
          </div>
          <div class="form-row">
            <span class="form-row__label">小票尾语</span>
            <input class="input" id="set-footer" value="${escapeHtml(s.receipt_footer || '')}" ${isOwner ? '' : 'disabled'} />
          </div>
          ${isOwner ? `<div class="row" style="justify-content:flex-end;margin-top:16px">
            <button class="btn btn--primary" id="save-settings">保存修改</button>
          </div>` : ''}
        </div>
      </section>

      <div class="stack" style="gap:14px">
        <section class="card" data-reveal style="--i:1">
          <header class="card__head"><div class="card__title">外观</div></header>
          <div class="card__body">
            <div class="row" style="justify-content:space-between;padding:6px 0">
              <div>
                <div style="font-size:12.5px">深色模式</div>
                <div class="dim" style="font-size:11px">夜间收银更护眼</div>
              </div>
              <button class="switch ${ctx.store.state.theme === 'dark' ? 'is-on' : ''}" id="theme-switch" aria-label="切换主题"></button>
            </div>
          </div>
        </section>

        <section class="card" data-reveal style="--i:2">
          <header class="card__head"><div class="card__title">数据</div></header>
          <div class="card__body stack" style="gap:12px">
            <button class="btn btn--block" id="export-data">${icon('download', 15)} 导出全部账单 CSV</button>
            <button class="btn btn--block btn--danger" id="logout">${icon('logout', 15)} 退出登录</button>
            <p class="dim" style="font-size:11px;line-height:1.7;margin:0">
              所有数据保存在本机 SQLite 文件中，不会上传到任何服务器。
            </p>
          </div>
        </section>
      </div>
    </div>

    <section class="card" data-reveal style="--i:3;margin-top:14px">
      <header class="card__head">
        <div>
          <div class="card__title">关于 Mise</div>
          <div class="card__sub">轻量门店经营系统 · v1.0.0</div>
        </div>
      </header>
      <div class="card__body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px">
          ${[
            ['后端', 'Express 4 · 手写 HMAC JWT · SSE 实时推送'],
            ['数据', 'SQLite (better-sqlite3) · 视图 + 窗口函数'],
            ['前端', '原生 ES Modules · 零构建 · 手写 SVG 图表'],
            ['动效', 'View Transitions · WAAPI · FLIP · 涟漪'],
          ]
            .map(
              ([title, desc]) => `
            <div>
              <div class="dim" style="font-size:10.5px;letter-spacing:.12em;text-transform:uppercase">${title}</div>
              <div style="font-size:12px;margin-top:4px;line-height:1.65">${desc}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </section>
  </div>`;
}

export function mount(root, ctx) {
  rootEl = root;
  ctxRef = ctx;

  root.querySelector('#save-settings')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('btn--loading');
    try {
      const data = await api.saveSettings({
        store_name: root.querySelector('#set-name').value.trim(),
        store_slogan: root.querySelector('#set-slogan').value.trim(),
        receipt_footer: root.querySelector('#set-footer').value.trim(),
      });
      ctx.store.set({ settings: data });
      ctx.refreshBrand?.();
      toast('门店资料已保存', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.classList.remove('btn--loading');
    }
  });

  root.querySelector('#theme-switch').addEventListener('click', (e) => {
    const next = ctx.store.state.theme === 'dark' ? 'light' : 'dark';
    ctx.store.setTheme(next);
    e.currentTarget.classList.toggle('is-on', next === 'dark');
  });

  root.querySelector('#export-data').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('btn--loading');
    try {
      await api.downloadOrdersCsv();
      toast('账单已导出', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.classList.remove('btn--loading');
    }
  });

  root.querySelector('#logout').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '退出登录？',
      message: '当前购物车会被清空，未结账的订单仍保留在账单列表中。',
      confirmText: '退出',
      danger: true,
    });
    if (ok) ctx.logout?.();
  });
}
