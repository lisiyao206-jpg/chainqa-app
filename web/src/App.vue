<script setup>
import { ref } from 'vue'
import ChatPanel from './components/ChatPanel.vue'

// 当前选中的导航项，默认是「教材」
const current = ref('textbook')

// 左侧导航的三项
const navs = [
  { key: 'textbook', label: '📖 教材' },
  { key: 'notebook', label: '📝 学习本' },
  { key: 'game', label: '🕵️ 漏洞猎人' },
]

// AI 悬浮窗是否展开
const aiOpen = ref(false)
</script>

<template>
  <div class="layout">
    <!-- 顶栏：左边 logo，右边个人头像 -->
    <header class="topbar">
      <div class="logo">🔗 链知答</div>
      <div class="avatar" title="个人中心">我</div>
    </header>

    <!-- 左侧导航 -->
    <aside class="sidebar">
      <button
        v-for="nav in navs"
        :key="nav.key"
        :class="{ active: current === nav.key }"
        @click="current = nav.key"
      >
        {{ nav.label }}
      </button>
    </aside>

    <!-- 主内容区：根据 current 显示不同内容 -->
    <main class="content">
      <div v-if="current === 'textbook'">这里是章节目录</div>
      <div v-else-if="current === 'notebook'">这里是笔记和难题</div>
      <div v-else>这里是关卡卡片</div>
    </main>

    <!-- AI 悬浮窗 -->
    <div v-if="aiOpen" class="ai-panel"><ChatPanel />AI 对话面板（下次做）</div>
    <button class="ai-fab" @click="aiOpen = !aiOpen">🤖</button>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  grid-template-rows: 56px 1fr;
  height: 100vh;
}
.topbar {
  grid-column: 1 / 3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #e5e7eb;
}
.logo { font-weight: bold; font-size: 18px; }
.avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: #2556b6; color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.sidebar {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px; border-right: 1px solid #e5e7eb;
}
.sidebar button {
  text-align: left; padding: 10px 12px; border: none;
  background: none; border-radius: 8px; cursor: pointer; font-size: 15px;
}
.sidebar button.active { background: #e8eefb; color: #2556b6; font-weight: bold; }
.content { padding: 24px; overflow: auto; }
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

