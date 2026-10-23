<script setup lang="ts">
// 实战任务 · 漏洞猎人（打怪版）
// 每一关的合约里盘踞着一只「漏洞怪兽」，你要用代码打败它，分两个回合：
//   ① 锁定弱点：在代码里点出漏洞所在的那一行 → 暴击，怪兽掉一大截血
//   ② 修补漏洞：从三个修补方案里选出正确的代码 → 终结技，漏洞被补上，怪兽消散
// 出错一次，怪兽就用这个漏洞反击你一次（反击的内容就是这个漏洞被利用的过程），扣 1 点信誉
// 每个回合都有倒计时：时间到了还没出手，怪兽也会反击你一次（真实世界里，黑客可不会等你慢慢审计）
// 3 点信誉用完就失败，这道题进错题本；赢的时候剩几点信誉就拿几颗星
// 提示不会自动出现：要自己点「求助情报」，每用一条，这关最多能拿的星星就少一颗——不能光靠提示过关
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { levels } from '../data/levels'
import { useGameStore } from '../stores/game'
import { useMistakesStore } from '../stores/mistakes'
import { useAiStore } from '../stores/ai'
import { useUserStore } from '../stores/user'
import MedalPopup from '../components/MedalPopup.vue'
import MedalWall from '../components/MedalWall.vue'
import CodeFrame from '../components/CodeFrame.vue'
import ImgSlot from '../components/ImgSlot.vue'
import Monster3D from '../components/Monster3D.vue'
import { useThemeStore } from '../stores/theme'
import type { Level, FixOption } from '../types'

// 3D 怪兽的动作指令、飘字、勋章弹窗、反击特效的数据形状
interface MonsterAction { name: string; id: number }
interface Popup { id: number; text: string; kind: string }
interface Medal { stars: number; firstTime: boolean }
interface Point { x: number; y: number }
interface CodeRow { no: number; text: string; bug?: boolean; fixed?: boolean }
interface Fx { type: string; id: number; m: Point; h: Point; c: Point }

const game = useGameStore()
const mistakes = useMistakesStore()
const ai = useAiStore()

// 打开页面时，从数据库读取我的通关记录
// 从 AI 审计的「去打这只怪练手」跳过来时，网址带着 ?level=3：读完进度后直接进入那一关（没解锁就停在选关页）
const route = useRoute()
const router = useRouter()
onMounted(async () => {
  await game.load()
  const lv = levels.find((l) => l.id === Number(route.query.level))
  if (lv) start(lv)
})

// 打完一关：把这一关的合约交给 AI 审计 Agent 复盘，看看 AI 找到的和自己找到的是不是一样
function reviewWithAI() {
  router.push({ path: '/audit', query: { level: level.value!.id } })
}


// 第 1 关一开始就能玩；之后每关要先通过上一关才解锁
function unlocked(lv: Level) {
  return lv.id === 1 || game.cleared[lv.id - 1]
}

// ===== 战斗状态 =====
const MAX_HEARTS = 3
const level = ref<Level | null>(null)       // 当前关卡，null 表示在选关界面
const phase = ref('scan')     // scan 锁定弱点 / patch 修补漏洞 / win 胜利 / lose 失败
const picked = ref<number | null>(null)      // 玩家点中的行号
const hearts = ref(MAX_HEARTS) // 信誉值
const monsterHp = ref(100)
const options = ref<FixOption[]>([])       // 修补方案（打乱顺序）
const chosen = ref<FixOption | null>(null)      // 选中的修补方案
const counter = ref('')       // 怪兽这次反击的台词
const whyWrong = ref('')      // 选错修补方案时，告诉你为什么不行
const hitFx = ref(false)      // 怪兽被打中的闪烁
const hurtFx = ref(false)     // 自己被反击的红屏
const popups = ref<Popup[]>([])        // 飘出来的伤害数字
const medal = ref<Medal | null>(null)       // 胜利时的勋章弹窗：{ stars, firstTime }
const act3d = ref<MonsterAction | null>(null)       // 让 3D 怪兽做动作：{ name: 'hit' | 'attack' | 'death', id }
const no3d = ref(false)       // 3D 显示不了（电脑不支持、模型缺失）时，退回平面图标
const doAct = (name: string) => (act3d.value = { name, id: Date.now() + Math.random() })

// ===== 求助情报（提示）=====
const hintsUsed = ref(0)
const starCap = computed(() => MAX_HEARTS - hintsUsed.value) // 这关最多还能拿几颗星
function useHint() {
  if (hintsUsed.value < level.value!.hints.length) hintsUsed.value++
}

// ===== 倒计时 =====
// 锁定弱点：合约越长给的时间越多（30 秒 + 每行 1 秒）；修补漏洞：45 秒
const limitOf = (p: string) => (p === 'scan' ? 30 + (level.value?.code.length || 0) : p === 'patch' ? 45 : 0)
const limit = computed(() => limitOf(phase.value))
const timeLeft = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined = undefined
function resetTimer() {
  timeLeft.value = limit.value
}
function startTicker() {
  clearInterval(ticker)
  ticker = setInterval(() => {
    if (!level.value || !limit.value) return // 胜利、失败后不再计时
    timeLeft.value--
    if (timeLeft.value <= 0) countered(true) // 时间到：怪兽反击
  }, 1000)
}
const stopTicker = () => clearInterval(ticker)
onUnmounted(stopTicker)

