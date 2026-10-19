<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import { useAiStore } from '../stores/ai.js'
import { useNotesStore } from '../stores/notes.js'
import MindmapModal from '../components/MindmapModal.vue'
import DefenseModal from '../components/DefenseModal.vue'
import { useUserStore } from '../stores/user.js'

// 章节目录：[{ name: '入门篇', chapters: [{ id, no, title }] }]
const route = useRoute() // 网址信息：从 AI 审计跳过来时会带上 ?chapter=
const groups = ref([])
// 哪些分组是展开的，例如 { '入门篇': true }
const openGroups = ref({})
// 当前选中的章节
const current = ref(null)
// 当前章节的正文（已经转换成 HTML）
const content = ref('')
const contentLoading = ref(false)
// 阅读区的 DOM 元素，用来换章时滚回顶部
const readerEl = ref(null)
// 加载状态和错误信息
const loading = ref(true)
const error = ref('')

// ===== 防御战：读完一章，漏洞小怪来攻击防御墙 =====
const userStore = useUserStore()
const defended = ref({})    // 守住过的章节：{ 章节id: 防御墙最好成绩 }
const alarm = ref(false)    // 底部的红色警报条
const showDefense = ref(false)
const alarmed = new Set()   // 这次打开网页后已经响过警报的章节，同一章不重复响

// 在正文里往下滚：滚到这一章的末尾（还没守住过），就拉响警报
function onReaderScroll(e) {
  selBtn.value = null
  const el = e.target
  if (!current.value || contentLoading.value || alarmed.has(current.value.id) || defended.value[current.value.id] > 0) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    alarmed.add(current.value.id)
    alarm.value = true
  }
}
function startDefense() {
  alarm.value = false
  showDefense.value = true
}
function onDefenseDone(wall) {
  defended.value[current.value.id] = Math.max(defended.value[current.value.id] || 0, wall)
}

// 页面一打开，就向后端要章节目录
onMounted(async () => {
  userStore.api('/api/camp').then((d) => (defended.value = d)).catch(() => {})
  try {
    const res = await fetch('/api/chapters')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '加载失败')
    groups.value = data
    // 默认展开第一组
    if (data.length) openGroups.value[data[0].name] = true
    // 从 AI 审计的「去训练营学这一章」跳过来：网址带着 ?chapter=S01，打开以它开头的那一章
    const want = String(route.query.chapter || '')
    if (want) {
      for (const g of data) {
        const c = g.chapters.find((c) => c.id === want || c.id.startsWith(want + '_'))
        if (c) {
          openGroups.value[g.name] = true
          openChapter(c)
          break
        }
      }
    }
  } catch (err) {
    error.value = err.message + '（后端开着吗？）'
  }
  loading.value = false
})

// 目录里只显示简短标题：去掉括号里的英文，例如
// 「函数 (external/internal/...)」→「函数」，完整标题鼠标悬停时显示
function shortTitle(title) {
  return title.replace(/\s*[（(][^）)]*[）)]/g, '').trim() || title
}

// 教材里的插图写的是相对路径（如 ./img/2-1.png），浏览器找不到，
// 所以改成后端的图片接口：/api/chapters/02_ValueTypes/files/img/2-1.png
function fixImages(html, id) {
  return html.replace(
    /(<img[^>]*src=")(?!https?:|data:|\/)(?:\.\/)?([^"]+)"/g,
    `$1/api/chapters/${id}/files/$2"`
  )
}

// 点击某一章：向后端要这一章的原文，再把 Markdown 转成 HTML 显示
async function openChapter(c) {
  current.value = c
  alarm.value = false
  content.value = ''
  contentLoading.value = true
  try {
    const res = await fetch('/api/chapters/' + c.id)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '加载失败')
    content.value = fixImages(marked.parse(data.text), c.id)
  } catch (err) {
    content.value = `<p class="error">${err.message}</p>`
  }
  contentLoading.value = false
  if (readerEl.value) readerEl.value.scrollTop = 0
}

// ===== 选中文字 → 问 AI =====
const ai = useAiStore()
// 选中文字后弹出的小按钮：{ x, y, text }，没选中时为 null
const selBtn = ref(null)

// 在正文里松开鼠标时，看看有没有选中文字
function onMouseUp() {
  const sel = window.getSelection()
  const text = sel.toString().trim()
  if (text.length < 2) {
    selBtn.value = null
    return
  }
  // 拿到选中文字在屏幕上的位置，把按钮放在它正下方
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  selBtn.value = { x: rect.left + rect.width / 2, y: rect.bottom + 8, text }
}

// 点击按钮：把选中的文字连同章节信息一起交给 AI
function askSelected() {
  const text = selBtn.value.text.slice(0, 300)
  ai.ask(`我正在读第 ${current.value.no} 讲「${current.value.title}」，请结合教材解释这段内容：\n「${text}」`)
  selBtn.value = null
  window.getSelection().removeAllRanges()
}

