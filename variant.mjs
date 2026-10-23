// variant.mjs —— 实战「举一反三」变种关卡：AI 换场景出题 + 规则扫描器自动验题 + 存库复用
//
// 打怪模式「变种挑战」的后端：
//   1. AI 以某一关为样例，考点（漏洞类型 / SWC 编号）不变，换一个新场景出题
//      （如「权限缺失」原是金库，变种可以是众筹、NFT 铸造、投票……）
//      —— 漏洞原理一样，但代码、写法、藏的位置都不同，背答案没用，必须真懂。
//   2. 出题时把对应的教材章节原文一起交给 AI，保证考的是教材里讲过的知识点。
//   3. ⭐ 出完题，用我们自己的规则扫描器（scanner.mjs）自动验题：
//        · 有漏洞版本：必须扫出目标 SWC，且漏洞行号落在 bugLines 里 → 才叫"题里真有这漏洞"
//        · 正确修复版本：必须扫不出目标 SWC → 才叫"修法真的能补上"
//        任何一项不通过，丢掉重出（最多试 3 次）。这样 AI 出的错题不会落到用户面前。
//   4. 通过验题的题存进数据库（variant_levels 表），下次直接复用；前端可点「再出一道」生成新的。
//   5. 同一用户同时只能出一道（用 generating 锁，防止狂点浪费额度，和 AI 审计一个做法）。

import fs from "node:fs";
import { scanContract, SWC } from "./scanner.mjs";
import { readChapter } from "./chapters.mjs";
import { db } from "./db.mjs";

const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const MODEL = "glm-4-flash";
const MAX_TRIES = 3;            // AI 出题最多重试几次（含验题不通过）
const MAX_CODE = 12000;         // 合约最长字数（自保，别让 AI 一次性给你太长的代码）
const CACHE_LIMIT = 30;         // 同一关最多缓存几道变种题，避免无限膨胀

// ===== 关卡 → SWC 对应 =====
// 必须先写死这一层：AI 出题的目标是「哪一类漏洞」，扫描器验题也是验「能不能扫出这一类」
export const LEVEL_SWC = {
  1: "SWC-105", // 权限缺失 · 未受保护的提款
  2: "SWC-101", // 整数溢出
  3: "SWC-107", // 重入攻击
  4: "SWC-115", // tx.origin 钓鱼
  5: "SWC-120", // 坏随机数
  6: "SWC-112", // delegatecall 存储冲突
  7: "SWC-104", // 未检查返回值
  8: "SWC-113", // 拒绝服务
  9: "SWC-116", // 依赖时间戳
  10: "SWC-121", // 签名重放
};

