import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 开发时把 /api 开头的请求转给后端（server.mjs 跑在 3000 端口）
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    // 性能优化：把体积大、很少改动的第三方库单独打包。
    // 它们的文件名不变，浏览器缓存一次就能一直用；我们改自己的代码时，用户不用重新下载这些库
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/')) return 'three'                         // 3D 引擎（背景、怪兽）
          if (/markmap|d3|katex|highlight|prismjs/.test(id)) return 'mindmap' // 思维导图
          if (/[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)) return 'vue'  // Vue 全家桶
        },
      },
    },
  },
})
