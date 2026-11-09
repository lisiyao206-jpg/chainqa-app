// solidity.mjs —— 现场编译 Solidity：链上实验场和合约练习场共用
// 编译器是官方的 solc 0.6.10（npm 包 solc），FISCO BCOS 2.x 支持的最高版本，装在后端里，不用联网

import solc from "solc";

// 教材（WTF-Solidity）里的代码大多按 0.8 写。有两处写法在 0.6 里只是「格式不同」，可以自动改过来：
//   1. pragma solidity ^0.8.x  →  0.6 能接受的版本范围
//   2. 0.8 的构造函数不写 public，0.6 必须写
// 改了什么都告诉学生；真正用到 0.8 新语法（unchecked、receive 等）的，编译器会报错并给出提示
export function adapt06(code) {
  const changes = [];
  let c = code.replace(/pragma\s+solidity\s+[^;]+;/g, (m) => {
    if (!/0\.[78]\./.test(m)) return m;
    changes.push("把 pragma 版本改成了 FISCO BCOS v2 支持的 0.6");
    return "pragma solidity >=0.4.24 <0.7.0;";
  });
  c = c.replace(/constructor\s*\(([^)]*)\)([^{;]*)\{/g, (m, args, mods) => {
    if (/\b(public|internal)\b/.test(mods)) return m;
    changes.push("给构造函数补上了 public（0.6 的写法要求）");
    return `constructor(${args}) public${mods}{`;
  });
  return { code: c, changes: [...new Set(changes)] };
}

// 编译：返回 { contracts: { 合约名: { abi, bin } } } 或者 { errors: [{ line, message }] }
export function compileSource(code, file = "Contract.sol") {
  const input = {
    language: "Solidity",
    sources: { [file]: { content: code } },
    settings: { optimizer: { enabled: false }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  // 不允许 import 别的文件（服务器上没有 OpenZeppelin 等外部库）
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: () => ({ error: "这里不能 import 其他文件" }) }));
  const errors = (out.errors || [])
    .filter((e) => e.severity === "error")
    .map((e) => ({ line: lineOf(code, e.sourceLocation?.start), message: explain(e.message) }));
  if (errors.length) return { errors };
  const contracts = {};
  for (const [name, c] of Object.entries(out.contracts?.[file] || {}))
    contracts[name] = { abi: c.abi, bin: c.evm.bytecode.object };
  return { contracts };
}

function lineOf(code, pos) {
  return typeof pos === "number" && pos >= 0 ? code.slice(0, pos).split("\n").length : null;
}

// 常见报错后面补一句中文说明
function explain(msg) {
  if (/not found: 这里不能 import/.test(msg)) return msg + "（练习场不支持 import 外部文件，比如 OpenZeppelin 库）";
  if (/requires different compiler version/.test(msg)) return msg + "（FISCO BCOS v2 只支持 Solidity 0.4.25～0.6.10）";
  if (/unchecked|receive|fallback/.test(msg)) return msg + "（这可能是 Solidity 0.8 才有的写法，0.6 不支持）";
  return msg;
}
