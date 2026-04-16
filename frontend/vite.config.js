import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', 
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,zip,json}'],
        maximumFileSizeToCacheInBytes: 20000000, // 20 MB limit to allow Pyodide
      },
      manifest: {
        name: 'AlgoBlocks',
        short_name: 'AlgoBlocks',
        description: 'An offline-first algorithmic learning platform',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: '/assets/algoblocks_logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/assets/algoblocks_logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
});