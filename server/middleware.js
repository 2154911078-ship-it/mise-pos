/**
 * middleware.js —— 鉴权、日志、统一错误处理。
 */
import { verifyToken } from './auth.js';
import { ApiError } from './utils.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  // SSE 无法自定义请求头，允许通过 query 传递令牌
  const token = bearer || req.query.token;

  const payload = verifyToken(token);
  if (!payload) return next(new ApiError(401, 'UNAUTHORIZED', '登录已失效，请重新登录'));

  req.user = { id: payload.sub, username: payload.username, name: payload.name, role: payload.role };
  next();
}

export function requireOwner(req, _res, next) {
  if (req.user?.role !== 'owner') {
    return next(new ApiError(403, 'FORBIDDEN', '需要店长权限'));
  }
  next();
}

export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `  ${String(res.statusCode).padEnd(3)} ${req.method.padEnd(6)} ${req.originalUrl.padEnd(34)} ${ms.toFixed(1)}ms`
      );
    }
  });
  next();
}

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.path}` } });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: { code: 'BAD_JSON', message: '请求体不是合法 JSON' } });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '服务器开小差了，请稍后重试' } });
}
