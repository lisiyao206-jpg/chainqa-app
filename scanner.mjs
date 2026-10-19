// scanner.mjs —— 规则扫描器 + SWC 漏洞库：给 AI 审计 Agent 当「工具」用
//   scanContract(code)  逐行检查常见漏洞写法，返回疑似问题（带 SWC 编号、行号、严重程度）
//   lookupSwc(id)       查 SWC 漏洞库：漏洞名、原理、修复方法
// 规则扫描是「死规则」：快、稳定、不会胡说，但会有误报漏报；
// AI 负责把扫描结果和教材资料结合起来判断、解释——两者配合，比单用其中一个更可靠

// ===== SWC 漏洞库（SWC Registry：智能合约漏洞的标准编号）=====
export const SWC = {
  "SWC-101": { title: "整数溢出 / 下溢", desc: "Solidity 0.8 之前，整数运算超出范围会「绕回」（0 - 1 变成 2²⁵⁶-1），不会报错。", fix: "使用 0.8 以上版本（自动检查溢出），或先比较大小再运算、使用 SafeMath。" },
  "SWC-103": { title: "浮动的编译器版本", desc: "pragma 写 ^0.8.0 这类范围，不同人编译出的字节码可能不同，也可能用到有漏洞的编译器版本。", fix: "部署的合约锁定具体版本，如 pragma solidity 0.8.21;" },
  "SWC-104": { title: "没有检查底层调用的返回值", desc: "call / send 失败时不会自动回滚，只返回 false；不检查就当作成功了。", fix: "用 (bool ok, ) = addr.call(...); require(ok); 或使用 transfer / OpenZeppelin Address 库。" },
  "SWC-105": { title: "未受保护的提款", desc: "能转走合约资金的函数没有权限检查，任何人都能调用。", fix: "加 onlyOwner 等访问控制修饰器，或在函数开头 require(msg.sender == owner)。" },
  "SWC-106": { title: "未受保护的 selfdestruct", desc: "任何人都能调用 selfdestruct，销毁合约并把余额转走。", fix: "删掉 selfdestruct，或加严格的权限控制。" },
  "SWC-107": { title: "重入攻击", desc: "先对外转账/调用、后更新状态：对方合约在回调里再次进入本函数，此时状态还没更新，可以反复取钱。", fix: "检查-生效-交互（先改状态再转账），或使用 ReentrancyGuard 的 nonReentrant。" },
  "SWC-112": { title: "delegatecall 调用不可信合约", desc: "delegatecall 用调用者的存储执行对方的代码；目标地址可控时，攻击者能改掉 owner 等任意存储。", fix: "只 delegatecall 写死的、可信的合约地址，绝不使用用户传入的地址。" },
  "SWC-113": { title: "调用失败导致拒绝服务", desc: "循环里给多个地址转账，其中一个故意失败（回滚），整个函数就永远执行不下去。", fix: "改成「拉取」模式：记账后让每个人自己来提款。" },
  "SWC-114": { title: "交易顺序依赖（抢跑）", desc: "交易在打包前是公开的，攻击者看到后可以出更高 gas 抢先执行。", fix: "提交-揭示（commit-reveal）、设置滑点和截止时间。" },
  "SWC-115": { title: "用 tx.origin 做身份验证", desc: "tx.origin 是交易最初的发起人；主人被骗调用恶意合约时，恶意合约再调过来，tx.origin 仍是主人。", fix: "身份验证一律使用 msg.sender。" },
  "SWC-116": { title: "依赖区块时间", desc: "block.timestamp 可以被出块者在一定范围内调整，不适合做精确判断或随机源。", fix: "只用于粗粒度的时间判断，不要用它决定输赢。" },
  "SWC-120": { title: "用链上数据生成随机数", desc: "block.timestamp、prevrandao、blockhash 等对所有人公开，攻击者能在同一区块里先算出结果。", fix: "使用 Chainlink VRF 等可验证随机数，或 commit-reveal。" },
  "SWC-121": { title: "签名可以被重放", desc: "ecrecover 验证签名时没有 nonce 或已使用标记，同一个签名可以被反复提交。", fix: "签名内容包含 nonce、合约地址、链 ID，并记录已使用的签名。" },
  "SWC-128": { title: "区块 gas 上限导致拒绝服务", desc: "遍历一个会不断变长的数组，数组大到一定程度后，函数需要的 gas 超过区块上限，再也执行不了。", fix: "避免遍历无上限的数组，改成分批处理或拉取模式。" },
};

