# 链知答 LIANZHIDA

> 区块链安全 AI 教育平台：学生从零学区块链，在**真实的国产联盟链 FISCO BCOS** 上亲手写合约、抵御攻击；AI 白帽导师只依据教材回答、句句标出处；老师建班布置任务，系统自动统计学情。

**在线访问**：<http://43.136.20.150>（腾讯云服务器，注册即可使用，注册时可选择学生或老师身份）

---

## 亮点

| | 亮点 | 说明 |
|---|---|---|
| ⛓ | **真实上链，不是模拟** | 作者在腾讯云上用官方 `build_chain.sh` 搭建了 4 节点 FISCO BCOS v2.11.0 联盟链，通过 WeBASE-Front 接入。链上实验场和合约练习场里的每次部署、每笔交易都有真实的区块号和交易哈希 |
| 🛡 | **链上实验场：在链上建安全墙** | 学生修改有漏洞的合约 → 部署上链 → 系统派攻击者发起多种真实攻击交易，同时检验正常业务不受影响；没挡住时写清「挡住了几种、还差哪一项、去哪里找问题」 |
| 🧪 | **合约练习场：替代国内打不开的 Remix** | 浏览器里写合约、编译、部署、调用函数。支持 Solidity 0.8（编译到 byzantium 指令集以兼容 FISCO BCOS v2），可 import OpenZeppelin 5.0.2；教材 73 个带合约的章节中 64 个可一键载入运行 |
| 🤖 | **AI 不乱答** | 白帽导师基于 RAG：只依据教材回答、每句标出处、相似度不够就拒答。对照评测：准确度 97 vs 85，超纲题拒答率 100% vs 30%（见 `eval/`） |
| 📚 | **教材可核对** | 五条学习路线、84 章；自编章节的结论都附官方出处（最高人民法院、中国政府网、FISCO BCOS 官方文档等），每章末尾有纠错入口，后台可集中处理 |
| 🧑‍🏫 | **教与学闭环** | 老师建班、布置章节和关卡任务、分享资料、发起视频会议；系统按 16 个知识点自动生成每个学生的学习报告和全班学情 |

---

## 功能一览

| 模块 | 功能 |
|---|---|
| **登录注册** | 系统分配 6 位数字账号；注册时选择学生 / 老师身份，可选填手机号；支持账号或手机号 + 密码登录 |
| **大厅** | 3D 动态背景（三种可切换），八个入口；手机上自动改为两列布局 |
| **学习中心** | 五条路线：① 区块链基础（7 章，自编）② 联盟链 FISCO BCOS 实战（自编）③ 智能合约开发 ④ 智能合约安全（③④ 来自开源教程 WTF-Solidity）⑤ 区块链应用与前沿（自编：电子存证、供应链金融）。每章标注知识点；选中文字问 AI / 存笔记；AI 生成本章思维导图；读完触发「防御战」小测；带合约代码的章节可一键在练习场打开 |
| **白帽导师** | RAG 问答，流式输出，引用可展开核对原文；语音提问 / 朗读 |
| **实战任务** | ① **漏洞猎人**：10 关、10 只 3D 漏洞怪兽（权限缺失、整数溢出、重入、tx.origin、坏随机数、delegatecall、未检查返回值、拒绝服务、时间戳依赖、签名重放），锁定弱点 → 选对修法，星级与勋章 ② **链上实验场** ③ **合约练习场** |
| **AI 审计** | 审计 Agent 自主调用规则扫描、SWC 漏洞库、教材检索，过程可视化；截图识别代码；审计记录按代码指纹去重 |
| **我的班级** | 老师：建班（6 位班级码）、布置任务、批阅、上传资料、视频会议链接、学情统计；学生：加入班级、查看任务和完成情况 |
| **学习报告** | 按知识点统计掌握度（教材防御战、实战关卡、链上实验、错题），推荐下一步学什么，AI 生成学习建议 |
| **案件档案** | 三栏：情报收藏（点赞 / 收藏的帖子和视频）、我的笔记（可引用收藏内容、发布到广场或分享给好友）、错题本（重做模式） |
| **情报站** | 学术论坛（按话题分类，可匿名发帖和评论，发言不计入学习统计）、私聊与讨论组（传文件、粘贴截图）、好友 |
| **管理后台** | 用户管理、登录记录、问答日志（可筛选拒答）、反馈处理（含教材纠错） |
| **MCP 服务** | 把审计工具开放给 Claude、Cursor 等 AI 编程助手（见 `docs/MCP使用说明.md`） |

