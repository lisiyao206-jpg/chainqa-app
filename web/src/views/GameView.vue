<script setup>
import { ref, computed } from 'vue'
import { levels } from '../data/levels.js'
import { useGameStore } from '../stores/game.js'
import { useMistakesStore } from '../stores/mistakes.js'
import { useAiStore } from '../stores/ai.js'

const game = useGameStore()
const mistakes = useMistakesStore()
const ai = useAiStore()

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
    game.clear(level.value.id, MAX_TRIES - wrongTimes.value) // 一次就对 3 星
  } else {
    wrongTimes.value++
    picked.value = null
    if (wrongTimes.value >= MAX_TRIES) {
      result.value = 'lose'
      // 机会用完：这道题自动进错题本
      mistakes.add(
        `【漏洞猎人 · ${level.value.title}】这份合约的漏洞在哪？属于什么类型？\n\n${level.value.code.join('\n')}`,
        `漏洞类型：${level.value.type}\n${level.value.explanation}`
      )
    }
  }
}

// 让白帽导师结合教材再讲一遍
function askMentor() {
  ai.ask(`我在漏洞猎人里遇到了「${level.value.type}」漏洞，请结合教材讲讲它的原理，以及怎么防范。`)
}

const nextLevel = computed(() => levels.find((l) => l.id === level.value?.id + 1))
</script>

<template>
  <!-- ===== 选关界面 ===== -->
  <div v-if="!level" class="select">
    <h2>🎯 实战任务 · 漏洞猎人</h2>
    <p class="intro">你是链上安全局的审计员。每一关是一份出了事的合约，找出藏着漏洞的那一行。</p>
    <div class="cards">
      <div
        v-for="lv in levels"
        :key="lv.id"
        :class="['card', { locked: !unlocked(lv) }]"
        @click="start(lv)"
      >
        <div class="card-no">第 {{ lv.id }} 关</div>
        <div class="card-title">{{ unlocked(lv) ? lv.title : '🔒 未解锁' }}</div>
        <div class="card-type">{{ unlocked(lv) ? lv.type : '先通过上一关' }}</div>
        <div class="stars">
          <span v-for="i in 3" :key="i">{{ i <= (game.cleared[lv.id] || 0) ? '⭐' : '☆' }}</span>
        </div>
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
  </div>
</template>

<style scoped>
.select h2 { margin: 0 0 6px; }
.intro { color: #6b7280; margin: 0 0 20px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.card {
  padding: 18px; border-radius: 12px; cursor: pointer;
  background: #1f2329; color: #fff; transition: transform 0.15s;
}
.card:hover { transform: translateY(-3px); }
.card.locked { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; transform: none; }
.card-no { font-size: 12px; opacity: 0.7; }
.card-title { font-size: 18px; font-weight: bold; margin: 6px 0 4px; }
.card-type { font-size: 13px; opacity: 0.8; }
.stars { margin-top: 10px; }

.play { display: flex; flex-direction: column; gap: 12px; max-width: 860px; }
.play-head { display: flex; align-items: center; gap: 16px; font-weight: bold; }
.back { border: none; background: none; color: #2556b6; cursor: pointer; font-size: 14px; }
.tries { margin-left: auto; color: #b45309; }
.story { padding: 12px 16px; border-radius: 8px; background: #fef3c7; line-height: 1.6; }

.code { background: #1f2329; border-radius: 10px; padding: 10px 0; overflow-x: auto; }
.line { display: flex; cursor: pointer; }
.line:hover { background: rgba(255, 255, 255, 0.06); }
.line.picked { background: rgba(59, 130, 246, 0.35); }
.line.bug { background: rgba(239, 68, 68, 0.4); }
.ln { width: 44px; flex-shrink: 0; text-align: right; padding-right: 14px; color: #6b7280; user-select: none; }
.line pre { margin: 0; color: #e5e7eb; font-family: Consolas, Menlo, monospace; font-size: 14px; line-height: 1.7; }

.actions { display: flex; align-items: center; gap: 12px; }
.hint { flex: 1; color: #6b7280; }
.primary {
  padding: 10px 20px; border: none; border-radius: 8px;
  background: #1f2329; color: #fff; cursor: pointer; font-size: 14px;
}
.primary:disabled { opacity: 0.4; cursor: default; }

.result { padding: 16px; border-radius: 10px; line-height: 1.7; }
.result.win { background: #dcfce7; }
.result.lose { background: #fee2e2; }
.result-title { font-size: 18px; font-weight: bold; margin-bottom: 6px; }
.explain { margin-top: 6px; }
.result-actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.result-actions button { padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer; }
.result-actions .primary { border: none; background: #1f2329; color: #fff; }
</style>
