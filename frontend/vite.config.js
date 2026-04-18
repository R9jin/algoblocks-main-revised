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
  ]
})