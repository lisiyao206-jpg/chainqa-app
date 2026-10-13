import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from './views/LobbyView.vue'
import TextbookView from './views/TextbookView.vue'
import MentorView from './views/MentorView.vue'
import NotebookView from './views/NotebookView.vue'
import GameView from './views/GameView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    // title 是页面名字，顶栏会显示它
    { path: '/', component: LobbyView, meta: { title: '大厅' } },
    { path: '/camp', component: TextbookView, meta: { title: '训练营' } },
    { path: '/mentor', component: MentorView, meta: { title: '白帽导师' } },
    { path: '/archive', component: NotebookView, meta: { title: '案件档案' } },
    { path: '/mission', component: GameView, meta: { title: '实战任务' } },
  ],
})
