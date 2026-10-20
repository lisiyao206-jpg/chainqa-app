<script setup lang="ts">
// 情报收集文件夹（放在情报站里，原来叫「学习站」）：我点赞过、收藏过的帖子都收在这里，方便随时复习
// 分两栏：视频（带视频的帖子，排成网格）/ 笔记·文本（其余的帖子，排成列表，可以展开看全文）
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUserStore } from '../stores/user'
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

const userStore = useUserStore()
const kind = ref<'video' | 'text'>('video')
// 两栏的数据一打开页面就一起取回来，切换栏目时只是「显示 / 隐藏」，不再重新请求。
// 以前每次切换都重新请求：点得快的时候，旧请求的结果可能比新请求晚回来，把内容盖掉，看起来就是「第二次点击内容不见了」
const lists = ref<{ video: Post[]; text: Post[] }>({ video: [], text: [] })
const items = computed(() => lists.value[kind.value])
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const open = ref<Record<number, boolean>>({}) // 笔记·文本：哪几条展开了全文 { 帖子id: true }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [video, text] = await Promise.all([
      userStore.api<Post[]>('/api/social/study?kind=video'),
      userStore.api<Post[]>('/api/social/study?kind=text'),
    ])
    lists.value = { video, text }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ===== 搜索：帮你筛选信息 =====
// 1. 按「一个一个字」匹配：输入的每个字在标题 / 正文 / 作者 / 文件名里依次出现就算找到，
//    中间隔着别的字也没关系，例如输入「重攻」也能找到「重入攻击」——记不全名字也能搜到
// 2. 视频和笔记一起搜：记不清是视频还是笔记也没关系，结果里会标出是哪一种，还可以再按类型筛
const chars = computed(() => [...keyword.value.toLowerCase()].filter((c) => c.trim()))
const searching = computed(() => chars.value.length > 0)
const resultKind = ref<'all' | 'video' | 'text'>('all') // 搜索结果再筛一次：all 全部 / video 视频 / text 笔记

function matchChars(text: string, cs: string[]) {
  let i = 0
  for (const c of text.toLowerCase()) if (c === cs[i]) i++
  return i === cs.length
}
const fields = (p: Post) => [p.title, p.text, p.author.nickname, p.file?.name]
const hits = computed(() => ({
  video: lists.value.video.filter((p) => fields(p).some((s) => s && matchChars(s, chars.value))),
  text: lists.value.text.filter((p) => fields(p).some((s) => s && matchChars(s, chars.value))),
}))
const results = computed(() =>
  resultKind.value === 'all'
    ? [...hits.value.video, ...hits.value.text].sort((a, b) => b.id - a.id)
    : hits.value[resultKind.value],
)
const shown = computed(() => items.value) // 没在搜索时：当前栏目的全部内容

// 高亮：把匹配上的字标出来，一眼看出「为什么搜到了它」
// 返回 [{ t: '重', hit: true }, { t: '入', hit: false }, ...]；这一段文字没有完整匹配上就不高亮
function highlight(text: string | null) {
  if (!text || !searching.value || !matchChars(text, chars.value)) return [{ t: text, hit: false }]
  let i = 0
  return [...text].map((c) => {
    const hit = i < chars.value.length && c.toLowerCase() === chars.value[i]
    if (hit) i++
    return { t: c, hit }
  })
}

// 跳转：从搜索结果跳到它所在的栏目（视频 / 笔记），滚到那一条并闪一下
// 比如你停在「视频」栏，搜到的是一篇笔记，点「跳转」就会切到「笔记 / 文本」栏并定位到它
const flash = ref<number | null>(null) // 正在闪烁的那条帖子 id
async function jump(p: Post) {
  kind.value = p.file?.isVideo ? 'video' : 'text'
  keyword.value = ''
  open.value[p.id] = true // 笔记直接展开全文
  flash.value = p.id
  await nextTick()
  document.getElementById('study-' + p.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => flash.value === p.id && (flash.value = null), 2000)
}

async function remove(p: Post) {
  if (!confirm('移出情报收集文件夹？（会同时取消点赞和收藏）')) return
  await userStore.api(`/api/social/study/${p.id}`, null, 'DELETE')
  // 搜索结果里移出时，不一定是当前栏目，所以两栏都删一下
  lists.value = { video: lists.value.video.filter((x) => x.id !== p.id), text: lists.value.text.filter((x) => x.id !== p.id) }
}

// 列表里只显示前 80 个字，点「展开」看全文
const preview = (p: Post) => (open.value[p.id] || p.text.length <= 80 ? p.text : p.text.slice(0, 80) + '…')
const shortTime = (t: string) => t.slice(0, 10)
</script>

