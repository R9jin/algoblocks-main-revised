import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Installable app manifest. The generated default was
      // {"name":"frontend"} with no icons at all.
      manifest: {
        name: 'AlgoBlocks',
        short_name: 'AlgoBlocks',
        description: 'Learn algorithms and Big-O with blocks and Python -- works offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#42b883',
        icons: [
          { src: '/assets/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/assets/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/assets/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // 1. Force workbox to grab your template and activity JSONs
      // ROOT-CAUSE FIX (icons / everything missing offline): this used to be
      //   includeAssets: ['templates/**/*.json', 'data/**/*.json', 'assets/**/*', 'python_engine/**/*']
      // on top of workbox.globPatterns below, which already match all of those
      // files. vite-plugin-pwa marks anything under assets/ as "hashed, needs no
      // revision", while includeAssets adds the same file again WITH a revision --
      // Workbox saw one URL twice with two different revisions and threw
      // `add-to-cache-list-conflicting-entries` inside precacheAndRoute(), which
      // aborts the whole precache install. The service worker still "activated"
      // (so the app looked fine online) but cached NOTHING, so offline every
      // static file -- the /assets/*.png icons first of all -- was missing.
      // globPatterns is the single source of truth now.
      //
      // (Pyodide is deliberately kept out of the precache, see globIgnores and
      // the runtimeCaching rules below: precaching its ~11MB at install time
      // raced the engine's own download of the same files.)
      workbox: {
        maximumFileSizeToCacheInBytes: 15000000, // 15MB limit, still needed for python_engine's larger files
        // 2. Ensure all assets, python code, and zip archives are in the manifest
        // BUG FIX (missing icons offline): this list had no ttf/woff/eot, so
        // Monaco's icon font (assets/codicon-*.ttf -- the icons in the Python
        // editor's find widget, suggestions, folding arrows, etc.) was never
        // precached and rendered as empty boxes offline. It also skipped
        // jpg/webp/gif images and audio. Every static type the app can emit
        // is listed now.
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,webp,gif,avif,svg,mjs,py,json,webmanifest,woff2,woff,ttf,otf,eot,mp3,ogg,wav}'],
        // Exclude the big pyodide binaries from the install-time precache
        // manifest -- see the includeAssets note above. They're handled by
        // runtimeCaching instead, which is CacheFirst without the
        // install-time download race.
        globIgnores: [
          '**/pyodide/**',
          // Dev-only leftovers that have no business in the install-time download.
          '**/*.code-workspace',
          '**/assets/algoblocks_logo old.png',
        ],
        // Only files whose name carries a Vite content hash (assets/index-Bx3k9aQz.js)
        // are safe to precache without a revision. Everything else that lives
        // under assets/ is an UNHASHED file copied from public/ (icons, lesson
        // images) -- those need a revision so an updated image is re-downloaded
        // instead of being served stale forever.
        dontCacheBustURLsMatching: /^assets\/.+-(?=[A-Za-z0-9_-]*[A-Z0-9_])[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // 3. Ignore cache-buster timestamp query parameters during offline cache matching
        ignoreURLParametersMatching: [/^t$/, /^utm_/, /^fbclid$/],
        // The offline app-shell fallback must only answer real page
        // navigations. Without a denylist, a top-level request to an API,
        // Pyodide or python_engine URL was answered with index.html (HTTP
        // 200), which the code then tried to parse as JSON / Python -- the
        // analyzer worker even has a special "Service Worker served Vite's
        // index.html" guard for exactly this.
        navigateFallbackDenylist: [/^\/api\//, /^\/pyodide\//, /^\/python_engine\//, /^\/templates\//, /^\/data\//],
        // Pyodide runtime files: fetched once, cached forever. CacheFirst
        // means "serve straight from Cache Storage if present, only hit
        // the network on the very first request ever" -- this is what
        // actually gives you "download once, then every next page/session
        // just uses the cached copy" instead of relying on the in-memory
        // JS singleton (workers/pyodideEngine.js), which only survives
        // within one open tab and is gone the moment the tab is closed or
        // reloaded.
        runtimeCaching: [
          // Safety net for anything visual that is NOT in the precache
          // manifest (an image referenced with an odd path, something added
          // after the last build, a font a library loads lazily). First
          // online use stores it, every later/offline use is served from
          // Cache Storage instead of showing a broken icon.
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              (request.destination === 'image' || request.destination === 'font'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-media-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts (index.html and three CSS files load them). Without
          // a runtime cache every font request fails offline and the whole UI
          // silently falls back to system fonts. The stylesheet is small and
          // may change, so it revalidates; the font files themselves are
          // immutable.
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-styles',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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