<script setup lang="ts">
// 学习中心：把预备营、训练营等所有教材整理成五条学习路线，从零基础一路学到能动手
// 每一章带知识点标签；守住过防御战的章节打勾，路线上显示学习进度
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'

interface LearnChapter {
  id: string
  no: string
  title: string
  kps: string[]
}
interface Track {
  id: string
  no: string
  name: string
  desc: string
  book: string
  total: number
  groups: { name: string; chapters: LearnChapter[] }[]
}

const userStore = useUserStore()
const router = useRouter()
const route = useRoute()
const tracks = ref<Track[]>([])
const defended = ref<Record<string, number>>({}) // 守住过的章节：{ 章节id: 最好成绩 }
const open = ref<string | null>(null)             // 展开目录的路线
const error = ref('')

onMounted(async () => {
  userStore.api('/api/camp').then((d: Record<string, number>) => (defended.value = d)).catch(() => {})
  try {
    tracks.value = await userStore.api<Track[]>('/api/learn/tracks')
    // 网址带 ?track= 就展开那一条（顶栏下拉菜单点进来的）；否则展开第一条还没学完、并且有内容的路线
    open.value = (route.query.track as string) || (tracks.value.find((t) => t.total && done(t) < t.total)?.id ?? null)
  } catch (err) {
    error.value = (err as Error).message
  }
})

