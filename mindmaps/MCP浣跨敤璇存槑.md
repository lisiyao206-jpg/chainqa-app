# 链上安全局 MCP 服务使用说明

## 这是什么
MCP（Model Context Protocol，模型上下文协议）是 AI 工具的「通用插座」。
我们把网站里 AI 审计 Agent 用的工具，做成了一个标准的 MCP 服务（`mcp-server.mjs`）。
这样，任何支持 MCP 的 AI 助手（Claude Desktop、Cursor、VS Code Copilot、Cherry Studio 等）都能直接调用它来审计合约。

| 工具 | 作用 | 需要 API Key 吗 |
|---|---|---|
| `scan_contract` | 规则扫描一份 Solidity 合约，返回疑似漏洞（SWC 编号、行号、严重程度） | 不需要 |
| `lookup_swc` | 查询 SWC 漏洞库：漏洞原理和修复方法 | 不需要 |
| `search_knowledge` | 在教材知识库里检索相关段落（带出处） | 需要（用于向量检索），并且要先 `node rag.mjs build` |

## 接入方法（以 Claude Desktop / Cursor 为例）
在 AI 助手的 MCP 配置文件里加入下面这段（把路径换成你电脑上项目的实际位置）：

```json
{
  "mcpServers": {
    "chainqa-security": {
      "command": "node",
      "args": ["D:\\chainqa-app\\mcp-server.mjs"]
    }
  }
}
```

- Claude Desktop：设置 → 开发者 → 编辑配置（claude_desktop_config.json）
- Cursor：设置 → MCP → Add new MCP server

保存后重启 AI 助手，就能在对话里说「帮我用 scan_contract 审计这份合约：……」。

## 技术说明（答辩可讲）
- 协议：JSON-RPC 2.0，通过标准输入 / 输出（stdio）通信，实现了 `initialize`、`tools/list`、`tools/call`、`ping`。
- 没有用任何第三方库，按 MCP 规范手写，代码约 120 行，注释齐全。
- 与网站共用同一套工具代码（`scanner.mjs`、`rag.mjs`），一处改进，两边同时生效。
- 工具出错时按协议返回 `isError`，AI 助手能看到失败原因；没配 API Key 时只有检索工具不可用，另外两个照常工作。

## 自己测试
```bash
node mcp-server.mjs
```
然后粘贴一行，按回车：
```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```
能看到 3 个工具的说明，就说明服务正常。按 Ctrl + C 退出。
