// stores/mistakes.js —— 错题本的「公告板」
// 每道错题：{ id, question, answer, status: 'todo'(待温习) | 'mastered'(已掌握), createdAt }
// 以后漏洞猎人答错的题，也会通过 add() 自动放进来
import { defineStore } from 'pinia'

const KEY = 'chainqa-mistakes'

export const useMistakesStore = defineStore('mistakes', {
  state: () => ({
    list: JSON.parse(localStorage.getItem(KEY) || '[]'),
  }),
  getters: {
    // 还没掌握、需要温习的题（getters 就像公告板上的「计算结果」，数据变了它自动重算）
    todo: (state) => state.list.filter((m) => m.status === 'todo'),
  },
  actions: {
    save() {
      localStorage.setItem(KEY, JSON.stringify(this.list))
    },
    add(question, answer) {
      this.list.unshift({ id: Date.now(), question, answer, status: 'todo', createdAt: Date.now() })
      this.save()
    },
    setStatus(id, status) {
      const m = this.list.find((x) => x.id === id)
      if (m) m.status = status
      this.save()
    },
    remove(id) {
      this.list = this.list.filter((m) => m.id !== id)
      this.save()
    },
  },
})
