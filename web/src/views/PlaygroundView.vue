<script setup lang="ts">
// 合约练习场：写一个合约 → 编译 → 部署到我们自己的 FISCO BCOS 联盟链 → 调用它的函数
// 代替国外的 Remix 在线编辑器（国内经常打不开）；从教材点进来时，会自动带上那一讲的示例代码
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'

interface AbiParam { name: string; type: string }
interface AbiItem { type: string; name?: string; inputs?: AbiParam[]; outputs?: AbiParam[]; stateMutability?: string; constant?: boolean }
interface Deployed { name: string; address: string; block: number; abi: AbiItem[]; time: string }
interface FnState { inputs: string[]; busy: boolean; result: string; ok: boolean | null; tx?: string; block?: number }

const userStore = useUserStore()
const route = useRoute()
const KEY = () => `playground-${userStore.user?.userId}`

const DEFAULT = `// SPDX-License-Identifier: MIT
pragma solidity >=0.4.24 <0.7.0;

// 一个最简单的合约：存一个数字，再把它读出来
// 点「编译」→「部署到链上」，然后在右边调用 set 和 get 试试
contract SimpleStorage {
    uint256 public number;

    function set(uint256 n) public {
        number = n;
    }

    function get() public view returns (uint256) {
        return number;
    }
}
`

const code = ref('')
const changes = ref<string[]>([])
const errors = ref<{ line: number | null; message: string }[]>([])
const contracts = ref<{ name: string; abi: AbiItem[] }[]>([])
const picked = ref('')
const ctorArgs = ref<string[]>([])
const deployed = ref<Deployed[]>([])
const fnState = ref<Record<string, FnState>>({})
const status = ref('')
const busy = ref(false)
const fromChapter = ref('')

onMounted(async () => {
  const saved = JSON.parse(localStorage.getItem(KEY()) || '{}')
  deployed.value = saved.deployed || []
  const ch = route.query.chapter as string
  if (ch) {
    try {
      const r = await userStore.api<{ code: string; changes: string[] }>(`/api/playground/sample?chapter=${encodeURIComponent(ch)}`)
      code.value = r.code
      changes.value = r.changes
      fromChapter.value = ch
      return
    } catch (err) {
      status.value = (err as Error).message
    }
  }
  code.value = saved.code || DEFAULT
})
watch([code, deployed], () => localStorage.setItem(KEY(), JSON.stringify({ code: code.value, deployed: deployed.value })), { deep: true })

// ===== 编辑器：行号 + Tab 缩进 + 出错行标红 =====
const editor = ref<HTMLTextAreaElement | null>(null)
const gutter = ref<HTMLDivElement | null>(null)
const lineCount = computed(() => code.value.split('\n').length)
const errorLines = computed(() => new Set(errors.value.map((e) => e.line).filter(Boolean)))
const syncScroll = () => gutter.value && editor.value && (gutter.value.scrollTop = editor.value.scrollTop)
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

// ===== 编译 =====
const ctorOf = (abi: AbiItem[]) => abi.find((x) => x.type === 'constructor')?.inputs || []
const pickedAbi = computed(() => contracts.value.find((c) => c.name === picked.value)?.abi || [])
async function compile() {
  busy.value = true
  status.value = '编译中…'
  errors.value = []
  try {
    const r = await userStore.api<any>('/api/playground/compile', { code: code.value })
    changes.value = r.changes
    if (r.changes.length) code.value = r.code // 自动转换过写法：把转换后的代码放回编辑器，学生能看到改了哪里
    if (!r.ok) {
      errors.value = r.errors
      contracts.value = []
      status.value = ''
    } else {
      contracts.value = r.contracts
      if (!contracts.value.some((c) => c.name === picked.value)) picked.value = contracts.value[contracts.value.length - 1].name
      ctorArgs.value = ctorOf(pickedAbi.value).map(() => '')
      status.value = `✓ 编译成功，可以部署：${r.contracts.map((c: any) => c.name).join('、')}`
    }
  } catch (err) {
    status.value = '✗ ' + (err as Error).message
  }
  busy.value = false
}
watch(picked, () => (ctorArgs.value = ctorOf(pickedAbi.value).map(() => '')))

// ===== 部署 =====
async function deploy() {
  busy.value = true
  status.value = '正在部署到 FISCO BCOS 联盟链…'
  try {
    const r = await userStore.api<any>('/api/playground/deploy', { code: code.value, contract: picked.value, params: ctorArgs.value })
    deployed.value.unshift({ name: r.name, address: r.address, block: r.block, abi: r.abi, time: new Date().toLocaleTimeString() })
    deployed.value = deployed.value.slice(0, 8) // 只保留最近 8 个
    status.value = `✓ 已部署到区块 #${r.block}`
  } catch (err) {
    status.value = '✗ ' + (err as Error).message
  }
  busy.value = false
}

