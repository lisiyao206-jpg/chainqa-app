// server.mjs —— 网页版服务器（只用 Node 自带模块，不需要 npm install）
// 用法:
//   node server.mjs      然后浏览器打开 http://localhost:3000

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { answer } from "./rag.mjs";
import { listChapters, readChapter, chapterFile } from "./chapters.mjs";
import { getMindmap } from "./mindmap.mjs";
import { register, login, logout, userFromToken } from "./auth.mjs";

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = "public";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".webp": "image/webp",
};

// 读取请求体（问题以 JSON 形式发过来）
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// POST /api/ask：边生成边推给网页（SSE 流式），用户不用干等整段回答
async function handleAsk(req, res) {
  let question = "";
  try {
    question = String(JSON.parse(await readBody(req)).question || "").trim();
  } catch {}
  if (!question) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "问题不能为空" }));
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const { good, refused } = await answer(question, (delta) => send("delta", delta));
    // 回答里的 [1][2] 对应这里的引用来源
    send("sources", good.map((h) => ({
      file: h.file,
      heading: h.heading,
      score: Number(h.score.toFixed(3)),
      text: h.text.slice(0, 300),
    })));
    if (refused) send("refused", "知识库中未找到相关依据");
  } catch (err) {
    send("error", err.message);
  }
  res.end();
}

// 返回 JSON 的小工具
function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// GET /api/chapters：章节目录（分组）
function handleChapters(req, res) {
  try {
    sendJSON(res, 200, listChapters());
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// GET /api/chapters/23_Delegatecall：某一章的原文
function handleChapter(req, res, id) {
  const text = readChapter(decodeURIComponent(id));
  if (text === null) return sendJSON(res, 404, { error: "没有这一章" });
  sendJSON(res, 200, { id, text });
}

// GET /api/chapters/23_Delegatecall/mindmap：AI 生成的本章思维导图
async function handleMindmap(req, res, id) {
  try {
    const markdown = await getMindmap(decodeURIComponent(id));
    if (markdown === null) return sendJSON(res, 404, { error: "没有这一章" });
    sendJSON(res, 200, { id, markdown });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// GET /api/chapters/02_ValueTypes/files/img/2-1.png：教材里的插图
function handleChapterFile(req, res, id, relPath) {
  const file = chapterFile(decodeURIComponent(id), decodeURIComponent(relPath));
  if (!file) {
    res.writeHead(404);
    return res.end("Not Found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// ===== 账号相关 =====
// 前端每次请求都在请求头里带上 Authorization: Bearer <token>，这里把 token 取出来
function getToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

// 读取 JSON 格式的请求体
async function readJSON(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch {
    return {};
  }
}

// POST /api/register：注册（成功后直接登录）
async function handleRegister(req, res) {
  const { account, pwd, nickname } = await readJSON(req);
  try {
    sendJSON(res, 200, register(account, pwd, nickname));
  } catch (err) {
    sendJSON(res, 400, { error: err.message });
  }
}

// POST /api/login：登录
async function handleLogin(req, res) {
  const { account, pwd } = await readJSON(req);
  try {
    sendJSON(res, 200, login(account, pwd));
  } catch (err) {
    sendJSON(res, 401, { error: err.message });
  }
}

// POST /api/logout：退出
function handleLogout(req, res) {
  logout(getToken(req));
  sendJSON(res, 200, { ok: true });
}

// GET /api/me：我是谁（前端刷新页面后，用它确认还在不在登录状态）
function handleMe(req, res) {
  const user = userFromToken(getToken(req));
  if (!user) return sendJSON(res, 401, { error: "未登录或登录已过期" });
  sendJSON(res, 200, { user });
}

// 其余请求：返回 public/ 下的静态文件
function handleStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath));
  // 防止通过 ../ 读到 public 以外的文件（比如 .env）
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end("Not Found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const chapterMatch = req.url.match(/^\/api\/chapters\/([^/?]+)$/);
    const fileMatch = req.url.match(/^\/api\/chapters\/([^/?]+)\/files\/([^?]+)/);
    const mindmapMatch = req.url.match(/^\/api\/chapters\/([^/?]+)\/mindmap$/);
    if (req.method === "POST" && req.url === "/api/ask") handleAsk(req, res);
    else if (req.method === "POST" && req.url === "/api/register") handleRegister(req, res);
    else if (req.method === "POST" && req.url === "/api/login") handleLogin(req, res);
    else if (req.method === "POST" && req.url === "/api/logout") handleLogout(req, res);
    else if (req.method === "GET" && req.url === "/api/me") handleMe(req, res);
    else if (req.method === "GET" && req.url === "/api/chapters") handleChapters(req, res);
    else if (req.method === "GET" && chapterMatch) handleChapter(req, res, chapterMatch[1]);
    else if (req.method === "GET" && mindmapMatch) handleMindmap(req, res, mindmapMatch[1]);
    else if (req.method === "GET" && fileMatch) handleChapterFile(req, res, fileMatch[1], fileMatch[2]);
    else if (req.method === "GET") handleStatic(req, res);
    else {
      res.writeHead(405);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`✅ 链知答已启动：http://localhost:${PORT}`));
