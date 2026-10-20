// audits.mjs —— AI 审计记录：每次审计完自动存档，以后随时能翻出来看
//
// 不重复记录：同一个人审计「同一份合约」，只保留一条记录，记下审计了几次，内容换成最新的报告。
// 怎么判断是不是同一份：把代码统一一下格式（换行符统一、去掉每行末尾的空格、去掉首尾空行），
// 再算一个 SHA-256 指纹。只是多了几个空格、换行不一样，指纹相同，算同一份；改了任何一个字符，指纹就不同。

import crypto from "node:crypto";
import { db } from "./db.mjs";

const toISO = (t) => (t ? t.replace(" ", "T") : t);

db.exec(`
CREATE TABLE IF NOT EXISTS audit_records (
  audit_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,              -- 合约指纹：判断是不是同一份合约
  code        TEXT NOT NULL,
  title       TEXT NOT NULL,              -- 合约名，例如 Bank
  risk        TEXT NOT NULL DEFAULT '',   -- 高危 / 中危 / 低危 / 未发现明显问题
  findings    TEXT NOT NULL DEFAULT '[]', -- 规则扫描结果（JSON）
  sources     TEXT NOT NULL DEFAULT '[]', -- 引用的教材（JSON）
  steps       TEXT NOT NULL DEFAULT '[]', -- Agent 的每一步（JSON），重新打开记录时能看到当时的思考过程
  report      TEXT NOT NULL DEFAULT '',
  audit_count INTEGER NOT NULL DEFAULT 1, -- 这份合约审计了几次
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  update_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (user_id, code_hash)
)`);

export function normalizeCode(code) {
  return String(code || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
}
const hashOf = (code) => crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");

// 记录的名字：用合约名（最后一个 contract，一般是主合约）；找不到就用第一行有内容的代码
function titleOf(code) {
  const names = [...code.matchAll(/\bcontract\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
  if (names.length) return names.length > 1 ? `${names.at(-1)} 等 ${names.length} 个合约` : names[0];
  return (code.split("\n").find((l) => l.trim() && !l.trim().startsWith("//")) || "未命名合约").trim().slice(0, 40);
}

// 风险等级：优先看报告「审计结论」那一段 AI 怎么说，没有再按扫描结果里最严重的算
function riskOf(report, findings) {
  const conclusion = (report.split(/^##\s*审计结论/m)[1] || "").split(/^##\s/m)[0];
  for (const r of ["高危", "中危", "低危"]) if (conclusion.includes(r)) return r;
  if (/未发现明显问题|没有发现/.test(conclusion)) return "未发现明显问题";
  for (const r of ["高危", "中危", "低危"]) if (findings.some((f) => f.severity === r)) return r;
  return "未发现明显问题";
}

function row(r, full = false) {
  const base = {
    id: r.audit_id, title: r.title, risk: r.risk, auditCount: r.audit_count,
    findingsCount: JSON.parse(r.findings).filter((f) => f.severity !== "提示").length,
    createdAt: toISO(r.create_time), updatedAt: toISO(r.update_time),
  };
  if (!full) return base;
  return { ...base, code: r.code, report: r.report, findings: JSON.parse(r.findings), sources: JSON.parse(r.sources), steps: JSON.parse(r.steps) };
}

// 审计完成后存档：同一份合约已经有记录，就更新它（次数 +1），否则新建一条
export function saveAudit(uid, { code, report, findings = [], sources = [], steps = [] }) {
  const hash = hashOf(code);
  const old = db.prepare("SELECT audit_id FROM audit_records WHERE user_id = ? AND code_hash = ?").get(uid, hash);
  const values = [JSON.stringify(findings), JSON.stringify(sources), JSON.stringify(steps).slice(0, 200000), report, riskOf(report, findings)];
  if (old) {
    db.prepare(`UPDATE audit_records SET findings = ?, sources = ?, steps = ?, report = ?, risk = ?,
                audit_count = audit_count + 1, update_time = datetime('now', 'localtime') WHERE audit_id = ?`).run(...values, old.audit_id);
  } else {
    db.prepare(`INSERT INTO audit_records (findings, sources, steps, report, risk, user_id, code_hash, code, title)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values, uid, hash, code, titleOf(code));
  }
  const r = db.prepare("SELECT * FROM audit_records WHERE user_id = ? AND code_hash = ?").get(uid, hash);
  return { ...row(r), repeat: !!old };
}

// 开始审计前先查一下：这份合约以前审计过吗？审计过就让用户选「直接看上次的报告」还是「重新审计」
export function findAudit(uid, code) {
  const r = db.prepare("SELECT * FROM audit_records WHERE user_id = ? AND code_hash = ?").get(uid, hashOf(code));
  return { record: r ? row(r) : null };
}

export function listAudits(uid) {
  return db.prepare("SELECT * FROM audit_records WHERE user_id = ? ORDER BY update_time DESC, audit_id DESC").all(uid).map((r) => row(r));
}

export function getAudit(uid, id) {
  const r = db.prepare("SELECT * FROM audit_records WHERE audit_id = ? AND user_id = ?").get(id, uid);
  if (!r) throw new Error("没有这条审计记录");
  return row(r, true);
}

export function deleteAudit(uid, id) {
  db.prepare("DELETE FROM audit_records WHERE audit_id = ? AND user_id = ?").run(id, uid);
}
