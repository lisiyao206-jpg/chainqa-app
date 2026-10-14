// mindmap.mjs —— 让 AI 读一章教材，生成这一章的思维导图（Markdown 大纲格式）
// 生成过的导图会存到 mindmaps/ 文件夹，下次直接读，不用再等 AI

import fs from "node:fs";
import path from "node:path";
import { readChapter } from "./chapters.mjs";

const CACHE_DIR = "mindmaps";
const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

const PROMPT = `你是区块链课程助教。请把下面这一讲教材整理成思维导图，要求：
1. 只输出 Markdown 大纲，不要任何解释，不要用代码块包起来。
2. 第一行用「# 」写本讲主题。
3. 用「## 」写 3~6 个核心知识点，每个知识点下用「- 」列 2~4 条要点（可以嵌套一层）。
4. 每条要点不超过 20 个字，提炼概念、关键语法和易错点，不要抄原文长句。`;

// 调用智谱（不需要流式，等它一次性写完）
async function chat(content) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0.3,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error("生成失败: " + (await res.text()));
  const json = await res.json();
  return json.choices[0].message.content;
}

// 拿到某一章的思维导图：有缓存就直接用，没有就让 AI 生成并存下来
export async function getMindmap(id) {
  const text = readChapter(id);
  if (text === null) return null;

  const cacheFile = path.join(CACHE_DIR, id + ".md");
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf-8");

  // 教材太长时只取前 8000 字，够 AI 抓住重点，也省 token
  let md = await chat(text.slice(0, 8000));
  // 万一 AI 还是用 ``` 包起来了，去掉
  md = md.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "").trim();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, md);
  return md;
}