// ===== 变种的怪兽 =====
// 变种沿用原怪兽的外观（emoji / 颜色 / 特效 / 反击台词），只是在名字上标注「· 变种」。
// 数据从 web/src/data/levels.ts 对应关卡抄过来，保证前后端看到的是同一只怪。
const BASE_MONSTERS = {
  1: { name: "权限窃贼", emoji: "🥷", color: "#b18cff", fx: "steal", attacks: ["窃贼直接调用关键函数……", "没有任何门卫拦它，合约余额 -100%！", "它连管理员都不用冒充，大摇大摆地就走了"] },
  2: { name: "溢出刺球", emoji: "🦔", color: "#fcee0a", fx: "swell", attacks: ["刺球用 0 个代币转出 1 个……", "0 - 1 下溢成 2²⁵⁶ - 1，它的身体一下子撑到了天文数字！", "它把这些凭空出现的代币全部砸进了市场"] },
  3: { name: "重入幽灵", emoji: "👻", color: "#00f0ff", fx: "clones", attacks: ["幽灵调用提款，合约把 ETH 转给它……", "转账触发幽灵的 fallback，它在里面又调用了一次！", "状态还没改好，第二次、第三次……金库被一点点掏空"] },
  4: { name: "钓鱼魅影", emoji: "🎣", color: "#ff2bd6", fx: "hook", attacks: ["魅影发来一个「领空投」链接，主人点了一下……", "主人调用了魅影的合约，魅影合约转手调用目标函数", "tx.origin 还是主人，检查被绕过——钱包被转空了"] },
  5: { name: "预言巫师", emoji: "🔮", color: "#8ee6c4", fx: "prophecy", attacks: ["巫师用同一个公式先算一遍——开奖结果它早就知道了", "算出来能赢？那就调用！不能赢？那就等下一块", "一次次开奖，一次次中奖，奖池被它一个人拿走"] },
  6: { name: "存储篡改者", emoji: "🕴️", color: "#ffa552", fx: "steal", attacks: ["篡改者传一个会改动标量槽位的合约【…】", "delegatecall 用代理的存储执行别人家的代码", "owner 被写成了篡改者的地址——它接管了整个合约"] },
  7: { name: "沉默影子", emoji: "🫥", color: "#8fa3ff", fx: "steal", attacks: ["影子用底层 call 转了账，却不看返回值", "对方合约的 fallback 悄悄失败，call 只回了 false", "接口显示成功，钱却一分没到"] },
  8: { name: "吞币巨兽", emoji: "🦖", color: "#7be77b", fx: "clones", attacks: ["巨兽是成员之一，收币时会故意 revert", "distribute 一转到它那行，整个合约回滚卡死", "一个成员卡死，全体分红永远发不出去"] },
  9: { name: "拨钟者", emoji: "⏰", color: "#ffd166", fx: "prophecy", attacks: ["拨钟者是出块者【…】", "它把时间戳直接调到已过 endTime 的区块里", "require(block.timestamp>=endTime) 瞬间通过，奖金被领走"] },
  10: { name: "DAO 巨兽", emoji: "🐲", color: "#ff4d6d", fx: "clones", attacks: ["巨兽捡到一张 owner 签名的授权", "没有 nonce、没有已用记录，同一张签名反复提交", "一次通关，余额清零，整个 DAO 被掏空"] },
};

// ===== 新场景素材 =====
// 出题时随机挑一个告诉 AI「换个什么场景」，覆盖面更广、题不重样。
// 每个 SWC 配几个「同样考点、不同场景」的候选，AI 也可以自己再加。
const SCENES = {
  "SWC-105": ["众筹合约", "NFT 铸造工厂", "链上投票合约", "共享分红池", "任务赏金池", "社区金库"],
  "SWC-101": ["去中心化交易所的兑换池", "代币空投合约", "众筹退款合约", "利息结算合约", "博彩下注合约"],
  "SWC-107": ["银行理财合约", "质押取款合约", "借贷协议", "游戏提现合约", "资金池分红合约"],
  "SWC-115": ["多签钱包", "投票代表合约", "领空投合约", "拍卖合约", "护理合约"],
  "SWC-120": ["链上彩票", "抽奖送 NFT", "开盲盒合约", "抢购发售合约", "幸运转盘"],
  "SWC-112": ["可升级代理合约", "模块化插件合约", "跨合约路由器", "白名单转发合约", "存储中继器"],
  "SWC-104": ["空投领取合约", "退款合约", "佣金分发合约", "桥接提款合约", "游戏奖励合约"],
  "SWC-113": ["批量分红池", "众筹退款池", "订阅续费合约", "工会工资池", "奖励队列"],
  "SWC-116": ["限时抢购合约", "定时解锁合约", "预售合约", "延时结算合约", "限时竞拍合约"],
  "SWC-121": ["跨链桥提款", "链下签名授权", "代币代表投票", "白名单名单签名", "限价单签名撮合"],
};

// ===== 数据库表 =====
// 存 AI 出的、并且通过了扫描器验题的变种题。同关可缓存多道，前端「再出一道」时新增一行。
db.exec(`
CREATE TABLE IF NOT EXISTS variant_levels (
  variant_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  base_level   INTEGER NOT NULL,             -- 基于哪一关（1~5）
  base_title   TEXT NOT NULL,                -- 样例关的名字（前端展示用）
  swc          TEXT NOT NULL,                -- 目标漏洞编号，如 SWC-105
  variant_no   INTEGER NOT NULL DEFAULT 1,   -- 这一关的第几道变种
  difficulty   INTEGER NOT NULL,             -- 难度（>0）
  chapter      TEXT NOT NULL,                -- 对应的教材章节（出题依据）
  title        TEXT NOT NULL,                -- 变种关名字
  type         TEXT NOT NULL,                -- 漏洞类型，如 权限缺失
  story        TEXT NOT NULL,
  code         TEXT NOT NULL,                -- 合约代码，JSON 数组（每行一个字符串）
  bug_lines    TEXT NOT NULL,                -- 有漏洞的行号，JSON 数组
  hints        TEXT NOT NULL,                -- 两级提示，JSON 数组
  explanation  TEXT NOT NULL,                -- 讲解（漏洞原理）
  fix          TEXT NOT NULL,                -- 修复：{ lines, options }，JSON
  monster      TEXT NOT NULL,                -- 怪兽：{ name, emoji, color, fx, attacks }
  create_time  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
)`);
db.exec("CREATE INDEX IF NOT EXISTS idx_variants_level ON variant_levels(base_level, create_time)");

