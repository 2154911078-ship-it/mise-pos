import { Router } from 'express';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { requireAuth } from '../middleware.js';
import { ApiError, asyncHandler } from '../utils.js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export default function authRouter(db) {
  const router = Router();

  const findByUsername = db.prepare(
    'SELECT id, username, password, display_name, role FROM users WHERE username = ?'
  );

  // 账号不存在时也跑一次 scrypt，避免用响应时间判断账号是否存在
  const DUMMY_HASH = hashPassword('mise-dummy-password');

  /** 登录失败计数：同一账号 + 同一来源，5 分钟内 5 次失败就锁一会儿 */
  const attempts = new Map();
  const attemptKey = (req, username) => `${req.ip}|${username}`;

  function isLocked(key) {
    const rec = attempts.get(key);
    if (!rec) return false;
    if (Date.now() - rec.firstAt > WINDOW_MS) {
      attempts.delete(key);
      return false;
    }
    return rec.count >= MAX_ATTEMPTS;
  }

  function recordFailure(key) {
    const rec = attempts.get(key);
    if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
      attempts.set(key, { count: 1, firstAt: Date.now() });
    } else {
      rec.count += 1;
    }
    if (attempts.size > 500) {
      const now = Date.now();
      for (const [k, v] of attempts) if (now - v.firstAt > WINDOW_MS) attempts.delete(k);
    }
  }

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body ?? {};
      if (!username || !password) throw new ApiError(400, 'INVALID_INPUT', '请输入账号和密码');

      const name = String(username).trim();
      const key = attemptKey(req, name);
      if (isLocked(key)) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请 5 分钟后再试');
      }

      const user = findByUsername.get(name);
      // 统一错误文案，避免暴露账号是否存在
      const matched = user
        ? verifyPassword(String(password), user.password)
        : (verifyPassword(String(password), DUMMY_HASH), false);

      if (!matched) {
        recordFailure(key);
        throw new ApiError(401, 'BAD_CREDENTIALS', '账号或密码不正确');
      }

      attempts.delete(key);

      const token = signToken({
        sub: user.id,
        username: user.username,
        name: user.display_name,
        role: user.role,
      });

      res.json({
        ok: true,
        data: {
          token,
          user: { id: user.id, username: user.username, name: user.display_name, role: user.role },
        },
      });
    })
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ ok: true, data: { user: req.user } });
    })
  );

  return router;
}
