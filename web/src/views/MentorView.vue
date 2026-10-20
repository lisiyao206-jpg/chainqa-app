<script setup lang="ts">
import ChatPanel from '../components/ChatPanel.vue'
</script>

<template>
  <div class="mentor">
    <ChatPanel />
  </div>
</template>

<style scoped>
.mentor { max-width: 760px; height: calc(100vh - 140px); margin: 0 auto; }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .mentor { height: calc(100vh - 150px); }
}
</style>
