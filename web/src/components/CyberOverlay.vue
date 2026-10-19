<!-- CyberOverlay.vue：盖在所有背景上面的「赛博朋克滤镜」 -->
<!--
  不管选了哪个背景，都会叠上这一层，所以所有主题都会带上同样的赛博朋克味道：
  暗角：四周压暗，视线集中在中间（扫描线、扫描光带已按要求去掉）
  情绪光：让背景跟着游戏一起变 —— 进入战斗时，整个世界笼罩在这只怪兽的颜色里；
          被怪兽反击时红光一闪；打败怪兽时光芒从中间扩散开（游戏里调用 theme.setMood / theme.flash）
  它在背景上面、页面内容下面，而且不挡鼠标
-->
<template>
  <div class="cyber-overlay">
    <div class="mood" :style="{ '--mood': theme.mood || 'transparent', opacity: theme.mood ? 1 : 0 }"></div>
    <!-- :key 每次闪光都不一样，Vue 会重新创建这个元素，动画就会从头再播一遍 -->
    <div v-if="theme.pulse" :key="theme.pulse.id" :class="['pulse', theme.pulse.kind]"></div>
    <div class="vignette"></div>
  </div>
</template>

<script setup>
import { useThemeStore } from '../stores/theme.js'
const theme = useThemeStore()
</script>

<style scoped>
/* z-index 和背景一样是 -1，但写在背景后面，所以会盖在背景上面、页面内容下面 */
.cyber-overlay { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.cyber-overlay > div { position: absolute; inset: 0; }

/* 情绪光：从屏幕下方升起的一层怪兽色，颜色变化时 1.5 秒慢慢过渡 */
.mood {
  background:
    radial-gradient(ellipse at 50% 110%, color-mix(in srgb, var(--mood) 45%, transparent), transparent 65%),
    radial-gradient(ellipse at 15% 20%, color-mix(in srgb, var(--mood) 18%, transparent), transparent 50%);
  transition: opacity 1.5s, background 1.5s;
}

/* 被反击：四周红光一闪 */
.pulse.hurt { animation: hurt 0.6s ease-out forwards; box-shadow: inset 0 0 220px rgba(255, 30, 70, 0.75); }
@keyframes hurt { from { opacity: 1; } to { opacity: 0; } }

/* 打败怪兽：一圈光从中间扩散到全屏 */
.pulse.win {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5), color-mix(in srgb, var(--accent) 30%, transparent) 30%, transparent 60%);
  animation: burst 1.4s ease-out forwards;
}
@keyframes burst { from { opacity: 1; transform: scale(0.2); } to { opacity: 0; transform: scale(2.2); } }

/* 暗角 */
.vignette { background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%); }
</style>
