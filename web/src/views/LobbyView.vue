<script setup>
// 大厅：沉浸式排版（参考 Of the Oak）
// 画面是主角：紫色流动色彩（在 App.vue 里，全站共用）铺满全屏，界面只留最少的文字
// 四个「发光点」就是四个功能入口：鼠标移上去，右侧淡入介绍；点击进入
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import ProfileModal from '../components/ProfileModal.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useUserStore } from '../stores/user.js'

const router = useRouter()
const userStore = useUserStore()
const showProfile = ref(false)

// 四个入口：x、y 是发光点在屏幕上的位置（百分比）
const spots = [
  { no: '01', to: '/camp', title: '训练营', en: 'Training Camp', x: 30, y: 34,
    desc: '从入门到合约安全，按章节阅读区块链教材。读到哪里不懂，选中文字就能问 AI；每一章都能一键生成思维导图。' },
  { no: '02', to: '/mentor', title: '白帽导师', en: 'White-hat Mentor', x: 66, y: 28,
    desc: '只依据教材回答的 AI 导师。每个结论都标注出处，可以展开核对原文；查不到依据时，它会直接告诉你「不知道」。' },
  { no: '03', to: '/archive', title: '案件档案', en: 'Case Files', x: 36, y: 70,
    desc: '你的笔记和错题都存放在这里。笔记打字自动保存；错题可以重做，掌握了就标记出来。' },
  { no: '04', to: '/mission', title: '实战任务', en: 'Field Mission', x: 60, y: 70,
    desc: '每一关是一份出了事的合约。像审计员一样逐行阅读，找出藏着漏洞的那一行，赢得勋章。' },
  { no: '05', to: '/social', title: '情报站', en: 'Intel Hub', x: 52, y: 84,
    desc: '审计员之间交流的地方。在广场发帖、发视频分享心得，和所有人讨论；加好友私聊、建讨论组一起研究题目，互相传资料。' },
  { no: '06', to: '/study', title: '学习站', en: 'Study Station', x: 14, y: 54,
    desc: '你点赞、收藏过的帖子都收在这里，分成「视频」和「笔记 / 文本」两栏，可以搜索，随时拿出来复习。' },
]

// 当前「点亮」的入口：鼠标移到发光点或左侧目录上时设置，移开时清空
const active = ref(null)
const current = computed(() => spots.find((s) => s.no === active.value))

function go(s) {
  router.push(s.to)
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
      </div>
    </Transition>

    <!-- 四个发光点 -->
    <button
      v-for="s in spots"
      :key="s.no"
      :class="['spot', { on: active === s.no }]"
      :style="{ left: s.x + '%', top: s.y + '%' }"
      @mouseenter="active = s.no"
      @mouseleave="active = null"
      @click="go(s)"
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
        <div class="enter">点击进入 →</div>
      </section>
    </Transition>

    <!-- 底部提示 -->
    <div class="hint">移动鼠标，寻找发光点 · 点击进入</div>

    <ProfileModal v-if="showProfile" @close="showProfile = false" />
  </div>
</template>

<style scoped>
.lobby {
  position: relative; height: 100vh; overflow: hidden;
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
.admin { color: rgba(233, 230, 255, 0.7); text-decoration: none; }
.admin:hover { color: #fff; }
.me-btn { padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; }
.me-btn:hover { box-shadow: 0 0 12px rgba(0, 240, 255, 0.6); }

/* ===== 中间标题 ===== */
.headline {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  text-align: center; pointer-events: none; z-index: 3; white-space: nowrap;
}
.headline h1 { margin: 0; font-size: 46px; font-weight: 200; letter-spacing: 10px; color: #fff; text-shadow: 0 0 24px rgba(0, 240, 255, 0.35); }
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
  position: absolute; right: 7%; top: 50%; transform: translateY(-50%); z-index: 4;
  width: 380px; pointer-events: none;
}
.eyebrow { font-size: 13px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.6); text-transform: uppercase; }
.info h2 { margin: 12px 0 16px; font-size: 34px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.info p { margin: 0; font-size: 16px; line-height: 2; color: rgba(233, 230, 255, 0.8); }
.enter { margin-top: 22px; font-size: 15px; letter-spacing: 2px; color: var(--accent); }

/* ===== 底部提示 ===== */
.hint {
  position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); z-index: 5;
  font-size: 15px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.55);
}

/* ===== 过渡动画 ===== */
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: all 0.5s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translate(20px, -50%); }
</style>
