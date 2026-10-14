<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ChatPanel from './components/ChatPanel.vue'
import { useAiStore } from './stores/ai.js'

// 当前所在的页面信息（网址、标题等）
const route = useRoute()
// 是不是在大厅
const inLobby = computed(() => route.path === '/')

// AI 面板的开关放在公告板里，这样训练营等页面也能打开它
const ai = useAiStore()
</script>


<template>
  <!-- 大厅：整屏显示，不要顶栏 -->
  <RouterView v-if="inLobby" />

  <!-- 其他页面：顶栏 + 内容 -->
  <div v-else class="page">
    <header class="topbar">
      <RouterLink to="/" class="back">← 返回大厅</RouterLink>
      <div class="page-title">{{ route.meta.title }}</div>
      <div class="avatar" title="个人中心">我</div>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <!-- AI 悬浮窗：在「白帽导师」页不需要，因为整页就是对话 -->
    <template v-if="route.path !== '/mentor'">
      <!-- 用 v-show 而不是 v-if：面板收起时只是隐藏，聊天记录不会丢 -->
      <div v-show="ai.open" class="ai-panel"><ChatPanel /></div>
      <button class="ai-fab" @click="ai.toggle()">🤖</button>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; height: 100vh; }
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid #e5e7eb;
}
.back { color: #2556b6; text-decoration: none; }
.page-title { font-weight: bold; font-size: 18px; }
.avatar {
  justify-self: end;
  width: 36px; height: 36px; border-radius: 50%;
  background: #2556b6; color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.content { flex: 1; padding: 24px; overflow: auto; }
.ai-fab {
  position: fixed; right: 24px; bottom: 24px;
  width: 56px; height: 56px; border-radius: 50%; border: none;
  background: #1f2329; font-size: 26px; cursor: pointer;
}
.ai-panel {
  position: fixed; right: 24px; bottom: 92px;
  width: 360px; height: min(520px, calc(100vh - 120px)); background: #fff;
  border-radius: 12px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  padding: 16px;
}
</style>
