// stores/game.js —— 漏洞猎人的进度「公告板」：通过了哪些关
import { defineStore } from 'pinia'

const KEY = 'chainqa-game'

export const useGameStore = defineStore('game', {
  state: () => ({
    // 已通关的关卡：{ 关卡id: 星数 }，星数 3/2/1 = 第几次就找对了
    cleared: JSON.parse(localStorage.getItem(KEY) || '{}'),
  }),
  actions: {
    clear(levelId, stars) {
      // 只保留最好成绩
      this.cleared[levelId] = Math.max(this.cleared[levelId] || 0, stars)
      localStorage.setItem(KEY, JSON.stringify(this.cleared))
    },
  },
})
