<script setup>
// 好友圈：发动态（文字 + 可选一个文件/图片），好友可以点赞、评论
// 只有自己和好友能看到；评论也只显示好友写的（和微信朋友圈一样）
import { ref, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import { uploadFile } from '../utils/files.js'
import FileChip from './FileChip.vue'
import UserAvatar from './UserAvatar.vue'

const userStore = useUserStore()
const posts = ref([])
const text = ref('')
const attached = ref(null) // 已上传、准备随动态一起发的文件
const busy = ref(false)
const error = ref('')
const drafts = ref({})     // 每条动态下面评论框里正在写的字：{ 动态id: 文字 }
const fileInput = ref(null)
let timer

async function load() {
  try {
    posts.value = await userStore.api('/api/social/posts')
  } catch (e) {
    error.value = e.message
  }
}
onMounted(() => {
  load()
  timer = setInterval(load, 15000) // 每 15 秒刷新一次，看看好友有没有新动态
})
onUnmounted(() => clearInterval(timer))

// 统一处理：执行操作 → 出错就显示 → 最后重新加载列表
async function act(fn) {
  error.value = ''
  try {
    await fn()
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function pickFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  busy.value = true
  try {
    attached.value = await uploadFile(file)
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

function publish() {
  return act(async () => {
    await userStore.api('/api/social/posts', { text: text.value, fileId: attached.value?.id })
    text.value = ''
    attached.value = null
  })
}
const like = (p) => act(() => userStore.api(`/api/social/posts/${p.id}/like`, {}))
const remove = (p) => confirm('删除这条动态？') && act(() => userStore.api(`/api/social/posts/${p.id}`, null, 'DELETE'))
const removeComment = (c) => act(() => userStore.api(`/api/social/comments/${c.id}`, null, 'DELETE'))
function comment(p) {
  const t = (drafts.value[p.id] || '').trim()
  if (!t) return
  return act(async () => {
    await userStore.api(`/api/social/posts/${p.id}/comments`, { text: t })
    drafts.value[p.id] = ''
  })
}

const shortTime = (t) => t.slice(5, 16).replace('T', ' ')
</script>

<template>
  <div class="feed">
    <!-- 发动态 -->
    <div class="composer glass">
      <textarea v-model="text" rows="3" maxlength="500" placeholder="分享今天学到的知识、遇到的难题……"></textarea>
      <div class="bar">
        <button class="btn" :disabled="busy" @click="fileInput.click()">📎 {{ busy ? '上传中…' : '附件 / 图片' }}</button>
        <input ref="fileInput" type="file" hidden @change="pickFile" />
        <span v-if="attached" class="attached">{{ attached.name }} <a @click="attached = null">✕</a></span>
        <span class="len">{{ text.length }} / 500</span>
        <button class="btn primary" :disabled="busy || (!text.trim() && !attached)" @click="publish">发布</button>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="!posts.length" class="empty">还没有动态。加几个好友，或者先发一条吧</div>

    <article v-for="p in posts" :key="p.id" class="post glass">
      <header>
        <UserAvatar :user="p.author" :size="38" />
        <div>
          <b>{{ p.author.nickname }}</b>
          <div class="time">{{ shortTime(p.time) }}</div>
        </div>
        <a v-if="p.mine" class="del" @click="remove(p)">删除</a>
      </header>
      <div v-if="p.text" class="text">{{ p.text }}</div>
      <FileChip v-if="p.file" :file="p.file" class="file" />

      <div class="actions">
        <button :class="['like', { on: p.liked }]" @click="like(p)">{{ p.liked ? '♥' : '♡' }} {{ p.likes.length || '赞' }}</button>
      </div>
      <div v-if="p.likes.length" class="likes">♥ {{ p.likes.join('、') }}</div>

      <div class="comments">
        <div v-for="c in p.comments" :key="c.id" class="comment">
          <b>{{ c.from.nickname }}：</b>{{ c.text }}
          <a v-if="c.mine" class="del" @click="removeComment(c)">删除</a>
        </div>
        <form class="comment-box" @submit.prevent="comment(p)">
          <input v-model="drafts[p.id]" class="input" maxlength="200" placeholder="写评论…" />
          <button class="btn">评论</button>
        </form>
      </div>
    </article>
  </div>
</template>

<style scoped>
.feed { max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; padding-bottom: 30px; }
.composer { padding: 14px 16px; }
.composer textarea {
  width: 100%; resize: vertical; padding: 8px 10px; font-size: 14px; font-family: var(--font); line-height: 1.6;
  color: var(--text); background: rgba(6, 4, 20, 0.6); border: 1px solid var(--line-strong); outline: none;
}
.composer textarea:focus { border-color: var(--accent); }
.bar { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.attached { font-size: 12px; color: var(--accent); }
.attached a { cursor: pointer; margin-left: 4px; }
.len { margin-left: auto; font-size: 12px; color: var(--text-faint); }
.error { color: var(--danger); font-size: 13px; }
.empty { text-align: center; color: var(--text-faint); font-size: 13px; padding: 30px 0; }

.post { padding: 16px 18px; }
.post header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.avatar {
  width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line-strong); color: #fff; font-size: 14px; background: rgba(0, 240, 255, 0.08);
}
.post header b { color: #fff; font-size: 14px; }
.time { font-size: 11px; color: var(--text-faint); }
.del { margin-left: auto; font-size: 12px; color: var(--text-faint); cursor: pointer; }
.del:hover { color: var(--danger); }
.text { white-space: pre-wrap; word-break: break-word; line-height: 1.7; font-size: 14px; color: var(--text); }
.file { margin-top: 10px; }
.actions { margin-top: 10px; }
.like { border: none; background: none; cursor: pointer; color: var(--text-dim); font-size: 13px; padding: 0; }
.like.on { color: var(--accent-strong); }
.likes { margin-top: 8px; font-size: 12px; color: var(--accent-strong); }
.comments { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; }
.comment { font-size: 13px; color: var(--text); display: flex; gap: 4px; }
.comment b { color: var(--accent); font-weight: normal; }
.comment-box { display: flex; gap: 8px; margin-top: 4px; }
.comment-box .btn { padding: 5px 12px; font-size: 12px; flex-shrink: 0; }
</style>
