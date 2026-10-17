/**
 * 删除本地数据库并重新初始化（会重新生成 21 天演示订单）。
 *
 *   npm run db:reset
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || resolve(HERE, '../data/mise.db');

for (const suffix of ['', '-wal', '-shm']) {
  const target = `${file}${suffix}`;
  if (existsSync(target)) {
    rmSync(target);
    console.log(`  已删除 ${target}`);
  }
}

const { getDb } = await import('../server/db.js');
const db = getDb();
const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
const products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
db.close();

console.log(`\n  重建完成：${products} 个商品，${orders} 笔订单`);
console.log('  现在可以 npm start 了\n');
