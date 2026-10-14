// chapters.mjs —— 读取教材目录和章节原文，给「训练营」页面用

import fs from "node:fs";
import path from "node:path";

const BOOK_DIR = path.join("knowledge", "WTF-Solidity");

// 按讲数分组（和 WTF-Solidity 官方 README 的分法一致）
const GROUPS = [
  { name: "入门篇", match: (n) => n >= 1 && n <= 15 },
  { name: "进阶篇", match: (n) => n >= 16 && n <= 30 },
  { name: "应用篇", match: (n) => n >= 31 && n <= 45 },
  { name: "高阶篇", match: (n) => n >= 46 && n <= 99 },
  { name: "合约安全", match: (n, isSecurity) => isSecurity },
];

// 从官方 README 里读每一讲的中文标题，例如 **第23讲：Delegatecall**、**S01：重入攻击**
function readTitles() {
  const titles = {};
  const readme = path.join(BOOK_DIR, "README.md");
  if (!fs.existsSync(readme)) return titles;
  const text = fs.readFileSync(readme, "utf-8");
  // README 后面的「主题」部分也有「第1讲」，所以只取第一次出现的标题
  for (const m of text.matchAll(/\*\*第(\d+)讲[：:]\s*(.+?)\*\*/g)) titles[Number(m[1])] ??= m[2];
  for (const m of text.matchAll(/\*\*(S\d+)[：:]\s*(.+?)\*\*/g)) titles[m[1]] ??= m[2];
  return titles;
}

// 章节目录：[{ name: "入门篇", chapters: [{ id: "01_HelloWeb3", no: "1", title: "三行代码HelloWeb3" }] }]
export function listChapters() {
  if (!fs.existsSync(BOOK_DIR)) throw new Error("找不到教材，请把 WTF-Solidity 放到 knowledge/ 里");
  const titles = readTitles();
  const groups = GROUPS.map((g) => ({ name: g.name, chapters: [] }));

  const dirs = fs.readdirSync(BOOK_DIR).filter((d) => /^(\d{2}|S\d{2})_/.test(d)).sort();
  for (const id of dirs) {
    if (!fs.existsSync(path.join(BOOK_DIR, id, "readme.md"))) continue;
    const isSecurity = id.startsWith("S");
    const key = isSecurity ? id.slice(0, 3) : Number(id.slice(0, 2));
    const no = isSecurity ? key : String(key);
    const title = titles[key] || id.slice(id.indexOf("_") + 1);
    const i = GROUPS.findIndex((g) => g.match(isSecurity ? 0 : key, isSecurity));
    if (i >= 0) groups[i].chapters.push({ id, no, title });
  }
  return groups.filter((g) => g.chapters.length);
}

// 读取某一章的原文（Markdown）
export function readChapter(id) {
  // 只允许形如 23_Delegatecall 的名字，防止通过 ../ 读到别的文件
  if (!/^(\d{2}|S\d{2})_[\w-]+$/.test(id)) return null;
  const file = path.join(BOOK_DIR, id, "readme.md");
    if (!fs.existsSync(file)) return null;
  // 去掉开头 --- 包起来的元数据（title、tags 等），那是给教材网站用的，不是正文
  return fs.readFileSync(file, "utf-8").replace(/^---[\s\S]*?\n---\s*/, "");

}

// 找到某一章文件夹里的附带文件（插图等），返回完整路径；不安全或不存在就返回 null
export function chapterFile(id, relPath) {
  if (!/^(\d{2}|S\d{2})_[\w-]+$/.test(id)) return null;
  const chapterDir = path.resolve(BOOK_DIR, id);
  const file = path.resolve(chapterDir, relPath);
  // 防止 ../ 跳出这一章的文件夹
  if (!file.startsWith(chapterDir + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
