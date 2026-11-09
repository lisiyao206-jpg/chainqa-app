<script setup lang="ts">
// 学习报告面板：学生在「学习报告」页看自己的，老师在「我的班级 → 学情」里点开某个学生看他的
// 显示：学习概况、每个知识点的掌握度、推荐下一步；学生自己看时还能让白帽导师写一段 AI 学习建议
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { useUserStore } from '../stores/user'
import type { Report, KpScore } from '../types'

const props = defineProps<{ report: Report; self?: boolean }>()
const userStore = useUserStore()
const router = useRouter()

const STATE = { untouched: '未开始', weak: '薄弱', learning: '学习中', mastered: '已掌握' }
// 按大类分组：区块链基础 / 智能合约开发 / 智能合约安全
const groups = computed(() => {
  const map: Record<string, KpScore[]> = {}
  for (const k of props.report.kps) (map[k.group] ||= []).push(k)
  return Object.entries(map)
})
const counts = computed(() => {
  const c = { mastered: 0, learning: 0, weak: 0, untouched: 0 }
  for (const k of props.report.kps) c[k.state]++
  return c
})

// AI 学习建议：点按钮才生成（要调用大模型，比较慢）
const advice = ref('')
const adviceLoading = ref(false)
const adviceError = ref('')
async function getAdvice() {
  adviceLoading.value = true
  adviceError.value = ''
  try {
    const { advice: text } = await userStore.api<{ advice: string }>('/api/report/advice', {})
    // AI 写的内容先把尖括号转义，再按 Markdown 显示，防止里面混进网页代码
    advice.value = marked.parse(text.replace(/</g, '&lt;').replace(/>/g, '&gt;')) as string
  } catch (err) {
    adviceError.value = (err as Error).message
  }
  adviceLoading.value = false
}
</script>