// ===== 调用函数 =====
const fns = (d: Deployed) => d.abi.filter((x) => x.type === 'function')
const isRead = (f: AbiItem) => f.stateMutability === 'view' || f.stateMutability === 'pure' || !!f.constant
const keyOf = (d: Deployed, f: AbiItem) => `${d.address}:${f.name}(${(f.inputs || []).map((i) => i.type).join(',')})`
// 每个函数的输入框和调用结果：合约列表一变就补齐（不在模板渲染时创建，避免渲染中修改数据）
watch(deployed, (list) => {
  for (const d of list)
    for (const f of fns(d)) fnState.value[keyOf(d, f)] ||= { inputs: (f.inputs || []).map(() => ''), busy: false, result: '', ok: null }
}, { deep: true, immediate: true })
const st = (d: Deployed, f: AbiItem) => fnState.value[keyOf(d, f)]
async function invoke(d: Deployed, f: AbiItem) {
  const s = st(d, f)
  s.busy = true
  s.result = ''
  try {
    const r = await userStore.api<any>('/api/playground/invoke', { address: d.address, name: d.name, abi: d.abi, fn: f.name, params: s.inputs })
    if (r.kind === 'call') {
      s.ok = true
      s.result = r.result.map((v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') || '（无返回值）'
      s.tx = undefined
    } else {
      s.ok = r.ok
      s.result = r.ok ? '交易成功' : `交易被拒绝：${r.reason}`
      s.tx = r.tx
      s.block = r.block
    }
  } catch (err) {
    s.ok = false
    s.result = (err as Error).message
  }
  s.busy = false
}
function removeDeployed(i: number) {
  deployed.value.splice(i, 1)
}
const short = (h?: string) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '')
</script>

<template>
  <div class="pg-page">
    <header class="head">
      <div>
        <div class="eyebrow">Contract Playground</div>
        <h2>合约练习场</h2>
        <p>写一个合约，部署到我们自己的 FISCO BCOS 联盟链上，再调用它的函数。不需要访问国外网站。</p>
      </div>
    </header>

    <div class="layout">
      <!-- 左：编辑器 -->
      <section class="work glass">
        <div v-if="fromChapter" class="from">📖 已载入教材 {{ fromChapter }} 的示例代码</div>
        <div v-if="changes.length" class="changes">
          <b>为了在 FISCO BCOS v2 上运行，自动调整了写法：</b>
          <span v-for="c in changes" :key="c">· {{ c }}</span>
          <em>FISCO BCOS v2 支持 Solidity 0.4.25～0.6.10；教材按 0.8 写，大部分基础语法两个版本是一样的。</em>
        </div>
        <div class="editor">
          <div ref="gutter" class="gutter"><div v-for="n in lineCount" :key="n" :class="{ bad: errorLines.has(n) }">{{ n }}</div></div>
          <textarea ref="editor" v-model="code" spellcheck="false" autocapitalize="off" autocomplete="off" @scroll="syncScroll" @keydown.tab.prevent="onTab"></textarea>
        </div>
        <div v-if="errors.length" class="errors">
          <b>✗ 编译失败</b>
          <button v-for="(e, i) in errors" :key="i" class="err" @click="gotoLine(e.line)"><span v-if="e.line">第 {{ e.line }} 行</span>{{ e.message }}</button>
        </div>
        <div class="toolbar">
          <button class="btn" :disabled="busy" @click="compile">⚙ 编译</button>
          <template v-if="contracts.length">
            <select v-model="picked" class="input pick">
              <option v-for="c in contracts" :key="c.name" :value="c.name">{{ c.name }}</option>
            </select>
            <input v-for="(p, i) in ctorOf(pickedAbi)" :key="i" v-model="ctorArgs[i]" class="input arg" :placeholder="`${p.type} ${p.name}`" />
            <button class="btn primary" :disabled="busy" @click="deploy">⛓ 部署到链上</button>
          </template>
        </div>
        <p v-if="status" :class="['status', { bad: status.startsWith('✗') }]">{{ status }}</p>
      </section>

      <!-- 右：已部署的合约 -->
      <section class="side glass">
        <h4>已部署的合约</h4>
        <p v-if="!deployed.length" class="empty">编译、部署之后，合约会出现在这里，可以直接调用它的函数。</p>
        <div v-for="(d, i) in deployed" :key="d.address" class="contract">
          <div class="c-head">
            <b>{{ d.name }}</b>
            <span class="meta"><code>{{ short(d.address) }}</code> · 区块 #{{ d.block }} · {{ d.time }}</span>
            <button class="link" title="从列表里移除" @click="removeDeployed(i)">✕</button>
          </div>
          <div v-for="f in fns(d)" :key="keyOf(d, f)" class="fn">
            <div class="fn-row">
              <button :class="['fn-btn', isRead(f) ? 'read' : 'write']" :disabled="st(d, f).busy" @click="invoke(d, f)">
                {{ st(d, f).busy ? '…' : f.name }}
              </button>
              <input v-for="(p, j) in f.inputs" :key="j" v-model="st(d, f).inputs[j]" class="input arg" :placeholder="`${p.type} ${p.name}`" />
              <span class="kind">{{ isRead(f) ? '读取' : '发交易' }}</span>
            </div>
            <div v-if="st(d, f).result" :class="['result', { bad: st(d, f).ok === false }]">
              → {{ st(d, f).result }}
              <span v-if="st(d, f).tx" class="tx">交易 <code>{{ short(st(d, f).tx) }}</code> · 区块 #{{ st(d, f).block }}</span>
            </div>
          </div>
        </div>
        <p class="note">蓝色按钮是只读函数（不上链、不花时间），橙色按钮会发一笔交易写到链上。联盟链没有以太币，带 payable 的函数只能不带金额调用。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pg-page { max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.glass { background: var(--glass-strong); border: 1px solid var(--line); }
.head h2 { margin: 4px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.work, .side { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.from { font-size: 13px; color: var(--accent); }
.changes { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; font-size: 13px; color: var(--gold); background: rgba(252, 238, 10, 0.05); border: 1px solid rgba(252, 238, 10, 0.3); }
.changes b { font-weight: 500; }
.changes em { font-style: normal; font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.editor { display: flex; height: 460px; border: 1px solid var(--line-strong); background: rgba(0, 0, 0, 0.45); }
.gutter { flex-shrink: 0; width: 40px; padding: 10px 0; overflow: hidden; text-align: right; user-select: none; font-family: var(--font-code); font-size: 13px; line-height: 21px; color: var(--text-faint); border-right: 1px solid var(--line); }
.gutter div { padding-right: 8px; }
.gutter div.bad { color: #fff; background: rgba(255, 107, 129, 0.5); }
.editor textarea { flex: 1; min-width: 0; padding: 10px 12px; resize: none; outline: none; border: none; white-space: pre; overflow: auto; font-family: var(--font-code); font-size: 13px; line-height: 21px; color: #e8f6ff; background: transparent; tab-size: 4; }
.errors { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--danger); background: rgba(40, 6, 18, 0.6); }
.errors b { color: var(--danger); font-size: 14px; }
.err { text-align: left; cursor: pointer; background: none; border: none; padding: 0; font-family: var(--font-code); font-size: 13px; color: #ffd0d8; }
.err span { margin-right: 8px; color: var(--gold); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.pick { width: auto; min-width: 140px; background: rgba(0, 0, 0, 0.3); color: var(--text); }
.arg { width: 150px; padding: 6px 4px; font-family: var(--font-code); font-size: 12px; }
.status { margin: 0; font-size: 13px; color: var(--ok); }
.status.bad { color: var(--danger); }
.side h4 { margin: 0; font-size: 16px; font-weight: 500; letter-spacing: 2px; color: #fff; }
.empty, .note { margin: 0; font-size: 12px; line-height: 1.7; color: var(--text-faint); }
.contract { padding: 12px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.c-head { display: flex; align-items: baseline; gap: 10px; }
.c-head b { font-size: 15px; font-weight: 500; color: #fff; }
.meta { flex: 1; font-size: 12px; color: var(--text-faint); }
.meta code, .tx code { font-family: var(--font-code); color: var(--accent); }
.fn-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fn-btn { min-width: 90px; padding: 5px 12px; cursor: pointer; font-family: var(--font-code); font-size: 13px; color: #fff; border: 1px solid; background: none; }
.fn-btn.read { border-color: rgba(0, 240, 255, 0.6); background: rgba(0, 240, 255, 0.08); }
.fn-btn.write { border-color: rgba(255, 165, 82, 0.7); background: rgba(255, 165, 82, 0.1); }
.kind { font-size: 11px; color: var(--text-faint); }
.result { margin-top: 4px; font-family: var(--font-code); font-size: 12px; color: var(--ok); word-break: break-all; }
.result.bad { color: var(--danger); }
.tx { margin-left: 8px; color: var(--text-faint); }
.link { padding: 0; cursor: pointer; background: none; border: none; color: var(--text-faint); }
@media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } .editor { height: 360px; } }
</style>
