import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 生产构建使用相对资源路径，便于通过静态服务器部署 offline-demo。
  base: mode === 'development' ? '/' : './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/core': path.resolve(__dirname, './src/core'),
      '@/features': path.resolve(__dirname, './src/features'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    outDir: '../offline-demo',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'echarts': ['echarts'],
          'onnx': ['onnxruntime-web'],
        },
      },
    },
  },
  server: {
    port: 3000,
    headers: mode === 'development' ? {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    } : {},
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
}))
