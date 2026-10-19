// quiz.mjs —— 训练营「防御战」：让 AI 读一章教材，出 4 道小怪题（2 道文字选择题 + 2 道代码选择题）
// 和思维导图一样，生成过的题存到 quizzes/ 文件夹，下次直接读，不用再等 AI
// 还负责记录「哪些章节的防御墙守住了」（camp_progress 表）

import fs from "node:fs";
import path from "node:path";
import { readChapter } from "./chapters.mjs";
import { db } from "./db.mjs";

const CACHE_DIR = "quizzes";
const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

const PROMPT = `你是智能合约安全课程的出题老师。请根据下面这一讲教材出 4 道单选题，用来检验学生是否真的读懂了。
要求：
1. 前 2 道是「文字题」：考概念、原理、易错点；后 2 道是「代码题」：给一小段 Solidity 代码（3~12 行），问它的运行结果、漏洞或正确写法。
2. 每题 4 个选项，只有 1 个正确；错误选项要像真的，考的是理解，不是背原文。
3. 题目必须能从教材内容推出来，不要超纲。
4. 只输出 JSON 数组，不要任何解释，不要用代码块包起来。格式：
[{"type":"text","question":"题目","options":["A","B","C","D"],"answer":0,"explain":"为什么选它（不超过 60 字）"},
 {"type":"code","question":"题目","code":"Solidity 代码，换行用 \\n","options":["A","B","C","D"],"answer":2,"explain":"……"}]
answer 是正确选项的下标（0~3）。`;

async function chat(content) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0.4,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error("出题失败: " + (await res.text()));
  return (await res.json()).choices[0].message.content;
}

// AI 的输出不一定规矩：先抠出 [...] 那一段，再逐题检查格式，不合格的题直接丢掉
function parseQuiz(raw) {
  const start = raw.indexOf("["), end = raw.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  let list;
  try {
    list = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  return (Array.isArray(list) ? list : [])
    .filter((q) =>
      q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every((o) => typeof o === "string") && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .map((q) => ({
      type: q.type === "code" && q.code ? "code" : "text",
      question: q.question.slice(0, 300),
      code: q.type === "code" && q.code ? String(q.code).slice(0, 1500) : undefined,
      options: q.options.map((o) => o.slice(0, 200)),
      answer: q.answer,
      explain: String(q.explain || "").slice(0, 200),
    }));
}

// 拿到某一章的防御战题目：有缓存就直接用，没有就让 AI 出题（出得不够 3 道就再出一次）
export async function getQuiz(id) {
  const text = readChapter(id);
  if (text === null) return null;

  const cacheFile = path.join(CACHE_DIR, id + ".json");
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf-8"));

  let quiz = [];
  for (let i = 0; i < 2 && quiz.length < 3; i++) quiz = parseQuiz(await chat(text.slice(0, 8000)));
  if (quiz.length < 3) throw new Error("AI 这次没出好题，请稍后再试");

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(quiz, null, 2));
  return quiz;
}

// ===== 防御战记录 =====
db.exec(`CREATE TABLE IF NOT EXISTS camp_progress (
  user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  best       INTEGER NOT NULL DEFAULT 0,   -- 最好成绩：防御墙剩下的耐久（0~100），> 0 就是守住了
  play_time  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (user_id, chapter_id)
)`);

// 我守住过哪些章节：{ 章节id: 最好成绩 }
export function getCampProgress(uid) {
  const rows = db.prepare("SELECT chapter_id, best FROM camp_progress WHERE user_id = ?").all(uid);
  return Object.fromEntries(rows.map((r) => [r.chapter_id, r.best]));
}

// 记一次成绩：只保留最好的那次
export function saveCampResult(uid, chapterId, wall) {
  chapterId = String(chapterId || "");
  if (readChapter(chapterId) === null) throw new Error("没有这一章");
  wall = Math.max(0, Math.min(100, Math.round(Number(wall) || 0)));
  db.prepare(`INSERT INTO camp_progress (user_id, chapter_id, best) VALUES (?, ?, ?)
              ON CONFLICT (user_id, chapter_id) DO UPDATE SET best = MAX(best, excluded.best), play_time = datetime('now', 'localtime')`)
    .run(uid, chapterId, wall);
}
