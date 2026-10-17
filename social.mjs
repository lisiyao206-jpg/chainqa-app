// social.mjs —— 情报站：好友、聊天（私聊 + 讨论组）、好友圈、文件
// 和 data.mjs 一样，每个函数第一个参数都是 userId（当前登录的人），所有权限都在这里检查：
//   只能和好友私聊；只有成员能看、能发讨论组的消息；好友圈只给自己和好友看；文件只有「有资格看到它的人」能下载

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.mjs";

const toISO = (t) => (t ? t.replace(" ", "T") : t);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);

function userBrief(id) {
  const u = one("SELECT user_id, account, nickname, avatar FROM users WHERE user_id = ?", id);
  return u && { userId: u.user_id, account: u.account, nickname: u.nickname || u.account, avatar: u.avatar || null };
}
const isFriend = (uid, fid) => !!one("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?", uid, fid);
const isAdmin = (uid) => one("SELECT role FROM users WHERE user_id = ?", uid)?.role === "admin";
const isMember = (uid, roomId) => !!one("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?", roomId, uid);

// 文字检查：去掉首尾空格，不能太长
function cleanText(text, max, label) {
  text = String(text ?? "").trim();
  if (text.length > max) throw new Error(`${label}最多 ${max} 个字`);
  return text;
}

// 防刷屏：同一个人 10 秒内最多发 10 条（消息、动态、评论一起算）
const recent = new Map();
function rateLimit(uid) {
  const now = Date.now();
  const list = (recent.get(uid) || []).filter((t) => now - t < 10_000);
  if (list.length >= 10) throw new Error("发得太快了，歇一会儿再发");
  list.push(now);
  recent.set(uid, list);
}

// ===== 好友 =====

// 按账号找人，顺便告诉前端「我和他是什么关系」，决定按钮显示「加好友」还是「已是好友」
export function searchUser(uid, account) {
  const u = one("SELECT user_id FROM users WHERE account = ? AND status = 'active'", String(account || "").trim());
  if (!u) throw new Error("没有找到这个账号");
  return relationOf(uid, u.user_id);
}

// 模糊搜人：按「一个一个字」匹配账号或昵称。
// 输入「小白」→ 匹配模式 %小%白%：昵称里依次出现「小」和「白」就算找到（中间隔着别的字也行），
// 所以只记得对方名字里的几个字也能搜到。最多返回 10 个人
export function searchUsers(uid, keyword) {
  const chars = [...String(keyword || "")].filter((c) => c.trim()).slice(0, 20); // 空格不算
  if (!chars.length) return [];
  // % 和 _ 在 LIKE 里有特殊含义，用户输入的要先「转义」成普通字符
  const pattern = "%" + chars.map((c) => c.replace(/[\\%_]/g, (x) => "\\" + x)).join("%") + "%";
  return all(`SELECT user_id FROM users WHERE status = 'active'
              AND (account LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')
              ORDER BY (account = ?) DESC, user_id LIMIT 10`, pattern, pattern, chars.join(""))
    .map((u) => relationOf(uid, u.user_id));
}

function relationOf(uid, fid) {
  let relation = "none";
  if (fid === uid) relation = "self";
  else if (isFriend(uid, fid)) relation = "friend";
  else if (one("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", uid, fid)) relation = "pending";
  return { ...userBrief(fid), relation };
}

export function sendRequest(uid, account) {
  const target = searchUser(uid, account);
  if (target.relation === "self") throw new Error("不能加自己为好友");
  if (target.relation === "friend") throw new Error("你们已经是好友了");
  if (target.relation === "pending") throw new Error("已经发过申请了，等对方同意吧");
  // 对方之前也向我发过申请：直接成为好友
  const reverse = one("SELECT request_id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", target.userId, uid);
  if (reverse) return respondRequest(uid, reverse.request_id, true);
  run("INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)", uid, target.userId);
  return { ok: true, message: "申请已发送" };
}

// 别人发给我、还没处理的申请
export function listRequests(uid) {
  return all("SELECT * FROM friend_requests WHERE to_id = ? AND status = 'pending' ORDER BY request_id DESC", uid).map((r) => ({
    id: r.request_id, from: userBrief(r.from_id), time: toISO(r.create_time),
  }));
}

