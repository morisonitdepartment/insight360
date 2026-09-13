import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // GitHub Pages serves project sites from /<repo-name>/ — override with VITE_BASE_PATH
  const base = env.VITE_BASE_PATH || (mode === 'production' ? '/insight360/' : '/')
  return {
    base,
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // Split the heavy vendor libraries so the first paint stays small on GitHub Pages.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]node_modules[\\/](recharts|d3-|victory-|decimal\.js-light|internmap|eventemitter3)/.test(id)) return 'charts'
            if (/[\\/]node_modules[\\/](xlsx|jspdf|html2canvas|canvg|core-js|raf|fflate)/.test(id)) return 'export'
            return 'vendor'
          },
        },
      },
    },
  }
})
