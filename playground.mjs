// playground.mjs —— 合约练习场：随便写一个合约，编译后部署到我们自己的 FISCO BCOS 联盟链上，再调用它的函数
// 用来代替国外的 Remix 在线编辑器（国内经常打不开）。教材里「去 Remix 试一下」的地方都指向这里
// 每个学生用自己的链上账号（私钥保管在 WeBASE-Front 里），所以合约里的 msg.sender 是学生自己

import * as chain from "./chain.mjs";
import { compileSource } from "./solidity.mjs";
import { readChapter, chapterSolFiles } from "./chapters.mjs";

const MAX_CODE = 20000;
const accountOf = (uid) => chain.account(`playground_${uid}`);

// 同一个人同时只能有一个链上操作；部署和发交易每分钟最多 20 次，防止有人刷链
// 只读查询不产生交易、不出块，单独计数，每分钟最多 120 次（「全部读取」一次会查十几个函数）
const busy = new Set();
const recent = { write: new Map(), read: new Map() };
const LIMIT = { write: 20, read: 120 };
// read = true：只读查询，不占「同一时间只能一个操作」的名额（等交易上链时也能先查数据）
async function guarded(uid, fn, read = false) {
  if (!chain.chainEnabled()) throw new Error("合约练习场还没有连接区块链");
  const kind = read ? "read" : "write", now = Date.now();
  const list = (recent[kind].get(uid) || []).filter((t) => now - t < 60_000);
  if (list.length >= LIMIT[kind]) throw new Error("操作太频繁了，请稍等一分钟");
  recent[kind].set(uid, [...list, now]);
  if (read) return fn();
  if (busy.has(uid)) throw new Error("上一个操作还没完成，请稍等");
  busy.add(uid);
  try {
    return await fn();
  } finally {
    busy.delete(uid);
  }
}

function prepare(code) {
  code = String(code || "");
  if (!code.trim()) throw new Error("代码是空的");
  if (code.length > MAX_CODE) throw new Error(`代码太长了（最多 ${MAX_CODE} 个字符）`);
  return code;
}

// ===== 编译：只编译不上链，返回每个合约的函数列表 =====
export function compile(code) {
  const src = prepare(code);
  const built = compileSource(src);
  const compiler = built.compiler;
  if (built.errors) return { ok: false, errors: built.errors, compiler };
  const contracts = Object.entries(built.contracts)
    .filter(([, c]) => c.bin) // 接口、抽象合约没有字节码，不能部署
    .map(([name, c]) => ({ name, abi: c.abi }));
  if (!contracts.length) return { ok: false, errors: [{ line: null, message: "没有可以部署的合约（接口和抽象合约不能直接部署）" }], compiler };
  return { ok: true, contracts, compiler };
}

// ===== 部署 =====
export async function deploy(uid, { code, contract, params = [] }) {
  const src = prepare(code);
  const built = compileSource(src);
  if (built.errors) throw new Error("编译失败，请先点「编译」看看错误");
  const c = built.contracts[contract];
  if (!c || !c.bin) throw new Error(`找不到可以部署的合约 ${contract}`);
  if (!Array.isArray(params) || params.length > 10) throw new Error("构造函数参数不对");
  checkParams(c.abi.find((x) => x.type === "constructor")?.inputs || [], params);
  return guarded(uid, async () => {
    const user = await accountOf(uid);
    const d = await chain.deploy(user, contract, c.abi, c.bin, params.map(String));
    return { name: contract, address: d.address, block: d.block, abi: c.abi, from: user };
  });
}