export function respondRequest(uid, requestId, accept) {
  const r = one("SELECT * FROM friend_requests WHERE request_id = ? AND to_id = ? AND status = 'pending'", requestId, uid);
  if (!r) throw new Error("这条申请不存在或已处理");
  run("UPDATE friend_requests SET status = ? WHERE request_id = ?", accept ? "accepted" : "rejected", requestId);
  if (accept) {
    run("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)", uid, r.from_id);
    run("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)", r.from_id, uid);
  }
  return { ok: true, message: accept ? "已添加好友" : "已拒绝" };
}

export function listFriends(uid) {
  return all("SELECT friend_id FROM friends WHERE user_id = ? ORDER BY create_time DESC", uid).map((r) => userBrief(r.friend_id));
}

export function removeFriend(uid, fid) {
  run("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", uid, fid, fid, uid);
}

// ===== 聊天室 =====

// 和好友私聊：已经有私聊房间就用原来的，没有就新建
export function openDM(uid, fid) {
  if (!isFriend(uid, fid)) throw new Error("只能和好友私聊");
  const old = one(`SELECT r.room_id FROM rooms r
    JOIN room_members a ON a.room_id = r.room_id AND a.user_id = ?
    JOIN room_members b ON b.room_id = r.room_id AND b.user_id = ?
    WHERE r.type = 'dm'`, uid, fid);
  if (old) return { roomId: old.room_id };
  const { lastInsertRowid: roomId } = run("INSERT INTO rooms (type, owner_id) VALUES ('dm', ?)", uid);
  run("INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)", roomId, uid, roomId, fid);
  return { roomId: Number(roomId) };
}

// 建讨论组：只能拉自己的好友
export function createGroup(uid, name, memberIds = []) {
  name = cleanText(name, 20, "讨论组名");
  if (!name) throw new Error("给讨论组起个名字吧");
  const ids = [...new Set(memberIds.map(Number))].filter((id) => id !== uid);
  if (ids.some((id) => !isFriend(uid, id))) throw new Error("只能拉好友进讨论组");
  const { lastInsertRowid: roomId } = run("INSERT INTO rooms (type, name, owner_id) VALUES ('group', ?, ?)", name, uid);
  for (const id of [uid, ...ids]) run("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)", roomId, id);
  return { roomId: Number(roomId) };
}

// 往讨论组里加人：自己得是成员，而且只能加自己的好友
export function addMembers(uid, roomId, memberIds = []) {
  const room = one("SELECT * FROM rooms WHERE room_id = ? AND type = 'group'", roomId);
  if (!room || !isMember(uid, roomId)) throw new Error("没有这个讨论组");
  for (const id of memberIds.map(Number)) {
    if (!isFriend(uid, id)) throw new Error("只能拉好友进讨论组");
    run("INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)", roomId, id);
  }
}

export function leaveRoom(uid, roomId) {
  run("DELETE FROM room_members WHERE room_id = ? AND user_id = ?", roomId, uid);
  // 人都走光了，房间和里面的消息一起删掉
  if (!one("SELECT 1 FROM room_members WHERE room_id = ?", roomId)) run("DELETE FROM rooms WHERE room_id = ?", roomId);
}