// ===== 反击特效：每只怪兽用「自己的漏洞方式」打你 =====
// 特效要从怪兽飞向你的信誉值（右上角的心），所以先量出几个元素在战场里的位置
const battleEl = ref<HTMLDivElement | null>(null)
const monsterEl = ref<HTMLDivElement | null>(null)
const heartsEl = ref<HTMLElement | null>(null)
const codeEl = ref<HTMLElement | null>(null)
const fx = ref<Fx | null>(null) // { type, id, m: 怪兽中心, h: 心的位置, c: 代码区中心 }
function playFx() {
  if (!battleEl.value) return
  const b = battleEl.value.getBoundingClientRect()
  const center = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2 - b.left), y: Math.round(r.top + r.height / 2 - b.top) }
  }
  const id = Date.now()
  fx.value = { type: level.value!.monster.fx, id, m: center(monsterEl.value!), h: center(heartsEl.value!), c: center(codeEl.value!) }
  setTimeout(() => fx.value?.id === id && (fx.value = null), 1800)
}
// 特效元素的位置用 CSS 变量传进去：--mx/--my 怪兽、--hx/--hy 心、--cx/--cy 代码区
const fxVars = computed(() => {
  const f = fx.value
  return f && { '--mx': f.m.x + 'px', '--my': f.m.y + 'px', '--hx': f.h.x + 'px', '--hy': f.h.y + 'px', '--cx': f.c.x + 'px', '--cy': f.c.y + 'px' }
})
// 钓鱼线：从怪兽甩到你的心，中间往上拱成一条弧线
const hookPath = computed(() => {
  const f = fx.value
  if (!f) return ''
  return `M ${f.m.x} ${f.m.y} Q ${(f.m.x + f.h.x) / 2} ${Math.min(f.m.y, f.h.y) - 160} ${f.h.x} ${f.h.y}`
})
const OVERFLOW = ['255', '65,535', '4,294,967,295', '115792089237316195423570985…']
let popupId = 0

// 背景跟着战斗一起变：进入战斗时整个世界染上这只怪兽的颜色；回到选关页、离开页面时恢复
const theme = useThemeStore()
watch(level, (lv) => {
  theme.setMood(lv ? lv.monster.color : null)
  if (!lv) stopTicker() // 撤退回选关页：停止计时
})
onUnmounted(() => theme.setMood(null))

function start(lv: Level) {
  if (!unlocked(lv)) return
  level.value = lv
  phase.value = 'scan'
  picked.value = null
  hearts.value = MAX_HEARTS
  monsterHp.value = 100
  chosen.value = null
  counter.value = whyWrong.value = ''
  // 修补方案每次打乱顺序，不能靠「记住第几个」过关
  options.value = [...lv.fix.options].sort(() => Math.random() - 0.5)
  act3d.value = null
  no3d.value = false
  fx.value = null
  hintsUsed.value = 0
  resetTimer()
  startTicker()
}

// ===== 变种挑战：AI 换场景出同一类漏洞的新题 =====
// 打通一关后，卡片上出现「🔁 变种挑战」。AI 依据教材，以这一关为样例换新场景出题
// （考点不变，但代码、写法、藏漏洞的位置都变），由后端规则扫描器验题、存库复用。
const user = useUserStore()
const variantLoading = ref<number | null>(null)   // 正在出题的关卡（防止重复点击）
const variantError = ref('')                     // 出题失败时的提示
async function challengeVariant(lv: Level) {
  if (variantLoading.value !== null) return
  if (!unlocked(lv)) return
  variantLoading.value = lv.id
  variantError.value = ''
  try {
    // 传给后端的样例关卡：标题、类型、教材章节、代码、漏洞行、修复方案
    const sample = {
      id: lv.id, title: lv.title, type: lv.type, chapter: lv.chapter,
      difficulty: lv.difficulty, story: lv.story, code: lv.code,
      bugLines: lv.bugLines, fix: { lines: lv.fix.lines, options: lv.fix.options },
    }
    // force=false：同关已有缓存题就直接复用；想再出一道，等这道拿完了天然可按同一按钮再触发即可
    const variantLevel = await user.api<Level>('/api/variant/generate', { baseLevel: lv.id, sample }, 'POST')
    if (!variantLevel?.isVariant) throw new Error('出题失败，请稍后重试')
    start(variantLevel)
  } catch (err: any) {
    variantError.value = err?.message || '出题失败，请稍后重试'
    setTimeout(() => (variantError.value = ''), 2600)
  } finally {
    variantLoading.value = null
  }
}

// 飘一个数字，0.9 秒后消失
function popup(text: string, kind: string) {
  const id = ++popupId
  popups.value.push({ id, text, kind })
  setTimeout(() => (popups.value = popups.value.filter((p) => p.id !== id)), 900)
}
function flash(fx: Ref<boolean>) {
  fx.value = true
  setTimeout(() => (fx.value = false), 450)
}

// 打中怪兽
function damage(n: number, text: string) {
  monsterHp.value = Math.max(0, monsterHp.value - n)
  popup(text, 'crit')
  flash(hitFx)
  if (monsterHp.value > 0) doAct('hit') // 被打中的动作；血量打空时由 win() 播放倒下
}

