<script setup lang="ts">
// 我的班级：老师建班、布置任务、上传资料、发起视频会议、看每个学生的完成情况；
// 学生凭班级码加入，看老师布置的任务（完成情况由学习记录自动判断）、下载资料、进入会议
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { levels } from '../data/levels'
import { uploadFile } from '../utils/files'
import FileChip from '../components/FileChip.vue'
import ReportPanel from '../components/ReportPanel.vue'
import type { FileInfo, Report } from '../types'

interface ClassBrief { id: number; name: string; teacher: string; mine: boolean; code?: string; memberCount: number; taskCount: number }
interface Task {
  id: number; kind: 'chapter' | 'level'; target: string; title: string; note: string
  deadline: string | null; createTime: string
  doneCount?: number          // 老师看：完成人数
  done?: boolean; review?: string // 学生看：我完成没有、老师给我的点评
}
interface Member { userId: number; account: string; nickname: string; joinTime: string }
interface ClassDetail {
  id: number; name: string; mine: boolean; code?: string; teacher: string
  meeting: { title: string; url: string; time: string | null } | null
  memberCount: number; members?: Member[]
  tasks: Task[]
  materials: { id: number; title: string; file: FileInfo; createTime: string }[]
}
interface StudentProgress { userId: number; nickname: string; account: string; done: boolean; review: string }

const userStore = useUserStore()
const router = useRouter()
const canTeach = computed(() => userStore.isTeacher || userStore.isAdmin)

const list = ref<ClassBrief[]>([])
const cur = ref<ClassDetail | null>(null)
const tab = ref<'tasks' | 'materials' | 'meeting' | 'members' | 'stats'>('tasks')
const error = ref('')
const busy = ref(false)

