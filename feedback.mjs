// feedback.mjs —— 问答日志 + 用户留言反馈
//   问答日志：每次有人问 AI，都记下谁问的、问了什么、AI 怎么答的、引用了哪些资料、有没有拒答
//   留言反馈：用户可以给某一条 AI 回答点「有帮助 / 没帮助」并写原因，也可以随时给我们留言；
//             管理员在后台查看、回复，用户在「意见反馈」里能看到回复

import { db } from "./db.mjs";
import { moderate } from "./safety.mjs";

const toISO = (t) => (t ? t.replace(" ", "T") : t);

db.exec(`
CREATE TABLE IF NOT EXISTS qa_logs (
  log_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- 没登录也能问，所以可以为空
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  sources     TEXT NOT NULL DEFAULT '[]',  -- 引用的资料（JSON）：[{ file, heading, score }]
  refused     INTEGER NOT NULL DEFAULT 0,  -- 1 = 知识库里没找到依据，拒答了
  error       TEXT,
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 反馈：type = 'answer' 对某条 AI 回答的评价 / 'message' 普通留言
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'message',
  log_id      INTEGER REFERENCES qa_logs(log_id) ON DELETE SET NULL,
  rating      TEXT,                              -- 'up' 有帮助 / 'down' 没帮助；普通留言为空
  content     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',   -- 'pending' 待处理 / 'replied' 已回复
  reply       TEXT,
  reply_time  TEXT,
  user_read   INTEGER NOT NULL DEFAULT 1,        -- 0 = 管理员回复了，但用户还没看
  create_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`);

// ===== 问答日志 =====
export function logAsk({ userId, question, answer, sources, refused, error }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO qa_logs (user_id, question, answer, sources, refused, error) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId ?? null, String(question).slice(0, 2000), String(answer || "").slice(0, 20000),
      JSON.stringify(sources || []), refused ? 1 : 0, error || null);
  return Number(lastInsertRowid);
}

// 管理员查看：可以按问题或回答里的关键词搜，也可以只看「拒答」的（拒答多的问题，说明资料该补了）
export function listQaLogs({ q = "", refusedOnly = false } = {}) {
  const like = `%${q.trim()}%`;
  return db.prepare(`
      SELECT l.*, u.account, u.nickname,
        (SELECT rating FROM feedback f WHERE f.log_id = l.log_id ORDER BY feedback_id DESC LIMIT 1) AS rating
      FROM qa_logs l LEFT JOIN users u ON u.user_id = l.user_id
      WHERE (l.question LIKE ? OR l.answer LIKE ?) ${refusedOnly ? "AND l.refused = 1" : ""}
      ORDER BY l.log_id DESC LIMIT 300`)
    .all(like, like)
    .map((r) => ({
      id: r.log_id, question: r.question, answer: r.answer, sources: JSON.parse(r.sources), refused: !!r.refused,
      error: r.error, time: toISO(r.create_time), user: r.account ? { account: r.account, nickname: r.nickname } : null,
      rating: r.rating,
    }));
}

// ===== 用户：提交反馈 =====
export function addFeedback(uid, { type, logId, rating, content }) {
  type = type === "answer" ? "answer" : "message";
  content = moderate(String(content || "").trim());
  if (content.length > 1000) throw new Error("反馈最多 1000 字");
  if (type === "message" && !content) throw new Error("写点什么再提交吧");
  if (type === "answer") {
    if (!["up", "down"].includes(rating)) throw new Error("请选择有帮助还是没帮助");
    // 只能评价「自己问的」那条回答
    if (!db.prepare("SELECT 1 FROM qa_logs WHERE log_id = ? AND user_id = ?").get(logId, uid)) throw new Error("找不到这条回答");
    // 同一条回答重复评价时，改成最新的评价
    const old = db.prepare("SELECT feedback_id FROM feedback WHERE log_id = ? AND user_id = ?").get(logId, uid);
    if (old) {
      db.prepare("UPDATE feedback SET rating = ?, content = ?, status = 'pending' WHERE feedback_id = ?").run(rating, content, old.feedback_id);
      return { id: old.feedback_id };
    }
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO feedback (user_id, type, log_id, rating, content) VALUES (?, ?, ?, ?, ?)")
    .run(uid, type, type === "answer" ? logId : null, type === "answer" ? rating : null, content);
  return { id: Number(lastInsertRowid) };
}

function feedbackRow(r) {
  return {
    id: r.feedback_id, type: r.type, rating: r.rating, content: r.content, status: r.status,
    reply: r.reply, replyTime: toISO(r.reply_time), time: toISO(r.create_time), unread: r.user_read === 0,
    question: r.question ?? null, answer: r.answer ?? null,
    user: r.account ? { account: r.account, nickname: r.nickname } : undefined,
  };
}

// 我的反馈（带管理员的回复）；看过之后把「未读回复」清掉
export function myFeedback(uid) {
  const rows = db.prepare(`SELECT f.*, l.question FROM feedback f LEFT JOIN qa_logs l ON l.log_id = f.log_id
                           WHERE f.user_id = ? ORDER BY f.feedback_id DESC`).all(uid).map(feedbackRow);
  db.prepare("UPDATE feedback SET user_read = 1 WHERE user_id = ?").run(uid);
  return rows;
}
export function unreadReplies(uid) {
  return db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND user_read = 0").get(uid).n;
}

// ===== 管理员：查看、回复、删除 =====
export function listFeedback(status = "") {
  return db.prepare(`
      SELECT f.*, u.account, u.nickname, l.question, l.answer
      FROM feedback f JOIN users u ON u.user_id = f.user_id LEFT JOIN qa_logs l ON l.log_id = f.log_id
      ${status === "pending" || status === "replied" ? "WHERE f.status = ?" : ""}
      ORDER BY (f.status = 'pending') DESC, f.feedback_id DESC LIMIT 300`)
    .all(...(status === "pending" || status === "replied" ? [status] : []))
    .map(feedbackRow);
}

export function replyFeedback(id, reply) {
  reply = String(reply || "").trim();
  if (!reply) throw new Error("回复不能为空");
  if (reply.length > 1000) throw new Error("回复最多 1000 字");
  const r = db.prepare(`UPDATE feedback SET reply = ?, status = 'replied', reply_time = datetime('now', 'localtime'), user_read = 0
                        WHERE feedback_id = ?`).run(reply, id);
  if (!r.changes) throw new Error("没有这条反馈");
}

export function deleteFeedback(id) {
  db.prepare("DELETE FROM feedback WHERE feedback_id = ?").run(id);
}
