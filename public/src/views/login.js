/**
 * login.js —— 登录页。
 */
import { api, session } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

export const meta = { title: '登录', eyebrow: 'SIGN IN' };

export function render() {
  return `
  <div class="auth">
    <section class="auth__brand">
      <div class="auth__logo">
        <span class="brand__mark">${icon('coffee', 20)}</span>
        <div class="brand__text">
          <div class="brand__name">MISE</div>
          <div class="brand__sub">轻量门店经营系统</div>
        </div>
      </div>

      <div class="auth__headline">
        <span class="auth__kicker">${icon('sparkles', 13)} 为独立小店而生</span>
        <h1 class="auth__title">把每一天的<br /><em>生意</em>，看得清清楚楚。</h1>
        <p class="auth__desc">
          点单、收银、库存、经营分析，收在一个界面里。
          数据只存在你自己的机器上，不联网、不上云、不订阅。
        </p>
        <div class="auth__stats">
          <div>
            <div class="auth__stat-value" data-count="22" data-duration="1100">0</div>
            <div class="auth__stat-label">在售 SKU</div>
          </div>
          <div>
            <div class="auth__stat-value" data-count="21" data-suffix=" 天" data-duration="1100">0</div>
            <div class="auth__stat-label">演示经营数据</div>
          </div>
          <div>
            <div class="auth__stat-value" data-count="4" data-duration="1100">0</div>
            <div class="auth__stat-label">支付方式</div>
          </div>
        </div>
      </div>

      <div class="auth__foot">
        <span>© 2026 Mise</span>
        <span>·</span>
        <span>Express · SQLite · 原生前端</span>
      </div>
    </section>

    <section class="auth__panel">
      <div class="auth__card">
        <div class="auth__card-head">
          <h2 class="auth__card-title">登录经营台</h2>
          <p class="auth__card-sub">使用门店账号继续</p>
        </div>

        <form class="auth__form" id="login-form" novalidate>
          <div class="auth__error" id="login-error">${icon('alert', 14)}<span></span></div>

          <label class="field">
            <span class="field__label">账号</span>
            <input class="input" name="username" autocomplete="username" placeholder="owner" value="owner" required />
          </label>

          <label class="field">
            <span class="field__label">密码</span>
            <input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••" value="123456" required />
          </label>

          <button class="btn btn--primary btn--lg btn--block" type="submit" id="login-submit">
            进入经营台 ${icon('arrowRight', 16)}
          </button>
        </form>

        <div class="auth__demo">
          <span>演示账号 <b style="color:var(--text-2)">owner / 123456</b>　收银员 cashier / 123456</span>
          <button class="btn btn--sm btn--ghost" id="fill-demo" type="button">填入</button>
        </div>
      </div>
    </section>
  </div>`;
}

export function mount(root, ctx) {
  const form = root.querySelector('#login-form');
  const error = root.querySelector('#login-error');
  const submit = root.querySelector('#login-submit');

  root.querySelector('#fill-demo').addEventListener('click', () => {
    form.username.value = 'owner';
    form.password.value = '123456';
    form.username.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.remove('is-on');
    submit.classList.add('btn--loading');

    try {
      const data = await api.login(form.username.value.trim(), form.password.value);
      session.save(data.token, data.user);
      ctx.onLogin?.(data.user);
    } catch (err) {
      error.querySelector('span').textContent = err.message || '登录失败';
      error.classList.add('is-on');
      // 重新触发抖动动画
      error.style.animation = 'none';
      void error.offsetWidth;
      error.style.animation = '';
    } finally {
      submit.classList.remove('btn--loading');
    }
  });

  form.username.focus();
}

export { escapeHtml };
