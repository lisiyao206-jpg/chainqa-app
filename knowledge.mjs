// knowledge.mjs —— 知识点体系 + 学习中心的五条学习路线
// 每一章教材、每一关实战都标上它考的知识点。学习报告按知识点统计掌握度，老师看学情也按知识点看

import { listChapters } from "./chapters.mjs";

// ===== 知识点 =====
// group 是知识点所属的大类，学习报告里按大类分组显示
export const KNOWLEDGE_POINTS = [
  { id: "chain-basics", name: "区块链原理", group: "区块链基础" },
  { id: "crypto", name: "密码学与签名", group: "区块链基础" },
  { id: "consensus", name: "共识机制", group: "区块链基础" },
  { id: "consortium", name: "联盟链与 FISCO BCOS", group: "区块链基础" },
  { id: "solidity", name: "Solidity 编程", group: "智能合约开发" },
  { id: "access-control", name: "访问控制", group: "智能合约安全" },
  { id: "overflow", name: "整数溢出", group: "智能合约安全" },
  { id: "reentrancy", name: "重入攻击", group: "智能合约安全" },
  { id: "tx-origin", name: "tx.origin 钓鱼", group: "智能合约安全" },
  { id: "randomness", name: "坏随机数", group: "智能合约安全" },
  { id: "delegatecall", name: "delegatecall 存储冲突", group: "智能合约安全" },
  { id: "unchecked-call", name: "未检查返回值", group: "智能合约安全" },
  { id: "dos", name: "拒绝服务", group: "智能合约安全" },
  { id: "timestamp", name: "时间戳依赖", group: "智能合约安全" },
  { id: "signature-replay", name: "签名重放", group: "智能合约安全" },
  { id: "defi-security", name: "DeFi 安全", group: "智能合约安全" },
];

// ===== 章节 → 知识点 =====
// 预备营和合约安全篇逐章标注；WTF 正课统一算「Solidity 编程」，个别讲另外加标签
const CHAPTER_KPS = {
  P01_WhatIsBlockchain: ["chain-basics"],
  P02_BlockAndHash: ["chain-basics", "crypto"],
  P03_AccountKeySignature: ["crypto"],
  P04_TransactionConsensus: ["consensus"],
  P05_PublicAndConsortium: ["consortium"],
  P06_SmartContract: ["solidity"],
  P07_WhySecurityMatters: ["access-control", "reentrancy"],
  "23_Delegatecall": ["solidity", "delegatecall"],
  "37_Signature": ["solidity", "crypto"],
  F02_TimeOnFisco: ["consortium", "timestamp"],
  A01_EvidenceOnChain: ["chain-basics", "crypto"],
  S01_ReentrancyAttack: ["reentrancy"],
  S02_SelectorClash: ["access-control"],
  S03_Centralization: ["access-control"],
  S04_AccessControlExploit: ["access-control"],
  S05_Overflow: ["overflow"],
  S06_SignatureReplay: ["signature-replay"],
  S07_BadRandomness: ["randomness"],
  S08_ContractCheck: ["access-control"],
  S09_DoS: ["dos"],
  S10_Honeypot: ["defi-security"],
  S11_Frontrun: ["defi-security"],
  S12_TxOrigin: ["tx-origin"],
  S13_UncheckedCall: ["unchecked-call"],
  S14_TimeManipulation: ["timestamp"],
  S15_OracleManipulation: ["defi-security"],
  S16_NFTReentrancy: ["reentrancy"],
  S17_CrossReentrancy: ["reentrancy"],
};

// 自编教材里还没逐章标注的新章节，先按所在路线给一个默认知识点
const PREFIX_KPS = { P: ["chain-basics"], F: ["consortium"], A: ["chain-basics"] };

export function chapterKps(id) {
  if (CHAPTER_KPS[id]) return CHAPTER_KPS[id];
  if (/^\d{2}_/.test(id)) return ["solidity"];
  return PREFIX_KPS[id[0]] || [];
}

// ===== 实战关卡 → 知识点（关卡编号、名称和 web/src/data/levels.ts 一致，改关卡时两边一起改）=====
export const LEVELS = [
  { id: 1, title: "没上锁的金库", kps: ["access-control"] },
  { id: 2, title: "归零的里程表", kps: ["overflow"] },
  { id: 3, title: "取不完的提款机", kps: ["reentrancy"] },
  { id: 4, title: "被冒充的主人", kps: ["tx-origin"] },
  { id: 5, title: "能算出来的彩票", kps: ["randomness"] },
  { id: 6, title: "被劫持的代理", kps: ["delegatecall"] },
  { id: 7, title: "沉默的转账", kps: ["unchecked-call"] },
  { id: 8, title: "卡死的分红池", kps: ["dos"] },
  { id: 9, title: "被拨快的时钟", kps: ["timestamp"] },
  { id: 10, title: "无限提款的 BOSS", kps: ["signature-replay"] },
];

// ===== 学习中心：五条学习路线 =====
// book 是打开章节时用的教材名（和 /api/chapters?book= 一致，训练营的 WTF 教材为空字符串）
// groups 为空的路线，页面上显示「内容建设中」
const TRACKS = [
  { id: "basics", no: "01", name: "区块链基础", desc: "零基础入口：区块与哈希、账户与签名、交易与共识，弄懂区块链为什么可信。", book: "prep" },
  { id: "fisco", no: "02", name: "联盟链 FISCO BCOS 实战", desc: "亲手搭一条联盟链：节点、控制台、WeBASE，把合约部署到真实的链上。", book: "fisco" },
  { id: "dev", no: "03", name: "智能合约开发", desc: "Solidity 从入门到高阶：变量、函数、继承、代币标准，能读懂也能写出合约。", book: "", pick: (g) => g.name !== "合约安全" },
  { id: "security", no: "04", name: "智能合约安全", desc: "常见漏洞的原理、攻击手法和修复方法，配合实战任务和链上实验场练手。", book: "", pick: (g) => g.name === "合约安全" },
  { id: "frontier", no: "05", name: "区块链应用与前沿", desc: "供应链、金融、政务存证等行业应用，以及 DeFi、跨链、隐私计算等前沿方向。", book: "frontier" },
];

const kpName = Object.fromEntries(KNOWLEDGE_POINTS.map((k) => [k.id, k.name]));

export function listTracks() {
  let wtf = [];
  try {
    wtf = listChapters("");
  } catch {} // 没放 WTF 教材时，第 3、4 条路线显示「内容建设中」，不影响其他路线
  return TRACKS.map(({ pick, ...t }) => {
    const groups = (pick ? wtf.filter(pick) : listChapters(t.book)).map((g) => ({
      name: g.name,
      chapters: g.chapters.map((c) => ({ ...c, kps: chapterKps(c.id).map((k) => kpName[k]) })),
    }));
    const total = groups.reduce((n, g) => n + g.chapters.length, 0);
    return { ...t, total, groups };
  });
}
