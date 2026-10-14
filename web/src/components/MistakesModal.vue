<script setup>
import { ref, computed } from 'vue'
import { useMistakesStore } from '../stores/mistakes.js'

const emit = defineEmits(['close'])
const mistakes = useMistakesStore()

// 当前标签页：'redo'（重做模式）或 'book'（我的错题集）
const tab = ref('redo')

// ===== 重做模式 =====
// 进入重做时，把待温习的题「拍个快照」，做的过程中列表不会跳来跳去
const queue = ref(mistakes.todo.map((m) => m.id))
const index = ref(0)          // 现在做到第几题
const myAnswer = ref('')      // 我写的答案
const revealed = ref(false)   // 是否已经揭晓答案
const currentQ = computed(() => mistakes.list.find((m) => m.id === queue.value[index.value]))

// 标记这道题，然后进入下一题
function mark(status) {
  mistakes.setStatus(currentQ.value.id, status)
  index.value++
  myAnswer.value = ''
  revealed.value = false
}

// 重新开始一轮
function restart() {
  queue.value = mistakes.todo.map((m) => m.id)
  index.value = 0
  myAnswer.value = ''
  revealed.value = false
}

// ===== 我的错题集 =====
const newQ = ref('')
const newA = ref('')
function addMistake() {
  if (!newQ.value.trim() || !newA.value.trim()) return
  mistakes.add(newQ.value.trim(), newA.value.trim())
  newQ.value = ''
  newA.value = ''
}
function removeMistake(m) {
  if (confirm('确定删除这道错题吗？')) mistakes.remove(m.id)
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="card">
      <header>
        <div class="tabs">
          <button :class="{ on: tab === 'redo' }" @click="tab = 'redo'; restart()">🔄 重做模式</button>
          <button :class="{ on: tab === 'book' }" @click="tab = 'book'">📒 我的错题集（{{ mistakes.list.length }}）</button>
        </div>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <!-- ===== 重做模式：先作答，再揭晓 ===== -->
      <section v-if="tab === 'redo'" class="body">
        <div v-if="queue.length === 0" class="empty">
          🎉 没有待温习的题！<br />去「我的错题集」添加几道吧
        </div>
        <div v-else-if="!currentQ" class="empty">
          ✅ 这一轮做完了！<br />
          <button class="primary" @click="restart">再来一轮</button>
        </div>
        <template v-else>
          <div class="progress">第 {{ index + 1 }} / {{ queue.length }} 题</div>
          <div class="question">{{ currentQ.question }}</div>
          <textarea v-model="myAnswer" placeholder="先自己写下答案，再点「揭晓答案」……"></textarea>

          <button v-if="!revealed" class="primary" @click="revealed = true">👀 揭晓答案</button>
          <template v-else>
            <div class="answer"><b>正确答案：</b>{{ currentQ.answer }}</div>
            <div class="judge">
              <button class="again" @click="mark('todo')">🔁 还要温习</button>
              <button class="ok" @click="mark('mastered')">✅ 已掌握</button>
            </div>
          </template>
        </template>
      </section>

      <!-- ===== 我的错题集：题和答案都显示 ===== -->
      <section v-else class="body">
        <div class="add-form">
          <textarea v-model="newQ" placeholder="题目，例如：delegatecall 和 call 有什么区别？" rows="2"></textarea>
          <textarea v-model="newA" placeholder="答案 / 解析" rows="2"></textarea>
          <button class="primary" @click="addMistake">＋ 添加错题</button>
        </div>

        <div v-if="mistakes.list.length === 0" class="empty">还没有错题</div>
        <div v-for="m in mistakes.list" :key="m.id" class="item">
          <div class="item-head">
            <span :class="['tag', m.status]">{{ m.status === 'todo' ? '🔁 待温习' : '✅ 已掌握' }}</span>
            <span class="actions">
              <button @click="mistakes.setStatus(m.id, m.status === 'todo' ? 'mastered' : 'todo')">切换状态</button>
              <button @click="removeMistake(m)">删除</button>
            </span>
          </div>
          <div class="q">Q：{{ m.question }}</div>
          <div class="a">A：{{ m.answer }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
.card {
  width: min(720px, 92vw); height: min(640px, 86vh);
  display: flex; flex-direction: column;
  background: #fff; border-radius: 14px; padding: 16px 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tabs { display: flex; gap: 6px; }
.tabs button {
  padding: 8px 14px; border: none; border-radius: 8px;
  background: #f3f4f6; cursor: pointer; font-size: 14px;
}
.tabs button.on { background: #1f2329; color: #fff; }
.close { border: none; background: none; font-size: 18px; cursor: pointer; color: #6b7280; }
.body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.empty { margin: auto; text-align: center; color: #9ca3af; line-height: 2; }
.progress { font-size: 13px; color: #9ca3af; }
.question { font-size: 17px; font-weight: bold; line-height: 1.6; white-space: pre-wrap; }
textarea {
  width: 100%; padding: 10px 12px; resize: vertical;
  border: 1px solid #e5e7eb; border-radius: 8px; font: inherit; font-size: 14px; outline: none;
}
textarea:focus { border-color: #2556b6; }
.body > textarea { min-height: 100px; }
.primary {
  align-self: flex-start; padding: 8px 18px; border: none; border-radius: 8px;
  background: #1f2329; color: #fff; cursor: pointer; font-size: 14px;
}
.answer { padding: 12px; border-radius: 8px; background: #f0fdf4; line-height: 1.6; white-space: pre-wrap; }
.judge { display: flex; gap: 10px; }
.judge button { flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
.again { background: #fef3c7; }
.ok { background: #dcfce7; }
.add-form { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
.item { padding: 12px; border-radius: 8px; background: #f9fafb; }
.item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tag { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.tag.todo { background: #fef3c7; }
.tag.mastered { background: #dcfce7; }
.actions button { border: none; background: none; color: #6b7280; cursor: pointer; font-size: 12px; }
.actions button:hover { color: #2556b6; }
.q { font-weight: bold; white-space: pre-wrap; }
.a { color: #4b5563; margin-top: 4px; white-space: pre-wrap; }
</style>
