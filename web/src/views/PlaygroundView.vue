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
pragma solidity ^0.8.0;

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
const compiler = ref('')
const sampleNote = ref('')
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
      const r = await userStore.api<{ code: string; files?: number; entry?: string }>(`/api/playground/sample?chapter=${encodeURIComponent(ch)}`)
      code.value = r.code
      if (r.files && r.files > 1) sampleNote.value = `这一讲有 ${r.files} 个合约文件，已合并成一个（主文件 ${r.entry}）`
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
    compiler.value = r.compiler || ''
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

// ===== 右侧合约卡片：分成「状态 / 查询 / 交易」三组，可以折叠 =====
// 状态：不用填参数的只读函数（常量、公开变量），排成一张表，可以一键全部读取
// 查询：要填参数的只读函数；交易：会写到链上的函数
const groupsOf = (d: Deployed) => {
  const all = fns(d)
  return {
    state: all.filter((f) => isRead(f) && !(f.inputs || []).length),
    query: all.filter((f) => isRead(f) && (f.inputs || []).length),
    write: all.filter((f) => !isRead(f)),
  }
}
const collapsed = ref<Set<string>>(new Set()) // 折叠起来的合约地址；新部署的默认展开
const toggle = (a: string) => (collapsed.value.has(a) ? collapsed.value.delete(a) : collapsed.value.add(a))
watch(() => deployed.value.map((d) => d.address), (list, old) => {
  // 新部署了一个合约：它展开，其余的折叠起来，避免右边太长
  if (old && list.length && list[0] !== old[0]) collapsed.value = new Set(list.slice(1))
})
const filter = ref<Record<string, string>>({}) // 每个合约的函数搜索框
const match = (d: Deployed, f: AbiItem) => !filter.value[d.address] || f.name!.toLowerCase().includes(filter.value[d.address].toLowerCase())
async function readAll(d: Deployed) {
  for (const f of groupsOf(d).state) await invoke(d, f)
}
const copied = ref('')
async function copy(text: string) {
  await navigator.clipboard?.writeText(text)
  copied.value = text
  setTimeout(() => copied.value === text && (copied.value = ''), 1500)
}
const sameName = (d: Deployed, f: AbiItem) => fns(d).filter((x) => x.name === f.name).length > 1 // 同名函数（重载）：标出参数个数区分
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
        <div v-if="sampleNote || compiler" class="changes">
          <span v-if="sampleNote">· {{ sampleNote }}</span>
          <span v-if="compiler">· 编译器：{{ compiler }}</span>
          <em>支持 Solidity 0.8（教材版本）和 0.4.25～0.6.10；可以 import OpenZeppelin 库和教材其他章节的合约。</em>
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
        <div class="side-body">
        <p v-if="!deployed.length" class="empty">编译、部署之后，合约会出现在这里，可以直接调用它的函数。</p>
        <div v-for="(d, i) in deployed" :key="d.address" :class="['contract', { shut: collapsed.has(d.address) }]">
          <div class="c-head" @click="toggle(d.address)">
            <span class="caret">{{ collapsed.has(d.address) ? '▸' : '▾' }}</span>
            <b>{{ d.name }}</b>
            <span class="meta">区块 #{{ d.block }} · {{ d.time }}</span>
            <button class="link" title="从列表里移除" @click.stop="removeDeployed(i)">✕</button>
          </div>
          <template v-if="!collapsed.has(d.address)">
            <div class="addr">
              <span>合约地址</span>
              <code>{{ d.address }}</code>
              <button class="mini" @click="copy(d.address)">{{ copied === d.address ? '已复制' : '复制' }}</button>
            </div>
            <input v-if="fns(d).length > 10" v-model="filter[d.address]" class="input search" placeholder="🔍 搜索函数名" />

            <!-- 状态：一张表 -->
            <div v-if="groupsOf(d).state.some((f) => match(d, f))" class="group">
              <div class="g-head"><span class="dot read"></span>状态 <em>不用填参数，读取不上链</em>
                <button class="mini" @click="readAll(d)">全部读取</button>
              </div>
              <div class="kv">
                <template v-for="f in groupsOf(d).state" :key="keyOf(d, f)">
                  <button v-if="match(d, f)" class="k" :disabled="st(d, f).busy" @click="invoke(d, f)">{{ f.name }}</button>
                  <span v-if="match(d, f)" :class="['v', { bad: st(d, f).ok === false, wait: !st(d, f).result }]">
                    {{ st(d, f).busy ? '读取中…' : st(d, f).result || '点左边读取' }}
                  </span>
                </template>
              </div>
            </div>

            <!-- 查询和交易：每个函数一张小卡片 -->
            <template v-for="g in (['query', 'write'] as const)" :key="g">
              <div v-if="groupsOf(d)[g].some((f) => match(d, f))" class="group">
                <div class="g-head"><span :class="['dot', g === 'query' ? 'read' : 'write']"></span>{{ g === 'query' ? '查询' : '交易' }}
                  <em>{{ g === 'query' ? '填好参数后读取，不上链' : '会发一笔交易写到链上' }}</em>
                </div>
                <template v-for="f in groupsOf(d)[g]" :key="keyOf(d, f)">
                  <div v-if="match(d, f)" :class="['fn', g]">
                    <div class="fn-top">
                      <code class="fn-name">{{ f.name }}<small v-if="sameName(d, f)">（{{ (f.inputs || []).length }} 个参数）</small></code>
                      <span v-if="f.stateMutability === 'payable'" class="tag">payable</span>
                      <button :class="['fn-btn', g === 'query' ? 'read' : 'write']" :disabled="st(d, f).busy" @click="invoke(d, f)">
                        {{ st(d, f).busy ? '…' : g === 'query' ? '读取' : '发送交易' }}
                      </button>
                    </div>
                    <div v-if="(f.inputs || []).length" class="params">
                      <label v-for="(p, j) in f.inputs" :key="j">
                        <span>{{ p.name || `参数 ${j + 1}` }} <i>{{ p.type }}</i></span>
                        <input v-model="st(d, f).inputs[j]" class="input" :placeholder="p.type" />
                      </label>
                    </div>
                    <div v-if="st(d, f).result" :class="['result', { bad: st(d, f).ok === false }]">
                      {{ st(d, f).result }}
                      <span v-if="st(d, f).tx" class="tx">交易 <code>{{ short(st(d, f).tx) }}</code> · 区块 #{{ st(d, f).block }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </template>
        </div>
        </div>
        <p class="note">蓝色是只读函数（不上链、不花时间），橙色会发一笔交易写到链上。联盟链没有以太币，带 payable 的函数只能不带金额调用。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pg-page { max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.glass { background: var(--glass-strong); border: 1px solid var(--line); }
.head h2 { margin: 4px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
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
/* 右边和左边一样高：右边不参与撑高（contain: size），内容多了在 side-body 里滚动 */
.side { contain: size; }
.side-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 6px; }
.side-body::-webkit-scrollbar { width: 6px; }
.side-body::-webkit-scrollbar-thumb { background: rgba(0, 240, 255, 0.35); }
.side-body::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.04); }
.contract { flex-shrink: 0; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.2); }
.contract > *:not(.c-head) { margin: 0 12px 12px; }
.c-head { display: flex; align-items: baseline; gap: 10px; padding: 10px 12px; cursor: pointer; user-select: none; }
.c-head:hover { background: rgba(0, 240, 255, 0.04); }
.contract:not(.shut) .c-head { border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.caret { width: 10px; font-size: 11px; color: var(--text-faint); }
.c-head b { font-size: 15px; font-weight: 500; color: #fff; }
.meta { flex: 1; font-size: 12px; color: var(--text-faint); }
.addr { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-faint); }
.addr code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-code); color: var(--accent); }
.mini { margin-left: auto; padding: 2px 10px; cursor: pointer; font-size: 12px; color: var(--text-dim); background: none; border: 1px solid var(--line-strong); }
.mini:hover { color: #fff; border-color: var(--accent); }
.search { width: auto; box-sizing: border-box; padding: 6px 8px; font-size: 13px; }
.group { display: flex; flex-direction: column; gap: 8px; }
.g-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #fff; letter-spacing: 1px; }
.g-head em { font-style: normal; font-size: 11px; letter-spacing: 0; color: var(--text-faint); }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dot.read { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
.dot.write { background: #ffa552; box-shadow: 0 0 6px #ffa552; }
.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); border: 1px solid var(--line); }
.kv > * { padding: 6px 10px; border-bottom: 1px solid var(--line); font-family: var(--font-code); font-size: 12px; }
.kv > *:nth-last-child(-n + 2) { border-bottom: none; }
.k { text-align: left; cursor: pointer; color: #cfefff; background: rgba(0, 240, 255, 0.05); border: none; border-right: 1px solid var(--line); }
.k:hover { color: #fff; background: rgba(0, 240, 255, 0.14); }
.v { color: var(--ok); word-break: break-all; }
.v.wait { color: var(--text-faint); }
.v.bad { color: var(--danger); }
.fn { padding: 10px; border: 1px solid var(--line); border-left: 2px solid rgba(0, 240, 255, 0.6); display: flex; flex-direction: column; gap: 8px; }
.fn.write { border-left-color: #ffa552; }
.fn-top { display: flex; align-items: center; gap: 8px; }
.fn-name { flex: 1; font-family: var(--font-code); font-size: 13px; color: #fff; }
.fn-name small { margin-left: 4px; font-size: 11px; color: var(--text-faint); }
.tag { padding: 1px 6px; font-size: 11px; color: var(--gold); border: 1px solid rgba(252, 238, 10, 0.4); }
.fn-btn { padding: 4px 14px; cursor: pointer; font-size: 12px; color: #fff; border: 1px solid; background: none; }
.fn-btn.read { border-color: rgba(0, 240, 255, 0.6); background: rgba(0, 240, 255, 0.1); }
.fn-btn.write { border-color: rgba(255, 165, 82, 0.7); background: rgba(255, 165, 82, 0.12); }
.fn-btn:hover:not(:disabled) { filter: brightness(1.4); }
.params { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.params label { display: flex; flex-direction: column; gap: 3px; }
.params label span { font-size: 12px; color: var(--text-dim); }
.params label i { font-style: normal; font-family: var(--font-code); font-size: 11px; color: var(--text-faint); }
.params .input { padding: 5px 6px; font-family: var(--font-code); font-size: 12px; }
.result { padding: 6px 8px; font-family: var(--font-code); font-size: 12px; color: var(--ok); word-break: break-all; background: rgba(0, 255, 160, 0.05); border: 1px solid rgba(0, 255, 160, 0.2); }
.result.bad { color: var(--danger); background: rgba(255, 107, 129, 0.06); border-color: rgba(255, 107, 129, 0.3); }
.tx { display: block; margin-top: 2px; color: var(--text-faint); }
.link { padding: 0; cursor: pointer; background: none; border: none; color: var(--text-faint); }
@media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } .editor { height: 360px; } .side { contain: none; height: 70vh; } }
</style>
