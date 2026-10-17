import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware.js';
import { asyncHandler, badRequest } from '../utils.js';

const EDITABLE = new Set(['store_name', 'store_slogan', 'receipt_footer']);

export default function settingsRouter(db) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      res.json({ ok: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
    })
  );

  router.put(
    '/',
    requireOwner,
    asyncHandler(async (req, res) => {
      const patch = req.body ?? {};
      const entries = Object.entries(patch).filter(([k]) => EDITABLE.has(k));
      if (!entries.length) throw badRequest('没有可更新的配置项');

      const upsert = db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );
      const tx = db.transaction(() => {
        for (const [key, value] of entries) upsert.run(key, String(value).slice(0, 120));
      });
      tx();

      const rows = db.prepare('SELECT key, value FROM settings').all();
      res.json({ ok: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
    })
  );

  return router;
}
