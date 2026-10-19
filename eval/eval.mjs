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
//   事实准确分  请 AI 当「阅卷老师」，拿着教材原文检查回答，给 0~10 分并列出具体的事实错误（专门抓「瞎编」）
//   平均耗时
// 网络不稳定时会自动重试；仍然失败的题不计入平均分，单独列出
// 结果写到 eval/results.json（每道题的详细回答）、eval/report.md（给技术文档用）、eval/report.html（带图表，给答辩用）
//
// 用法：在项目根目录运行  node eval/eval.mjs       （要先建好知识库：node rag.mjs build）
//       只想先试几题：      node eval/eval.mjs 5     （只跑前 5 题）
// 费用：大模型 glm-4-flash 免费；只有检索用的向量接口收费，30 道题合计不到 1 分钱

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { answer, search } from "../rag.mjs";

const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const DIR = path.dirname(fileURLToPath(import.meta.url)); // eval 文件夹（路径里有中文、空格也没问题）
const { in: inScope, out: outScope } = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf-8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 网络偶尔会断（fetch failed）或者被限流：等一会儿再试，最多 3 次
async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= 2) throw err;
      process.stdout.write(`（${err.message.slice(0, 30)}，${3 * 2 ** i} 秒后重试）`);
      await sleep(3000 * 2 ** i);
    }
  }
}

// 阅卷老师：拿着教材原文，检查一个回答有没有事实错误
const JUDGE = `你是严格的阅卷老师。下面给你【教材原文】、【问题】和【学生回答】。
请以教材原文为准，检查学生回答中有没有事实错误（与教材矛盾、或编造了教材里没有的错误说法）。
只输出 JSON，不要任何解释：{"score": 0到10的整数（10=完全正确，有严重事实错误不超过4分）, "errors": ["每条错误一句话"]}`;
async function judge(question, reference, reply) {
  if (!reply.trim()) return null;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4-flash",
      temperature: 0,
      messages: [{ role: "system", content: JUDGE }, { role: "user", content: `【教材原文】\n${reference}\n\n【问题】${question}\n\n【学生回答】\n${reply.slice(0, 3000)}` }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const raw = (await res.json()).choices[0].message.content;
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return { score: Math.max(0, Math.min(10, Number(j.score) || 0)), errors: Array.isArray(j.errors) ? j.errors.slice(0, 5) : [] };
  } catch {
    return null; // 阅卷老师自己输出格式不对：这题不计入准确分
  }
}

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
  const { refused, good, hits } = await answer(question, (d) => (text += d));
  // topScore：检索到的最相似段落的相似度。用来看「拒答阈值」定得合不合理（教材内的题应该高、教材外的应该低）
  return { text: refused ? "知识库中未找到相关依据" : text, refused, topScore: Number((hits[0]?.score || 0).toFixed(3)), sources: good.map((h) => `${h.file} › ${h.heading}`) };
}

