<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { levels } from '../data/levels'
import type { Role, Mistake, Source } from '../types'

// 后台用到的几种数据形状（只在这个页面用，所以写在这里）
interface AdminUser {
  userId: number
  account: string
  nickname: string
  role: Role
  status: 'active' | 'disabled' | string
  registerTime?: string | null
  lastLogin?: string | null
  loginCount?: number
  noteCount?: number
  mistakeCount?: number
  clearedCount?: number
}
interface LoginRecord {
  id: number
  time: string
  account: string
  nickname: string
}
interface UserDetail extends AdminUser {
  progress: { levelId: number; star: number }[]
  mistakes: Mistake[]
}
interface UserForm {
  mode: 'create' | 'edit'
  userId?: number
  account: string
  pwd: string
  nickname: string
  role: Role
}
interface QaLog {
  id: number
  time: string
  user?: { nickname: string } | null
  question: string
  answer?: string | null
  error?: string | null
  refused?: boolean
  rating?: 'up' | 'down' | null
  sources: Source[]
}
interface Feedback {
  id: number
  user: { nickname: string; account: string }
  type: string
  rating?: 'up' | 'down' | null
  time: string
  status: 'pending' | 'replied' | string
  question?: string | null
  content?: string | null
  reply?: string | null
}

const userStore = useUserStore()

// 当前标签页：'users' 用户管理 / 'logins' 登录记录 / 'qa' 问答日志 / 'feedback' 反馈处理
const tab = ref('users')
const users = ref<AdminUser[]>([])
const logins = ref<LoginRecord[]>([])
const keyword = ref('')
const error = ref('')
// 右侧详情面板里显示的用户，没打开时为 null
const detail = ref<UserDetail | null>(null)

// 把「2026-10-15T16:20:00」显示成「10-15 16:20」
function fmt(t?: string | null) {
  return t ? t.slice(5, 16).replace('T', ' ') : '—'
}
// 详情面板里某一关的星数：通关了显示 ★★★，没通关显示「未通关」
function starsOf(levelId: number) {
  const star = detail.value!.progress.find((p) => p.levelId === levelId)?.star
  return star ? '★'.repeat(star) : '未通关'
}

// 读取用户列表；keyword 不为空时按账号或昵称搜索
async function loadUsers() {
  error.value = ''
  try {
    users.value = await userStore.api('/api/admin/users?q=' + encodeURIComponent(keyword.value))
  } catch (err) {
    error.value = (err as Error).message
  }
}

async function loadLogins() {
  error.value = ''
  try {
    logins.value = await userStore.api('/api/admin/logins')
  } catch (err) {
    error.value = (err as Error).message
  }
}

function switchTab(name: 'users' | 'logins' | 'qa' | 'feedback') {
  tab.value = name
  ;({ users: loadUsers, logins: loadLogins, qa: loadQa, feedback: loadFeedback })[name]()
}

// ===== 新增 / 编辑用户 =====
// form 为 null 时不显示表单；mode = 'create' 新增 / 'edit' 编辑
const form = ref<UserForm | null>(null)
function openCreate() {
  form.value = { mode: 'create', account: '', pwd: '', nickname: '', role: 'user' }
}
function openEdit(u: AdminUser) {
  form.value = { mode: 'edit', userId: u.userId, account: u.account, nickname: u.nickname, role: u.role, pwd: '' }
}
async function saveForm() {
  const f = form.value!
  try {
    if (f.mode === 'create') {
      await userStore.api('/api/admin/users', { account: f.account, pwd: f.pwd, nickname: f.nickname, role: f.role })
    } else {
      // 密码不填就不改
      await userStore.api(`/api/admin/users/${f.userId}`, { nickname: f.nickname, role: f.role, pwd: f.pwd || undefined }, 'PUT')
    }
    form.value = null
    loadUsers()
  } catch (err) {
    alert((err as Error).message)
  }
}

// ===== 问答日志 =====
const qa = ref<QaLog[]>([])
const qaKeyword = ref('')
const refusedOnly = ref(false) // 只看「拒答」的：拒答多的问题，说明知识库该补资料了
const openQa = ref<number | null>(null)       // 展开看完整回答的那一条
async function loadQa() {
  error.value = ''
  try {
    qa.value = await userStore.api(`/api/admin/qa?q=${encodeURIComponent(qaKeyword.value)}&refused=${refusedOnly.value ? 1 : 0}`)
  } catch (err) {
    error.value = (err as Error).message
  }
}

