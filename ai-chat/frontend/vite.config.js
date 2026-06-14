import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 代理 API 请求到后端
      '/chat': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/agent': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/rag': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/db': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/intent': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