// 正在生成变种题的用户：同一个人同时只能出一道（防止狂点、防止浪费额度）
const generating = new Set();
export function isGenerating(uid) { return generating.has(uid); }

// ===== 调 AI 出题 =====
async function chat(content) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7, // 出题需要多样性，温度可以稍高
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error("出题失败: " + (await res.text()).slice(0, 200));
  return (await res.json()).choices[0].message.content;
}

// 系统提示词：告诉 AI 怎么出一份「能通过规则扫描器验收」的好题
// 关键：提示里明确给出扫描器能识别的写法（不同 SWC 的坑不同），提高一次通过率
const SYSTEM_PROMPT = `你是智能合约安全竞赛的出题老师。请根据我给出的「样例关卡」和「教材章节」，出一道同类型的「变种题目」。
另外，扫描器对以下漏洞的识别模式如下——你出的「有漏洞版本」必须包含能被扫描器匹配的写法，「已修复版本」则不能触发：

- SWC-112（delegatecall）：扫描器匹配任何包含 \`.delegatecall(\` 的行。出题时请让漏洞版本包含 delegatecall 调用且目标地址可由用户控制；修复版改为普通 call 或直接调用。
- SWC-104（未检查返回值）：扫描器匹配 \`.call{...}(\` 或 \`.call(\`，且该行**不含** \`require(\`、\`if (\`、\`=\`（赋值）或 \`return\`。出题时漏洞版本直接写 \`addr.call{value: x}("");\` 不检查结果；修复版加上 \`(bool ok,) = addr.call{value: x}(""); require(ok);\`。
- SWC-113（DoS/循环调用）：扫描器检测 \`for(\` 循环体内包含 \`.call(\` / \`.send(\` / \`.transfer(\`。出题时漏洞版本在循环里逐个转账；修复版改为「记账 + 自行提取」模式。
- SWC-116（区块时间依赖）：扫描器匹配 \`require(\` 或 \`if (\` 内部出现 \`block.timestamp\` 或 \`now\` 并与某值比较。出题时漏洞版本用 block.timestamp 做判断条件；修复版改用 \`block.number\` 或粗粒度判断（如间隔 > 1 days）。
- SWC-121（签名重放）：扫描器匹配 \`ecrecover(\`，且整个合约不含 \`nonce\` / \`usedSignatures\` / \`used[\` 字样。出题时漏洞版本直接 ecrecover 验证签名，无任何防重放机制；修复版加入 nonce mapping 或 usedSignatures 集合。
核心要求：
1. 考点（漏洞类型 / SWC 编号）必须和样例完全一致，但场景要换成新的！比如样例是「金库被掏空」，你可以设计成众筹、NFT 铸造、投票、分红池等场景。漏洞原理一模一样，只是代码、变量名、写法和藏漏洞的位置都要重新设计，不能和样例雷同（背答案没用）。
2. 题目要包含：合约代码、漏洞行号、两级提示、讲解、3~4 个修复选项（其中 1 个是正确修复，其余是「看起来修好了其实不行」的错误方案）。
3. 随着变种次数增多，合约可以更长、藏进更多「看着可疑、其实没问题」的干扰代码，难度递增。
4. 题目必须从教材里讲到过的知识点出发，不能超纲。

务必让你出的这份合约能通过我的规则扫描器识别，注意以下几点（这是「这道题能不能被系统用规则引擎验证通过」的关键，规则引擎只会识别这些特定写法——扫描器实际就是这么写的）：
- 漏洞必须用扫描器能看懂的写法写出来，否则会被当成没有漏洞：
  · 权限缺失（SWC-105）：危险函数（能转走全部余额 / 改 owner / selfdestruct）不要加任何访问控制，函数体里直接用 address(this).balance + transfer/send/call 把合约全部余额转给一个外部地址（比如参数 to），并且这一整段代码里不要出现 msg.sender 作为权限判断。特别强调：真正安全的门卫只能叫 onlyOwner / onlyAdmin / onlyRole / auth（或 require(msg.sender==owner)），不要发明 onlyManager、onlyUser 之类新名字——规则引擎只认上面这几个词。你已经出了 vulnerable 版本（没加门卫），插进去的正确修复才需要加 onlyOwner 这类门卫。
  · 整数溢出（SWC-101）：合约必须用 pragma solidity ^0.7.0 这类 0.8 之前的版本（这是扫描器扫描溢出的大前提），函数里对某个 uint 做 -= 减法前不要先 require 它够不够减；也不要写 require(a - b >= 0) 这种「先减再比」的无效检查。
  · 重入攻击（SWC-107）：用一个 msg.sender.call{value: x}("") 或 transfer 对外转账，并且「先转账、后改状态」（把余额清零放在转账之后）；函数头不要带 nonReentrant。
  · tx.origin 钓鱼（SWC-115）：用 require(tx.origin == owner) 或 if(tx.origin == ...) 做身份判断。
  · 坏随机数（SWC-120）：用 keccak256(abi.encodePacked(block.timestamp, block.prevrandao, ...)) 这类链上公开数据生成随机数。
- bugLines 必须指向真正藏漏洞的那一行（漏洞本身的代码行）。
- fix.lines 是「要替换的起始行~结束行」，必须覆盖住漏洞真正所在的行，这样把正确修复贴进去后漏洞才会消失。

只输出一个 JSON 对象，不要有任何解释、不要用代码块包起来。字段格式（和样例关卡完全一致）：
{
  "title": "这关的标题（一句话，带点剧情）",
  "type": "漏洞类型（和样例一致，如 权限缺失）",
  "difficulty": 难度数字,
  "story": "这一关的剧情介绍（一两句话，交代一下这个新场景的背景）",
  "code": ["合约代码每行一个字符串"],
  "bugLines": [漏洞行号数组],
  "hints": ["第一级提示（指方向，不点破）", "第二级提示（更具体，点破位置或原理）"],
  "explanation": "漏洞原理讲解：漏洞在第几行、为什么有问题、怎么被利用、怎么修",
  "fix": {
    "lines": [起始行, 结束行],
    "options": [
      { "code": ["正确修复代码（贴上去之后漏洞要消失）", "…"], "correct": true,  "why": "为什么这是对的" },
      { "code": ["错误方案代码"], "correct": false, "why": "为什么这样修没用" },
      { "code": ["另一个错误方案代码"], "correct": false, "why": "为什么不行" }
    ]
  }
}
注意 code 里每行一个字符串，留空行用 ""；hints 共 2 条；fix.options 共 3~4 个。`;

