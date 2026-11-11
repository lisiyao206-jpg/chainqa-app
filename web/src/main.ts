import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { startAutoFrame } from './utils/autoFrame'

createApp(App).use(createPinia()).use(router).mount('#app')
startAutoFrame() // 全站面板边框上的流动代码