// ===== 反馈处理 =====
const feedbacks = ref<Feedback[]>([])
const fbStatus = ref('')    // '' 全部 / pending 待处理 / replied 已回复
const replies = ref<Record<number, string>>({})     // 每条反馈正在写的回复：{ 反馈id: 文字 }
async function loadFeedback() {
  error.value = ''
  try {
    feedbacks.value = await userStore.api('/api/admin/feedback?status=' + fbStatus.value)
  } catch (err) {
    error.value = (err as Error).message
  }
}
async function reply(f: Feedback) {
  try {
    await userStore.api(`/api/admin/feedback/${f.id}`, { reply: replies.value[f.id] }, 'PUT')
    replies.value[f.id] = ''
    loadFeedback()
  } catch (err) {
    alert((err as Error).message)
  }
}
async function removeFeedback(f: Feedback) {
  if (!confirm('删除这条反馈？')) return
  await userStore.api(`/api/admin/feedback/${f.id}`, null, 'DELETE')
  loadFeedback()
}

// 打开某个用户的详情：通关情况 + 错题
async function openDetail(u: AdminUser) {
  detail.value = await userStore.api(`/api/admin/users/${u.userId}`)
}

// 禁用 ↔ 恢复
async function toggleStatus(u: AdminUser) {
  const next = u.status === 'active' ? 'disabled' : 'active'
  if (next === 'disabled' && !confirm(`禁用「${u.nickname}」后，他会被立刻踢下线，也无法再登录。确定吗？`)) return
  try {
    await userStore.api(`/api/admin/users/${u.userId}`, { status: next }, 'PUT')
    u.status = next
  } catch (err) {
    alert((err as Error).message)
  }
}

// 删除账号：他的笔记、错题、进度、登录记录会一起被删掉（数据库的级联删除）
async function removeUser(u: AdminUser) {
  if (!confirm(`删除「${u.nickname}」后，他的笔记、错题、进度会全部清空，无法恢复。确定吗？`)) return
  try {
    await userStore.api(`/api/admin/users/${u.userId}`, null, 'DELETE')
    users.value = users.value.filter((x) => x.userId !== u.userId)
    if (detail.value?.userId === u.userId) detail.value = null
  } catch (err) {
    alert((err as Error).message)
  }
}

onMounted(loadUsers)
</script>