// 我的聊天列表：每个房间显示名字、最后一条消息、未读数，按最后消息时间排
export function listRooms(uid) {
  const rows = all(`SELECT r.*, m.last_read,
      (SELECT COUNT(*) FROM room_members WHERE room_id = r.room_id) AS member_count,
      (SELECT MAX(msg_id) FROM messages WHERE room_id = r.room_id) AS last_id
    FROM rooms r JOIN room_members m ON m.room_id = r.room_id AND m.user_id = ?`, uid);
  return rows
    .map((r) => {
      const last = r.last_id ? one("SELECT * FROM messages WHERE msg_id = ?", r.last_id) : null;
      let name = r.name, peer = null;
      if (r.type === "dm") {
        const other = one("SELECT user_id FROM room_members WHERE room_id = ? AND user_id != ?", r.room_id, uid);
        peer = other ? userBrief(other.user_id) : null;
        name = peer ? peer.nickname : "（已离开）";
      }
      return {
        id: r.room_id, type: r.type, name, peer, memberCount: r.member_count,
        last: last && { text: last.content || (last.file_id ? "[文件]" : ""), time: toISO(last.create_time), from: userBrief(last.user_id)?.nickname },
        unread: one("SELECT COUNT(*) AS n FROM messages WHERE room_id = ? AND msg_id > ? AND user_id != ?", r.room_id, r.last_read, uid).n,
        sortKey: r.last_id || 0,
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

export function roomMembers(uid, roomId) {
  if (!isMember(uid, roomId)) throw new Error("没有这个聊天");
  return all("SELECT user_id FROM room_members WHERE room_id = ?", roomId).map((r) => userBrief(r.user_id));
}

function fileBrief(fileId) {
  const f = fileId && one("SELECT * FROM files WHERE file_id = ?", fileId);
  const ext = f && path.extname(f.name).toLowerCase();
  return f ? { id: f.file_id, name: f.name, size: f.size, isImage: IMAGE_EXT.includes(ext), isVideo: VIDEO_EXT.includes(ext) } : null;
}
function msgRow(r) {
  return { id: r.msg_id, from: userBrief(r.user_id), text: r.content, file: fileBrief(r.file_id), time: toISO(r.create_time) };
}

// 取消息：after = 0 时取最近 50 条；after = 某条消息 id 时只取比它新的（前端每 2 秒来问一次）
export function listMessages(uid, roomId, after = 0) {
  if (!isMember(uid, roomId)) throw new Error("没有这个聊天");
  const rows = after
    ? all("SELECT * FROM messages WHERE room_id = ? AND msg_id > ? ORDER BY msg_id", roomId, after)
    : all("SELECT * FROM (SELECT * FROM messages WHERE room_id = ? ORDER BY msg_id DESC LIMIT 50) ORDER BY msg_id", roomId);
  // 看过了：记下读到哪一条，未读数就清零
  if (rows.length) run("UPDATE room_members SET last_read = MAX(last_read, ?) WHERE room_id = ? AND user_id = ?", rows.at(-1).msg_id, roomId, uid);
  return rows.map(msgRow);
}

export function sendMessage(uid, roomId, { text, fileId }) {
  if (!isMember(uid, roomId)) throw new Error("没有这个聊天");
  const room = one("SELECT * FROM rooms WHERE room_id = ?", roomId);
  if (room.type === "dm") {
    const other = one("SELECT user_id FROM room_members WHERE room_id = ? AND user_id != ?", roomId, uid);
    if (!other || !isFriend(uid, other.user_id)) throw new Error("你们已经不是好友了，不能再发消息");
  }
  text = cleanText(text, 1000, "一条消息");
  if (fileId && !one("SELECT 1 FROM files WHERE file_id = ? AND user_id = ?", fileId, uid)) throw new Error("文件不存在");
  if (!text && !fileId) throw new Error("消息不能为空");
  rateLimit(uid);
  const { lastInsertRowid } = run("INSERT INTO messages (room_id, user_id, content, file_id) VALUES (?, ?, ?, ?)", roomId, uid, text, fileId || null);
  return msgRow(one("SELECT * FROM messages WHERE msg_id = ?", lastInsertRowid));
}

// ===== 好友圈 =====

// 能不能看到这条帖子：广场帖子所有人都能看；好友圈动态只有自己和好友能看
function canSeePost(uid, post) {
  return post && (post.visibility === "public" || post.user_id === uid || isFriend(uid, post.user_id));
}
function postRow(uid, p) {
  return {
    id: p.post_id, author: userBrief(p.user_id), title: p.title, text: p.content, file: fileBrief(p.file_id), time: toISO(p.create_time),
    mine: p.user_id === uid,
    friend: isFriend(uid, p.user_id), // 广场上看到不认识的人，可以直接加好友
    canDelete: p.user_id === uid || isAdmin(uid), // 管理员可以删掉广场上不合适的帖子
    likes: all("SELECT user_id FROM post_likes WHERE post_id = ?", p.post_id).map((r) => userBrief(r.user_id).nickname),
    liked: !!one("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", p.post_id, uid),
    favorited: !!one("SELECT 1 FROM post_favorites WHERE post_id = ? AND user_id = ?", p.post_id, uid),
    // 好友圈：评论只显示「我能看到的人」写的，和微信朋友圈一样；广场：所有评论都公开
    comments: all("SELECT * FROM post_comments WHERE post_id = ? ORDER BY comment_id", p.post_id)
      .filter((c) => p.visibility === "public" || c.user_id === uid || isFriend(uid, c.user_id))
      .map((c) => ({ id: c.comment_id, from: userBrief(c.user_id), text: c.content, mine: c.user_id === uid, canDelete: c.user_id === uid || isAdmin(uid) })),
  };
}

// 好友圈：自己和好友发的「好友圈动态」
export function listPosts(uid) {
  return all(`SELECT * FROM posts WHERE visibility = 'friends'
                AND (user_id = ? OR user_id IN (SELECT friend_id FROM friends WHERE user_id = ?))
              ORDER BY post_id DESC LIMIT 50`, uid, uid).map((p) => postRow(uid, p));
}

// 广场：所有人的公开帖子。sort = 'new' 最新 / 'hot' 最热（按点赞数 + 评论数排）
export function listSquare(uid, sort = "new") {
  const order = sort === "hot"
    ? `(SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
       + (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.post_id) DESC, p.post_id DESC`
    : "p.post_id DESC";
  return all(`SELECT * FROM posts p WHERE visibility = 'public' ORDER BY ${order} LIMIT 50`).map((p) => postRow(uid, p));
}

export function createPost(uid, { text, fileId, title, visibility }) {
  const isPublic = visibility === "public";
  text = cleanText(text, isPublic ? 2000 : 500, isPublic ? "帖子正文" : "一条动态");
  title = isPublic ? cleanText(title, 40, "标题") : null;
  if (isPublic && !title) throw new Error("给帖子起个标题吧");
  if (fileId && !one("SELECT 1 FROM files WHERE file_id = ? AND user_id = ?", fileId, uid)) throw new Error("文件不存在");
  if (!text && !fileId) throw new Error("写点什么再发吧");
  rateLimit(uid);
  const { lastInsertRowid } = run("INSERT INTO posts (user_id, content, file_id, title, visibility) VALUES (?, ?, ?, ?, ?)",
    uid, text, fileId || null, title, isPublic ? "public" : "friends");
  return postRow(uid, one("SELECT * FROM posts WHERE post_id = ?", lastInsertRowid));
}

// 自己的帖子自己能删；管理员能删任何帖子（广场是公开的，要有人管）
export function deletePost(uid, postId) {
  if (isAdmin(uid)) run("DELETE FROM posts WHERE post_id = ?", postId);
  else run("DELETE FROM posts WHERE post_id = ? AND user_id = ?", postId, uid);
}

export function toggleLike(uid, postId) {
  if (!canSeePost(uid, one("SELECT * FROM posts WHERE post_id = ?", postId))) throw new Error("这条动态不存在");
  const had = run("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", postId, uid).changes;
  if (!had) run("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", postId, uid);
}

// 收藏 / 取消收藏（和点赞一样，点一下切换）
export function toggleFavorite(uid, postId) {
  if (!canSeePost(uid, one("SELECT * FROM posts WHERE post_id = ?", postId))) throw new Error("这条帖子不存在");
  const had = run("DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?", postId, uid).changes;
  if (!had) run("INSERT INTO post_favorites (post_id, user_id) VALUES (?, ?)", postId, uid);
}

// ===== 学习站 =====
// 我点赞过、收藏过的帖子都在这里，分成两类：kind = 'video' 带视频的 / 'text' 笔记和文本（其余的）
// 还要再检查一次「现在还能不能看」：比如好友圈的动态，删了好友之后就不该再看到了
export function listStudy(uid, kind = "text") {
  return all(`SELECT DISTINCT p.* FROM posts p
              WHERE p.post_id IN (SELECT post_id FROM post_likes WHERE user_id = ?)
                 OR p.post_id IN (SELECT post_id FROM post_favorites WHERE user_id = ?)
              ORDER BY p.post_id DESC`, uid, uid)
    .filter((p) => canSeePost(uid, p))
    .map((p) => postRow(uid, p))
    .filter((p) => (kind === "video" ? p.file?.isVideo : !p.file?.isVideo));
}

// 移出学习站：同时取消点赞和收藏
export function removeFromStudy(uid, postId) {
  run("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", postId, uid);
  run("DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?", postId, uid);
}

export function addComment(uid, postId, text) {
  if (!canSeePost(uid, one("SELECT * FROM posts WHERE post_id = ?", postId))) throw new Error("这条动态不存在");
  text = cleanText(text, 200, "一条评论");
  if (!text) throw new Error("评论不能为空");
  rateLimit(uid);
  run("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)", postId, uid, text);
}

export function deleteComment(uid, commentId) {
  if (isAdmin(uid)) return void run("DELETE FROM post_comments WHERE comment_id = ?", commentId);
  run("DELETE FROM post_comments WHERE comment_id = ? AND user_id = ?", commentId, uid);
}

// ===== 文件 =====
// 文件存在项目根目录的 uploads/ 文件夹（记得把 uploads/ 写进 .gitignore，不要传到 GitHub）
const UPLOAD_DIR = "uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_SIZE = 10 * 1024 * 1024;       // 普通文件最大 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 视频最大 50MB
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const VIDEO_EXT = [".mp4", ".webm"]; // 浏览器都能直接播放的两种视频格式
// 只允许这些类型：学习资料常用的格式。不允许 .exe、.html、.svg 这类可能带病毒或脚本的文件
const ALLOWED_EXT = [...IMAGE_EXT, ...VIDEO_EXT, ".pdf", ".txt", ".md", ".sol", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip"];

// 上传：请求体就是文件本身（不是 JSON），文件名放在请求头 X-File-Name 里
export function saveUpload(uid, req) {
  return new Promise((resolve, reject) => {
    let name = "";
    try {
      name = decodeURIComponent(req.headers["x-file-name"] || "");
    } catch {}
    name = path.basename(name).slice(0, 100); // 只要文件名本身，去掉路径
    const ext = path.extname(name).toLowerCase();
    if (!name || !ALLOWED_EXT.includes(ext)) {
      req.resume();
      return reject(new Error(`不支持这种文件，可以传：${ALLOWED_EXT.join(" ")}`));
    }
    const limit = VIDEO_EXT.includes(ext) ? MAX_VIDEO_SIZE : MAX_SIZE;
    const limitText = `${VIDEO_EXT.includes(ext) ? "视频" : "文件"}不能超过 ${limit / 1024 / 1024}MB`;
    if (Number(req.headers["content-length"] || 0) > limit) {
      req.resume();
      return reject(new Error(limitText));
    }
    const id = crypto.randomBytes(16).toString("hex");
    const file = path.join(UPLOAD_DIR, id);
    const out = fs.createWriteStream(file);
    let size = 0, failed = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      // 有人谎报大小：边收边数，超过就停
      if (size > limit && !failed) {
        failed = true;
        out.destroy();
        fs.rm(file, () => {});
        reject(new Error(limitText));
      }
    });
    req.pipe(out);
    out.on("finish", () => {
      if (failed) return;
      run("INSERT INTO files (file_id, user_id, name, size) VALUES (?, ?, ?, ?)", id, uid, name, size);
      resolve(fileBrief(id));
    });
    out.on("error", (err) => !failed && reject(err));
  });
}

// 下载前检查：上传者本人；或者这个文件发在我所在的聊天里；或者发在我能看到的好友圈动态里；
// 或者它是某个人正在用的头像（头像本来就是给大家看的）
export function getFile(uid, fileId) {
  const f = one("SELECT * FROM files WHERE file_id = ?", String(fileId));
  if (!f) return null;
  const ok =
    f.user_id === uid ||
    one("SELECT 1 FROM users WHERE avatar = ?", "file:" + f.file_id) ||
    one(`SELECT 1 FROM messages m JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = ? WHERE m.file_id = ?`, uid, f.file_id) ||
    all("SELECT * FROM posts WHERE file_id = ?", f.file_id).some((p) => canSeePost(uid, p));
  if (!ok) return null;
  const ext = path.extname(f.name).toLowerCase();
  return { path: path.join(UPLOAD_DIR, f.file_id), name: f.name, isMedia: IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext), ext };
}