export function lookupSwc(id) {
  const key = String(id || "").toUpperCase().replace(/^(\d+)$/, "SWC-$1").replace(/^SWC(\d)/, "SWC-$1");
  const e = SWC[key];
  return e ? { id: key, ...e } : { error: `没有 ${id} 这个编号。可查的有：${Object.keys(SWC).join("、")}` };
}

// ===== 规则扫描 =====
// 去掉注释和字符串里的内容，避免「注释里提到 tx.origin」也被当成问题
function clean(line) {
  return line.replace(/\/\/.*$/, "").replace(/"([^"\\]|\\.)*"/g, '""');
}

// 把合约切成一个个函数：记下每个函数的起止行、函数头（有没有修饰器、可见性）
function functions(lines) {
  const list = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(function\s+(\w+)|constructor|receive|fallback)\b/);
    if (!m) continue;
    let header = "", j = i, depth = 0, started = false;
    // 函数头可能跨好几行，一直读到第一个 {
    while (j < lines.length && !lines[j].includes("{")) header += lines[j++] + " ";
    if (j >= lines.length) continue;
    header += lines[j].slice(0, lines[j].indexOf("{"));
    let end = j;
    for (let k = j; k < lines.length; k++) {
      for (const ch of lines[k]) {
        if (ch === "{") { depth++; started = true; }
        if (ch === "}") depth--;
      }
      if (started && depth === 0) { end = k; break; }
    }
    list.push({ name: m[2] || m[1], start: i, bodyStart: j, end, header });
  }
  return list;
}