// 出错：怪兽用漏洞反击。反击台词按顺序一句一句演，演的就是这个漏洞被利用的过程
function countered(timeout = false) {
  const attacks = level.value!.monster.attacks
  const line = attacks[(MAX_HEARTS - hearts.value) % attacks.length]
  counter.value = timeout ? `⏰ 你犹豫太久了！${line}` : line
  hearts.value--
  playFx()      // 这只怪兽专属的漏洞特效
  resetTimer()  // 挨了一下之后，给你重新计时
  popup('信誉 -1', 'hurt')
  flash(hurtFx)
  theme.flash('hurt') // 背景红光一闪
  doAct('attack')     // 3D 怪兽扑过来打你
  if (hearts.value <= 0) lose()
}

// ① 锁定弱点
function scan() {
  if (picked.value === null) return
  if (level.value!.bugLines.includes(picked.value)) {
    counter.value = ''
    damage(60, '暴击 -60')
    phase.value = 'patch'
    resetTimer() // 进入第二回合，重新计时
  } else {
    picked.value = null
    countered()
  }
}

// ② 修补漏洞
function patch(opt: FixOption) {
  if (phase.value !== 'patch') return
  chosen.value = opt
  if (opt.correct) {
    whyWrong.value = counter.value = ''
    damage(40, '终结 -40')
    win()
  } else {
    whyWrong.value = opt.why
    countered()
  }
}

function win() {
  phase.value = 'win'
  stopTicker()
  theme.flash('win') // 背景光芒扩散
  doAct('death')     // 3D 怪兽倒下
  theme.setMood('#8ee6c4') // 漏洞补上了，世界恢复成安全的绿色
  const stars = Math.max(1, Math.min(hearts.value, starCap.value)) // 剩几点信誉就拿几颗星，用过提示要再扣
  // 先记下「之前有没有通过」，再保存成绩，这样才知道是不是第一次拿到这枚勋章
  const firstTime = !game.cleared[level.value!.id]
  game.clear(level.value!.id, stars)
  setTimeout(() => (medal.value = { stars, firstTime }), 900) // 等怪兽消散的动画放完再弹勋章
}

function lose() {
  phase.value = 'lose'
  stopTicker()
  const lv = level.value!
  const right = lv.fix.options.find((o) => o.correct)!
  // 失败：这道题自动进错题本，附上正确的修补代码
  mistakes.add(
    `【漏洞猎人 · ${lv.title}】这份合约的漏洞在哪？怎么修补？\n\n${lv.code.join('\n')}`,
    `漏洞类型：${lv.type}（第 ${lv.bugLines.join('、')} 行）\n${lv.explanation}\n\n正确的修补：\n${right.code.join('\n')}\n${right.why}`,
    'game'
  )
}

// 代码面板要显示的行：胜利后，漏洞那几行换成修补好的代码（绿色）
const shownLines = computed((): CodeRow[] => {
  const lv = level.value
  if (!lv) return []
  const [from, to] = lv.fix.lines
  const rows: CodeRow[] = lv.code.map((text, i) => ({ no: i + 1, text, bug: lv.bugLines.includes(i + 1) }))
  if (phase.value !== 'win') return rows
  const fixed = lv.fix.options.find((o) => o.correct)!.code.map((text) => ({ text, fixed: true }))
  return [...rows.slice(0, from - 1), ...fixed, ...rows.slice(to)].map((r, i) => ({ ...r, no: i + 1 }))
})

// 让白帽导师结合教材再讲一遍
function askMentor() {
  ai.ask(`我在漏洞猎人里遇到了「${level.value!.type}」漏洞，请结合教材讲讲它的原理，以及怎么防范。`)
}

// 选关页顶部的总进度
const showWall = ref(false) // 勋章墙开关
const clearedCount = computed(() => levels.filter((l) => game.cleared[l.id]).length)
const totalStars = computed(() => levels.reduce((n, l) => n + (game.cleared[l.id] || 0), 0))

const nextLevel = computed(() => levels.find((l) => l.id === (level.value?.id as number) + 1))
const editMode = ref(false)          // true = 亲手改代码编辑器；false = 四选一
const codeText = ref('')             // 编辑器里当前代码
const verifyState = ref<'idle' | 'checking' | 'fixed' | 'fail'>('idle')
const verifyMsg = ref('')            // 校验结果的提示
let lastFixed: number[] | null = null // 记录上次成功修复的行，用于标记
// 进入亲手改代码模式：把当前关卡的漏洞行代码预填进编辑器
function enableEditor() {  
editMode.value = true  
verifyState.value = 'idle'  
verifyMsg.value = ''  
codeText.value = level.value!.code.join('\n')
}
// 回到四选一
function backToChoices() {  
editMode.value = false  
verifyState.value = 'idle'  
verifyMsg.value = ''
}
// 提交亲手写好的代码，交给后端 /api/variant/verify 校验
async function submitFix() {  
if (verifyState.value === 'checking' || !level.value) return  
const lv = level.value  
verifyState.value = 'checking'  
verifyMsg.value = ''  
try {    
const res = await user.api<{ fixed: boolean; swc?: string; remaining?: { line: number }[]; note?: string }>(      
'/api/variant/verify',      
{ baseLevel: lv.id, swc: LEVEL_SWC_FRONT?.[lv.id] ?? swcFor(lv), codeLines: codeText.value.split('\n') },      
'POST'    
)    
if (res?.fixed) {      
verifyState.value = 'fixed'      
verifyMsg.value = res.note || '漏洞已修复 🎉'      
lastFixed = (res.remaining || []).map((r) => r.line)      
damage(40, '亲手修复 -40')      
win()    
} else {      
verifyState.value = 'fail'      
verifyMsg.value = res?.note || '还没修好，再检查一下漏洞所在的行'      
countered()    
}  
} catch {    
verifyState.value = 'fail'    
verifyMsg.value = '校验失败，请稍后重试'  
}
}
// 前端也能查到关卡对应的 SWC（与后端 LEVEL_SWC 保持一致）
const LEVEL_SWC_FRONT: Record<number, string> = {  
1: 'SWC-105', 2: 'SWC-101', 3: 'SWC-107', 4: 'SWC-115', 5: 'SWC-120',  
6: 'SWC-112', 7: 'SWC-104', 8: 'SWC-113', 9: 'SWC-116', 10: 'SWC-121',
}
function swcFor(lv: Level) { return LEVEL_SWC_FRONT[lv.id] || '' }
</script>

