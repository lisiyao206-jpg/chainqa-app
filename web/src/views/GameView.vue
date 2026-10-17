<script setup>
import { ref, computed, onMounted } from 'vue'
import { levels } from '../data/levels.js'
import { useGameStore } from '../stores/game.js'
import { useMistakesStore } from '../stores/mistakes.js'
import { useAiStore } from '../stores/ai.js'
import MedalPopup from '../components/MedalPopup.vue'
import MedalWall from '../components/MedalWall.vue'
import CodeFrame from '../components/CodeFrame.vue'

const game = useGameStore()
const mistakes = useMistakesStore()
const ai = useAiStore()

// 打开页面时，从数据库读取我的通关记录
onMounted(() => game.load())

// 第 1 关一开始就能玩；之后每关要先通过上一关才解锁
function unlocked(lv) {
  return lv.id === 1 || game.cleared[lv.id - 1]
}

// ===== 正在玩的关卡 =====
const level = ref(null)       // 当前关卡，null 表示在选关界面
const picked = ref(null)      // 玩家点中的行号
const wrongTimes = ref(0)     // 已经点错几次
const result = ref('')        // '' 还在找 / 'win' 找对了 / 'lose' 机会用完
const MAX_TRIES = 3
// 勋章弹窗：答对时设为 { stars, firstTime }，关掉时设回 null
const medal = ref(null)

function start(lv) {
  if (!unlocked(lv)) return
  level.value = lv
  picked.value = null
  wrongTimes.value = 0
  result.value = ''
}

// 提交答案：点中的行在 bugLines 里就算对
function submit() {
  if (picked.value === null) return
  if (level.value.bugLines.includes(picked.value)) {
    result.value = 'win'
    const stars = MAX_TRIES - wrongTimes.value // 一次就对 3 星
    // 先记下「之前有没有通过」，再保存成绩，这样才知道是不是第一次拿到这枚勋章
    const firstTime = !game.cleared[level.value.id]
    game.clear(level.value.id, stars)
    medal.value = { stars, firstTime }
  } else {
    wrongTimes.value++
    picked.value = null
    if (wrongTimes.value >= MAX_TRIES) {
      result.value = 'lose'
      // 机会用完：这道题自动进错题本
      mistakes.add(
        `【漏洞猎人 · ${level.value.title}】这份合约的漏洞在哪？属于什么类型？\n\n${level.value.code.join('\n')}`,
        `漏洞类型：${level.value.type}\n${level.value.explanation}`,
        'game'
      )
    }
  }
}

// 让白帽导师结合教材再讲一遍
function askMentor() {
  ai.ask(`我在漏洞猎人里遇到了「${level.value.type}」漏洞，请结合教材讲讲它的原理，以及怎么防范。`)
}

// 选关页顶部的总进度
const showWall = ref(false) // 勋章墙开关
const clearedCount = computed(() => levels.filter((l) => game.cleared[l.id]).length)
const totalStars = computed(() => levels.reduce((n, l) => n + (game.cleared[l.id] || 0), 0))

const nextLevel = computed(() => levels.find((l) => l.id === level.value?.id + 1))
</script>

