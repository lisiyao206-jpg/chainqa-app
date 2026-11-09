// playground.mjs —— 合约练习场：随便写一个合约，编译后部署到我们自己的 FISCO BCOS 联盟链上，再调用它的函数
// 用来代替国外的 Remix 在线编辑器（国内经常打不开）。教材里「去 Remix 试一下」的地方都指向这里
// 每个学生用自己的链上账号（私钥保管在 WeBASE-Front 里），所以合约里的 msg.sender 是学生自己

import * as chain from "./chain.mjs";
import { adapt06, compileSource } from "./solidity.mjs";
import { readChapter } from "./chapters.mjs";

const MAX_CODE = 20000;
const accountOf = (uid) => chain.account(`playground_${uid}`);

// 同一个人同时只能有一个链上操作；每分钟最多 20 次，防止有人刷链
const busy = new Set();
const recent = new Map();
// read = true：只读查询，不占「同一时间只能一个操作」的名额（等交易上链时也能先查数据）
async function guarded(uid, fn, read = false) {
  if (!chain.chainEnabled()) throw new Error("合约练习场还没有连接区块链");
  const now = Date.now();
  const list = (recent.get(uid) || []).filter((t) => now - t < 60_000);
  if (list.length >= 20) throw new Error("操作太频繁了，请稍等一分钟");
  recent.set(uid, [...list, now]);
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
  return adapt06(code);
}

// ===== 编译：只编译不上链，返回每个合约的函数列表 =====
export function compile(code) {
  const { code: src, changes } = prepare(code);
  const built = compileSource(src);
  if (built.errors) return { ok: false, errors: built.errors, changes, code: src };
  const contracts = Object.entries(built.contracts)
    .filter(([, c]) => c.bin) // 接口、抽象合约没有字节码，不能部署
    .map(([name, c]) => ({ name, abi: c.abi }));
  if (!contracts.length) return { ok: false, errors: [{ line: null, message: "没有可以部署的合约（接口和抽象合约不能直接部署）" }], changes, code: src };
  return { ok: true, contracts, changes, code: src };
}

// ===== 部署 =====
export async function deploy(uid, { code, contract, params = [] }) {
  const { code: src } = prepare(code);
  const built = compileSource(src);
  if (built.errors) throw new Error("编译失败，请先点「编译」看看错误");
  const c = built.contracts[contract];
  if (!c || !c.bin) throw new Error(`找不到可以部署的合约 ${contract}`);
  if (!Array.isArray(params) || params.length > 10) throw new Error("构造函数参数不对");
  return guarded(uid, async () => {
    const user = await accountOf(uid);
    const d = await chain.deploy(user, contract, c.abi, c.bin, params.map(String));
    return { name: contract, address: d.address, block: d.block, abi: c.abi, from: user };
  });
}

// ===== 调用函数 =====
// view / pure 函数只读不发交易；其他函数发一笔交易，返回交易号和区块号
export async function invoke(uid, { address, name, abi, fn, params = [] }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw new Error("合约地址不对");
  if (!Array.isArray(abi) || JSON.stringify(abi).length > 100_000) throw new Error("合约 ABI 不对");
  const f = abi.find((x) => x.type === "function" && x.name === fn && (x.inputs || []).length === params.length);
  if (!f) throw new Error(`合约里没有函数 ${fn}`);
  const args = params.map(String);
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
// 取第一段带 contract 的 solidity 代码块，自动转成 0.6 的写法
export function sample(chapterId) {
  const text = readChapter(String(chapterId || ""));
  if (!text) throw new Error("没有这一讲");
  const blocks = [...text.matchAll(/```(?:solidity|sol)\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const code = blocks.find((b) => /contract\s+\w+/.test(b) && /pragma/.test(b)) || blocks.find((b) => /contract\s+\w+/.test(b));
  if (!code) throw new Error("这一讲没有完整的合约代码");
  const { code: src, changes } = adapt06(code);
  return { code: src, changes };
}
