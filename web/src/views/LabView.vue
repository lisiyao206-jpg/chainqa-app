<script setup lang="ts">
// 链上实验场：亲手改合约代码 → 编译 → 部署到 FISCO BCOS 联盟链 → 攻击者轮番进攻 → 补墙再战
// 每一步都是链上真实发生的交易；全部攻击都挡住、正常业务也能用，才算通关
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'

interface Check { key: string; kind: 'business' | 'attack'; title: string; desc: string }
interface Lab {
  id: number; level: number; title: string; type: string; brief: string; starter: string; hints: string[]
  checks: Check[]; attempts: number; passed: boolean; passContract: string | null; passBlock: number | null; answerReady: boolean
}
interface Step { label: string; who: string; ok: boolean; tx?: string; block?: number; reason?: string }
interface CheckState { status: 'idle' | 'running' | 'pass' | 'fail'; text: string; fix?: string; address?: string; deployBlock?: number; steps: Step[] }

const userStore = useUserStore()
const route = useRoute()
const enabled = ref(true)
const labs = ref<Lab[]>([])
const upcoming = ref<{ level: number; title: string; type: string }[]>([])
const cur = ref<Lab | null>(null)
const code = ref('')
const error = ref('')

// ===== 加载题目 =====
onMounted(async () => {
  try {
    const r = await userStore.api<{ enabled: boolean; labs: Lab[]; upcoming: typeof upcoming.value }>('/api/lab')
    enabled.value = r.enabled
    labs.value = r.labs
    upcoming.value = r.upcoming
    const want = Number(route.query.lab) || r.labs[0]?.id
    select(r.labs.find((l) => l.id === want) || r.labs[0])
  } catch (err) {
    error.value = (err as Error).message
  }
})

const keyOf = (id: number) => `chainlab-code-${userStore.user?.userId}-${id}` // 每个人每道题的代码存在浏览器里
function select(l?: Lab) {
  if (!l) return
  cur.value = l
  code.value = localStorage.getItem(keyOf(l.id)) || l.starter
  hintShown.value = 0
  answer.value = ''
  resetRun()
}
watch(code, (v) => cur.value && localStorage.setItem(keyOf(cur.value.id), v))
function resetCode() {
  if (!confirm('恢复成最初的漏洞合约？你改过的代码会丢失。')) return
  code.value = cur.value!.starter
  resetRun()
}

// ===== 代码编辑器：左边行号，Tab 键缩进，编译出错的行标红 =====
const editor = ref<HTMLTextAreaElement | null>(null)
const gutter = ref<HTMLDivElement | null>(null)
const lineCount = computed(() => code.value.split('\n').length)
const errorLines = computed(() => new Set(compileErrors.value.map((e) => e.line).filter(Boolean)))
function syncScroll() {
  if (gutter.value && editor.value) gutter.value.scrollTop = editor.value.scrollTop
}
function onTab(e: KeyboardEvent) {
  const el = e.target as HTMLTextAreaElement
  const { selectionStart: s, selectionEnd: t } = el
  code.value = code.value.slice(0, s) + '    ' + code.value.slice(t)
  nextTick(() => (el.selectionStart = el.selectionEnd = s + 4))
}
function gotoLine(line: number | null) {
  if (!line || !editor.value) return
  const lines = code.value.split('\n')
  const pos = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
  editor.value.focus()
  editor.value.setSelectionRange(pos, pos + lines[line - 1].length)
  editor.value.scrollTop = (line - 5) * 21
}

// ===== 提示 / 参考答案 =====
const hintShown = ref(0)
const answer = ref('')
async function showAnswer() {
  try {
    answer.value = (await userStore.api<{ answer: string }>(`/api/lab/${cur.value!.id}/answer`)).answer
  } catch (err) {
    alert((err as Error).message)
  }
}
function useAnswer() {
  if (!confirm('用参考答案替换你现在的代码？')) return
  code.value = answer.value
}

// ===== 部署并攻击 =====
const running = ref(false)
const phase = ref<'idle' | 'compiling' | 'chain' | 'done'>('idle')
const compileErrors = ref<{ line: number | null; message: string }[]>([])
const chainInfo = ref<{ nodes: number; block: number; group: number } | null>(null)
const checks = ref<Record<string, CheckState>>({})
const result = ref<{ passed: boolean; attempts: number; passContract: string | null; passBlock: number | null } | null>(null)
const runError = ref('')

