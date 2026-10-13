<script setup>
import { ref } from 'vue'
import ImgSlot from '../components/ImgSlot.vue'

// 大厅的四个入口：to 对应 router.js 里的 path
// icon 是图标图片的文件名，放在 web/public/lobby/ 里
const entries = [
  { to: '/camp', icon: 'icon-camp.png', emoji: '📖', label: '训练营' },
  { to: '/mentor', icon: 'icon-mentor.png', emoji: '🧑‍💻', label: '白帽导师' },
  { to: '/archive', icon: 'icon-archive.png', emoji: '🗂️', label: '案件档案' },
  { to: '/mission', icon: 'icon-mission.png', emoji: '🎯', label: '实战任务' },
]

// 玩家信息（现在先写死，以后从登录和进度数据里读）
// 用 ref 包起来，数据一变，血条就会跟着动
const player = ref({ title: '新人审计员', level: 1, xp: 30 })

// 测试用：每点一次加 10 经验，满 100 升一级
function gainXp() {
  player.value.xp += 10
  if (player.value.xp >= 100) {
    player.value.xp = 0
    player.value.level += 1
  }
}
</script>

<template>
  <div class="lobby">
    <h1 class="title">链上安全局</h1>

    <!-- 左上角：身份卡 -->
    <div class="id-card">
      <div class="avatar"><ImgSlot src="/lobby/avatar.png" fallback="🕵️" label="avatar.png" compact /></div>
      <div>
        <div class="id-label">角色身份卡</div>
        <div class="id-title">{{ player.title }}</div>
      </div>
    </div>

    <!-- 右侧：等级条 -->
    <div class="level">
      <div class="level-bar"><div class="level-fill" :style="{ height: player.xp + '%' }"></div></div>
      <div class="medal"><ImgSlot src="/lobby/medal.png" fallback="🏅" label="medal.png" compact /></div>
      <div class="level-num">Lv.{{ player.level }}</div>
      <button class="test-btn" @click="gainXp">+10 经验（测试）</button>
    </div>

    <!-- 中央：全息屏幕 + 人物，两张图叠在一起 -->
    <div class="hero-screen"><ImgSlot src="/lobby/hero-screen.png" fallback="🖥️" label="hero-screen.png 1200×700" /></div>
    <div class="hero-figure"><ImgSlot src="/lobby/hero-figure.png" fallback="🕵️" label="hero-figure.png 高800" /></div>

    <!-- 底部：四个入口 -->
    <nav class="entries">
      <RouterLink v-for="e in entries" :key="e.to" :to="e.to" class="entry">
        <span class="entry-icon"><ImgSlot :src="'/lobby/' + e.icon" :fallback="e.emoji" :label="e.icon" compact /></span>{{ e.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.lobby {
  position: relative;
  height: 100vh;
  /* 背景：先铺 bg-frame.png，图片没放进来时显示下面的渐变 */
  background:
    url('/lobby/bg-frame.png') center / 100% 100% no-repeat,
    radial-gradient(circle at center, #10203a 0%, #07090f 70%);
  color: #e5e7eb;
  border: 2px solid #ff3b4a;
  box-shadow: inset 0 0 40px rgba(255, 59, 74, 0.25);
  overflow: hidden;
}
.title {
  margin: 0;
  padding-top: 24px;
  text-align: center;
  font-size: 32px;
  letter-spacing: 6px;
  color: #ff5a66;
  text-shadow: 0 0 12px rgba(255, 59, 74, 0.8);
}
.id-card {
  position: absolute; top: 90px; left: 40px;
  display: flex; gap: 12px; align-items: center;
  padding: 10px 16px;
  border: 1px solid #ff3b4a; border-radius: 8px;
  background: rgba(255, 59, 74, 0.08);
}
.avatar { width: 56px; height: 56px; font-size: 56px; }
.id-label { font-size: 12px; color: #9ca3af; }
.id-title { font-size: 18px; font-weight: bold; }
.level {
  position: absolute; top: 120px; right: 50px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.level-bar {
  width: 14px; height: 220px;
  border: 1px solid #3ba7ff; border-radius: 7px;
  display: flex; align-items: flex-end; overflow: hidden;
}
.level-fill {
  position: relative;
  width: 100%;
  background: linear-gradient(#ff3b4a, #3ba7ff);
  box-shadow: 0 0 12px rgba(255, 59, 74, 0.8);
  transition: height 0.6s ease-out;      /* 经验变化时，平滑地涨上去 */
  animation: grow 1.2s ease-out;         /* 进入大厅时，从 0 涨到当前值 */
  overflow: hidden;
}
/* 一道白光从下往上不停扫过 */
.level-fill::after {
  content: '';
  position: absolute; left: 0; right: 0; height: 40%;
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.6), transparent);
  animation: shine 2s linear infinite;
}
@keyframes grow {
  from { height: 0; }
}
@keyframes shine {
  from { top: 100%; }
  to { top: -40%; }
}
.test-btn {
  background: none; border: 1px dashed #6b7280; color: #9ca3af;
  font-size: 12px; padding: 4px 8px; border-radius: 4px; cursor: pointer;
}
.level-num { color: #ffd166; font-weight: bold; }
.medal { width: 64px; height: 64px; font-size: 64px; }
/* 全息屏幕：在人物后面，宽一些 */
.hero-screen {
  position: absolute; top: 46%; left: 50%;
  transform: translate(-50%, -50%);
  width: 52vw; height: 30vw; font-size: 120px;
}
/* 人物：站在屏幕前面，脚踩在按钮上方 */
.hero-figure {
  position: absolute; bottom: 150px; left: 50%;
  transform: translateX(-50%);
  height: 55vh; aspect-ratio: 1 / 2; font-size: 160px;
  filter: drop-shadow(0 0 30px rgba(59, 167, 255, 0.6));
}
.entries {
  position: absolute; bottom: 60px; left: 0; right: 0;
  display: flex; justify-content: center; gap: 24px;
}
.entry {
  white-space: nowrap;
  display: flex; align-items: center; gap: 10px;
  padding: 18px 36px;
  border: 1px solid #ff3b4a; border-radius: 8px;
  background: rgba(255, 59, 74, 0.1);
  color: #fff; text-decoration: none; font-size: 20px; font-weight: bold;
  transition: all 0.2s;
}
/* 鼠标移上去：发光 + 上浮 */
.entry:hover {
  background: rgba(255, 59, 74, 0.25);
  box-shadow: 0 0 20px rgba(255, 59, 74, 0.6);
  transform: translateY(-4px);
}
.entry-icon { width: 32px; height: 32px; font-size: 32px; }
</style>
