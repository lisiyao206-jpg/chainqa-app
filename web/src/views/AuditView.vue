<script setup lang="ts">
// 多模态：也可以上传 / 粘贴一张代码截图，视觉模型先把图里的代码读出来，再交给 Agent 审计
// AI 审计：粘贴一份合约，AI 审计 Agent 自己规划步骤、调用工具（规则扫描 / 查漏洞库 / 检索教材），最后写出审计报告
// 右边实时显示 Agent 的每一步：🧠 它在想什么、🔧 调用了哪个工具、📦 工具返回了什么——AI 的「思考过程」看得见
// 左边的代码会标出扫描到的问题行
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SWC_LINKS } from '../data/swcLinks'
import { fileFromPaste } from '../utils/clipboard'
import { useUserStore } from '../stores/user'
import { renderMarkdown } from '../utils/markdown'
import { levels } from '../data/levels'
import type { Finding } from '../types'

// Agent 的一步：think 想法 / tool 调用工具 / result 工具返回
interface AgentStep {
  type: 'think' | 'tool' | 'result'
  text?: string
  name?: string
  args?: Record<string, unknown>
}

// 审计记录（列表里只有概要；点开一条再取完整内容）
interface AuditRecord {
  id: number
  title: string
  risk: string
  auditCount: number
  findingsCount: number
  createdAt: string
  updatedAt: string
  repeat?: boolean
}

const userStore = useUserStore()
const code = ref('')
const editing = ref(true)   // true 编辑代码 / false 查看审计结果（标出问题行）
const running = ref(false)
const steps = ref<AgentStep[]>([])       // Agent 的每一步：{ type: 'think' | 'tool' | 'result', text, name, args }
const findings = ref<Finding[]>([])    // 规则扫描找到的疑似问题
const report = ref('')
const error = ref('')
const logId = ref<number | null>(null)
const rating = ref<'up' | 'down' | null>(null)
const viewerEl = ref<HTMLDivElement | null>(null)

// 工具的中文名：时间线上显示得更清楚
const TOOL_NAMES = { scan_contract: '规则扫描', lookup_swc: '查询 SWC 漏洞库', search_knowledge: '检索教材知识库' }

// ===== 截图识别代码（多模态）=====
const imageInput = ref<HTMLInputElement | null>(null)
const reading = ref(false)   // 正在识别截图
const visionTip = ref('')

// 图片太大时先在浏览器里缩小（最长边 1800 像素），上传更快，也不会超过 5MB 的限制
function toDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1800 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('这张图片打不开'))
    img.src = URL.createObjectURL(file)
  })
}

async function readImage(file: File | null | undefined) {
  if (!file?.type.startsWith('image/')) return
  reading.value = true
  visionTip.value = ''
  error.value = ''
  try {
    const { code: got } = await userStore.api<{ code: string }>('/api/vision/code', { image: await toDataURL(file) })
    code.value = got
    editing.value = true
    visionTip.value = '✅ 已从截图识别出代码。识别可能有个别错字，检查一下再点「开始审计」'
  } catch (err) {
    visionTip.value = '⚠️ ' + (err as Error).message
  } finally {
    reading.value = false
  }
}
function pickImage(e: Event) {
  const input = e.target as HTMLInputElement
  readImage(input.files![0])
  input.value = ''
}
// 在代码框里 Ctrl + V：粘贴的是截图就识别；是文字就照常粘贴
function onPaste(e: ClipboardEvent) {
  const file = fileFromPaste(e)
  if (file?.type.startsWith('image/')) {
    e.preventDefault()
    readImage(file)
  }
}

// 示例合约：直接用实战任务里的 5 份
function loadSample(e: Event) {
  const select = e.target as HTMLSelectElement
  const lv = levels.find((l) => l.id === Number(select.value))
  if (lv) code.value = lv.code.join('\n')
  select.value = ''
  editing.value = true
}

