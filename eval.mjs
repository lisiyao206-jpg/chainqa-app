// eval/eval.mjs —— RAG 效果评测：用数据证明「检索增强」让回答变好了
//
// 对 questions.json 里的 30 道题，每道题回答两遍：
//   A. 有 RAG：我们的白帽导师（先在教材里检索，再依据资料回答，查不到就拒答）
//   B. 没 RAG：同一个大模型（glm-4-flash）直接回答，不给任何资料
// 然后自动打分：
//   要点覆盖率  教材内的 20 题：回答里提到了几个必答要点（keywords）
//   出处标注率  回答里有没有标注引用来源 [1][2]，能不能核对
//   正确拒答率  教材外的 10 题：有没有老老实实说「不知道」，而不是瞎编
//   误拒率      教材内的题却被拒答了（说明检索没找到）
//   平均耗时
// 结果写到 eval/results.json（每道题的详细回答）、eval/report.md（给技术文档用）、eval/report.html（带图表，给答辩用）
//
// 用法：在项目根目录运行  node eval/eval.mjs     （要先建好知识库：node rag.mjs build）
// 费用：大模型 glm-4-flash 免费；只有检索用的向量接口收费，30 道题合计不到 1 分钱

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { answer } from "../rag.mjs";

const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const DIR = path.dirname(fileURLToPath(import.meta.url)); // eval 文件夹（路径里有中文、空格也没问题）
const { in: inScope, out: outScope } = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf-8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// B 组：不给资料，直接问大模型
async function plain(question) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是区块链课程助手，用中文回答用户的问题。" },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).choices[0].message.content;
}

// A 组：我们的 RAG
async function withRag(question) {
  let text = "";
  const { refused, good } = await answer(question, (d) => (text += d));
  return { text: refused ? "知识库中未找到相关依据" : text, refused, sources: good.map((h) => `${h.file} › ${h.heading}`) };
}

const REFUSE = /未找到相关依据|没有找到|无法回答|不在.{0,6}范围|超出.{0,6}范围|与.{0,8}无关|无法提供|不知道|没有相关/;
const keywordScore = (text, groups) => groups.filter((g) => new RegExp(g.split("|").map((s) => s.replace(/[.*+?^${}()[\]\\]/g, "\\$&")).join("|"), "i").test(text)).length / groups.length;
const hasCite = (text) => /\[\d+\]/.test(text);

async function timed(fn) {
  const t = Date.now();
  try {
    return { ...(await fn()), ms: Date.now() - t };
  } catch (err) {
    return { text: "", error: err.message, ms: Date.now() - t };
  }
}

const results = [];
const all = [...inScope.map((x) => ({ ...x, scope: "in" })), ...outScope.map((q) => ({ q, scope: "out" }))];
for (const [i, item] of all.entries()) {
  process.stdout.write(`[${i + 1}/${all.length}] ${item.q} ... `);
  const a = await timed(() => withRag(item.q));
  await sleep(500);
  const b = await timed(async () => ({ text: await plain(item.q) }));
  await sleep(500);
  const row = { ...item, rag: a, plain: b };
  if (item.scope === "in") {
    row.score = { rag: keywordScore(a.text, item.keywords), plain: keywordScore(b.text, item.keywords) };
  } else {
    row.score = { rag: a.refused || REFUSE.test(a.text) ? 1 : 0, plain: REFUSE.test(b.text) ? 1 : 0 };
  }
  results.push(row);
  console.log(item.scope === "in" ? `要点 RAG ${(row.score.rag * 100) | 0}% / 无RAG ${(row.score.plain * 100) | 0}%` : `拒答 RAG ${row.score.rag ? "✓" : "✗"} / 无RAG ${row.score.plain ? "✓" : "✗"}`);
}

// ===== 汇总 =====
const ins = results.filter((r) => r.scope === "in"), outs = results.filter((r) => r.scope === "out");
const avg = (arr, f) => arr.reduce((s, r) => s + f(r), 0) / (arr.length || 1);
const pct = (x) => Math.round(x * 100);
const M = {
  coverage: { rag: pct(avg(ins, (r) => r.score.rag)), plain: pct(avg(ins, (r) => r.score.plain)) },
  cite: { rag: pct(avg(ins, (r) => (hasCite(r.rag.text) ? 1 : 0))), plain: pct(avg(ins, (r) => (hasCite(r.plain.text) ? 1 : 0))) },
  refuse: { rag: pct(avg(outs, (r) => r.score.rag)), plain: pct(avg(outs, (r) => r.score.plain)) },
  falseRefuse: { rag: pct(avg(ins, (r) => (r.rag.refused ? 1 : 0))), plain: pct(avg(ins, (r) => (REFUSE.test(r.plain.text) ? 1 : 0))) },
  ms: { rag: Math.round(avg(results, (r) => r.rag.ms)), plain: Math.round(avg(results, (r) => r.plain.ms)) },
};
const time = new Date().toLocaleString("zh-CN");
fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify({ time, metrics: M, results }, null, 2));

