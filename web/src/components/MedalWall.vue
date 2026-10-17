<script setup>
// 勋章墙：漏洞猎人每一关对应一枚勋章
// 通关了 → 勋章点亮，显示拿到的星星；没通关 → 勋章是暗的剪影
// 数据来自 game 公告板（stores/game.js），不需要新的后端接口
import { computed, onMounted } from 'vue'
import { levels } from '../data/levels.js'
import { useGameStore } from '../stores/game.js'
import ImgSlot from './ImgSlot.vue'

const emit = defineEmits(['close'])
const game = useGameStore()
onMounted(game.load)

const owned = computed(() => levels.filter((l) => game.cleared[l.id]).length)
const stars = computed(() => levels.reduce((n, l) => n + (game.cleared[l.id] || 0), 0))
// 称号：按拿到的勋章数升级
const rank = computed(() => {
  const n = owned.value
  if (n === levels.length) return '首席审计官'
  if (n >= 3) return '高级审计员'
  if (n >= 1) return '见习审计员'
  return '新人'
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="wall">
      <header>
        <div>
          <div class="eyebrow">Medal Wall</div>
          <h3>勋章墙</h3>
        </div>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <!-- 总览：称号 + 勋章数 + 星星数，进度条按勋章数填满 -->
      <div class="overview">
        <span class="rank">{{ rank }}</span>
        <span>勋章 <b>{{ owned }}</b> / {{ levels.length }}</span>
        <span>星星 <b>{{ stars }}</b> / {{ levels.length * 3 }}</span>
      </div>
      <div class="bar"><div :style="{ width: (owned / levels.length) * 100 + '%' }"></div></div>

      <div class="grid">
        <div v-for="lv in levels" :key="lv.id" :class="['medal', { on: game.cleared[lv.id] }]">
          <div class="pic">
            <ImgSlot :src="`/medals/level-${lv.id}.png`" fallback="🏅" :label="`level-${lv.id}.png`" compact />
          </div>
          <div class="name">{{ game.cleared[lv.id] ? `「${lv.type}猎手」` : '？？？' }}</div>
          <div class="sub">第 {{ lv.id }} 关 · {{ lv.title }}</div>
          <div class="stars">
            <span v-for="i in 3" :key="i" :class="{ lit: i <= (game.cleared[lv.id] || 0) }">★</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 150;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.65);
}
.wall {
  width: min(860px, 92vw); max-height: 88vh; overflow-y: auto; padding: 26px 28px 30px;
  color: var(--text); background: var(--glass-strong); backdrop-filter: var(--blur);
  border: 1px solid var(--line-strong); box-shadow: 0 0 40px rgba(0, 240, 255, 0.15);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
}
header { display: flex; justify-content: space-between; align-items: flex-start; }
h3 { margin: 4px 0 0; font-size: 24px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.close { border: none; background: none; color: var(--text); font-size: 18px; cursor: pointer; }
.close:hover { color: var(--accent); }

.overview { display: flex; gap: 24px; align-items: center; margin: 18px 0 10px; font-size: 13px; color: var(--text-dim); }
.overview b { color: var(--gold); font-size: 16px; }
.rank { padding: 2px 12px; border: 1px solid var(--accent-strong); color: var(--accent-strong); letter-spacing: 2px; }
.bar { height: 4px; background: rgba(255, 255, 255, 0.08); margin-bottom: 24px; }
.bar div { height: 100%; background: linear-gradient(90deg, var(--accent-strong), var(--accent)); box-shadow: 0 0 10px var(--accent); transition: width 0.6s; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; }
.medal { padding: 18px 10px 14px; text-align: center; border: 1px dashed var(--line); }
.pic { width: 90px; height: 90px; margin: 0 auto 10px; font-size: 70px; filter: grayscale(1) brightness(0.35); }
.name { font-size: 14px; color: var(--text-faint); }
.sub { margin-top: 4px; font-size: 11px; color: var(--text-faint); }
.stars { margin-top: 8px; letter-spacing: 3px; color: rgba(255, 255, 255, 0.15); }
/* 已获得：点亮、发光，鼠标移上去轻轻浮起 */
.medal.on { border: 1px solid rgba(252, 238, 10, 0.5); background: rgba(252, 238, 10, 0.05); transition: transform 0.25s; }
.medal.on:hover { transform: translateY(-4px); box-shadow: 0 0 22px rgba(252, 238, 10, 0.25); }
.medal.on .pic { filter: drop-shadow(0 0 12px rgba(252, 238, 10, 0.6)); }
.medal.on .name { color: var(--gold); font-weight: 600; }
.medal.on .sub { color: var(--text-dim); }
.stars .lit { color: var(--gold); text-shadow: 0 0 8px var(--gold); }
</style>
