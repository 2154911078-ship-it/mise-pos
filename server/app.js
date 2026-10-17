/**
 * app.js —— 组装 Express 应用（与监听解耦，方便测试注入内存数据库）。
 */
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEventHub } from './events.js';
import { requireAuthStream, errorHandler, notFoundHandler, requestLogger } from './middleware.js';
import authRouter from './routes/auth.js';
import menuRouter from './routes/menu.js';
import ordersRouter from './routes/orders.js';
import settingsRouter from './routes/settings.js';
import statsRouter from './routes/stats.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(HERE, '../public');

export function createApp(db) {
  const app = express();
  const hub = createEventHub();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // ---- 健康检查 ----
  app.get('/api/health', (_req, res) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
    res.json({ ok: true, data: { status: 'up', products: count, uptime: Math.round(process.uptime()) } });
  });

  // ---- 业务路由 ----
  app.use('/api/auth', authRouter(db));
  app.use('/api/menu', menuRouter(db, hub));
  app.use('/api/orders', ordersRouter(db, hub));
  app.use('/api/stats', statsRouter(db));
  app.use('/api/settings', settingsRouter(db));

  // ---- 实时事件流（SSE）----
  app.get('/api/events', requireAuthStream, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ user: req.user.name, clients: hub.size + 1 })}\n\n`);
    hub.add(res);
  });

  // ---- 静态资源 ----
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      etag: true,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.hub = hub;
  app.locals.db = db;
  return app;
}
