<script setup lang="ts">
import { ref, nextTick, watch, onUnmounted } from 'vue'
import { useAiStore } from '../stores/ai'
import { useUserStore } from '../stores/user'
import { renderMarkdown } from '../utils/markdown'
import type { Source } from '../types'

// 对话记录：每条是 { role: 'user' | 'bot', text, sources, error, logId, rating }
// logId 是后端问答日志的编号，有了它才能给这条回答点「有帮助 / 没帮助」
interface ChatMessage {
  role: 'user' | 'bot'
  text: string
  sources?: (Source & { text?: string })[]
  error?: string
  logId?: number | null
  rating?: 'up' | 'down' | null
  reason?: string
  askReason?: boolean
  thanks?: boolean
}
const userStore = useUserStore()
const messages = ref<ChatMessage[]>([])
// 输入框里的内容
const input = ref('')
// AI 是否正在回答（回答时禁用发送按钮）
const loading = ref(false)
// 消息区的 DOM 元素，用来自动滚到底部
const listEl = ref<HTMLDivElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

// 把 AI 回答里的 Markdown 转成 HTML：和 AI 审计报告共用一份（utils/markdown.js）

// 别的页面（比如训练营选中文字）通过公告板塞进来的问题，自动发出去
const ai = useAiStore()
watch(
  () => ai.pending,
  (q) => {
    if (!q) return
    ai.pending = ''
    send(q)
  },
  { immediate: true }
)

