<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV, NAV_MENUS } from './data/navMenus'
import ChatPanel from './components/ChatPanel.vue'
import VeilTransition from './components/VeilTransition.vue'
import CyberOverlay from './components/CyberOverlay.vue'
import ProfileModal from './components/ProfileModal.vue'
import UserAvatar from './components/UserAvatar.vue'
import { useAiStore } from './stores/ai'
import { useUserStore } from './stores/user'
import { useThemeStore } from './stores/theme'

// 所有可选的动态背景。用 defineAsyncComponent「按需加载」：
// 用户选了哪个才下载哪个，没选 3D 背景就不会下载 three.js，打开网页更快
const BG_COMPONENTS = {
  galaxy: defineAsyncComponent(() => import('./components/GalaxyBg.vue')),
  chain: defineAsyncComponent(() => import('./components/ChainSpace.vue')),
  butterfly: defineAsyncComponent(() => import('./components/ButterflySand.vue')),
}
const theme = useThemeStore()
// 右下角的 3D 小机器人（白帽导师），同样按需加载；加载失败就退回原来的「AI」文字按钮
const MentorBot = defineAsyncComponent(() => import('./components/MentorBot.vue'))
const botFailed = ref(false)
const botHover = ref(false) // 鼠标放在机器人上：它会挥手

// 当前所在的页面信息（网址、标题等）
const route = useRoute()
const router = useRouter()
// 大厅和登录页整屏显示，不要顶栏
const inLobby = computed(() => route.path === '/' || route.path === '/login')

// AI 面板的开关放在公告板里，这样训练营等页面也能打开它
const ai = useAiStore()

// 每次换页面，播放一次柔和的淡入转场（原来的白色光幕扫过太晃眼，2026-11-12 换掉了）
const rain = ref<InstanceType<typeof VeilTransition> | null>(null)
watch(() => route.path, () => rain.value?.play())

// 手机上当前栏目的分支菜单
const subNav = computed(() => Object.values(NAV_MENUS).find((m) => m.match.includes(route.path))?.subs || null)

// 顶栏的导航，和大厅共用同一份（data/navMenus.ts）
const nav = NAV

const userStore = useUserStore()
const showProfile = ref(false)
async function logout() {
  if (!confirm(`确定要退出「${userStore.user?.nickname || userStore.user?.account || '当前账号'}」吗？`)) return
  await userStore.logout()
  router.push('/login')
}
</script>