async function call<T = any>(fn: () => Promise<T>) {
  error.value = ''
  busy.value = true
  try {
    return await fn()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}

async function loadList() {
  list.value = (await call(() => userStore.api<ClassBrief[]>('/api/classes'))) || []
  if (!cur.value && list.value.length) open(list.value[0].id)
}
async function open(id: number) {
  const d = await call(() => userStore.api<ClassDetail>(`/api/classes/${id}`))
  if (d) {
    cur.value = d
    if (!d.mine && (tab.value === 'members' || tab.value === 'stats')) tab.value = 'tasks'
    progressOf.value = null
    stats.value = null
    if (d.mine && tab.value === 'stats') loadStats()
  }
}
const reload = () => cur.value && open(cur.value.id)

// ===== 学情（只有老师能看）=====
// 只统计学习记录（章节、关卡、错题、班级任务），情报站里的发言不计入
interface StudentStat {
  userId: number; nickname: string; account: string; tasksDone: number
  chaptersDone: number; levelsDone: number; mistakesOpen: number; weak: string[]
}
interface ClassStats {
  taskCount: number; taskRate: number; students: StudentStat[]
  kps: { id: string; name: string; group: string; avg: number; weakCount: number }[]
}
const stats = ref<ClassStats | null>(null)
async function loadStats() {
  stats.value = (await call(() => userStore.api<ClassStats>(`/api/classes/${cur.value!.id}/stats`))) || null
}
function showStats() {
  tab.value = 'stats'
  loadStats()
}
// 全班最薄弱的知识点排前面（只看有人学过的）
const weakKps = computed(() => (stats.value?.kps || []).filter((k) => k.avg > 0 || k.weakCount).sort((a, b) => a.avg - b.avg))
// 点开某个学生的完整学习报告
const viewing = ref<{ nickname: string; report: Report } | null>(null)
async function viewStudent(s: StudentStat) {
  const r = await call(() => userStore.api<Report & { nickname: string }>(`/api/classes/${cur.value!.id}/students/${s.userId}/report`))
  if (r) viewing.value = { nickname: r.nickname, report: r }
}
onMounted(loadList)

// ===== 建班 / 加入 =====
const newName = ref('')
const joinCode = ref('')
async function createClass() {
  const r = await call(() => userStore.api<{ id: number }>('/api/classes', { name: newName.value }))
  if (r) {
    newName.value = ''
    await loadList()
    open(r.id)
  }
}
async function joinClass() {
  const r = await call(() => userStore.api<{ id: number }>('/api/classes/join', { code: joinCode.value }))
  if (r) {
    joinCode.value = ''
    await loadList()
    open(r.id)
  }
}
async function leaveOrDelete() {
  const c = cur.value!
  if (!confirm(c.mine ? `解散「${c.name}」？班级的任务和资料会一起删除。` : `退出「${c.name}」？`)) return
  await call(() => (c.mine ? userStore.api(`/api/classes/${c.id}`, undefined, 'DELETE') : userStore.api(`/api/classes/${c.id}/leave`, {})))
  cur.value = null
  loadList()
}

// ===== 布置任务 =====
// 可选的章节来自学习中心的五条路线；可选的关卡来自实战任务
interface Option { value: string; label: string }
const chapterGroups = ref<{ name: string; options: Option[] }[]>([])
const levelOptions: Option[] = levels.map((l) => ({ value: String(l.id), label: `第 ${l.id} 关 · ${l.title}（${l.type}）` }))
const showTaskForm = ref(false)
const taskForm = ref({ kind: 'chapter' as 'chapter' | 'level', target: '', note: '', deadline: '' })
async function openTaskForm() {
  showTaskForm.value = true
  if (chapterGroups.value.length) return
  const tracks = (await call(() => userStore.api<any[]>('/api/learn/tracks'))) || []
  chapterGroups.value = tracks
    .filter((t) => t.total)
    .map((t) => ({
      name: t.name,
      options: t.groups.flatMap((g: any) => g.chapters.map((c: any) => ({ value: c.id, label: `${c.no} ${c.title}` }))),
    }))
}
const targetLabel = computed(() => {
  const f = taskForm.value
  const all = f.kind === 'level' ? levelOptions : chapterGroups.value.flatMap((g) => g.options)
  return all.find((o) => o.value === f.target)?.label || ''
})
async function addTask() {
  const f = taskForm.value
  if (!f.target) return (error.value = f.kind === 'level' ? '请选择关卡' : '请选择章节')
  const title = (f.kind === 'level' ? '实战 · ' : '学习 · ') + targetLabel.value
  const ok = await call(() => userStore.api(`/api/classes/${cur.value!.id}/tasks`, { ...f, title: title.slice(0, 60) }))
  if (ok) {
    taskForm.value = { kind: f.kind, target: '', note: '', deadline: '' }
    showTaskForm.value = false
    reload()
  }
}
async function deleteTask(t: Task) {
  if (!confirm(`删除任务「${t.title}」？`)) return
  await call(() => userStore.api(`/api/classes/${cur.value!.id}/tasks/${t.id}`, undefined, 'DELETE'))
  reload()
}

// 老师：展开某项任务，看每个学生的完成情况、写点评
const progressOf = ref<{ taskId: number; students: StudentProgress[] } | null>(null)
async function toggleProgress(t: Task) {
  if (progressOf.value?.taskId === t.id) return (progressOf.value = null)
  const r = await call(() => userStore.api<{ students: StudentProgress[] }>(`/api/classes/${cur.value!.id}/tasks/${t.id}`))
  if (r) progressOf.value = { taskId: t.id, students: r.students }
}
async function saveReview(s: StudentProgress) {
  const ok = await call(() =>
    userStore.api(`/api/classes/${cur.value!.id}/tasks/${progressOf.value!.taskId}/review`, { userId: s.userId, comment: s.review }, 'PUT'),
  )
  if (ok !== undefined) alert('点评已保存')
}

// 学生：去完成任务
const READER: Record<string, string> = { P: '/prep', F: '/fisco', A: '/frontier' }
function goTask(t: Task) {
  if (t.kind === 'level') router.push({ path: '/mission', query: { level: t.target } })
  else router.push({ path: READER[t.target[0]] || '/camp', query: { chapter: t.target } })
}
const fmt = (t: string | null) => (t ? t.replace('T', ' ').slice(5, 16) : '')
const overdue = (t: Task) => !!t.deadline && !t.done && new Date(t.deadline) < new Date()

// ===== 班级资料 =====
const fileInput = ref<HTMLInputElement | null>(null)
async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  await call(async () => {
    const f = await uploadFile(file)
    await userStore.api(`/api/classes/${cur.value!.id}/materials`, { fileId: f.id, title: file.name })
  })
  reload()
}
async function deleteMaterial(id: number) {
  if (!confirm('删除这份资料？')) return
  await call(() => userStore.api(`/api/classes/${cur.value!.id}/materials/${id}`, undefined, 'DELETE'))
  reload()
}

