<script setup lang="ts">
// 聊天窗口：显示一个聊天室（私聊或讨论组）的消息，可以发文字和文件
// 「实时」的做法：每 2 秒问一次后端「有没有比我手上最新那条更新的消息」（轮询）
// 比 WebSocket 简单很多，内网穿透也能用；比赛演示完全够用
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { uploadFile } from '../utils/files'
import { copyText, fileFromPaste } from '../utils/clipboard'
import FileChip from './FileChip.vue'
import UserAvatar from './UserAvatar.vue'
import type { User, FileInfo } from '../types'

type UserBrief = Pick<User, 'userId' | 'account' | 'nickname' | 'avatar'>
interface Room {
  id: number
  type: 'dm' | 'group' | string
  name: string
  memberCount: number
  [key: string]: any
}
interface Message {
  id: number
  from: UserBrief
  text: string | null
  file: FileInfo | null
  time: string
}

const props = defineProps<{
  room?: Room,           // { id, type, name, memberCount }
  friends?: UserBrief[], // 我的好友：讨论组「拉人」时用
}>()
const emit = defineEmits(['changed', 'left'])
const userStore = useUserStore()
const me = () => userStore.user?.userId

const messages = ref<Message[]>([])
const text = ref('')
const sending = ref(false)
const error = ref('')
const listEl = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const showInvite = ref(false) // 讨论组「拉人」面板开关
const picked = ref<number[]>([])        // 勾选了要拉进来的好友

// 滚到最下面（看最新消息）
async function toBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

// 只取比手上最新那条更新的消息，接在后面
async function poll() {
  const roomId = props.room!.id
  const after = messages.value.at(-1)?.id || 0
  try {
    const fresh = await userStore.api<Message[]>(`/api/social/rooms/${roomId}/messages?after=${after}`)
    if (roomId !== props.room!.id || !fresh.length) return // 等结果的时候已经切到别的聊天了
    const nearBottom = listEl.value && listEl.value.scrollHeight - listEl.value.scrollTop - listEl.value.clientHeight < 80
    messages.value.push(...fresh.filter((m) => !messages.value.some((x) => x.id === m.id)))
    if (nearBottom || !after) toBottom() // 正在往上翻旧消息时，不要强行拉到底
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  }
}

// 换了聊天室：清空、重新加载、重新开始轮询
watch(
  () => props.room!.id,
  () => {
    clearInterval(timer!)
    messages.value = []
    error.value = ''
    showInvite.value = false
    poll()
    timer = setInterval(poll, 2000)
  },
  { immediate: true },
)
onUnmounted(() => clearInterval(timer!))

async function send(body: { text?: string; fileId?: number }) {
  sending.value = true
  error.value = ''
  try {
    const msg = await userStore.api<Message>(`/api/social/rooms/${props.room!.id}/messages`, body)
    if (!messages.value.some((x) => x.id === msg.id)) messages.value.push(msg)
    toBottom()
    emit('changed')
    return true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

async function sendText() {
  if (!text.value.trim() || sending.value) return
  if (await send({ text: text.value })) text.value = ''
}

// Enter 发送；Shift + Enter 换行；输入法正在选字时按 Enter 不算
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    sendText()
  }
}

async function pickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files![0]
  input.value = '' // 清空，下次选同一个文件也能触发
  if (file) sendFile(file)
}

// 在输入框里 Ctrl + V：粘贴的是文字就照常粘贴；粘贴的是截图、图片、文件就直接发出去
function onPaste(e: ClipboardEvent) {
  const file = fileFromPaste(e)
  if (!file) return // 文字：交给浏览器自己粘贴
  e.preventDefault()
  sendFile(file)
}

// 复制一条消息的文字，按钮上显示「已复制」1.5 秒
const copiedId = ref<number | null>(null)
async function copyMsg(m: Message) {
  await copyText(m.text!)
  copiedId.value = m.id
  setTimeout(() => copiedId.value === m.id && (copiedId.value = null), 1500)
}

async function sendFile(file: File) {
  sending.value = true
  try {
    const f = await uploadFile(file)
    await send({ fileId: f.id })
  } catch (err) {
    error.value = (err as Error).message
    sending.value = false
  }
}