<template>
  <div class="admin">
    <!-- 标签页 -->
    <div class="tabs">
      <button :class="{ active: tab === 'users' }" @click="switchTab('users')">👥 用户管理</button>
      <button :class="{ active: tab === 'logins' }" @click="switchTab('logins')">🕒 登录记录</button>
      <button :class="{ active: tab === 'qa' }" @click="switchTab('qa')">🤖 问答日志</button>
      <button :class="{ active: tab === 'feedback' }" @click="switchTab('feedback')">💬 反馈处理</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- ===== 用户管理 ===== -->
    <template v-if="tab === 'users'">
      <form class="search" @submit.prevent="loadUsers">
        <input v-model="keyword" placeholder="按账号或昵称搜索" />
        <button>搜索</button>
        <button type="button" class="ghost" @click="openCreate">＋ 新增用户</button>
        <span class="total">共 {{ users.length }} 人</span>
      </form>

      <!-- 新增 / 编辑用户 -->
      <form v-if="form" class="user-form" @submit.prevent="saveForm">
        <b>{{ form.mode === 'create' ? '新增用户' : `编辑「${form.account}」` }}</b>
        <input v-if="form.mode === 'create'" v-model="form.account" placeholder="账号（3~20 位字母、数字、下划线）" />
        <input v-model="form.nickname" maxlength="12" placeholder="昵称" />
        <input v-model="form.pwd" type="password" :placeholder="form.mode === 'create' ? '密码（至少 6 位）' : '重置密码（不填就不改）'" />
        <select v-model="form.role" :disabled="form.userId === userStore.user!.userId">
          <option value="user">审计员</option>
          <option value="admin">管理员</option>
        </select>
        <button>保存</button>
        <button type="button" class="ghost" @click="form = null">取消</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>账号</th><th>昵称</th><th>注册时间</th><th>最近登录</th>
            <th>登录次数</th><th>笔记</th><th>错题</th><th>通关</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.userId" :class="{ disabled: u.status === 'disabled' }">
            <td>
              {{ u.account }}
              <span v-if="u.role === 'admin'" class="tag admin">管理员</span>
            </td>
            <td>{{ u.nickname }}</td>
            <td>{{ fmt(u.registerTime) }}</td>
            <td>{{ fmt(u.lastLogin) }}</td>
            <td>{{ u.loginCount }}</td>
            <td>{{ u.noteCount }}</td>
            <td>{{ u.mistakeCount }}</td>
            <td>{{ u.clearedCount }} / {{ levels.length }}</td>
            <td>
              <span :class="['tag', u.status]">{{ u.status === 'active' ? '正常' : '已禁用' }}</span>
            </td>
            <td class="ops">
              <button @click="openDetail(u)">详情</button>
              <button @click="openEdit(u)">编辑</button>
              <!-- 不能对自己操作，所以自己那一行不显示这两个按钮 -->
              <template v-if="u.userId !== userStore.user!.userId">
                <button @click="toggleStatus(u)">{{ u.status === 'active' ? '禁用' : '恢复' }}</button>
                <button class="danger" @click="removeUser(u)">删除</button>
              </template>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="10" class="empty">没有找到用户</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- ===== 登录记录 ===== -->
    <template v-else-if="tab === 'logins'">
      <table>
        <thead>
          <tr><th>时间</th><th>账号</th><th>昵称</th></tr>
        </thead>
        <tbody>
          <tr v-for="l in logins" :key="l.id">
            <td>{{ fmt(l.time) }}</td>
            <td>{{ l.account }}</td>
            <td>{{ l.nickname }}</td>
          </tr>
          <tr v-if="!logins.length">
            <td colspan="3" class="empty">还没有登录记录</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- ===== 问答日志 ===== -->
    <template v-else-if="tab === 'qa'">
      <form class="search" @submit.prevent="loadQa">
        <input v-model="qaKeyword" placeholder="搜索问题或回答" />
        <button>搜索</button>
        <label class="check"><input v-model="refusedOnly" type="checkbox" @change="loadQa" /> 只看拒答</label>
        <span class="total">最近 {{ qa.length }} 条</span>
      </form>
      <table>
        <thead>
          <tr><th>时间</th><th>提问人</th><th>问题</th><th>结果</th><th>用户评价</th><th>引用资料</th></tr>
        </thead>
        <tbody>
          <template v-for="l in qa" :key="l.id">
            <tr class="clickable" @click="openQa = openQa === l.id ? null : l.id">
              <td>{{ fmt(l.time) }}</td>
              <td>{{ l.user ? l.user.nickname : '未登录' }}</td>
              <td class="wrap">{{ l.question }}</td>
              <td>
                <span v-if="l.error?.startsWith('已拦截')" class="tag admin">🛡 拦截</span>
                <span v-else-if="l.error" class="tag disabled">出错</span>
                <span v-else-if="l.refused" class="tag todo">拒答</span>
                <span v-else class="tag active">已回答</span>
              </td>
              <td>{{ l.rating === 'up' ? '👍' : l.rating === 'down' ? '👎' : '—' }}</td>
              <td>{{ l.sources.length }}</td>
            </tr>
            <!-- 展开：完整回答 + 引用了哪些资料 -->
            <tr v-if="openQa === l.id" class="expand">
              <td colspan="6">
                <div class="answer">{{ l.error || l.answer || '（没有生成回答）' }}</div>
                <div v-for="(s, i) in l.sources" :key="i" class="src">[{{ i + 1 }}] {{ s.file }} › {{ s.heading }}（相似度 {{ s.score }}）</div>
              </td>
            </tr>
          </template>
          <tr v-if="!qa.length"><td colspan="6" class="empty">还没有问答记录</td></tr>
        </tbody>
      </table>
    </template>

    <!-- ===== 反馈处理 ===== -->
    <template v-else>
      <div class="search">
        <select v-model="fbStatus" @change="loadFeedback">
          <option value="">全部</option>
          <option value="pending">待处理</option>
          <option value="replied">已回复</option>
        </select>
        <span class="total">共 {{ feedbacks.length }} 条</span>
      </div>
      <div v-if="!feedbacks.length" class="empty">没有反馈</div>
      <div v-for="f in feedbacks" :key="f.id" class="fb">
        <div class="fb-meta">
          <b>{{ f.user.nickname }}</b><small>（{{ f.user.account }}）</small>
          <span>{{ f.type === 'answer' ? (f.rating === 'up' ? '👍 觉得回答有帮助' : '👎 觉得回答没帮助') : '💬 留言' }}</span>
          <span>{{ fmt(f.time) }}</span>
          <span :class="['tag', f.status === 'replied' ? 'active' : 'todo']">{{ f.status === 'replied' ? '已回复' : '待处理' }}</span>
          <button class="del" @click="removeFeedback(f)">删除</button>
        </div>
        <div v-if="f.question" class="fb-q">问题：{{ f.question }}</div>
        <div v-if="f.content" class="fb-content">{{ f.content }}</div>
        <div v-if="f.reply" class="fb-reply">已回复：{{ f.reply }}</div>
        <form class="fb-form" @submit.prevent="reply(f)">
          <input v-model="replies[f.id]" maxlength="1000" :placeholder="f.reply ? '再次回复（会覆盖上一条）' : '写回复，用户在「意见反馈」里能看到'" />
          <button :disabled="!replies[f.id]?.trim()">回复</button>
        </form>
      </div>
    </template>

    <!-- ===== 右侧详情面板 ===== -->
    <aside v-if="detail" class="detail">
      <div class="detail-head">
        <b>{{ detail.nickname }}（{{ detail.account }}）</b>
        <button @click="detail = null">✕</button>
      </div>

      <h4>漏洞猎人进度</h4>
      <ul>
        <li v-for="l in levels" :key="l.id">
          {{ l.title }}
          <span class="stars">{{ starsOf(l.id) }}</span>
        </li>
      </ul>

      <h4>错题（{{ detail.mistakes.length }}）</h4>
      <ul>
        <li v-for="(m, i) in detail.mistakes" :key="i">
          <span :class="['tag', m.status]">{{ m.status === 'todo' ? '待温习' : '已掌握' }}</span>
          {{ m.question.slice(0, 40) }}{{ m.question.length > 40 ? '…' : '' }}
        </li>
        <li v-if="!detail.mistakes.length" class="empty">没有错题</li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
