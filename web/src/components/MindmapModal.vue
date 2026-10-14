<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

// 从外面传进来：哪一章（chapter 里有 id、no、title）
const props = defineProps({ chapter: Object })
// 通知外面「关闭我」
const emit = defineEmits(['close'])

const loading = ref(true)
const error = ref('')
// 画导图用的 <svg> 元素
const svgEl = ref(null)

onMounted(async () => {
  try {
    const res = await fetch(`/api/chapters/${props.chapter.id}/mindmap`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '生成失败')
    loading.value = false
    await nextTick() // 等 <svg> 显示出来再画
    // 把 Markdown 大纲转成树，再画成可以点击展开/收起的思维导图
    const { root } = new Transformer().transform(data.markdown)
    Markmap.create(svgEl.value, { duration: 300, maxWidth: 260 }, root)
  } catch (err) {
    error.value = err.message
    loading.value = false
  }
})
</script>

<template>
  <!-- 点黑色背景关闭；点白色卡片里面不关闭（.self 只认点在背景本身上） -->
  <div class="mask" @click.self="emit('close')">
    <div class="card">
      <header>
        <span>🧠 第 {{ chapter.no }} 讲 · 思维导图</span>
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
  background: rgba(0, 0, 0, 0.5);
}
.card {
  width: min(1000px, 92vw); height: min(680px, 86vh);
  display: flex; flex-direction: column;
  background: #fff; border-radius: 14px; padding: 16px 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; }
.close { border: none; background: none; font-size: 18px; cursor: pointer; color: #6b7280; }
.map { flex: 1; width: 100%; }
.hint { margin: auto; color: #9ca3af; }
.error { margin: auto; color: #b91c1c; }
footer { font-size: 12px; color: #9ca3af; text-align: center; }
</style>