// text 不传时，发送输入框里的内容
async function send(text?: string | Event) {
  const question = (typeof text === 'string' ? text : input.value).trim()
  if (!question || loading.value) return

  messages.value.push({ role: 'user', text: question })
  // 先放一条空的 AI 消息，后面一个字一个字往里填
  messages.value.push({ role: 'bot', text: '', sources: [], error: '', logId: null, rating: null, reason: '', askReason: false, thanks: false })
  const bot = messages.value[messages.value.length - 1]
  if (typeof text !== 'string') input.value = ''
  loading.value = true
  scrollToBottom()

  try {
    // 发给后端（Vite 会把 /api 转到 3000 端口的 server.mjs）
    const res = await fetch('/api/ask', {
      method: 'POST',
      // 带上登录凭证：后端才知道是谁问的（写进问答日志），也才能评价这条回答
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userStore.token}` },
      body: JSON.stringify({ question }),
    })
    if (!res.ok) throw new Error('请求失败，后端开着吗？')

    // 后端用 SSE 流式返回，每段形如：event: delta \n data: "一段文字"
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
        if (event === 'delta') bot.text += data
        else if (event === 'sources') bot.sources = data
        else if (event === 'refused') bot.text = '⚠️ 知识库中没找到相关依据，换个说法试试？'
        else if (event === 'error') bot.error = data
        else if (event === 'log') bot.logId = data
        else if (event === 'blocked') bot.text = `🛡️ 已拦截：${data}。我只会依据教材回答智能合约安全的问题，换个问法试试吧。`
        scrollToBottom()
      }
    }
  } catch (err) {
    bot.error = (err as Error).message
  }
  loading.value = false
}

// ===== 语音（多模态）：🎤 说话提问、🔊 朗读回答 =====
// 用的是浏览器自带的语音识别和语音合成，不花 AI 额度。Chrome / Edge 支持；不支持的浏览器不显示麦克风按钮
const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const canListen = !!Recognition
const listening = ref(false)
let recognizer: any = null
function toggleMic() {
  if (listening.value) return recognizer?.stop()
  recognizer = new Recognition()
  recognizer.lang = 'zh-CN'
  recognizer.interimResults = true // 边说边出字
  const before = input.value
  recognizer.onresult = (e: any) => {
    input.value = before + [...e.results].map((r: any) => r[0].transcript).join('')
  }
  recognizer.onerror = (e: any) => {
    if (e.error !== 'aborted') alert(e.error === 'not-allowed' ? '请允许浏览器使用麦克风' : '语音识别出错了：' + e.error + '（语音识别需要联网）')
  }
  recognizer.onend = () => (listening.value = false)
  recognizer.start()
  listening.value = true
}

// 朗读：去掉代码块和 Markdown 符号再读，代码读出来没意义
const speakingIdx = ref(-1)
function speak(msg: ChatMessage, i: number) {
  speechSynthesis.cancel()
  if (speakingIdx.value === i) return (speakingIdx.value = -1) // 再点一次就停止
  const text = msg.text.replace(/```[\s\S]*?```/g, '（代码略）').replace(/[`*#>]|\[\d+\]/g, '')
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 1.1
  u.onend = () => (speakingIdx.value = -1)
  speakingIdx.value = i
  speechSynthesis.speak(u)
}
onUnmounted(() => {
  speechSynthesis.cancel()
  recognizer?.abort()
})

// ===== 评价这条回答（进入管理员后台的「反馈处理」）=====
async function rate(msg: ChatMessage, rating: 'up' | 'down') {
  msg.rating = rating
  msg.thanks = false
  msg.askReason = rating === 'down' // 没帮助：请用户说说哪里不好
  if (rating === 'up') await submitRating(msg)
}
async function submitRating(msg: ChatMessage) {
  try {
    await userStore.api('/api/feedback', { type: 'answer', logId: msg.logId, rating: msg.rating, content: msg.reason })
    msg.askReason = false
    msg.thanks = true
  } catch (err) {
    msg.error = (err as Error).message
  }
}
</script>

<template>
  <div class="chat">
    <div class="chat-header">🤖 AI 小助手</div>

    <div class="messages" ref="listEl">
      <div v-if="messages.length === 0" class="empty">还没有对话，问我点什么吧～</div>

      <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
        <!-- 用户的问题：直接显示文字 -->
        <template v-if="msg.role === 'user'">{{ msg.text }}</template>

        <!-- AI 的回答：渲染 Markdown + 引用来源 -->
        <template v-else>
          <div v-if="!msg.text && !msg.error" class="thinking">正在翻教材…</div>
          <div v-html="renderMarkdown(msg.text)"></div>
          <div v-if="msg.error" class="error">出错了：{{ msg.error }}</div>
          <details v-for="(s, j) in msg.sources" :key="j" class="source">
            <summary>[{{ j + 1 }}] {{ s.heading }}</summary>
            <p>{{ s.file }}</p>
            <p>{{ s.text }}…</p>
          </details>
          <!-- 评价：这条回答有没有帮到你 -->
          <div v-if="msg.logId" class="rate">
            <button :class="{ on: msg.rating === 'up' }" @click="rate(msg, 'up')">👍 有帮助</button>
            <button :class="{ on: msg.rating === 'down' }" @click="rate(msg, 'down')">👎 没帮助</button>
            <button :class="{ on: speakingIdx === i }" title="朗读这条回答" @click="speak(msg, i)">{{ speakingIdx === i ? '⏹ 停止' : '🔊 朗读' }}</button>
            <span v-if="msg.thanks" class="thanks">谢谢反馈！</span>
          </div>
          <form v-if="msg.askReason" class="reason" @submit.prevent="submitRating(msg)">
            <input v-model="msg.reason" maxlength="300" placeholder="哪里不对？比如答错了、没答到点上……" />
            <button>提交</button>
          </form>
        </template>
      </div>
    </div>

    <form class="input-row" @submit.prevent="send">
      <input v-model="input" :placeholder="listening ? '正在听……说完点一下麦克风' : '输入你的问题，或点 🎤 说出来'" />
      <button v-if="canListen" type="button" :class="['mic', { on: listening }]" :title="listening ? '停止' : '语音提问'" @click="toggleMic">🎤</button>
      <button :disabled="loading">{{ loading ? '回答中' : '发送' }}</button>
    </form>
  </div>
</template>

<style scoped>
/* 赛博朋克深色版：颜色都用 style.css 里的全站变量 */
.chat { display: flex; flex-direction: column; height: 100%; color: var(--text); }
.chat-header { font-weight: 500; letter-spacing: 2px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.messages { flex: 1; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.empty { color: var(--text-faint); }
.msg { font-size: 14px; line-height: 1.7; }
/* 我的问题：品红 → 青的渐变气泡 */
.msg.user {
  align-self: flex-end; max-width: 85%; padding: 6px 12px; border-radius: 10px 10px 2px 10px;
  background: linear-gradient(90deg, rgba(255, 43, 214, 0.85), rgba(0, 200, 255, 0.85)); color: #fff;
}
/* AI 的回答：深色半透明面板 + 青色细边框 */
.msg.bot {
  padding: 10px 12px; border-radius: 2px 10px 10px 10px;
  background: rgba(10, 8, 30, 0.75); border: 1px solid var(--line); color: var(--text);
}
.msg.bot :deep(strong) { color: var(--accent); }
.msg.bot :deep(pre) {
  background: rgba(0, 0, 0, 0.5); border: 1px solid var(--line); color: #e5f9ff;
  padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; font-family: var(--font-code);
}
.msg.bot :deep(code) { font-family: var(--font-code); color: var(--gold); }
.msg.bot :deep(pre code) { color: inherit; }
.msg.bot :deep(.cite) { background: rgba(0, 240, 255, 0.15); color: var(--accent); font-size: 11px; padding: 0 5px; border-radius: 3px; }
.thinking { color: var(--text-faint); }
.error { color: var(--danger); }
.source { font-size: 12px; margin-top: 6px; }
.rate { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.rate button {
  padding: 2px 10px; font-size: 12px; cursor: pointer; border-radius: 999px;
  color: var(--text-dim); background: none; border: 1px solid var(--line);
}
.rate button:hover { color: #fff; border-color: var(--accent); }
.rate button.on { color: #05020f; background: var(--accent); border-color: var(--accent); }
.thanks { font-size: 12px; color: var(--ok); }
.reason { display: flex; gap: 6px; margin-top: 6px; }
.reason input {
  flex: 1; padding: 5px 8px; font-size: 12px; color: var(--text); outline: none;
  background: rgba(0, 0, 0, 0.35); border: 1px solid var(--line-strong);
}
.reason button { padding: 4px 10px; font-size: 12px; cursor: pointer; color: #05020f; background: var(--accent); border: none; }
.source summary { cursor: pointer; color: var(--text-dim); }
.source p { margin: 4px 0; color: var(--text-dim); white-space: pre-wrap; }
.input-row { display: flex; gap: 8px; padding-top: 8px; }
.input-row input {
  flex: 1; padding: 9px 12px; border-radius: 4px; outline: none; font-family: var(--font);
  border: 1px solid var(--line-strong); background: rgba(0, 0, 0, 0.4); color: var(--text);
}
.input-row input::placeholder { color: var(--text-faint); }
.input-row input:focus { border-color: var(--accent); }
.input-row button {
  padding: 9px 18px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; color: #05020f;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
}
.input-row button:disabled { opacity: 0.4; cursor: default; }
.mic { flex-shrink: 0; width: 40px; cursor: pointer; font-size: 16px; background: none !important; border: 1px solid var(--line-strong) !important; }
.mic.on { border-color: var(--danger) !important; box-shadow: 0 0 14px rgba(255, 107, 129, 0.6); animation: rec 1s ease-in-out infinite; }
@keyframes rec { 50% { box-shadow: 0 0 4px rgba(255, 107, 129, 0.3); } }
</style>
