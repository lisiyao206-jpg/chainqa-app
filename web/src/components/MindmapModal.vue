<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import type { Chapter } from '../types'

// 从外面传进来：哪一章（chapter 里有 id、no、title）
const props = defineProps<{ chapter?: Chapter }>()
// 通知外面「关闭我」
const emit = defineEmits(['close'])

const loading = ref(true)
const error = ref('')
// 画导图用的 <svg> 元素
const svgEl = ref<SVGSVGElement | null>(null)

onMounted(async () => {
  try {
    const res = await fetch(`/api/chapters/${props.chapter!.id}/mindmap`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '生成失败')
    loading.value = false
    await nextTick() // 等 <svg> 显示出来再画
    // 把 Markdown 大纲转成树，再画成可以点击展开/收起的思维导图
    const { root } = new Transformer().transform(data.markdown)
    Markmap.create(svgEl.value!, { duration: 300, maxWidth: 260 }, root)
  } catch (err) {
    error.value = (err as Error).message
    loading.value = false
  }
})
</script>

<template>
  <!-- 点黑色背景关闭；点白色卡片里面不关闭（.self 只认点在背景本身上） -->
  <div class="mask" @click.self="emit('close')">
    <div class="card">
      <header>
        <span>🧠 第 {{ chapter!.no }} 讲 · 思维导图</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>
      <div v-if="loading" class="hint">AI 正在读这一讲，整理导图中…（第一次要等十几秒）</div>
      <div v-else-if="error" class="error">出错了：{{ error }}</div>
      <svg v-show="!loading && !error" ref="svgEl" class="map"></svg>
      <footer v-if="!loading && !error">点圆点可以展开 / 收起，滚轮缩放，拖动平移</footer>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
}
.card {
  width: min(1000px, 92vw); height: min(680px, 86vh);
  display: flex; flex-direction: column;
  background: var(--glass-strong); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 16px 20px;
  backdrop-filter: var(--blur); box-shadow: 0 0 40px rgba(0, 240, 255, 0.2);
}
header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; color: #fff; }
.close { border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text-dim); }
.map { flex: 1; width: 100%; }
/* 思维导图在暗色底上：文字改成浅色，连线保持彩色 */
.map { --markmap-text-color: var(--text); color: var(--text); }
.map :deep(foreignObject), .map :deep(text) { color: var(--text); fill: var(--text); }
.hint { margin: auto; color: var(--text-faint); }
.error { margin: auto; color: var(--danger); }
footer { font-size: 12px; color: var(--text-faint); text-align: center; }
</style>
