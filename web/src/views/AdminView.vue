<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import { levels } from '../data/levels.js'

const userStore = useUserStore()

// 当前标签页：'users' 用户管理 / 'logins' 登录记录
const tab = ref('users')
const users = ref([])
const logins = ref([])
const keyword = ref('')
const error = ref('')
// 右侧详情面板里显示的用户，没打开时为 null
const detail = ref(null)

// 把「2026-10-15T16:20:00」显示成「10-15 16:20」
function fmt(t) {
  return t ? t.slice(5, 16).replace('T', ' ') : '—'
}

// 详情面板里某一关的星数：通关了显示 ★★★，没通关显示「未通关」
function starsOf(levelId) {
  const star = detail.value.progress.find((p) => p.levelId === levelId)?.star
  return star ? '★'.repeat(star) : '未通关'
}

// 读取用户列表；keyword 不为空时按账号或昵称搜索
async function loadUsers() {
  error.value = ''
  try {
    users.value = await userStore.api('/api/admin/users?q=' + encodeURIComponent(keyword.value))
  } catch (err) {
    error.value = err.message
  }
}

async function loadLogins() {
  error.value = ''
  try {
    logins.value = await userStore.api('/api/admin/logins')
  } catch (err) {
    error.value = err.message
  }
}

function switchTab(name) {
  tab.value = name
  name === 'users' ? loadUsers() : loadLogins()
}

// 打开某个用户的详情：通关情况 + 错题
async function openDetail(u) {
  detail.value = await userStore.api(`/api/admin/users/${u.userId}`)
}

// 禁用 ↔ 恢复
async function toggleStatus(u) {
  const next = u.status === 'active' ? 'disabled' : 'active'
  if (next === 'disabled' && !confirm(`禁用「${u.nickname}」后，他会被立刻踢下线，也无法再登录。确定吗？`)) return
  try {
    await userStore.api(`/api/admin/users/${u.userId}`, { status: next }, 'PUT')
    u.status = next
  } catch (err) {
    alert(err.message)
  }
}

// 删除账号：他的笔记、错题、进度、登录记录会一起被删掉（数据库的级联删除）
async function removeUser(u) {
  if (!confirm(`删除「${u.nickname}」后，他的笔记、错题、进度会全部清空，无法恢复。确定吗？`)) return
  try {
    await userStore.api(`/api/admin/users/${u.userId}`, null, 'DELETE')
    users.value = users.value.filter((x) => x.userId !== u.userId)
    if (detail.value?.userId === u.userId) detail.value = null
  } catch (err) {
    alert(err.message)
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
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- ===== 用户管理 ===== -->
    <template v-if="tab === 'users'">
      <form class="search" @submit.prevent="loadUsers">
        <input v-model="keyword" placeholder="按账号或昵称搜索" />
        <button>搜索</button>
        <span class="total">共 {{ users.length }} 人</span>
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
              <!-- 不能对自己操作，所以自己那一行不显示这两个按钮 -->
              <template v-if="u.userId !== userStore.user.userId">
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
    <template v-else>
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
.admin { position: relative; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button {
  padding: 8px 18px; border: 1px solid #e5e7eb; border-radius: 999px;
  background: #fff; cursor: pointer; font-size: 14px;
}
.tabs button.active { background: #1f2329; color: #fff; border-color: #1f2329; }
.search { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.search input { width: 240px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
.search button { padding: 8px 16px; border: none; border-radius: 8px; background: #2556b6; color: #fff; cursor: pointer; }
.total { margin-left: auto; color: #6b7280; font-size: 13px; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; white-space: nowrap; }
th { background: #f6f7f9; color: #6b7280; font-weight: normal; }
tr.disabled td { color: #9ca3af; }
.empty { text-align: center; color: #9ca3af; }
.ops button {
  margin-right: 6px; padding: 4px 10px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #fff; cursor: pointer; font-size: 13px;
}
.ops button:hover { border-color: #2556b6; color: #2556b6; }
.ops .danger:hover { border-color: #b91c1c; color: #b91c1c; }

/* 小标签：管理员 / 正常 / 已禁用 / 待温习 / 已掌握 */
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.tag.admin { background: #e8eefb; color: #2556b6; margin-left: 4px; }
.tag.active, .tag.mastered { background: #dcfce7; color: #15803d; }
.tag.disabled, .tag.todo { background: #fee2e2; color: #b91c1c; }

.detail {
  position: fixed; top: 56px; right: 0; bottom: 0; width: 340px; z-index: 20;
  padding: 20px; overflow-y: auto; background: #fff;
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.1);
}
.detail-head { display: flex; justify-content: space-between; align-items: center; }
.detail-head button { border: none; background: none; font-size: 18px; cursor: pointer; }
.detail h4 { margin: 20px 0 8px; }
.detail ul { list-style: none; padding: 0; margin: 0; font-size: 14px; }
.detail li { padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
.stars { float: right; color: #f59e0b; }
.error { color: #b91c1c; }
</style>
