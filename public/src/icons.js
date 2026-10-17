/**
 * icons.js —— 内联 SVG 图标（24×24，stroke 风格）。
 * 内联而非字体/雪碧图：零请求、可继承 currentColor、便于动画。
 */
const PATHS = {
  pos: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chart: '<path d="M3 20h18"/><rect x="5" y="11" width="3.4" height="6" rx="1"/><rect x="10.3" y="6" width="3.4" height="11" rx="1"/><rect x="15.6" y="9" width="3.4" height="8" rx="1"/>',
  box: '<path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z"/><path d="M3 8.5 12 14l9-5.5M12 14v7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m4 12.5 5.2 5.2L20 7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  wallet: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-8Z"/><path d="M3 9h18"/><circle cx="16.5" cy="13.5" r="1.2"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.4M18 14.6a6 6 0 0 1 3.2 5.4"/>',
  trend: '<path d="m3 17 5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/>',
  alert: '<path d="M12 3 2.6 20h18.8L12 3Z"/><path d="M12 9v5M12 17.2v.1"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 6.3 6.3L3 9"/><path d="M4 13a8 8 0 0 0 13.7 4.7L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
  chevronLeft: '<path d="m14 6-6 6 6 6"/>',
  chevronRight: '<path d="m10 6 6 6-6 6"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z"/>',
  coffee: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9h2.2a2.8 2.8 0 0 1 0 5.6H17"/><path d="M7 3.5v1.8M11 3v1.8M15 3.5v1.8"/>',
  cup: '<path d="M5 7h12l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7Z"/><path d="M4 4h14"/>',
  leaf: '<path d="M4 20c0-8 5-14 16-15 0 11-5.5 15.5-16 15Z"/><path d="M4 20c2-5 5-8 9-10"/>',
  cake: '<path d="M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6Z"/><path d="M4 16c1.6 1.6 3 1.6 4.5 0s3-1.6 4.5 0 3 1.6 4.5 0 1.5-1 2.5-.6"/><path d="M12 9V6M12 3.5v.1"/>',
  fries: '<path d="M6 10h12l-1 10H7L6 10Z"/><path d="M9 10V5M12 10V3.6M15 10V6"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  sparkles: '<path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9 12 3.5Z"/><path d="M18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.1M18 12h.1"/>',
  wechat: '<path d="M9 4.5c-3.6 0-6.5 2.3-6.5 5.2 0 1.6.9 3.1 2.4 4.1l-.7 2.2 2.5-1.3c.7.2 1.5.3 2.3.3"/><path d="M21.5 14.6c0-2.5-2.4-4.6-5.4-4.6s-5.4 2.1-5.4 4.6 2.4 4.6 5.4 4.6c.7 0 1.4-.1 2-.3l2.1 1.1-.6-1.9c1.2-.9 1.9-2.1 1.9-3.5Z"/>',
  alipay: '<path d="M4 4h16v16H4z" opacity=".0"/><path d="M3.5 5.5h17v13h-17z"/><path d="M7 10h10M12 6.5v7"/><path d="M6.5 16.5c4 0 7.5-2 9-5.5"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  note: '<path d="M5 4h9l5 5v11H5V4Z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  wifi: '<path d="M2.5 9a15 15 0 0 1 19 0M6 12.5a10 10 0 0 1 12 0M9.5 16a5 5 0 0 1 5 0"/><circle cx="12" cy="19" r="1"/>',
};

export function icon(name, size = 18, extra = '') {
  const body = PATHS[name] ?? PATHS.grid;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}
