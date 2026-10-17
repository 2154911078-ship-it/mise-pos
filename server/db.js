/**
 * db.js —— SQLite 连接、建表与初始化数据。
 *
 * 单文件数据库，无需额外服务；WAL 模式让读写并发更友好。
 */
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { seedDemoOrders } from './demo-data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(resolve(HERE, 'sql/schema.sql'), 'utf8');
const SEED_SQL = readFileSync(resolve(HERE, 'sql/seed.sql'), 'utf8');

const DEFAULT_FILE = process.env.DB_FILE || resolve(HERE, '../data/mise.db');

export function createDb(file = DEFAULT_FILE, { demo = true, users = true } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  seedMenu(db);
  if (users) seedUsers(db);
  if (demo) maybeSeedDemo(db);

  return db;
}

function seedMenu(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (count === 0) db.exec(SEED_SQL);
}

function seedUsers(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)'
  );
  insert.run('owner', hashPassword('123456'), '林店长', 'owner');
  insert.run('cashier', hashPassword('123456'), '小周', 'cashier');
}

function maybeSeedDemo(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'demo_seeded'").get();
  if (count === 0 && flag?.value !== '1') seedDemoOrders(db);
}

let instance = null;

export function getDb() {
  if (!instance) instance = createDb();
  return instance;
}
