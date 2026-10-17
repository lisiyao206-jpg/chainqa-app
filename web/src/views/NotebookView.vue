<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNotesStore } from '../stores/notes.js'
import { useMistakesStore } from '../stores/mistakes.js'
import MistakesModal from '../components/MistakesModal.vue'

const notes = useNotesStore()

// 错题本弹窗
const mistakes = useMistakesStore()
const showMistakes = ref(false)

// 当前正在编辑的笔记 id
const currentId = ref(null)
const current = computed(() => notes.list.find((n) => n.id === currentId.value))

// 打开页面时，从数据库读取我的笔记和错题
onMounted(async () => {
  await Promise.all([notes.load(), mistakes.load()])
  currentId.value = notes.list[0]?.id ?? null
})

async function newNote() {
  currentId.value = await notes.create()
}

async function removeNote() {
  if (!confirm(`确定删除「${current.value.title || '无标题笔记'}」吗？`)) return
  await notes.remove(currentId.value)
  currentId.value = notes.list[0]?.id ?? null
}

// 把时间戳显示成「10月14日 21:30」
function formatTime(t) {
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="archive">
    <!-- 左侧：笔记列表 -->
    <aside class="list">
      <button class="mistakes-btn" @click="showMistakes = true">
        🎯 错题本
        <span v-if="mistakes.todo.length" class="badge">{{ mistakes.todo.length }} 题待温习</span>
      </button>
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
            @input="notes.update(current.id, { title: $event.target.value })"
          />
          <button class="del-btn" @click="removeNote">🗑 删除</button>
        </div>
        <textarea
          class="content-input"
          :value="current.content"
          placeholder="在这里记下你的理解、疑问、代码片段……"
          @input="notes.update(current.id, { content: $event.target.value })"
        ></textarea>
        <div class="saved">✓ 已自动保存 · {{ formatTime(current.updatedAt) }}</div>
      </template>
    </section>

    <!-- 错题本弹窗 -->
    <MistakesModal v-if="showMistakes" @close="showMistakes = false" />
  </div>
</template>

<style scoped>
.archive { display: flex; gap: 20px; height: 100%; }
.list {
  width: 240px; flex-shrink: 0; overflow-y: auto;
  border-right: 1px solid #e5e7eb; padding-right: 12px;
}
.mistakes-btn {
  width: 100%; padding: 10px; margin-bottom: 8px;
  display: flex; justify-content: space-between; align-items: center;
  border: none; border-radius: 8px; background: #1f2329; color: #fff;
  cursor: pointer; font-size: 14px;
}
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f59e0b; color: #fff; }
.new-btn {
  width: 100%; padding: 10px; margin-bottom: 10px;
  border: 1px dashed #9ca3af; border-radius: 8px;
  background: none; cursor: pointer; font-size: 14px;
}
.new-btn:hover { border-color: #2556b6; color: #2556b6; }
.item { padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.item:hover { background: #f3f4f6; }
.item.active { background: #e8eefb; }
.item-title { font-size: 14px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-time { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.editor { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.editor-head { display: flex; gap: 10px; }
.title-input {
  flex: 1; font-size: 20px; font-weight: bold;
  border: none; border-bottom: 1px solid #e5e7eb; padding: 6px 0; outline: none;
}
.title-input:focus { border-bottom-color: #2556b6; }
.del-btn { border: none; background: none; color: #9ca3af; cursor: pointer; }
.del-btn:hover { color: #b91c1c; }
.content-input {
  flex: 1; resize: none; padding: 12px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font: inherit; font-size: 15px; line-height: 1.8; outline: none;
}
.content-input:focus { border-color: #2556b6; }
.saved { font-size: 12px; color: #9ca3af; }
.hint { color: #9ca3af; font-size: 14px; }
.center { margin: auto; }
</style>