function resetRun() {
  phase.value = 'idle'
  compileErrors.value = []
  result.value = null
  runError.value = ''
  checks.value = Object.fromEntries((cur.value?.checks || []).map((c) => [c.key, { status: 'idle', text: '', steps: [] }]))
}

async function run() {
  if (running.value || !cur.value) return
  resetRun()
  running.value = true
  phase.value = 'compiling'
  try {
    const res = await fetch(`/api/lab/${cur.value.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userStore.token}` },
      body: JSON.stringify({ code: code.value }),
    })
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || '实验启动失败')
    // 后端用 SSE 一步步推送：compile → chain → deploy / step / check（每项检验）→ done
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()!
      for (const part of parts) {
        const ev = part.match(/^event: (\w+)/)?.[1]
        const data = JSON.parse(part.match(/\ndata: (.*)$/s)?.[1] || 'null')
        if (ev) onEvent(ev, data)
      }
    }
  } catch (err) {
    runError.value = (err as Error).message
  }
  running.value = false
}

function onEvent(ev: string, d: any) {
  if (ev === 'compile') {
    if (!d.ok) {
      compileErrors.value = d.errors
      phase.value = 'done'
    } else phase.value = 'chain'
  } else if (ev === 'chain') chainInfo.value = d
  else if (ev === 'deploy') {
    checks.value[d.check] = { status: 'running', text: '', address: d.address, deployBlock: d.block, steps: [] }
    chainInfo.value && (chainInfo.value.block = d.block)
  } else if (ev === 'step') {
    checks.value[d.check].steps.push(d)
    if (d.block && chainInfo.value) chainInfo.value.block = d.block
  } else if (ev === 'check') {
    Object.assign(checks.value[d.check], { status: d.pass ? 'pass' : 'fail', text: d.text, fix: d.fix })
  } else if (ev === 'done') {
    result.value = d
    phase.value = 'done'
    Object.assign(cur.value!, { attempts: d.attempts, passed: d.everPassed, answerReady: d.answerReady, passContract: d.passContract, passBlock: d.passBlock })
  } else if (ev === 'error') {
    runError.value = d
    phase.value = 'done'
  }
}

const brokenCount = computed(() => Object.values(checks.value).filter((c) => c.status === 'fail').length)
// 结果汇总：挡住了几种攻击、正常业务过没过、还差哪几项（每项附上「去哪里找问题」）
const summary = computed(() => {
  const list = cur.value?.checks || []
  const attacks = list.filter((c) => c.kind === 'attack')
  const blocked = attacks.filter((c) => checks.value[c.key]?.status === 'pass').length
  const business = list.find((c) => c.kind === 'business')
  return {
    blocked, totalAttacks: attacks.length,
    businessOk: !business || checks.value[business.key]?.status === 'pass',
    missing: list.filter((c) => checks.value[c.key]?.status === 'fail').map((c) => ({ title: c.title, kind: c.kind, fix: checks.value[c.key].fix || checks.value[c.key].text })),
  }
})
const short = (h?: string) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '')
const WHO: Record<string, string> = { admin: '管理员', attacker: '攻击者' }
</script>