const rows = [
  ["要点覆盖率（教材内 20 题，越高越好）", M.coverage],
  ["出处标注率（越高越好，能核对原文）", M.cite],
  ["正确拒答率（教材外 10 题，越高越好，不瞎编）", M.refuse],
  ["误拒率（教材内却拒答，越低越好）", M.falseRefuse],
];
const md = `# RAG 效果评测报告

评测时间：${time}　模型：glm-4-flash　题目：教材内 ${ins.length} 题 + 教材外 ${outs.length} 题（见 eval/questions.json）

| 指标 | 有 RAG（白帽导师） | 没有 RAG（直接问大模型） |
|---|---|---|
${rows.map(([n, v]) => `| ${n} | **${v.rag}%** | ${v.plain}% |`).join("\n")}
| 平均耗时 | ${M.ms.rag} ms | ${M.ms.plain} ms |

## 说明
- **要点覆盖率**：每道题预先列出答对必须提到的要点，统计回答覆盖了多少。
- **出处标注率**：回答里是否标注了 [1][2] 这样的引用来源，用户可以点开核对教材原文。
- **正确拒答率**：问天气、电影这类教材外的问题时，是否明确说「知识库中未找到相关依据」，而不是编一个答案。
- **误拒率**：教材里明明有答案却拒答了，说明检索没找到，是需要改进的地方。

## 逐题结果
| # | 题目 | 有 RAG | 没有 RAG |
|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.q} | ${r.scope === "in" ? pct(r.score.rag) + "%" : r.score.rag ? "✓ 拒答" : "✗ 回答了"} | ${r.scope === "in" ? pct(r.score.plain) + "%" : r.score.plain ? "✓ 拒答" : "✗ 回答了"} |`).join("\n")}
`;
fs.writeFileSync(path.join(DIR, "report.md"), md);

// 带柱状图的网页版：直接用浏览器打开 eval/report.html，可以截图放进 PPT
const bar = (v, color) => `<div class="bar"><b style="width:${v}%;background:${color}"></b><span>${v}%</span></div>`;
const html = `<!doctype html><meta charset="utf-8"><title>RAG 效果评测</title>
<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#070414;color:#e8f6ff;padding:40px;max-width:900px;margin:auto}
h1{font-weight:300;letter-spacing:6px}.m{margin:26px 0}.m h3{margin:0 0 8px;font-weight:400}.row{display:flex;align-items:center;gap:12px;margin:6px 0}
.row i{width:150px;font-style:normal;color:#9bb}.bar{flex:1;height:26px;background:#ffffff14;position:relative}.bar b{display:block;height:100%}
.bar span{position:absolute;right:8px;top:3px;font-size:14px}small{color:#789}</style>
<h1>RAG 效果评测</h1><small>${time} · glm-4-flash · 教材内 ${ins.length} 题 + 教材外 ${outs.length} 题</small>
${rows.map(([n, v]) => `<div class="m"><h3>${n}</h3><div class="row"><i>有 RAG</i>${bar(v.rag, "linear-gradient(90deg,#ff2bd6,#00f0ff)")}</div><div class="row"><i>没有 RAG</i>${bar(v.plain, "#556")}</div></div>`).join("")}
<p><small>平均耗时：有 RAG ${M.ms.rag} ms，没有 RAG ${M.ms.plain} ms</small></p>`;
fs.writeFileSync(path.join(DIR, "report.html"), html);

console.log("\n========== 汇总 ==========");
for (const [n, v] of rows) console.log(`${n}：有 RAG ${v.rag}%  ｜  没有 RAG ${v.plain}%`);
console.log(`平均耗时：有 RAG ${M.ms.rag} ms  ｜  没有 RAG ${M.ms.plain} ms`);
console.log("\n已生成：eval/results.json、eval/report.md、eval/report.html");
