// auth.mjs —— 注册、登录、退出、认人
// 密码用 scrypt 加密（Node 自带 crypto），数据库里只存「盐:哈希」，看不到原密码

import crypto from "node:crypto";
import { db } from "./db.mjs";
import { moderate } from "./safety.mjs";

const SESSION_DAYS = 7; // 登录一次，7 天内不用重新登录

// 每次启动后端时：把 .env 里 ADMIN_ACCOUNT 写的那个账号设为管理员
// 这样「先注册、后来才在 .env 里写」也没关系，改完 .env 重启后端就生效
if (process.env.ADMIN_ACCOUNT) {
  db.prepare("UPDATE users SET role = 'admin' WHERE account = ?").run(process.env.ADMIN_ACCOUNT.trim());
}

// ===== 密码加密 =====
// 「盐」是一段随机字符串：同样的密码，加不同的盐，算出来的哈希也不同，
// 这样就算两个人密码一样，数据库里存的也不一样，更难被破解
export function hashPassword(pwd) {
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
  return { userId: u.user_id, account: u.account, nickname: u.nickname, role: u.role, avatar: u.avatar || null };
}

// ===== 官方发号：账号由系统分配，是一个不重复的 6 位数字 =====
// 以前让用户自己起账号，很多人把昵称当成账号填，登录时又记不清。
// 现在注册只填昵称和密码，系统随机发一个 100000~999999 之间、还没人用过的号码（像 QQ 号）
export function newAccountNo() {
  const used = db.prepare("SELECT 1 FROM users WHERE account = ?");
  for (let i = 0; i < 100; i++) {
    const no = String(crypto.randomInt(100000, 1000000));
    if (!used.get(no)) return no;
  }
  // 6 位数快用完了（几十万用户之后）：改发 7 位
  for (;;) {
    const no = String(crypto.randomInt(1000000, 10000000));
    if (!used.get(no)) return no;
  }
}

// ===== 注册 =====
export function register(pwd, nickname) {
  pwd = String(pwd || "");
  nickname = moderate(String(nickname || "").trim()); // 昵称公开显示，也要过内容过滤
  if (!nickname || nickname.length > 12) throw new Error("昵称要 1~12 个字");
  if (pwd.length < 6) throw new Error("密码至少 6 位");

  const account = newAccountNo();
  // .env 里写的 ADMIN_ACCOUNT 对应的账号是管理员（只有开发者知道）
  const role = account === process.env.ADMIN_ACCOUNT ? "admin" : "user";
  db.prepare("INSERT INTO users (account, pwd, nickname, role) VALUES (?, ?, ?, ?)")
    .run(account, hashPassword(pwd), nickname, role);
  return login(account, pwd); // 返回的 user 里带着新账号，前端会大字显示给用户记下
}

// ===== 登录：成功后发一个 token，并记一条登录日志 =====
// account 可以填账号，也可以填绑定过的手机号（11 位，和 6 位账号不会撞）
export function login(account, pwd) {
  account = String(account || "").trim();
  const u = db.prepare("SELECT * FROM users WHERE account = ? OR phone = ?").get(account, account);
  // 常见的错：把昵称当成账号来登录。昵称本来就是公开显示的，提示出来不会泄露什么
  if (!u && db.prepare("SELECT 1 FROM users WHERE nickname = ?").get(account))
    throw new Error(`「${account}」是昵称，不是账号。请用注册时系统分配的 6 位数字账号登录`);
  // 账号不存在和密码错误给同一个提示，不让别人试出哪些账号存在
  if (!u || !checkPassword(String(pwd || ""), u.pwd)) throw new Error("账号或密码错误");
  return issueSession(u);
}

// 发登录凭证：密码登录、验证码登录最后都走这里
export function issueSession(u) {
  if (u.status === "disabled") throw new Error("这个账号已被管理员禁用");
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(`INSERT INTO sessions (token, user_id, expire_time)
              VALUES (?, ?, datetime('now', 'localtime', '+${SESSION_DAYS} days'))`).run(token, u.user_id);
  db.prepare("INSERT INTO login_logs (user_id) VALUES (?)").run(u.user_id);
  return { token, user: publicUser(u) };
}

// ===== 认人：根据 token 找到是谁（过期的、被禁用的都不算）=====
export function userFromToken(token) {
  if (!token) return null;
  const u = db.prepare(`SELECT users.* FROM sessions JOIN users USING (user_id)
                        WHERE token = ? AND expire_time > datetime('now', 'localtime')
                          AND users.status = 'active'`).get(token);
  return u ? publicUser(u) : null;
}

// ===== 个人资料：基本信息 + 学习统计 =====
export function getProfile(userId) {
  const u = db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId);
  const count = (sql) => db.prepare(sql).get(userId).n;
  return {
    ...publicUser(u),
    phone: u.phone ? u.phone.slice(0, 3) + "****" + u.phone.slice(7) : null, // 手机号只显示前 3 位和后 4 位
    registerTime: u.register_time.replace(" ", "T"),
    loginCount: count("SELECT COUNT(*) AS n FROM login_logs WHERE user_id = ?"),
    noteCount: count("SELECT COUNT(*) AS n FROM notes WHERE user_id = ?"),
    mistakeCount: count("SELECT COUNT(*) AS n FROM mistakes WHERE user_id = ?"),
    clearedCount: count("SELECT COUNT(*) AS n FROM game_progress WHERE user_id = ? AND star > 0"),
  };
}

// ===== 修改昵称 =====
export function updateNickname(userId, nickname) {
  nickname = moderate(String(nickname || "").trim()); // 昵称也会公开显示，同样要过内容过滤
  if (!nickname || nickname.length > 12) throw new Error("昵称要 1~12 个字");
  db.prepare("UPDATE users SET nickname = ? WHERE user_id = ?").run(nickname, userId);
  return { nickname };
}

// ===== 修改头像 =====
// 只接受两种：系统头像 preset:1~6；或者自己上传过的图片 file:文件id（先用 /api/social/files 上传）
export function setAvatar(userId, avatar) {
  avatar = String(avatar || "");
  const preset = /^preset:[1-6]$/.test(avatar);
  const m = avatar.match(/^file:([0-9a-f]{32})$/);
  const f = m && db.prepare("SELECT name FROM files WHERE file_id = ? AND user_id = ?").get(m[1], userId);
  if (!preset && !(f && /\.(png|jpe?g|gif|webp)$/i.test(f.name))) throw new Error("头像只能用系统头像或自己上传的图片");
  db.prepare("UPDATE users SET avatar = ? WHERE user_id = ?").run(avatar, userId);
  return { avatar };
}

// ===== 修改密码：必须先输对旧密码 =====
export function changePassword(userId, oldPwd, newPwd) {
  const u = db.prepare("SELECT pwd FROM users WHERE user_id = ?").get(userId);
  if (!checkPassword(String(oldPwd || ""), u.pwd)) throw new Error("旧密码不对");
  if (String(newPwd || "").length < 6) throw new Error("新密码至少 6 位");
  // 新密码同样要加盐哈希后再存
  db.prepare("UPDATE users SET pwd = ? WHERE user_id = ?").run(hashPassword(String(newPwd)), userId);
}

// ===== 退出：删掉这个 token =====
export function logout(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