// ===== 检查参数：先在这里用中文说清楚哪一个填错了，不把链节点的英文报错直接丢给学生 =====
function checkParams(inputs, params) {
  inputs.forEach((p, i) => {
    const v = String(params[i] ?? "").trim(), label = `第 ${i + 1} 个参数 ${p.name || ""}（${p.type}）`;
    if (!v) throw new Error(`${label}还没填`);
    const t = p.type;
    if (/\[\d*\]$/.test(t) || t === "tuple") return; // 数组和结构体交给节点去检查
    if (/^u?int\d*$/.test(t) && !(t.startsWith("u") ? /^\d+$/ : /^-?\d+$/).test(v))
      throw new Error(`${label}要填${t.startsWith("u") ? "非负" : ""}整数，比如 0`);
    if (t === "address" && !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${label}要填 0x 开头的 42 位地址`);
    if (t === "bool" && !/^(true|false)$/.test(v)) throw new Error(`${label}只能填 true 或 false`);
    const b = t.match(/^bytes(\d+)$/);
    if (b && !new RegExp(`^0x[0-9a-fA-F]{${Number(b[1]) * 2}}$`).test(v)) throw new Error(`${label}要填 0x 开头、${Number(b[1]) * 2} 位十六进制`);
    if (t === "bytes" && !/^0x([0-9a-fA-F]{2})*$/.test(v)) throw new Error(`${label}要填 0x 开头的十六进制，空的就填 0x`);
  });
}

// ===== 调用函数 =====
// view / pure 函数只读不发交易；其他函数发一笔交易，返回交易号和区块号
export async function invoke(uid, { address, name, abi, fn, params = [] }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw new Error("合约地址不对");
  if (!Array.isArray(abi) || JSON.stringify(abi).length > 100_000) throw new Error("合约 ABI 不对");
  const f = abi.find((x) => x.type === "function" && x.name === fn && (x.inputs || []).length === params.length);
  if (!f) throw new Error(`合约里没有函数 ${fn}`);
  checkParams(f.inputs || [], params);
  const args = params.map((v) => String(v).trim());
  const read = f.stateMutability === "view" || f.stateMutability === "pure" || !!f.constant;
  return guarded(uid, async () => {
    const user = await accountOf(uid);
    if (read) {
      const r = await chain.callAll(user, name, abi, address, fn, args);
      return { kind: "call", result: Array.isArray(r) ? r : [r] };
    }
    const r = await chain.sendTx(user, name, abi, address, fn, args);
    return { kind: "tx", ...r };
  }, read);
}

// ===== 从教材某一讲里取出示例代码 =====
// 优先用这一讲文件夹里附带的 .sol 文件：找出「没有被别的文件引用」的主文件，
// 把它 import 的同目录文件按依赖顺序合并成一个文件（练习场只有一个编辑器）。
// 没有 .sol 文件时，退回到正文里第一段完整的合约代码
// 只合并同一个文件夹里的文件（./A.sol 或 A.sol）；别的章节和 OpenZeppelin 的 import 原样保留，编译时由 solidity.mjs 去找
const IMPORT_RE = /^\s*import\s+(?:[^'"]*from\s+)?["'](?:\.\/)?([\w-]+\.sol)["']\s*;\s*$/gm;

function flatten(files, entry) {
  const done = new Set(), parts = [];
  const visit = (name) => {
    if (done.has(name) || !files[name]) return;
    done.add(name);
    for (const m of files[name].matchAll(IMPORT_RE)) visit(m[1]);
    parts.push(`// ===== ${name} =====\n` + files[name]
      .replace(IMPORT_RE, (line, dep) => (files[dep] ? "" : line)) // 同目录的 import 已合并
      .replace(/^\s*\/\/\s*SPDX-License-Identifier:.*$/gm, "")
      .replace(/^\s*pragma\s+solidity[^;]*;/gm, "")
      .trim());
  };
  visit(entry);
  const pragma = files[entry].match(/pragma\s+solidity[^;]*;/)?.[0] || "pragma solidity ^0.8.0;";
  return `// SPDX-License-Identifier: MIT\n${pragma}\n\n${parts.join("\n\n")}\n`;
}

export function sample(chapterId) {
  const id = String(chapterId || "");
  const files = chapterSolFiles(id);
  const names = Object.keys(files);
  if (names.length) {
    const imported = new Set(names.flatMap((n) => [...files[n].matchAll(IMPORT_RE)].map((m) => m[1])));
    // 主文件：没被别人引用的里面，挑合约最多、最长的那个
    const roots = names.filter((n) => !imported.has(n) && /\bcontract\s+\w+/.test(files[n]));
    const entry = (roots.length ? roots : names).sort((a, b) => files[b].length - files[a].length)[0];
    const code = flatten(files, entry);
    return { code, files: names.length, entry };
  }
  const text = readChapter(id);
  if (!text) throw new Error("没有这一讲");
  const blocks = [...text.matchAll(/```(?:solidity|sol)\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const code = blocks.find((b) => /contract\s+\w+/.test(b) && /pragma/.test(b)) || blocks.find((b) => /contract\s+\w+/.test(b));
  if (!code) throw new Error("这一讲没有完整的合约代码");
  return { code };
}
