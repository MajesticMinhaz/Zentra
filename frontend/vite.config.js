import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_DEV_PORT || 5173)
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [react()],

    server: {
      host: '0.0.0.0',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
        '/admin': { target: apiUrl, changeOrigin: true },
        '/media': { target: apiUrl, changeOrigin: true },
        '/static': { target: apiUrl, changeOrigin: true },
      },
    },

    base: '/',

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      assetsDir: 'assets',
    },
  }
})