<script setup>
// 意见反馈：给我们留言（功能建议、发现的问题、题目出错……），并查看管理员的回复
// 对 AI 回答点过的「有帮助 / 没帮助」也会出现在这里
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user.js'

const emit = defineEmits(['close'])
const userStore = useUserStore()
const list = ref([])
const content = ref('')
const msg = ref(null) // { ok, text }
const sending = ref(false)

async function load() {
  list.value = await userStore.api('/api/feedback')
}
onMounted(load)

async function submit() {
  sending.value = true
  msg.value = null
  try {
    await userStore.api('/api/feedback', { type: 'message', content: content.value })
    content.value = ''
    msg.value = { ok: true, text: '已提交，管理员回复后会显示在下面' }
    await load()
  } catch (err) {
    msg.value = { ok: false, text: err.message }
  } finally {
    sending.value = false
  }
}

const fmt = (t) => (t ? t.slice(5, 16).replace('T', ' ') : '')
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="card">
      <header>
        <b>💬 意见反馈</b>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <form class="write" @submit.prevent="submit">
        <textarea v-model="content" rows="4" maxlength="1000" placeholder="想要的新功能、遇到的问题、题目或 AI 回答哪里不对……都可以告诉我们"></textarea>
        <div class="bar">
          <span :class="msg?.ok ? 'ok' : 'error'">{{ msg?.text }}</span>
          <button class="btn primary" :disabled="sending || !content.trim()">提交反馈</button>
        </div>
      </form>

      <h4>我的反馈</h4>
      <div v-if="!list.length" class="empty">还没有反馈过</div>
      <div v-for="f in list" :key="f.id" class="item">
        <div class="meta">
          <span :class="['type', f.type]">{{ f.type === 'answer' ? (f.rating === 'up' ? '👍 评价回答' : '👎 评价回答') : '留言' }}</span>
          <span>{{ fmt(f.time) }}</span>
          <span :class="['status', f.status]">{{ f.status === 'replied' ? '已回复' : '待处理' }}</span>
          <i v-if="f.unread" class="new">新回复</i>
        </div>
        <div v-if="f.question" class="q">问题：{{ f.question }}</div>
        <div v-if="f.content" class="content">{{ f.content }}</div>
        <div v-if="f.reply" class="reply"><b>管理员回复（{{ fmt(f.replyTime) }}）：</b>{{ f.reply }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask { position: fixed; inset: 0; z-index: 160; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); }
.card {
  width: min(560px, 92vw); max-height: 86vh; overflow-y: auto; padding: 20px 24px; color: var(--text);
  background: var(--glass-strong); backdrop-filter: var(--blur); border: 1px solid var(--line-strong);
}
header { display: flex; justify-content: space-between; align-items: center; font-size: 17px; color: #fff; }
.close { border: none; background: none; color: var(--text-dim); font-size: 18px; cursor: pointer; }
.write { margin-top: 14px; }
textarea {
  width: 100%; resize: vertical; padding: 10px 12px; font-size: 14px; font-family: var(--font); line-height: 1.6;
  color: var(--text); background: rgba(0, 0, 0, 0.35); border: 1px solid var(--line-strong); outline: none;
}
textarea:focus { border-color: var(--accent); }
.bar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 13px; }
.ok { color: var(--ok); }
.error { color: var(--danger); }
h4 { margin: 22px 0 10px; color: var(--accent); font-weight: normal; letter-spacing: 2px; }
.empty { color: var(--text-faint); font-size: 13px; }
.item { padding: 10px 0; border-top: 1px dashed var(--line); font-size: 14px; line-height: 1.7; }
.meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--text-faint); }
.type { color: var(--text-dim); }
.status.pending { color: var(--gold); }
.status.replied { color: var(--ok); }
.new { font-style: normal; padding: 0 6px; border-radius: 8px; color: #fff; background: var(--accent-strong); }
.q { color: var(--text-dim); font-size: 13px; }
.content { white-space: pre-wrap; word-break: break-word; }
.reply { margin-top: 4px; padding: 6px 10px; background: rgba(0, 240, 255, 0.08); border-left: 3px solid var(--accent); white-space: pre-wrap; }
.reply b { color: var(--accent); font-weight: normal; }
</style>
