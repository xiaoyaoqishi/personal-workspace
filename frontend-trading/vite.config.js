import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  const path = id.replace(/\\/g, '/')
  if (!path.includes('/node_modules/')) return

  if (path.includes('/react-router-dom/')) return 'router-vendor'
  if (path.includes('/react-dom/') || path.includes('/react/') || path.includes('/scheduler/')) return 'react-vendor'
  if (path.includes('/recharts/') || path.includes('/d3-') || path.includes('/internmap/')) return 'chart-vendor'
  if (path.includes('/@ant-design/icons/')) return 'antd-icons'
  if (path.includes('/node_modules/antd/es/')) {
    const seg = path.split('/node_modules/antd/es/')[1]?.split('/')[0]
    if (seg) return `antd-${seg}`
  }
  if (path.includes('/axios/') || path.includes('/dayjs/')) return 'utils-vendor'
}

export default defineConfig({
  plugins: [react()],
  base: '/trading/',
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