// AI 输出不一定规矩：抠出 { ... } 那段再解析；解析不出或字段不对就返回 null（触发重出）
function parseVariant(raw) {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const ok = (v) => v != null;
  if (!(Array.isArray(obj.code) && obj.code.length) || !(Array.isArray(obj.bugLines) && obj.bugLines.length)) return null;
  if (!(Array.isArray(obj.hints) && obj.hints.length >= 1)) return null;
  if (!ok(obj.title) || !ok(obj.type) || !ok(obj.explanation) || !ok(obj.difficulty)) return null;
  if (!obj.fix || !Array.isArray(obj.fix.lines) || obj.fix.lines.length !== 2 || !Array.isArray(obj.fix.options)) return null;
  // 修复方案里必须至少有 1 个被标记为 correct（正确修复）
  const corrects = (obj.fix.options || []).filter((o) => o && o.correct === true && Array.isArray(o.code));
  const wrongs = (obj.fix.options || []).filter((o) => o && o.correct === false && Array.isArray(o.code));
  if (!corrects.length || wrongs.length < 1) return null;
  // code、hints、options 全部截断到安全长度，防 AI 输出过长 / 绕行
  return {
    title: String(obj.title).slice(0, 60),
    type: String(obj.type).slice(0, 30),
    difficulty: Math.max(1, Math.min(9, Number(obj.difficulty) || 1)),
    story: String(obj.story ?? "").slice(0, 400),
    code: obj.code.map((l) => String(l ?? "")).slice(0, 260),
    bugLines: obj.bugLines.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 12),
    hints: obj.hints.map((h) => String(h).slice(0, 200)),
    explanation: String(obj.explanation).slice(0, 600),
    fix: {
      lines: [Math.max(1, Number(obj.fix.lines[0]) || 1), Math.max(1, Number(obj.fix.lines[1]) || 1)],
      options: obj.fix.options
        .filter((o) => o && Array.isArray(o.code))
        .slice(0, 4)
        .map((o) => ({ code: o.code.map((l) => String(l ?? "")).slice(0, 40), correct: !!o.correct, why: String(o.why || "").slice(0, 300) })),
    },
  };
}

