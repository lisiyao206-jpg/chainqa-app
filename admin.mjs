// admin.mjs —— 管理员后台用到的查询和操作
// 只有管理员能调用：权限在 server.mjs 的 withUser(..., { admin: true }) 里检查

import { db } from "./db.mjs";
import { hashPassword } from "./auth.mjs";

const toISO = (t) => (t ? t.replace(" ", "T") : t);

// ===== 用户列表（可以按账号或昵称搜索）=====
// 每个用户顺便统计：最近登录时间、登录次数、笔记数、错题数、通关数
// 括号里的 SELECT 叫「子查询」：对每一个用户，再去别的表里数一数
export function listUsers(keyword = "") {
  const like = `%${keyword.trim()}%`; // LIKE '%abc%' 表示「包含 abc」
  return db
    .prepare(`
      SELECT u.user_id, u.account, u.nickname, u.role, u.status, u.register_time,
        (SELECT MAX(login_time) FROM login_logs WHERE user_id = u.user_id) AS last_login,
        (SELECT COUNT(*) FROM login_logs WHERE user_id = u.user_id) AS login_count,
        (SELECT COUNT(*) FROM notes WHERE user_id = u.user_id) AS note_count,
        (SELECT COUNT(*) FROM mistakes WHERE user_id = u.user_id) AS mistake_count,
        (SELECT COUNT(*) FROM game_progress WHERE user_id = u.user_id AND star > 0) AS cleared_count
      FROM users u
      WHERE u.account LIKE ? OR u.nickname LIKE ?
      ORDER BY u.user_id DESC`)
    .all(like, like)
    .map((r) => ({
      userId: r.user_id, account: r.account, nickname: r.nickname, role: r.role, status: r.status,
      registerTime: toISO(r.register_time), lastLogin: toISO(r.last_login),
      loginCount: r.login_count, noteCount: r.note_count, mistakeCount: r.mistake_count, clearedCount: r.cleared_count,
    }));
}

// ===== 登录记录：最近 200 条，JOIN 上 users 表拿到账号和昵称 =====
export function listLogins() {
  return db
    .prepare(`
      SELECT l.log_id, l.login_time, u.user_id, u.account, u.nickname
      FROM login_logs l JOIN users u ON l.user_id = u.user_id
      ORDER BY l.log_id DESC LIMIT 200`)
    .all()
    .map((r) => ({ id: r.log_id, time: toISO(r.login_time), userId: r.user_id, account: r.account, nickname: r.nickname }));
}

// ===== 某个用户的详情：通关情况 + 错题 =====
export function userDetail(id) {
  const u = db.prepare("SELECT user_id, account, nickname FROM users WHERE user_id = ?").get(id);
  if (!u) throw new Error("没有这个用户");
  const progress = db
    .prepare("SELECT level_id, star, play_time FROM game_progress WHERE user_id = ? ORDER BY level_id")
    .all(id)
    .map((r) => ({ levelId: r.level_id, star: r.star, time: toISO(r.play_time) }));
  const mistakes = db
    .prepare("SELECT question, status, source, create_time FROM mistakes WHERE user_id = ? ORDER BY create_time DESC")
    .all(id)
    .map((r) => ({ question: r.question, status: r.status, source: r.source, time: toISO(r.create_time) }));
  return { userId: u.user_id, account: u.account, nickname: u.nickname, progress, mistakes };
}

// ===== 新增用户（管理员直接开账号，比如给评委、老师开演示账号）=====
export function createUser({ account, pwd, nickname, role }) {
  account = String(account || "").trim();
  pwd = String(pwd || "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(account)) throw new Error("账号要 3~20 位，只能用字母、数字、下划线");
  if (pwd.length < 6) throw new Error("密码至少 6 位");
  if (db.prepare("SELECT 1 FROM users WHERE account = ?").get(account)) throw new Error("这个账号已经被注册了");
  nickname = String(nickname || account).trim().slice(0, 12) || account;
  role = role === "admin" ? "admin" : "user";
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (account, pwd, nickname, role) VALUES (?, ?, ?, ?)")
    .run(account, hashPassword(pwd), nickname, role);
  return { userId: Number(lastInsertRowid) };
}

// ===== 编辑用户：改昵称、改身份、重置密码（都是可选的，传了哪个改哪个）=====
export function updateUser(adminId, id, { nickname, role, pwd }) {
  if (!db.prepare("SELECT 1 FROM users WHERE user_id = ?").get(id)) throw new Error("没有这个用户");
  if (nickname !== undefined) {
    nickname = String(nickname).trim();
    if (!nickname || nickname.length > 12) throw new Error("昵称要 1~12 个字");
    db.prepare("UPDATE users SET nickname = ? WHERE user_id = ?").run(nickname, id);
  }
  if (role !== undefined) {
    if (!["user", "admin"].includes(role)) throw new Error("身份只能是 user 或 admin");
    if (id === adminId && role !== "admin") throw new Error("不能取消自己的管理员身份");
    db.prepare("UPDATE users SET role = ? WHERE user_id = ?").run(role, id);
  }
  if (pwd) {
    if (String(pwd).length < 6) throw new Error("密码至少 6 位");
    db.prepare("UPDATE users SET pwd = ? WHERE user_id = ?").run(hashPassword(String(pwd)), id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id); // 重置密码后，旧的登录全部失效
  }
}

// ===== 禁用 / 恢复账号 =====
export function setUserStatus(adminId, id, status) {
  if (!["active", "disabled"].includes(status)) throw new Error("状态只能是 active 或 disabled");
  if (id === adminId) throw new Error("不能禁用自己");
  db.prepare("UPDATE users SET status = ? WHERE user_id = ?").run(status, id);
  // 禁用时把他的登录凭证全部删掉，正在用的网页下一次请求就会被踢下线
  if (status === "disabled") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
}

// ===== 删除账号 =====
// 因为其他表的外键都写了 ON DELETE CASCADE，删掉用户时，他的笔记、错题、进度、登录记录会一起被删掉
export function deleteUser(adminId, id) {
  if (id === adminId) throw new Error("不能删除自己");
  db.prepare("DELETE FROM users WHERE user_id = ?").run(id);
}
