<script setup>
import { ref, onMounted } from 'vue'
import { marked } from 'marked'

// 章节目录：[{ name: '入门篇', chapters: [{ id, no, title }] }]
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

// 页面一打开，就向后端要章节目录
onMounted(async () => {
  try {
    const res = await fetch('/api/chapters')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '加载失败')
    groups.value = data
    // 默认展开第一组
    if (data.length) openGroups.value[data[0].name] = true
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

// 点击某一章：向后端要这一章的原文，再把 Markdown 转成 HTML 显示
async function openChapter(c) {
  current.value = c
  content.value = ''
  contentLoading.value = true
  try {
    const res = await fetch('/api/chapters/' + c.id)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '加载失败')
    content.value = marked.parse(data.text)
  } catch (err) {
    content.value = `<p class="error">${err.message}</p>`
  }
  contentLoading.value = false
  if (readerEl.value) readerEl.value.scrollTop = 0
}

// 点击分组标题：展开 ↔ 收起
function toggle(name) {
  openGroups.value[name] = !openGroups.value[name]
}
</script>

<template>
  <div class="camp">
    <!-- 左侧：章节目录 -->
    <aside class="toc">
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
          </li>
        </ul>
      </div>
    </aside>

    <!-- 右侧：阅读区 -->
    <section class="reader" ref="readerEl">
      <div v-if="!current" class="hint">👈 从左边选一章开始训练</div>
      <div v-else-if="contentLoading" class="hint">正在打开第 {{ current.no }} 讲…</div>
      <article v-else class="article" v-html="content"></article>
    </section>
  </div>
</template>

<style scoped>
.camp { display: flex; gap: 24px; height: 100%; }
.toc {
  width: 240px; flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e5e7eb; padding-right: 12px;
}
.group { margin-bottom: 6px; }
.group-title {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border: none; border-radius: 8px;
  background: #f6f7f9; font-size: 14px; font-weight: bold; cursor: pointer; text-align: left;
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
.chapters li:hover { background: #f3f4f6; }
.chapters li.active { background: #e8eefb; color: #2556b6; font-weight: bold; }
.no { flex-shrink: 0; width: 32px; color: #9ca3af; font-size: 12px; }
.reader { flex: 1; overflow-y: auto; padding-right: 8px; }

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
.article :deep(img) { max-width: 100%; }
.article :deep(a) { color: #2556b6; }
.hint { color: #9ca3af; }
.error { color: #b91c1c; }
</style>
