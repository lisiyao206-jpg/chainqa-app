<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useNotesStore } from '../stores/notes'
import { useMistakesStore } from '../stores/mistakes'
import MistakesModal from '../components/MistakesModal.vue'
import { useUserStore } from '../stores/user'

const notes = useNotesStore()

// 错题本：页面右半边一直显示
const mistakes = useMistakesStore()
const route = useRoute()
// 网址带 ?open=mistakes（顶栏下拉菜单「错题本」）时，让右半边的错题本闪一下，提示在这里；手机上滚动到错题本
const flash = ref(false)
const mistakesEl = ref<HTMLElement | null>(null)
function focusMistakes() {
  flash.value = true
  mistakesEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  setTimeout(() => (flash.value = false), 1200)
}
watch(() => route.query.open, (v) => v === 'mistakes' && focusMistakes())

// 当前正在编辑的笔记 id
const currentId = ref<number | null>(null)
const current = computed(() => notes.list.find((n) => n.id === currentId.value))

// 打开页面时，从数据库读取我的笔记和错题
onMounted(async () => {
  await Promise.all([notes.load(), mistakes.load()])
  currentId.value = notes.list[0]?.id ?? null
  if (route.query.open === 'mistakes') focusMistakes()
})

async function newNote() {
  currentId.value = await notes.create()
}

async function removeNote() {
  if (!confirm(`确定删除「${current.value!.title || '无标题笔记'}」吗？`)) return
  await notes.remove(currentId.value!)
  currentId.value = notes.list[0]?.id ?? null
}

// ===== 发布讨论：把这条笔记发到情报站的广场，和大家一起讨论 =====
const userStore = useUserStore()
const target = 'public' // 发到广场（所有人都能看到）
const publishing = ref(false)
const published = ref<{ ok: boolean; text: string } | null>(null)  // 发布结果提示：{ ok, text }

async function publishNote() {
  const n = current.value!
  if (!n.content.trim()) return (published.value = { ok: false, text: '笔记还是空的，写点内容再发布吧' })
  if (!confirm(`把「${n.title || '无标题笔记'}」发布到广场？所有人都能看到`)) return
  publishing.value = true
  published.value = null
  try {
    await userStore.api('/api/social/posts', {
      title: n.title.trim() || '我的学习笔记',
      text: n.content,
      visibility: target,
    })
    published.value = { ok: true, text: '已发布！' }
  } catch (err) {
    published.value = { ok: false, text: (err as Error).message }
  } finally {
    publishing.value = false
  }
}