const ACCESS = /\b(onlyOwner|onlyAdmin|onlyRole|auth|whenNotPaused\s+onlyOwner)\b|require\s*\(\s*msg\.sender\s*==|require\s*\(\s*\w+\[msg\.sender\]/;

export function scanContract(code) {
  const raw = String(code || "").split("\n");
  const lines = raw.map(clean);
  const found = [];
  const add = (swc, line, severity, message) => {
    if (!found.some((f) => f.swc === swc && f.line === line)) found.push({ swc, title: SWC[swc].title, line, severity, message, code: raw[line - 1]?.trim() });
  };

  // 编译器版本
  const pragma = lines.findIndex((l) => /pragma\s+solidity/.test(l));
  const ver = pragma >= 0 ? lines[pragma].match(/(\d+)\.(\d+)\.(\d+)/) : null;
  const before08 = ver && Number(ver[1]) === 0 && Number(ver[2]) < 8;
  if (pragma >= 0 && /[\^>~]/.test(lines[pragma])) add("SWC-103", pragma + 1, "提示", "编译器版本是一个范围，建议锁定具体版本");
  const usesSafeMath = lines.some((l) => /SafeMath|using\s+\w+\s+for\s+uint/.test(l));

  lines.forEach((l, i) => {
    const n = i + 1;
    if (/tx\.origin\s*[!=]=|[!=]=\s*tx\.origin/.test(l) && /require|if\s*\(|assert/.test(l)) add("SWC-115", n, "高危", "用 tx.origin 判断身份，可被钓鱼合约绕过");
    if (/keccak256|sha256/.test(l) && /block\.(timestamp|prevrandao|difficulty|number|coinbase)|blockhash|now\b/.test(l)) add("SWC-120", n, "高危", "用区块数据生成随机数，结果可被提前算出");
    else if (/uint\w*\s*\(\s*blockhash/.test(l)) add("SWC-120", n, "高危", "用 blockhash 当随机数，结果公开可算");
    else if (/block\.timestamp|\bnow\b/.test(l) && /[<>]=?|==/.test(l) && /require|if\s*\(/.test(l)) add("SWC-116", n, "低危", "用区块时间做判断，可被出块者小幅操纵");
    if (/\.delegatecall\s*\(/.test(l)) add("SWC-112", n, "高危", "使用 delegatecall：确认目标地址不能被用户控制");
    if (/\.call\s*[({]/.test(l) && !/=\s*[^=]*\.call|require\s*\(|if\s*\(|return\s/.test(l)) add("SWC-104", n, "中危", "底层 call 的返回值没有检查");
    if (/\.send\s*\(/.test(l) && !/require\s*\(|if\s*\(|=/.test(l)) add("SWC-104", n, "中危", "send 的返回值没有检查");
    if (/ecrecover\s*\(/.test(l) && !lines.some((x) => /nonce|usedSignatures|used\[/.test(x))) add("SWC-121", n, "中危", "验证签名时没有 nonce / 已使用记录，签名可被重放");
    if (/for\s*\(.*<\s*\w+\.length/.test(l)) add("SWC-128", n, "低危", "遍历长度不固定的数组，数组过大时可能超出 gas 上限");
    // 无效检查：uint 永远 ≥ 0，「a - b >= 0」什么也拦不住（0.8 以前还会先下溢）
    if (/require\s*\([^;]*-\s*[\w\[\].]+\s*>=\s*0\b/.test(l)) add("SWC-101", n, "高危", "无效检查：uint 永远 ≥ 0，先做减法再判断 ≥ 0 拦不住余额不足");
  });

  // 以函数为单位检查：溢出、重入、未受保护的提款 / 自毁 / 改 owner
  for (const f of functions(lines)) {
    const body = lines.slice(f.bodyStart, f.end + 1);

    // 0.8 以前、没用 SafeMath：函数里做了加减法，却没有「先比大小」的检查，就可能溢出 / 下溢
    // 「先比大小」= require 里有比较，而且不是「a - b >= 0」这种无效检查
    // 「先比大小」= 某条 require 直接比较了被减的那个变量，而且比较式里没有加减法
    if (before08 && !usesSafeMath) {
      const guards = body.filter((l) => /require\s*\(/.test(l) && /(>=|<=|>|<)/.test(l) && !/[\w\]]\s*[-+]\s*[\w(]/.test(l));
      body.forEach((l, k) => {
        const m = l.match(/^\s*([\w.]+(?:\[[^\]]+\])*)\s*-=/);
        if (m && !guards.some((g) => g.includes(m[1])))
          add("SWC-101", f.bodyStart + k + 1, "高危", `「${f.name}」0.8 以前的版本，对 ${m[1]} 做减法前没有先检查它够不够减，可能下溢`);
        // 先减再比：比较式里的减法本身就会下溢，检查形同虚设
        if (/require\s*\([^;]*[\w\]]\s*-\s*[\w(][^;]*(>=|>)/.test(l))
          add("SWC-101", f.bodyStart + k + 1, "高危", "先做减法再比较：减法本身就会下溢，这个检查拦不住余额不足");
      });
    }
    const isPublic = /\b(public|external)\b/.test(f.header) || /receive|fallback/.test(f.name);
    const guarded = ACCESS.test(f.header) || body.some((l) => ACCESS.test(l));

    // 重入：对外转账 / 调用之后，又修改了状态（给 mapping 或变量赋值）
    const callIdx = body.findIndex((l) => /\.call\s*[({]|\.transfer\s*\(|\.send\s*\(/.test(l));
    if (callIdx >= 0 && !/nonReentrant/.test(f.header)) {
      const after = body.slice(callIdx + 1).findIndex((l) => /^\s*\w+(\[[^\]]+\])*\s*(=|\+=|-=)[^=]/.test(l) && !/^\s*(bool|uint|int|address|bytes|string)\b/.test(l));
      if (after >= 0) {
        const isCall = /\.call\s*[({]/.test(body[callIdx]);
        add("SWC-107", f.bodyStart + callIdx + 1, isCall ? "高危" : "中危",
          `「${f.name}」先对外转账（第 ${f.bodyStart + callIdx + 1} 行），后修改状态（第 ${f.bodyStart + callIdx + after + 2} 行），可能被重入`);
      }
    }
    if (!isPublic || guarded || f.name === "constructor") continue;
    body.forEach((l, k) => {
      const n = f.bodyStart + k + 1;
      if (/selfdestruct\s*\(/.test(l)) add("SWC-106", n, "高危", `「${f.name}」任何人都能调用 selfdestruct`);
      // 把全部余额转给「调用者自己以外的任意地址」（比如参数传进来的 to）却没有权限检查
      if (/address\s*\(\s*this\s*\)\.balance/.test(l) && /transfer|send|call/.test(l) && !/msg\.sender/.test(l))
        add("SWC-105", f.start + 1, "高危", `「${f.name}」能把合约全部余额转到任意地址，却没有权限检查`);
      if (/^\s*owner\s*=/.test(l)) add("SWC-105", f.start + 1, "高危", `「${f.name}」能修改 owner，却没有权限检查`);
    });
  }

  const order = { 高危: 0, 中危: 1, 低危: 2, 提示: 3 };
  return found.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
}