<template>
  <!-- 最外层只能有一个固定的元素：页面切换动画（App.vue 里的 Transition）套在这个组件外面，
       如果最外层是 v-if / v-else 来回切换，动画会以为「换页了」，卡在半透明状态，关卡就打不开 -->
  <div class="game">
    <!-- ===== 选关界面 ===== -->
    <div v-if="!level" class="select">
      <div class="eyebrow">Field Mission · Bug Hunter</div>
      <h2>漏洞猎人</h2>
      <p class="intro">你是链上安全局的审计员。每一关是一份出了事的合约，找出藏着漏洞的那一行。</p>
      <!-- 总进度：已通关几关、一共拿了几颗星 -->
      <div class="summary">
        <span>已通关 <b>{{ clearedCount }}</b> / {{ levels.length }}</span>
        <span>星星 <b>{{ totalStars }}</b> / {{ levels.length * 3 }}</span>
        <a class="wall-link" @click="showWall = true">🏅 勋章墙 →</a>
      </div>
      <MedalWall v-if="showWall" @close="showWall = false" />
      <div class="cards">
        <div
          v-for="lv in levels"
          :key="lv.id"
          :class="['card', { locked: !unlocked(lv) }]"
          @click="start(lv)"
        >
          <!-- 边框上流动的就是这一关的合约代码；没解锁的关卡只显示一串乱码 -->
          <CodeFrame
            :text="unlocked(lv) ? lv.code.filter((l) => l.trim()).map((l) => l.trim()).join('  ') : '0x?? ACCESS DENIED  0x00 LOCKED'"
            :color="unlocked(lv) ? 'var(--accent)' : 'var(--text-faint)'"
            :inset="9"
            :duration="unlocked(lv) ? 30 : 60"
          />
          <div class="card-no">CASE {{ String(lv.id).padStart(2, '0') }}</div>
          <div class="card-title">{{ unlocked(lv) ? lv.title : '未解锁' }}</div>
          <div class="card-type">{{ unlocked(lv) ? lv.type : '先通过上一关' }}</div>
          <div class="stars">
            <span v-for="i in 3" :key="i" :class="{ on: i <= (game.cleared[lv.id] || 0) }">★</span>
          </div>
          <div class="card-go">{{ unlocked(lv) ? (game.cleared[lv.id] ? '再次挑战 →' : '开始调查 →') : '🔒' }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 游戏界面 ===== -->
    <div v-else class="play">
      <div class="play-head">
        <button class="back" @click="level = null">← 选关</button>
        <span>第 {{ level.id }} 关 · {{ level.title }}</span>
        <span class="tries">剩余机会：{{ MAX_TRIES - wrongTimes }}</span>
      </div>

      <div class="story">📋 案情：{{ level.story }}</div>

      <!-- 代码：每一行都能点 -->
      <div class="code">
        <div
          v-for="(line, i) in level.code"
          :key="i"
          :class="['line', {
            picked: picked === i + 1,
            bug: result && level.bugLines.includes(i + 1),
          }]"
          @click="!result && (picked = i + 1)"
        >
          <span class="ln">{{ i + 1 }}</span>
          <pre>{{ line || ' ' }}</pre>
        </div>
      </div>

      <!-- 还在找 -->
      <div v-if="!result" class="actions">
        <span v-if="wrongTimes > 0" class="hint">❌ 不对哦。提示：{{ level.hint }}</span>
        <span v-else class="hint">点击你认为有漏洞的那一行，然后提交</span>
        <button class="primary" :disabled="picked === null" @click="submit">提交第 {{ picked ?? '?' }} 行</button>
      </div>

      <!-- 结果 -->
      <div v-else :class="['result', result]">
        <div class="result-title">
          {{ result === 'win' ? '🎉 漏洞找到了！' : '💥 机会用完了，这道题已经放进错题本' }}
        </div>
        <div><b>漏洞类型：</b>{{ level.type }}</div>
        <div class="explain">{{ level.explanation }}</div>
        <div class="result-actions">
          <button @click="askMentor">🧑‍💻 请白帽导师结合教材再讲讲</button>
          <button @click="start(level)">🔄 再玩一次</button>
          <button v-if="result === 'win' && nextLevel" class="primary" @click="start(nextLevel)">下一关 →</button>
        </div>
      </div>

      <!-- 答对时弹出勋章 -->
      <MedalPopup
        v-if="medal"
        :level="level"
        :stars="medal.stars"
        :first-time="medal.firstTime"
        @close="medal = null"
      />
    </div>
  </div>
</template>

<style scoped>
/* 赛博朋克深色版：颜色都用 style.css 里的全站变量 */
.game { max-width: 1100px; margin: 0 auto; padding: 20px 0 40px; color: var(--text); }

