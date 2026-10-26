<script setup lang="ts">
import { ref, nextTick, watch, onUnmounted } from 'vue'
import { useAiStore } from '../stores/ai'
import { useUserStore } from '../stores/user'
import { renderMarkdown } from '../utils/markdown'
import type { Source } from '../types'

// ===== 语音识别：用浏览器自带的 SpeechRecognition =====
// Edge 浏览器走的是微软的语音服务，国内速度很快，免费，不需要配置密钥

// 对话记录
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
const input = ref('')
const loading = ref(false)
const listEl = ref<HTMLDivElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

// 别的页面通过公告板塞进来的问题，自动发出去
const ai = useAiStore()
watch(loading, (v) => (ai.thinking = v))
watch(
  () => ai.pending,
  (q) => {
    if (!q) return
    ai.pending = ''
    send(q)
  },
  { immediate: true }
)

async function send(text?: string | Event) {
  const question = (typeof text === 'string' ? text : input.value).trim()
  if (!question || loading.value) return

  messages.value.push({ role: 'user', text: question })
  messages.value.push({ role: 'bot', text: '', sources: [], error: '', logId: null, rating: null, reason: '', askReason: false, thanks: false })
  const bot = messages.value[messages.value.length - 1]
  if (typeof text !== 'string') input.value = ''
  loading.value = true
  scrollToBottom()

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userStore.token}` },
      body: JSON.stringify({ question }),
    })
    if (!res.ok) throw new Error('请求失败，后端开着吗？')

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

// ===== 语音识别：浏览器自带 SpeechRecognition（Edge 走微软服务，国内快） =====
const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const canListen = ref(!!Recognition)
const listening = ref(false)
const voiceTip = ref('')
let recognizer: any = null
let watchdog: ReturnType<typeof setTimeout> | undefined

function toggleMic() {
  if (listening.value) {
    recognizer?.stop()
    return
  }

  if (!Recognition) {
    voiceTip.value = '⚠️ 当前浏览器不支持语音识别，请用 Edge 或 Chrome 浏览器'
    return
  }

  recognizer = new Recognition()
  recognizer.lang = 'zh-CN'
  recognizer.interimResults = true // 边说边出字

  const before = input.value
  voiceTip.value = ''
  listening.value = true

  // 说话后 5 秒没反应，提示用户
  clearTimeout(watchdog)
  watchdog = setTimeout(() => {
    if (listening.value && input.value === before) {
      voiceTip.value = '️ 语音服务没响应，请检查麦克风权限，或换 Edge 浏览器试试'
    }
  }, 5000)

  // 中间结果（边说边出字）
  recognizer.onresult = (e: any) => {
    const transcript = [...e.results].map((r: any) => r[0].transcript).join('')
    input.value = before + transcript
    voiceTip.value = ''
  }

  // 错误处理
  recognizer.onerror = (e: any) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return
    voiceTip.value = e.error === 'not-allowed'
      ? '️ 请允许浏览器使用麦克风（地址栏左边🔒图标里可以打开）'
      : e.error === 'network'
        ? '⚠️ 连不上语音服务，请换 Edge 浏览器试试'
        : '️ 语音识别出错了：' + e.error
  }

  // 识别结束
  recognizer.onend = () => {
    listening.value = false
    clearTimeout(watchdog)
  }

  recognizer.start()
}

// 朗读：去掉代码块和 Markdown 符号再读
const speakingIdx = ref(-1)
function speak(msg: ChatMessage, i: number) {
  speechSynthesis.cancel()
  if (speakingIdx.value === i) return (speakingIdx.value = -1)
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
  clearTimeout(watchdog)
})

// ===== 评价 =====
async function rate(msg: ChatMessage, rating: 'up' | 'down') {
  msg.rating = rating
  msg.thanks = false
  msg.askReason = rating === 'down'
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
    <div class="chat-header"><img class="hd-icon" src="/models/mentor-avatar.png" alt="" />AI 小助手</div>

    <div class="messages" ref="listEl">
      <div v-if="messages.length === 0" class="empty">还没有对话，问我点什么吧～</div>

      <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
        <template v-if="msg.role === 'user'">{{ msg.text }}</template>
        <template v-else>
          <div v-if="!msg.text && !msg.error" class="thinking">正在翻教材…</div>
          <div v-html="renderMarkdown(msg.text)"></div>
          <div v-if="msg.error" class="error">出错了：{{ msg.error }}</div>
          <details v-for="(s, j) in msg.sources" :key="j" class="source">
            <summary>[{{ j + 1 }}] {{ s.heading }}</summary>
            <p>{{ s.file }}</p>
            <p>{{ s.text }}…</p>
          </details>
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

    <div v-if="voiceTip" class="voice-tip">{{ voiceTip }}</div>
    <form class="input-row" @submit.prevent="send">
      <input v-model="input" :placeholder="listening ? '正在听……说完点一下麦克风' : '输入你的问题，或点麦克风说出来'" />
      <button type="button" :class="['mic-btn', { active: listening }]" @click="toggleMic" :title="listening ? '停止录音' : '语音提问'">
        <span class="mic-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </span>
      </button>
      <button class="send-btn" :disabled="loading">{{ loading ? '回答中' : '发送' }}</button>
    </form>
  </div>
</template>

<style scoped>
/* 赛博朋克深色版 */
.chat { display: flex; flex-direction: column; height: 100%; color: var(--text); }
.chat-header { display: flex; align-items: center; gap: 10px; font-weight: 500; letter-spacing: 2px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.hd-icon { width: 30px; height: 30px; flex-shrink: 0; filter: drop-shadow(0 0 6px rgba(0, 240, 255, 0.5)); }
.messages { flex: 1; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.empty { color: var(--text-faint); }
.msg { font-size: 14px; line-height: 1.7; }
.msg.user {
  align-self: flex-end; max-width: 85%; padding: 6px 12px; border-radius: 10px 10px 2px 10px;
  background: linear-gradient(90deg, rgba(255, 43, 214, 0.85), rgba(0, 200, 255, 0.85)); color: #fff;
}
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

/* 输入行 */
.input-row { display: flex; gap: 8px; padding-top: 8px; align-items: center; }
.input-row input {
  flex: 1; padding: 9px 12px; border-radius: 8px; outline: none; font-family: var(--font);
  border: 1px solid var(--line-strong); background: rgba(0, 0, 0, 0.4); color: var(--text);
  transition: border-color 0.2s;
}
.input-row input::placeholder { color: var(--text-faint); }
.input-row input:focus { border-color: var(--accent); }

/* 发送按钮 */
.send-btn {
  padding: 9px 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: #05020f;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  transition: opacity 0.2s;
}
.send-btn:disabled { opacity: 0.4; cursor: default; }

/* 麦克风按钮 — 全新设计 */
.mic-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--line-strong);
  background: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.25s;
  padding: 0;
}
.mic-btn:hover {
  border-color: rgba(0, 240, 255, 0.4);
  background: rgba(0, 240, 255, 0.08);
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.15);
}
.mic-btn:active {
  transform: scale(0.92);
}

/* 麦克风图标 */
.mic-icon {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.25s;
}
.mic-icon svg {
  width: 100%;
  height: 100%;
}

/* 录音中状态 */
.mic-btn.active {
  border-color: #ff4757;
  background: rgba(255, 71, 87, 0.12);
  box-shadow: 0 0 16px rgba(255, 71, 87, 0.3);
  animation: micPulse 1.5s ease-in-out infinite;
}
.mic-btn.active .mic-icon {
  color: #ff4757;
}

@keyframes micPulse {
  0%, 100% { box-shadow: 0 0 12px rgba(255, 71, 87, 0.2); }
  50% { box-shadow: 0 0 24px rgba(255, 71, 87, 0.5); }
}

/* 语音提示 */
.voice-tip { margin-bottom: 6px; font-size: 12px; color: var(--gold); }
</style>