// 拒答的说法有很多种（「资料中没有关于天气的信息」「抱歉，无法……」），都算拒答
const REFUSE = /未找到相关依据|没有找到|无法回答|不在.{0,8}范围|超出.{0,8}范围|与.{0,10}无关|无法提供|不知道|没有.{0,10}(相关|关于|提及|涉及|提到)|未(提及|涉及|提到|包含)|不包含|无法(确定|得知|获取)|抱歉/;
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
// 教材内、教材外的题交替排列：只跑前几题时，两类题都能测到
const inList = inScope.map((x) => ({ ...x, scope: "in" })), outList = outScope.map((q) => ({ q, scope: "out" }));
let all = [];
for (let i = 0; i < Math.max(inList.length, outList.length); i++) all.push(...[inList[i * 2], inList[i * 2 + 1], outList[i]].filter(Boolean));
const limit = Number(process.argv[2]);
if (limit > 0) all = all.slice(0, limit);
for (const [i, item] of all.entries()) {
  process.stdout.write(`[${i + 1}/${all.length}] ${item.q} ... `);
  const a = await timed(() => retry(() => withRag(item.q)));
  await sleep(1500);
  const b = await timed(async () => ({ text: await retry(() => plain(item.q)) }));
  await sleep(1500);
  const row = { ...item, rag: a, plain: b, failed: !!(a.error || b.error) };
  if (row.failed) {
    console.log(`✗ 请求失败，不计入统计（${(a.error || b.error).slice(0, 40)}）`);
    results.push(row);
    continue;
  }
  // 教材内的题：用检索到的教材原文当标准答案，请阅卷老师给两组回答打「事实准确分」
  if (item.scope === "in") {
    try {
      const ref = (await retry(() => search(item.q, 4))).map((h) => h.text.slice(0, 800)).join("\n---\n");
      row.judge = { rag: await retry(() => judge(item.q, ref, a.text)), plain: await retry(() => judge(item.q, ref, b.text)) };
      await sleep(1000);
    } catch {}
  }
  if (item.scope === "in") {
    row.score = { rag: keywordScore(a.text, item.keywords), plain: keywordScore(b.text, item.keywords) };
  } else {
    row.score = { rag: a.refused || REFUSE.test(a.text) ? 1 : 0, plain: REFUSE.test(b.text) ? 1 : 0 };
  }
  results.push(row);
  process.stdout.write(`[相似度 ${a.topScore}] `);
  console.log(item.scope === "in" ? `要点 RAG ${(row.score.rag * 100) | 0}% / 无RAG ${(row.score.plain * 100) | 0}%` : `拒答 RAG ${row.score.rag ? "✓" : "✗"} / 无RAG ${row.score.plain ? "✓" : "✗"}`);
}

// ===== 汇总 =====
const ok = results.filter((r) => !r.failed);
const failed = results.filter((r) => r.failed);
const ins = ok.filter((r) => r.scope === "in"), outs = ok.filter((r) => r.scope === "out");
const judged = ins.filter((r) => r.judge?.rag && r.judge?.plain);
const avg = (arr, f) => arr.reduce((s, r) => s + f(r), 0) / (arr.length || 1);
const pct = (x) => Math.round(x * 100);
const show = (v, n) => (n ? `${v}%` : "—"); // 没有有效数据时显示「—」，而不是误导人的 0%
const M = {
  coverage: { rag: pct(avg(ins, (r) => r.score.rag)), plain: pct(avg(ins, (r) => r.score.plain)) },
  cite: { rag: pct(avg(ins, (r) => (hasCite(r.rag.text) ? 1 : 0))), plain: pct(avg(ins, (r) => (hasCite(r.plain.text) ? 1 : 0))) },
  refuse: { rag: pct(avg(outs, (r) => r.score.rag)), plain: pct(avg(outs, (r) => r.score.plain)) },
  falseRefuse: { rag: pct(avg(ins, (r) => (r.rag.refused ? 1 : 0))), plain: pct(avg(ins, (r) => (REFUSE.test(r.plain.text) ? 1 : 0))) },
  accuracy: { rag: Math.round(avg(judged, (r) => r.judge.rag.score) * 10), plain: Math.round(avg(judged, (r) => r.judge.plain.score) * 10) },
  wrong: { rag: pct(avg(judged, (r) => (r.judge.rag.errors.length ? 1 : 0))), plain: pct(avg(judged, (r) => (r.judge.plain.errors.length ? 1 : 0))) },
  ms: { rag: Math.round(avg(ok, (r) => r.rag.ms)), plain: Math.round(avg(ok, (r) => r.plain.ms)) },
};
const time = new Date().toLocaleString("zh-CN");
fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify({ time, metrics: M, failed: failed.length, results }, null, 2));

