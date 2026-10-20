// stores/ai.ts —— AI 小助手的「公告板」（Pinia 状态管理）
// 任何页面都能用它：打开/关闭 AI 面板、把一个问题交给 AI
import { defineStore } from 'pinia'

export const useAiStore = defineStore('ai', {
  state: () => ({
    open: false,      // AI 面板是否展开
    pending: '',      // 等待发送的问题（别的页面塞进来，ChatPanel 负责发出去）
  }),
  actions: {
    toggle() {
      this.open = !this.open
    },
    // 从任何页面向 AI 提问：打开面板，并把问题交给 ChatPanel
    ask(question: string) {
      this.open = true
      this.pending = question
    },
  },
})
