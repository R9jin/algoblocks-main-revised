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
        'python_engine/**/*'
        // NOTE: 'pyodide/*' used to be here, which made Workbox *precache*
        // pyodide.asm.wasm + python_stdlib.zip (~11MB) the instant the
        // service worker installed -- i.e. immediately on every app load,
        // via registerSW({ immediate: true }) in index.jsx. At the same
        // time, PyodideProvider's startEngine() (see workers/pyodideEngine.js)
        // fires on sign-in and independently fetches those exact same
        // files through the worker's own loadPyodide() call. That's two
        // full, simultaneous downloads of the same ~11MB competing over
        // one connection -- on a slow/congested network (e.g. defense-day
        // wifi) that's exactly the kind of contention that stalls a
        // download indefinitely instead of finishing. Pyodide now gets
        // cached via the runtimeCaching CacheFirst rule below instead:
        // fetched once by whichever consumer asks for it first, served
        // from Cache Storage (which persists across tabs/reloads/full
        // browser restarts, not just within one tab session) forever
        // after.
      ],
      workbox: {
        maximumFileSizeToCacheInBytes: 15000000, // 15MB limit, still needed for python_engine's larger files
        // 2. Ensure all assets, python code, and zip archives are in the manifest
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mjs,py,json}'],
        // Exclude the big pyodide binaries from the install-time precache
        // manifest -- see the includeAssets note above. They're handled by
        // runtimeCaching instead, which is CacheFirst without the
        // install-time download race.
        globIgnores: ['**/pyodide/**'],
        // 3. Ignore cache-buster timestamp query parameters during offline cache matching
        ignoreURLParametersMatching: [/^t$/, /^utm_/, /^fbclid$/],
        // Pyodide runtime files: fetched once, cached forever. CacheFirst
        // means "serve straight from Cache Storage if present, only hit
        // the network on the very first request ever" -- this is what
        // actually gives you "download once, then every next page/session
        // just uses the cached copy" instead of relying on the in-memory
        // JS singleton (workers/pyodideEngine.js), which only survives
        // within one open tab and is gone the moment the tab is closed or
        // reloaded.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pyodide/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pyodide-runtime-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year -- these filenames don't change between deploys of the same pyodide version
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true, // pyodide.asm.wasm can be fetched with Range requests during instantiation
            },
          },
        ],
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