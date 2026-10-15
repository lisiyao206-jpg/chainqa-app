<script setup>
// 勋章弹窗：漏洞猎人答对时弹出，勋章落下 + 光芒旋转 + 星星依次亮起
import ImgSlot from './ImgSlot.vue'

const props = defineProps({
  level: Object,     // 刚通过的关卡（来自 data/levels.js）
  stars: Number,     // 这次拿到几颗星：1~3
  firstTime: Boolean // 是不是第一次通过这一关
})
const emit = defineEmits(['close'])

// 不同星数，评语不同
const comments = { 3: '一眼看穿，完美审计！', 2: '稍作排查，成功定位！', 1: '险中求胜，漏洞到手！' }
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="popup">
      <div class="badge">{{ props.firstTime ? '🎊 首次获得' : '再次通关' }}</div>

      <!-- 勋章：后面一圈旋转的光芒，前面是勋章图 -->
      <div class="medal-wrap">
        <div class="rays"></div>
        <div class="medal">
          <ImgSlot :src="`/medals/level-${props.level.id}.png`" fallback="🏅" :label="`level-${props.level.id}.png`" compact />
        </div>
      </div>

      <div class="name">「{{ props.level.type }}猎手」勋章</div>
      <div class="sub">第 {{ props.level.id }} 关 · {{ props.level.title }}</div>

      <!-- 三颗星：拿到的亮起，每颗晚一点出现（animation-delay） -->
      <div class="stars">
        <span
          v-for="i in 3"
          :key="i"
          :class="['star', { on: i <= props.stars }]"
          :style="{ animationDelay: 0.6 + i * 0.2 + 's' }"
        >★</span>
      </div>
      <div class="comment">{{ comments[props.stars] }}</div>

      <button class="ok" @click="emit('close')">收下勋章</button>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  animation: fade 0.3s ease-out;
}
.popup {
  width: 320px; padding: 28px 24px 24px; border-radius: 18px; text-align: center;
  background: linear-gradient(160deg, #1f2937, #0b0f17);
  border: 1px solid rgba(255, 209, 102, 0.4);
  box-shadow: 0 0 40px rgba(255, 209, 102, 0.25);
  color: #fff;
  animation: pop 0.4s ease-out;
}
.badge { display: inline-block; padding: 2px 12px; border-radius: 999px; font-size: 12px; background: rgba(255, 209, 102, 0.15); color: #ffd166; }

.medal-wrap { position: relative; width: 160px; height: 160px; margin: 16px auto 8px; }
/* 光芒：一圈放射状的渐变，一直慢慢转 */
.rays {
  position: absolute; inset: -30px; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255, 209, 102, 0.35) 0 10deg, transparent 10deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 30%, transparent 70%);
  mask: radial-gradient(circle, #000 30%, transparent 70%);
  animation: spin 8s linear infinite;
}
/* 勋章：从上方掉下来，弹一下，同时转一圈 */
.medal {
  position: relative; width: 100%; height: 100%; font-size: 120px;
  filter: drop-shadow(0 0 16px rgba(255, 209, 102, 0.7));
  animation: drop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.name { font-size: 20px; font-weight: bold; color: #ffd166; }
.sub { font-size: 13px; color: #9ca3af; margin-top: 4px; }

.stars { margin: 14px 0 4px; font-size: 32px; letter-spacing: 6px; }
.star { color: #374151; display: inline-block; }
.star.on { color: #ffd166; text-shadow: 0 0 10px #ffd166; animation: star 0.4s ease-out both; }
.comment { font-size: 14px; color: #e5e7eb; }

.ok {
  margin-top: 20px; width: 100%; padding: 12px; border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(90deg, #f59e0b, #ffd166); color: #1f2329; font-size: 16px; font-weight: bold;
}
.ok:hover { filter: brightness(1.1); }

@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { transform: scale(0.8); opacity: 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes drop {
  from { transform: translateY(-160px) rotate(-180deg) scale(0.4); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@keyframes star {
  from { transform: scale(0); }
  70% { transform: scale(1.4); }
  to { transform: scale(1); }
}
</style>
