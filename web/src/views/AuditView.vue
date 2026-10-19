<script setup>
// AI 审计：粘贴一份合约，AI 审计 Agent 自己规划步骤、调用工具（规则扫描 / 查漏洞库 / 检索教材），最后写出审计报告
// 右边实时显示 Agent 的每一步：🧠 它在想什么、🔧 调用了哪个工具、📦 工具返回了什么——AI 的「思考过程」看得见
// 左边的代码会标出扫描到的问题行
import { ref, computed, nextTick } from 'vue'
import { useUserStore } from '../stores/user.js'
import { renderMarkdown } from '../utils/markdown.js'
import { levels } from '../data/levels.js'

const userStore = useUserStore()
const code = ref('')
const editing = ref(true)   // true 编辑代码 / false 查看审计结果（标出问题行）
const running = ref(false)
const steps = ref([])       // Agent 的每一步：{ type: 'think' | 'tool' | 'result', text, name, args }
const findings = ref([])    // 规则扫描找到的疑似问题
const report = ref('')
const error = ref('')
const logId = ref(null)
const rating = ref(null)
const viewerEl = ref(null)

// 工具的中文名：时间线上显示得更清楚
const TOOL_NAMES = { scan_contract: '规则扫描', lookup_swc: '查询 SWC 漏洞库', search_knowledge: '检索教材知识库' }

// 示例合约：直接用实战任务里的 5 份
function loadSample(e) {
  const lv = levels.find((l) => l.id === Number(e.target.value))
  if (lv) code.value = lv.code.join('\n')
  e.target.value = ''
  editing.value = true
}

async function audit() {
  if (!code.value.trim() || running.value) return
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
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop()
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
      }
    }
  } catch (err) {
    error.value = err.message
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

async function rate(r) {
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
          <button v-if="!editing" class="btn" @click="editing = true">✏️ 编辑代码</button>
          <span class="len">{{ code.length }} / 12000</span>
          <button class="btn primary" :disabled="running || !code.trim()" @click="audit">{{ running ? '审计中…' : '🔍 开始审计' }}</button>
        </div>
        <textarea v-if="editing" v-model="code" class="editor" spellcheck="false" maxlength="12000"
          placeholder="// 把要审计的合约粘贴到这里，或者从上面载入示例合约&#10;pragma solidity ^0.8.21;&#10;&#10;contract MyContract { ... }"></textarea>
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
        <div v-if="!steps.length && !running && !report && !error" class="idle">
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
                调用 <b>{{ TOOL_NAMES[s.name] || s.name }}</b>
                <code v-if="Object.keys(s.args || {}).length">{{ Object.values(s.args).join('，') }}</code>
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
          <p class="disclaimer">⚠️ AI 审计结果仅供学习参考，可能存在误报或漏报。真实项目上线前，请由专业审计团队复核。</p>
          <div v-if="logId" class="rate">
            这份报告有帮助吗？
            <button :class="{ on: rating === 'up' }" @click="rate('up')">👍</button>
            <button :class="{ on: rating === 'down' }" @click="rate('down')">👎</button>
          </div>
        </article>
      </section>
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
.bar { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.sample { padding: 7px 10px; font-size: 13px; color: var(--text); background: rgba(6, 4, 20, 0.85); border: 1px solid var(--line-strong); outline: none; cursor: pointer; }
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
.disclaimer { margin: 14px 0 0; font-size: 12px; color: var(--text-faint); }
.rate { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--text-dim); }
.rate button { padding: 2px 10px; cursor: pointer; background: none; border: 1px solid var(--line); border-radius: 999px; }
.rate button.on { background: var(--accent); border-color: var(--accent); }
</style>
