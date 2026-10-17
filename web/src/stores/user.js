// stores/user.js —— 「当前登录的是谁」的公告板
// token 存在浏览器里，刷新页面后还能保持登录；每次请求后端都带上它
import { defineStore } from 'pinia'

const KEY = 'chainqa-token'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(KEY) || '',
    user: null, // { userId, account, nickname, role }
  }),
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    // 发请求的小工具：自动带上 token，出错时把后端的提示抛出来
    // method 不写时：有 body 就是 POST，没有就是 GET
    async api(url, body, method) {
      const res = await fetch(url, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '请求失败')
      return data
    },
    // 登录 / 注册成功后，记下 token 和用户信息
    saveLogin({ token, user }) {
      this.token = token
      this.user = user
      localStorage.setItem(KEY, token)
    },
    async login(account, pwd) {
      this.saveLogin(await this.api('/api/login', { account, pwd }))
    },
    async register(account, pwd, nickname) {
      this.saveLogin(await this.api('/api/register', { account, pwd, nickname }))
    },
    // 打开网页时调用：用存着的 token 问后端「我是谁」
    async fetchMe() {
      if (!this.token) return
      try {
        this.user = (await this.api('/api/me')).user
      } catch {
        this.clear() // token 过期或无效，就当没登录
      }
    },
    async logout() {
      try { await this.api('/api/logout', {}) } catch {}
      this.clear()
    },
    clear() {
      this.token = ''
      this.user = null
      localStorage.removeItem(KEY)
    },
  },
})
