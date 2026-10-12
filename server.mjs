// server.mjs —— 网页版服务器（只用 Node 自带模块，不需要 npm install）
// 用法:
//   node server.mjs      然后浏览器打开 http://localhost:3000

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { answer } from "./rag.mjs";

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = "public";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

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
    if (req.method === "POST" && req.url === "/api/ask") handleAsk(req, res);
    else if (req.method === "GET") handleStatic(req, res);
    else {
      res.writeHead(405);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`✅ 链知答已启动：http://localhost:${PORT}`));
