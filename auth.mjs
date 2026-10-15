// auth.mjs —— 注册、登录、退出、认人
// 密码用 scrypt 加密（Node 自带 crypto），数据库里只存「盐:哈希」，看不到原密码

import crypto from "node:crypto";
import { db } from "./db.mjs";

const SESSION_DAYS = 7; // 登录一次，7 天内不用重新登录

// ===== 密码加密 =====
// 「盐」是一段随机字符串：同样的密码，加不同的盐，算出来的哈希也不同，
// 这样就算两个人密码一样，数据库里存的也不一样，更难被破解
function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pwd, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// 登录时：用存下来的盐，把用户输入的密码再算一遍，看结果是不是一样
function checkPassword(pwd, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pwd, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

// 只把这些字段给前端，绝不返回密码
function publicUser(u) {
  return { userId: u.user_id, account: u.account, nickname: u.nickname, role: u.role };
}

// ===== 注册 =====
export function register(account, pwd, nickname) {
  account = String(account || "").trim();
  pwd = String(pwd || "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(account)) throw new Error("账号要 3~20 位，只能用字母、数字、下划线");
  if (pwd.length < 6) throw new Error("密码至少 6 位");

  const exists = db.prepare("SELECT 1 FROM users WHERE account = ?").get(account);
  if (exists) throw new Error("这个账号已经被注册了");

  // .env 里写的 ADMIN_ACCOUNT 注册时自动成为管理员（只有开发者知道）
  const role = account === process.env.ADMIN_ACCOUNT ? "admin" : "user";
  db.prepare("INSERT INTO users (account, pwd, nickname, role) VALUES (?, ?, ?, ?)")
    .run(account, hashPassword(pwd), String(nickname || account).trim(), role);
  return login(account, pwd);
}

// ===== 登录：成功后发一个 token，并记一条登录日志 =====
export function login(account, pwd) {
  const u = db.prepare("SELECT * FROM users WHERE account = ?").get(String(account || "").trim());
  // 账号不存在和密码错误给同一个提示，不让别人试出哪些账号存在
  if (!u || !checkPassword(String(pwd || ""), u.pwd)) throw new Error("账号或密码错误");

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(`INSERT INTO sessions (token, user_id, expire_time)
              VALUES (?, ?, datetime('now', 'localtime', '+${SESSION_DAYS} days'))`).run(token, u.user_id);
  db.prepare("INSERT INTO login_logs (user_id) VALUES (?)").run(u.user_id);
  return { token, user: publicUser(u) };
}

// ===== 认人：根据 token 找到是谁（过期的不算）=====
export function userFromToken(token) {
  if (!token) return null;
  const u = db.prepare(`SELECT users.* FROM sessions JOIN users USING (user_id)
                        WHERE token = ? AND expire_time > datetime('now', 'localtime')`).get(token);
  return u ? publicUser(u) : null;
}

// ===== 退出：删掉这个 token =====
export function logout(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
