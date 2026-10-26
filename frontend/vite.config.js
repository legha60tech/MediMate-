import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server forwards /api requests to the FastAPI backend so the
// browser never needs to know the backend address (no CORS hassles in dev).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