> 📄 详细设计见 [`docs/技术文档.md`](docs/技术文档.md)；RAG 效果评测见 [`docs/评测报告.md`](docs/评测报告.md) 和 `eval/`。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3（`<script setup lang="ts">`）、TypeScript、Vue Router（懒加载）、Pinia、Vite |
| 后端 | Node.js 原生 `http` 模块（无 Web 框架） |
| 数据库 | SQLite（Node 内置 `node:sqlite`），28 张表 |
| AI | 智谱 AI：`glm-4-flash`（问答、审计 Agent、出题、思维导图、学习建议）、`glm-4v-flash`（截图识别代码）、`embedding-3`（向量化） |
| 区块链 | FISCO BCOS v2.11.0（4 节点）、WeBASE-Front v1.5.5、Solidity 编译器 solc 0.6.10 / 0.8.38、OpenZeppelin Contracts 5.0.2 |
| 部署 | 腾讯云轻量服务器（Ubuntu 22.04，2 核 4G）、systemd、nginx 反向代理 |
| 其他 | three.js（3D）、Web Speech（语音）、marked、markmap、MCP 协议 |

---

## 快速开始（本地运行）

### 1. 环境要求

- **Node.js 22.5 及以上**（用到内置 `node:sqlite`）
- 智谱 AI 的 API Key：<https://open.bigmodel.cn>
- （可选）FISCO BCOS + WeBASE-Front：不配置也能运行，只是链上实验场和合约练习场不可用

### 2. 安装依赖

```bash
npm install            # 后端：solc 编译器、OpenZeppelin（见 package.json）
cd web && npm install  # 前端
```

### 3. 准备教材

```bash
git clone https://github.com/AmazingAng/WTF-Solidity.git knowledge/WTF-Solidity
```

自编教材（`prep/`、`fisco/`、`frontier/`）已在仓库中。`knowledge/` 不上传仓库（开源语料，体积大）。

### 4. 配置环境

复制 `.env.example` 为 `.env`，按注释填写（`.env` 已加入 `.gitignore`）：

| 变量 | 说明 |
|---|---|
| `ZHIPU_API_KEY` | 必填，智谱 AI 的 API Key |
| `ADMIN_ACCOUNT` | 必填，先注册一个账号，把 6 位账号填在这里，重启后即为管理员 |
| `WEBASE_URL` | 可选，WeBASE-Front 地址，如 `http://127.0.0.1:5002/WeBASE-Front`；不填则关闭链上功能 |
| `PORT`、`SMS_MODE` | 可选，见 `.env.example` |

### 5. 构建知识库（只需一次）

```bash
node rag.mjs build
```

把教材切片并向量化，生成 `vectors.json`；只处理新增或变更的片段。

### 6. 启动

```bash
# 开发：两个终端
node server.mjs              # 后端，默认 3000 端口
cd web && npm run dev        # 前端，http://localhost:5173

# 生产：前端打包后由后端直接提供
cd web && npm run build && cd .. && node server.mjs
```

### 7. 搭建联盟链（可选）

服务器上的部署步骤（搭链、WeBASE、systemd、nginx）见 [`docs/技术文档.md`](docs/技术文档.md) 的「部署」一节；搭链过程也写成了教材第 02 路线的章节。

---

## 项目结构