<template>
  <div class="lab-page">
    <header class="head">
      <div>
        <div class="eyebrow">On-chain Lab</div>
        <h2>链上实验场</h2>
        <p>亲手修复漏洞合约，部署到真实的 FISCO BCOS 联盟链上，让攻击者来试试你的安全墙。</p>
      </div>
      <div :class="['chain-chip', { off: !enabled }]">
        <template v-if="!enabled">⛓ 区块链未连接</template>
        <template v-else-if="chainInfo">⛓ FISCO BCOS · 群组 {{ chainInfo.group }} · {{ chainInfo.nodes }} 个节点 · 区块高度 <b>#{{ chainInfo.block }}</b></template>
        <template v-else>⛓ FISCO BCOS 联盟链 · 已连接</template>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!enabled" class="off-tip">后端还没有连接区块链（.env 里没有配置 WEBASE_URL），可以先阅读题目、修改代码，连接后就能部署上链。</p>

    <div class="layout">
      <!-- 左：题目列表 -->
      <aside class="list glass">
        <button v-for="l in labs" :key="l.id" :class="['item', { on: cur?.id === l.id }]" @click="select(l)">
          <span class="i-no">{{ String(l.level).padStart(2, '0') }}</span>
          <span class="i-main"><b>{{ l.title }}</b><em>{{ l.type }}</em></span>
          <span :class="['i-state', { ok: l.passed }]">{{ l.passed ? '✓' : '' }}</span>
        </button>
        <div v-for="u in upcoming" :key="u.level" class="item soon">
          <span class="i-no">{{ String(u.level).padStart(2, '0') }}</span>
          <span class="i-main"><b>{{ u.title }}</b><em>{{ u.type }} · 即将开放</em></span>
        </div>
      </aside>

      <template v-if="cur">
        <!-- 中：题目 + 代码编辑器 -->
        <section class="work glass">
          <div class="brief">
            <h3>{{ cur.title }} <span class="type">{{ cur.type }}</span></h3>
            <p>{{ cur.brief }}</p>
          </div>

          <div class="editor">
            <div ref="gutter" class="gutter">
              <div v-for="n in lineCount" :key="n" :class="{ bad: errorLines.has(n) }">{{ n }}</div>
            </div>
            <textarea
              ref="editor" v-model="code" spellcheck="false" autocapitalize="off" autocomplete="off"
              @scroll="syncScroll" @keydown.tab.prevent="onTab"
            ></textarea>
          </div>

          <div v-if="compileErrors.length" class="errors">
            <b>✗ 编译失败</b>
            <button v-for="(e, i) in compileErrors" :key="i" class="err" @click="gotoLine(e.line)">
              <span v-if="e.line">第 {{ e.line }} 行</span>{{ e.message }}
            </button>
          </div>

          <div class="actions">
            <button class="btn primary" :disabled="running || !enabled" @click="run">
              {{ running ? (phase === 'compiling' ? '编译中…' : '链上攻防进行中…') : '⛓ 部署上链并接受攻击' }}
            </button>
            <button class="btn" :disabled="hintShown >= cur.hints.length" @click="hintShown++">💡 提示 {{ hintShown }}/{{ cur.hints.length }}</button>
            <button class="btn" :disabled="running" @click="resetCode">↺ 重置代码</button>
            <button class="btn" :disabled="!cur.answerReady" :title="cur.answerReady ? '' : '上链失败 3 次后可以查看'" @click="showAnswer">
              📖 参考答案{{ cur.answerReady ? '' : `（还差 ${Math.max(0, 3 - cur.attempts)} 次）` }}
            </button>
            <span class="attempts">已上链 {{ cur.attempts }} 次</span>
          </div>

          <ol v-if="hintShown" class="hints">
            <li v-for="h in cur.hints.slice(0, hintShown)" :key="h">{{ h }}</li>
          </ol>
          <div v-if="answer" class="answer">
            <div class="a-head"><b>参考答案</b><button class="link" @click="useAnswer">用它替换我的代码</button><button class="link" @click="answer = ''">收起</button></div>
            <pre>{{ answer }}</pre>
          </div>
        </section>

        <!-- 右：安全墙检验 -->
        <section class="walls glass">
          <h4>安全墙检验</h4>
          <p class="w-tip">每一项都会把你的合约重新部署一次，再由管理员或攻击者发交易，结果写在链上。</p>
          <div v-for="c in cur.checks" :key="c.key" :class="['wall', c.kind, checks[c.key]?.status]">
            <div class="w-head">
              <span class="w-icon">{{ c.kind === 'business' ? '🏦' : '⚔️' }}</span>
              <span class="w-title">
                <b>{{ c.kind === 'business' ? '' : '攻击：' }}{{ c.title }}</b>
                <em>{{ c.desc }}</em>
              </span>
              <span class="w-state">
                {{ { idle: '待检验', running: '进行中…', pass: c.kind === 'business' ? '✓ 正常' : '✓ 挡住', fail: c.kind === 'business' ? '✗ 被锁死' : '✗ 被突破' }[checks[c.key]?.status || 'idle'] }}
              </span>
            </div>
            <div v-if="checks[c.key]?.address" class="w-log">
              <div class="log">部署合约 → <code>{{ short(checks[c.key].address) }}</code> · 区块 #{{ checks[c.key].deployBlock }}</div>
              <div v-for="(s, i) in checks[c.key].steps" :key="i" :class="['log', { rej: !s.ok }]">
                {{ s.label }} → {{ s.ok ? '交易成功' : `交易被拒绝（${s.reason}）` }}
                <span v-if="s.tx" class="tx">交易 <code>{{ short(s.tx) }}</code> · 区块 #{{ s.block }}</span>
              </div>
              <div v-if="checks[c.key].text" class="verdict">{{ checks[c.key].text }}</div>
            </div>
          </div>

          <div v-if="result" :class="['result', { win: result.passed }]">
            <template v-if="result.passed">
              <b>🎉 安全墙建成！所有攻击都被挡住，正常业务也畅通无阻</b>
              <span>通关合约已部署在链上：<code>{{ short(result.passContract || '') }}</code> · 区块 #{{ result.passBlock }}</span>
            </template>
            <template v-else>
              <b>已挡住 {{ summary.blocked }}/{{ summary.totalAttacks }} 种攻击<template v-if="!summary.businessOk">，正常业务也没通过</template>，还差 {{ brokenCount }} 项：</b>
              <ul class="missing">
                <li v-for="m in summary.missing" :key="m.title">
                  <em :class="m.kind">{{ m.kind === 'attack' ? '攻击' : '业务' }}</em><b>{{ m.title }}</b>：{{ m.fix }}
                </li>
              </ul>
              <span>改好代码后再部署一次；还是想不出来，可以点「提示」。</span>
            </template>
          </div>
          <p v-if="runError" class="error">✗ {{ runError }}</p>
          <p v-if="cur.passed && !result" class="passed-note">✓ 你已经通关过这道题（合约 <code>{{ short(cur.passContract || '') }}</code> · 区块 #{{ cur.passBlock }}），可以继续改进代码再试。</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lab-page { max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.glass { background: var(--glass-strong); border: 1px solid var(--line); }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