// ===== 机器自动验题（核心亮点）=====
// 把 AI 出的题用规则扫描器验一遍：
//   a. 有漏洞版本必须扫出目标 SWC，且该发现的漏洞行号落在 bugLines 里（±1 行容差）
//   b. 把正确修复代码替换进 fix.lines 之后，必须扫不出目标 SWC（列泄露：正确补丁能修掉）
// 只要有一项不过，就算这题不合格。
function verifyVariant(v, swc) {
  // a. 有漏洞版本
  const findings = scanContract(v.code.join("\n"));
  const target = findings.filter((f) => f.swc === swc);
  // 容差 ±2 行：AI 标的 bugLines 和扫描器实际报出的行号允许有小偏差（仍在同一函数内），
  // 既保证「题里真有这漏洞、位置对得上」，又不至于因为一两行偏差就把好题误判成不合格。
  const lineHit = target.some((f) => v.bugLines.some((b) => Math.abs(f.line - b) <= 2));
  if (!target.length) return { ok: false, reason: `有漏洞版本扫描器扫不出 ${swc}` };
  if (!lineHit) return { ok: false, reason: `扫出的 ${swc} 行号 ${target.map((f) => f.line).join(",")} 和 bugLines ${v.bugLines.join(",")} 对不上` };

  // b. 正确修复版本：把 fix.lines 范围替换成正确方案代码，再扫，必须扫不出目标 SWC
  const [from, to] = v.fix.lines;
  const correct = v.fix.options.find((o) => o.correct);
  const before = v.code.slice(0, Math.max(0, from - 1));
  const after = v.code.slice(Math.min(to, v.code.length));
  const fixed = [...before, ...correct.code, ...after];
  const fixedFindings = scanContract(fixed.join("\n")).filter((f) => f.swc === swc);
  if (fixedFindings.length) {
    // 可能是 AI 漏改部分（比如漏洞在 fix.lines 之外），或因其它写法残留——只要目标 SWC 还在，就不算修好
    return { ok: false, reason: `补上正确修复后，第 ${fixedFindings.map((f) => f.line).join(",")} 行仍能扫出 ${swc}（可能 fix.lines 没盖住漏洞）` };
  }
  return { ok: true };
}

// 校验解析出的题：结构 + 扫描器验题。不合格返回 null。
function validateParsed(obj, swc) {
  if (!obj) return null;
  if (!obj.bugLines.length || JSON.stringify(obj).length > 200000) return null; // 自保：别存超大对象
  if (!(Array.isArray(obj.fix.options) && obj.fix.options.some((o) => o.correct))) return null;
  // 合约太长的直接拒（小合约扫描器才读得清，也防 AI 失控）
  if (obj.code.join("\n").length > MAX_CODE) return null;
  const check = verifyVariant(obj, swc);
  if (!check.ok) return null;
  return obj;
}

// ===== 组装成前端能直接用的完整关卡数据 =====
// 前端「变种挑战」拿到的，就是一个和 levels.ts 里 Level 完全同结构的对象，可以直接进两回合对战。
function variantToLevel(v, r) {
  return {
    id: Number(r.variant_id),          // 变种题用自己独有的 id
    variantId: Number(r.variant_id),
    variantNo: r.variant_no,
    isVariant: true,                   // 前端靠这个渲染「变种」标记
    baseLevel: r.base_level,
    title: r.title,
    type: r.type,
    difficulty: r.difficulty,
    chapter: r.chapter,
    story: r.story,
    code: JSON.parse(r.code),
    bugLines: JSON.parse(r.bug_lines),
    hints: JSON.parse(r.hints),
    explanation: r.explanation,
    fix: JSON.parse(r.fix),
    monster: JSON.parse(r.monster),
  };
}

