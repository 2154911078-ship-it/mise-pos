import { Router } from 'express';
import { signToken, verifyPassword } from '../auth.js';
import { requireAuth } from '../middleware.js';
import { ApiError, asyncHandler } from '../utils.js';

export default function authRouter(db) {
  const router = Router();

  const findByUsername = db.prepare(
    'SELECT id, username, password, display_name, role FROM users WHERE username = ?'
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body ?? {};
      if (!username || !password) throw new ApiError(400, 'INVALID_INPUT', '请输入账号和密码');

      const user = findByUsername.get(String(username).trim());
      // 统一错误文案，避免暴露账号是否存在
      if (!user || !verifyPassword(String(password), user.password)) {
        throw new ApiError(401, 'BAD_CREDENTIALS', '账号或密码不正确');
      }

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