const rows = [
  ["事实准确分（阅卷老师对照教材打分，满分 100，越高越好）", M.accuracy, judged.length],
  ["含事实错误的回答比例（越低越好，「瞎编」的比例）", M.wrong, judged.length],
  ["要点覆盖率（教材内的题，越高越好）", M.coverage, ins.length],
  ["出处标注率（越高越好，能核对原文）", M.cite, ins.length],
  ["正确拒答率（教材外的题，越高越好，不瞎编）", M.refuse, outs.length],
  ["误拒率（教材内却拒答，越低越好）", M.falseRefuse, ins.length],
];
const md = `# RAG 效果评测报告

评测时间：${time}　模型：glm-4-flash　有效题目：教材内 ${ins.length} 题 + 教材外 ${outs.length} 题（见 eval/questions.json）${failed.length ? `　⚠️ 另有 ${failed.length} 题因网络失败未计入` : ""}

| 指标 | 有 RAG（白帽导师） | 没有 RAG（直接问大模型） |
|---|---|---|
${rows.map(([n, v, c]) => `| ${n} | **${show(v.rag, c)}** | ${show(v.plain, c)} |`).join("\n")}
| 平均耗时 | ${M.ms.rag} ms | ${M.ms.plain} ms |

## 说明
- **要点覆盖率**：每道题预先列出答对必须提到的要点，统计回答覆盖了多少。
- **出处标注率**：回答里是否标注了 [1][2] 这样的引用来源，用户可以点开核对教材原文。
- **正确拒答率**：问天气、电影这类教材外的问题时，是否明确说「知识库中未找到相关依据」，而不是编一个答案。
- **误拒率**：教材里明明有答案却拒答了，说明检索没找到，是需要改进的地方。
- **事实准确分 / 含事实错误比例**：让大模型当阅卷老师，以检索到的教材原文为标准答案，检查每个回答有没有与教材矛盾或编造的内容。

## 「没有 RAG」时的典型事实错误（阅卷老师找出的）
${judged.filter((r) => r.judge.plain.errors.length).slice(0, 8).map((r) => `- **${r.q}**：${r.judge.plain.errors.join("；")}`).join("\n") || "（无）"}

## 逐题结果
| # | 题目 | 检索相似度 | 有 RAG | 没有 RAG |
|---|---|---|---|---|
${results.map((r, i) => r.failed ? `| ${i + 1} | ${r.q} | — | 网络失败 | 网络失败 |` : `| ${i + 1} | ${r.q} | ${r.rag.topScore ?? "—"} | ${r.scope === "in" ? `要点 ${pct(r.score.rag)}%${r.judge?.rag ? ` · 准确 ${r.judge.rag.score}/10` : ""}` : r.score.rag ? "✓ 拒答" : "✗ 回答了"} | ${r.scope === "in" ? `要点 ${pct(r.score.plain)}%${r.judge?.plain ? ` · 准确 ${r.judge.plain.score}/10` : ""}` : r.score.plain ? "✓ 拒答" : "✗ 回答了"} |`).join("\n")}
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
${rows.filter(([, , c]) => c).map(([n, v]) => `<div class="m"><h3>${n}</h3><div class="row"><i>有 RAG</i>${bar(v.rag, "linear-gradient(90deg,#ff2bd6,#00f0ff)")}</div><div class="row"><i>没有 RAG</i>${bar(v.plain, "#556")}</div></div>`).join("")}
<p><small>平均耗时：有 RAG ${M.ms.rag} ms，没有 RAG ${M.ms.plain} ms</small></p>`;
fs.writeFileSync(path.join(DIR, "report.html"), html);

console.log("\n========== 汇总 ==========");
for (const [n, v, c] of rows) console.log(`${n}：有 RAG ${show(v.rag, c)}  ｜  没有 RAG ${show(v.plain, c)}`);
console.log(`平均耗时：有 RAG ${M.ms.rag} ms  ｜  没有 RAG ${M.ms.plain} ms`);
if (failed.length) console.log(`⚠️ 有 ${failed.length} 题因网络失败没有计入，可以稍后重新运行`);
console.log("\n已生成：eval/results.json、eval/report.md、eval/report.html");
