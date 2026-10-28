# 链上安全局 · 链知答

> 以 AI 为核心的智能合约安全审计学习与实践平台：读教材问 AI 导师、和漏洞怪兽对战、用 AI Agent 审计自己的合约——学、练、用一条龙。

<!-- 截图：放 2~3 张，大厅 / 训练营 + AI 问答 / 漏洞猎人 -->
<!-- ![大厅](docs/screenshots/lobby.png) -->

---

## ✨ 功能一览

| 模块 | 功能 |
|---|---|
| 🔑 **登录注册** | 官方发号（系统分配 6 位数字账号）；账号 + 密码 / 手机号 + 密码 / 手机号 + 验证码三种登录方式 |
| 🏛 **大厅** | 3D 动态背景（三种可切换）、七个发光入口与「学习路线」引导、个人档案（头像、勋章墙、学习统计、绑定手机号、意见反馈） |
| 🌱 **预备营** | 新手从这里开始：7 章区块链基础导读（区块与哈希、私钥与签名、交易与共识、联盟链 FISCO BCOS、智能合约），内容对照 ethereum.org 与 FISCO BCOS 官方文档核实 |
| 📖 **训练营** | 分组阅读教材；**选中文字一键问 AI 或存笔记**；**AI 生成本章思维导图**；读完一章触发**防御战**（AI 出题打小怪）；配套学习视频 |
| 🧑‍💻 **白帽导师** | 3D AI 导师形象；基于教材的 RAG 问答，**每句话带出处、查不到就拒答**；流式输出；语音提问 / 朗读 |
| 🎯 **实战任务** | **10 关**、10 只 3D 漏洞怪兽（权限缺失、整数溢出、重入、tx.origin、坏随机数、delegatecall、未检查返回值、拒绝服务、时间戳依赖、签名重放），两回合对战（锁定弱点 → 修补漏洞），倒计时、提示换星、怪兽反击、勋章；**AI 举一反三出变种题**（规则扫描器自动验题）；**亲手修复**模式：直接改代码，由后端校验 |
| 🔍 **AI 审计** | **审计 Agent** 自己规划步骤、调用规则扫描 / SWC 漏洞库 / 教材检索，过程可视化；**截图识别代码**；审计记录（同一合约不重复记录） |
| 📡 **情报站** | 好友、私聊群聊（传文件、粘贴截图）、好友圈、公共广场（图文 / 视频）、情报收集文件夹 |
| 🗂 **案件档案** | 笔记自动保存、一键发布讨论；错题本（重做模式，同一道题只记一次并记录错误次数） |
| 🛠 **管理后台** | 用户管理、登录记录、问答日志（可筛选拒答）、反馈处理 |
| 🔌 **MCP 服务** | 把审计工具开放给 Claude、Cursor 等 AI 编程助手（见 `docs/MCP使用说明.md`） |

> 📄 详细设计见 [`docs/技术文档.pdf`](docs/技术文档.pdf)；RAG 效果评测见 `eval/`（准确度 97 vs 85，超纲题拒答 100% vs 30%）。

---

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端 | **Vue 3**（`<script setup lang="ts">` 组合式 API）、**TypeScript**（严格模式）、**Vue Router**（路由懒加载）、**Pinia**、Vite |
| 后端 | **Node.js**（原生 `http` 模块，无框架） |
| 数据库 | **SQLite**（Node 内置 `node:sqlite`，无需安装数据库服务） |
| AI | 智谱 AI：`embedding-3`（文本向量化）+ `glm-4-flash`（流式生成） |
| 其他 | marked（Markdown 渲染）、markmap（思维导图）、Canvas（代码雨） |

---

## 🚀 快速开始

### 1. 环境要求

- **Node.js 22.5 及以上**（用到了内置的 `node:sqlite`）
- 一个智谱 AI 的 API Key：<https://open.bigmodel.cn>

### 2. 准备教材