// ===== 视频会议 =====
const meetingForm = ref({ title: '', url: '', time: '' })
async function saveMeeting() {
  const ok = await call(() => userStore.api(`/api/classes/${cur.value!.id}/meeting`, meetingForm.value, 'PUT'))
  if (ok !== undefined) {
    meetingForm.value = { title: '', url: '', time: '' }
    reload()
  }
}
async function clearMeeting() {
  if (!confirm('结束并移除这场会议？')) return
  await call(() => userStore.api(`/api/classes/${cur.value!.id}/meeting`, undefined, 'DELETE'))
  reload()
}

// ===== 成员 =====
async function removeMember(m: Member) {
  if (!confirm(`把「${m.nickname}」移出班级？`)) return
  await call(() => userStore.api(`/api/classes/${cur.value!.id}/members/${m.userId}`, undefined, 'DELETE'))
  reload()
}
async function copyCode() {
  await navigator.clipboard?.writeText(cur.value!.code!).catch(() => {})
  alert(`班级码 ${cur.value!.code} 已复制，发给学生就能加入`)
}

// 还没选班级时，右边显示「三步走」引导
const TEACHER_STEPS = [
  { title: '建班', text: '在左边写好班级名称，点「建班」，系统会生成一个 6 位班级码' },
  { title: '发班级码', text: '把班级码发给学生，学生在「我的班级」里输入就能加入' },
  { title: '布置与跟进', text: '布置学习章节和实战关卡、上传资料、开视频会议，在「学情」里看每个人的掌握情况' },
]
const STUDENT_STEPS = [
  { title: '拿到班级码', text: '向老师要 6 位班级码' },
  { title: '加入班级', text: '在左边输入班级码，点「加入」' },
  { title: '完成任务', text: '老师布置的章节和关卡会出现在「任务」里，完成后老师能看到你的进度' },
]
</script>

