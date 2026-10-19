<script setup>
// 训练营 · 防御战（打小怪）
// 读完一章后，一波「漏洞小怪」冲向你的防御墙。每只小怪是一道题（文字选择题或代码选择题，AI 根据这一章出的）：
//   答对 → 小怪被击退；答错或超时 → 小怪撞上防御墙，墙掉一截耐久，并告诉你为什么
// 打完一波，防御墙还没塌就算守住了这一章（目录里会亮起 🛡）。答错的题自动进错题本
// 和「实战任务」的区别：这里是读完马上检验的小怪，实战任务是要锁定弱点、写修补代码的大怪
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import { useMistakesStore } from '../stores/mistakes.js'

const props = defineProps({ chapter: Object })
const emit = defineEmits(['close', 'done'])
const userStore = useUserStore()
const mistakes = useMistakesStore()

const MINIONS = ['👾', '🦠', '🕷️', '🐛', '🦂']
const quiz = ref([])
const loading = ref(true)
const error = ref('')
const idx = ref(0)          // 第几只小怪
const wall = ref(100)       // 防御墙耐久
const picked = ref(null)    // 选了哪个选项
const state = ref('fight')  // fight 作答中 / result 这只打完了 / end 整波结束
const outcome = ref('')     // hit 击退 / breach 撞墙 / timeout 超时
const timeLeft = ref(0)
let ticker = null

const q = computed(() => quiz.value[idx.value])
const damage = computed(() => Math.ceil(100 / Math.max(quiz.value.length, 1))) // 全错刚好把墙撞塌
const limit = computed(() => (q.value?.type === 'code' ? 45 : 30)) // 代码题多给点时间

