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

-- ===== 情报站（好友、聊天、好友圈、文件）=====
-- 好友申请：pending 等待对方同意 / accepted 已同意 / rejected 已拒绝
CREATE TABLE IF NOT EXISTS friend_requests (
  request_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 好友关系：A 和 B 是好友就存两条（A→B、B→A），查「我的好友」时最简单
CREATE TABLE IF NOT EXISTS friends (
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  friend_id   INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (user_id, friend_id)
);

-- 聊天室：type = 'dm' 两个人私聊 / 'group' 讨论组
CREATE TABLE IF NOT EXISTS rooms (
  room_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  name        TEXT,
  owner_id    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 聊天室成员；last_read 是「我读到了哪条消息」，用来算未读数
CREATE TABLE IF NOT EXISTS room_members (
  room_id   INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  last_read INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);

-- 上传的文件：真正的文件存在 uploads/ 文件夹里，这里只记信息
-- file_id 是一串随机字符，别人猜不到
CREATE TABLE IF NOT EXISTS files (
  file_id     TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 聊天消息：文字和文件至少有一个
CREATE TABLE IF NOT EXISTS messages (
  msg_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  file_id     TEXT REFERENCES files(file_id) ON DELETE SET NULL,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 好友圈动态 + 点赞 + 评论
CREATE TABLE IF NOT EXISTS posts (
  post_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  file_id     TEXT REFERENCES files(file_id) ON DELETE SET NULL,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS post_likes (
  post_id INTEGER NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
-- 收藏：收藏和点赞过的帖子，都会出现在「学习站」里
CREATE TABLE IF NOT EXISTS post_favorites (
  post_id     INTEGER NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
  comment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`);

// 给「已经建好的旧表」补上新加的列。
// CREATE TABLE IF NOT EXISTS 只管「表不存在」的情况，表已经有了就整句跳过，新加的列不会自动出现，
// 所以要用 ALTER TABLE 补；列已经存在时会报错，直接忽略就行
try {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
} catch {}
// 头像：'preset:1'~'preset:6' 是系统提供的 6 个头像；'file:文件id' 是自己上传的图片；空着就显示昵称第一个字
try {
  db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
} catch {}
// 帖子分两种：'friends' 好友圈（只有好友能看）/ 'public' 广场帖子（所有人都能看），广场帖子还有标题
try {
  db.exec("ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'");
} catch {}
try {
  db.exec("ALTER TABLE posts ADD COLUMN title TEXT");
} catch {}
// 错题：同一道题错了好几次，不再重复记录，只记「错了几次」
try {
  db.exec("ALTER TABLE mistakes ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 1");
} catch {}
