import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// frontend/vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // <-- Ensure this says localhost, not 127.0.0.1
        changeOrigin: true,
        ws: true,
      }
    }
  }
})