/**
 * utils.js —— 服务端通用工具。
 */

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code = 'BAD_REQUEST') => new ApiError(400, code, msg);
export const notFound = (msg = '资源不存在') => new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg, code = 'CONFLICT') => new ApiError(409, code, msg);

/** 包装 async 路由，把 rejection 交给统一错误中间件 */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 生成当日流水号：20261017-001 */
export function nextOrderNo(db, date = new Date()) {
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  const row = db
    .prepare(`SELECT MAX(CAST(substr(order_no, -3) AS INTEGER)) AS seq FROM orders WHERE order_no LIKE ?`)
    .get(`${ymd}-%`);
  return `${ymd}-${String((row?.seq ?? 0) + 1).padStart(3, '0')}`;
}

/** 把 DB 的 ISO 字符串原样返回；空值统一为 null */
export const iso = (value) => value || null;

/** 解析分页参数 */
export function pagination(query, defaults = { limit: 20, max: 100 }) {
  const limit = Math.min(Math.max(Number(query.limit) || defaults.limit, 1), defaults.max);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

/** 简易确定性伪随机，保证演示数据每次生成一致、便于截图对比 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
