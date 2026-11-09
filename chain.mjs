// chain.mjs —— 和区块链打交道：通过 WeBASE-Front 的 HTTP 接口操作 FISCO BCOS 联盟链
// 不用学区块链 SDK：和调用智谱 AI 一样，往 WeBASE-Front 发 HTTP 请求就能部署合约、发交易、读数据
// .env 里没有配置 WEBASE_URL 时，链上实验场整体关闭，网站其他功能不受影响

// 注意：.env 是在 rag.mjs 里读进来的，比这个文件晚执行，所以配置要在用到的时候再读，不能在文件开头就读死
const base = () => (process.env.WEBASE_URL || "").replace(/\/$/, ""); // 例：http://127.0.0.1:5002/WeBASE-Front
const group = () => Number(process.env.CHAIN_GROUP || 1);

export const chainEnabled = () => !!base();

// ---------- 和 WeBASE-Front 通信 ----------
async function webase(path, body) {
  const res = await fetch(base() + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text; // 部署接口直接返回合约地址字符串
  }
  // WeBASE-Front 出错时返回 { code, errorMessage }
  if (!res.ok || (data && typeof data === "object" && !Array.isArray(data) && data.code && data.code !== 0 && data.errorMessage)) {
    const err = new Error((data && data.errorMessage) || `WeBASE-Front 请求失败（${res.status}）`);
    err.webase = data;
    throw err;
  }
  return data;
}

// 实验用的账号（管理员、攻击者）。私钥由 WeBASE-Front 保管，网站只知道地址
const accounts = {};
export async function account(userName) {
  if (accounts[userName]) return accounts[userName];
  const list = await webase("/privateKey/localKeyStores").catch(() => []);
  const found = Array.isArray(list) && list.find((k) => k.userName === userName);
  const key = found || (await webase(`/privateKey?type=0&userName=${encodeURIComponent(userName)}`));
  return (accounts[userName] = key.address);
}

export const toNumber = (v) => (typeof v === "string" && v.startsWith("0x") ? parseInt(v, 16) : Number(v));

// 交易失败时，从回执里取出 require 的原因（如 "not owner"）
function revertReason(receipt) {
  const out = String(receipt?.output || "");
  // Error(string) 的编码：0x08c379a0 + 偏移 + 长度 + 字符串
  if (out.startsWith("0x08c379a0")) {
    const hex = out.slice(10);
    const len = parseInt(hex.slice(64, 128), 16);
    return Buffer.from(hex.slice(128, 128 + len * 2), "hex").toString("utf8");
  }
  return receipt?.message || receipt?.statusMsg || "交易被拒绝";
}

export async function blockNumber() {
  return toNumber(await webase(`/${group()}/web3/blockNumber`));
}

// 链的状态：群组、节点数、当前区块高度
export async function chainInfo() {
  const [block, peers] = await Promise.all([blockNumber(), webase(`/${group()}/web3/groupPeers`).catch(() => [])]);
  return { group: group(), nodes: Array.isArray(peers) ? peers.length : 0, block };
}

// 部署合约，返回 { address, block }；funcParam 是构造函数的参数
export async function deploy(user, name, abi, bin, funcParam = []) {
  const r = await webase("/contract/deploy", {
    groupId: group(), user, contractName: name, abiInfo: abi, bytecodeBin: bin, funcParam,
  });
  return { address: typeof r === "string" ? r : r.contractAddress, block: await blockNumber() };
}

// 发一笔交易，返回 { tx, block, ok, reason }
export async function sendTx(user, name, abi, address, funcName, funcParam = []) {
  try {
    const r = await webase("/trans/handle", {
      groupId: group(), user, contractName: name, contractAddress: address,
      funcName, funcParam, contractAbi: abi, useCns: false,
    });
    // 回执里 statusOK 为 true、status 为 "0x0" 表示成功；require 不通过时交易回滚，status 不为 0
    const ok = r.statusOK !== undefined ? r.statusOK === true : r.status === undefined || r.status === "0x0";
    return { tx: r.transactionHash, block: toNumber(r.blockNumber), ok, reason: ok ? "" : revertReason(r) };
  } catch (err) {
    // 有的版本交易回滚时直接返回错误对象：同样算「交易被拒绝」
    const msg = String(err.message || "");
    if (/revert|not owner|status|execut/i.test(msg)) return { ok: false, reason: msg };
    throw err;
  }
}

// 只读调用（view 函数），不产生交易；返回第一个返回值（数字、地址等，原样返回）
export async function call(user, name, abi, address, funcName, funcParam = []) {
  const r = await callAll(user, name, abi, address, funcName, funcParam);
  return Array.isArray(r) ? r[0] : r;
}

// 只读调用，返回全部返回值（数组）
export async function callAll(user, name, abi, address, funcName, funcParam = []) {
  return webase("/trans/handle", {
    groupId: group(), user, contractName: name, contractAddress: address,
    funcName, funcParam, contractAbi: abi, useCns: false,
  });
}
