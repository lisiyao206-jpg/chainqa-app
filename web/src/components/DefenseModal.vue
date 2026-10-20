<script setup lang="ts">
// 训练营 · 防御战（打小怪）
// 读完一章后，一波「漏洞小怪」冲向你的防御墙。每只小怪是一道题（文字选择题或代码选择题，AI 根据这一章出的）：
//   答对 → 小怪被击退；答错或超时 → 小怪撞上防御墙，墙掉一截耐久，并告诉你为什么
// 打完一波，防御墙还没塌就算守住了这一章（目录里会亮起 🛡）。答错的题自动进错题本
// 和「实战任务」的区别：这里是读完马上检验的小怪，实战任务是要锁定弱点、写修补代码的大怪
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { useMistakesStore } from '../stores/mistakes'
import type { Chapter } from '../types'

interface QuizItem {
  type: 'text' | 'code' | string
  question: string
  code?: string
  options: string[]
  answer: number
  explain: string
}

const props = defineProps<{ chapter?: Chapter }>()
const emit = defineEmits(['close', 'done'])
const userStore = useUserStore()
const mistakes = useMistakesStore()

const MINIONS = ['👾', '🦠', '🕷️', '🐛', '🦂']
const quiz = ref<QuizItem[]>([])
const loading = ref(true)
const error = ref('')
const idx = ref(0)          // 第几只小怪
const wall = ref(100)       // 防御墙耐久
const picked = ref<number | null>(null)    // 选了哪个选项
const state = ref('fight')  // fight 作答中 / result 这只打完了 / end 整波结束
const outcome = ref('')     // hit 击退 / breach 撞墙 / timeout 超时
const timeLeft = ref(0)
const results = ref<string[]>([])  // 每只小怪的结果，打完后在战场上列出战报
let ticker: ReturnType<typeof setInterval> | undefined

const q = computed(() => quiz.value[idx.value])

function stripLabel(o: string) {
  return o.replace(/^\s*[(（]?[A-DＡ-Ｄa-d][)）.．、:：]\s*/, '')
}

// 打完一波：顶上的标题飞到战场正中间，变成大字战果
const banner = computed(() => {
  if (wall.value <= 0) return '💥 防御墙被攻破了……'
  return results.value.every((r) => r === 'hit') ? '🛡 小怪全部击退！' : '🛡 防御墙守住了！'
})
const damage = computed(() => Math.ceil(100 / Math.max(quiz.value.length, 1))) // 全错刚好把墙撞塌
const limit = computed(() => (q.value?.type === 'code' ? 45 : 30)) // 代码题多给点时间

