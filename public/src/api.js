/**
 * api.js —— 后端接口封装。
 * 统一处理令牌、错误信封与 401 失效跳转。
 */

const TOKEN_KEY = 'mise.token';
const USER_KEY = 'mise.user';

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, query, raw = false } = {}) {
  const url = new URL(path, location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
  }

  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = session.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('NETWORK', '网络连接失败，请检查服务是否在运行', 0);
  }

  if (res.status === 401 && !path.includes('/auth/login')) {
    session.clear();
    window.dispatchEvent(new CustomEvent('mise:unauthorized'));
    throw new ApiError('UNAUTHORIZED', '登录已失效', 401);
  }

  if (raw) return res;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }

  if (!res.ok || !payload?.ok) {
    throw new ApiError(
      payload?.error?.code || 'ERROR',
      payload?.error?.message || `请求失败 (${res.status})`,
      res.status
    );
  }

  return payload.data;
}

export const api = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),

  menu: () => request('/api/menu'),
  updateProduct: (id, patch) => request(`/api/menu/products/${id}`, { method: 'PATCH', body: patch }),
  restock: (id, qty) => request(`/api/menu/products/${id}/restock`, { method: 'POST', body: { qty } }),

  createOrder: (payload) => request('/api/orders', { method: 'POST', body: payload }),
  listOrders: (query) => request('/api/orders', { query }),
  getOrder: (id) => request(`/api/orders/${id}`),
  payOrder: (id, paymentMethod, discountCents) =>
    request(`/api/orders/${id}/pay`, { method: 'POST', body: { paymentMethod, discountCents } }),
  voidOrder: (id) => request(`/api/orders/${id}/void`, { method: 'POST' }),

  overview: () => request('/api/stats/overview'),
  series: (days = 14) => request('/api/stats/series', { query: { days } }),
  topProducts: (days = 30) => request('/api/stats/top', { query: { days } }),
  categories: (days = 30) => request('/api/stats/categories', { query: { days } }),
  hourly: (days = 7) => request('/api/stats/hourly', { query: { days } }),
  payments: (days = 30) => request('/api/stats/payments', { query: { days } }),

  settings: () => request('/api/settings'),
  saveSettings: (patch) => request('/api/settings', { method: 'PUT', body: patch }),

  /** 导出 CSV：带上当前筛选条件，导出「看到的」而不是「全部的」 */
  async downloadOrdersCsv(query = {}) {
    const res = await request('/api/orders/export.csv', { query, raw: true });
    if (!res.ok) throw new ApiError('EXPORT_FAILED', '导出失败，请稍后重试', res.status);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mise-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/** SSE 订阅：返回取消函数 */
export function subscribeEvents(handlers = {}) {
  const token = session.token;
  if (!token) return () => {};

  const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  const bind = (name) => source.addEventListener(name, (evt) => {
    try {
      handlers[name]?.(JSON.parse(evt.data));
    } catch {
      /* 忽略坏包 */
    }
  });

  ['hello', 'order:created', 'order:paid', 'order:void', 'stock:low', 'stock:updated', 'product:updated'].forEach(bind);
  source.onerror = () => handlers.error?.();

  return () => source.close();
}
