<!-- CyberOverlay.vue：盖在所有背景上面的「赛博朋克滤镜」 -->
<!--
  不管选了哪个背景，都会叠上这一层，所以所有主题都会带上同样的赛博朋克味道：
  暗角：四周压暗，视线集中在中间（扫描线、扫描光带已按要求去掉）
  它在背景上面、页面内容下面，而且不挡鼠标
-->
<template>
  <div class="cyber-overlay">
    <div class="vignette"></div>
  </div>
</template>

<style scoped>
/* z-index 和背景一样是 -1，但写在背景后面，所以会盖在背景上面、页面内容下面 */
.cyber-overlay { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.cyber-overlay > div { position: absolute; inset: 0; }

/* 暗角 */
.vignette { background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%); }
</style>