<template>
  <div class="report">
    <!-- 学习概况 -->
    <div class="stats">
      <div class="stat"><b>{{ report.summary.chaptersDone }}</b><span>/ {{ report.summary.chaptersTotal }}</span><em>守住的章节</em></div>
      <div class="stat"><b>{{ report.summary.levelsDone }}</b><span>/ {{ report.summary.levelsTotal }}</span><em>通关的实战</em></div>
      <div class="stat"><b :class="{ warn: report.summary.mistakesOpen }">{{ report.summary.mistakesOpen }}</b><em>待订正错题</em></div>
      <div class="stat"><b>{{ counts.mastered }}</b><span>/ {{ report.kps.length }}</span><em>已掌握的知识点</em></div>
    </div>

    <div class="cols">
      <!-- 知识点掌握度 -->
      <section class="block">
        <h4>知识点掌握度</h4>
        <div v-for="[g, list] in groups" :key="g" class="group">
          <div class="g-name">{{ g }}</div>
          <div v-for="k in list" :key="k.id" :class="['kp', k.state]">
            <span class="k-name">{{ k.name }}</span>
            <span class="bar"><i :style="{ width: k.mastery + '%' }"></i></span>
            <span class="k-score">{{ k.mastery }}</span>
            <span class="k-state">{{ STATE[k.state] }}</span>
            <span class="k-detail">完成 {{ k.done }}/{{ k.total }}<template v-if="k.mistakes"> · 错题 {{ k.mistakes }}</template></span>
          </div>
        </div>
        <p class="rule">掌握度 = 这个知识点下守住防御战的章节和通关的关卡所占比例，每道待订正的错题扣 10 分。</p>
      </section>

      <div class="side">
        <!-- 推荐下一步 -->
        <section class="block">
          <h4>推荐下一步</h4>
          <button v-for="(n, i) in report.next" :key="n.id" class="next" @click="router.push({ path: n.path, query: n.query })">
            <span class="n-no">{{ i + 1 }}</span>
            <span class="n-main">
              <span class="n-title">{{ n.title }}</span>
              <span class="n-reason">{{ n.reason }} · {{ n.track }}</span>
            </span>
            <span class="n-go">→</span>
          </button>
          <p v-if="!report.next.length" class="empty">全部学完了，太厉害了！</p>
        </section>

        <!-- AI 学习建议（只有学生自己看时显示）-->
        <section v-if="self" class="block ai">
          <h4>🤖 白帽导师的学习建议</h4>
          <div v-if="advice" class="advice" v-html="advice"></div>
          <p v-else-if="adviceError" class="error">{{ adviceError }}</p>
          <p v-else class="empty">根据你的学习数据，让白帽导师给你写一份个性化的学习建议。</p>
          <button class="btn" :disabled="adviceLoading" @click="getAdvice">
            {{ adviceLoading ? '导师正在分析…' : advice ? '重新生成' : '生成学习建议' }}
          </button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report { display: flex; flex-direction: column; gap: 16px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.stat { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; padding: 14px 16px; border: 1px solid var(--line); background: rgba(0, 240, 255, 0.03); }
.stat b { font-family: var(--font-code); font-size: 30px; font-weight: 400; color: #fff; }
.stat b.warn { color: var(--danger); }
.stat span { font-family: var(--font-code); font-size: 14px; color: var(--text-faint); }
.stat em { width: 100%; font-style: normal; font-size: 12px; letter-spacing: 1px; color: var(--text-dim); }

.cols { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; align-items: start; }
.side { display: flex; flex-direction: column; gap: 16px; }
.block { padding: 16px 18px; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.2); }
.block h4 { margin: 0 0 12px; font-size: 15px; font-weight: 500; letter-spacing: 2px; color: #fff; }
.group + .group { margin-top: 12px; }
.g-name { margin-bottom: 4px; font-size: 12px; letter-spacing: 2px; color: var(--text-faint); }
.kp { display: grid; grid-template-columns: 130px 1fr 34px 48px 110px; align-items: center; gap: 10px; padding: 5px 0; font-size: 13px; }
.k-name { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { height: 5px; background: rgba(255, 255, 255, 0.07); }
.bar i { display: block; height: 100%; transition: width 0.6s; }
.k-score { font-family: var(--font-code); text-align: right; color: #fff; }
.k-state { font-size: 12px; text-align: center; }
.k-detail { font-size: 12px; color: var(--text-faint); }
.kp.mastered .bar i { background: var(--ok); } .kp.mastered .k-state { color: var(--ok); }
.kp.learning .bar i { background: var(--accent); } .kp.learning .k-state { color: var(--accent); }
.kp.weak .bar i { background: var(--danger); } .kp.weak .k-state { color: var(--danger); }
.kp.untouched { opacity: 0.55; } .kp.untouched .k-state { color: var(--text-faint); }
.rule { margin: 12px 0 0; font-size: 12px; color: var(--text-faint); }

.next {
  width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; text-align: left;
  color: var(--text); background: none; border: none; border-bottom: 1px solid rgba(0, 240, 255, 0.08); font-family: var(--font);
}
.next:hover { background: rgba(0, 240, 255, 0.06); }
.n-no { width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #000; background: var(--accent); border-radius: 50%; }
.n-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.n-title { font-size: 14px; color: #fff; }
.n-reason { font-size: 12px; color: var(--text-faint); }
.n-go { color: var(--accent); }
.empty { margin: 0 0 12px; font-size: 13px; color: var(--text-dim); }
.error { margin: 0 0 12px; font-size: 13px; color: var(--danger); }
.ai { border-color: rgba(0, 240, 255, 0.4); }
.advice { margin-bottom: 12px; font-size: 14px; line-height: 1.8; color: var(--text); }
.advice :deep(ul), .advice :deep(ol) { margin: 0; padding-left: 20px; }
.advice :deep(p) { margin: 0 0 6px; }

@media (max-width: 860px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .cols { grid-template-columns: 1fr; }
  .kp { grid-template-columns: 96px 1fr 30px 44px; }
  .k-detail { display: none; }
}
</style>
