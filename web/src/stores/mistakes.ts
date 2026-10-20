// stores/mistakes.ts —— 错题本的「公告板」
// 数据存在后端数据库里（mistakes 表）
// 每道错题：{ id, question, answer, status: 'todo'(待温习) | 'mastered'(已掌握), source }
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import type { Mistake, MistakeStatus } from '../types'

export const useMistakesStore = defineStore('mistakes', {
  state: () => ({
    list: [] as Mistake[],
  }),
  getters: {
    // 还没掌握、需要温习的题（getters 就像公告板上的「计算结果」，数据变了它自动重算）
    todo: (state) => state.list.filter((m) => m.status === 'todo'),
  },
  actions: {
    async load() {
      this.list = await useUserStore().api('/api/mistakes')
    },
    // source：'manual' 自己加的 / 'game' 漏洞猎人答错自动加的
    async add(question: string, answer: string, source = 'manual') {
      const m = await useUserStore().api<Mistake>('/api/mistakes', { question, answer, source })
      // 同一道题又错了：后端返回的是原来那条（错的次数 +1），把旧的换掉、挪到最上面，不要重复显示
      this.list = [m, ...this.list.filter((x) => x.id !== m.id)]
    },
    async setStatus(id: number, status: MistakeStatus) {
      const m = this.list.find((x) => x.id === id)
      if (m) m.status = status // 页面先变
      await useUserStore().api(`/api/mistakes/${id}`, { status }, 'PUT')
    },
    async remove(id: number) {
      await useUserStore().api(`/api/mistakes/${id}`, null, 'DELETE')
      this.list = this.list.filter((m) => m.id !== id)
    },
  },
})
