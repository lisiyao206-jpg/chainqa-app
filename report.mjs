// report.mjs —— 学习报告：按知识点统计掌握度，给出下一步学什么；老师看班级学情
// 掌握度怎么算（写在页面上，学生和老师都看得懂）：
//   这个知识点下「守住防御战的章节 + 通关的实战关卡 + 通过的链上实验」所占的比例，
//   每有一道还没订正的错题扣 10 分，最低 0 分

import { db } from "./db.mjs";
import { KNOWLEDGE_POINTS, LEVELS, chapterKps, listTracks } from "./knowledge.mjs";
import { LABS } from "./chainlab/labs.mjs";

const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

// 全部学习项目：每一章教材 + 每一关实战 + 每一道链上实验，各自带知识点和打开它的地址
// 教材目录要读文件，缓存一分钟，避免老师看全班学情时每个学生都读一遍
let itemsCache = { time: 0, items: [] };
const READER = { prep: "/prep", fisco: "/fisco", frontier: "/frontier", "": "/camp" };
function allItems() {
  if (Date.now() - itemsCache.time < 60_000) return itemsCache.items;
  const items = [];
  for (const t of listTracks())
    for (const g of t.groups)
      for (const c of g.chapters)
        items.push({ kind: "chapter", id: c.id, title: `${c.no} ${c.title}`, track: t.name, kps: chapterKps(c.id), path: READER[t.book] ?? "/camp", query: { chapter: c.id } });
  for (const l of LEVELS)
    items.push({ kind: "level", id: `level:${l.id}`, title: `第 ${l.id} 关 · ${l.title}`, track: "实战任务", kps: l.kps, path: "/mission", query: { level: String(l.id) } });
  for (const lab of LABS)
    items.push({ kind: "lab", id: `lab:${lab.id}`, title: `链上实验 · ${lab.title}`, track: "链上实验场", kps: LEVELS.find((l) => l.id === lab.level)?.kps || [], path: "/lab", query: { lab: String(lab.id) } });
  itemsCache = { time: Date.now(), items };
  return items;
}

// 错题出自哪里 → 属于哪些知识点
function refKps(ref) {
  if (!ref) return [];
  const m = ref.match(/^level:(\d+)$/);
  return m ? LEVELS.find((l) => l.id === Number(m[1]))?.kps || [] : chapterKps(ref);
}

function stateOf(k) {
  if (!k.done && !k.mistakes) return "untouched"; // 还没开始
  if (k.mastery >= 80) return "mastered";         // 掌握
  if (k.mastery >= 40) return "learning";         // 学习中
  return "weak";                                   // 薄弱
}

// ===== 某个学生的学习报告 =====
export function studentReport(uid) {
  const defended = new Set(all("SELECT chapter_id FROM camp_progress WHERE user_id = ? AND best > 0", uid).map((r) => r.chapter_id));
  const cleared = new Set(all("SELECT level_id FROM game_progress WHERE user_id = ? AND star > 0", uid).map((r) => `level:${r.level_id}`));
  const labs = new Set(all("SELECT lab_id FROM lab_progress WHERE user_id = ? AND passed = 1", uid).map((r) => `lab:${r.lab_id}`));
  const isDone = (it) => (it.kind === "chapter" ? defended.has(it.id) : it.kind === "lab" ? labs.has(it.id) : cleared.has(it.id));
  const mistakes = all("SELECT ref, status FROM mistakes WHERE user_id = ?", uid);
  const items = allItems();

  const kps = KNOWLEDGE_POINTS.map((kp) => {
    const mine = items.filter((it) => it.kps.includes(kp.id));
    const done = mine.filter(isDone).length;
    const open = mistakes.filter((m) => m.status === "todo" && refKps(m.ref).includes(kp.id)).length;
    const mastery = mine.length ? Math.max(0, Math.round((done / mine.length) * 100) - open * 10) : 0;
    const k = { id: kp.id, name: kp.name, group: kp.group, done, total: mine.length, mistakes: open, mastery };
    return { ...k, state: stateOf(k) };
  }).filter((k) => k.total);

  // 下一步学什么：先补「学过但薄弱 / 还在学」的知识点（掌握度从低到高），
  // 都没有就按学习路线的顺序，从第一个还没开始的知识点学起
  const focus = [
    ...kps.filter((k) => k.state === "weak" || k.state === "learning").sort((a, b) => a.mastery - b.mastery),
    ...kps.filter((k) => k.state === "untouched"),
  ];
  const next = [];
  for (const k of focus) {
    // 同一个知识点有好几章时，优先推荐专门讲它的那一章（标签越少越专门），其次按学习路线顺序
    const it = items
      .filter((it) => it.kps.includes(k.id) && !isDone(it) && !next.some((n) => n.id === it.id))
      .sort((a, b) => a.kps.length - b.kps.length)[0];
    if (it) next.push({ ...it, reason: k.state === "untouched" ? `开始学习「${k.name}」` : `巩固薄弱点「${k.name}」` });
    if (next.length >= 3) break;
  }

  const chapters = items.filter((it) => it.kind === "chapter");
  return {
    summary: {
      chaptersDone: chapters.filter(isDone).length,
      chaptersTotal: chapters.length,
      levelsDone: cleared.size,
      levelsTotal: LEVELS.length,
      labsDone: labs.size,
      labsTotal: LABS.length,
      mistakesOpen: mistakes.filter((m) => m.status === "todo").length,
      mistakesMastered: mistakes.filter((m) => m.status === "mastered").length,
      notes: one("SELECT COUNT(*) AS n FROM notes WHERE user_id = ?", uid).n,
    },
    kps,
    next: next.map(({ kps: _, ...n }) => n),
  };
}