<template>
  <!-- 最外层只能有一个固定的元素：页面切换动画（App.vue 里的 Transition）套在这个组件外面，
       如果最外层是 v-if / v-else 来回切换，动画会以为「换页了」，卡在半透明状态，关卡就打不开 -->
  <div class="game">
    <!-- ===== 选关界面 ===== -->
    <div v-if="!level" class="select">
      <div class="eyebrow">Field Mission · Bug Hunter</div>
      <h2>漏洞猎人</h2>
      <p class="intro">每一份出了事的合约里，都盘踞着一只漏洞怪兽。找到它的弱点，用正确的代码把漏洞补上，就能消灭它。</p>
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
          <div class="card-monster" :style="{ '--mc': lv.monster.color }">{{ unlocked(lv) ? lv.monster.emoji : '❔' }}</div>
          <div class="card-title">{{ unlocked(lv) ? lv.monster.name : '未知怪兽' }}</div>
          <div class="card-type">{{ unlocked(lv) ? `${lv.title} · ${lv.type}` : '先通过上一关' }}</div>
          <!-- 难度：越往后合约越长、干扰代码越多 -->
          <div class="diff" :title="`难度 ${lv.difficulty} / 5`">难度 <i v-for="n in 5" :key="n" :class="{ on: n <= lv.difficulty }"></i></div>
          <div class="stars">
            <span v-for="i in 3" :key="i" :class="{ on: i <= (game.cleared[lv.id] || 0) }">★</span>
          </div>
          <!-- 打通一关后可发起「变种挑战」：AI 依据教材换新场景出同一类漏洞的新题（规则扫描器验过题） -->
          <div class="card-actions">
            <button
              v-if="game.cleared[lv.id]"
              class="variant-btn"
              :class="{ loading: variantLoading === lv.id }"
              :disabled="variantLoading !== null"
              @click.stop="challengeVariant(lv)"
            >
              {{ variantLoading === lv.id ? 'AI 出题中…' : '🔁 变种挑战' }}
              <small v-if="unlocked(lv) && game.cleared[lv.id]">换场景·同漏洞</small>
            </button>
          </div>
          <div class="card-go">{{ unlocked(lv) ? (game.cleared[lv.id] ? '再次讨伐 →' : '开始讨伐 →') : '🔒' }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 战斗界面 ===== -->
    <div v-else ref="battleEl" :class="['battle', { hurt: hurtFx }]" :style="{ '--mc': level.monster.color }">
      <div class="play-head">
        <button class="back" @click="level = null">← 撤退</button>
        <span>第 {{ level.id }} 关 · {{ level.title }}</span>
        <!-- 信誉值：3 颗心，出错一次少一颗 -->
        <!-- 倒计时：最后 10 秒变红闪烁 -->
        <span v-if="limit" :class="['timer', { urgent: timeLeft <= 10 }]" title="时间到了还没出手，怪兽会反击你">
          ⏱ {{ timeLeft }}s
          <i class="timebar"><b :style="{ width: (timeLeft / limit) * 100 + '%' }"></b></i>
        </span>
        <span v-if="hintsUsed" class="cap" title="用过情报，这关最多能拿的星星">最多 {{ '★'.repeat(starCap) }}</span>
        <span ref="heartsEl" class="hearts" title="信誉值：出错或超时一次扣 1 点，扣完就失败">
          <i v-for="n in MAX_HEARTS" :key="n" :class="{ lost: n > hearts }">♥</i>
        </span>
      </div>

      <div class="arena">
        <!-- 左边：漏洞怪兽 -->
        <!-- 怪兽不放在框里：直接站在战场上，脚下一圈光，头顶是名字和血条 -->
        <div class="monster-side">
          <div class="hud">
            <div class="m-name">{{ level.monster.name }}<small>{{ level.type }}</small></div>
            <div class="hp"><div class="hp-fill" :style="{ width: monsterHp + '%' }"></div><span>HP {{ monsterHp }}</span></div>
          </div>
          <div class="floor"></div>
          <div ref="monsterEl" :class="['monster', { hit: hitFx, dead: phase === 'win', swell: fx?.type === 'swell' }]">
            <!-- 优先显示 3D 模型（/monsters/level-N.glb）；显示不了就用平面图（/monsters/level-N.png），再不行就用 emoji -->
            <Monster3D v-if="!no3d" :key="level.id" :src="`/monsters/level-${level.id}.glb`" :color="level.monster.color" :action="act3d ?? undefined" @error="no3d = true" />
            <ImgSlot v-else :src="`/monsters/level-${level.id}.png`" :fallback="level.monster.emoji" :label="`level-${level.id}.png`" compact />
          </div>
          <!-- 飘出来的伤害数字 -->
          <span v-for="p in popups" :key="p.id" :class="['popup', p.kind]">{{ p.text }}</span>
          <!-- 怪兽的反击：用这个漏洞打你，演的就是攻击过程（像对话气泡一样冒在怪兽下方） -->
          <div v-if="counter" :key="counter" class="counter">⚡ {{ counter }}</div>
        </div>

        <!-- 右边：案情 + 代码 -->
        <div class="code-side">
          <div class="story">📋 {{ level.story }}</div>
          <div ref="codeEl" class="code">
            <div
              v-for="r in shownLines"
              :key="r.no + (r.fixed ? 'f' : '')"
              :class="['line', {
                picked: phase === 'scan' && picked === r.no,
                weak: phase !== 'scan' && r.bug,
                fixed: r.fixed,
                clickable: phase === 'scan',
              }]"
              @click="phase === 'scan' && (picked = r.no)"
            >
              <span class="ln">{{ r.no }}</span>
              <pre>{{ r.text || ' ' }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 反击特效层：盖在整个战场上面，不挡鼠标 ===== -->
      <div v-if="fx" :key="fx.id" :class="['fx', 'fx-' + fx.type]" :style="fxVars">
        <!-- 权限窃贼：金币从金库（代码区）被一枚枚抢回怪兽身上 -->
        <template v-if="fx.type === 'steal'">
          <span v-for="i in 7" :key="i" class="coin" :style="{ '--i': i }">🪙</span>
        </template>
        <!-- 溢出刺球：身体膨胀，头顶冒出越来越大的数字，最后变成 2²⁵⁶ 那么大 -->
        <template v-else-if="fx.type === 'swell'">
          <span v-for="(n, i) in OVERFLOW" :key="i" class="num" :style="{ '--i': i }">{{ n }}</span>
        </template>
        <!-- 重入幽灵：分身一个接一个扑向你（一次又一次地重入） -->
        <template v-else-if="fx.type === 'clones'">
          <span v-for="i in 4" :key="i" class="clone" :style="{ '--i': i }">👻</span>
        </template>
        <!-- 钓鱼魅影：甩出鱼线，把你的一颗心钩走 -->
        <template v-else-if="fx.type === 'hook'">
          <svg class="line"><path :d="hookPath" /></svg>
          <span class="hook">🪝</span>
          <span class="stolen">♥</span>
        </template>
        <!-- 预言巫师：头顶先浮现开奖号码（它早就算出来了），再砸向你 -->
        <template v-else-if="fx.type === 'prophecy'">
          <span class="omen">开奖号码 · 7</span>
          <span class="ball">7</span>
        </template>
      </div>

      <!-- ① 锁定弱点 -->
      <div v-if="phase === 'scan'" class="panel">
        <div class="step">回合 ① · 锁定弱点</div>
        <div class="hint">
          <div>在代码里点出漏洞所在的那一行，对它发动攻击（{{ limitOf('scan') }} 秒内不出手，怪兽会先动手）</div>
          <!-- 已经用过的提示 -->
          <div v-for="(h, i) in level.hints.slice(0, hintsUsed)" :key="i" class="intel">💡 情报 {{ i + 1 }}：{{ h }}</div>
        </div>
        <button v-if="hintsUsed < level.hints.length" class="intel-btn" :title="`用了之后这关最多拿 ${starCap - 1} 颗星`" @click="useHint">
          💡 求助情报 <small>-1 ★</small>
        </button>
        <button class="primary" :disabled="picked === null" @click="scan">⚔ 攻击第 {{ picked ?? '?' }} 行</button>
      </div>

      <!-- ② 修补漏洞：三个方案选一个 -->
      <div v-else-if="phase === 'patch'" class="panel col">
        <div class="step">回合 ② · 修补漏洞 —— {{ limitOf('patch') }} 秒内选出正确的代码，替换掉红色的那几行，发动终结技</div>
        <button
          v-for="(o, i) in options"
          :key="i"
          :class="['fix', { wrong: chosen === o && !o.correct }]"
          :disabled="chosen === o && !o.correct"
          @click="patch(o)"
        >
          <pre>{{ o.code.map((l) => l.trim()).join('\n') }}</pre>
        </button>
        <div v-if="whyWrong" class="why">✗ {{ whyWrong }}</div>
      </div>

      <!-- 胜利 / 失败 -->
      <div v-else :class="['result', phase]">
        <div class="result-title">
          {{ phase === 'win' ? `✨ ${level.monster.name}被消灭了！漏洞已修补（绿色的代码）` : `💀 信誉耗尽，${level.monster.name}逃走了……这道题已经放进错题本` }}
        </div>
        <div><b>漏洞类型：</b>{{ level.type }}</div>
        <div class="explain">{{ level.explanation }}</div>
        <div v-if="phase === 'win'" class="explain ok">✓ {{ level.fix.options.find((o) => o.correct)!.why }}</div>
        <div class="result-actions">
          <button @click="askMentor">🧑‍💻 请白帽导师结合教材再讲讲</button>
          <button @click="start(level)">🔄 再战一次</button>
          <!-- 变种挑战：AI 换场景出同一类漏洞的新题（打完一关后可用，规则扫描器验过题） -->
          <button
            v-if="phase === 'win'"
            :disabled="variantLoading !== null"
            @click="challengeVariant(level)"
          >{{ variantLoading !== null ? 'AI 出题中…' : '🔁 变种挑战（换场景·同漏洞）' }}</button>
          <button @click="reviewWithAI">🤖 让 AI 审计复盘这份合约</button>
          <button v-if="phase === 'win' && nextLevel" class="primary" @click="start(nextLevel)">下一只怪兽 →</button>
        </div>
        <div v-if="variantError" class="variant-err">⚠ {{ variantError }}</div>
      </div>

      <!-- 胜利时弹出勋章 -->
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

/* 变种挑战 */
.card-actions { margin-top: 12px; display: flex; }
.variant-btn {
  width: 100%; padding: 8px 10px; cursor: pointer; border-radius: 6px; text-align: center;
  font-size: 13px; letter-spacing: 1px; color: var(--accent-strong);
  background: rgba(0, 240, 255, 0.1); border: 1px solid var(--accent-strong);
  transition: all 0.2s;
}
.variant-btn:hover { background: rgba(0, 240, 255, 0.2); box-shadow: 0 0 12px rgba(0, 240, 255, 0.4); }
.variant-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.variant-btn.loading { animation: blink 0.8s steps(2) infinite; }
.variant-btn small { display: block; margin-top: 2px; font-size: 10px; opacity: 0.7; }
.variant-err { margin-top: 10px; padding: 8px 12px; border-radius: 6px; text-align: center; font-size: 13px; color: var(--danger); background: rgba(255, 43, 214, 0.1); border: 1px solid var(--danger); }

/* 选关卡片上的怪兽 */
.card-monster { margin-top: 10px; font-size: 40px; line-height: 1; filter: drop-shadow(0 0 10px var(--mc)); }
.card.locked .card-monster { filter: grayscale(1); }

/* ===== 战斗界面：铺满整个页面，不留空 ===== */
/* 高度 = 屏幕高度 - 顶栏和页面边距；分三行：标题栏 / 战场（占满剩下的空间）/ 回合面板 */
.battle {
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 14px;
  height: calc(100vh - 120px); min-height: 560px; max-width: 1360px; margin: 0 auto; position: relative;
}
/* 被反击：整个画面抖一下 */
.battle.hurt { animation: shake 0.4s; }
@keyframes shake {
  20% { transform: translateX(-8px); } 40% { transform: translateX(7px); }
  60% { transform: translateX(-5px); } 80% { transform: translateX(3px); }
}
.play-head { display: flex; align-items: center; gap: 16px; font-weight: 500; letter-spacing: 1px; color: #fff; }
.back { border: none; background: none; color: var(--accent); cursor: pointer; font-size: 14px; }
.timer { margin-left: auto; display: flex; align-items: center; gap: 8px; font-family: var(--font-code); font-size: 14px; color: var(--accent); }
.timebar { display: inline-block; width: 120px; height: 6px; background: rgba(255, 255, 255, 0.1); }
.timebar b { display: block; height: 100%; background: var(--accent); box-shadow: 0 0 8px var(--accent); transition: width 1s linear; }
.timer.urgent { color: var(--danger); animation: blink 0.5s steps(2) infinite; }
.timer.urgent .timebar b { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
@keyframes blink { 50% { opacity: 0.4; } }
.hearts { font-size: 22px; letter-spacing: 4px; color: var(--accent-strong); text-shadow: 0 0 10px var(--accent-strong); }
.hearts .lost { color: rgba(255, 255, 255, 0.15); text-shadow: none; }

/* 战场：左边怪兽（约 4 成宽），右边代码；两边都撑满高度 */
.arena { display: grid; grid-template-columns: minmax(340px, 2fr) 3fr; gap: 24px; min-height: 0; }

/* 怪兽：没有边框和底色，直接站在背景上 */
.monster-side { position: relative; display: flex; flex-direction: column; min-height: 0; }
.hud { position: relative; z-index: 2; text-align: center; padding: 0 12%; }
.m-name { font-size: 22px; font-weight: 700; letter-spacing: 6px; color: #fff; text-shadow: 0 0 16px var(--mc); }
.m-name small { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; letter-spacing: 3px; color: var(--text-dim); text-shadow: none; }
.hp { position: relative; height: 12px; margin-top: 10px; background: rgba(255, 255, 255, 0.08); border: 1px solid color-mix(in srgb, var(--mc) 50%, transparent); }
.hp-fill { height: 100%; background: linear-gradient(90deg, var(--danger), var(--accent-strong)); box-shadow: 0 0 10px var(--danger); transition: width 0.5s ease-out; }
.hp span { position: absolute; inset: 0; font-size: 10px; line-height: 10px; color: #fff; letter-spacing: 1px; text-align: center; }
/* 脚下的一圈光：让怪兽「站」在战场上，而不是飘在空中 */
.floor {
  position: absolute; left: 10%; right: 10%; bottom: 6%; height: 70px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(ellipse, color-mix(in srgb, var(--mc) 55%, transparent), transparent 70%);
  filter: blur(6px); animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe { 50% { opacity: 0.55; transform: scaleX(0.9); } }
.monster {
  flex: 1; min-height: 0; width: 100%; font-size: 180px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  filter: drop-shadow(0 0 22px color-mix(in srgb, var(--mc) 70%, transparent));
}
.monster :deep(.slot-placeholder) { border: none; }
.monster:not(:has(canvas)) { animation: float 3s ease-in-out infinite; } /* 平面图标没有动作，用浮动代替 */
@keyframes float { 50% { transform: translateY(-10px); } }
/* 被打中：一闪白 + 往后一缩 */
.monster.hit { animation: hit 0.45s; }
/* 溢出刺球反击时：身体一下子膨胀到快爆，再缩回来 */
.monster.swell { animation: swell 1.2s ease-in-out; }
@keyframes swell { 40% { transform: scale(1.45); filter: brightness(1.8) drop-shadow(0 0 40px var(--gold)); } 60% { transform: scale(1.4); } }
@keyframes hit {
  30% { transform: translateX(-18px) scale(0.95); filter: brightness(2.5) drop-shadow(0 0 30px #fff); }
}
/* 被消灭：等倒地动作播完（约 1 秒），再放大、变亮、消散 */
.monster.dead { animation: vanish 1s 1.2s forwards; }
@keyframes vanish {
  40% { transform: scale(1.1); filter: brightness(3) drop-shadow(0 0 40px var(--mc)); opacity: 1; }
  100% { transform: scale(0.3) translateY(-60px); filter: brightness(4) blur(10px); opacity: 0; }
}
.popup {
  position: absolute; left: 50%; top: 30%; transform: translateX(-50%); pointer-events: none; z-index: 3;
  font-size: 40px; font-weight: 900; white-space: nowrap; animation: rise 0.9s ease-out forwards;
}
.popup.crit { color: var(--gold); text-shadow: 0 0 16px var(--gold), 0 3px 0 #000; }
.popup.hurt { color: var(--danger); text-shadow: 0 0 16px var(--danger), 0 3px 0 #000; top: 15%; }
@keyframes rise { from { opacity: 1; margin-top: 0; } to { opacity: 0; margin-top: -80px; } }
/* 反击台词：浮在怪兽脚下 */
.counter {
  position: absolute; left: 6%; right: 6%; bottom: 0; z-index: 2; padding: 10px 14px;
  font-size: 14px; line-height: 1.6; color: #ffd0d8;
  background: rgba(40, 6, 18, 0.85); border: 1px solid var(--danger); box-shadow: 0 0 20px rgba(255, 107, 129, 0.35);
  animation: pop 0.3s ease-out;
}
@keyframes pop { from { transform: scale(0.9); opacity: 0; } }

/* ===== 反击特效 ===== */
.fx { position: absolute; inset: 0; z-index: 20; pointer-events: none; overflow: visible; }
.fx span { position: absolute; transform: translate(-50%, -50%); }

/* 权限窃贼：金币从代码区（金库）飞回怪兽 */
.coin {
  left: var(--cx); top: var(--cy); font-size: 30px; opacity: 0;
  animation: steal 0.8s calc(var(--i) * 0.09s) ease-in forwards;
}
@keyframes steal {
  0% { opacity: 1; }
  100% { opacity: 0.2; left: var(--mx); top: var(--my); scale: 0.4; }
}

/* 溢出刺球：数字一个比一个大，往上冒 */
.num {
  left: var(--mx); top: var(--my); white-space: nowrap; opacity: 0;
  font-family: var(--font-code); font-weight: 900; color: var(--gold);
  font-size: calc(16px + var(--i) * 7px); text-shadow: 0 0 14px var(--gold), 0 2px 0 #000;
  animation: overflow 1.3s calc(var(--i) * 0.22s) ease-out forwards;
}
@keyframes overflow {
  0% { opacity: 0; margin-top: 0; }
  20% { opacity: 1; }
  100% { opacity: 0; margin-top: -260px; }
}

/* 重入幽灵：分身从怪兽冲向你的心，一个接一个 */
.clone {
  left: var(--mx); top: var(--my); font-size: 90px; opacity: 0;
  filter: drop-shadow(0 0 18px var(--accent)) hue-rotate(160deg);
  animation: dash 0.55s calc(var(--i) * 0.25s) ease-in forwards;
}
@keyframes dash {
  0% { opacity: 0.85; scale: 0.8; }
  100% { opacity: 0; left: var(--hx); top: var(--hy); scale: 0.3; }
}

/* 钓鱼魅影：甩出鱼线，钩子落在心上，再把一颗心拖回去 */
.fx-hook .line { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.fx-hook path {
  fill: none; stroke: var(--accent-strong); stroke-width: 2.5; stroke-dasharray: 2000; stroke-dashoffset: 2000;
  filter: drop-shadow(0 0 6px var(--accent-strong)); animation: cast 0.5s ease-out forwards, fade 0.4s 1.2s forwards;
}
@keyframes cast { to { stroke-dashoffset: 0; } }
@keyframes fade { to { opacity: 0; } }
.hook { left: var(--hx); top: var(--hy); font-size: 34px; opacity: 0; animation: hookin 0.3s 0.4s forwards, fade 0.4s 1.2s forwards; }
@keyframes hookin { from { opacity: 0; scale: 2; } to { opacity: 1; scale: 1; } }
.stolen {
  left: var(--hx); top: var(--hy); font-size: 30px; color: var(--accent-strong); opacity: 0;
  text-shadow: 0 0 12px var(--accent-strong); animation: reel 0.7s 0.75s ease-in forwards;
}
@keyframes reel { 0% { opacity: 1; } 100% { opacity: 0; left: var(--mx); top: var(--my); } }

/* 预言巫师：头顶浮现开奖号码，然后号码球砸向你 */
.omen {
  left: var(--mx); top: calc(var(--my) - 170px); white-space: nowrap; opacity: 0;
  font-size: 18px; letter-spacing: 4px; color: var(--ok); text-shadow: 0 0 12px var(--ok);
  animation: omen 1.5s ease-out forwards;
}
@keyframes omen { 0% { opacity: 0; margin-top: 20px; } 25%, 70% { opacity: 1; margin-top: 0; } 100% { opacity: 0; } }
.ball {
  left: var(--mx); top: calc(var(--my) - 110px); width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; color: #05020f;
  background: radial-gradient(circle at 35% 30%, #fff, var(--ok) 60%); box-shadow: 0 0 30px var(--ok); opacity: 0;
  animation: prophecy 1.4s ease-in forwards;
}
@keyframes prophecy {
  0% { opacity: 0; scale: 0.3; }
  30%, 55% { opacity: 1; scale: 1; }
  100% { opacity: 0.2; left: var(--hx); top: var(--hy); scale: 0.4; }
}

/* 代码 */
.code-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
.story {
  padding: 10px 14px; line-height: 1.7; color: var(--text); font-size: 14px;
  background: rgba(252, 238, 10, 0.08); border-left: 3px solid var(--gold);
}
.code {
  flex: 1; min-height: 0; padding: 12px 0; overflow: auto; /* 撑满右边的高度，代码太长就在里面滚动 */
  background: rgba(3, 2, 12, 0.88); border: 1px solid var(--line-strong);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.12);
}
.line { display: flex; transition: background 0.15s; }
.line.clickable { cursor: crosshair; } /* 锁定弱点时，鼠标变成准星 */
.line.clickable:hover { background: rgba(0, 240, 255, 0.08); }
.line.picked { background: rgba(0, 240, 255, 0.22); box-shadow: inset 3px 0 0 var(--accent); }
.line.weak { background: rgba(255, 107, 129, 0.25); box-shadow: inset 3px 0 0 var(--danger); }
.line.fixed { background: rgba(142, 230, 196, 0.2); box-shadow: inset 3px 0 0 var(--ok); animation: pop 0.5s ease-out; }
.ln { width: 44px; flex-shrink: 0; text-align: right; padding-right: 14px; color: var(--text-faint); user-select: none; font-family: var(--font-code); font-size: 13px; line-height: 1.7; }
.line pre { margin: 0; color: #dff6ff; font-family: var(--font-code); font-size: 14px; line-height: 1.7; }

/* 回合面板 */
.panel { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--glass-strong); border: 1px solid var(--line); }
.panel.col { flex-direction: column; align-items: stretch; }
.step { font-size: 12px; letter-spacing: 2px; color: var(--accent); }
.panel:not(.col) .step { flex-shrink: 0; }
.hint { flex: 1; color: var(--text-dim); font-size: 14px; display: flex; flex-direction: column; gap: 4px; }
.intel { color: var(--gold); font-size: 13px; }
.intel-btn {
  flex-shrink: 0; padding: 8px 14px; cursor: pointer; font-size: 13px; color: var(--gold);
  background: rgba(252, 238, 10, 0.06); border: 1px dashed rgba(252, 238, 10, 0.5);
}
.intel-btn:hover { background: rgba(252, 238, 10, 0.14); }
.intel-btn small { margin-left: 4px; color: var(--danger); }
.cap { font-size: 12px; color: var(--gold); letter-spacing: 1px; }
.diff { margin-top: 8px; display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-faint); }
.diff i { width: 14px; height: 4px; background: rgba(255, 255, 255, 0.12); }
.diff i.on { background: var(--accent-strong); box-shadow: 0 0 6px var(--accent-strong); }
.fix {
  padding: 10px 14px; cursor: pointer; text-align: left; overflow-x: auto;
  background: rgba(3, 2, 12, 0.85); border: 1px solid var(--line-strong); transition: all 0.2s;
}
.fix pre { margin: 0; font-family: var(--font-code); font-size: 13px; line-height: 1.7; color: #dff6ff; }
.fix:hover:not(:disabled) { border-color: var(--ok); box-shadow: 0 0 16px rgba(142, 230, 196, 0.25); transform: translateX(4px); }
.fix.wrong { opacity: 0.45; border-color: var(--danger); cursor: not-allowed; }
.why { font-size: 13px; color: #ffd0d8; line-height: 1.6; }
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
.explain.ok { color: var(--ok); }
.result-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.result-actions button {
  padding: 8px 14px; cursor: pointer; font-size: 13px; color: var(--text);
  border: 1px solid var(--line-strong); background: rgba(255, 255, 255, 0.04);
}
.result-actions button:hover { border-color: var(--accent); color: #fff; }
.result-actions .primary { border: none; color: #05020f; }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .cards { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  /* 战斗：不再固定一屏高度，整页往下滑；怪兽在上，代码在下，回合面板在最下面 */
  .battle { height: auto; min-height: 0; gap: 10px; }
  .play-head { flex-wrap: wrap; gap: 8px 12px; font-size: 14px; }
  .timer { margin-left: 0; }
  .timebar { width: 80px; }
  .hearts { font-size: 18px; letter-spacing: 2px; }
  .arena { grid-template-columns: 1fr; gap: 10px; }
  .monster-side { height: 260px; }
  .monster { font-size: 110px; }
  .code-side { min-height: 320px; }
  /* 回合面板：说明文字占一整行，按钮排在下面 */
  .panel { flex-wrap: wrap; }
  .panel .hint { flex-basis: 100%; }
  .fix pre { white-space: pre-wrap; word-break: break-all; }
}
</style>