// 把时间戳显示成「10月14日 21:30」
function formatTime(t: string) {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="archive">
    <!-- 左半边：我的笔记（笔记列表 + 编辑区） -->
    <div class="half">
    <div class="half-head">
      <h3 class="glitch" data-text="我的笔记">我的笔记</h3>
      <span class="sub">{{ notes.list.length }} 条 · 自动保存</span>
    </div>
    <div class="notes">
    <aside class="list">
      <button class="new-btn" @click="newNote">＋ 新建笔记</button>
      <div v-if="notes.list.length === 0" class="hint">还没有笔记，点上面新建一条吧</div>
      <div
        v-for="n in notes.list"
        :key="n.id"
        :class="['item', { active: n.id === currentId }]"
        @click="currentId = n.id"
      >
        <div class="item-title">{{ n.title || '无标题笔记' }}</div>
        <div class="item-time">{{ formatTime(n.updatedAt) }}</div>
      </div>
    </aside>

    <!-- 右侧：编辑区（每输入一个字就自动保存） -->
    <section class="editor">
      <div v-if="!current" class="hint center">📝 选一条笔记，或者新建一条</div>
      <template v-else>
        <div class="editor-head">
          <input
            class="title-input"
            :value="current.title"
            placeholder="笔记标题"
            @input="notes.update(current.id, { title: ($event.target as HTMLInputElement).value })"
          />
          <button class="del-btn" @click="removeNote">🗑 删除</button>
        </div>
        <textarea
          class="content-input"
          :value="current.content"
          placeholder="在这里记下你的理解、疑问、代码片段……"
          @input="notes.update(current.id, { content: ($event.target as HTMLTextAreaElement).value })"
        ></textarea>
        <!-- 笔记下方：左边是自动保存提示，右边是「发布讨论」 -->
        <div class="foot">
          <div class="saved">✓ 已自动保存 · {{ formatTime(current.updatedAt) }}</div>
          <span v-if="published" :class="published.ok ? 'ok' : 'error'">
            {{ published.text }}
            <RouterLink v-if="published.ok" to="/social">去情报站看看 →</RouterLink>
          </span>
          <div class="publish">
            <button class="btn primary" :disabled="publishing" @click="publishNote">
              {{ publishing ? '发布中…' : '📤 发布到广场' }}
            </button>
          </div>
        </div>
      </template>
    </section>
    </div>
    </div>

    <!-- 右半边：错题本 -->
    <div ref="mistakesEl" :class="['half', { flash }]">
      <div class="half-head">
        <h3 class="glitch" data-text="错题本">错题本</h3>
        <span v-if="mistakes.todo.length" class="badge">{{ mistakes.todo.length }} 题待温习</span>
      </div>
      <div class="mistakes"><MistakesModal inline /></div>
    </div>
  </div>
</template>

<style scoped>
/* 赛博朋克深色版：颜色都用 style.css 里的全站变量 */
.archive { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 100%; color: var(--text); }
/* 左右各占一半：上面是标题，下面是内容 */
.half { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; transition: filter 0.3s; }
.half.flash { filter: drop-shadow(0 0 14px rgba(0, 240, 255, 0.8)); }
.half-head { display: flex; align-items: baseline; gap: 12px; }
.half-head h3 { margin: 0; font-family: var(--font-cyber); font-size: 26px; font-weight: 400; letter-spacing: 4px; color: #fff; text-shadow: 0 0 8px rgba(0, 240, 255, 0.55), 0 0 20px rgba(255, 43, 214, 0.3); }
.sub { font-size: 12px; color: var(--text-faint); }
.notes { flex: 1; min-height: 0; display: flex; gap: 12px; }
.mistakes { flex: 1; min-height: 0; }
.list {
  width: 180px; flex-shrink: 0; overflow-y: auto; padding: 12px;
  background: var(--glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; color: var(--gold); border: 1px solid rgba(252, 238, 10, 0.4); }
.new-btn {
  width: 100%; padding: 10px; margin-bottom: 10px; color: var(--text-dim);
  border: 1px dashed var(--line-strong); border-radius: 4px;
  background: none; cursor: pointer; font-size: 14px;
}
.new-btn:hover { border-color: var(--accent); color: var(--accent); }
.item { padding: 10px 12px; border-radius: 4px; cursor: pointer; border-left: 2px solid transparent; }
.item:hover { background: rgba(0, 240, 255, 0.06); }
.item.active { background: rgba(0, 240, 255, 0.12); border-left-color: var(--accent); }
.item-title { font-size: 14px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; }
.item-time { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.editor {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px 20px;
  background: var(--glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.editor-head { display: flex; gap: 10px; }
.title-input {
  flex: 1; font-size: 20px; font-weight: bold; color: #fff; background: transparent; font-family: var(--font);
  border: none; border-bottom: 1px solid var(--line-strong); padding: 6px 0; outline: none;
}
.title-input:focus { border-bottom-color: var(--accent); }
.del-btn { border: none; background: none; color: var(--text-faint); cursor: pointer; }
.del-btn:hover { color: var(--danger); }
.content-input {
  flex: 1; resize: none; padding: 12px; color: var(--text);
  background: rgba(0, 0, 0, 0.35); border: 1px solid var(--line); border-radius: 4px;
  font: inherit; font-size: 15px; line-height: 1.8; outline: none;
}
.content-input:focus { border-color: var(--accent); }
.foot { display: flex; align-items: center; gap: 14px; }
.saved { font-size: 12px; color: var(--text-faint); }
.ok { font-size: 13px; color: var(--ok); }
.error { font-size: 13px; color: var(--danger); }
.publish { margin-left: auto; margin-right: 64px; display: flex; gap: 10px; align-items: center; } /* 右边让出位置给 AI 悬浮按钮 */
.target {
  padding: 8px 10px; font-size: 13px; font-family: var(--font); cursor: pointer; outline: none;
  color: var(--text); background: rgba(6, 4, 20, 0.85); border: 1px solid var(--line-strong);
}
.target:focus { border-color: var(--accent); }
.hint { color: var(--text-faint); font-size: 14px; }
.center { margin: auto; }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  /* 笔记列表放上面，编辑区在下面 */
  .archive { grid-template-columns: 1fr; height: auto; gap: 24px; }
  .notes { flex-direction: column; min-height: 70vh; }
  .mistakes { height: 70vh; flex: none; }
  .list { width: auto; max-height: 30vh; }
  .publish { margin-right: 56px; }
  .foot { flex-wrap: wrap; }
}
</style>
