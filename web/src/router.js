import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from './views/LobbyView.vue'
import TextbookView from './views/TextbookView.vue'
import MentorView from './views/MentorView.vue'
import NotebookView from './views/NotebookView.vue'
import GameView from './views/GameView.vue'
import LoginView from './views/LoginView.vue'
import AdminView from './views/AdminView.vue'
import SocialView from './views/SocialView.vue'
import StudyView from './views/StudyView.vue'
import AuditView from './views/AuditView.vue'
import { useUserStore } from './stores/user.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // title 是页面名字，顶栏会显示它
    { path: '/login', component: LoginView, meta: { title: '登录', public: true } },
    { path: '/', component: LobbyView, meta: { title: '大厅' } },
    { path: '/camp', component: TextbookView, meta: { title: '训练营' } },
    { path: '/mentor', component: MentorView, meta: { title: '白帽导师' } },
    { path: '/archive', component: NotebookView, meta: { title: '案件档案' } },
    { path: '/mission', component: GameView, meta: { title: '实战任务' } },
    { path: '/social', component: SocialView, meta: { title: '情报站' } },
    { path: '/study', component: StudyView, meta: { title: '学习站' } },
    { path: '/audit', component: AuditView, meta: { title: 'AI 审计' } },
    // admin: true 表示只有管理员能进
    { path: '/admin', component: AdminView, meta: { title: '管理后台', admin: true } },
  ],
})

// 路由守卫：每次换页面之前检查一下——没登录就送去登录页
let checked = false
router.beforeEach(async (to) => {
  const userStore = useUserStore()
  // 刷新页面后，第一次跳转时用存着的 token 问一下后端「我是谁」
  if (!checked) {
    await userStore.fetchMe()
    checked = true
  }
  if (!to.meta.public && !userStore.isLoggedIn) return '/login'
  if (to.path === '/login' && userStore.isLoggedIn) return '/'
  // 不是管理员却想进管理后台：送回大厅
  if (to.meta.admin && !userStore.isAdmin) return '/'
})

export default router
