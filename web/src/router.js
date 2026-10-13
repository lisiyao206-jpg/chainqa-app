import { createRouter, createWebHistory } from 'vue-router'
import TextbookView from './views/TextbookView.vue'
import NotebookView from './views/NotebookView.vue'
import GameView from './views/GameView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    // 打开首页时，自动跳到教材页
    { path: '/', redirect: '/textbook' },
    { path: '/textbook', component: TextbookView },
    { path: '/notebook', component: NotebookView },
    { path: '/game', component: GameView },
  ],
})