// ===== 审计记录 =====
const records = ref<AuditRecord[]>([])
const showHistory = ref(false)
const dup = ref<AuditRecord | null>(null)  // 这份合约以前审计过：让用户选看上次的还是重新审计
const savedTip = ref('')
const RISK_CLASS: Record<string, string> = { 高危: 'high', 中危: 'mid', 低危: 'low' }
const shortTime = (t: string) => t.slice(5, 16).replace('T', ' ') // 2026-10-20T17:50:08 → 10-20 17:50

async function loadRecords() {
  try {
    records.value = await userStore.api<AuditRecord[]>('/api/audits')
  } catch {}
}

// 打开一条记录：代码、扫描结果、Agent 当时的每一步和报告都恢复出来，不用再花时间重新审计
async function openRecord(id: number) {
  try {
    const r = await userStore.api(`/api/audits/${id}`)
    code.value = r.code
    findings.value = r.findings
    steps.value = r.steps
    report.value = r.report
    error.value = ''
    logId.value = rating.value = null
    editing.value = false
    dup.value = null
    showHistory.value = false
    savedTip.value = `📁 这是 ${shortTime(r.updatedAt)} 的审计记录（共审计 ${r.auditCount} 次）`
  } catch (err) {
    error.value = (err as Error).message
  }
}

async function removeRecord(r: AuditRecord) {
  if (!confirm(`删除「${r.title}」的审计记录？`)) return
  await userStore.api(`/api/audits/${r.id}`, null, 'DELETE')
  records.value = records.value.filter((x) => x.id !== r.id)
}