<template>
  <div class="class-page">
    <!-- 左：班级列表 + 建班 / 加入 -->
    <aside class="side glass">
      <div class="eyebrow">My Classes</div>
      <h2>我的班级</h2>

      <button v-for="c in list" :key="c.id" :class="['c-item', { on: cur?.id === c.id }]" @click="open(c.id)">
        <span class="c-name">{{ c.name }}</span>
        <span class="c-meta">{{ c.mine ? `我是老师 · ${c.memberCount} 名学生` : `老师：${c.teacher} · ${c.taskCount} 项任务` }}</span>
      </button>
      <p v-if="!list.length" class="empty">{{ canTeach ? '还没有班级，先建一个吧' : '还没有加入班级' }}</p>

      <form v-if="canTeach" class="side-form" @submit.prevent="createClass">
        <span class="label">新建班级</span>
        <input v-model="newName" class="input" maxlength="20" placeholder="班级名称，如：区块链安全 1 班" />
        <button class="btn primary" :disabled="busy">建 班</button>
      </form>
      <form class="side-form" @submit.prevent="joinClass">
        <span class="label">加入班级</span>
        <input v-model="joinCode" class="input" maxlength="6" inputmode="numeric" placeholder="输入老师给的 6 位班级码" />
        <button class="btn" :disabled="busy">加 入</button>
      </form>
    </aside>

    <!-- 右：班级详情 -->
    <section class="main glass">
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="!cur" class="placeholder">
        <h3 class="glitch" :data-text="canTeach ? '三步开好一个班' : '三步加入班级'">{{ canTeach ? '三步开好一个班' : '三步加入班级' }}</h3>
        <div class="steps">
          <div v-for="(st, i) in (canTeach ? TEACHER_STEPS : STUDENT_STEPS)" :key="i" class="step">
            <span class="step-no">0{{ i + 1 }}</span>
            <b>{{ st.title }}</b>
            <span>{{ st.text }}</span>
          </div>
        </div>
        <p class="ph-tip">👈 {{ canTeach ? '在左边输入班级名称，点「建班」开始' : '在左边输入班级码，点「加入」开始' }}</p>
      </div>

      <template v-else>
        <header class="c-head">
          <div>
            <h3>{{ cur.name }}</h3>
            <p>{{ cur.mine ? `${cur.memberCount} 名学生` : `老师：${cur.teacher}` }}</p>
          </div>
          <div class="c-actions">
            <button v-if="cur.mine" class="code" title="复制班级码" @click="copyCode">班级码 <b>{{ cur.code }}</b></button>
            <button class="link danger" @click="leaveOrDelete">{{ cur.mine ? '解散班级' : '退出班级' }}</button>
          </div>
        </header>

        <!-- 会议进行中：任何标签页都在顶部显示 -->
        <a v-if="cur.meeting" class="meeting-bar" :href="cur.meeting.url" target="_blank" rel="noopener">
          <span>🎥 {{ cur.meeting.title }}<template v-if="cur.meeting.time"> · {{ fmt(cur.meeting.time) }}</template></span>
          <b>进入会议 →</b>
        </a>

        <nav class="tabs">
          <button :class="{ on: tab === 'tasks' }" @click="tab = 'tasks'">📌 任务 {{ cur.tasks.length }}</button>
          <button :class="{ on: tab === 'materials' }" @click="tab = 'materials'">📚 资料 {{ cur.materials.length }}</button>
          <button :class="{ on: tab === 'meeting' }" @click="tab = 'meeting'">🎥 视频会议</button>
          <button v-if="cur.mine" :class="{ on: tab === 'members' }" @click="tab = 'members'">👥 学生 {{ cur.memberCount }}</button>
          <button v-if="cur.mine" :class="{ on: tab === 'stats' }" @click="showStats">📊 学情</button>
        </nav>

        <!-- ===== 任务 ===== -->
        <div v-if="tab === 'tasks'" class="pane">
          <template v-if="cur.mine">
            <button v-if="!showTaskForm" class="btn primary" @click="openTaskForm">＋ 布置任务</button>
            <form v-else class="task-form" @submit.prevent="addTask">
              <div class="kinds">
                <button type="button" :class="{ on: taskForm.kind === 'chapter' }" @click="taskForm.kind = 'chapter'; taskForm.target = ''">📖 学习章节</button>
                <button type="button" :class="{ on: taskForm.kind === 'level' }" @click="taskForm.kind = 'level'; taskForm.target = ''">🎯 实战关卡</button>
              </div>
              <select v-model="taskForm.target" class="input">
                <option value="" disabled>{{ taskForm.kind === 'level' ? '选择关卡' : '选择章节' }}</option>
                <template v-if="taskForm.kind === 'chapter'">
                  <optgroup v-for="g in chapterGroups" :key="g.name" :label="g.name">
                    <option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </optgroup>
                </template>
                <option v-for="o in taskForm.kind === 'level' ? levelOptions : []" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <textarea v-model="taskForm.note" class="input" rows="2" maxlength="300" placeholder="任务说明（选填），如：重点理解 onlyOwner 的作用"></textarea>
              <label class="row">截止时间（选填）<input v-model="taskForm.deadline" class="input" type="datetime-local" /></label>
              <p class="hint">{{ taskForm.kind === 'level' ? '学生通关这一关，就自动算完成。' : '学生读完这一章并守住章末防御战，就自动算完成。' }}</p>
              <div class="row">
                <button class="btn primary" :disabled="busy">发 布</button>
                <button type="button" class="btn" @click="showTaskForm = false">取 消</button>
              </div>
            </form>
          </template>

          <div v-for="t in cur.tasks" :key="t.id" :class="['task', { done: t.done, late: overdue(t) }]">
            <div class="t-row">
              <div class="t-info">
                <b>{{ t.title }}</b>
                <span v-if="t.note" class="t-note">{{ t.note }}</span>
                <span class="t-meta">
                  {{ t.deadline ? `截止 ${fmt(t.deadline)}` : '不限时间' }}<template v-if="overdue(t)"> · 已逾期</template>
                </span>
              </div>
              <template v-if="cur.mine">
                <span class="count">{{ t.doneCount }} / {{ cur.memberCount }} 完成</span>
                <button class="link" @click="toggleProgress(t)">{{ progressOf?.taskId === t.id ? '收起' : '查看' }}</button>
                <button class="link danger" @click="deleteTask(t)">删除</button>
              </template>
              <template v-else>
                <span :class="['state', { ok: t.done }]">{{ t.done ? '✓ 已完成' : '未完成' }}</span>
                <button v-if="!t.done" class="btn" @click="goTask(t)">去完成 →</button>
              </template>
            </div>
            <p v-if="!cur.mine && t.review" class="review">🧑‍🏫 老师点评：{{ t.review }}</p>

            <!-- 老师：每个学生的完成情况 + 点评 -->
            <div v-if="progressOf?.taskId === t.id" class="progress">
              <p v-if="!progressOf.students.length" class="empty">班里还没有学生</p>
              <div v-for="s in progressOf.students" :key="s.userId" class="stu">
                <span class="s-name">{{ s.nickname }}</span>
                <span :class="['state', { ok: s.done }]">{{ s.done ? '✓ 已完成' : '未完成' }}</span>
                <input v-model="s.review" class="input" maxlength="200" placeholder="写一句点评（学生能看到）" />
                <button class="link" @click="saveReview(s)">保存</button>
              </div>
            </div>
          </div>
          <p v-if="!cur.tasks.length" class="empty">{{ cur.mine ? '还没有布置任务' : '老师还没有布置任务' }}</p>
        </div>

        <!-- ===== 资料 ===== -->
        <div v-else-if="tab === 'materials'" class="pane">
          <template v-if="cur.mine">
            <button class="btn primary" :disabled="busy" @click="fileInput?.click()">＋ 上传资料</button>
            <input ref="fileInput" type="file" hidden @change="upload" />
            <p class="hint">讲义、PDF、PPT、Word、代码文件都可以，单个文件不超过 10MB。只有本班学生能看到。</p>
          </template>
          <div v-for="m in cur.materials" :key="m.id" class="material">
            <FileChip :file="m.file" />
            <span class="t-meta">{{ fmt(m.createTime) }}</span>
            <button v-if="cur.mine" class="link danger" @click="deleteMaterial(m.id)">删除</button>
          </div>
          <p v-if="!cur.materials.length" class="empty">{{ cur.mine ? '还没有上传资料' : '老师还没有分享资料' }}</p>
        </div>

        <!-- ===== 视频会议 ===== -->
        <div v-else-if="tab === 'meeting'" class="pane">
          <div v-if="cur.meeting" class="meeting-card">
            <div>
              <b>🎥 {{ cur.meeting.title }}</b>
              <span class="t-meta">{{ cur.meeting.time ? `时间 ${fmt(cur.meeting.time)}` : '随时可以进入' }}</span>
            </div>
            <a class="btn primary" :href="cur.meeting.url" target="_blank" rel="noopener">进入会议</a>
            <button v-if="cur.mine" class="link danger" @click="clearMeeting">结束会议</button>
          </div>
          <p v-else-if="!cur.mine" class="empty">老师还没有发起视频会议</p>

          <form v-if="cur.mine" class="task-form" @submit.prevent="saveMeeting">
            <span class="label">{{ cur.meeting ? '更换会议' : '发起视频会议' }}</span>
            <p class="hint">先在腾讯会议（或其他会议软件）里创建会议，把会议链接粘贴到这里，学生点一下就能进入。</p>
            <input v-model="meetingForm.title" class="input" maxlength="40" placeholder="会议主题，如：周五答疑课" />
            <input v-model="meetingForm.url" class="input" placeholder="会议链接，以 https:// 开头" />
            <label class="row">会议时间（选填）<input v-model="meetingForm.time" class="input" type="datetime-local" /></label>
            <div class="row"><button class="btn primary" :disabled="busy">发 布</button></div>
          </form>
        </div>

        <!-- ===== 学生名单（只有老师能看）===== -->
        <div v-else-if="tab === 'members' && cur.members" class="pane">
          <div v-for="m in cur.members" :key="m.userId" class="stu">
            <span class="s-name">{{ m.nickname }}</span>
            <span class="t-meta">账号 {{ m.account }} · {{ fmt(m.joinTime) }} 加入</span>
            <button class="link danger" @click="removeMember(m)">移出</button>
          </div>
          <p v-if="!cur.members.length" class="empty">还没有学生加入。点右上角复制班级码，发给学生。</p>
        </div>

        <!-- ===== 学情（只有老师能看）===== -->
        <div v-else-if="tab === 'stats' && stats" class="pane">
          <div class="overview">
            <div><b>{{ stats.students.length }}</b><em>名学生</em></div>
            <div><b>{{ stats.taskCount }}</b><em>项任务</em></div>
            <div><b>{{ stats.taskRate }}%</b><em>任务完成率</em></div>
          </div>

          <h4 class="sub">全班知识点掌握度（从低到高）</h4>
          <div v-for="k in weakKps" :key="k.id" class="kp-row">
            <span class="kp-name">{{ k.name }}</span>
            <span class="bar"><i :style="{ width: k.avg + '%' }" :class="{ low: k.avg < 40 }"></i></span>
            <span class="kp-avg">{{ k.avg }}</span>
            <span class="t-meta">{{ k.weakCount ? `${k.weakCount} 人薄弱` : '' }}</span>
          </div>
          <p v-if="!weakKps.length" class="empty">学生们还没开始学习，等有了学习记录再来看。</p>

          <h4 class="sub">每个学生</h4>
          <table class="stu-table">
            <thead>
              <tr><th>学生</th><th>班级任务</th><th>守住章节</th><th>通关实战</th><th>待订正错题</th><th>薄弱知识点</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="s in stats.students" :key="s.userId">
                <td>{{ s.nickname }}</td>
                <td>{{ s.tasksDone }} / {{ stats.taskCount }}</td>
                <td>{{ s.chaptersDone }}</td>
                <td>{{ s.levelsDone }}</td>
                <td :class="{ warn: s.mistakesOpen }">{{ s.mistakesOpen }}</td>
                <td><span v-for="w in s.weak" :key="w" class="weak-tag">{{ w }}</span><span v-if="!s.weak.length" class="t-meta">—</span></td>
                <td><button class="link" @click="viewStudent(s)">学习报告</button></td>
              </tr>
            </tbody>
          </table>
          <p class="hint">学情只统计学习记录（章节、实战、错题、班级任务），情报站里的发言不计入。</p>
        </div>
      </template>
    </section>

    <!-- 老师查看某个学生的完整学习报告 -->
    <div v-if="viewing" class="mask" @click.self="viewing = null">
      <div class="modal glass">
        <header class="m-head">
          <h3>{{ viewing.nickname }} 的学习报告</h3>
          <button class="link" @click="viewing = null">关闭 ✕</button>
        </header>
        <ReportPanel :report="viewing.report" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.class-page { display: grid; grid-template-columns: 320px 1fr; gap: 20px; max-width: 1320px; margin: 0 auto; align-items: stretch; min-height: calc(100vh - 130px); }