onMounted(async () => {
  try {
    const list: QuizItem[] = await userStore.api(`/api/chapters/${encodeURIComponent(props.chapter!.id)}/quiz`)
    // AI 有时会在选项里自己写上「A. 」，界面又会再显示一个 A，看起来就重复了：去掉选项开头的编号
    quiz.value = list.map((x) => ({ ...x, options: x.options.map(stripLabel) }))
    startRound()
  } catch (e) {
    error.value = (e as Error).message
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
function settle(answer: number | null) {
  if (state.value !== 'fight') return
  clearInterval(ticker)
  picked.value = answer
  state.value = 'result'
  results.value[idx.value] = answer === q.value.answer ? 'hit' : answer === null ? 'timeout' : 'breach'
  if (answer === q.value.answer) {
    outcome.value = 'hit'
  } else {
    outcome.value = answer === null ? 'timeout' : 'breach'
    wall.value = Math.max(0, wall.value - damage.value)
    // 答错的题进错题本，附上正确答案和解析
    mistakes.add(
      `【训练营防御战 · 第 ${props.chapter!.no} 讲】${q.value.question}${q.value.code ? '\n\n' + q.value.code : ''}\n\n${q.value.options.map((o, i) => 'ABCD'[i] + '. ' + o).join('\n')}`,
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
    await userStore.api('/api/camp', { chapterId: props.chapter!.id, wall: wall.value })
  } catch {}
  emit('done', wall.value)
}

function retry() {
  results.value = []
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
          <div class="eyebrow">Defense · 第 {{ props.chapter!.no }} 讲</div>
          <!-- 打完后这行标题淡出，同一句战果从这里「飞」到战场中间 -->
          <h3 :class="{ gone: state === 'end' }">⚠️ 漏洞小怪正在攻击防御墙！</h3>
        </div>
        <button class="close" title="撤退（本次不计成绩）" @click="emit('close')">✕</button>
      </header>

      <div v-if="loading" class="center">📡 侦测到小怪信号……AI 正在根据本章生成题目（第一次约 10~20 秒）</div>
      <div v-else-if="error" class="center err">{{ error }}</div>

      <template v-else>
        <!-- 战场：左边防御墙，右边小怪排队冲过来 -->
        <div :class="['field', { ended: state === 'end' }]">
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
          <!-- 整波打完：战场上列出战报，每只小怪是被击退还是撞上了墙 -->
          <div v-if="state === 'end'" :class="['end-banner', wall > 0 ? 'win' : 'lose']">{{ banner }}</div>
          <div v-if="state === 'end'" class="report">
            <div v-for="(r, i) in results" :key="'r' + i" :class="['r-card', r]">
              <span class="r-emoji">{{ MINIONS[i % MINIONS.length] }}</span>
              <span class="r-text">{{ r === 'hit' ? '已击退' : r === 'timeout' ? `超时 -${damage}%` : `撞墙 -${damage}%` }}</span>
            </div>
          </div>
          <div class="wave">{{ state === 'end' ? `击退 ${results.filter((r) => r === 'hit').length} / ${quiz.length} 只` : `第 ${Math.min(idx + 1, quiz.length)} / ${quiz.length} 只` }}</div>
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
  background: rgba(8, 4, 22, 0.98); border: 1px solid var(--danger); box-shadow: 0 0 50px rgba(255, 107, 129, 0.25);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
}
.defense.shake { animation: shake 0.4s; }
@keyframes shake { 25% { transform: translateX(-8px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
header { display: flex; justify-content: space-between; align-items: flex-start; }
h3 { margin: 4px 0 0; color: #fff; letter-spacing: 2px; animation: alarm 1.2s ease-in-out infinite; }
@keyframes alarm { 50% { color: var(--danger); text-shadow: 0 0 12px var(--danger); } }
/* 打完了：不再闪警报；守住是绿色，被攻破是红色 */
h3.gone { animation: none; opacity: 0; transition: opacity 0.3s; }

/* ===== 打完一波的动画 =====
   1. 战场变高，给战果留出位置
   2. 战果大字从左上角（原来标题的位置）慢慢飞到战场正中间，同时放大（0 ~ 1.4 秒）
   3. 大字落定后，下面的战报卡片一张张弹出来，最后出现说明文字和按钮 */
.field { transition: height 0.5s; }
.field.ended { height: 220px; }
.end-banner {
  position: absolute; z-index: 3; white-space: nowrap; pointer-events: none;
  font-size: 30px; font-weight: 800; letter-spacing: 6px;
  animation: fly-in 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.end-banner.win { color: var(--ok); text-shadow: 0 0 18px rgba(142, 230, 196, 0.8), 0 0 40px rgba(142, 230, 196, 0.4); }
.end-banner.lose { color: var(--danger); text-shadow: 0 0 18px rgba(255, 107, 129, 0.8); }
@keyframes fly-in {
  from { left: 0; top: -52px; transform: translate(0, 0) scale(0.62); opacity: 0.6; }
  to { left: calc(50% + 45px); top: 22px; transform: translate(-50%, 0) scale(1); opacity: 1; }
}
.field.ended .report { top: auto; bottom: 26px; transform: none; }
.field.ended .r-card { animation-delay: 1.3s; }
.field.ended .r-card:nth-child(2) { animation-delay: 1.45s; }
.field.ended .r-card:nth-child(3) { animation-delay: 1.6s; }
.field.ended .r-card:nth-child(4) { animation-delay: 1.75s; }
.field.ended .r-card:nth-child(5) { animation-delay: 1.9s; }
.end { animation: fade-up 0.5s 2s backwards; }
@keyframes fade-up { from { opacity: 0; transform: translateY(10px); } }
@media (max-width: 760px) {
  .end-banner { font-size: 20px; letter-spacing: 3px; }
}
/* 战报：每只小怪一张小卡片，被击退的变灰并打上红叉 */
.report { position: absolute; left: 90px; right: 0; top: 50%; transform: translateY(-50%); display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; }
.r-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 76px; padding: 10px 8px;
  border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); animation: pop 0.4s backwards;
}
.r-card:nth-child(2) { animation-delay: 0.1s; } .r-card:nth-child(3) { animation-delay: 0.2s; } .r-card:nth-child(4) { animation-delay: 0.3s; } .r-card:nth-child(5) { animation-delay: 0.4s; }
@keyframes pop { from { transform: scale(0.6); opacity: 0; } }
.r-emoji { position: relative; font-size: 34px; line-height: 1; }
.r-card.hit .r-emoji { filter: grayscale(1) brightness(0.6); }
.r-card.hit .r-emoji::after { content: '✕'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--danger); font-size: 30px; filter: none; }
.r-text { font-size: 12px; letter-spacing: 1px; }
.r-card.hit { border-color: rgba(142, 230, 196, 0.5); }
.r-card.hit .r-text { color: var(--ok); }
.r-card.breach, .r-card.timeout { border-color: rgba(255, 107, 129, 0.5); }
.r-card.breach .r-text, .r-card.timeout .r-text { color: var(--danger); }
@media (max-width: 760px) {
  .report { left: 96px; gap: 8px; }
  .r-card { min-width: 56px; padding: 6px 4px; }
  .r-emoji { font-size: 24px; }
}
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
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .options { grid-template-columns: 1fr; }
}
</style>
