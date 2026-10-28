<script setup lang="ts">
// 大厅：沉浸式排版（参考 Of the Oak）
// 画面是主角：紫色流动色彩（在 App.vue 里，全站共用）铺满全屏，界面只留最少的文字
// 四个「发光点」就是四个功能入口：鼠标移上去，右侧淡入介绍；点击进入
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import ProfileModal from '../components/ProfileModal.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useUserStore } from '../stores/user'
import { useThemeStore, BACKGROUNDS } from '../stores/theme'

const router = useRouter()
const userStore = useUserStore()
const theme = useThemeStore()
const showProfile = ref(false)

// 七个入口：x、y 是发光点在屏幕上的位置（百分比）
const isMobile = ref(window.innerWidth <= 760)
window.addEventListener('resize', () => {
  isMobile.value = window.innerWidth <= 760
})

const spots = [
  { no: '00', to: '/prep', title: '预备营', en: 'PREP', desc: '零基础入口：从"什么是区块链、什么是智能合约"讲起，配合教材和视频打地基，不需要任何基础就能看懂链上安全。', x: 13, y: 56, mobileX: 30, mobileY: 38, activeTitle: '进入预备营' },
  { no: '01', to: '/camp', title: '训练营', en: 'CAMP', desc: '按章节系统学习智能合约安全问题，每章配知识点讲解和选择题闯关，边学边测，答错的题自动进错题本，方便考前复盘。', x: 30, y: 34, mobileX: 30, mobileY: 49, activeTitle: '进入训练营' },
  { no: '02', to: '/mentor', title: '白帽导师', en: 'MENTOR', desc: '一对一答疑。学习或做题卡住时，向白帽导师提问，它会结合知识库讲解原理、拆解代码，帮你订正错误理解。', x: 66, y: 28, mobileX: 70, mobileY: 38, activeTitle: '联系导师' },
  { no: '03', to: '/archive', title: '案件档案', en: 'ARCHIVE', desc: '经典漏洞案件复盘。还原历史上真实被攻击的智能合约案例（重入、整型溢出、权限漏洞等），看清攻击手法和防范措施。', x: 36, y: 70, mobileX: 30, mobileY: 60, activeTitle: '查看档案' },
  { no: '04', to: '/mission', title: '实战任务', en: 'MISSION', desc: '动手实战闯关。在虚拟合约里实际找出漏洞、完成任务，把学到的知识用出来，练出真能挖洞的本事。', x: 60, y: 70, mobileX: 70, mobileY: 49, activeTitle: '接取任务' },
  { no: '05', to: '/social', title: '情报站', en: 'SOCIAL', desc: '链上安全情报中心。实时安全动态、行业资讯、社区讨论都在这，随时了解圈内在发生什么。', x: 52, y: 84, mobileX: 50, mobileY: 71, activeTitle: '进入情报站' },
  { no: '06', to: '/audit', title: 'AI 审计', en: 'AUDIT', desc: '智能合约一键体检。把合约代码交给 AI，自动扫描潜在漏洞风险并给出提示，体验真实的审计工作流。', x: 84, y: 82, mobileX: 70, mobileY: 60, activeTitle: '开始审计' },
]

// 当前「点亮」的入口：鼠标移到发光点或左侧目录上时设置，移开时清空
// 学习路线：预备营 → 训练营 → 实战任务 → AI 审计
const ROUTE = [
  { to: '/prep', title: '预备营' },
  { to: '/camp', title: '训练营' },
  { to: '/mission', title: '实战任务' },
  { to: '/audit', title: 'AI 审计' },
]
const active = ref<string | null>(null)
const current = computed(() => spots.find((s) => s.no === active.value))

// 退出登录：和其他页面顶栏的「退出」一样，先确认，再回到登录页
async function logout() {
  if (!confirm(`确定要退出「${userStore.user?.nickname || userStore.user?.account || '当前账号'}」吗？`)) return
  await userStore.logout()
  router.push('/login')
}

