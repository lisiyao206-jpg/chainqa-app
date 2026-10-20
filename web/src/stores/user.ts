// stores/user.ts —— 「当前登录的是谁」的公告板
// token 存在浏览器里，刷新页面后还能保持登录；每次请求后端都带上它
import { defineStore } from 'pinia'
import type { User, LoginResult } from '../types'

const KEY = 'chainqa-token'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(KEY) || '',
    user: null as User | null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    // 发请求的小工具：自动带上 token，出错时把后端的提示抛出来
    // method 不写时：有 body 就是 POST，没有就是 GET
    async api<T = any>(url: string, body?: unknown, method?: string): Promise<T> {
      const res = await fetch(url, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: body ? JSON.stringify(body) : undefined,
      })
      // 后端返回的不是 JSON（常见于：后端还是旧代码、没有这个接口，于是回了一个网页）
      // 这时给一句看得懂的提示，而不是「Unexpected token '<'」
      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error('后端没有这个接口：请确认后端文件已经更新，并且重启了后端（node server.mjs）')
      }
      if (!res.ok) throw new Error(data.error || '请求失败')
      return data
    },
    // 登录 / 注册成功后，记下 token 和用户信息
    saveLogin({ token, user }: LoginResult) {
      this.token = token
      this.user = user
      localStorage.setItem(KEY, token)
    },
    async login(account: string, pwd: string) {
      this.saveLogin(await this.api<LoginResult>('/api/login', { account, pwd }))
    },
    // 注册只填密码和昵称，账号由系统分配（6 位数字）；返回分配到的账号，页面上大字显示给用户记下
    async register(pwd: string, nickname: string) {
      const r = await this.api<LoginResult>('/api/register', { pwd, nickname })
      this.saveLogin(r)
      return r.user.account
    },
    // 打开网页时调用：用存着的 token 问后端「我是谁」
    async fetchMe() {
      if (!this.token) return
      try {
        this.user = (await this.api<{ user: User }>('/api/me')).user
      } catch {
        this.clear() // token 过期或无效，就当没登录
      }
    },
    // 手机号 + 验证码登录
    async loginBySms(phone: string, code: string) {
      this.saveLogin(await this.api<LoginResult>('/api/login/sms', { phone, code }))
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
