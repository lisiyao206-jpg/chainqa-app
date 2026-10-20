<script setup lang="ts">
// 帖子列表：好友圈和广场共用这一个组件，用 square 区分
//   好友圈（square = false）：只有自己和好友能看到；评论也只显示好友写的（和微信朋友圈一样）
//   广场（square = true）：所有人都能看到，不认识的人也能讨论；帖子有标题，可以按「最新 / 最热」排，
//                         看到聊得来的人可以直接加好友；管理员可以删除不合适的帖子和评论
// 两种都能带一个附件：图片、视频（mp4 / webm）或学习资料
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { uploadFile, isVideoName } from '../utils/files'
import { copyText, fileFromPaste } from '../utils/clipboard'
import FileChip from './FileChip.vue'
import UserAvatar from './UserAvatar.vue'
import type { User, FileInfo } from '../types'

type UserBrief = Pick<User, 'userId' | 'account' | 'nickname' | 'avatar'>
interface Comment {
  id: number
  from: UserBrief
  text: string
  mine: boolean
  canDelete: boolean
}
interface Post {
  id: number
  author: UserBrief
  title: string | null
  text: string
  file: FileInfo | null
  time: string
  mine: boolean
  friend: boolean
  canDelete: boolean
  likes: string[]
  liked: boolean
  favorited: boolean
  comments: Comment[]
}