<template>
  <!-- 全站统一的动态背景：只有一份，换页时不会中断；大厅和登录页最亮，其他页面调暗，不影响阅读 -->
  <!-- :key 换了，Vue 会把旧背景整个销毁、再创建新背景，旧背景的动画也会停掉 -->
  <component :is="BG_COMPONENTS[theme.bg]" :key="theme.bg" :class="['global-bg', { dim: !inLobby }]" />
  <!-- 赛博朋克滤镜：扫描线、故障闪烁、暗角，叠在任何背景上面，让所有主题风格统一 -->
  <CyberOverlay />

  <!-- 换页转场：深色蒙层慢慢褪去，盖在最上层，播完自动消失 -->
  <VeilTransition ref="rain" />

  <!-- 换页动画说明：
       以前用 <Transition mode="out-in">（先等旧页面淡出，再让新页面淡入），但旧页面的淡出偶尔会「卡住」，
       新页面就一直出不来，看起来像页面空白、关卡打不开。
       现在改成：旧页面直接消失，新页面用一段 CSS 动画淡入（style.css 里的 .page-in），不会卡住；
       换页时还有一层深色蒙层慢慢褪去，看不出旧页面是直接消失的 -->

  <!-- 大厅、登录：整屏显示，不要顶栏。:key 让每换一页都重新播放淡入动画 -->
  <RouterView v-if="inLobby" v-slot="{ Component }">
    <component :is="Component" :key="route.path" class="page-in" />
  </RouterView>

  <!-- 其他页面：顶栏 + 内容 -->
  <div v-else class="page">
    <!-- 顶栏：和大厅一样的极简小字 -->
    <header class="topbar">
      <nav class="links">
        <RouterLink to="/" class="brand">链上安全局</RouterLink>
        <template v-for="n in nav" :key="n.to">
          <!-- 有下拉菜单的栏目（学习中心、实战任务、案件档案、情报站）：鼠标移上去展开分支 -->
          <span v-if="NAV_MENUS[n.to]" class="drop">
            <RouterLink :to="n.to" :class="{ on: NAV_MENUS[n.to].match.includes(route.path) }">{{ n.title }}<span class="caret"> ▾</span></RouterLink>
            <span class="menu">
              <span class="menu-box">
                <RouterLink v-for="x in NAV_MENUS[n.to].subs" :key="x.to" :to="x.to">{{ x.title }}</RouterLink>
              </span>
            </span>
          </span>
          <RouterLink v-else :to="n.to" active-class="on">{{ n.title }}</RouterLink>
        </template>
      </nav>
      <div class="me">
        <RouterLink v-if="userStore.isAdmin" to="/admin" active-class="on">管理后台</RouterLink>
        <a class="logout" @click="logout">退出</a>
        <button class="me-btn" title="我的档案" @click="showProfile = true">
          <UserAvatar :user="userStore.user" :size="34" />
        </button>
      </div>
    </header>
    <!-- 手机：没有下拉菜单，当前栏目的分支（比如实战任务下的打怪 / 实验场 / 练习场）排成一行小标签 -->
    <nav v-if="subNav" class="subnav">
      <RouterLink v-for="x in subNav" :key="x.to" :to="x.to" :class="{ on: route.fullPath === x.to }">{{ x.title }}</RouterLink>
    </nav>

    <main class="content">
      <!-- 训练营 ↔ 案件档案 等页面之间切换：新页面淡入 -->
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="route.path" class="page-in" />
      </RouterView>
    </main>

    <!-- AI 悬浮窗：在「白帽导师」页不需要，因为整页就是对话 -->
    <template v-if="route.path !== '/mentor'">
      <!-- 用 v-show 而不是 v-if：面板收起时只是隐藏，聊天记录不会丢 -->
      <div v-show="ai.open" class="ai-panel glass"><ChatPanel /></div>
      <button v-if="botFailed" class="ai-fab" title="AI 小助手" @click="ai.toggle()">AI</button>
      <!-- 3D 小机器人代替圆形按钮：点它打开 / 收起 AI 面板 -->
      <button v-else :class="['ai-bot', { on: ai.open }]" title="白帽导师：点我提问" @click="ai.toggle()"
        @mouseenter="botHover = true" @mouseleave="botHover = false">
        <MentorBot :active="ai.open" :thinking="ai.thinking" :wave="botHover" @error="botFailed = true" />
        <span class="bot-tip">{{ ai.open ? '收起' : '问 AI' }}</span>
      </button>
    </template>
  </div>

  <ProfileModal v-if="showProfile" @close="showProfile = false" />
</template>

<style scoped>
/* 背景亮度：大厅和登录页 100%，其他页面 40%，切换时 1 秒慢慢变暗 */
.global-bg { transition: opacity 1s; }
.global-bg.dim { opacity: 0.4; }

.page { display: flex; flex-direction: column; height: 100vh; }
.subnav { display: none; }

/* ===== 顶栏 ===== */
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18px 36px; font-size: 20px;
}
.links, .me { display: flex; align-items: center; gap: 38px; }
.topbar a { color: var(--text-dim); text-decoration: none; cursor: pointer; transition: color 0.3s; }
.topbar a:hover, .topbar a.on { color: #fff; }
/* 当前页面：下面一个小圆点 */
.topbar a.on { position: relative; }
.topbar a.on::after {
  content: ''; position: absolute; left: 50%; bottom: -8px; width: 4px; height: 4px; margin-left: -2px;
  border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent);
}
.brand { color: #fff !important; font-size: 24px; letter-spacing: 3px; margin-right: 14px; }
.drop { position: relative; }
/* 有分支的导航（实战任务）：鼠标移上去，下面展开分支菜单；上面留一段透明空隙，鼠标往下移时菜单不会消失 */
.menu { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); z-index: 30; padding-top: 12px; display: none; }
.drop:hover .menu { display: block; }
.menu-box {
  display: flex; flex-direction: column; padding: 6px 0; min-width: 140px;
  background: rgba(6, 4, 20, 0.95); border: 1px solid var(--line-strong); box-shadow: 0 0 18px rgba(0, 240, 255, 0.2);
}
.menu-box a { padding: 12px 22px; font-size: 18px; white-space: nowrap; }
.menu-box a:hover { background: rgba(0, 240, 255, 0.08); }
.menu-box a.on::after { display: none; }
.me-btn { padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; }
.me-btn:hover { box-shadow: 0 0 12px rgba(0, 240, 255, 0.6); }