.glass { background: var(--glass-strong); border: 1px solid var(--line); }
.side { padding: 22px 18px; display: flex; flex-direction: column; gap: 8px; }
.side h2 { margin: 2px 0 10px; font-family: var(--font-cyber); font-size: 32px; font-weight: 400; letter-spacing: 6px; color: #fff; text-shadow: 0 0 8px rgba(0, 240, 255, 0.55), 0 0 20px rgba(255, 43, 214, 0.3); }
.c-item {
  display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; text-align: left; cursor: pointer;
  color: var(--text); background: none; border: 1px solid transparent; font-family: var(--font); transition: all 0.2s;
}
.c-item:hover { background: rgba(0, 240, 255, 0.05); }
.c-item.on { border-color: var(--line-strong); background: rgba(0, 240, 255, 0.08); }
.c-name { font-size: 15px; color: #fff; }
.c-meta { font-size: 12px; color: var(--text-faint); }
.side-form { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
.label { font-size: 13px; letter-spacing: 1px; color: #fff; }
.empty { margin: 10px 0; font-size: 13px; color: var(--text-faint); }
.error { margin: 0 0 12px; color: var(--danger); }

.main { padding: 22px 24px; min-height: 480px; }
.placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; min-height: 400px; color: var(--text-dim); text-align: center; }
.placeholder h3 { margin: 0; font-family: var(--font-cyber); font-size: 30px; font-weight: 400; letter-spacing: 6px; color: #fff; text-shadow: 0 0 10px rgba(0, 240, 255, 0.5); }
.steps { width: 100%; max-width: 860px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.step { display: flex; flex-direction: column; gap: 8px; padding: 20px 18px; text-align: left; border: 1px solid var(--line); background: rgba(0, 240, 255, 0.03); }
.step-no { font-family: "Orbitron", var(--font-code); font-size: 28px; font-weight: 700; color: var(--accent); text-shadow: 0 0 10px rgba(0, 240, 255, 0.5); }
.step b { font-size: 16px; font-weight: 500; color: #fff; }
.step span:last-child { font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.ph-tip { margin: 0; font-size: 14px; color: var(--text-faint); }
.c-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.c-head h3 { margin: 0 0 4px; font-size: 22px; font-weight: 400; letter-spacing: 3px; color: #fff; }
.c-head p { margin: 0; font-size: 13px; color: var(--text-dim); }
.c-actions { display: flex; align-items: center; gap: 14px; }
.code { padding: 6px 12px; cursor: pointer; font-family: var(--font); font-size: 13px; color: var(--text-dim); background: none; border: 1px dashed var(--line-strong); }
.code b { margin-left: 4px; font-family: var(--font-code); font-size: 17px; letter-spacing: 3px; color: var(--gold); }

.meeting-bar {
  display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 10px 14px;
  text-decoration: none; color: #fff; font-size: 14px; background: rgba(142, 230, 196, 0.1); border: 1px solid rgba(142, 230, 196, 0.5);
}
.meeting-bar b { color: var(--ok); font-weight: 500; }

.tabs { display: flex; gap: 22px; margin: 18px 0 16px; border-bottom: 1px solid var(--line); }
.tabs button {
  position: relative; padding: 0 0 10px; cursor: pointer; background: none; border: none;
  font-family: var(--font); font-size: 15px; color: var(--text-dim);
}
.tabs button.on { color: #fff; }
.tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.pane { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
.pane > .btn { align-self: flex-start; }
.hint { margin: 0; font-size: 12px; color: var(--text-faint); }

.task-form { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--line); background: rgba(0, 240, 255, 0.03); }
.kinds { display: flex; gap: 10px; }
.kinds button {
  padding: 7px 16px; cursor: pointer; font-family: var(--font); font-size: 14px;
  color: var(--text-dim); background: none; border: 1px solid var(--line);
}
.kinds button.on { color: #fff; border-color: var(--accent); }
.row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-dim); }
.row .input { flex: 1; }
select.input, textarea.input { background: rgba(0, 0, 0, 0.3); color: var(--text); font-family: var(--font); }
input[type='datetime-local'] { color-scheme: dark; }

.task { padding: 12px 14px; border: 1px solid var(--line); border-left: 3px solid var(--line-strong); }
.task.done { border-left-color: var(--ok); }
.task.late { border-left-color: var(--danger); }
.t-row { display: flex; align-items: center; gap: 14px; }
.t-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.t-info b { font-size: 15px; font-weight: 500; color: #fff; }
.t-note { font-size: 13px; color: var(--text-dim); }
.t-meta { font-size: 12px; color: var(--text-faint); }
.task.late .t-meta { color: var(--danger); }
.count { font-family: var(--font-code); font-size: 13px; color: var(--accent); white-space: nowrap; }
.state { font-size: 13px; color: var(--text-faint); white-space: nowrap; }
.state.ok { color: var(--ok); }
.review { margin: 8px 0 0; padding: 6px 10px; font-size: 13px; color: var(--gold); background: rgba(252, 238, 10, 0.06); }
.progress { margin-top: 10px; padding-top: 6px; border-top: 1px dashed var(--line); }
.stu { display: flex; align-items: center; gap: 12px; padding: 7px 0; }
.s-name { width: 90px; flex-shrink: 0; font-size: 14px; color: #fff; }
.stu .input { flex: 1; padding: 6px 2px; font-size: 13px; }
.link { padding: 0; cursor: pointer; background: none; border: none; font-family: var(--font); font-size: 13px; color: var(--accent); white-space: nowrap; }
.link.danger { color: var(--danger); }

.material { display: flex; align-items: center; gap: 14px; }
.meeting-card { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid rgba(142, 230, 196, 0.5); background: rgba(142, 230, 196, 0.06); }
.meeting-card > div { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.meeting-card b { font-size: 16px; font-weight: 500; color: #fff; }
.meeting-card .btn { text-decoration: none; }

.overview { display: flex; gap: 12px; }
.overview div { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border: 1px solid var(--line); }
.overview b { font-family: var(--font-code); font-size: 26px; font-weight: 400; color: #fff; }
.overview em { font-style: normal; font-size: 12px; color: var(--text-dim); }
.sub { margin: 10px 0 2px; font-size: 14px; font-weight: 500; letter-spacing: 2px; color: #fff; }
.kp-row { display: grid; grid-template-columns: 150px 1fr 36px 70px; align-items: center; gap: 10px; font-size: 13px; }
.kp-name { color: var(--text); }
.bar { height: 5px; background: rgba(255, 255, 255, 0.07); }
.bar i { display: block; height: 100%; background: var(--accent); }
.bar i.low { background: var(--danger); }
.kp-avg { font-family: var(--font-code); text-align: right; color: #fff; }
.stu-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stu-table th { padding: 8px; text-align: left; font-weight: 400; color: var(--accent); border-bottom: 1px solid var(--line-strong); }
.stu-table td { padding: 8px; border-bottom: 1px solid rgba(0, 240, 255, 0.08); }
.stu-table td.warn { color: var(--danger); }
.weak-tag { display: inline-block; margin: 0 4px 2px 0; padding: 1px 8px; font-size: 12px; color: var(--danger); background: rgba(255, 107, 129, 0.1); border-radius: 999px; }
.mask { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-start; justify-content: center; padding: 60px 20px; overflow-y: auto; background: rgba(0, 0, 0, 0.7); }
.modal { width: min(1100px, 100%); padding: 22px 24px; background: rgba(8, 4, 22, 0.97); }
.m-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.m-head h3 { margin: 0; font-size: 20px; font-weight: 400; letter-spacing: 2px; color: #fff; }

@media (max-width: 760px) {
  .class-page { grid-template-columns: 1fr; min-height: 0; }
  .steps { grid-template-columns: 1fr; }
  .c-head { flex-direction: column; }
  .t-row { flex-wrap: wrap; }
  .stu { flex-wrap: wrap; }
}
</style>
