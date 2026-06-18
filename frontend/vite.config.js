import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 1. Force workbox to grab your template and activity JSONs
      includeAssets: [
        'templates/**/*.json', 
        'activities/**/*.json',
        'assets/**/*'
      ],
      workbox: {
        maximumFileSizeToCacheInBytes: 15000000, // 15MB limit for Pyodide
        // 2. Ensure JSON is in the manifest
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,py,json}']
      }
    })
  ],
  // FIX: Route API requests from the frontend to the Python backend
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Changed from localhost to 127.0.0.1 to fix IPv4/IPv6 ECONNREFUSED issues
        changeOrigin: true,
        secure: false,
      }
    }
  }
})