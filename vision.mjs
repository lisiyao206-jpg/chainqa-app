// vision.mjs —— 多模态：看图识代码
// 用户上传一张代码截图（比如在区块链浏览器、教程、聊天里看到的合约），
// 交给智谱的视觉模型 glm-4v-flash（免费）读出里面的 Solidity 代码，再交给 AI 审计 Agent

const BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const MAX_BYTES = 5 * 1024 * 1024; // 图片最大 5MB

const PROMPT = `识别图片中的 Solidity 智能合约代码，原样输出。要求：
1. 只输出代码本身，不要任何解释，不要用 \`\`\` 包起来。
2. 保留原来的换行和缩进；看不清的字符根据 Solidity 语法合理补全。
3. 不要输出图片里的行号、文件名、界面文字。
4. 如果图片里没有代码，只输出 NO_CODE。`;

// image 是浏览器传来的 data URL：data:image/png;base64,xxxx
export async function extractCode(image) {
  const m = String(image || "").match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("只支持 PNG / JPG / WEBP 图片");
  if (m[2].length * 0.75 > MAX_BYTES) throw new Error("图片不能超过 5MB");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: "glm-4v-flash",
      temperature: 0.1, // 识别代码要「照抄」，不要发挥
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: m[2] } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error("识别失败: " + (await res.text()).slice(0, 200));
  let code = String((await res.json()).choices[0].message.content || "").trim();
  // 模型偶尔还是会用 ``` 包起来，去掉
  code = code.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "").trim();
  if (!code || /^NO_CODE/.test(code)) throw new Error("图片里没有识别到代码，换一张清晰一点的截图试试");
  return { code };
}
