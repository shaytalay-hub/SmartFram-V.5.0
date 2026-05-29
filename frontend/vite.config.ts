import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      deleteOriginFile: false, // Keep original for Cloud mode
      threshold: 1024,
    })
  ],
  build: {
    outDir: '../data/www', // Direct output to ESP32 data folder
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    },
    chunkSizeWarningLimit: 1000,
  }
})
