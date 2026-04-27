import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  const path = id.replace(/\\/g, '/')
  if (!path.includes('/node_modules/')) return

  if (path.includes('/react-dom/') || path.includes('/react/') || path.includes('/scheduler/')) return 'react-vendor'
  if (path.includes('/recharts/') || path.includes('/d3-') || path.includes('/internmap/')) return 'chart-vendor'
  if (
    path.includes('/antd/') ||
    path.includes('/@ant-design/') ||
    path.includes('/@ant-design/cssinjs/') ||
    path.includes('/@rc-component/') ||
    path.includes('/rc-')
  ) {
    return 'antd-vendor'
  }
  if (path.includes('/axios/') || path.includes('/dayjs/')) return 'utils-vendor'
}

export default defineConfig({
  plugins: [react()],
  base: '/monitor/',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
