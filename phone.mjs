// phone.mjs —— 手机号：绑定手机号、发验证码、验证码登录
//
// 三种登录方式：账号 + 密码 / 手机号 + 密码（在 auth.mjs 的 login 里）/ 手机号 + 验证码（这里）
//
// 验证码的规矩：
//   - 6 位数字，5 分钟内有效，用过一次就作废
//   - 同一个手机号 60 秒内只能发一次（防止被人刷短信）
//   - 同一个验证码最多输错 5 次，超过就作废，要重新获取（防止被人一个个试）
//
// 短信怎么发：.env 里的 SMS_MODE 决定
//   SMS_MODE=demo   演示模式：不真发短信，验证码直接显示在网页上（比赛演示 / 本地开发用）
//                   ⚠️ 演示模式下任何人都能拿到验证码，所以「验证码登录」并不安全，只适合演示
//   SMS_MODE=aliyun 真发短信：申请好阿里云短信的签名和模板后，在下面的 sendSms 里接上
//   不写           验证码功能关闭（「手机号 + 密码」登录照样能用）

import crypto from "node:crypto";
import { db } from "./db.mjs";
import { issueSession } from "./auth.mjs";

const CODE_MINUTES = 5;
const RESEND_SECONDS = 60;
const MAX_TRIES = 5;

db.exec(`CREATE TABLE IF NOT EXISTS sms_codes (
  phone       TEXT NOT NULL,
  purpose     TEXT NOT NULL,                -- 'login' 登录 / 'bind' 绑定手机号
  code_hash   TEXT NOT NULL,                -- 只存验证码的哈希，数据库泄露也拿不到验证码
  tries       INTEGER NOT NULL DEFAULT 0,   -- 已经输错几次
  send_time   INTEGER NOT NULL,             -- 发送时间（毫秒）
  PRIMARY KEY (phone, purpose)
)`);

const mode = () => (process.env.SMS_MODE || "").trim();
const hash = (code) => crypto.createHash("sha256").update(code).digest("hex");

export function checkPhone(phone) {
  phone = String(phone || "").trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error("请输入正确的 11 位手机号");
  return phone;
}

// 真正发短信的地方。接阿里云短信：npm 装 @alicloud/dysmsapi20170525，按官方文档调用 SendSms，
// 用到的 AccessKey、签名名称、模板编号都写在 .env 里，不要写进代码
async function sendSms(phone, code) {
  if (mode() === "aliyun") throw new Error("短信服务还没有接好（请在 phone.mjs 的 sendSms 里接入阿里云短信）");
}

// 发验证码。purpose：'login' 登录（手机号必须已经绑定）/ 'bind' 绑定（手机号不能被别人绑定过）
export async function sendCode(phone, purpose, uid = null) {
  if (!mode()) throw new Error("验证码登录还没有开通，请用账号或手机号 + 密码登录");
  phone = checkPhone(phone);
  if (!["login", "bind"].includes(purpose)) throw new Error("用途不对");
  const owner = db.prepare("SELECT user_id FROM users WHERE phone = ?").get(phone);
  if (purpose === "login" && !owner) throw new Error("这个手机号还没有绑定账号：先用账号登录，在「我的档案」里绑定手机号");
  if (purpose === "bind" && owner && owner.user_id !== uid) throw new Error("这个手机号已经绑定了别的账号");

  const last = db.prepare("SELECT send_time FROM sms_codes WHERE phone = ? AND purpose = ?").get(phone, purpose);
  const wait = last ? Math.ceil((last.send_time + RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) throw new Error(`验证码发得太频繁了，请 ${wait} 秒后再试`);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await sendSms(phone, code);
  db.prepare("INSERT OR REPLACE INTO sms_codes (phone, purpose, code_hash, tries, send_time) VALUES (?, ?, ?, 0, ?)")
    .run(phone, purpose, hash(code), Date.now());
  // 演示模式：把验证码直接还给网页显示；真发短信时绝不能返回验证码
  return mode() === "demo" ? { ok: true, demoCode: code, seconds: RESEND_SECONDS } : { ok: true, seconds: RESEND_SECONDS };
}

// 核对验证码：对了就作废（只能用一次），错了记一次
function verifyCode(phone, purpose, code) {
  const r = db.prepare("SELECT * FROM sms_codes WHERE phone = ? AND purpose = ?").get(phone, purpose);
  if (!r || Date.now() - r.send_time > CODE_MINUTES * 60 * 1000) throw new Error("验证码已过期，请重新获取");
  if (r.tries >= MAX_TRIES) throw new Error("输错次数太多，请重新获取验证码");
  if (hash(String(code || "").trim()) !== r.code_hash) {
    db.prepare("UPDATE sms_codes SET tries = tries + 1 WHERE phone = ? AND purpose = ?").run(phone, purpose);
    throw new Error(`验证码不对（还能再试 ${MAX_TRIES - r.tries - 1} 次）`);
  }
  db.prepare("DELETE FROM sms_codes WHERE phone = ? AND purpose = ?").run(phone, purpose);
}

// 手机号 + 验证码登录
export function loginByCode(phone, code) {
  phone = checkPhone(phone);
  verifyCode(phone, "login", code);
  const u = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
  if (!u) throw new Error("这个手机号还没有绑定账号");
  return issueSession(u);
}

// 绑定（或更换）手机号：要先收到验证码，证明这个手机号是你的
export function bindPhone(uid, phone, code) {
  phone = checkPhone(phone);
  verifyCode(phone, "bind", code);
  const owner = db.prepare("SELECT user_id FROM users WHERE phone = ?").get(phone);
  if (owner && owner.user_id !== uid) throw new Error("这个手机号已经绑定了别的账号");
  db.prepare("UPDATE users SET phone = ? WHERE user_id = ?").run(phone, uid);
  return { phone: phone.slice(0, 3) + "****" + phone.slice(7) };
}

// 前端用：验证码登录有没有开通、是不是演示模式
export const smsStatus = () => ({ enabled: !!mode(), demo: mode() === "demo" });