// 把一个变种通用对象转成当前页关卡的 id（用同一份数据时前端用它做进度key）：
export const variantLevelKey = (r) => Number(r.variant_id);
const rowVariants = (rows) => rows.map(variantToLevel);

// ===== 对外接口 =====

// 读出这一关（样例关）的数据，交给 AI 当样例。
// 样例数据是前端传进来的一段 JSON（由 server 转发），这里保证它有我们需要的字段。
function sampleLevelInfo(baseLevel, originSample) {
  const sample = typeof originSample === "object" && originSample ? originSample : {};
  return {
    id: Number(sample.id ?? baseLevel),
    title: String(sample.title || `第 ${baseLevel} 关`),
    type: String(sample.type || ""),
    chapter: String(sample.chapter || ""),
    difficulty: Number(sample.difficulty || baseLevel),
    story: String(sample.story || ""),
    code: Array.isArray(sample.code) ? sample.code.join("\n") : "",
    bugLines: Array.isArray(sample.bugLines) ? sample.bugLines.join(",") : "",
    fix: sample.fix ? JSON.stringify({ lines: sample.fix.lines, options: (sample.fix.options || []).map((o) => ({ code: o.code, correct: o.correct })) }) : "",
  };
}

// 生成一道变种题：AI 出题 → 扫描器验题 → （通过则）存库返回。
// originSample：前端样例关卡的完整数据（Level），转成 JSON 字符串后连同教材一起喂给 AI。
// force：true 时强制新出一题（「再出一道」）；false 时若同一关已有缓存题，直接复用。
export async function generateVariant(uid, baseLevel, originSample, { force = false } = {}) {
  baseLevel = Number(baseLevel);
  if (!LEVEL_SWC[baseLevel]) throw new Error("没有这一关，无法出变种题");
  if (generating.has(uid)) throw new Error("正在出题，请稍等片刻");

  const swc = LEVEL_SWC[baseLevel];
  // 不 force 时，优先复用这一关已有的缓存题（最新的一道）——不同用户共享，避免每次重复花额度
  if (!force) {
    const cached = db.prepare("SELECT * FROM variant_levels WHERE base_level = ? ORDER BY variant_id DESC LIMIT 1").get(baseLevel);
    if (cached) return variantToLevel(cached, cached);
  }

  generating.add(uid);
  try {
    const info = sampleLevelInfo(baseLevel, originSample);
    // 出题依据：找出这一关对应的教材章节原文（样例关的 chapter）
    let chapterText = "";
    let chapterId = info.chapter;
    if (chapterId) {
      try {
        const t = readChapter(chapterId);
        if (t !== null) chapterText = t;
      } catch { /* 章节读不到就只给样例，不致命 */ }
    }
    const scenePool = SCENES[swc] || [];
    const scene = scenePool[Math.floor(Math.random() * Math.max(1, scenePool.length))] || "一个全新的业务场景";
    // 现在第几道变种：已经存了几道 + 1
    const { n: existCount } = db.prepare("SELECT COUNT(*) AS n FROM variant_levels WHERE base_level = ?").get(baseLevel);
    const variantNo = Number(existCount) + 1;
    const difficulty = Math.min(9, Number(info.difficulty || baseLevel) + Math.max(0, variantNo - 1)); // 变种次数越多，难度越高

    const userContent = [
      `# 样例关卡（作为格式和考点参考，不要照抄场景）`,
      `标题：${info.title}`,
      `类型：${info.type}（漏洞 SWC：${swc}）`,
      `故事：${info.story}`,
      `合约代码：\n\`\`\`solidity\n${info.code.slice(0, 5000)}\n\`\`\``,
      `漏洞行：${info.bugLines}`,
      ``,
      `# 本次出题要求`,
      `请出一道「${swc} ${info.type}」的变种题，场景换成：${scene}（可变）。`,
      `这是该关的第 ${variantNo} 道变种，难度设为 ${difficulty}；合约长度可比样例长一些，混入少量「看着可疑、其实没问题」的干扰代码。`,
      ``,
      chapterText ? `# 教材章节要点（${chapterId}）\n${chapterText.slice(0, 8000)}` : "",
    ].filter(Boolean).join("\n");

    let level = null;
    for (let i = 0; i < MAX_TRIES && !level; i++) {
      let raw = null;
      try {
        raw = await chat(userContent);
      } catch (err) {
        if (i === MAX_TRIES - 1) throw err; // 最后一次还失败才抛给用户
        continue;
      }
      level = validateParsed(parseVariant(raw), swc);
    }
    if (!level) throw new Error("AI 这次没出到能通过验题的题，请点「再出一道」重试");

    // 通过验题，存库
    const monster = { ...BASE_MONSTERS[baseLevel], name: `变种·${BASE_MONSTERS[baseLevel]?.name || "怪兽"}` };
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO variant_levels (base_level, base_title, swc, variant_no, difficulty, chapter, title, type, story,
                                  code, bug_lines, hints, explanation, fix, monster)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(baseLevel, String(info.title), swc, variantNo, level.difficulty, String(chapterId || ""),
           level.title, level.type, level.story, JSON.stringify(level.code), JSON.stringify(level.bugLines),
           JSON.stringify(level.hints), level.explanation, JSON.stringify(level.fix), JSON.stringify(monster));
    // 控制一下缓存上限：超过就删最旧的，防止表无限膨胀
    const { n: total } = db.prepare("SELECT COUNT(*) AS n FROM variant_levels WHERE base_level = ?").get(baseLevel);
    if (Number(total) > CACHE_LIMIT) {
      db.prepare("DELETE FROM variant_levels WHERE variant_id IN (SELECT variant_id FROM variant_levels WHERE base_level = ? ORDER BY variant_id ASC LIMIT ?)")
        .run(baseLevel, Number(total) - CACHE_LIMIT);
    }
    const row = db.prepare("SELECT * FROM variant_levels WHERE variant_id = ?").get(lastInsertRowid);
    return variantToLevel(row, row);
  } finally {
    generating.delete(uid);
  }
}

