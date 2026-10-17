/**
 * charts.js —— 零依赖 SVG 图表。
 *
 * 选择手写 SVG 而不是引入图表库：
 *   · 体积几乎为零，样式完全跟随 CSS 变量（自动适配暗/亮主题）
 *   · 曲线用 Catmull-Rom 转三次贝塞尔，比折线更顺滑
 *   · 动画交给 CSS（stroke-dashoffset / scaleY），不占主线程
 */
import { compactMoney, money, dateMD } from './format.js';

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
        <line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="${t === 0 ? '0' : '2 4'}"/>
        <text x="${pad.l - 10}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--text-3)">${compactMoney(max * t)}</text>`;
    })
    .join('');

  const labelEvery = Math.ceil(points.length / 7);
  const xLabels = points
    .map((p, i) =>
      i % labelEvery === 0 || i === points.length - 1
        ? `<text x="${coords[i].x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-3)">${dateMD(p.day + 'T00:00:00')}</text>`
        : ''
    )
    .join('');

  const hover = coords
    .map(
      (c) => `
      <g class="chart-pt">
        <rect x="${c.x - stepX / 2}" y="${pad.t}" width="${Math.max(stepX, 10)}" height="${plotH}" fill="transparent"/>
        <line x1="${c.x}" y1="${pad.t}" x2="${c.x}" y2="${pad.t + plotH}" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 3" class="chart-cross"/>
        <circle cx="${c.x}" cy="${c.y}" r="3" fill="var(--brand)" class="chart-dot"/>
        <g class="chart-tip" transform="translate(${c.x},${Math.max(c.y - 12, 34)})">
          <rect x="-46" y="-32" width="92" height="28" fill="var(--bg)" stroke="var(--line-2)"/>
          <text x="0" y="-18" text-anchor="middle" font-size="10" fill="var(--ink)">${money(c.revenue)}</text>
          <text x="0" y="-8" text-anchor="middle" font-size="8.5" fill="var(--text-3)">${c.orders} 单</text>
        </g>
      </g>`
    )
    .join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart__svg" role="img" aria-label="营收趋势图">
      <defs>
        <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.13"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#${id}-fill)" class="chart__area"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" class="chart__line"/>
      ${xLabels}
      ${hover}
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