// ===== 讨论组：拉人、退出 =====
async function invite() {
  if (!picked.value.length) return
  try {
    await userStore.api(`/api/social/rooms/${props.room!.id}/members`, { memberIds: picked.value })
    picked.value = []
    showInvite.value = false
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function leave() {
  if (!confirm(`确定要退出「${props.room!.name}」吗？`)) return
  await userStore.api(`/api/social/rooms/${props.room!.id}`, null, 'DELETE')
  emit('left')
}

// 「22:41」或「10-16 22:41」
function shortTime(t: string) {
  const today = new Date().toISOString().slice(0, 10)
  return t.startsWith(today) ? t.slice(11, 16) : t.slice(5, 16).replace('T', ' ')
}
</script>

<template>
  <section class="room">
    <header>
      <div>
        <b>{{ props.room!.name }}</b>
        <span v-if="props.room!.type === 'group'" class="count">{{ props.room!.memberCount }} 人讨论组</span>
      </div>
      <div v-if="props.room!.type === 'group'" class="head-btns">
        <button class="btn" @click="showInvite = !showInvite">+ 拉人</button>
        <button class="btn danger" @click="leave">退出</button>
      </div>
    </header>

    <!-- 拉好友进讨论组 -->
    <div v-if="showInvite" class="invite">
      <label v-for="f in props.friends" :key="f.userId">
        <input type="checkbox" :value="f.userId" v-model="picked" /> {{ f.nickname }}
      </label>
      <span v-if="!props.friends!.length" class="faint">还没有好友</span>
      <button class="btn primary" @click="invite">确定</button>
    </div>

    <div ref="listEl" class="list">
      <div v-if="!messages.length" class="empty">还没有消息，打个招呼吧 👋</div>
      <div v-for="m in messages" :key="m.id" :class="['msg', { mine: m.from.userId === me() }]">
        <UserAvatar :user="m.from" :size="32" class="msg-avatar" />
        <div class="msg-body">
        <div class="meta">
          <span v-if="props.room!.type === 'group' && m.from.userId !== me()">{{ m.from.nickname }}</span>
          {{ shortTime(m.time) }}
          <a v-if="m.text" class="copy" @click="copyMsg(m)">{{ copiedId === m.id ? '已复制' : '复制' }}</a>
        </div>
        <div class="bubble">
          <!-- 文字用 {{ }} 显示：Vue 会自动转义，就算有人发 <script> 也只会显示成文字，不会被执行 -->
          <div v-if="m.text" class="text">{{ m.text }}</div>
          <FileChip v-if="m.file" :file="m.file" />
        </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <footer>
      <button class="attach" title="发送文件（最大 10MB）" :disabled="sending" @click="fileInput!.click()">📎</button>
      <input ref="fileInput" type="file" hidden @change="pickFile" />
      <textarea v-model="text" rows="2" maxlength="1000" placeholder="输入消息，Enter 发送，Shift + Enter 换行；截图后 Ctrl + V 可以直接发图" @keydown="onKey" @paste="onPaste"></textarea>
      <button class="btn primary" :disabled="sending || !text.trim()" @click="sendText">发送</button>
    </footer>
  </section>
</template>

<style scoped>
.room { display: flex; flex-direction: column; height: 100%; min-height: 0; }
header { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); }
header b { color: #fff; font-size: 15px; letter-spacing: 1px; }
.count { margin-left: 10px; font-size: 12px; color: var(--text-faint); }
.head-btns { display: flex; gap: 8px; }
.head-btns .btn { padding: 5px 12px; font-size: 12px; }
.invite { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--line); font-size: 13px; }
.faint { color: var(--text-faint); }

.list { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.empty { margin: auto; color: var(--text-faint); font-size: 13px; }
.msg { display: flex; gap: 10px; align-items: flex-start; max-width: 76%; }
.msg.mine { align-self: flex-end; flex-direction: row-reverse; }
.msg-body { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.msg.mine .msg-body { align-items: flex-end; }
.meta { font-size: 11px; color: var(--text-faint); margin-bottom: 4px; }
.bubble { display: flex; flex-direction: column; gap: 6px; padding: 9px 13px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); }
.msg.mine .bubble { background: rgba(0, 240, 255, 0.12); border-color: var(--line-strong); }
.copy { margin-left: 8px; cursor: pointer; color: var(--text-faint); opacity: 0; transition: opacity 0.2s; }
.msg:hover .copy { opacity: 1; } /* 鼠标移到消息上才出现「复制」，平时不占眼 */
.copy:hover { color: var(--accent); }
.text { user-select: text; white-space: pre-wrap; word-break: break-word; line-height: 1.6; font-size: 14px; color: var(--text); }

.error { padding: 6px 18px; color: var(--danger); font-size: 13px; }
footer { display: flex; gap: 10px; align-items: flex-end; padding: 12px 18px; border-top: 1px solid var(--line); }
textarea {
  flex: 1; resize: none; padding: 8px 10px; font-size: 14px; font-family: var(--font); line-height: 1.5;
  color: var(--text); background: rgba(6, 4, 20, 0.6); border: 1px solid var(--line-strong); outline: none;
}
textarea:focus { border-color: var(--accent); }
.attach { width: 38px; height: 38px; font-size: 18px; cursor: pointer; background: none; border: 1px solid var(--line-strong); color: var(--text); }
.attach:hover { border-color: var(--accent); }
</style>