// ===== 预热缓存池 =====
// 目标：让用户点「变种挑战」时几乎总是秒回（命中缓存），不现场等 AI。
// 策略：通关某个基础关卡后，后台为该关预生成几道变种题存进库，把池子填满。
// 预热用虚拟用户 __prewarm__，和真实用户的 generating 锁互不冲突，也不影响用户即时出题。
const PREWARM_TARGET = 4;   // 每一关预生成到几道变种题（够用即可，别浪费额度）
const prewarming = new Set(); // 正在预热的关卡，防止并发重复预热

// 给某一关预热变种题：不足 target 道就补到 target 道。后台执行，失败不抛出。
// baseLevel：基础关卡号（1~5）。返回本次新增了几道。
export async function prewarmLevel(baseLevel) {
  baseLevel = Number(baseLevel);
  if (!LEVEL_SWC[baseLevel]) return 0;          // 不是基础关（比如已经是变种），跳过
  if (prewarming.has(baseLevel)) return 0;      // 这一关正在预热中，别重复
  prewarming.add(baseLevel);
  try {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM variant_levels WHERE base_level = ?").get(baseLevel);
    const toAdd = Math.max(0, PREWARM_TARGET - Number(n));
    let added = 0;
    for (let i = 0; i < toAdd; i++) {
      try {
        // force=true 强制新出一道；不传样例（后台没有前端样例数据，靠 AI 的考点认知出题）
        await generateVariant("__prewarm__", baseLevel, null, { force: true });
        added++;
      } catch (err) {
        console.log(`[预热] 第 ${baseLevel} 关第 ${i + 1} 道变种生成失败: ${err?.message}`);
        break; // 连续失败就停下来，避免空耗额度，下次通关再补
      }
      await new Promise((r) => setTimeout(r, 300)); // 略隔开，别在极短时间内连打好几发
    }
    console.log(`[预热] 第 ${baseLevel} 关已补 ${added} 道变种题（现共 ${Number(n) + added} 道）`);
    return added;
  } finally {
    prewarming.delete(baseLevel);
  }
}

