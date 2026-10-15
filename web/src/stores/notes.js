// stores/notes.js —— 笔记的「公告板」
// 数据存在后端数据库里（notes 表），这里只是前端的一份「副本」，方便页面显示
import { defineStore } from 'pinia'
import { useUserStore } from './user.js'

// 打字时不必每个字都发请求：停下 0.6 秒后再一次性保存
const timers = {}

export const useNotesStore = defineStore('notes', {
  state: () => ({
    list: [],       // 每条笔记：{ id, chapterId, title, content, updatedAt }
    loaded: false,
  }),
  actions: {
    // 从数据库读取我的全部笔记
    async load() {
      this.list = await useUserStore().api('/api/notes')
      this.loaded = true
    },
    // 新建一条空笔记，返回它的 id
    async create(fields = {}) {
      const note = await useUserStore().api('/api/notes', fields)
      this.list.unshift(note)
      return note.id
    },
    // 修改标题或内容：页面上立刻变，数据库稍后保存
    update(id, changes) {
      const note = this.list.find((n) => n.id === id)
      if (!note) return
      Object.assign(note, changes, { updatedAt: new Date().toISOString() })
      clearTimeout(timers[id])
      timers[id] = setTimeout(() => {
        useUserStore().api(`/api/notes/${id}`, { title: note.title, content: note.content }, 'PUT')
      }, 600)
    },
    // 从教材里摘录一段话：同一章的摘录都放进同一条笔记，没有就新建一条
    async clip(chapter, text) {
      if (!this.loaded) await this.load()
      let note = this.list.find((n) => n.chapterId === chapter.id)
      if (!note) {
        await this.create({ chapterId: chapter.id, title: `第 ${chapter.no} 讲 · ${chapter.title} 摘录` })
        note = this.list[0]
      }
      this.update(note.id, { content: (note.content ? note.content + '\n\n' : '') + '> ' + text })
      return note
    },
    async remove(id) {
      await useUserStore().api(`/api/notes/${id}`, null, 'DELETE')
      this.list = this.list.filter((n) => n.id !== id)
    },
  },
})