// 点击「存到笔记」：把选中的文字摘录进这一章的笔记
const notes = useNotesStore()
// 屏幕底部的小提示，2 秒后自动消失
const toast = ref('')
async function saveSelected() {
  const text = selBtn.value.text
  selBtn.value = null
  const note = await notes.clip(current.value, text)
  window.getSelection().removeAllRanges()
  toast.value = `📝 已存到笔记「${note.title}」`
  setTimeout(() => (toast.value = ''), 2000)
}

// ===== 思维导图 =====
const showMindmap = ref(false)

// ===== 点击插图放大 =====
// 正在放大查看的图片地址，空字符串表示没有放大
const zoomSrc = ref('')
function onArticleClick(e) {
  if (e.target.tagName === 'IMG') zoomSrc.value = e.target.src
}

// 点击分组标题：展开 ↔ 收起
function toggle(name) {
  openGroups.value[name] = !openGroups.value[name]
}
</script>

<template>
  <div class="camp">
    <!-- 左侧：章节目录 -->
    <aside class="toc glass">
      <div v-if="loading" class="hint">正在加载目录…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-for="g in groups" :key="g.name" class="group">
        <button class="group-title" @click="toggle(g.name)">
          <span class="arrow" :class="{ open: openGroups[g.name] }">▶</span>
          {{ g.name }}
          <span class="count">{{ g.chapters.length }}</span>
        </button>

        <ul v-if="openGroups[g.name]" class="chapters">
          <li
            v-for="c in g.chapters"
            :key="c.id"
            :class="{ active: current?.id === c.id }"
            :title="c.title"
            @click="openChapter(c)"
          >
            <span class="no">{{ c.no }}</span>
            <span class="name">{{ shortTitle(c.title) }}</span>
            <span v-if="defended[c.id] > 0" class="shield" title="防御墙守住了">🛡</span>
          </li>
        </ul>
      </div>
    </aside>

    <!-- 右侧：阅读区 -->
    <section class="reader glass" ref="readerEl" @scroll="onReaderScroll">
      <div v-if="!current" class="hint">👈 从左边选一章开始训练</div>
      <div v-else-if="contentLoading" class="hint">正在打开第 {{ current.no }} 讲…</div>
      <template v-else>
        <!-- 本章工具栏 -->
        <div class="tools">
          <button @click="showMindmap = true">🧠 本章思维导图</button>
          <button class="defense-btn" @click="startDefense">🛡 防御战{{ defended[current.id] > 0 ? ` · 最好 ${defended[current.id]}%` : '' }}</button>
        </div>
        <article class="article" v-html="content" @mouseup="onMouseUp" @click="onArticleClick"></article>
      </template>
    </section>

    <!-- 思维导图弹窗：换一章时 :key 变化，弹窗会重新生成 -->
    <MindmapModal v-if="showMindmap" :key="current.id" :chapter="current" @close="showMindmap = false" />

    <!-- 读到章末时的警报：漏洞小怪来了 -->
    <div v-if="alarm" class="alarm" @click="startDefense">
      ⚠️ 警报！漏洞小怪正在攻击「第 {{ current.no }} 讲」的防御墙，请尽快修复！
      <b>立即迎战 →</b>
      <a class="later" @click.stop="alarm = false">稍后</a>
    </div>
    <DefenseModal v-if="showDefense" :key="'d' + current.id" :chapter="current" @close="showDefense = false" @done="onDefenseDone" />

    <!-- 放大查看插图：点黑色背景任意位置关闭 -->
    <div v-if="zoomSrc" class="zoom" @click="zoomSrc = ''">
      <img :src="zoomSrc" />
    </div>

    <!-- 选中文字后出现的按钮：问 AI / 存到笔记 -->
    <div
      v-if="selBtn"
      class="sel-menu"
      :style="{ left: selBtn.x + 'px', top: selBtn.y + 'px' }"
      @mousedown.prevent
    >
      <button @click="askSelected">🤖 问 AI</button>
      <button @click="saveSelected">📝 存到笔记</button>
    </div>

    <!-- 底部小提示 -->
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* 整个训练营的底图：先铺 /camp/bg.jpg，图片还没放进来时显示下面的渐变 */
.camp {
  display: flex; gap: 20px; height: 100%;
  padding: 20px; border-radius: 16px;
  background:
    url('/camp/bg.jpg') center / cover no-repeat,
    linear-gradient(135deg, #c7d7fe 0%, #e9d5ff 50%, #fbcfe8 100%);
}
/* 毛玻璃卡片：半透明白色 + 把后面的底图模糊掉 */
.glass {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
}
.toc {
  width: 240px; flex-shrink: 0;
  overflow-y: auto;
  padding: 12px;
}
.group { margin-bottom: 6px; }
.group-title {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border: none; border-radius: 8px;
  background: rgba(255, 255, 255, 0.5); font-size: 14px; font-weight: bold; cursor: pointer; text-align: left;
}
.arrow { font-size: 10px; color: #9ca3af; transition: transform 0.2s; }
.arrow.open { transform: rotate(90deg); }  /* 展开时箭头转 90 度，变成朝下 */
.count { margin-left: auto; font-size: 12px; color: #9ca3af; font-weight: normal; }
.chapters { list-style: none; margin: 4px 0 0; padding: 0; }
.chapters li {
  display: flex; align-items: center;
  padding: 5px 10px 5px 24px; border-radius: 6px;
  font-size: 13px; cursor: pointer; color: #374151;
}
/* 标题太长时只显示一行，末尾用 … 代替 */
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chapters li:hover { background: rgba(255, 255, 255, 0.6); }
.chapters li.active { background: #e8eefb; color: #2556b6; font-weight: bold; }
.no { flex-shrink: 0; width: 32px; color: #9ca3af; font-size: 12px; }
.reader { flex: 1; overflow-y: auto; padding: 24px 32px; }

/* ===== 教材正文的排版 ===== */
/* v-html 塞进来的内容不受 scoped 管，所以要用 :deep() 才能给它们写样式 */
.article { max-width: 760px; line-height: 1.8; font-size: 15px; color: #1f2329; }
.article :deep(h1) { font-size: 24px; margin: 0 0 16px; }
.article :deep(h2) { font-size: 20px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
.article :deep(h3) { font-size: 17px; margin: 20px 0 8px; }
.article :deep(pre) {
  background: #1f2329; color: #e5e7eb;
  padding: 14px 16px; border-radius: 8px; overflow-x: auto;
  font-size: 13px; line-height: 1.6;
}
.article :deep(code) { font-family: Consolas, Menlo, monospace; }
.article :deep(:not(pre) > code) { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
.article :deep(blockquote) { margin: 12px 0; padding: 4px 16px; border-left: 4px solid #e5e7eb; color: #6b7280; }
.article :deep(table) { border-collapse: collapse; margin: 12px 0; }
.article :deep(th), .article :deep(td) { border: 1px solid #e5e7eb; padding: 6px 12px; }
.article :deep(img) { max-width: 100%; cursor: zoom-in; border-radius: 6px; }

/* 放大查看：黑色半透明背景铺满全屏，图片居中 */
.zoom {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.8); cursor: zoom-out;
}
.zoom img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }
.article :deep(a) { color: #2556b6; }
.hint { color: #9ca3af; }
.error { color: #b91c1c; }

/* 本章工具栏 */
.tools { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
.tools .defense-btn { border-color: #ff6b81; color: #c0264a; }
.shield { margin-left: auto; flex-shrink: 0; font-size: 12px; }

/* 章末警报：底部一条红色横幅，一闪一闪 */
.alarm {
  position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%); z-index: 70; cursor: pointer;
  display: flex; align-items: center; gap: 16px; padding: 14px 22px; white-space: nowrap;
  font-size: 15px; color: #fff; background: rgba(60, 4, 20, 0.95); border: 1px solid #ff6b81;
  box-shadow: 0 0 30px rgba(255, 107, 129, 0.6); animation: siren 1s ease-in-out infinite;
}
.alarm b { color: #fcee0a; }
.alarm .later { color: rgba(255, 255, 255, 0.5); font-size: 13px; }
@keyframes siren { 50% { box-shadow: 0 0 60px rgba(255, 107, 129, 0.95); border-color: #fcee0a; } }
.tools button {
  padding: 6px 14px; border: 1px solid #e5e7eb; border-radius: 999px;
  background: rgba(255, 255, 255, 0.8); font-size: 13px; cursor: pointer;
}
.tools button:hover { background: #e8eefb; border-color: #2556b6; color: #2556b6; }

/* 选中文字后弹出的按钮组：固定在屏幕上，跟着选中位置走 */
.sel-menu {
  position: fixed; transform: translateX(-50%); z-index: 50;
  display: flex; overflow: hidden; border-radius: 999px;
  background: #1f2329; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}
.sel-menu button {
  padding: 6px 14px; border: none; background: none;
  color: #fff; font-size: 13px; cursor: pointer;
}
.sel-menu button + button { border-left: 1px solid rgba(255, 255, 255, 0.2); }
.sel-menu button:hover { background: #2556b6; }

/* 底部小提示 */
.toast {
  position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 60;
  padding: 10px 20px; border-radius: 999px;
  background: #1f2329; color: #fff; font-size: 14px;
}
</style>
