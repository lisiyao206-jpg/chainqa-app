import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from './views/LobbyView.vue'
import LoginView from './views/LoginView.vue'
import { useUserStore } from './stores/user'

// 性能优化：路由懒加载。登录页和大厅一打开就要用，直接打包进首页；
// 其他页面写成 () => import(...)，等用户真的点进去才下载，首页加载快很多
// （比如实战任务里的 three.js 3D 引擎很大，不进实战就不用下载它）
const TextbookView = () => import('./views/TextbookView.vue')
const MentorView = () => import('./views/MentorView.vue')
const NotebookView = () => import('./views/NotebookView.vue')
const GameView = () => import('./views/GameView.vue')
const AdminView = () => import('./views/AdminView.vue')
const SocialView = () => import('./views/SocialView.vue')
const AuditView = () => import('./views/AuditView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // title 是页面名字，顶栏会显示它
    { path: '/login', component: LoginView, meta: { title: '登录', public: true } },
    { path: '/', component: LobbyView, meta: { title: '大厅' } },
    // 预备营和训练营共用同一个阅读页面，只是读的教材不同（book: 'prep' 读区块链基础）
    { path: '/prep', component: TextbookView, meta: { title: '预备营', book: 'prep' } },
    { path: '/camp', component: TextbookView, meta: { title: '训练营' } },
    { path: '/mentor', component: MentorView, meta: { title: '白帽导师' } },
    { path: '/archive', component: NotebookView, meta: { title: '案件档案' } },
    { path: '/mission', component: GameView, meta: { title: '实战任务' } },
    { path: '/social', component: SocialView, meta: { title: '情报站' } },
    // 学习站已经并进情报站，改名「情报收集文件夹」；旧地址自动跳过去
    { path: '/study', redirect: '/social?tab=folder' },
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
