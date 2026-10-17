/**
 * login.js —— 登录页
 */
import { api, session } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

export const meta = { title: '登录', eyebrow: 'SIGN IN' };

export function render() {
  return `
  <div class="auth">
    <section class="auth__left">
      <div class="auth__brand">
        <span class="masthead__mark">Mise<i>.</i></span>
        <span class="masthead__sub">轻量门店经营系统</span>
      </div>

      <div class="auth__body">
        <div class="auth__rule">
          <span class="label">EST. 2026 · 静安</span>
        </div>

        <h1 class="auth__title">
          <span class="reveal-line" style="--i:0"><span>把每一天的生意，</span></span>
          <span class="reveal-line" style="--i:1"><span>看得<em>清清楚楚</em>。</span></span>
        </h1>

        <p class="auth__desc">
          点单、收银、库存、经营分析，收在一个界面里。
          数据只存在你自己的机器上，不联网、不上云、不订阅。
        </p>

        <div class="auth__stats">
          <div class="auth__stat">
            <div class="auth__stat-value" data-count="22" data-duration="1100">0</div>
            <div class="auth__stat-label">在售 SKU</div>
          </div>
          <div class="auth__stat">
            <div class="auth__stat-value" data-count="21" data-suffix="" data-duration="1100">0</div>
            <div class="auth__stat-label">天演示数据</div>
          </div>
          <div class="auth__stat">
            <div class="auth__stat-value" data-count="4" data-duration="1100">0</div>
            <div class="auth__stat-label">种支付方式</div>
          </div>
        </div>
      </div>

      <div class="auth__foot">
        <span>© 2026 Mise</span>
        <span>Express · SQLite · Vanilla JS</span>
      </div>
    </section>

    <section class="auth__right">
      <div class="auth__card">
        <h2 class="auth__card-title">登录</h2>
        <p class="auth__card-sub">使用门店账号继续</p>

        <form class="auth__form" id="login-form" novalidate>
          <div class="auth__error" id="login-error">${icon('alert', 13)}<span></span></div>

          <label class="field">
            <span class="field__label">账号</span>
            <input class="input" name="username" autocomplete="username" placeholder="owner" value="owner" required />
          </label>

          <label class="field">
            <span class="field__label">密码</span>
            <input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••" value="123456" required />
          </label>

          <button class="btn btn--primary btn--lg btn--block" type="submit" id="login-submit">
            进入经营台
          </button>
        </form>

        <div class="auth__demo">
          <span>
            演示账号<br />
            <b>owner / 123456</b>　<b>cashier / 123456</b>
          </span>
          <button class="btn btn--sm" id="fill-demo" type="button">填入</button>
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