onMounted(async () => {
  try {
    quiz.value = await userStore.api(`/api/chapters/${encodeURIComponent(props.chapter.id)}/quiz`)
    startRound()
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
})
onUnmounted(() => clearInterval(ticker))

function startRound() {
  picked.value = null
  outcome.value = ''
  state.value = 'fight'
  timeLeft.value = limit.value
  clearInterval(ticker)
  ticker = setInterval(() => {
    if (--timeLeft.value <= 0) settle(null) // 超时：小怪直接撞墙
  }, 1000)
}

// 结算这一只：answer 是选的选项下标，null 表示超时
function settle(answer) {
  if (state.value !== 'fight') return
  clearInterval(ticker)
  picked.value = answer
  state.value = 'result'
  if (answer === q.value.answer) {
    outcome.value = 'hit'
  } else {
    outcome.value = answer === null ? 'timeout' : 'breach'
    wall.value = Math.max(0, wall.value - damage.value)
    // 答错的题进错题本，附上正确答案和解析
    mistakes.add(
      `【训练营防御战 · 第 ${props.chapter.no} 讲】${q.value.question}${q.value.code ? '\n\n' + q.value.code : ''}\n\n${q.value.options.map((o, i) => 'ABCD'[i] + '. ' + o).join('\n')}`,
      `正确答案：${'ABCD'[q.value.answer]}. ${q.value.options[q.value.answer]}\n${q.value.explain}`,
      'game',
    ).catch(() => {})
  }
}

function next() {
  if (wall.value <= 0 || idx.value >= quiz.value.length - 1) return finish()
  idx.value++
  startRound()
}

async function finish() {
  state.value = 'end'
  try {
    await userStore.api('/api/camp', { chapterId: props.chapter.id, wall: wall.value })
  } catch {}
  emit('done', wall.value)
}

function retry() {
  idx.value = 0
  wall.value = 100
  startRound()
}
</script>

<template>
  <div class="mask">
    <div :class="['defense', { shake: outcome === 'breach' || outcome === 'timeout' }]">
      <header>
        <div>
          <div class="eyebrow">Defense · 第 {{ props.chapter.no }} 讲</div>
          <h3>⚠️ 漏洞小怪正在攻击防御墙！</h3>
        </div>
        <button class="close" title="撤退（本次不计成绩）" @click="emit('close')">✕</button>
      </header>

      <div v-if="loading" class="center">📡 侦测到小怪信号……AI 正在根据本章生成题目（第一次约 10~20 秒）</div>
      <div v-else-if="error" class="center err">{{ error }}</div>

      <template v-else>
        <!-- 战场：左边防御墙，右边小怪排队冲过来 -->
        <div class="field">
          <div :class="['wall', { cracked: wall < 60, broken: wall <= 0 }]">
            <div class="wall-hp"><b :style="{ width: wall + '%' }"></b></div>
            <span>防御墙 {{ wall }}%</span>
          </div>
          <div class="lane">
            <!-- 当前这只小怪：作答期间按倒计时慢慢逼近防御墙 -->
            <span
              v-if="state !== 'end'"
              :key="idx"
              :class="['minion', outcome]"
              :style="{ '--t': limit + 's', animationPlayState: state === 'fight' ? 'running' : 'paused' }"
            >{{ MINIONS[idx % MINIONS.length] }}</span>
            <!-- 后面还在排队的小怪 -->
            <span v-for="n in Math.max(quiz.length - idx - 1, 0)" :key="'w' + n" class="waiting" :style="{ right: 8 + n * 40 + 'px' }">
              {{ MINIONS[(idx + n) % MINIONS.length] }}
            </span>
          </div>
          <div class="wave">第 {{ Math.min(idx + 1, quiz.length) }} / {{ quiz.length }} 只</div>
        </div>

        <!-- 题目 -->
        <div v-if="state !== 'end'" class="question">
          <div class="q-head">
            <span :class="['tag', { 'is-code': q.type === 'code' }]">{{ q.type === 'code' ? '代码题' : '文字题' }}</span>
            <span :class="['time', { urgent: timeLeft <= 8 }]">⏱ {{ timeLeft }}s</span>
          </div>
          <p>{{ q.question }}</p>
          <pre v-if="q.code" class="code">{{ q.code }}</pre>
          <div class="options">
            <button
              v-for="(o, i) in q.options"
              :key="i"
              :class="['opt', {
                right: state === 'result' && i === q.answer,
                wrong: state === 'result' && i === picked && i !== q.answer,
              }]"
              :disabled="state !== 'fight'"
              @click="settle(i)"
            ><b>{{ 'ABCD'[i] }}</b>{{ o }}</button>
          </div>

          <!-- 这只打完：击退了 / 撞墙了，都给讲解 -->
          <div v-if="state === 'result'" :class="['verdict', outcome]">
            <div class="v-title">
              {{ outcome === 'hit' ? '💥 击退！' : outcome === 'timeout' ? `⏰ 超时了，小怪撞上防御墙 -${damage}%` : `🧱 小怪撞上防御墙 -${damage}%` }}
            </div>
            <div>{{ q.explain }}</div>
            <button class="btn primary" @click="next">{{ wall <= 0 || idx >= quiz.length - 1 ? '查看战果' : '下一只 →' }}</button>
          </div>
        </div>

        <!-- 整波结束 -->
        <div v-else :class="['end', wall > 0 ? 'win' : 'lose']">
          <div class="big">{{ wall > 0 ? '🛡 防御成功！' : '💥 防御墙被攻破……' }}</div>
          <p v-if="wall > 0">防御墙剩余 {{ wall }}%。这一章的知识你守住了，目录里亮起了 🛡。</p>
          <p v-else>别灰心：答错的题已经放进错题本。回去再读一遍这一章，然后重新防御。</p>
          <div class="end-actions">
            <button class="btn" @click="retry">🔄 重新防御</button>
            <button class="btn primary" @click="emit('close')">{{ wall > 0 ? '继续学习 →' : '回去重读' }}</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mask { position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); }
