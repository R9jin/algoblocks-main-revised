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

// ---------------------------------------------------------------------------
// Static content -> IndexedDB mirror
// ---------------------------------------------------------------------------
// The service worker precache already holds every lesson, activity and
// template JSON, but browsers can evict Cache Storage under storage pressure
// and the precache only answers while a worker controls the page. Mirroring
// the same files into IndexedDB (curriculumCache, which fetchStaticJson()
// reads as its last-resort layer) gives every page a second, independent
// offline copy. The list is read from the precache itself, so a new lesson or
// template is picked up automatically -- nothing to maintain by hand.
let mirroring = null;

export function mirrorStaticContentToIndexedDb() {
  if (mirroring) return mirroring;
  if (typeof caches === "undefined" || typeof navigator === "undefined" || !navigator.onLine) {
    return Promise.resolve(0);
  }
  mirroring = (async () => {
    let stored = 0;
    try {
      const names = await caches.keys();
      const precacheName = names.find((n) => n.includes("precache"));
      if (!precacheName) return 0;
      const cache = await caches.open(precacheName);
      const requests = await cache.keys();
      const urls = requests
        .map((r) => new URL(r.url))
        .filter((u) => u.origin === self.location.origin)
        .map((u) => u.pathname)
        // Lessons, activity banks, assessments, templates, optimizations.
        // The (large) ground-truth chunks have their own store, see datasetCache.js.
        .filter((p) => /^\/(data|templates)\/.+\.json$/.test(p) && !p.startsWith("/data/evaluation/"));

      // Lazy import: staticJsonCache pulls in db.js, which this module
      // otherwise has no reason to load.
      const { fetchStaticJson } = await import("./staticJsonCache.js");
      const { curriculumCacheDB } = await import("../db.js");
      for (const url of [...new Set(urls)]) {
        try {
          // Already mirrored on an earlier visit -- pages that read it
          // (preferLocal) refresh it themselves, so don't re-download it.
          if (await curriculumCacheDB.get(url)) continue;
          await fetchStaticJson(url);
          stored += 1;
        } catch (e) { /* keep going -- best effort */ }
      }
      return stored;
    } catch (e) {
      console.warn("Static content mirror skipped:", e);
      return stored;
    } finally {
      mirroring = null;
    }
  })();
  return mirroring;
}

// Resolves once a service worker is controlling the page (or immediately if
// the browser has none), so warm-ups don't race the worker's first claim.
export function whenServiceWorkerReady(timeoutMs = 15000) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(false);
  return Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}
