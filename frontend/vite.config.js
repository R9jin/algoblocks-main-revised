// vite.config.js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // TELL THE PWA NOT TO PRE-CACHE PYODIDE ON LOAD
        globIgnores: ['**/pyodide/**/*'], 
        maximumFileSizeToCacheInBytes: 5000000 // 5MB limit to prevent crashes
      }
    })
  ]
})