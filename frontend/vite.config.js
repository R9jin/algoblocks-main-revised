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
        // Remove globIgnores so Pyodide is included in the offline cache
        
        // Increase limit to 15MB to accommodate pyodide.asm.wasm
        maximumFileSizeToCacheInBytes: 15000000, 
        
        // Explicitly tell the PWA to cache JS, WASM, MJS, and Python files
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,py}'] 
      }
    })
  ]
})