/* ===== 选关界面 ===== */
.select { text-align: center; }
.select h2 { margin: 8px 0 10px; font-size: 34px; font-weight: 300; letter-spacing: 10px; color: #fff; }
.intro { color: var(--text-dim); margin: 0 0 18px; font-size: 14px; letter-spacing: 1px; }
.summary { display: inline-flex; gap: 28px; margin-bottom: 34px; font-size: 13px; color: var(--text-dim); letter-spacing: 1px; }
.wall-link { color: var(--gold); cursor: pointer; }
.wall-link:hover { text-shadow: 0 0 8px var(--gold); }
.summary b { color: var(--gold); font-size: 16px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 18px; text-align: left; }
/* 关卡卡片：深色毛玻璃 + 右上角切角 + 霓虹边框，鼠标移上去发光上浮 */
.card {
  position: relative; padding: 24px 22px 20px; cursor: pointer; /* 四周留出边框上代码的位置 */
  background: var(--glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line-strong);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
  transition: all 0.25s;
}
.card::before { /* 顶部一条品红 → 青的霓虹线 */
  content: ''; position: absolute; left: 0; top: 0; right: 18px; height: 2px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
}
.card:hover { transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 0 24px rgba(0, 240, 255, 0.25); background: rgba(0, 240, 255, 0.08); }
.card.locked { cursor: not-allowed; border-style: dashed; border-color: var(--line); opacity: 0.55; }
.card.locked::before { background: var(--line); }
.card.locked:hover { transform: none; box-shadow: none; background: var(--glass); }
.card-no { font-size: 11px; letter-spacing: 3px; color: var(--accent); font-family: var(--font-code); }
.card-title { font-size: 18px; font-weight: 600; margin: 10px 0 4px; color: #fff; }
.card-type { font-size: 12px; color: var(--text-dim); }
.stars { margin-top: 14px; font-size: 16px; letter-spacing: 3px; color: rgba(255, 255, 255, 0.18); }
.stars .on { color: var(--gold); text-shadow: 0 0 8px var(--gold); }
.card-go { margin-top: 12px; font-size: 12px; letter-spacing: 1px; color: var(--accent-strong); }

/* ===== 游戏界面：答题板块放在页面正中间 ===== */
.play { display: flex; flex-direction: column; gap: 14px; max-width: 820px; margin: 0 auto; }
.play-head { display: flex; align-items: center; gap: 16px; font-weight: 500; letter-spacing: 1px; color: #fff; }
.back { border: none; background: none; color: var(--accent); cursor: pointer; font-size: 14px; }
.tries { margin-left: auto; color: var(--gold); font-size: 13px; }
.story {
  padding: 12px 16px; line-height: 1.7; color: var(--text);
  background: rgba(252, 238, 10, 0.08); border-left: 3px solid var(--gold);
}

.code {
  padding: 12px 0; overflow-x: auto;
  background: rgba(3, 2, 12, 0.85); border: 1px solid var(--line-strong);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.12);
}
.line { display: flex; cursor: pointer; transition: background 0.15s; }
.line:hover { background: rgba(0, 240, 255, 0.08); }
.line.picked { background: rgba(0, 240, 255, 0.22); box-shadow: inset 3px 0 0 var(--accent); }
.line.bug { background: rgba(255, 107, 129, 0.25); box-shadow: inset 3px 0 0 var(--danger); }
.ln { width: 44px; flex-shrink: 0; text-align: right; padding-right: 14px; color: var(--text-faint); user-select: none; font-family: var(--font-code); font-size: 13px; line-height: 1.7; }
.line pre { margin: 0; color: #dff6ff; font-family: var(--font-code); font-size: 14px; line-height: 1.7; }

.actions { display: flex; align-items: center; gap: 12px; }
.hint { flex: 1; color: var(--text-dim); font-size: 14px; }
.primary {
  padding: 10px 22px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; color: #05020f;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}
.primary:disabled { opacity: 0.35; cursor: default; }

.result { padding: 16px 18px; line-height: 1.7; background: var(--glass-strong); border: 1px solid var(--line); }
.result.win { border-color: var(--ok); box-shadow: 0 0 24px rgba(142, 230, 196, 0.2); }
.result.lose { border-color: var(--danger); box-shadow: 0 0 24px rgba(255, 107, 129, 0.2); }
.result-title { font-size: 18px; font-weight: bold; margin-bottom: 6px; color: #fff; }
.explain { margin-top: 6px; color: var(--text-dim); }
.result-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.result-actions button {
  padding: 8px 14px; cursor: pointer; font-size: 13px; color: var(--text);
  border: 1px solid var(--line-strong); background: rgba(255, 255, 255, 0.04);
}
.result-actions button:hover { border-color: var(--accent); color: #fff; }
.result-actions .primary { border: none; color: #05020f; }
</style>
