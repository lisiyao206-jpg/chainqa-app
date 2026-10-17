<script setup>
// 学习站：我点赞过、收藏过的帖子都收在这里，方便随时复习
// 分两栏：视频（带视频的帖子，排成网格）/ 笔记·文本（其余的帖子，排成列表，可以展开看全文）
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import FileChip from './FileChip.vue'
import UserAvatar from './UserAvatar.vue'

const userStore = useUserStore()
const kind = ref('video')
// 两栏的数据一打开页面就一起取回来，切换栏目时只是「显示 / 隐藏」，不再重新请求。
// 以前每次切换都重新请求：点得快的时候，旧请求的结果可能比新请求晚回来，把内容盖掉，看起来就是「第二次点击内容不见了」
const lists = ref({ video: [], text: [] })
const items = computed(() => lists.value[kind.value])
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const open = ref({}) // 笔记·文本：哪几条展开了全文 { 帖子id: true }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [video, text] = await Promise.all([
      userStore.api('/api/social/study?kind=video'),
      userStore.api('/api/social/study?kind=text'),
    ])
    lists.value = { video, text }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

// 搜索：按「一个一个字」匹配。输入的每个字都在标题 / 正文 / 作者里依次出现就算找到，
// 中间隔着别的字也没关系，例如输入「重攻」也能找到「重入攻击」
function matchChars(text, chars) {
  let i = 0
  for (const c of text.toLowerCase()) if (c === chars[i]) i++
  return i === chars.length
}
const shown = computed(() => {
  const chars = [...keyword.value.toLowerCase()].filter((c) => c.trim())
  if (!chars.length) return items.value
  return items.value.filter((p) => [p.title, p.text, p.author.nickname].some((s) => s && matchChars(s, chars)))
})

async function remove(p) {
  if (!confirm('移出学习站？（会同时取消点赞和收藏）')) return
  await userStore.api(`/api/social/study/${p.id}`, null, 'DELETE')
  lists.value[kind.value] = lists.value[kind.value].filter((x) => x.id !== p.id)
}

// 列表里只显示前 80 个字，点「展开」看全文
const preview = (p) => (open.value[p.id] || p.text.length <= 80 ? p.text : p.text.slice(0, 80) + '…')
const shortTime = (t) => t.slice(0, 10)
</script>

<template>
  <div class="study">
    <div class="toolbar">
      <div class="kinds">
        <button :class="{ on: kind === 'video' }" @click="kind = 'video'">🎬 视频 <small>{{ lists.video.length }}</small></button>
        <button :class="{ on: kind === 'text' }" @click="kind = 'text'">📝 笔记 / 文本 <small>{{ lists.text.length }}</small></button>
      </div>
      <input v-model="keyword" class="input search" placeholder="搜索标题、内容、作者" />
    </div>
    <p class="intro">在广场或好友圈里点 ♡ 赞 或 ☆ 收藏 的帖子，都会自动收进这里。</p>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!shown.length" class="empty">
      {{ keyword ? '没有找到相关内容' : kind === 'video' ? '还没有收藏视频，去广场看看大家分享的讲解视频吧' : '还没有收藏笔记，去广场或好友圈收藏一些学习心得吧' }}
    </div>

    <!-- 视频：网格，每格一个视频卡片 -->
    <!-- 用 v-show 而不是 v-if：切换栏目时卡片不会被销毁再重建，视频播放进度、展开状态也都还在 -->
    <div v-show="kind === 'video'" class="grid">
      <article v-for="p in kind === 'video' ? shown : lists.video" :key="p.id" class="card panel">
        <FileChip :file="p.file" />
        <h4>{{ p.title || p.text.slice(0, 30) || p.file.name }}</h4>
        <div class="meta">
          <UserAvatar :user="p.author" :size="22" />
          <span>{{ p.author.nickname }} · {{ shortTime(p.time) }}</span>
          <span class="tags"><i v-if="p.favorited" class="fav">★</i><i v-if="p.liked" class="liked">♥</i></span>
          <a class="remove" @click="remove(p)">移出</a>
        </div>
      </article>
    </div>

    <!-- 笔记 / 文本：列表，可以展开全文 -->
    <div v-show="kind === 'text'" class="list">
      <article v-for="p in kind === 'text' ? shown : lists.text" :key="p.id" class="note panel">
        <div class="meta">
          <UserAvatar :user="p.author" :size="24" />
          <span>{{ p.author.nickname }} · {{ shortTime(p.time) }}</span>
          <span class="tags"><i v-if="p.favorited" class="fav">★ 收藏</i><i v-if="p.liked" class="liked">♥ 点赞</i></span>
          <a class="remove" @click="remove(p)">移出</a>
        </div>
        <h4 v-if="p.title">{{ p.title }}</h4>
        <div v-if="p.text" class="text">{{ preview(p) }}</div>
        <a v-if="p.text.length > 80" class="more" @click="open[p.id] = !open[p.id]">{{ open[p.id] ? '收起' : '展开全文' }}</a>
        <FileChip v-if="p.file" :file="p.file" class="file" />
      </article>
    </div>
  </div>
</template>

<style scoped>
.study { max-width: 1000px; margin: 0 auto; padding-bottom: 30px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.kinds { display: flex; gap: 8px; }
.kinds button {
  padding: 8px 18px; cursor: pointer; font-size: 14px; letter-spacing: 1px;
  color: var(--text-dim); background: rgba(255, 255, 255, 0.03); border: 1px solid var(--line);
}
.kinds button.on { color: #fff; border-color: var(--accent); background: rgba(0, 240, 255, 0.12); box-shadow: 0 0 14px rgba(0, 240, 255, 0.2); }
.search { max-width: 260px; }
.intro { margin: 12px 0 18px; font-size: 12px; color: var(--text-faint); }
.error { color: var(--danger); font-size: 13px; }
.empty { text-align: center; color: var(--text-faint); font-size: 13px; padding: 40px 0; }

/* 卡片用不透明的深色底，不用毛玻璃（backdrop-filter）：
   毛玻璃盖在 3D 动态背景上时，有些电脑的显卡会画不出来，内容就「消失」了 */
.panel { background: rgba(8, 6, 24, 0.9); border: 1px solid var(--line); border-radius: var(--radius); }
.kinds small { margin-left: 4px; font-size: 11px; color: var(--text-faint); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
.card { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.card h4, .note h4 { margin: 0; font-size: 15px; color: #fff; letter-spacing: 1px; }

.list { display: flex; flex-direction: column; gap: 14px; }
.note { padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; }
.text { white-space: pre-wrap; word-break: break-word; line-height: 1.7; font-size: 14px; color: var(--text); }
.more { font-size: 12px; color: var(--accent); cursor: pointer; }
.file { align-self: flex-start; }

.meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-faint); }
.tags { display: flex; gap: 8px; }
.tags i { font-style: normal; }
.tags .fav { color: var(--gold); }
.tags .liked { color: var(--accent-strong); }
.remove { margin-left: auto; cursor: pointer; color: var(--text-faint); }
.remove:hover { color: var(--danger); }
</style>