<template>
  <div class="study">
    <div class="toolbar">
      <div class="kinds">
        <!-- 搜索时两个栏目都不高亮（结果是两栏一起搜的）；点栏目会清空搜索，回到这一栏 -->
        <button :class="{ on: !searching && kind === 'video' }" @click="kind = 'video'; keyword = ''">🎬 视频 <small>{{ lists.video.length }}</small></button>
        <button :class="{ on: !searching && kind === 'text' }" @click="kind = 'text'; keyword = ''">📝 笔记 / 文本 <small>{{ lists.text.length }}</small></button>
      </div>
      <input v-model="keyword" class="input search" placeholder="🔍 记得几个字就行，视频和笔记一起搜" />
    </div>
    <p class="intro">📁 在广场或好友圈里点 ♡ 赞 或 ☆ 收藏 的帖子，都会自动收进这个文件夹。</p>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="empty">加载中…</div>

    <!-- ===== 搜索结果：视频和笔记混在一起，按类型再筛 ===== -->
    <section v-else-if="searching" class="results">
      <div class="result-head">
        <span>找到 <b>{{ hits.video.length + hits.text.length }}</b> 条</span>
        <button :class="{ on: resultKind === 'all' }" @click="resultKind = 'all'">全部</button>
        <button :class="{ on: resultKind === 'video' }" @click="resultKind = 'video'">🎬 视频 {{ hits.video.length }}</button>
        <button :class="{ on: resultKind === 'text' }" @click="resultKind = 'text'">📝 笔记 {{ hits.text.length }}</button>
        <a class="clear" @click="keyword = ''">清空搜索</a>
      </div>
      <div v-if="!results.length" class="empty">没有找到相关内容，少输几个字试试</div>
      <article v-for="p in results" :key="'r' + p.id" class="note panel">
        <div class="meta">
          <span :class="['badge', p.file?.isVideo ? 'v' : 't']">{{ p.file?.isVideo ? '🎬 视频' : '📝 笔记' }}</span>
          <UserAvatar :user="p.author" :size="22" />
          <span><template v-for="(s, i) in highlight(p.author.nickname)" :key="i"><mark v-if="s.hit">{{ s.t }}</mark><template v-else>{{ s.t }}</template></template> · {{ shortTime(p.time) }}</span>
          <a class="jump" @click="jump(p)">跳转到{{ p.file?.isVideo ? '视频' : '笔记' }}栏 →</a>
          <a class="remove" @click="remove(p)">移出</a>
        </div>
        <h4 v-if="p.title"><template v-for="(s, i) in highlight(p.title)" :key="i"><mark v-if="s.hit">{{ s.t }}</mark><template v-else>{{ s.t }}</template></template></h4>
        <div v-if="p.text" class="text"><template v-for="(s, i) in highlight(p.text)" :key="i"><mark v-if="s.hit">{{ s.t }}</mark><template v-else>{{ s.t }}</template></template></div>
        <FileChip v-if="p.file" :file="p.file" class="file" />
      </article>
    </section>

    <div v-else-if="!shown.length" class="empty">
      {{ kind === 'video' ? '还没有收藏视频，去广场看看大家分享的讲解视频吧' : '还没有收藏笔记，去广场或好友圈收藏一些学习心得吧' }}
    </div>

    <!-- 视频：网格，每格一个视频卡片 -->
    <!-- 用 v-show 而不是 v-if：切换栏目、搜索时卡片不会被销毁再重建，视频播放进度、展开状态也都还在 -->
    <div v-show="!searching && kind === 'video'" class="grid">
      <article v-for="p in lists.video" :id="'study-' + p.id" :key="p.id" :class="['card', 'panel', { flash: flash === p.id }]">
        <FileChip :file="p.file!" />
        <h4>{{ p.title || p.text.slice(0, 30) || p.file!.name }}</h4>
        <div class="meta">
          <UserAvatar :user="p.author" :size="22" />
          <span>{{ p.author.nickname }} · {{ shortTime(p.time) }}</span>
          <span class="tags"><i v-if="p.favorited" class="fav">★</i><i v-if="p.liked" class="liked">♥</i></span>
          <a class="remove" @click="remove(p)">移出</a>
        </div>
      </article>
    </div>

    <!-- 笔记 / 文本：列表，可以展开全文 -->
    <div v-show="!searching && kind === 'text'" class="list">
      <article v-for="p in lists.text" :id="'study-' + p.id" :key="p.id" :class="['note', 'panel', { flash: flash === p.id }]">
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
.results { display: flex; flex-direction: column; gap: 14px; }
.result-head { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-dim); }
.result-head b { color: var(--gold); font-size: 16px; }
.result-head button {
  padding: 4px 12px; cursor: pointer; font-size: 12px; border-radius: 999px;
  color: var(--text-dim); background: none; border: 1px solid var(--line);
}
.result-head button.on { color: #05020f; background: var(--accent); border-color: var(--accent); }
.clear { margin-left: auto; cursor: pointer; color: var(--text-faint); }
.badge { padding: 1px 8px; font-size: 11px; border-radius: 999px; }
.badge.v { color: var(--accent-strong); border: 1px solid var(--accent-strong); }
.badge.t { color: var(--accent); border: 1px solid var(--accent); }
/* 搜到的字：霓虹黄高亮 */
mark { background: rgba(252, 238, 10, 0.25); color: var(--gold); padding: 0 1px; }
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
.jump { margin-left: auto; cursor: pointer; color: var(--accent); }
.jump:hover { text-shadow: 0 0 8px var(--accent); }
.remove { margin-left: auto; cursor: pointer; color: var(--text-faint); }
.jump + .remove { margin-left: 14px; }
/* 跳转过来的那一条：边框闪两下霓虹黄 */
.flash { animation: flash 0.6s ease-in-out 3; }
@keyframes flash {
  50% { border-color: var(--gold); box-shadow: 0 0 24px rgba(252, 238, 10, 0.45); }
}
.remove:hover { color: var(--danger); }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .search { max-width: none; width: 100%; }
  .grid { grid-template-columns: 1fr; }
}
</style>
