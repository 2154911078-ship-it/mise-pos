/**
 * charts.js —— 零依赖 SVG 图表。
 *
 * 选择手写 SVG 而不是引入图表库：
 *   · 体积几乎为零，样式完全跟随 CSS 变量（自动适配暗/亮主题）
 *   · 曲线用 Catmull-Rom 转三次贝塞尔，比折线更顺滑
 *   · 动画交给 CSS（stroke-dashoffset / scaleY），不占主线程
 */
import { compactMoney, money, dateMD } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

/* --------------------------------------------------------------- 面积图 */
export function areaChart(points, { height = 250, color = 'var(--brand)', id = 'area' } = {}) {
  const W = 760;
  const H = height;
  const pad = { l: 46, r: 14, t: 18, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const values = points.map((p) => p.revenue);
  const max = niceMax(Math.max(...values, 1));
  const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const coords = points.map((p, i) => ({
    x: pad.l + i * stepX,
    y: pad.t + plotH - (p.revenue / max) * plotH,
    ...p,
  }));

  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L ${coords.at(-1).x} ${pad.t + plotH} L ${coords[0].x} ${pad.t + plotH} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = pad.t + plotH - t * plotH;
      return `
        <line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="${t === 0 ? '0' : '3 5'}"/>
        <text x="${pad.l - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)">${compactMoney(max * t)}</text>`;
    })
    .join('');

  const labelEvery = Math.ceil(points.length / 7);
  const xLabels = points
    .map((p, i) =>
      i % labelEvery === 0 || i === points.length - 1
        ? `<text x="${coords[i].x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text-3)">${dateMD(p.day + 'T00:00:00')}</text>`
        : ''
    )
    .join('');

  const hover = coords
    .map(
      (c, i) => `
      <g class="chart-pt">
        <rect x="${c.x - stepX / 2}" y="${pad.t}" width="${Math.max(stepX, 10)}" height="${plotH}" fill="transparent"/>
        <line x1="${c.x}" y1="${pad.t}" x2="${c.x}" y2="${pad.t + plotH}" stroke="var(--line-strong)" stroke-width="1" class="chart-cross"/>
        <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="var(--panel)" stroke-width="2" class="chart-dot"/>
        <g class="chart-tip" transform="translate(${c.x},${Math.max(c.y - 12, 30)})">
          <rect x="-46" y="-32" width="92" height="28" rx="8" fill="var(--panel-3)" stroke="var(--line-strong)"/>
          <text x="0" y="-17" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--text)">${money(c.revenue)}</text>
          <text x="0" y="-6" text-anchor="middle" font-size="9" fill="var(--text-3)">${c.orders} 单</text>
        </g>
      </g>`
    )
    .join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart__svg" role="img" aria-label="营收趋势图">
      <defs>
        <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${id}-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
          <stop offset="55%" stop-color="${color}"/>
          <stop offset="100%" stop-color="var(--mint)"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#${id}-fill)" class="chart__area"/>
      <path d="${linePath}" fill="none" stroke="url(#${id}-line)" stroke-width="2.4" stroke-linecap="round" class="chart__line"/>
      ${xLabels}
      ${hover}
    </svg>`;
}

/* --------------------------------------------------------------- 环形图 */
export function donutChart(items, { size = 132, total } = {}) {
  const r = 52;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const sum = total || items.reduce((acc, i) => acc + i.revenue, 0) || 1;

  let offset = 0;
  const segments = items
    .map((item) => {
      const len = (item.revenue / sum) * circumference;
      const dash = `${Math.max(len - 2.5, 0)} ${circumference - Math.max(len - 2.5, 0)}`;
      const seg = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${item.color}" stroke-width="13"
                stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" stroke-linecap="round"
                class="donut__seg" style="--seg-len:${len}">
          <title>${item.name} · ${money(item.revenue)}</title>
        </circle>`;
      offset += len;
      return seg;
    })
    .join('');

  return `
    <svg class="donut__svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="品类占比">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--panel-3)" stroke-width="13"/>
      ${segments}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut__value">${compactMoney(sum)}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut__center">30 天营收</text>
    </svg>`;
}

/* -------------------------------------------------------------- 迷你线 */
export function sparkline(points, { width = 96, height = 30, color = 'var(--mint)' } = {}) {
  const values = points.map((p) => p.revenue ?? p);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);

  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ------------------------------------------------------------- 辅助函数 */
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function niceMax(value) {
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * base;
}

export { NS };
