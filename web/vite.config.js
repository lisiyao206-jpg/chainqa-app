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
})