const props = defineProps<{ square?: boolean }>()
const userStore = useUserStore()
const posts = ref<Post[]>([])
const title = ref('')
const text = ref('')
const attached = ref<FileInfo | null>(null) // 已上传、准备随帖子一起发的文件
const busy = ref(false)
const error = ref('')
const tip = ref('')
const drafts = ref<Record<number, string>>({})     // 每条帖子下面评论框里正在写的字：{ 帖子id: 文字 }
const fileInput = ref<HTMLInputElement | null>(null)
const sort = ref('new')    // 广场的排序：new 最新 / hot 最热
const maxLen = computed(() => (props.square ? 2000 : 500))
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  try {
    posts.value = await userStore.api<Post[]>(props.square ? `/api/social/square?sort=${sort.value}` : '/api/social/posts')
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(() => {
  load()
  timer = setInterval(load, 15000) // 每 15 秒刷新一次，看看有没有新帖子
})
onUnmounted(() => clearInterval(timer))

function changeSort(s: string) {
  sort.value = s
  load()
}

// 统一处理：执行操作 → 出错就显示 → 最后重新加载列表
async function act(fn: () => Promise<unknown>) {
  error.value = ''
  tip.value = ''
  try {
    await fn()
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function pickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files![0]
  input.value = ''
  if (file) attach(file)
}

// 在发帖框里 Ctrl + V：粘贴文字照常；粘贴截图、图片、文件就自动变成这条帖子的附件
function onPaste(e: ClipboardEvent) {
  const file = fileFromPaste(e)
  if (!file) return
  e.preventDefault()
  attach(file)
}

// 复制帖子正文
const copiedId = ref<number | null>(null)
async function copyPost(p: Post) {
  await copyText((p.title ? p.title + '\n' : '') + p.text)
  copiedId.value = p.id
  setTimeout(() => copiedId.value === p.id && (copiedId.value = null), 1500)
}

async function attach(file: File) {
  busy.value = true
  error.value = ''
  try {
    attached.value = await uploadFile(file)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}

function publish() {
  return act(async () => {
    await userStore.api('/api/social/posts', {
      text: text.value,
      fileId: attached.value?.id,
      title: title.value,
      visibility: props.square ? 'public' : 'friends',
    })
    title.value = text.value = ''
    attached.value = null
  })
}
const like = (p: Post) => act(() => userStore.api(`/api/social/posts/${p.id}/like`, {}))
// 收藏：收藏和点赞过的帖子都会进「情报收集文件夹」
const favorite = (p: Post) => act(() => userStore.api(`/api/social/posts/${p.id}/favorite`, {}))
const remove = (p: Post) => confirm('删除这条帖子？') && act(() => userStore.api(`/api/social/posts/${p.id}`, null, 'DELETE'))
const removeComment = (c: Comment) => act(() => userStore.api(`/api/social/comments/${c.id}`, null, 'DELETE'))
function comment(p: Post) {
  const t = (drafts.value[p.id] || '').trim()
  if (!t) return
  return act(async () => {
    await userStore.api(`/api/social/posts/${p.id}/comments`, { text: t })
    drafts.value[p.id] = ''
  })
}
// 广场上看到不认识的人：一键发好友申请
const addFriend = (p: Post) =>
  act(async () => {
    tip.value = (await userStore.api<{ message: string }>('/api/social/friends', { account: p.author.account })).message
  })

const shortTime = (t: string) => t.slice(5, 16).replace('T', ' ')
</script>

<template>
  <div class="feed">
    <!-- 发帖 -->
    <div class="composer glass">
      <input v-if="props.square" v-model="title" class="title-input" maxlength="40" placeholder="帖子标题，例如：一文看懂重入攻击（附视频讲解）" />
      <textarea
        v-model="text"
        :rows="props.square ? 4 : 3"
        :maxlength="maxLen"
        :placeholder="props.square ? '写下你的心得、问题或经验，所有审计员都能看到并参与讨论……（截图后 Ctrl + V 可以直接贴图）' : '分享今天学到的知识、遇到的难题……（截图后 Ctrl + V 可以直接贴图）'"
        @paste="onPaste"
      ></textarea>
      <div class="bar">
        <button class="btn" :disabled="busy" @click="fileInput!.click()">📎 {{ busy ? '上传中…' : '图片 / 视频 / 资料' }}</button>
        <input ref="fileInput" type="file" hidden @change="pickFile" />
        <span v-if="attached" class="attached">{{ isVideoName(attached.name) ? '🎬' : '📄' }} {{ attached.name }} <a @click="attached = null">✕</a></span>
        <span class="len">{{ text.length }} / {{ maxLen }}</span>
        <button class="btn primary" :disabled="busy || (props.square && !title.trim()) || (!text.trim() && !attached)" @click="publish">发布</button>
      </div>
      <div class="note">视频支持 mp4 / webm，最大 20MB；其他文件最大 10MB</div>
    </div>

    <div v-if="props.square" class="sorts">
      <button :class="{ on: sort === 'new' }" @click="changeSort('new')">最新</button>
      <button :class="{ on: sort === 'hot' }" @click="changeSort('hot')">最热</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="tip" class="ok">{{ tip }}</div>

    <div v-if="!posts.length" class="empty">
      {{ props.square ? '广场上还没有帖子，来发第一帖吧' : '还没有动态。加几个好友，或者先发一条吧' }}
    </div>

    <article v-for="p in posts" :key="p.id" class="post glass">
      <header>
        <UserAvatar :user="p.author" :size="38" />
        <div>
          <b>{{ p.author.nickname }}</b>
          <div class="time">{{ shortTime(p.time) }}</div>
        </div>
        <button v-if="props.square && !p.mine && !p.friend" class="btn add" @click="addFriend(p)">+ 加好友</button>
        <a v-if="p.canDelete" class="del" @click="remove(p)">{{ p.mine ? '删除' : '管理员删除' }}</a>
      </header>
      <h3 v-if="p.title" class="post-title">{{ p.title }}</h3>
      <div v-if="p.text" class="text">{{ p.text }}</div>
      <FileChip v-if="p.file" :file="p.file" class="file" />

      <div class="actions">
        <button :class="['like', { on: p.liked }]" @click="like(p)">{{ p.liked ? '♥' : '♡' }} {{ p.likes.length || '赞' }}</button>
        <button :class="['like', 'fav', { on: p.favorited }]" title="收藏后可以在「情报收集文件夹」里随时复习" @click="favorite(p)">
          {{ p.favorited ? '★ 已收藏' : '☆ 收藏' }}
        </button>
        <span class="count">💬 {{ p.comments.length }}</span>
        <button v-if="p.text" class="like" @click="copyPost(p)">{{ copiedId === p.id ? '✓ 已复制' : '⧉ 复制' }}</button>
      </div>
      <div v-if="p.likes.length" class="likes">♥ {{ p.likes.join('、') }}</div>

      <div class="comments">
        <div v-for="c in p.comments" :key="c.id" class="comment">
          <b>{{ c.from.nickname }}：</b>{{ c.text }}
          <a v-if="c.canDelete" class="del" @click="removeComment(c)">删除</a>
        </div>
        <form class="comment-box" @submit.prevent="comment(p)">
          <input v-model="drafts[p.id]" class="input" maxlength="200" :placeholder="props.square ? '参与讨论…' : '写评论…'" />
          <button class="btn">评论</button>
        </form>
      </div>
    </article>
  </div>
</template>

<style scoped>
.feed { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; padding-bottom: 30px; }
.composer { padding: 14px 16px; }
.title-input, .composer textarea {
  width: 100%; padding: 8px 10px; font-size: 14px; font-family: var(--font); line-height: 1.6;
  color: var(--text); background: rgba(6, 4, 20, 0.6); border: 1px solid var(--line-strong); outline: none;
}
.title-input { margin-bottom: 8px; font-size: 15px; font-weight: 600; }
.composer textarea { resize: vertical; }
.title-input:focus, .composer textarea:focus { border-color: var(--accent); }
.bar { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.note { margin-top: 6px; font-size: 11px; color: var(--text-faint); }
.attached { font-size: 12px; color: var(--accent); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attached a { cursor: pointer; margin-left: 4px; }
.len { margin-left: auto; font-size: 12px; color: var(--text-faint); }
.sorts { display: flex; gap: 18px; font-size: 13px; }
.sorts button { padding: 0 0 4px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-dim); cursor: pointer; letter-spacing: 2px; }
.sorts button.on { color: #fff; border-bottom-color: var(--accent); }
.error { color: var(--danger); font-size: 13px; }
.ok { color: var(--ok); font-size: 13px; }
.empty { text-align: center; color: var(--text-faint); font-size: 13px; padding: 30px 0; }

.post { padding: 16px 18px; }
.post header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.post header b { color: #fff; font-size: 14px; }
.time { font-size: 11px; color: var(--text-faint); }
.add { margin-left: auto; padding: 4px 12px; font-size: 12px; }
.del { margin-left: auto; font-size: 12px; color: var(--text-faint); cursor: pointer; }
.add + .del { margin-left: 12px; }
.del:hover { color: var(--danger); }
.post-title { margin: 0 0 8px; font-size: 17px; color: #fff; letter-spacing: 1px; }
.text { user-select: text; white-space: pre-wrap; word-break: break-word; line-height: 1.7; font-size: 14px; color: var(--text); }
.file { margin-top: 10px; }
.actions { display: flex; gap: 18px; margin-top: 10px; font-size: 13px; color: var(--text-dim); }
.like { border: none; background: none; cursor: pointer; color: var(--text-dim); font-size: 13px; padding: 0; }
.like.on { color: var(--accent-strong); }
.fav.on { color: var(--gold); }
.likes { margin-top: 8px; font-size: 12px; color: var(--accent-strong); }
.comments { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; }
.comment { font-size: 13px; color: var(--text); display: flex; gap: 4px; }
.comment b { color: var(--accent); font-weight: normal; flex-shrink: 0; }
.comment-box { display: flex; gap: 8px; margin-top: 4px; }
.comment-box .btn { padding: 5px 12px; font-size: 12px; flex-shrink: 0; }
</style>