// 已经在学习中心时，从顶栏下拉菜单换一条路线：网址变了，页面不会重新加载，所以要盯着它
watch(() => route.query.track, (t) => {
  if (t) open.value = t as string
  document.getElementById('track-' + t)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

const isDone = (id: string) => (defended.value[id] ?? 0) > 0
function done(t: Track) {
  return t.groups.reduce((n, g) => n + g.chapters.filter((c) => isDone(c.id)).length, 0)
}
const percent = (t: Track) => (t.total ? Math.round((done(t) / t.total) * 100) : 0)
const totalChapters = computed(() => tracks.value.reduce((n, t) => n + t.total, 0))
const totalDone = computed(() => tracks.value.reduce((n, t) => n + done(t), 0))

// 打开某一章：自编教材走各自的阅读页，WTF 教材走训练营
const READER: Record<string, string> = { prep: '/prep', fisco: '/fisco', frontier: '/frontier', '': '/camp' }
function read(t: Track, c: LearnChapter) {
  router.push({ path: READER[t.book] ?? '/camp', query: { chapter: c.id } })
}
</script>

<template>
  <div class="learn">
    <header class="head">
      <div>
        <div class="eyebrow">Learning Center</div>
        <h2 class="glitch" data-text="学习中心">学习中心</h2>
        <p>五条路线，从零基础到亲手上链。每读完一章，守住章末的防御战就算掌握。</p>
      </div>
      <div v-if="totalChapters" class="overall">
        <b>{{ totalDone }}</b><span> / {{ totalChapters }} 章</span>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-for="t in tracks" :id="'track-' + t.id" :key="t.id" :class="['track', 'glass', { open: open === t.id, empty: !t.total }]">
      <button class="t-head" @click="open = open === t.id ? null : t.id">
        <span class="t-no">{{ t.no }}</span>
        <span class="t-main">
          <span class="t-name">{{ t.name }}</span>
          <span class="t-desc">{{ t.desc }}</span>
        </span>
        <span v-if="t.total" class="t-progress">
          <span :class="['bar', { zero: !percent(t) }]"><i :style="{ width: percent(t) + '%' }"></i></span>
          <span class="num">{{ done(t) }} / {{ t.total }}</span>
        </span>
        <span v-else class="soon">内容建设中</span>
        <span class="arrow">{{ open === t.id ? '－' : '＋' }}</span>
      </button>

      <div v-if="open === t.id" class="t-body">
        <p v-if="!t.total" class="soon-tip">这条路线的教材正在编写，每一章都会对照官方文档核实，并在真实的链上验证后上线。</p>
        <div v-for="g in t.groups" :key="g.name" class="group">
          <div v-if="t.groups.length > 1" class="g-name">{{ g.name }}</div>
          <button v-for="c in g.chapters" :key="c.id" :class="['chapter', { done: isDone(c.id) }]" @click="read(t, c)">
            <span class="c-no">{{ c.no }}</span>
            <span class="c-title">{{ c.title }}</span>
            <span class="kps"><span v-for="k in c.kps" :key="k" class="kp">{{ k }}</span></span>
            <span class="c-state">{{ isDone(c.id) ? '✓ 已掌握' : '开始学习 →' }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.learn { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 6px; }
.head h2 { margin: 4px 0 6px; font-family: var(--font-cyber); font-size: 40px; font-weight: 400; letter-spacing: 8px; color: #fff; text-shadow: 0 0 8px rgba(0, 240, 255, 0.6), 0 0 22px rgba(255, 43, 214, 0.35); }
.eyebrow { font-family: "Orbitron", var(--font-code); }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.overall { flex-shrink: 0; font-family: var(--font-code); color: var(--text-dim); }
.overall b { font-size: 34px; font-weight: 400; color: var(--gold); text-shadow: 0 0 12px rgba(252, 238, 10, 0.4); }
.error { color: var(--danger); }

.track { border: 1px solid var(--line); background: var(--glass-strong); transition: border-color 0.3s; }
.track.open, .track:hover { border-color: var(--line-strong); }
.t-head {
  width: 100%; display: flex; align-items: center; gap: 18px; padding: 18px 22px;
  cursor: pointer; text-align: left; color: var(--text); background: none; border: none; font-family: var(--font);
}
.t-no { font-family: "Orbitron", var(--font-code); font-size: 30px; font-weight: 700; color: var(--accent); text-shadow: 0 0 10px rgba(0, 240, 255, 0.5); }
.track.empty .t-no { color: var(--text-faint); text-shadow: none; }
.t-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.t-name { font-family: var(--font-cyber); font-size: 24px; letter-spacing: 3px; color: #fff; text-shadow: 0 0 10px rgba(0, 240, 255, 0.45); }
.track.open .t-name, .t-head:hover .t-name { color: var(--accent); text-shadow: 0 0 6px var(--accent), 0 0 18px rgba(255, 43, 214, 0.5); }
.t-desc { font-size: 13px; color: var(--text-dim); }
.t-progress { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
.bar { position: relative; width: 140px; height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255, 255, 255, 0.08); }
/* 彩色进度条：品红 → 紫 → 青 → 黄的渐变一直向右流动，上面再扫过一道高光 */
.bar i {
  position: relative; display: block; height: 100%; min-width: 0; border-radius: 3px;
  background: linear-gradient(90deg, #ff2bd6, #8a5cff, #00f0ff, #fcee0a, #ff2bd6);
  background-size: 300% 100%;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
  animation: flow 4s linear infinite;
  transition: width 0.8s ease-out;
  overflow: hidden;
}
.bar i::after {
  content: ''; position: absolute; top: 0; bottom: 0; width: 40px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
  animation: shine 2.2s ease-in-out infinite;
}
@keyframes flow { to { background-position: 300% 0; } }
@keyframes shine { from { left: -40px; } to { left: 100%; } }
/* 0 进度时也露出一小截暗色轨道里的流光，提示「这里会被点亮」 */
.bar.zero::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.25), transparent);
  background-size: 50% 100%; background-repeat: no-repeat;
  animation: idle 3s ease-in-out infinite;
}
@keyframes idle { from { background-position: -100% 0; } to { background-position: 200% 0; } }
.num { width: 64px; font-family: var(--font-code); font-size: 13px; color: var(--text-dim); }
.soon { flex-shrink: 0; padding: 2px 10px; font-size: 12px; color: var(--gold); border: 1px solid rgba(252, 238, 10, 0.4); }
.arrow { flex-shrink: 0; width: 18px; color: var(--text-faint); }

.t-body { padding: 0 22px 18px 66px; }
.soon-tip { margin: 0; font-size: 13px; color: var(--text-dim); }
.group + .group { margin-top: 14px; }
.g-name { margin-bottom: 6px; font-size: 12px; letter-spacing: 2px; color: var(--text-faint); }
.chapter {
  width: 100%; display: flex; align-items: center; gap: 14px; padding: 9px 12px;
  cursor: pointer; text-align: left; color: var(--text); background: none;
  border: none; border-bottom: 1px solid rgba(0, 240, 255, 0.08); font-family: var(--font); transition: background 0.2s;
}
.chapter:hover { background: rgba(0, 240, 255, 0.06); }
.c-no { width: 38px; flex-shrink: 0; font-family: "Orbitron", var(--font-code); font-size: 13px; color: var(--text-faint); }
.c-title { flex: 1; min-width: 0; font-family: "CyberZH", var(--font); font-size: 16px; letter-spacing: 1px; }
.chapter:hover .c-title { color: var(--accent); text-shadow: 0 0 8px rgba(0, 240, 255, 0.5); }
.kps { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.kp { padding: 1px 8px; font-size: 12px; color: var(--accent); background: rgba(0, 240, 255, 0.08); border-radius: 999px; white-space: nowrap; }
.c-state { width: 84px; flex-shrink: 0; text-align: right; font-size: 13px; color: var(--text-faint); }
.chapter.done .c-state { color: var(--ok); }
.chapter:hover .c-state { color: var(--accent); }

/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .head { flex-direction: column; align-items: flex-start; }
  .t-head { flex-wrap: wrap; gap: 10px 14px; padding: 14px; }
  .t-progress { order: 3; width: 100%; padding-left: 46px; }
  .t-body { padding: 0 14px 14px; }
  .kps { display: none; }
  /* 手机：标题和说明可以换行，不要撑出框 */
  .t-head, .chapter { white-space: normal; }
  .t-main, .c-title { min-width: 0; overflow-wrap: anywhere; }
  .t-name { font-size: 20px; letter-spacing: 1px; }
  .t-no { font-size: 24px; }
  .arrow { position: absolute; right: 14px; top: 16px; }
  .track { position: relative; }
  .t-body { padding: 0 10px 12px; }
  .chapter { gap: 10px; padding: 10px 6px; }
  .c-no { width: 32px; }
  .c-title { font-size: 15px; line-height: 1.5; }
  .c-state { width: auto; font-size: 12px; }
  .chapter:not(.done) .c-state { display: none; } /* 手机上「开始学习 →」省掉，整行都可以点 */
  .head h2 { font-size: 32px; }
}
</style>
