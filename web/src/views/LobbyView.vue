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
  { no: '04', to: '/mission', title: '实战任务', en: 'Field Mission', x: 70, y: 64,
    desc: '每一关是一份出了事的合约。像审计员一样逐行阅读，找出藏着漏洞的那一行，赢得勋章。' },
  { no: '05', to: '/social', title: '情报站', en: 'Intel Hub', x: 52, y: 84,
    desc: '审计员之间交流的地方。在广场发帖、发视频分享心得，和所有人讨论；加好友私聊、建讨论组一起研究题目，互相传资料。' },
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
.links { display: flex; gap: 26px; align-items: center; font-size: 13px; }
.links a { color: rgba(233, 230, 255, 0.6); text-decoration: none; transition: color 0.3s; }
.links a:hover { color: #fff; }
.brand { color: #fff; letter-spacing: 3px; margin-right: 10px; }
.me { display: flex; align-items: center; gap: 18px; font-size: 13px; }
.admin { color: rgba(233, 230, 255, 0.6); text-decoration: none; }
.admin:hover { color: #fff; }
.me-btn { padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; }
.me-btn:hover { box-shadow: 0 0 12px rgba(0, 240, 255, 0.6); }

/* ===== 中间标题 ===== */
.headline {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  text-align: center; pointer-events: none; z-index: 3;
}
.headline h1 { margin: 0; font-size: 30px; font-weight: 200; letter-spacing: 6px; color: #fff; }
.headline p { margin: 14px 0 0; font-size: 13px; letter-spacing: 2px; color: rgba(233, 230, 255, 0.55); }

/* ===== 发光点 ===== */
.spot {
  position: absolute; z-index: 4; transform: translate(-50%, -50%);
  width: 44px; height: 44px; padding: 0; border: none; background: none; cursor: pointer;
}
.dot {
  position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 0 10px #fff, 0 0 24px rgba(200, 180, 255, 0.9);
  transition: transform 0.3s;
}
/* 外圈：一直慢慢向外扩散、变淡，像在呼吸 */
.ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  animation: pulse 2.4s ease-out infinite;
}
@keyframes pulse {
  from { transform: scale(0.3); opacity: 1; }
  to { transform: scale(1.4); opacity: 0; }
}
.label {
  position: absolute; left: 34px; top: 50%; transform: translateY(-50%);
  white-space: nowrap; font-size: 12px; letter-spacing: 2px;
  color: rgba(233, 230, 255, 0.5); transition: all 0.3s;
}
.spot.on .dot { transform: scale(1.6); }
.spot.on .label { color: #fff; left: 40px; }

/* ===== 右侧介绍 ===== */
.info {
  position: absolute; right: 8%; top: 50%; transform: translateY(-50%); z-index: 4;
  width: 300px; pointer-events: none;
}
.eyebrow { font-size: 11px; letter-spacing: 3px; color: rgba(233, 230, 255, 0.5); text-transform: uppercase; }
.info h2 { margin: 10px 0 14px; font-size: 26px; font-weight: 300; letter-spacing: 4px; color: #fff; }
.info p { margin: 0; font-size: 13px; line-height: 2; color: rgba(233, 230, 255, 0.7); }
.enter { margin-top: 20px; font-size: 12px; letter-spacing: 2px; color: #fff; }

/* ===== 底部提示 ===== */
.hint {
  position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); z-index: 5;
  font-size: 12px; letter-spacing: 2px; color: rgba(233, 230, 255, 0.4);
}

/* ===== 过渡动画 ===== */
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: all 0.5s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translate(20px, -50%); }
</style>