function go(s: { no: string; to: string; title: string; x: number; y: number; activeTitle?: string }) {
  router.push(s.to)
}
// 手机：第一次点发光点 → 显示解释（标题隐去）；再点同一个点 → 真正进入该界面
function toggleSpot(s: { no: string; to: string; title: string; x: number; y: number }) {
  if (active.value === s.no) {
    // 解释已经显示着，再点这个点 → 真正跳进去
    active.value = null
    router.push(s.to)
  } else if (window.innerWidth > 760) {
    router.push(s.to)     // 电脑：点击直接进入
  } else {
    active.value = s.no   // 手机：第一次点击只显示解释，不进入
  }
}
</script>

<template>
  <div class="lobby">
    <!-- 顶栏：极简小字 -->
    <header class="top">
      <nav class="links">
        <span class="brand">链上安全局</span>
        <RouterLink v-for="s in spots" :key="s.no" :to="s.to">{{ s.title }}</RouterLink>
      </nav>
      <div class="me">
        <!-- 只有管理员看得到 -->
        <RouterLink v-if="userStore.isAdmin" to="/admin" class="admin">管理后台</RouterLink>
        <a class="admin" @click="logout">退出</a>
        <button class="me-btn" title="我的档案" @click="showProfile = true">
          <UserAvatar :user="userStore.user" :size="34" />
        </button>
      </div>
    </header>


    <!-- 中间：一行细字标题；有入口被点亮时淡出，让位给右侧介绍 -->
    <Transition name="fade">
      <div v-if="!current" class="headline">
        <h1>在链上，每一行代码都是边界</h1>
        <p>边读、边问、边破案，成为一名智能合约审计员</p>
        <!-- 学习路线：第一次来的人一眼就知道从哪开始、按什么顺序学 -->
        <div class="route">
          <span class="r-label">学习路线</span>
          <template v-for="(r, i) in ROUTE" :key="r.to">
            <span v-if="i" class="r-arrow">→</span>
            <RouterLink :to="r.to"><i>{{ i + 1 }}</i>{{ r.title }}</RouterLink>
          </template>
        </div>
      </div>
    </Transition>

    <!-- 四个发光点 -->
    <button
      v-for="s in spots"
      :key="s.no"
      :class="['spot', 's' + s.no, { on: active === s.no }]"
      :style="{ left: (isMobile ? s.mobileX : s.x) + '%', top: (isMobile ? s.mobileY : s.y) + '%' }"
      @mouseenter="active = s.no"
      @mouseleave="active = null"
      @click.prevent="toggleSpot(s)"
    >
      <span class="dot"></span>
      <span class="ring"></span>
      <span class="ring r2"></span>
      <span class="label">{{ s.title }}</span>
    </button>

    <!-- 右侧：被点亮入口的介绍 -->
    <Transition name="slide">
      <section v-if="current" :key="current.no" class="info">
        <div class="eyebrow">{{ current.no }} / {{ current.en }}</div>
        <h2>{{ current.title }}</h2>
        <p>{{ current.desc }}</p>
        <button class="enter" @click="go(current)">点击进入 →</button>
      </section>
    </Transition>

    <!-- 底部提示 -->
    <div class="hint">移动鼠标，寻找发光点 · 点击进入</div>

    <!-- 左下角：换背景。点一下整个网站的背景马上跟着变，选好的会记住 -->
    <div class="bg-switch">
      <span class="bg-label">背景</span>
      <button
        v-for="b in BACKGROUNDS"
        :key="b.id"
        :class="{ on: theme.bg === b.id }"
        :title="b.desc"
        @click="theme.setBg(b.id)"
      >{{ b.name }}</button>
    </div>

    <ProfileModal v-if="showProfile" @close="showProfile = false" />
  </div>
</template>

<style scoped>
.lobby {
  position: relative; min-height: 100vh; min-height: 100dvh; overflow: auto;
  color: #e9e6ff;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 300;
}

