// stores/game.js —— 漏洞猎人的进度「公告板」：通过了哪些关
// 数据存在后端数据库里（game_progress 表）
import { defineStore } from 'pinia'
import { useUserStore } from './user.js'

export const useGameStore = defineStore('game', {
  state: () => ({
    // 已通关的关卡：{ 关卡id: 星数 }，星数 3/2/1 = 第几次就找对了
    cleared: {},
  }),
  actions: {
    async load() {
      this.cleared = await useUserStore().api('/api/progress')
    },
    async clear(levelId, stars) {
      // 页面上只保留最好成绩；数据库那边也会自动取最大值
      this.cleared[levelId] = Math.max(this.cleared[levelId] || 0, stars)
      await useUserStore().api('/api/progress', { levelId, star: stars })
    },
  },
})
