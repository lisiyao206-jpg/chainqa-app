<script setup>
import { ref, nextTick, watch } from 'vue'
import { useAiStore } from '../stores/ai.js'

// 对话记录：每条是 { role: 'user' | 'bot', text, sources, error }
const messages = ref([])
// 输入框里的内容
const input = ref('')
// AI 是否正在回答（回答时禁用发送按钮）
const loading = ref(false)
// 消息区的 DOM 元素，用来自动滚到底部
const listEl = ref(null)

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

// 把 AI 回答里的 Markdown 转成 HTML（代码块、行内代码、粗体、引用编号）
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
function renderMarkdown(md) {
  return md
    .split('```')
    .map((part, i) => {
      if (i % 2 === 1) return `<pre><code>${escapeHtml(part.replace(/^[\w-]*\n/, ''))}</code></pre>`
      return escapeHtml(part)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(\d+)\]/g, '<span class="cite">$1</span>')
        .replace(/\n/g, '<br>')
    })
    .join('')
}

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
async function send(text) {
  const question = (typeof text === 'string' ? text : input.value).trim()
  if (!question || loading.value) return

  messages.value.push({ role: 'user', text: question })
  // 先放一条空的 AI 消息，后面一个字一个字往里填
  messages.value.push({ role: 'bot', text: '', sources: [], error: '' })
  const bot = messages.value[messages.value.length - 1]
  if (typeof text !== 'string') input.value = ''
  loading.value = true
  scrollToBottom()

  try {
    // 发给后端（Vite 会把 /api 转到 3000 端口的 server.mjs）
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    if (!res.ok) throw new Error('请求失败，后端开着吗？')

    // 后端用 SSE 流式返回，每段形如：event: delta \n data: "一段文字"
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
        if (event === 'delta') bot.text += data
        else if (event === 'sources') bot.sources = data
        else if (event === 'refused') bot.text = '⚠️ 知识库中没找到相关依据，换个说法试试？'
        else if (event === 'error') bot.error = data
        scrollToBottom()
      }
    }
  } catch (err) {
    bot.error = err.message
  }
  loading.value = false
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
        </template>
      </div>
    </div>

    <form class="input-row" @submit.prevent="send">
      <input v-model="input" placeholder="输入你的问题" />
      <button :disabled="loading">{{ loading ? '回答中' : '发送' }}</button>
    </form>
  </div>
</template>

<style scoped>
.chat { display: flex; flex-direction: column; height: 100%; }
.chat-header { font-weight: bold; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
.messages { flex: 1; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.empty { color: #9ca3af; }
.msg { font-size: 14px; line-height: 1.6; }
.msg.user { align-self: flex-end; background: #2556b6; color: #fff; padding: 6px 12px; border-radius: 12px; max-width: 85%; }
.msg.bot { background: #f6f7f9; padding: 10px 12px; border-radius: 12px; }
.msg.bot :deep(pre) { background: #fff; padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.msg.bot :deep(.cite) { background: #e8eefb; color: #2556b6; font-size: 11px; padding: 0 5px; border-radius: 4px; }
.thinking { color: #9ca3af; }
.error { color: #b91c1c; }
.source { font-size: 12px; margin-top: 6px; }
.source summary { cursor: pointer; color: #6b7280; }
.source p { margin: 4px 0; color: #4b5563; white-space: pre-wrap; }
.input-row { display: flex; gap: 8px; }
.input-row input { flex: 1; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
.input-row button { padding: 8px 16px; border: none; border-radius: 8px; background: #1f2329; color: #fff; cursor: pointer; }
.input-row button:disabled { opacity: 0.4; cursor: default; }
</style>
