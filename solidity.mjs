// solidity.mjs —— 现场编译 Solidity：链上实验场和合约练习场共用
// 装了两个官方编译器（npm 包 solc），都在后端本地运行，不用联网：
//   solc 0.6.10：FISCO BCOS v2 官方支持的最高版本，链上实验场的题目按它写
//   solc 0.8.38：教材（WTF-Solidity）按 0.8 写。编译时把目标虚拟机设成 byzantium，
//                生成的字节码只用老指令，FISCO BCOS v2 的虚拟机也能执行。
//                2026-11-10 在我们的 4 节点链上实测：部署、调用、0.8 的溢出检查和 unchecked 都正常
// 按代码开头的 pragma 自动选编译器：写了 0.7 / 0.8 用 0.8.38，写的是 0.4～0.6 用 0.6.10
// 0.7 / 0.8 的代码一律用 0.8.38 编译：pragma 写死了别的小版本（如 0.8.17）时也照样编译，并在结果里说明

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import solc6 from "solc";
import solc8 from "solc8";

// ===== import 解析：只认这两类，其他一律不许 import =====
//   @openzeppelin/contracts/...：装在后端的 OpenZeppelin 5.0.2（官方 npm 包，教材里很多章节用到）
//   教材里别的章节的文件，比如 ../34_ERC721/ERC721.sol、31_ERC20/IERC20.sol
const OZ_DIR = path.dirname(createRequire(import.meta.url).resolve("@openzeppelin/contracts/package.json"));
const WTF_DIR = path.join("knowledge", "WTF-Solidity");
function readImport(p) {
  p = String(p).replace(/^https:\/\/github\.com\/OpenZeppelin\/openzeppelin-contracts\/blob\/[^/]+\/contracts\//, "@openzeppelin/contracts/")
    .replace(/^https:\/\/github\.com\/AmazingAng\/WTF-Solidity\/blob\/[^/]+\//, "")
    .replace(/^(\.\.?\/)+/, "");
  let file = null;
  if (p.startsWith("@openzeppelin/contracts/")) file = path.join(OZ_DIR, p.slice("@openzeppelin/contracts/".length));
  else if (/^(\d{2}|S\d{2})_[\w-]+\/[\w-]+\.sol$/.test(p)) file = path.join(WTF_DIR, p);
  else if (/^[\w-]+\.sol$/.test(p) && fs.existsSync(WTF_DIR)) {
    // 只写了文件名（同一章里没有这个文件）：去教材其他章节找，比如 32 章的 ./IERC20.sol 在 31_ERC20 里
    const dir = fs.readdirSync(WTF_DIR).sort().find((d) => fs.existsSync(path.join(WTF_DIR, d, p)));
    if (dir) file = path.join(WTF_DIR, dir, p);
  }
  const root = path.resolve(file ? (file.startsWith(OZ_DIR) ? OZ_DIR : WTF_DIR) : ".");
  if (!file || !path.resolve(file).startsWith(root + path.sep) || !fs.existsSync(file)) return { error: "这里不能 import 其他文件" };
  return { contents: fs.readFileSync(file, "utf-8") };
}

const EVM_FOR_FISCO = "byzantium";

// 根据 pragma 选编译器：没写 pragma 的默认用 0.8
function pick(code) {
  const m = code.match(/pragma\s+solidity\s+([^;]+);/);
  if (m && !/0\.[78]\./.test(m[1])) return { solc: solc6, version: "0.6.10", evm: undefined };
  return { solc: solc8, version: "0.8.38", evm: EVM_FOR_FISCO };
}

// 编译：返回 { contracts: { 合约名: { abi, bin } }, compiler } 或者 { errors: [{ line, message }], compiler }
export function compileSource(code, file = "Contract.sol") {
  const { solc, version, evm } = pick(code);
  const compiler = evm ? `solc ${version}（目标虚拟机 ${evm}，兼容 FISCO BCOS v2）` : `solc ${version}`;
  const settings = { optimizer: { enabled: false }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } };
  if (evm) settings.evmVersion = evm;
  // 0.8 的代码：把 pragma 放宽到 0.7～0.8 都接受（只影响编译，不改学生的代码；行号不变）
  const src = evm ? code.replace(/pragma\s+solidity\s+[^;]+;/g, "pragma solidity >=0.7.0 <0.9.0;") : code;
  const input = { language: "Solidity", sources: { [file]: { content: src } }, settings };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
  const errors = (out.errors || [])
    .filter((e) => e.severity === "error")
    .map((e) => ({ line: e.sourceLocation?.file === file ? lineOf(code, e.sourceLocation.start) : null, message: explain(e.message) }));
  if (errors.length) return { errors, compiler };
  const contracts = {};
  for (const [name, c] of Object.entries(out.contracts?.[file] || {}))
    contracts[name] = { abi: c.abi, bin: c.evm.bytecode.object };
  return { contracts, compiler };
}

function lineOf(code, pos) {
  return typeof pos === "number" && pos >= 0 ? code.slice(0, pos).split("\n").length : null;
}

// 常见报错后面补一句中文说明
function explain(msg) {
  if (/not found: 这里不能 import/.test(msg)) return msg + "（练习场只支持 import OpenZeppelin 库和教材里其他章节的文件）";
  if (/requires different compiler version/.test(msg)) return msg + "（练习场支持 0.4.25～0.6.10 和 0.7～0.8.38，请检查 pragma）";
  return msg;
}