.defense {
  width: min(820px, 94vw); max-height: 92vh; overflow-y: auto; padding: 22px 26px 26px; color: var(--text);
  background: rgba(8, 4, 22, 0.95); border: 1px solid var(--danger); box-shadow: 0 0 50px rgba(255, 107, 129, 0.25);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
}
.defense.shake { animation: shake 0.4s; }
@keyframes shake { 25% { transform: translateX(-8px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
header { display: flex; justify-content: space-between; align-items: flex-start; }
h3 { margin: 4px 0 0; color: #fff; letter-spacing: 2px; animation: alarm 1.2s ease-in-out infinite; }
@keyframes alarm { 50% { color: var(--danger); text-shadow: 0 0 12px var(--danger); } }
.close { border: none; background: none; color: var(--text-dim); font-size: 18px; cursor: pointer; }
.center { padding: 50px 0; text-align: center; color: var(--text-dim); }
.err { color: var(--danger); }

/* 战场 */
.field { position: relative; display: flex; height: 120px; margin: 18px 0 14px; border-bottom: 1px solid var(--line); }
.wall {
  width: 90px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; padding-bottom: 8px;
  font-size: 11px; color: var(--accent);
  background: repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.18) 0 12px, rgba(0, 240, 255, 0.05) 12px 24px);
  border-right: 3px solid var(--accent); box-shadow: 6px 0 24px rgba(0, 240, 255, 0.35);
  transition: all 0.4s;
}
.wall.cracked { border-right-color: var(--gold); box-shadow: 6px 0 24px rgba(252, 238, 10, 0.35); color: var(--gold); }
.wall.broken { border-right-color: var(--danger); box-shadow: 6px 0 24px rgba(255, 107, 129, 0.5); color: var(--danger); opacity: 0.6; }
.wall-hp { width: 70px; height: 6px; background: rgba(255, 255, 255, 0.1); }
.wall-hp b { display: block; height: 100%; background: currentColor; transition: width 0.4s; }
.lane { position: relative; flex: 1; }
.minion {
  position: absolute; top: 28px; right: 10px; font-size: 52px; filter: drop-shadow(0 0 10px var(--danger));
  animation: approach var(--t) linear forwards; /* 倒计时多长，它就花多长时间走到墙边 */
}
@keyframes approach { to { right: calc(100% - 60px); } }
.minion.hit { animation: blast 0.6s forwards; }
@keyframes blast { to { transform: scale(1.8) rotate(30deg); opacity: 0; filter: brightness(3); } }
.minion.breach, .minion.timeout { animation: ram 0.5s forwards; }
@keyframes ram { to { right: calc(100% - 40px); transform: scale(1.2); } }
.waiting { position: absolute; top: 44px; font-size: 26px; opacity: 0.35; }
.wave { position: absolute; right: 0; bottom: 4px; font-size: 11px; color: var(--text-faint); }

/* 题目 */
.question p { margin: 8px 0; line-height: 1.7; font-size: 15px; color: #fff; }
.q-head { display: flex; justify-content: space-between; align-items: center; }
.tag { padding: 2px 10px; font-size: 11px; border: 1px solid var(--accent); color: var(--accent); }
.tag.is-code { border-color: var(--accent-strong); color: var(--accent-strong); }
.time { font-family: var(--font-code); color: var(--accent); }
.time.urgent { color: var(--danger); animation: alarm 0.5s steps(2) infinite; }
.code {
  margin: 8px 0; padding: 12px 14px; overflow-x: auto; font-family: var(--font-code); font-size: 13px; line-height: 1.6;
  color: #dff6ff; background: rgba(3, 2, 12, 0.9); border: 1px solid var(--line-strong);
}
.options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opt {
  display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; cursor: pointer; text-align: left; line-height: 1.5;
  font-size: 14px; font-family: var(--font); color: var(--text); background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-strong);
  transition: all 0.2s;
}
.opt b { color: var(--accent); }
.opt:hover:not(:disabled) { border-color: var(--accent); background: rgba(0, 240, 255, 0.08); }
.opt:disabled { cursor: default; }
.opt.right { border-color: var(--ok); background: rgba(142, 230, 196, 0.15); }
.opt.wrong { border-color: var(--danger); background: rgba(255, 107, 129, 0.15); }
.verdict { margin-top: 12px; padding: 12px 14px; line-height: 1.6; font-size: 14px; border-left: 3px solid var(--ok); background: rgba(142, 230, 196, 0.08); display: flex; flex-direction: column; gap: 8px; }
.verdict.breach, .verdict.timeout { border-left-color: var(--danger); background: rgba(255, 107, 129, 0.08); }
.v-title { font-weight: 700; color: #fff; }
.verdict .btn { align-self: flex-end; }

.end { text-align: center; padding: 20px 0 6px; }
.big { font-size: 26px; font-weight: 700; color: var(--ok); text-shadow: 0 0 16px var(--ok); }
.end.lose .big { color: var(--danger); text-shadow: 0 0 16px var(--danger); }
.end p { color: var(--text-dim); }
.end-actions { display: flex; gap: 12px; justify-content: center; margin-top: 14px; }
</style>