.head h2 { margin: 4px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.chain-chip { flex-shrink: 0; padding: 7px 14px; font-size: 13px; color: var(--ok); border: 1px solid rgba(142, 230, 196, 0.5); background: rgba(142, 230, 196, 0.06); }
.chain-chip b { font-family: var(--font-code); font-weight: 400; color: #fff; }
.chain-chip.off { color: var(--gold); border-color: rgba(252, 238, 10, 0.4); background: none; }
.off-tip { margin: 0; font-size: 13px; color: var(--gold); }
.error { margin: 0; color: var(--danger); font-size: 14px; }

.layout { display: grid; grid-template-columns: 210px minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: start; }

/* 左：题目列表 */
.list { padding: 8px 0; }
.item {
  width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 14px; text-align: left; cursor: pointer;
  color: var(--text); background: none; border: none; border-left: 2px solid transparent; font-family: var(--font);
}
.item.on { border-left-color: var(--accent); background: rgba(0, 240, 255, 0.08); }
.item.soon { cursor: default; opacity: 0.4; }
.i-no { font-family: var(--font-code); font-size: 13px; color: var(--accent); }
.i-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.i-main b { font-size: 13px; font-weight: 400; color: #fff; }
.i-main em { font-style: normal; font-size: 11px; color: var(--text-faint); }
.i-state.ok { color: var(--ok); }

/* 中：题目 + 编辑器 */
.work { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.brief h3 { margin: 0 0 6px; font-size: 19px; font-weight: 400; letter-spacing: 2px; color: #fff; }
.type { margin-left: 6px; padding: 1px 8px; font-size: 12px; color: var(--accent); border: 1px solid var(--line-strong); vertical-align: middle; }
.brief p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.editor { display: flex; height: 470px; border: 1px solid var(--line-strong); background: rgba(0, 0, 0, 0.45); }
.gutter {
  flex-shrink: 0; width: 40px; padding: 10px 0; overflow: hidden; text-align: right; user-select: none;
  font-family: var(--font-code); font-size: 13px; line-height: 21px; color: var(--text-faint); border-right: 1px solid var(--line);
}
.gutter div { padding-right: 8px; }
.gutter div.bad { color: #fff; background: rgba(255, 107, 129, 0.5); }
.editor textarea {
  flex: 1; min-width: 0; padding: 10px 12px; resize: none; outline: none; border: none; white-space: pre; overflow: auto;
  font-family: var(--font-code); font-size: 13px; line-height: 21px; color: #e8f6ff; background: transparent; tab-size: 4;
}
.errors { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--danger); background: rgba(40, 6, 18, 0.6); }
.errors b { color: var(--danger); font-size: 14px; }
.err { text-align: left; cursor: pointer; background: none; border: none; padding: 0; font-family: var(--font-code); font-size: 13px; color: #ffd0d8; }
.err span { margin-right: 8px; color: var(--gold); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.attempts { margin-left: auto; font-size: 12px; color: var(--text-faint); }
.hints { margin: 0; padding: 10px 12px 10px 30px; font-size: 13px; line-height: 1.8; color: var(--gold); background: rgba(252, 238, 10, 0.05); border: 1px solid rgba(252, 238, 10, 0.25); }
.answer { border: 1px solid var(--line-strong); }
.a-head { display: flex; gap: 14px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.a-head b { flex: 1; font-size: 14px; color: #fff; }
.answer pre { margin: 0; padding: 10px 12px; max-height: 300px; overflow: auto; font-family: var(--font-code); font-size: 12px; line-height: 1.6; color: var(--ok); }
.link { padding: 0; cursor: pointer; background: none; border: none; font-family: var(--font); font-size: 13px; color: var(--accent); }

/* 右：安全墙 */
.walls { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.walls h4 { margin: 0; font-size: 16px; font-weight: 500; letter-spacing: 2px; color: #fff; }
.w-tip { margin: 0 0 4px; font-size: 12px; color: var(--text-faint); }
.wall { padding: 11px 13px; border: 1px solid var(--line); border-left: 3px solid var(--line-strong); transition: all 0.3s; }
.wall.running { border-left-color: var(--gold); box-shadow: 0 0 14px rgba(252, 238, 10, 0.15); }
.wall.pass { border-left-color: var(--ok); }
.wall.fail { border-left-color: var(--danger); background: rgba(255, 107, 129, 0.05); }
.w-head { display: flex; align-items: center; gap: 10px; }
.w-icon { font-size: 18px; }
.w-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.w-title b { font-size: 14px; font-weight: 500; color: #fff; }
.w-title em { font-style: normal; font-size: 12px; color: var(--text-faint); }
.w-state { flex-shrink: 0; font-size: 13px; color: var(--text-faint); }
.wall.running .w-state { color: var(--gold); }
.wall.pass .w-state { color: var(--ok); }
.wall.fail .w-state { color: var(--danger); }
.w-log { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 4px; }
.log { font-size: 12px; line-height: 1.6; color: var(--text-dim); }
.log.rej { color: #ffb3c0; }
.log code, .result code, .passed-note code { font-family: var(--font-code); color: var(--accent); }
.tx { margin-left: 6px; color: var(--text-faint); }
.verdict { margin-top: 2px; font-size: 13px; color: #fff; }
.wall.fail .verdict { color: var(--danger); }
.wall.pass .verdict { color: var(--ok); }
.result { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--danger); background: rgba(40, 6, 18, 0.6); }
.result b { font-size: 15px; color: #ffd0d8; }
.result span { font-size: 13px; color: var(--text-dim); }
.result.win { border-color: var(--ok); background: rgba(10, 40, 30, 0.6); }
.missing { margin: 4px 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.7; color: var(--text); }
.missing li b { color: #fff; font-size: 13px; }
.missing em { margin-right: 6px; padding: 0 6px; font-style: normal; font-size: 11px; color: var(--danger); border: 1px solid var(--danger); }
.missing em.business { color: var(--gold); border-color: var(--gold); }
.result.win b { color: var(--ok); }
.passed-note { margin: 0; font-size: 12px; color: var(--ok); }

@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
  .list { display: flex; overflow-x: auto; padding: 0; }
  .item { width: auto; flex-shrink: 0; border-left: none; border-bottom: 2px solid transparent; }
  .item.on { border-bottom-color: var(--accent); }
  .head { flex-direction: column; align-items: flex-start; }
  .editor { height: 380px; }
}
</style>
