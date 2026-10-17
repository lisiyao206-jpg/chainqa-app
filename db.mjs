// db.mjs —— 数据库：打开 chainqa.db，第一次运行时自动建表
// 用的是 Node 自带的 SQLite（node:sqlite），不需要安装任何东西

import { DatabaseSync } from "node:sqlite";

// 打开数据库文件；文件不存在就自动创建
export const db = new DatabaseSync("chainqa.db");

// SQLite 默认不检查外键，要手动打开（这样 ON DELETE CASCADE 才会生效）
db.exec("PRAGMA foreign_keys = ON;");

// 建表：IF NOT EXISTS 表示「已经有了就跳过」，所以每次启动都执行也没关系
db.exec(`
-- 用户
CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  account       TEXT NOT NULL UNIQUE,
  pwd           TEXT NOT NULL,                 -- 加密后的密码（盐:哈希），不存明文
  nickname      TEXT,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'user' 普通 / 'admin' 管理员
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' 正常 / 'disabled' 被管理员禁用
  register_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 登录凭证：登录成功后发一个 token，之后每次请求都带着它
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expire_time TEXT NOT NULL
);

-- 登录记录
CREATE TABLE IF NOT EXISTS login_logs (
  log_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  login_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 笔记
CREATE TABLE IF NOT EXISTS notes (
  note_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  chapter_id  TEXT,
  title       TEXT,
  content     TEXT,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  update_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 错题
CREATE TABLE IF NOT EXISTS mistakes (
  mistake_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  analysis    TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',    -- 'todo' 待温习 / 'mastered' 已掌握
  source      TEXT NOT NULL DEFAULT 'manual',  -- 'manual' 自己加 / 'game' 漏洞猎人
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 关卡进度：一个人一关只有一条（联合主键）
CREATE TABLE IF NOT EXISTS game_progress (
  user_id   INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  level_id  INTEGER NOT NULL,
  star      INTEGER NOT NULL DEFAULT 0,        -- star > 0 就是通关
  play_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (user_id, level_id)
);
`);

// 给「已经建好的旧表」补上新加的列。
// CREATE TABLE IF NOT EXISTS 只管「表不存在」的情况，表已经有了就整句跳过，新加的列不会自动出现，
// 所以要用 ALTER TABLE 补；列已经存在时会报错，直接忽略就行
try {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
} catch {}