// 直接取某一关的一道已缓存变种题（不存在返回 null）
export function getVariantByLevel(uid, baseLevel) {
  if (!LEVEL_SWC[Number(baseLevel)]) return null;
  const row = db.prepare("SELECT * FROM variant_levels WHERE base_level = ? ORDER BY variant_id DESC LIMIT 1").get(Number(baseLevel));
  return row ? variantToLevel(row, row) : null;
}

// 取某一道变种题（用它的变种 id）
export function getVariant(uid, variantId) {
  const row = db.prepare("SELECT * FROM variant_levels WHERE variant_id = ?").get(Number(variantId));
  return row ? variantToLevel(row, row) : null;
}

// 某一关出过的全部变种题（前端列表用：<id, title, type, difficulty>）
export function listVariants(baseLevel) {
  return db.prepare("SELECT variant_id, title, type, difficulty, variant_no FROM variant_levels WHERE base_level = ? ORDER BY variant_id DESC").all(Number(baseLevel))
    .map((r) => ({ variantId: r.variant_id, title: r.title, type: r.type, difficulty: r.difficulty, variantNo: r.variant_no }));
}

// ===== 亲手改代码（开放式修漏洞）=====
// 不是四选一：用户直接在代码框里改漏洞行，把改完的完整代码提交上来，
// 我们用规则扫描器判断目标 SWC 是否还存在——扫不出就算修好了。
//
// 注意：scanner 是「死规则」，有些漏洞有固有误报——
//   例：SWC-112 delegatecall 只要见到 `.delegatecall(` 就报，无法判断目标是否可信。
//       用户把目标从「外部参数」改成「合约内部固定状态变量 / 常量」，方向是对的，不该误判为没修。
// 所以对这类目标，除了「扫不出」，「扫出但已合理修复」也算修好。其余 SWC 保持严格「扫不出才算修好」。
// 返回 { fixed, swc, remaining, note }：remaining 是判断后仍算「没修好」的发现；note 是给前端的提示。
export function verifyUserFix(swc, userCode) {
  const key = String(swc || "").toUpperCase();
  if (!SWC[key]) return { error: `没有 ${swc} 这个漏洞编号`, fixed: false };
  const codeText = (Array.isArray(userCode) ? userCode.join("\n") : String(userCode || "")).trim();
  if (!codeText) return { fixed: false, remaining: [], message: "合约代码不能为空" };
  const lines = codeText.split("\n");
  const findings = scanContract(codeText);
  const remaining = findings.filter((f) => f.swc === key);
  if (remaining.length === 0) {
    return { fixed: true, swc: key, remaining: [], note: "已扫不出该漏洞，修好了 🎉" };
  }

  // 对「死规则固有误报」的漏洞做合理化校验：扫出但可能已合理修复
  let note = "";
  if (key === "SWC-112") {
    // delegatecall 目标必须是「合约内部状态变量 / 常量 / 已加门卫」，而不是用户可直接传入的参数
    const paramTargets = remaining.filter((f) => {
      const line = (lines[f.line - 1] || "").trim();
      const hasGuard = /onlyOwner|onlyAdmin|onlyRole|auth|require\s*\(\s*msg\.sender\s*==/.test(
        lines.slice(0, Math.max(0, f.line - 1)).join("\n"));
      if (hasGuard) return false;                       // 该函数已加权限门卫 → 合理
      // 找到 delegatecall 的目标变量，判断它是不是参数（出现在函数头 / 赋值自参数）
      const m = line.match(/[\w.]+\s*\.delegatecall/);
      const target = m ? m[0].replace(/\.delegatecall$/, "") : "";
      const isParam = target && new RegExp(`\\b${target}\\b`).test(
        lines.slice(0, f.line).join("\n").split("{").slice(-2).join("{"));
      return isParam;
    });
    if (paramTargets.length === 0) {
      return { fixed: true, swc: key, remaining: [], note: "delegatecall 目标已固定为合约内部地址 / 已加门卫，方向正确，判为已修" };
    }
    note = "delegatecall 的目标仍是外部可控参数，需要改为固定的合约内部地址，并加权限门卫。";
  }

  return { fixed: false, swc: key, remaining, note };
}