/* ===== 顶栏 ===== */
.top {
  position: absolute; top: 0; left: 0; right: 0; z-index: 5;
  display: flex; justify-content: space-between; align-items: center;
  padding: 22px 36px;
}
.links { display: flex; gap: 32px; align-items: center; font-size: 16px; }
.links a { color: rgba(233, 230, 255, 0.7); text-decoration: none; transition: color 0.3s; }
.links a:hover { color: #fff; }
.brand { color: #fff; font-size: 19px; letter-spacing: 4px; margin-right: 12px; }
.me { display: flex; align-items: center; gap: 20px; font-size: 16px; }
.admin { color: rgba(233, 230, 255, 0.7); text-decoration: none; cursor: pointer; }
.admin:hover { color: #fff; }
.me-btn { padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; }
.me-btn:hover { box-shadow: 0 0 12px rgba(0, 240, 255, 0.6); }

/* ===== 中间标题 ===== */
.headline {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  text-align: center; pointer-events: none; z-index: 3; white-space: nowrap;
}
.headline h1 { margin: 0; font-size: 46px; font-weight: 200; letter-spacing: 10px; color: #fff; text-shadow: 0 0 24px rgba(0, 240, 255, 0.35); }
.route {
  display: inline-flex; align-items: center; gap: 10px; margin-top: 26px; padding: 8px 18px;
  pointer-events: auto; font-size: 14px; letter-spacing: 1px;
  border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 999px; background: rgba(5, 2, 15, 0.5); backdrop-filter: blur(6px);
}
.r-label { color: rgba(233, 230, 255, 0.5); margin-right: 4px; }
.route a { color: #fff; text-decoration: none; transition: color 0.2s; }
.route a:hover { color: var(--accent); }
.route i { font-style: normal; display: inline-block; width: 18px; height: 18px; margin-right: 5px; line-height: 18px; text-align: center; border-radius: 50%; font-size: 11px; color: #05020f; background: var(--accent); }
.r-arrow { color: rgba(0, 240, 255, 0.6); }
.headline p { margin: 18px 0 0; font-size: 18px; letter-spacing: 4px; color: rgba(233, 230, 255, 0.7); }

/* ===== 发光点：更大、更亮，一眼就能看到 ===== */
.spot {
  position: absolute; z-index: 4; transform: translate(-50%, -50%);
  width: 84px; height: 84px; padding: 0; border: none; background: none; cursor: pointer;
}
/* 中心的光球：白色内核 + 青色和品红两层光晕 */
.dot {
  position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 0 10px #fff, 0 0 26px var(--accent), 0 0 52px rgba(255, 43, 214, 0.7);
  animation: glow 2.4s ease-in-out infinite;
  transition: transform 0.3s;
}
@keyframes glow { 50% { box-shadow: 0 0 14px #fff, 0 0 36px var(--accent), 0 0 70px rgba(255, 43, 214, 0.9); } }
/* 两圈光环：一直向外扩散、变淡，像雷达在扫，第二圈晚一半时间出发 */
.ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(0, 240, 255, 0.85);
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.5);
  animation: pulse 2.4s ease-out infinite;
}
.ring.r2 { animation-delay: 1.2s; border-color: rgba(255, 43, 214, 0.8); box-shadow: 0 0 12px rgba(255, 43, 214, 0.5); }
@keyframes pulse {
  from { transform: scale(0.25); opacity: 1; }
  to { transform: scale(1.5); opacity: 0; }
}
.label {
  position: absolute; left: 66px; top: 50%; transform: translateY(-50%);
  white-space: nowrap; font-size: 19px; font-weight: 400; letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.88); text-shadow: 0 0 10px rgba(0, 240, 255, 0.6), 0 2px 4px #000;
  transition: all 0.3s;
}
.spot.on .dot { transform: scale(1.5); }
.spot.on .label { color: #fff; left: 74px; font-size: 21px; text-shadow: 0 0 16px var(--accent), 0 2px 4px #000; }

/* ===== 右侧介绍 ===== */
.info {
  position: absolute; right: 5%; top: 50%; transform: translateY(-50%); z-index: 4;
  width: 520px; max-width: 44vw; pointer-events: none;
}
.eyebrow { font-size: 13px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.6); text-transform: uppercase; }
.info h2 { margin: 12px 0 16px; font-size: 34px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.info p { margin: 0; font-size: 16px; line-height: 1.9; color: rgba(233, 230, 255, 0.8); }
.enter {
  margin-top: 22px; padding: 0; border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 15px; letter-spacing: 2px; color: var(--accent);
  pointer-events: auto;
}

/* ===== 底部提示 ===== */
.hint {
  position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); z-index: 5;
  font-size: 15px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.55);
}

/* ===== 左下角：换背景 ===== */
.bg-switch {
  position: absolute; left: 36px; bottom: 26px; z-index: 6;
  display: flex; align-items: center; gap: 8px;
}
.bg-label { white-space: nowrap; font-size: 12px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.45); margin-right: 2px; }
.bg-switch button {
  padding: 5px 12px; font-size: 12px; letter-spacing: 1px; cursor: pointer;
  color: rgba(233, 230, 255, 0.65); background: rgba(5, 2, 15, 0.45);
  border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 999px;
  backdrop-filter: blur(6px); transition: all 0.25s;
}
.bg-switch button:hover { color: #fff; border-color: var(--accent); }
.bg-switch button.on { color: #fff; border-color: var(--accent); background: rgba(0, 240, 255, 0.15); box-shadow: 0 0 12px rgba(0, 240, 255, 0.35); }

/* ===== 过渡动画 ===== */
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: all 0.5s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translate(20px, -50%); }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  /* 顶部只留站名和头像：导航由下面的发光点负责 */
  .top { padding: 16px 18px; }
  .links a:not(.brand) { display: none; }
  .brand { font-size: 17px; }
  .me { gap: 14px; font-size: 14px; }
  .headline { top: 16%; width: 90%; white-space: normal; }
  .headline h1 { font-size: 26px; letter-spacing: 4px; line-height: 1.5; }
  .headline p { font-size: 14px; letter-spacing: 2px; }
  .route { flex-wrap: nowrap;overflow-x: auto; justify-content: flex-start; gap: 8px; padding: 6px 12px; font-size: 12px;max-width:100% ;display: none;}
  .r-label { width: 100%; text-align: center; }
  /* 七个发光点：排成两列三行（覆盖电脑版写在 style 里的位置） */
  .lobby { min-height: 170vh; } /* 撑高页面，让底部发光点和字都能滚动看到 */
  .spot { width: 64px; height: 64px; }
  /* 手机：文字显示在发光点的右侧 */
  .label {
    position: absolute; left: 44px; top: 50%; transform: translateY(-50%);
    font-size: 15px; letter-spacing: 1px; text-shadow: 0 2px 4px #000;
    white-space: nowrap;
  }
  /* 手机：碰到发光点，标题隐去，解释文字直接显示在标题的原位置（和标题同一处）。
     注意：手机版自行分配宽度和行高，不再沿用电脑版那套宽字距的大 h2，
     用满手机宽度把解释压缩成尽量少的行，避免压到下面的发光点。 */
  .info {
    display: block;
    position: absolute; top: 13%; left: 7%; right: 7%; transform: none;
    width: auto; text-align: left; z-index: 3;
  }
  .info .eyebrow { display: none; }
  .info h2 { font-size: 19px; font-weight: 400; letter-spacing: 1px; margin: 0 0 10px; color: #fff; text-align: center; }
  .info p { font-size: 14px; line-height: 1.8; margin: 0; color: rgba(233, 230, 255, 0.85); }
  .info .enter { margin-top: 12px; text-align: center; pointer-events: auto; }
  .hint { font-size: 12px; right: 14px; left: auto; width: 8em; text-align: right; bottom: 80px; }
  .bg-switch { left: 50%; transform: translateX(-50%); bottom: 18px; }
}
</style>
