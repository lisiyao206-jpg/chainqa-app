// chapters.mjs —— 读取教材目录和章节原文，给「预备营」「训练营」页面用
//   训练营：开源教程 WTF-Solidity（knowledge/WTF-Solidity，不上传到仓库）
//   预备营：我们自己写的区块链基础教材（prep/，原创内容，跟代码一起提交）
//   联盟链实战（fisco/）、应用与前沿（frontier/）：同样是自编教材，格式和预备营一样

import fs from "node:fs";
import path from "node:path";

const BOOK_DIR = path.join("knowledge", "WTF-Solidity");
const PREP_DIR = "prep";
// 自编教材：编号前缀 → 文件夹和目录名。往文件夹里放 F01_xxx/readme.md 这样的章节，学习中心就会自动显示
const OWN_BOOKS = {
  prep: { prefix: "P", dir: PREP_DIR, name: "区块链基础" },
  fisco: { prefix: "F", dir: "fisco", name: "联盟链 FISCO BCOS 实战" },
  frontier: { prefix: "A", dir: "frontier", name: "区块链应用与前沿" },
};
// 章节编号：01_xxx（WTF 正课）、S01_xxx（合约安全）、P01_xxx（预备营）、F01_xxx（联盟链实战）、A01_xxx（应用与前沿）
const ID_RE = /^(\d{2}|S\d{2}|[PFA]\d{2})_[\w-]+$/;
const dirOf = (id) => Object.values(OWN_BOOKS).find((b) => id.startsWith(b.prefix))?.dir || BOOK_DIR;

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

// 自编教材目录（预备营、联盟链实战、应用与前沿）：标题取每章 readme.md 第一行的「# 标题」
// 文件夹还没建或者是空的，就返回空数组，页面上显示「内容建设中」
function listOwn(book) {
  const { prefix, dir, name } = OWN_BOOKS[book];
  if (!fs.existsSync(dir)) return [];
  const chapters = fs.readdirSync(dir).filter((d) => new RegExp(`^${prefix}\\d{2}_`).test(d)).sort()
    .filter((id) => fs.existsSync(path.join(dir, id, "readme.md")))
    .map((id) => {
      const first = fs.readFileSync(path.join(dir, id, "readme.md"), "utf-8").match(/^#\s+(.+)$/m);
      return { id, no: id.slice(0, 3), title: first ? first[1].trim() : id.slice(4) };
    });
  return chapters.length ? [{ name, chapters }] : [];
}

// 章节目录：[{ name: "入门篇", chapters: [{ id: "01_HelloWeb3", no: "1", title: "三行代码HelloWeb3" }] }]
// book = "prep" / "fisco" / "frontier" 时返回对应自编教材的目录
export function listChapters(book = "") {
  if (OWN_BOOKS[book]) return listOwn(book);
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
  if (!ID_RE.test(id)) return null;
  const file = path.join(dirOf(id), id, "readme.md");
  if (!fs.existsSync(file)) return null;
  // 去掉开头 --- 包起来的元数据（title、tags 等），那是给教材网站用的，不是正文
  const text = fs.readFileSync(file, "utf-8").replace(/^---[\s\S]*?\n---\s*/, "");
  return dirOf(id) === BOOK_DIR ? tidyWtf(text) : noteRefs(text);
}

// 自编教材末尾的「参考资料」是出处链接（ethereum.org、FISCO BCOS 官方文档等），服务器在国外，
// 国内有时打不开或很慢。在标题下面加一句说明，免得读者以为是网站坏了
function noteRefs(text) {
  return text.replace(
    /^## 参考资料\s*$/m,
    "## 参考资料\n\n> 以下是本章内容的出处，方便核对原文。蓝色的链接国内可以打开；灰色的网址所在网站国内无法访问，只作为出处保留，不影响本章的学习。\n",
  );
}

// WTF 教材每一章开头都有一排推特、Discord、谷歌表单等链接，国内打不开，点了只会「网络超时」。
// 把这几行去掉，换成一句不带链接的出处说明（开源教程要注明出处）
function tidyWtf(text) {
  return text
    .replace(/^推特[:：].*\n?/m, "")
    .replace(/^社区[:：].*\n?/m, "")
    .replace(/^所有代码和教程开源在 ?github.*$/m, "> 本章来自开源教程 WTF-Solidity（作者 0xAA），原文地址：`github.com/AmazingAng/WTF-Solidity`");
}

// 找到某一章文件夹里的附带文件（插图等），返回完整路径；不安全或不存在就返回 null
export function chapterFile(id, relPath) {
  if (!ID_RE.test(id)) return null;
  const chapterDir = path.resolve(dirOf(id), id);
  const file = path.resolve(chapterDir, relPath);
  // 防止 ../ 跳出这一章的文件夹
  if (!file.startsWith(chapterDir + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
