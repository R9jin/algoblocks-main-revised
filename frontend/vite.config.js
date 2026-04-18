// frontend/vite.config.js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 15000000,
        // ADD 'json' TO THIS LIST
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,py,json}']
      }
    })
  ],
  // ADD THIS SERVER BLOCK
  server: {
    proxy: {
      '/api': {
        // Replace 8000 with whatever port your Python backend is running on locally
        target: 'http://localhost:8000', 
        changeOrigin: true,
      }
    }
  }
})