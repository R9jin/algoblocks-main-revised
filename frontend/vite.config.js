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
        'data/**/*.json',
        'assets/**/*',
        'pyodide/*',
        'python_engine/**/*'
      ],
      workbox: {
        maximumFileSizeToCacheInBytes: 15000000, // 15MB limit for Pyodide
        // 2. Ensure all assets, python code, and zip archives are in the manifest
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,py,json,zip}'],
        // 3. Ignore cache-buster timestamp query parameters during offline cache matching
        ignoreURLParametersMatching: [/^t$/, /^utm_/, /^fbclid$/]
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