/* 赛博朋克深色版：和全站一样用 style.css 里的变量。
   以前是白底，但全站文字是浅色的，白底上就看不清了，所以面板统一改成深色 */
.admin { position: relative; color: var(--text); }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button {
  padding: 8px 18px; border: 1px solid var(--line-strong); border-radius: 999px;
  background: rgba(255, 255, 255, 0.04); color: var(--text-dim); cursor: pointer; font-size: 14px;
}
.tabs button:hover { color: #fff; border-color: var(--accent); }
.tabs button.active { background: linear-gradient(90deg, var(--accent-strong), var(--accent)); color: #05020f; border-color: transparent; font-weight: 600; }
.search { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.search input {
  width: 240px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius);
  background: rgba(6, 4, 20, 0.7); color: var(--text); outline: none;
}
.search input:focus { border-color: var(--accent); }
.search input::placeholder { color: var(--text-faint); }
.search button { padding: 8px 16px; border: none; border-radius: var(--radius); background: var(--accent); color: #05020f; font-weight: 600; cursor: pointer; }
.total { margin-left: auto; color: var(--text-dim); font-size: 13px; }

/* 表格：放在深色毛玻璃上 */
table {
  width: 100%; border-collapse: collapse; font-size: 14px;
  background: var(--glass-strong); backdrop-filter: var(--blur); border: 1px solid var(--line);
}
th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; color: var(--text); }
th { background: rgba(0, 240, 255, 0.08); color: var(--accent); font-weight: normal; letter-spacing: 1px; }
tbody tr:hover td { background: rgba(0, 240, 255, 0.05); }
tr.disabled td { color: var(--text-faint); }
.empty { text-align: center; color: var(--text-faint); }
.ops button {
  margin-right: 6px; padding: 4px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius);
  background: transparent; color: var(--text); cursor: pointer; font-size: 13px;
}
.ops button:hover { border-color: var(--accent); color: var(--accent); }
.ops .danger:hover { border-color: var(--danger); color: var(--danger); }

.search .ghost, .user-form .ghost { background: transparent; color: var(--accent); border: 1px solid var(--line-strong); }
.check { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-dim); cursor: pointer; }
select {
  padding: 8px 10px; font-size: 13px; color: var(--text); background: rgba(6, 4, 20, 0.85);
  border: 1px solid var(--line-strong); border-radius: var(--radius); outline: none;
}
.user-form {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; padding: 12px;
  border: 1px dashed var(--line-strong); background: rgba(0, 240, 255, 0.04);
}
.user-form b { color: var(--accent); font-weight: normal; margin-right: 6px; }
.user-form input { padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: rgba(6, 4, 20, 0.7); color: var(--text); outline: none; }
.user-form button { padding: 8px 16px; border: none; border-radius: var(--radius); background: var(--accent); color: #05020f; font-weight: 600; cursor: pointer; }
td.wrap { white-space: normal; max-width: 420px; }
tr.clickable { cursor: pointer; }
tr.expand td { white-space: normal; background: rgba(0, 240, 255, 0.04); }
.answer { white-space: pre-wrap; line-height: 1.7; color: var(--text); max-height: 260px; overflow-y: auto; }
.src { margin-top: 4px; font-size: 12px; color: var(--text-dim); }
.fb { padding: 14px 16px; margin-bottom: 10px; background: var(--glass-strong); border: 1px solid var(--line); }
.fb-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 13px; color: var(--text-dim); }
.fb-meta b { color: #fff; }
.fb-meta .del { margin-left: auto; border: none; background: none; color: var(--text-faint); cursor: pointer; }
.fb-meta .del:hover { color: var(--danger); }
.fb-q { margin-top: 6px; font-size: 13px; color: var(--text-dim); }
.fb-content { margin-top: 6px; white-space: pre-wrap; line-height: 1.7; }
.fb-reply { margin-top: 6px; padding: 6px 10px; font-size: 13px; background: rgba(142, 230, 196, 0.08); border-left: 3px solid var(--ok); }
.fb-form { display: flex; gap: 8px; margin-top: 10px; }
.fb-form input { flex: 1; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: rgba(6, 4, 20, 0.7); color: var(--text); outline: none; }
.fb-form button { padding: 8px 16px; border: none; border-radius: var(--radius); background: var(--accent); color: #05020f; font-weight: 600; cursor: pointer; }
.fb-form button:disabled { opacity: 0.4; cursor: default; }

/* 小标签：管理员 / 正常 / 已禁用 / 待温习 / 已掌握 */
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.tag.admin { background: rgba(0, 240, 255, 0.15); color: var(--accent); margin-left: 4px; }
.tag.active, .tag.mastered { background: rgba(142, 230, 196, 0.15); color: var(--ok); }
.tag.disabled, .tag.todo { background: rgba(255, 107, 129, 0.15); color: var(--danger); }

/* 右侧详情面板 */
.detail {
  position: fixed; top: 56px; right: 0; bottom: 0; width: 340px; z-index: 20;
  padding: 20px; overflow-y: auto; color: var(--text);
  background: var(--glass-strong); backdrop-filter: var(--blur);
  border-left: 1px solid var(--line-strong);
  box-shadow: -8px 0 30px rgba(0, 240, 255, 0.12);
}
.detail-head { display: flex; justify-content: space-between; align-items: center; color: #fff; }
.detail-head button { border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text); }
.detail-head button:hover { color: var(--accent); }
.detail h4 { margin: 20px 0 8px; color: var(--accent); letter-spacing: 1px; }
.detail ul { list-style: none; padding: 0; margin: 0; font-size: 14px; }
.detail li { padding: 6px 0; border-bottom: 1px dashed var(--line); color: var(--text); }
.stars { float: right; color: var(--gold); }
.error { color: var(--danger); }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .tabs { overflow-x: auto; scrollbar-width: none; }
  .tabs button { flex-shrink: 0; }
  /* 表格太宽：表格自己左右滑动，不撑破整页 */
  table { display: block; overflow-x: auto; }
  td.wrap { max-width: 260px; }
  .search { flex-wrap: wrap; }
  .search input { width: 100%; }
  /* 右侧详情抽屉：手机上铺满整个宽度 */
  .detail { width: 100%; }
}
</style>
