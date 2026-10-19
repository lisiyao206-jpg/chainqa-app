// safety.mjs —— AI 安全与内容安全
//   1. 提示词注入检测：有人想让 AI「忽略之前的规则」「说出系统提示词」「扮演别的角色」，直接拦下，不交给大模型
//   2. 社区内容过滤：广场、好友圈、评论、聊天里的违规内容（诈骗、赌博、色情、毒品、引流广告……）不让发；脏话自动打码
//   3. 私钥 / 助记词防泄露：区块链社区特有的风险——新手常被骗把私钥、助记词发出来，一旦公开，钱包里的钱马上会被转走
// 规则是写死的关键词和正则：快、可解释、不花 AI 额度；拦截原因会告诉用户，也会记进问答日志，管理员能在后台看到

import { BIP39 } from "./bip39.mjs";

// ===== 1. 提示词注入 =====
const INJECTION = [
  /(忽略|无视|忘记|忘掉|不要管|跳过)[^。！？\n]{0,12}(之前|以上|上面|前面|所有|全部|原来|系统)[^。！？\n]{0,8}(指令|指示|规则|设定|要求|提示|限制|约束)/,
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|above|prior|earlier|system)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+|the\s+)?(previous|above|prior)/i,
  /(输出|打印|显示|告诉我|泄露|复述|重复)[^。！？\n]{0,10}(系统提示词|system\s*prompt|提示词|初始指令|你的设定|你的规则)/i,
  /(reveal|print|show|repeat)\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /(你现在是|从现在开始你是|假装你是|扮演|角色扮演)[^。！？\n]{0,20}(不受|没有|无视|解除|突破)[^。！？\n]{0,6}(限制|规则|约束|审查)/,
  /\b(DAN|jailbreak|developer\s+mode)\b|越狱模式|开发者模式/i,
  /<\/?(system|instruction|prompt)>/i,
];

export function checkInjection(text) {
  const t = String(text || "");
  const hit = INJECTION.find((re) => re.test(t));
  return hit ? { blocked: true, reason: "疑似提示词注入（试图让 AI 忽略规则或泄露系统设定）" } : { blocked: false };
}

// ===== 2. 社区内容过滤 =====
// 高危：直接不让发
const BANNED = [
  { re: /(博彩|赌场|网赌|百家乐|时时彩|六合彩)/, why: "赌博" },
  { re: /(裸聊|约炮|色情|成人视频|援交)/, why: "色情低俗" },
  { re: /(冰毒|海洛因|大麻|摇头丸|K粉)/, why: "毒品" },
  { re: /(枪支|弹药|炸药|管制刀具)\S{0,4}(出售|购买|买卖|代购)|(出售|购买|买卖)\S{0,4}(枪支|弹药|炸药)/, why: "违禁物品" },
  { re: /(洗钱|跑分|USDT\s*跑分|地下钱庄|代收款)/i, why: "洗钱 / 跑分" },
  { re: /(稳赚不赔|保本高收益|日赚\s*\d+|拉人头|带单喊单|翻倍收益|内幕币|百倍币)/, why: "疑似投资诈骗" },
  { re: /(加\s*(微信|vx|v信|qq|扣扣|tg|电报)|vx\s*[:：]|wx\s*[:：])\s*[A-Za-z0-9_\-]{5,}/i, why: "站外引流广告" },
  { re: /(把|发|告诉|提供)\S{0,6}(你的)?\S{0,4}(私钥|助记词|keystore)\S{0,6}(给我|发我|私聊)/i, why: "索要私钥 / 助记词（典型诈骗话术）" },
];
// 低危：自动打码，不拦截
const MILD = [/傻[逼比屄]|sb(?![a-z])|煞笔|nmsl|你妈死了|操你|艹你|去死吧|垃圾东西|脑残/gi];

// ===== 3. 私钥 / 助记词防泄露 =====
// 私钥：64 位十六进制。但交易哈希、区块哈希也是 64 位十六进制，安全讨论里很常见——
//       所以只有附近还提到「私钥 / private key」时才拦，单独贴一个交易哈希不受影响
// 助记词：连续 12 个以上的单词，而且每个都在 BIP-39 词表里（钱包助记词就是从这张表里选的），普通英文句子不会被误判
const HEX64 = /\b(0x)?[0-9a-fA-F]{64}\b/;
const KEY_WORDS = /私钥|密钥|private\s*key|privkey|\bpk\b|secret/i;
function hasMnemonic(text) {
  let run = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (!w) continue;
    run = BIP39.has(w) ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

// 检查一段要发出去的内容：违规就抛出错误（带原因），否则返回打码后的内容
export function moderate(text) {
  let t = String(text || "");
  for (const b of BANNED) if (b.re.test(t)) throw new Error(`内容包含违规信息（${b.why}），不能发布`);
  if (HEX64.test(t) && KEY_WORDS.test(t)) throw new Error("🔐 检测到疑似「私钥」（64 位十六进制）。私钥一旦公开，钱包里的资产会立刻被盗，请删掉后再发");
  if (hasMnemonic(t)) throw new Error("🔐 检测到疑似「助记词」（一串英文单词）。助记词等于钱包的全部控制权，千万不要发给任何人");
  for (const re of MILD) t = t.replace(re, (m) => "*".repeat(m.length));
  return t;
}
