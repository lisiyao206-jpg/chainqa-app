<!-- VeilTransition.vue：换页转场「柔和淡入」 -->
<!-- 换页时，屏幕先蒙上一层深色，再慢慢褪去，新页面从暗处浮现出来；不用亮光，看着不晃眼 -->
<!-- 用法：父组件调用 play() 就播放一次 -->
<template>
  <div v-if="on" :key="n" class="veil"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const on = ref(false)
const n = ref(0) // 每次播放都换一个 key，让动画从头再播
let timer: ReturnType<typeof setTimeout> | undefined

function play() {
  n.value++
  on.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (on.value = false), 500) // 动画 0.5 秒，播完就移除
}
defineExpose({ play })
</script>

<style scoped>
/* 盖在所有内容最上面，但不挡鼠标：和全站底色一样的深色，从不透明慢慢变透明 */
.veil {
  position: fixed; inset: 0; z-index: 999; pointer-events: none;
  background: var(--bg);
  animation: fade 0.5s ease-out forwards;
}
@keyframes fade {
  from { opacity: 0.85; }
  to { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .veil { display: none; } }
</style>
