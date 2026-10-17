<script setup>
// 学习站页面：标题 + 学习站内容（StudyStation.vue）
import StudyStation from '../components/StudyStation.vue'
</script>

<template>
  <div class="study-page">
    <div class="head">
      <div class="eyebrow">Study Station</div>
      <h2>学习站</h2>
    </div>
    <StudyStation />
  </div>
</template>

<style scoped>
.study-page { color: var(--text); }
.head { text-align: center; margin-bottom: 20px; }
.head h2 { margin: 6px 0 0; font-size: 30px; font-weight: 300; letter-spacing: 10px; color: #fff; }
</style>
