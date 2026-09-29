// frontend/src/utils/offlineReadiness.js
//
// Makes sure the big Pyodide runtime is *actually* in Cache Storage, not
// just "probably cached by whoever asked for it first".
//
// Why this exists: /pyodide/* is deliberately kept out of the install-time
// precache (see vite.config.js -- ~11MB downloaded on install used to race
// the engine's own download). It is cached lazily by a CacheFirst runtime
// route instead. That lazy path has a hole: on the very first visit the
// engine worker starts fetching *before* the service worker has claimed the
// page, so those requests bypass the worker and nothing lands in the cache.
// The learner then goes offline believing the app is ready, and the Python
// engine (and with it code analysis, running, templates -> blocks) never
// starts.
//
// This runs once the engine has finished loading online -- so it never
// competes with that download -- and fills any gap. Files already cached
// (the normal case) cost a single cache lookup each.
const PYODIDE_CACHE = "pyodide-runtime-cache";
const PYODIDE_FILES = [
  "/pyodide/pyodide.mjs",
  "/pyodide/pyodide.asm.js",
  "/pyodide/pyodide.asm.wasm",
  "/pyodide/python_stdlib.zip",
  "/pyodide/pyodide-lock.json",
];

let running = null;

export function ensurePyodideCached() {
  if (running) return running;
  if (typeof caches === "undefined" || typeof navigator === "undefined" || !navigator.onLine) {
    return Promise.resolve(false);
  }
  running = (async () => {
    try {
      const cache = await caches.open(PYODIDE_CACHE);
      for (const url of PYODIDE_FILES) {
        if (await cache.match(url)) continue;
        // If the service worker controls this page, this request is
        // answered (and cached) by its CacheFirst route; otherwise we
        // store the response ourselves below.
        const res = await fetch(url);
        if (!res.ok || res.status !== 200) { res.body?.cancel?.(); continue; }
        if (await cache.match(url)) { res.body?.cancel?.(); continue; }
        await cache.put(url, res);
      }
      return true;
    } catch (e) {
      console.warn("Pyodide offline warm-up skipped:", e);
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

// Runs `fn` when the browser is idle so it never steals time from the UI.
export function whenIdle(fn, timeout = 5000) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 2000);
}
