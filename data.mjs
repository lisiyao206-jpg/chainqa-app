// data.mjs —— 笔记、错题、关卡进度的「增删改查」
// 每个函数第一个参数都是 userId：只能操作自己的数据，看不到别人的

import { db } from "./db.mjs";

// 数据库里的时间是「2026-10-15 16:20:00」，换成浏览器认识的格式「2026-10-15T16:20:00」
const toISO = (t) => (t ? t.replace(" ", "T") : t);

// ===== 笔记 =====
function noteRow(r) {
  return { id: r.note_id, chapterId: r.chapter_id, title: r.title, content: r.content, updatedAt: toISO(r.update_time) };
}
export function listNotes(userId) {
  return db.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY update_time DESC").all(userId).map(noteRow);
}
export function createNote(userId, { title = "", content = "", chapterId = null }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO notes (user_id, chapter_id, title, content) VALUES (?, ?, ?, ?)")
    .run(userId, chapterId, title, content);
  return noteRow(db.prepare("SELECT * FROM notes WHERE note_id = ?").get(lastInsertRowid));
}
export function updateNote(userId, id, { title, content }) {
  // WHERE 里同时检查 user_id：就算有人改了 id，也改不到别人的笔记
  db.prepare(`UPDATE notes SET title = ?, content = ?, update_time = datetime('now', 'localtime')
              WHERE note_id = ? AND user_id = ?`).run(title ?? "", content ?? "", id, userId);
}
export function deleteNote(userId, id) {
  db.prepare("DELETE FROM notes WHERE note_id = ? AND user_id = ?").run(id, userId);
}

// ===== 错题 =====
function mistakeRow(r) {
  return {
    id: r.mistake_id, question: r.question, answer: r.answer, analysis: r.analysis, status: r.status, source: r.source,
    wrongCount: r.wrong_count ?? 1, createdAt: toISO(r.create_time),
  };
}

// 以前 AI 出的题，选项里自带「A. 」，记进错题本后变成了「A. A. ……」：把重复的编号去掉
const fixLabels = (s) => s.replace(/(^|：)([A-D])\. \2[.．、:：]\s*/gm, "$1$2. ");

// 启动时整理一次旧数据：先修好重复的编号，再把同一个人、同一道题的多条记录合并成一条
// （保留最早那条，错的次数加起来；只要有一条还没掌握，就算待温习；时间取最近一次答错）
function tidyMistakes() {
  const rows = db.prepare("SELECT mistake_id, question, answer FROM mistakes").all();
  const fix = db.prepare("UPDATE mistakes SET question = ?, answer = ? WHERE mistake_id = ?");
  for (const r of rows) {
    const q = fixLabels(r.question), a = fixLabels(r.answer);
    if (q !== r.question || a !== r.answer) fix.run(q, a, r.mistake_id);
  }
  const groups = db.prepare(`SELECT user_id, question, MIN(mistake_id) AS keep, SUM(wrong_count) AS total,
                               MAX(status = 'todo') AS anyTodo, MAX(create_time) AS last
                             FROM mistakes GROUP BY user_id, question HAVING COUNT(*) > 1`).all();
  for (const g of groups) {
    db.prepare("UPDATE mistakes SET wrong_count = ?, status = ?, create_time = ? WHERE mistake_id = ?")
      .run(g.total, g.anyTodo ? "todo" : "mastered", g.last, g.keep);
    db.prepare("DELETE FROM mistakes WHERE user_id = ? AND question = ? AND mistake_id <> ?").run(g.user_id, g.question, g.keep);
  }
}
tidyMistakes();

export function listMistakes(userId) {
  return db.prepare("SELECT * FROM mistakes WHERE user_id = ? ORDER BY create_time DESC, mistake_id DESC").all(userId).map(mistakeRow);
}
export function addMistake(userId, { question, answer, analysis = null, source = "manual" }) {
  if (!question || !answer) throw new Error("题目和答案不能为空");
  // 这道题以前就错过：不再新加一条，而是「错的次数 +1」，重新标成待温习，并挪到最上面
  const old = db.prepare("SELECT mistake_id FROM mistakes WHERE user_id = ? AND question = ?").get(userId, question);
  if (old) {
    db.prepare(`UPDATE mistakes SET wrong_count = wrong_count + 1, status = 'todo', answer = ?,
                create_time = datetime('now', 'localtime') WHERE mistake_id = ?`).run(answer, old.mistake_id);
    return mistakeRow(db.prepare("SELECT * FROM mistakes WHERE mistake_id = ?").get(old.mistake_id));
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO mistakes (user_id, question, answer, analysis, source) VALUES (?, ?, ?, ?, ?)")
    .run(userId, question, answer, analysis, source === "game" ? "game" : "manual");
  return mistakeRow(db.prepare("SELECT * FROM mistakes WHERE mistake_id = ?").get(lastInsertRowid));
}
export function setMistakeStatus(userId, id, status) {
  if (!["todo", "mastered"].includes(status)) throw new Error("状态只能是 todo 或 mastered");
  db.prepare("UPDATE mistakes SET status = ? WHERE mistake_id = ? AND user_id = ?").run(status, id, userId);
}
export function deleteMistake(userId, id) {
  db.prepare("DELETE FROM mistakes WHERE mistake_id = ? AND user_id = ?").run(id, userId);
}

// ===== 关卡进度 =====
// 返回 { 关卡id: 星数 }，和前端原来的格式一样
export function getProgress(userId) {
  const map = {};
  for (const r of db.prepare("SELECT level_id, star FROM game_progress WHERE user_id = ?").all(userId)) map[r.level_id] = r.star;
  return map;
}
// 记录成绩：已经有记录就更新（只保留最好成绩），没有就插入
export function saveProgress(userId, levelId, star) {
  db.prepare(`INSERT INTO game_progress (user_id, level_id, star) VALUES (?, ?, ?)
              ON CONFLICT (user_id, level_id)
              DO UPDATE SET star = MAX(star, excluded.star), play_time = datetime('now', 'localtime')`)
    .run(userId, Number(levelId), Math.max(0, Math.min(3, Number(star) || 0)));
}
