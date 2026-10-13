<script setup>
import { ref } from 'vue'
import ChatPanel from './components/ChatPanel.vue'

// 左侧导航的三项：to 是要跳转的网址（对应 router.js 里的 path）
const navs = [
  { to: '/textbook', label: '📖 教材' },
  { to: '/notebook', label: '📝 学习本' },
  { to: '/game', label: '🕵️ 漏洞猎人' },
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

    <!-- 左侧导航：RouterLink 点击后跳转到对应网址 -->
    <aside class="sidebar">
      <RouterLink v-for="nav in navs" :key="nav.to" :to="nav.to">
        {{ nav.label }}
      </RouterLink>
    </aside>

    <!-- 主内容区：RouterView 会根据当前网址显示对应的页面 -->
    <main class="content">
      <RouterView />
    </main>

    <!-- AI 悬浮窗 -->
    <div v-if="aiOpen" class="ai-panel"><ChatPanel /></div>
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
.sidebar a {
  padding: 10px 12px; border-radius: 8px;
  color: inherit; text-decoration: none; font-size: 15px;
}
/* 当前所在页面的导航项：RouterLink 会自动加上 router-link-active 这个 class */
.sidebar a.router-link-active { background: #e8eefb; color: #2556b6; font-weight: bold; }
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