// force = true：用户看过提示，坚持要重新审计
async function audit(force = false) {
  if (!code.value.trim() || running.value) return
  dup.value = null
  savedTip.value = ''
  if (!force) {
    try {
      const { record } = await userStore.api<{ record: AuditRecord | null }>('/api/audits/check', { code: code.value })
      if (record) {
        dup.value = record
        return
      }
    } catch {}
  }
  running.value = true
  editing.value = false
  steps.value = []
  findings.value = []
  report.value = error.value = ''
  logId.value = rating.value = null
  try {
    const res = await fetch('/api/agent/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userStore.token}` },
      body: JSON.stringify({ code: code.value }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '请求失败，后端开着吗？')
    // 和 AI 小助手一样用 SSE：后端每走一步就推一条
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() as string
      for (const raw of events) {
        const event = raw.match(/^event: (.+)$/m)?.[1]
        const data = JSON.parse(raw.match(/^data: (.+)$/m)?.[1] || 'null')
        if (event === 'step') steps.value.push(data)
        else if (event === 'findings') {
          findings.value = data
          // 扫到问题后，代码自动滚到第一个最严重的问题行
          nextTick(() => viewerEl.value?.querySelector('.ln-row.high, .ln-row.mid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        }
        else if (event === 'report') report.value = data
        else if (event === 'error') error.value = data
        else if (event === 'log') logId.value = data
        else if (event === 'saved') {
          savedTip.value = data.repeat ? `📁 这份合约之前审计过，已更新审计记录（共审计 ${data.auditCount} 次）` : '📁 已存入「审计记录」'
          loadRecords()
        }
      }
    }
  } catch (err) {
    error.value = (err as Error).message
  }
  running.value = false
}

// 左边查看模式：每一行带上扫描结果，问题行按严重程度上色
const lines = computed(() =>
  code.value.split('\n').map((text, i) => ({ no: i + 1, text, hits: findings.value.filter((f) => f.line === i + 1) })),
)
const counts = computed(() => {
  const c = { 高危: 0, 中危: 0, 低危: 0, 提示: 0 }
  findings.value.forEach((f) => c[f.severity]++)
  return c
})
const SEV = { 高危: 'high', 中危: 'mid', 低危: 'low', 提示: 'info' }

// 从实战任务的「让 AI 审计复盘」跳过来：网址带着 ?level=3，自动填入那一关的合约并开始审计
const route = useRoute()
onMounted(() => {
  loadRecords()
  const lv = levels.find((l) => l.id === Number(route.query.level))
  if (lv) {
    code.value = lv.code.join('\n')
    audit()
  }
})

// 延伸学习：报告里出现过的每种漏洞，对应的训练营章节和实战关卡
const related = computed(() => {
  const ids = [...new Set(findings.value.filter((f) => f.severity !== '提示').map((f) => f.swc))]
  // 扫描器没扫到、但 AI 在报告里写到的 SWC 编号也算上
  for (const m of report.value.matchAll(/SWC-(\d{3})/g)) if (!ids.includes('SWC-' + m[1])) ids.push('SWC-' + m[1])
  return ids
    .filter((id) => SWC_LINKS[id])
    .map((id) => ({ id, title: findings.value.find((f) => f.swc === id)?.title || '', ...SWC_LINKS[id], monster: levels.find((l) => l.id === SWC_LINKS[id].level)?.monster }))
})

async function rate(r: 'up' | 'down') {
  rating.value = r
  try {
    await userStore.api('/api/feedback', { type: 'answer', logId: logId.value, rating: r, content: '' })
  } catch {}
}
</script>

<template>
  <div class="audit">
    <div class="head">
      <div class="eyebrow">Audit Agent</div>
      <h2>AI 审计</h2>
      <p>粘贴一份 Solidity 合约，审计 Agent 会自己规划步骤、调用工具找漏洞，并给出修复方案</p>
    </div>

    <div class="grid">
      <!-- 左：合约代码 -->
      <section class="pane code-pane">
        <div class="bar">
          <select class="sample" @change="loadSample">
            <option value="">📂 载入示例合约…</option>
            <option v-for="lv in levels" :key="lv.id" :value="lv.id">{{ lv.title }}（{{ lv.type }}）</option>
          </select>
          <button class="btn" :disabled="reading || running" title="上传一张代码截图，AI 识别出代码（也可以直接在代码框里 Ctrl + V 粘贴截图）" @click="imageInput!.click()">
            {{ reading ? '识别中…' : '📷 截图识别' }}
          </button>
          <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="pickImage" />
          <button v-if="!editing" class="btn" @click="editing = true">✏️ 编辑代码</button>
          <button class="btn" @click="showHistory = true">🗂 审计记录{{ records.length ? `（${records.length}）` : '' }}</button>
          <span class="len">{{ code.length }} / 12000</span>
          <button class="btn primary" :disabled="running || !code.trim()" @click="audit()">{{ running ? '审计中…' : '🔍 开始审计' }}</button>
        </div>
        <div v-if="reading" class="reading">🔍 视觉模型正在读截图里的代码……</div>
        <div v-else-if="visionTip" class="vision-tip">{{ visionTip }}</div>
        <textarea v-if="editing" v-model="code" class="editor" @paste="onPaste" spellcheck="false" maxlength="12000"
          placeholder="// 把要审计的合约粘贴到这里，或者从上面载入示例合约；&#10;// 也可以直接 Ctrl + V 粘贴一张代码截图，AI 会帮你识别出代码&#10;pragma solidity ^0.8.21;&#10;&#10;contract MyContract { ... }"></textarea>
        <!-- 查看模式：标出扫描到的问题行 -->
        <div v-else ref="viewerEl" class="viewer">
          <div v-for="l in lines" :key="l.no" :class="['ln-row', l.hits[0] && SEV[l.hits[0].severity]]">
            <span class="no">{{ l.no }}</span>
            <pre>{{ l.text || ' ' }}</pre>
            <span v-for="h in l.hits" :key="h.swc" class="hit" :title="h.message">{{ h.swc }}</span>
          </div>
        </div>
      </section>

      <!-- 右：Agent 的思考过程 + 审计报告 -->
      <section class="pane agent-pane">
        <!-- 这份合约以前审计过：不用再等一遍，可以直接看上次的报告 -->
        <div v-if="dup" class="dup">
          <span>📁 这份合约在 <b>{{ shortTime(dup.updatedAt) }}</b> 审计过（共 {{ dup.auditCount }} 次），结论：<b :class="RISK_CLASS[dup.risk]">{{ dup.risk }}</b></span>
          <span class="dup-actions">
            <button class="btn primary" @click="openRecord(dup.id)">查看上次的报告</button>
            <button class="btn" @click="audit(true)">重新审计</button>
          </span>
        </div>
        <div v-if="savedTip && !running" class="saved-tip">{{ savedTip }}</div>
        <div v-if="!steps.length && !running && !report && !error && !dup" class="idle">
          <div class="big">🛡️</div>
          <p>审计 Agent 待命中</p>
          <ol>
            <li>🧠 先制定审计计划</li>
            <li>🔧 调用「规则扫描」找出疑似问题</li>
            <li>🔧 查询 SWC 漏洞库、检索教材，给每个问题找依据</li>
            <li>📝 判断误报、补充遗漏，写出审计报告和修复代码</li>
          </ol>
        </div>

        <!-- 时间线：每一步 -->
        <div v-if="steps.length" class="timeline">
          <div v-for="(s, i) in steps" :key="i" :class="['step', s.type]">
            <span class="icon">{{ { think: '🧠', tool: '🔧', result: '📦' }[s.type] }}</span>
            <div class="body">
              <template v-if="s.type === 'think'">{{ s.text }}</template>
              <template v-else-if="s.type === 'tool'">
                调用 <b>{{ TOOL_NAMES[s.name!] || s.name }}</b>
                <code v-if="Object.keys(s.args || {}).length">{{ Object.values(s.args!).join('，') }}</code>
              </template>
              <template v-else>{{ s.text }}</template>
            </div>
          </div>
          <div v-if="running && !report" class="step thinking"><span class="icon spin">⏳</span><div class="body">Agent 正在思考下一步……</div></div>
        </div>

        <div v-if="findings.length" class="counts">
          扫描结果：<span class="high">高危 {{ counts['高危'] }}</span><span class="mid">中危 {{ counts['中危'] }}</span><span class="low">低危 {{ counts['低危'] }}</span><span class="info">提示 {{ counts['提示'] }}</span>
        </div>

        <div v-if="error" class="error">⚠️ {{ error }}</div>

        <!-- 最终审计报告 -->
        <article v-if="report" class="report">
          <div class="r-title">📝 审计报告</div>
          <div class="md" v-html="renderMarkdown(report)"></div>
          <!-- 延伸学习：学 → 练 → 用，三个板块连起来 -->
          <div v-if="related.length" class="related">
            <div class="rel-title">📚 延伸学习</div>
            <div v-for="r in related" :key="r.id" class="rel-row">
              <span class="rel-id">{{ r.id }} {{ r.title }}</span>
              <RouterLink :to="{ path: '/camp', query: { chapter: r.chapter } }">📖 去训练营学这一章</RouterLink>
              <RouterLink v-if="r.level" :to="{ path: '/mission', query: { level: r.level } }">🎮 去打{{ r.monster?.name }}练手</RouterLink>
            </div>
          </div>
          <p class="disclaimer">⚠️ AI 审计结果仅供学习参考，可能存在误报或漏报。真实项目上线前，请由专业审计团队复核。</p>
          <div v-if="logId" class="rate">
            这份报告有帮助吗？
            <button :class="{ on: rating === 'up' }" @click="rate('up')">👍</button>
            <button :class="{ on: rating === 'down' }" @click="rate('down')">👎</button>
          </div>
        </article>
      </section>
    </div>

    <!-- 审计记录 -->
    <div v-if="showHistory" class="mask" @click.self="showHistory = false">
      <div class="history">
        <header>
          <b>🗂 我的审计记录</b>
          <span class="h-tip">同一份合约只保留一条，记录审计次数</span>
          <button class="close" @click="showHistory = false">✕</button>
        </header>
        <div v-if="!records.length" class="h-empty">还没有审计记录。审计完一份合约，会自动存到这里。</div>
        <div v-for="r in records" :key="r.id" class="h-row" @click="openRecord(r.id)">
          <span :class="['risk', RISK_CLASS[r.risk] || 'ok']">{{ r.risk }}</span>
          <span class="h-title">{{ r.title }}</span>
          <span class="h-meta">{{ r.findingsCount }} 个疑似问题 · 审计 {{ r.auditCount }} 次 · {{ shortTime(r.updatedAt) }}</span>
          <button class="h-del" title="删除" @click.stop="removeRecord(r)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit { max-width: 1400px; margin: 0 auto; color: var(--text); }
.head { text-align: center; margin-bottom: 16px; }
.head h2 { margin: 6px 0; font-size: 30px; font-weight: 300; letter-spacing: 10px; color: #fff; }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; height: calc(100vh - 230px); min-height: 480px; }
.pane { display: flex; flex-direction: column; min-height: 0; background: rgba(8, 6, 24, 0.9); border: 1px solid var(--line-strong); }

/* 代码 */
.bar { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
/* 按钮多：放不下就换到第二行，按钮里的字不要被挤成竖排 */
.bar .btn { white-space: nowrap; padding: 8px 14px; }
.bar .sample { flex: 1 1 150px; min-width: 0; }
.sample { padding: 7px 10px; font-size: 13px; color: var(--text); background: rgba(6, 4, 20, 0.85); border: 1px solid var(--line-strong); outline: none; cursor: pointer; }
.reading, .vision-tip { padding: 8px 14px; font-size: 13px; border-bottom: 1px solid var(--line); }
.reading { color: var(--accent); animation: blink 1s ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.5; } }
.vision-tip { color: var(--text-dim); }
.len { margin-left: auto; font-size: 12px; color: var(--text-faint); }
.editor {
  flex: 1; resize: none; padding: 14px 16px; border: none; outline: none; background: transparent; color: #dff6ff;
  font-family: var(--font-code); font-size: 13px; line-height: 1.7; tab-size: 4;
}
.viewer { flex: 1; overflow: auto; padding: 10px 0; }
.ln-row { display: flex; align-items: center; }
.ln-row .no { width: 44px; flex-shrink: 0; text-align: right; padding-right: 14px; color: var(--text-faint); font-family: var(--font-code); font-size: 12px; user-select: none; }
.ln-row pre { flex: 1; margin: 0; font-family: var(--font-code); font-size: 13px; line-height: 1.7; color: #dff6ff; white-space: pre; }
.ln-row.high { background: rgba(255, 107, 129, 0.2); box-shadow: inset 3px 0 0 var(--danger); }
.ln-row.mid { background: rgba(252, 238, 10, 0.12); box-shadow: inset 3px 0 0 var(--gold); }
.ln-row.low, .ln-row.info { background: rgba(0, 240, 255, 0.07); box-shadow: inset 3px 0 0 var(--accent); }
.hit { margin: 0 10px 0 6px; padding: 0 6px; font-size: 11px; color: #05020f; background: var(--gold); cursor: help; flex-shrink: 0; }
.ln-row.high .hit { background: var(--danger); color: #fff; }

/* Agent */
.agent-pane { overflow-y: auto; padding: 16px 18px; gap: 14px; }
.idle { margin: auto; text-align: center; color: var(--text-dim); }
.idle .big { font-size: 56px; filter: drop-shadow(0 0 16px var(--accent)); }
.idle ol { display: inline-block; text-align: left; line-height: 2.1; font-size: 14px; }
.timeline { display: flex; flex-direction: column; gap: 8px; }
.step { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; font-size: 14px; line-height: 1.6; border-left: 2px solid var(--line); animation: in 0.3s ease-out; }
@keyframes in { from { opacity: 0; transform: translateX(10px); } }
.step.think { border-left-color: var(--accent-strong); background: rgba(255, 43, 214, 0.06); }
.step.tool { border-left-color: var(--accent); background: rgba(0, 240, 255, 0.06); }
.step.tool b { color: var(--accent); }
.step.tool code { margin-left: 6px; padding: 0 6px; font-family: var(--font-code); font-size: 12px; color: var(--gold); background: rgba(0, 0, 0, 0.4); }
.step.result { border-left-color: var(--ok); color: var(--text-dim); margin-left: 22px; }
.step.thinking { color: var(--text-faint); }
.icon { flex-shrink: 0; }
.spin { display: inline-block; animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.counts { display: flex; gap: 12px; font-size: 13px; color: var(--text-dim); }
.counts .high { color: var(--danger); }
.counts .mid { color: var(--gold); }
.counts .low, .counts .info { color: var(--accent); }
.error { color: var(--danger); }

.report { padding: 14px 16px; border: 1px solid var(--line-strong); background: rgba(0, 240, 255, 0.03); }
.r-title { font-size: 16px; color: #fff; margin-bottom: 8px; letter-spacing: 2px; }
.md { font-size: 14px; line-height: 1.8; }
.md :deep(h3) { margin: 14px 0 6px; font-size: 16px; color: var(--accent); }
.md :deep(h4) { margin: 12px 0 4px; font-size: 15px; color: #fff; }
.md :deep(li) { margin-left: 18px; }
.md :deep(strong) { color: var(--accent); }
.md :deep(code) { font-family: var(--font-code); color: var(--gold); }
.md :deep(pre) { padding: 10px 12px; overflow-x: auto; background: rgba(0, 0, 0, 0.5); border: 1px solid var(--line); font-size: 12px; }
.md :deep(pre code) { color: #e5f9ff; }
.related { margin-top: 16px; padding: 12px 14px; border: 1px dashed var(--line-strong); background: rgba(252, 238, 10, 0.03); }
.rel-title { margin-bottom: 6px; color: var(--gold); letter-spacing: 2px; font-size: 14px; }
.rel-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 4px 0; font-size: 13px; }
.rel-id { min-width: 150px; color: var(--text); }
.rel-row a { color: var(--accent); text-decoration: none; }
.rel-row a:hover { text-shadow: 0 0 8px var(--accent); }
.disclaimer { margin: 14px 0 0; font-size: 12px; color: var(--text-faint); }
.rate { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--text-dim); }
.rate button { padding: 2px 10px; cursor: pointer; background: none; border: 1px solid var(--line); border-radius: 999px; }
.rate button.on { background: var(--accent); border-color: var(--accent); }
/* ===== 审计记录 ===== */
.dup {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
  margin: 12px 12px 0; padding: 12px 14px; font-size: 13px; line-height: 1.6;
  border: 1px solid var(--gold); background: rgba(252, 238, 10, 0.06);
}
.dup b.high { color: var(--danger); } .dup b.mid { color: #ffb86b; } .dup b.low { color: var(--gold); }
.dup-actions { display: flex; gap: 8px; }
.saved-tip { margin: 12px 12px 0; font-size: 12px; color: var(--ok); }
.mask { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); }
.history {
  width: min(720px, 94vw); max-height: 80vh; overflow-y: auto; padding: 18px 20px;
  background: rgba(8, 4, 22, 0.98); border: 1px solid var(--line-strong); box-shadow: 0 0 40px rgba(0, 240, 255, 0.15);
}
.history header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; color: #fff; }
.h-tip { font-size: 12px; color: var(--text-faint); }
.close { margin-left: auto; border: none; background: none; color: var(--text-dim); font-size: 18px; cursor: pointer; }
.h-empty { padding: 30px 0; text-align: center; color: var(--text-dim); font-size: 14px; }
.h-row {
  display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer;
  border-bottom: 1px solid var(--line); transition: background 0.2s;
}
.h-row:hover { background: rgba(0, 240, 255, 0.06); }
.risk { flex-shrink: 0; font-size: 12px; padding: 2px 8px; border: 1px solid currentColor; }
.risk.high { color: var(--danger); } .risk.mid { color: #ffb86b; } .risk.low { color: var(--gold); } .risk.ok { color: var(--ok); }
.h-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-family: var(--font-code); }
.h-meta { flex-shrink: 0; font-size: 12px; color: var(--text-faint); }
.h-del { flex-shrink: 0; border: none; background: none; color: var(--text-faint); font-size: 12px; cursor: pointer; }
.h-del:hover { color: var(--danger); }

/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  /* 代码和报告上下排，各自能滚动 */
  .grid { grid-template-columns: 1fr; height: auto; }
  .grid > * { min-height: 360px; }
  .rel-id { min-width: 0; }
  .h-row { flex-wrap: wrap; }
  .h-meta { width: 100%; order: 3; }
}
</style>
