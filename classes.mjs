// classes.mjs —— 我的班级：老师建班、学生凭班级码加入；班级任务、班级资料、视频会议
// 表结构在 db.mjs 里。任务完成情况不用学生手动交，直接看学习记录：
//   读章节的任务 → camp_progress 里这一章守住了（best > 0）
//   实战关卡任务 → game_progress 里这一关通关了（star > 0）

import crypto from "node:crypto";
import { db } from "./db.mjs";
import { moderate } from "./safety.mjs";
import { fileBrief } from "./social.mjs";

const toISO = (t) => (t ? t.replace(" ", "T") : t);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);

const roleOf = (uid) => one("SELECT role FROM users WHERE user_id = ?", uid)?.role;
const isTeacher = (uid) => ["teacher", "admin"].includes(roleOf(uid));

function cleanText(text, max, label, required = true) {
  text = String(text ?? "").trim();
  if (required && !text) throw new Error(`请填写${label}`);
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字`);
  return text ? moderate(text) : "";
}

// 只有这个班的老师才能管理它
function ownClass(uid, classId) {
  const c = one("SELECT * FROM classes WHERE class_id = ?", classId);
  if (!c) throw new Error("没有这个班级");
  if (c.teacher_id !== uid) throw new Error("只有本班老师可以操作");
  return c;
}
// 本班老师或学生才能查看
function visibleClass(uid, classId) {
  const c = one("SELECT * FROM classes WHERE class_id = ?", classId);
  if (!c) throw new Error("没有这个班级");
  if (c.teacher_id !== uid && !one("SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?", classId, uid))
    throw new Error("你不在这个班级里");
  return c;
}

// 6 位数字班级码，不重复
function newCode() {
  for (;;) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!one("SELECT 1 FROM classes WHERE code = ?", code)) return code;
  }
}

// ===== 班级列表 =====
// 老师看到自己建的班，学生看到自己加入的班
export function listClasses(uid) {
  const rows = all(
    `SELECT c.*, u.nickname AS teacher_name,
       (SELECT COUNT(*) FROM class_members WHERE class_id = c.class_id) AS member_count,
       (SELECT COUNT(*) FROM class_tasks WHERE class_id = c.class_id) AS task_count
     FROM classes c JOIN users u ON u.user_id = c.teacher_id
     WHERE c.teacher_id = ? OR c.class_id IN (SELECT class_id FROM class_members WHERE user_id = ?)
     ORDER BY c.class_id DESC`, uid, uid);
  return rows.map((c) => ({
    id: c.class_id, name: c.name, teacher: c.teacher_name, mine: c.teacher_id === uid,
    code: c.teacher_id === uid ? c.code : undefined, // 班级码只给老师看，由老师发给学生
    memberCount: c.member_count, taskCount: c.task_count,
  }));
}

export function createClass(uid, name) {
  if (!isTeacher(uid)) throw new Error("只有老师可以建班");
  name = cleanText(name, 20, "班级名称");
  const code = newCode();
  const { lastInsertRowid } = run("INSERT INTO classes (name, code, teacher_id) VALUES (?, ?, ?)", name, code, uid);
  return { id: Number(lastInsertRowid), code };
}

export function joinClass(uid, code) {
  const c = one("SELECT * FROM classes WHERE code = ?", String(code || "").trim());
  if (!c) throw new Error("班级码不对，请向老师确认");
  if (c.teacher_id === uid) throw new Error("这是你自己建的班级");
  run("INSERT OR IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)", c.class_id, uid);
  return { id: c.class_id, name: c.name };
}

export function leaveClass(uid, classId) {
  run("DELETE FROM class_members WHERE class_id = ? AND user_id = ?", classId, uid);
}

export function removeMember(uid, classId, memberId) {
  ownClass(uid, classId);
  run("DELETE FROM class_members WHERE class_id = ? AND user_id = ?", classId, memberId);
}

export function deleteClass(uid, classId) {
  ownClass(uid, classId);
  run("DELETE FROM classes WHERE class_id = ?", classId);
}

// ===== 任务完成情况 =====
function isTaskDone(task, userId) {
  if (task.kind === "chapter")
    return !!one("SELECT 1 FROM camp_progress WHERE user_id = ? AND chapter_id = ? AND best > 0", userId, task.target);
  return !!one("SELECT 1 FROM game_progress WHERE user_id = ? AND level_id = ? AND star > 0", userId, Number(task.target));
}

function taskRow(t) {
  return {
    id: t.task_id, kind: t.kind, target: t.target, title: t.title, note: t.note,
    deadline: toISO(t.deadline), createTime: toISO(t.create_time),
  };
}

// ===== 班级详情 =====
// 老师：成员名单 + 每项任务完成了几个人；学生：每项任务我完成没有、老师给我的点评
export function classDetail(uid, classId) {
  const c = visibleClass(uid, classId);
  const mine = c.teacher_id === uid;
  const members = all(
    `SELECT u.user_id, u.account, u.nickname, u.avatar, m.join_time FROM class_members m
     JOIN users u ON u.user_id = m.user_id WHERE m.class_id = ? ORDER BY m.join_time`, classId);
  const tasks = all("SELECT * FROM class_tasks WHERE class_id = ? ORDER BY task_id DESC", classId).map((t) => {
    const row = taskRow(t);
    if (mine) row.doneCount = members.filter((m) => isTaskDone(t, m.user_id)).length;
    else {
      row.done = isTaskDone(t, uid);
      row.review = one("SELECT comment FROM task_reviews WHERE task_id = ? AND user_id = ?", t.task_id, uid)?.comment || "";
    }
    return row;
  });
  const materials = all("SELECT * FROM class_materials WHERE class_id = ? ORDER BY material_id DESC", classId)
    .map((m) => ({ id: m.material_id, title: m.title, file: fileBrief(m.file_id), createTime: toISO(m.create_time) }))
    .filter((m) => m.file);
  return {
    id: c.class_id, name: c.name, mine,
    code: mine ? c.code : undefined,
    teacher: one("SELECT nickname FROM users WHERE user_id = ?", c.teacher_id)?.nickname,
    meeting: c.meeting_url ? { title: c.meeting_title, url: c.meeting_url, time: toISO(c.meeting_time) } : null,
    memberCount: members.length,
    // 学生之间不显示名单，只有老师能看到全班同学
    members: mine
      ? members.map((m) => ({ userId: m.user_id, account: m.account, nickname: m.nickname, avatar: m.avatar, joinTime: toISO(m.join_time) }))
      : undefined,
    tasks, materials,
  };
}

// ===== 布置任务 =====
export function addTask(uid, classId, { kind, target, title, note, deadline }) {
  ownClass(uid, classId);
  if (kind === "chapter") {
    if (!/^(\d{2}|S\d{2}|[PFA]\d{2})_[\w-]+$/.test(String(target))) throw new Error("请选择要学习的章节");
  } else if (kind === "level") {
    if (!/^\d{1,2}$/.test(String(target))) throw new Error("请选择实战关卡");
  } else throw new Error("任务类型只能是章节学习或实战关卡");
  title = cleanText(title, 60, "任务名称");
  note = cleanText(note, 300, "任务说明", false);
  // 截止时间：前端传 2026-11-20T23:59 这样的格式，存成 2026-11-20 23:59
  let dl = null;
  if (deadline) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(deadline)) throw new Error("截止时间格式不对");
    dl = deadline.slice(0, 16).replace("T", " ");
  }
  const { lastInsertRowid } = run(
    "INSERT INTO class_tasks (class_id, kind, target, title, note, deadline) VALUES (?, ?, ?, ?, ?, ?)",
    classId, kind, String(target), title, note, dl);
  return { id: Number(lastInsertRowid) };
}

export function deleteTask(uid, classId, taskId) {
  ownClass(uid, classId);
  run("DELETE FROM class_tasks WHERE task_id = ? AND class_id = ?", taskId, classId);
}

// 某项任务每个学生的完成情况（老师看）
export function taskProgress(uid, classId, taskId) {
  ownClass(uid, classId);
  const t = one("SELECT * FROM class_tasks WHERE task_id = ? AND class_id = ?", taskId, classId);
  if (!t) throw new Error("没有这项任务");
  const students = all(
    `SELECT u.user_id, u.nickname, u.account FROM class_members m JOIN users u ON u.user_id = m.user_id
     WHERE m.class_id = ? ORDER BY m.join_time`, classId).map((s) => ({
    userId: s.user_id, nickname: s.nickname, account: s.account,
    done: isTaskDone(t, s.user_id),
    review: one("SELECT comment FROM task_reviews WHERE task_id = ? AND user_id = ?", taskId, s.user_id)?.comment || "",
  }));
  return { task: taskRow(t), students };
}

// 老师点评：写空内容就是删除点评
export function reviewTask(uid, classId, taskId, studentId, comment) {
  ownClass(uid, classId);
  if (!one("SELECT 1 FROM class_tasks WHERE task_id = ? AND class_id = ?", taskId, classId)) throw new Error("没有这项任务");
  comment = cleanText(comment, 200, "点评", false);
  if (!comment) return run("DELETE FROM task_reviews WHERE task_id = ? AND user_id = ?", taskId, studentId);
  run(`INSERT INTO task_reviews (task_id, user_id, comment) VALUES (?, ?, ?)
       ON CONFLICT (task_id, user_id) DO UPDATE SET comment = excluded.comment, create_time = datetime('now', 'localtime')`,
    taskId, studentId, comment);
}

// ===== 班级资料 =====
// 文件先用 /api/social/files 上传，拿到文件 id 再放进班级
export function addMaterial(uid, classId, { fileId, title }) {
  ownClass(uid, classId);
  const f = one("SELECT name FROM files WHERE file_id = ? AND user_id = ?", String(fileId || ""), uid);
  if (!f) throw new Error("请先上传文件");
  title = cleanText(title || f.name, 60, "资料名称");
  run("INSERT INTO class_materials (class_id, file_id, title) VALUES (?, ?, ?)", classId, String(fileId), title);
}

export function deleteMaterial(uid, classId, materialId) {
  ownClass(uid, classId);
  run("DELETE FROM class_materials WHERE material_id = ? AND class_id = ?", materialId, classId);
}

// ===== 视频会议：老师贴腾讯会议等平台的链接 =====
export function setMeeting(uid, classId, { title, url, time }) {
  ownClass(uid, classId);
  url = String(url || "").trim();
  if (!/^https:\/\/\S+$/.test(url) || url.length > 500) throw new Error("请粘贴以 https:// 开头的会议链接");
  title = cleanText(title || "班级视频会议", 40, "会议主题");
  let t = null;
  if (time) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time)) throw new Error("会议时间格式不对");
    t = time.slice(0, 16).replace("T", " ");
  }
  run("UPDATE classes SET meeting_title = ?, meeting_url = ?, meeting_time = ? WHERE class_id = ?", title, url, t, classId);
}

export function clearMeeting(uid, classId) {
  ownClass(uid, classId);
  run("UPDATE classes SET meeting_title = NULL, meeting_url = NULL, meeting_time = NULL WHERE class_id = ?", classId);
}