```
chainqa-app/
├── server.mjs        后端入口：按「请求方式 + 网址」分发请求
├── db.mjs            建库建表 + 表结构迁移
├── auth.mjs          注册、登录、token、个人资料、改密码
├── rag.mjs           RAG：切片、向量化、检索、流式回答
├── chapters.mjs      五条路线的教材目录、章节原文、插图
├── knowledge.mjs     知识点体系、章节 / 关卡 → 知识点映射、学习路线
├── chain.mjs         FISCO BCOS 接入（WeBASE-Front HTTP 接口）：部署、交易、查询
├── solidity.mjs      现场编译：按 pragma 选 solc 0.6.10 / 0.8.38，处理 import
├── playground.mjs    合约练习场：编译、部署、调用、参数检查、限流
├── lab.mjs           链上实验场：编译 → 逐项部署 → 攻击 → 判定，SSE 实时推送
├── chainlab/         实验场题目（漏洞合约、攻击步骤、判定规则、提示、参考答案）
├── classes.mjs       班级、任务、批阅、资料、视频会议
├── report.mjs        学习报告、班级学情、AI 学习建议
├── social.mjs        情报站：好友、聊天、学术论坛（匿名、话题）、收藏
├── feedback.mjs      问答日志、意见反馈、教材纠错
├── agent.mjs         AI 审计 Agent（函数调用）
├── scanner.mjs       规则扫描器 + SWC 漏洞库
├── quiz.mjs          防御战 AI 出题
├── mindmap.mjs       AI 思维导图（文件缓存）
├── safety.mjs        AI 安全：注入检测、内容审核、私钥 / 助记词保护
├── data.mjs / admin.mjs / audits.mjs / phone.mjs / vision.mjs / mcp-server.mjs
├── prep/ fisco/ frontier/   自编教材（每章 readme.md + 配套 .sol 合约）
├── docs/             技术文档、系统架构、评测报告、测试记录、MCP 说明
├── eval/             RAG 效果评测
└── web/src/          前端：views/ 页面、components/ 组件、stores/ Pinia、data/ 关卡与导航数据
```

---

## 安全

- API Key 只在后端 `.env`，不进前端、不进仓库；数据库、上传文件也不进仓库
- 密码 scrypt 加盐哈希；所有 SQL 参数化；每次数据操作都校验 `user_id`；管理员权限在后端校验
- 读取教材和合约文件时检查路径，防止路径穿越；上传文件扩展名白名单
- 链上操作：同一用户同时只能有一个写操作，部署和交易每分钟限 20 次；只读查询单独限流
- AI 安全：提示词注入检测、内容审核、私钥 / 助记词防泄露
- 节点以 127.0.0.1 组网，WeBASE 与节点端口不在防火墙开放；外网只能访问 80 端口的网站

---

## 团队信息

**团队名称**：安全小队

| 成员 | 分工 |
|---|---|
| 李思瑶 | 项目构思与产品设计、前后端与 AI 功能开发、联盟链搭建与服务器部署、教材编写、界面设计、技术文档 |

---

## 原创性说明

本项目为原创作品，由李思瑶独立完成：产品与玩法设计、前后端代码、数据库设计、AI 功能（RAG 与拒答机制、审计 Agent、规则扫描器、AI 安全、MCP 服务、评测方案）、链上实验场与合约练习场、联盟链搭建与部署、自编教材（区块链基础 7 章、FISCO BCOS 时间戳、电子存证、供应链金融）及配套合约、10 个实战关卡的漏洞合约。

开发过程中使用了 AI 编程助手辅助编写代码与文档，并使用 AI 工具辅助生成部分图像素材（AI 导师 3D 形象、勋章图案），所有内容均经本人审核、修改与测试。

---

## 致谢与声明

1. 教材：开源项目 [WTF-Solidity](https://github.com/AmazingAng/WTF-Solidity)，版权归原作者所有，本项目仅作为知识库与学习内容来源。
2. 自编教材的参考资料：ethereum.org 中文文档（MIT 许可）、[FISCO BCOS 官方文档](https://fisco-bcos-documentation.readthedocs.io/zh-cn/latest/)、Solidity 官方文档、最高人民法院与中国政府网公开文件，每章末尾列出出处。
3. 区块链：[FISCO BCOS](https://github.com/FISCO-BCOS/FISCO-BCOS)、[WeBASE](https://github.com/WeBankBlockchain/WeBASE)（Apache-2.0）；[OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)（MIT）；[solc-js](https://github.com/ethereum/solc-js)（MIT）。
4. AI 能力：[智谱 AI 开放平台](https://open.bigmodel.cn)。
5. 字体：站酷庆科黄油体、Orbitron（均为 SIL OFL 1.1）。
6. AI 导师 3D 形象由腾讯混元 3D 生成；实战任务 3D 怪兽模型来自 Quaternius（CC0）。
