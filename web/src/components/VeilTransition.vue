<!-- VeilTransition.vue：换页转场「光幕」 -->
<!-- 换页时，一道品红 + 霓虹青的光幕从左往右扫过屏幕，中间一条细亮的光线，扫过的地方新页面浮现出来 -->
<!-- 用法和原来的代码雨一样：父组件调用 play() 就播放一次 -->
<template>
  <div v-if="on" :key="n" class="veil">
    <div class="band"></div>
  </div>
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
  timer = setTimeout(() => (on.value = false), 1100) // 动画 1.1 秒，播完就移除
}
defineExpose({ play })
</script>

<style scoped>
/* 盖在所有内容最上面，但不挡鼠标 */
.veil { position: fixed; inset: 0; z-index: 999; pointer-events: none; overflow: hidden; }

/* 光幕：一条很宽、很模糊的紫色光带 */
.band {
  position: absolute; top: -10%; bottom: -10%; left: -70vw; width: 70vw;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 43, 214, 0.12) 30%,
    rgba(120, 245, 255, 0.4) 50%,
    rgba(0, 240, 255, 0.12) 70%,
    transparent);
  filter: blur(18px);
  transform: skewX(-12deg); /* 稍微斜一点，更有动感 */
  animation: sweep 1.1s cubic-bezier(0.65, 0, 0.35, 1) forwards; /* 慢 → 快 → 慢 */
}
/* 光带正中间一条细亮的光线 */
.band::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  background: #fff;
  box-shadow: 0 0 12px #fff, 0 0 40px rgba(0, 240, 255, 0.9);
}
@keyframes sweep {
  to { transform: translateX(180vw) skewX(-12deg); }
}
</style>
