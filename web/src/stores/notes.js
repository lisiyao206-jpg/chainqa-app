// stores/notes.js —— 笔记的「公告板」
// 笔记先存在浏览器的 localStorage 里；以后做了登录，再换成存到数据库
import { defineStore } from 'pinia'

const KEY = 'chainqa-notes'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    // 每条笔记：{ id, title, content, updatedAt }
    // 打开网页时，先从浏览器里把上次的笔记读出来
    list: JSON.parse(localStorage.getItem(KEY) || '[]'),
  }),
  actions: {
    // 把当前所有笔记存回浏览器
    save() {
      localStorage.setItem(KEY, JSON.stringify(this.list))
    },
    // 新建一条空笔记，返回它的 id
    create() {
      const note = { id: Date.now(), title: '', content: '', updatedAt: Date.now() }
      this.list.unshift(note) // 放在最前面
      this.save()
      return note.id
    },
    // 修改某条笔记的标题或内容
    update(id, changes) {
      const note = this.list.find((n) => n.id === id)
      if (!note) return
      Object.assign(note, changes, { updatedAt: Date.now() })
      this.save()
    },
    remove(id) {
      this.list = this.list.filter((n) => n.id !== id)
      this.save()
    },
  },
})