.content { flex: 1; padding: 8px 36px 28px; overflow: auto; }

/* ===== AI 悬浮窗 ===== */
.ai-fab {
  position: fixed; right: 28px; bottom: 28px; z-index: 30;
  width: 52px; height: 52px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--line-strong); background: var(--glass-strong);
  backdrop-filter: var(--blur); color: #fff; font-size: 13px; letter-spacing: 1px;
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
  transition: all 0.3s;
}
.ai-fab:hover { border-color: var(--accent); box-shadow: 0 0 28px rgba(0, 240, 255, 0.6); }
/* 3D 小机器人：透明背景站在右下角，脚下一圈青色光 */
.ai-bot {
  position: fixed; right: 14px; bottom: 6px; z-index: 31;
  width: 100px; height: 128px; padding: 0; border: none; background: none; cursor: pointer;
  transition: transform 0.25s;
}
.ai-bot::before {
  content: ''; position: absolute; left: 18%; right: 18%; bottom: 6px; height: 14px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0, 240, 255, 0.55), transparent 70%); filter: blur(2px);
}
.ai-bot:hover { transform: scale(1.06); }
.bot-tip {
  position: absolute; right: 86%; top: 22%; padding: 4px 10px; white-space: nowrap;
  font-size: 12px; letter-spacing: 1px; color: #fff; pointer-events: none;
  background: var(--glass-strong); border: 1px solid var(--line-strong); border-radius: 999px;
  opacity: 0; transform: translateX(6px); transition: all 0.25s;
}
.ai-bot:hover .bot-tip, .ai-bot.on .bot-tip { opacity: 1; transform: none; }
.ai-panel {
  position: fixed; right: 28px; bottom: 140px; z-index: 30;
  width: 380px; height: min(540px, calc(100vh - 130px));
  padding: 18px; background: var(--glass-strong);
}

/* ===== 手机（屏幕窄于 760px） =====
   顶栏分两行：第一行是站名和头像，第二行是导航，导航太多时可以左右滑动 */
@media (max-width: 760px) {
  .topbar { flex-wrap: wrap; padding: 12px 14px 4px; row-gap: 10px; }
  .links { order: 3; width: 100%; gap: 20px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none; }
  .links::-webkit-scrollbar { display: none; }
  .topbar { font-size: 16px; }
  .links { gap: 22px; }
  .links a { white-space: nowrap; flex-shrink: 0; }
  /* 手机上不用下拉菜单：只显示栏目名，点进去在页面里切换 */
  .drop .menu { display: none !important; }
  .drop .caret { display: none; }
  .brand { font-size: 19px; }
  .subnav { display: flex; gap: 8px; overflow-x: auto; padding: 0 12px 8px; scrollbar-width: none; }
  .subnav::-webkit-scrollbar { display: none; }
  .subnav a { flex-shrink: 0; padding: 4px 12px; font-size: 13px; white-space: nowrap; text-decoration: none; color: var(--text-dim); border: 1px solid var(--line); border-radius: 999px; }
  .subnav a.on { color: #05020f; background: var(--accent); border-color: var(--accent); }
  /* 站名单独放在第一行左边，不跟着导航一起滑走 */
  .brand { position: absolute; top: 18px; left: 14px; }
  .topbar { position: relative; justify-content: flex-end; min-height: 54px; }
  .me { gap: 16px; }
  .me a { white-space: nowrap; }
  .content { padding: 6px 12px 80px; }
  .ai-fab { right: 16px; bottom: 16px; width: 46px; height: 46px; }
  .ai-bot { right: 4px; bottom: 2px; width: 76px; height: 98px; }
  .ai-panel { left: 8px; right: 8px; bottom: 104px; width: auto; height: calc(100vh - 150px); }
}
</style>