// ===== AI 学习建议：把报告交给白帽导师，让它写一段个性化建议 =====
const ADVICE_PROMPT = `你是「链知答」平台的白帽导师，负责给学习区块链和智能合约安全的学生写学习建议。
根据学生的学习数据，用中文写一段建议，要求：
1. 先用一句话肯定学生已经做到的事情（如果数据显示还没开始学，就鼓励他从第一步开始）。
2. 指出 1~2 个最需要加强的知识点，并说明为什么它重要。
3. 给出接下来 3 步具体可执行的学习安排，必须使用数据里「推荐下一步」给出的章节或关卡名称，不要编造平台上不存在的内容。
4. 语气亲切、简洁，总共不超过 200 字，用 Markdown 列表，不要标题。`;

export async function adviceFor(uid) {
  if (!process.env.ZHIPU_API_KEY) throw new Error("没有配置 AI 密钥，暂时无法生成建议");
  const r = studentReport(uid);
  const s = r.summary;
  const data = [
    `章节：守住 ${s.chaptersDone}/${s.chaptersTotal} 章；实战：通关 ${s.levelsDone}/${s.levelsTotal} 关；待订正错题 ${s.mistakesOpen} 道；笔记 ${s.notes} 篇`,
    "知识点掌握度：",
    ...r.kps.map((k) => `- ${k.name}：${k.mastery} 分（完成 ${k.done}/${k.total}，待订正错题 ${k.mistakes}）`),
    "推荐下一步：",
    ...r.next.map((n) => `- ${n.title}（${n.reason}）`),
  ].join("\n");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0.5,
      messages: [
        { role: "system", content: ADVICE_PROMPT },
        { role: "user", content: data },
      ],
    }),
  });
  if (!res.ok) throw new Error("AI 建议生成失败，请稍后再试");
  const json = await res.json();
  return { advice: json.choices[0].message.content };
}

// ===== 老师：班级学情 =====
function ownClass(uid, classId) {
  const c = one("SELECT * FROM classes WHERE class_id = ?", classId);
  if (!c) throw new Error("没有这个班级");
  if (c.teacher_id !== uid) throw new Error("只有本班老师可以查看学情");
  return c;
}

export function classStats(uid, classId) {
  ownClass(uid, classId);
  const students = all(
    `SELECT u.user_id, u.nickname, u.account FROM class_members m JOIN users u ON u.user_id = m.user_id
     WHERE m.class_id = ? ORDER BY m.join_time`, classId);
  const tasks = all("SELECT kind, target FROM class_tasks WHERE class_id = ?", classId);

  const rows = students.map((st) => {
    const r = studentReport(st.user_id);
    const tasksDone = tasks.filter((t) =>
      t.kind === "chapter"
        ? one("SELECT 1 FROM camp_progress WHERE user_id = ? AND chapter_id = ? AND best > 0", st.user_id, t.target)
        : one("SELECT 1 FROM game_progress WHERE user_id = ? AND level_id = ? AND star > 0", st.user_id, Number(t.target)),
    ).length;
    // 薄弱知识点：学过但掌握度最低的两个
    const weak = r.kps.filter((k) => k.state === "weak" || k.state === "learning").sort((a, b) => a.mastery - b.mastery).slice(0, 2);
    return {
      userId: st.user_id, nickname: st.nickname, account: st.account,
      tasksDone, ...r.summary, weak: weak.map((k) => k.name), kps: r.kps,
    };
  });

  // 每个知识点的全班平均掌握度，找出全班普遍薄弱的地方
  const kps = KNOWLEDGE_POINTS.map((kp) => {
    const scores = rows.map((row) => row.kps.find((k) => k.id === kp.id)).filter(Boolean);
    if (!scores.length) return null;
    return {
      id: kp.id, name: kp.name, group: kp.group,
      avg: Math.round(scores.reduce((n, k) => n + k.mastery, 0) / scores.length),
      weakCount: scores.filter((k) => k.state === "weak").length,
    };
  }).filter(Boolean);

  return {
    taskCount: tasks.length,
    taskRate: rows.length && tasks.length ? Math.round((rows.reduce((n, r) => n + r.tasksDone, 0) / (rows.length * tasks.length)) * 100) : 0,
    students: rows.map(({ kps: _, ...r }) => r),
    kps,
  };
}

// 老师查看本班某个学生的完整报告
export function memberReport(uid, classId, studentId) {
  ownClass(uid, classId);
  if (!one("SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?", classId, studentId)) throw new Error("这个学生不在你的班级里");
  const u = one("SELECT nickname FROM users WHERE user_id = ?", studentId);
  return { nickname: u.nickname, ...studentReport(studentId) };
}
