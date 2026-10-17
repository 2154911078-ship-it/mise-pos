import { createApp } from './app.js';
import { getDb } from './db.js';

const PORT = Number(process.env.PORT) || 3000;
const db = getDb();
const app = createApp(db);

const server = app.listen(PORT, () => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
  console.log('');
  console.log('  ╭──────────────────────────────────────────────╮');
  console.log('  │   MISE · 门店经营台                          │');
  console.log(`  │   http://localhost:${String(PORT).padEnd(25)}│`);
  console.log(`  │   演示账号 owner / 123456 · 订单 ${String(count).padEnd(14)}│`);
  console.log('  ╰──────────────────────────────────────────────╯');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n  正在关闭服务…');
    app.locals.hub?.close();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 3000).unref();
  });
}
