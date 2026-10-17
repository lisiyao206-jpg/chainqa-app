<!-- CyberOverlay.vue：盖在所有背景上面的「赛博朋克滤镜」 -->
<!--
  不管选了哪个背景，都会叠上这一层，所以所有主题都会带上同样的赛博朋克味道：
  1. 扫描线：一条条很细的横线，像老式显示器
  2. 扫描光带：一道淡淡的亮带从上往下慢慢扫过
  3. 暗角：四周压暗，视线集中在中间
  它在背景上面、页面内容下面，而且不挡鼠标
-->
<template>
  <div class="cyber-overlay">
    <div class="scanlines"></div>
    <div class="sweep"></div>
    <div class="vignette"></div>
  </div>
</template>

<style scoped>
/* z-index 和背景一样是 -1，但写在背景后面，所以会盖在背景上面、页面内容下面 */
.cyber-overlay { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.cyber-overlay > div { position: absolute; inset: 0; }

/* 扫描线：每 3 像素一条暗线 */
.scanlines {
  background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.22) 0, rgba(0, 0, 0, 0.22) 1px, transparent 1px, transparent 3px);
}

/* 扫描光带：一条淡青色的亮带，8 秒从上扫到下 */
.sweep {
  background: linear-gradient(to bottom, transparent 0%, rgba(0, 240, 255, 0.06) 48%, rgba(0, 240, 255, 0.1) 50%, rgba(0, 240, 255, 0.06) 52%, transparent 100%);
  height: 30%;
  animation: sweep 8s linear infinite;
}
@keyframes sweep {
  from { transform: translateY(-100%); }
  to { transform: translateY(400%); }
}

/* 暗角 */
.vignette { background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%); }
</style>
