// mcp-server.mjs —— 把「链上安全局」的审计工具做成一个 MCP 服务
//
// MCP（Model Context Protocol，模型上下文协议）是 AI 工具的「通用插座」：
// 按这个协议写好的工具，Claude Desktop、Cursor、VS Code 等任何支持 MCP 的 AI 助手都能直接接上使用。
// 我们的 AI 审计 Agent 在网站里用这些工具；有了 MCP 服务，开发者在自己的 AI 编程工具里也能调用它们审计合约。
//
// 提供 3 个工具（和网站里 AI 审计 Agent 用的是同一套代码）：
//   scan_contract     规则扫描一份 Solidity 合约，返回疑似漏洞（SWC 编号、行号、严重程度）
//   lookup_swc        查询 SWC 漏洞库：漏洞原理和修复方法
//   search_knowledge  在教材知识库里检索相关段落（需要 .env 里的智谱 API Key）
//
// 用法：node mcp-server.mjs（一般不用手动运行，由 AI 助手按配置自动启动，通过「标准输入 / 输出」通信）
// 协议：JSON-RPC 2.0，每条消息一行 JSON。只能往 stdout 写协议消息，日志一律写 stderr

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { scanContract, lookupSwc, SWC } from "./scanner.mjs";

// 不管从哪个目录启动，都切到项目目录：知识库（vectors.json）和 .env 都按项目目录找
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const log = (...a) => console.error("[chainqa-mcp]", ...a);

const TOOLS = [
  {
    name: "scan_contract",
    description: "对一份 Solidity 智能合约做规则扫描，找出常见漏洞（重入、tx.origin、坏随机数、整数溢出、未受保护的提款等 13 类），返回 SWC 编号、行号、严重程度和说明。",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "完整的 Solidity 合约代码" } }, required: ["code"] },
  },
  {
    name: "lookup_swc",
    description: `查询 SWC 智能合约漏洞库，返回漏洞名称、原理和修复方法。可查的编号：${Object.keys(SWC).join("、")}`,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "SWC 编号，例如 SWC-107" } }, required: ["id"] },
  },
  {
    name: "search_knowledge",
    description: "在智能合约安全教材知识库（WTF-Solidity 等）中检索与问题最相关的段落，返回原文和出处，用来给结论找依据。",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "要搜索的问题或关键词" } }, required: ["query"] },
  },
];

async function callTool(name, args = {}) {
  if (name === "scan_contract") {
    const code = String(args.code || "");
    if (!code.trim()) throw new Error("code 不能为空");
    if (code.length > 50000) throw new Error("合约太长（最多 50000 字）");
    const findings = scanContract(code);
    return findings.length ? JSON.stringify(findings, null, 2) : "规则扫描没有发现疑似问题（规则扫描可能漏报，建议人工复核）";
  }
  if (name === "lookup_swc") return JSON.stringify(lookupSwc(args.id), null, 2);
  if (name === "search_knowledge") {
    // 检索要用智谱的向量接口：没配 Key 就给出明确提示，而不是让整个服务崩掉
    const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
    if (!process.env.ZHIPU_API_KEY && !/^\s*ZHIPU_API_KEY\s*=\s*\S+/m.test(env)) throw new Error("没有配置 ZHIPU_API_KEY，无法检索知识库（另外两个工具不受影响）");
    if (!fs.existsSync("vectors.json")) throw new Error("知识库还没建好，请先运行 node rag.mjs build");
    const { search, THRESHOLD } = await import("./rag.mjs"); // 用到时才加载
    const hits = (await search(String(args.query || "").slice(0, 300), 4)).filter((h) => h.score >= THRESHOLD);
    if (!hits.length) return "知识库里没有找到相关内容";
    return hits.map((h, i) => `[${i + 1}] 出处：${h.file} › ${h.heading}（相似度 ${h.score.toFixed(3)}）\n${h.text.slice(0, 800)}`).join("\n\n---\n\n");
  }
  throw new Error(`没有 ${name} 这个工具`);
}

// ===== JSON-RPC 处理 =====
async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: params?.protocolVersion || "2025-06-18", // 跟客户端用同一个协议版本
        capabilities: { tools: {} },
        serverInfo: { name: "chainqa-security", version: "1.0.0" },
        instructions: "链上安全局的智能合约安全工具：规则扫描、SWC 漏洞库、教材知识库检索。",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        const text = await callTool(params?.name, params?.arguments);
        return reply({ content: [{ type: "text", text }] });
      } catch (err) {
        // 工具执行出错：按协议返回 isError，让 AI 助手知道失败原因，而不是协议错误
        return reply({ content: [{ type: "text", text: "出错了：" + err.message }], isError: true });
      }
    default:
      if (id === undefined) return null; // 通知类消息（比如 notifications/initialized）不需要回复
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `不支持的方法：${method}` } };
  }
}

// 从标准输入一行一行读消息
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON 格式错误" } }) + "\n");
      continue;
    }
    const res = await handle(msg);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  }
});
log("已启动，等待 AI 助手连接（stdio）");
