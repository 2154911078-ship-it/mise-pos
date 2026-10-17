/**
 * format.js —— 金额 / 日期 / 状态的展示口径，全站唯一出口。
 */

const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 分 → 元（整数显示） */
export const money = (cents, decimals = 0) =>
  `¥${decimals ? nf2.format((cents || 0) / 100) : nf0.format(Math.round((cents || 0) / 100))}`;

/** 分 → 元（两位小数，用于账单） */
export const money2 = (cents) => money(cents, 2);

/** 分 → 紧凑金额：1.8k / 2.6万 */
export function compactMoney(cents) {
  const yuan = (cents || 0) / 100;
  if (Math.abs(yuan) >= 10000) return `¥${(yuan / 10000).toFixed(1)}万`;
  if (Math.abs(yuan) >= 1000) return `¥${(yuan / 1000).toFixed(1)}k`;
  return `¥${Math.round(yuan)}`;
}

export const pct = (n, digits = 0) => `${((n || 0) * 100).toFixed(digits)}%`;

export const signedPct = (n) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

const pad = (n) => String(n).padStart(2, '0');

export function timeHM(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateMD(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function dateTime(iso) {
  if (!iso) return '—';
  return `${dateMD(iso)} ${timeHM(iso)}`;
}

export function dateCN(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayCN(iso) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[new Date(iso).getDay()];
}

export function relative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return `${Math.floor(day / 30)} 个月前`;
}

export const STATUS = {
  open: { text: '待结账', cls: 'badge--open' },
  paid: { text: '已结账', cls: 'badge--paid' },
  void: { text: '已作废', cls: 'badge--void' },
};

export const PAYMENT = {
  cash: { text: '现金', abbr: '现', mark: '▤' },
  wechat: { text: '微信支付', abbr: '微', mark: '◉' },
  alipay: { text: '支付宝', abbr: '支', mark: '◈' },
  card: { text: '银行卡', abbr: '卡', mark: '▭' },
};

/** 收款弹窗里的固定顺序：先扫码，再现金、刷卡 */
export const PAYMENT_LIST = ['wechat', 'alipay', 'cash', 'card'].map((key) => ({ key, ...PAYMENT[key] }));

export const statusMeta = (s) => STATUS[s] ?? { text: s, cls: 'badge--flat' };
export const paymentMeta = (m) => PAYMENT[m] ?? { text: '未支付', abbr: '—', mark: '·' };
