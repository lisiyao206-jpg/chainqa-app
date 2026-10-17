// rag.mjs —— 单文件 RAG（仅需智谱 API Key）
// 用法:
//   node rag.mjs build          构建知识库
//   node rag.mjs ask "你的问题"  提问
// 也可以被 server.mjs 导入，给网页提供问答能力。

import fs from "node:fs";
import path from "node:path";

// ---------- 读取 .env ----------
function loadEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const ZHIPU_KEY = process.env.ZHIPU_API_KEY;
const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const DB_FILE = "vectors.json";
const DOCS_DIR = "knowledge";

if (!ZHIPU_KEY) {
  console.error("❌ 请在 .env 文件里填写 ZHIPU_API_KEY");
  process.exit(1);
}

// ---------- 1. 扫描文档 ----------
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    // 跳过：隐藏文件夹、外语副本、专题、第三方代码库（lib 里多是英文说明文件）
    if (name.startsWith(".") || ["Languages", "Topics", "lib", "node_modules"].includes(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(md|txt)$/i.test(name)) out.push(full);
  }
  return out;
}

// ---------- 2. 切块 ----------
function splitDoc(text, fileName) {
  const lines = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").split(/\r?\n/);
  const chunks = [];
  let heading = fileName;
  let buf = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body.length >= 40) {
      for (let i = 0; i < body.length; i += 800) {
        chunks.push({ heading, text: body.slice(i, i + 900) });
      }
    }
    buf = [];
  };

  for (const line of lines) {
    const h = line.match(/^\s*#{1,3}\s*(.+)$/);
    if (h) { flush(); heading = h[1].trim(); continue; }
    buf.push(line);
  }
  flush();
  return chunks;
}

// ---------- 3. 向量化 ----------
async function embed(texts) {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ZHIPU_KEY}` },
    body: JSON.stringify({ model: "embedding-3", input: texts }),
  });
  if (!res.ok) throw new Error("向量化失败: " + (await res.text()));
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

// ---------- 4. 构建知识库 ----------
async function build() {
  const files = walk(DOCS_DIR);
  if (!files.length) {
    console.log(`❌ ${DOCS_DIR}/ 下没有 .md 或 .txt 文件`);
    return;
  }
  console.log(`找到 ${files.length} 个文件`);

  const items = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf-8");
    const name = path.relative(DOCS_DIR, f);
    for (const c of splitDoc(content, name)) {
      items.push({ file: name, heading: c.heading, text: c.text });
    }
  }
  console.log(`切分出 ${items.length} 个片段`);

  // 复用上次已向量化的结果，只算新增/变更的片段
  let cache = new Map();
  if (fs.existsSync(DB_FILE)) {
    for (const old of JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))) {
      if (old.vector) cache.set(old.file + "|" + old.heading + "|" + old.text, old.vector);
    }
    console.log(`已缓存 ${cache.size} 个片段的向量`);
  }

  const todo = [];
  for (const it of items) {
    const key = it.file + "|" + it.heading + "|" + it.text;
    const hit = cache.get(key);
    if (hit) it.vector = hit;
    else todo.push(it);
  }
  console.log(`需要新向量化 ${todo.length} 个片段`);

  const BATCH = 20;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const vectors = await embed(slice.map((s) => `【${s.heading}】${s.text}`));
    slice.forEach((s, j) => (s.vector = vectors[j]));
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    // 每批都落盘，中断也不会白跑
    fs.writeFileSync(DB_FILE, JSON.stringify(items.filter((x) => x.vector)));
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(items.filter((x) => x.vector)));

  console.log(`✅ 完成，已保存到 ${DB_FILE}`);
}

// ---------- 5. 检索 ----------
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 向量库只读一次，之后留在内存里（网页连续提问时不用每次重新读文件）
let dbCache = null;
function loadDB() {
  if (!dbCache) {
    if (!fs.existsSync(DB_FILE)) throw new Error("请先运行: node rag.mjs build");
    dbCache = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  }
  return dbCache;
}

export async function search(question, topK = 4) {
  const items = loadDB();
  const [qv] = await embed([question]);
  return items
    .map((it) => ({ ...it, score: cosine(qv, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ---------- 6. 生成回答（GLM-4-Flash 免费）----------
const SYSTEM_PROMPT = `你是区块链课程知识问答助手。规则：
1. 只能依据【参考资料】回答，禁止使用资料之外的知识推测。
2. 关键结论后标注来源编号，格式 [1][2]。
3. 资料不足时必须回答"知识库中未找到相关依据"，不得编造。
4. 用中文回答，结构清晰，代码用 Markdown 代码块。`;

// 检索 + 生成。onDelta 每收到一小段回答就被调用一次（命令行打印、网页推送都用它）
// 返回检索结果；没有达到相似度阈值的资料时 refused 为 true，不调用大模型
export async function answer(question, onDelta) {
  const hits = await search(question);
  const THRESHOLD = 0.35;
  const good = hits.filter((h) => h.score >= THRESHOLD);
  if (!good.length) return { hits, good, refused: true };

  const context = good
    .map((h, i) => `[${i + 1}] 来源：${h.file} > ${h.heading}\n${h.text}`)
    .join("\n\n---\n\n");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ZHIPU_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0.2,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `【参考资料】\n${context}\n\n【问题】\n${question}` },
      ],
    }),
  });
  if (!res.ok) throw new Error("生成失败: " + (await res.text()));

  // 智谱按 SSE 格式流式返回，每行形如 data: {...}
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {}
    }
  }
  return { hits, good, refused: false };
}

// 命令行提问：在终端打印检索结果和回答
async function ask(question) {
  let printedHeader = false;
  const { hits, refused } = await answer(question, (delta) => {
    if (!printedHeader) {
      console.log("\n💬 回答：\n");
      printedHeader = true;
    }
    process.stdout.write(delta);
  });

  console.log("\n\n🔍 检索结果：");
  hits.forEach((h, i) =>
    console.log(`  [${i + 1}] ${h.score.toFixed(3)} | ${h.file} > ${h.heading}`)
  );
  if (refused) console.log("\n⚠️  知识库中未找到相关依据，拒绝回答。");
  console.log();
}

// ---------- 入口 ----------
// 只有直接运行 node rag.mjs 时才执行命令；被 server.mjs 导入时跳过
if (path.basename(process.argv[1] || "") === "rag.mjs") {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "build") build();
  else if (cmd === "ask") ask(arg || "什么是智能合约");
  else console.log('用法:\n  node rag.mjs build\n  node rag.mjs ask "你的问题"');
}