把 [WTF-Solidity](https://github.com/AmazingAng/WTF-Solidity) 下载到 `knowledge/WTF-Solidity/`：

```bash
git clone https://github.com/AmazingAng/WTF-Solidity.git knowledge/WTF-Solidity
```

### 3. 配置密钥

复制 `.env.example` 为 `.env`，填入：

```ini
ZHIPU_API_KEY=你的智谱APIKey
ADMIN_ACCOUNT=你想设为管理员的账号
```

> `ADMIN_ACCOUNT` 对应的账号注册后会自动成为管理员（每次启动后端时也会检查一遍）。

### 4. 构建知识库（只需一次）

```bash
node rag.mjs build
```

把教材切成片段并向量化，生成 `vectors.json`。教材没变时再次运行会跳过，不重复花钱。

### 5. 启动（需要两个终端）

```bash
# 终端 ①：后端（项目根目录）
node server.mjs

# 终端 ②：前端
cd web
npm install
npm run dev
```

浏览器打开 <http://localhost:5173>，注册账号即可使用。

---

## 📁 项目结构

```
chainqa-app/
├── server.mjs        后端入口：按「请求方式 + 网址」分发请求
├── rag.mjs           RAG：构建知识库、检索、流式生成回答
├── chapters.mjs      教材目录、章节原文、插图
├── mindmap.mjs       AI 生成思维导图（带文件缓存）
├── db.mjs            建库建表 + 表结构迁移
├── auth.mjs          注册、登录、token 认证、个人资料、改密码
├── data.mjs          笔记 / 错题 / 关卡进度的增删改查
├── admin.mjs         管理后台的查询与操作
├── agent.mjs         AI 审计 Agent（函数调用 + 兜底流程）
├── scanner.mjs       规则扫描器 + SWC 漏洞库
├── variant.mjs       AI 变种出题、扫描器验题、预热题库、亲手修复校验
├── safety.mjs        AI 安全：注入检测、内容审核、私钥 / 助记词保护
├── phone.mjs         手机号绑定与验证码登录
├── audits.mjs        审计记录（代码指纹去重）
├── social.mjs        情报站：好友、聊天、广场、收藏
├── quiz.mjs          防御战 AI 出题
├── vision.mjs        截图识别代码
├── bilibili-search.mjs 学习视频搜索代理
├── mcp-server.mjs    MCP 服务
├── prep/             预备营 7 章（原创导读）
├── eval/             RAG 效果评测
└── web/src/
    ├── main.ts       创建应用，装上 Pinia 和路由
    ├── router.ts     路由表（懒加载）+ 路由守卫（未登录 → 登录页；非管理员 → 不能进后台）
    ├── types.ts      前后端共用的数据类型：用户、关卡、笔记、审计结果……
    ├── App.vue       页面框架、顶栏、AI 悬浮窗、转场
    ├── views/        页面：登录、大厅、预备营 / 训练营（同一阅读页）、白帽导师、案件档案、实战任务、AI 审计、情报站、管理后台
    ├── components/   组件：聊天面板、3D 导师 MentorBot、3D 怪兽、防御战、思维导图、勋章墙、视频面板、个人档案……
    ├── stores/       Pinia：user、ai、notes、mistakes、game、theme
    └── data/         10 个实战关卡数据
```

---

## 🔧 设计说明

### 组件化

- **页面与组件分离**：`views/` 里的每个页面对应一个路由；可复用的部分拆成 `components/`。例如 `ChatPanel` 同时用在右下角悬浮窗和白帽导师整页里。
- **组件通信**：弹窗类组件用 `props` 接收数据、`emit('close')` 通知父组件关闭。
- **数据与界面分离**：漏洞猎人的关卡写在 `data/levels.ts`，加新关卡不用改页面代码。
- **类型安全**：前端全量 TypeScript 严格模式，核心数据模型统一定义在 `src/types.ts`；`npm run typecheck` 做类型检查。
- **性能**：路由懒加载 + 第三方库拆包（three.js / 思维导图 / Vue 各自独立缓存），首屏 JS 从 494KB 降到约 60KB（gzip）。
- **响应式**：手机（≤760px）上导航可横向滑动、各页面自动改为单列布局。

### 状态管理（Pinia）

| Store | 管什么 | 解决的问题 |
|---|---|---|
| `user` | 当前用户、token、带 token 的请求工具 `api()` | 所有页面共享登录状态；路由守卫据此判断能否进入页面 |
| `ai` | AI 面板开关、待发送的问题 | 训练营「选中文字问 AI」时，训练营和聊天面板互不引用，靠 store 传话 |
| `notes` / `mistakes` / `game` | 笔记、错题、关卡进度 | 作为数据库数据在前端的副本：修改时先更新界面，再异步保存 |

页面只调用 store 的 `load / add / update` 等方法，不关心数据存在哪里。所以把存储从 localStorage 迁移到数据库时，页面几乎不用改。

### AI 集成：RAG（检索增强生成）

```
用户提问
  → embedding-3 把问题转成向量
  → 与教材 900 多个片段计算余弦相似度，取最相关的 4 段
  → 相似度都低于 0.35：直接拒答「知识库中未找到相关依据」
  → 把片段 + 问题 + 规则交给 glm-4-flash，要求只依据资料回答并标注 [1][2]
  → 通过 SSE 流式推送到前端，逐字显示，并附上引用原文
```

**怎么防止 AI 胡说：** ① 提示词限定只能依据资料回答；② 相似度阈值过滤不相关资料，资料不足时拒答；③ 回答带引用编号，用户可以点开核对原文。

**AI 的其他用法：** 根据章节原文生成思维导图（Markdown 大纲 → markmap 渲染），生成一次后缓存到文件，之后秒开。

### 数据库设计

| 表 | 说明 | 主键 |
|---|---|---|
| `users` | 账号、密码哈希、昵称、角色（user / admin）、状态（active / disabled） | `user_id` |
| `sessions` | 登录凭证 token、过期时间（7 天） | `token` |
| `login_logs` | 登录记录 | `log_id` |
| `notes` | 笔记，可关联教材章节 | `note_id` |
| `mistakes` | 错题、状态（待温习 / 已掌握）、来源（手动 / 漏洞猎人） | `mistake_id` |
| `game_progress` | 每关最好星数 | (`user_id`, `level_id`) 联合主键 |

- 除 `users` 外，每张表都以 `user_id` 外键关联用户（一对多），并设置 `ON DELETE CASCADE`：删除用户时，其数据一并清除。
- `game_progress` 用联合主键保证「一人一关一条记录」，保存成绩时用 `ON CONFLICT … DO UPDATE SET star = MAX(…)` 只保留最好成绩。

<!-- E-R 图：docs/er.png -->

### 安全

- **密钥只在后端**：API Key 放在 `.env`，不进前端代码，也不提交到 Git。
- **密码加盐哈希**：使用 scrypt，数据库只存 `盐:哈希`，看不到原密码；改密码必须验证旧密码。
- **防 SQL 注入**：所有 SQL 使用 `?` 参数占位符。
- **数据隔离**：每条数据操作都带 `WHERE user_id = ?`，即使篡改请求里的 id，也改不到别人的数据。
- **权限在后端校验**：管理员接口由后端检查角色，非管理员返回 403；前端隐藏入口只是为了体验。
- **防路径穿越**：读取教材文件和插图的接口会检查路径，不能用 `../` 读到其他文件。

### 用户体验

- AI 回答流式输出，首字约 2 秒出现，不用等整段生成完。
- 笔记输入防抖（停止输入 0.6 秒后才保存），减少请求次数。
- AI 悬浮窗用 `v-show`，切换页面时聊天记录不丢失。
- 登录状态保存在本地，刷新页面不掉线。

---

## 👥 团队信息

**团队名称**：安全小队

| 成员 | 分工 |
|---|---|
|李思瑶| 项目构思与产品设计、全部代码开发（前端、后端、AI 功能）、主题与背景设计、技术文档、图像设计 |

---

## 📚 致谢与声明

- 教材内容来自开源项目 [WTF-Solidity](https://github.com/AmazingAng/WTF-Solidity)，版权归原作者所有，本项目仅将其作为知识库数据来源。
- 预备营（`prep/`）为本团队编写的区块链基础导读，内容对照以下官方资料核实，每章末尾列出参考资料；这些资料也作为知识库数据来源放在 `knowledge/`（不上传仓库，获取方式见下）：
  - [ethereum.org 中文文档](https://ethereum.org/zh/developers/docs/)（MIT 许可）
  - [FISCO BCOS 官方文档](https://fisco-bcos-doc.readthedocs.io/zh-cn/latest/)，版权归 FISCO BCOS 开源社区所有
- AI 能力由 [智谱 AI](https://open.bigmodel.cn) 提供。
