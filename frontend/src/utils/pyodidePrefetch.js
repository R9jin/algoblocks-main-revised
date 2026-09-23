// frontend/src/utils/pyodidePrefetch.js
//
// PURPOSE
// -------
// The Pyodide runtime (.wasm, .mjs, python_stdlib.zip) and the entire
// python_engine/ directory are large assets that are only fetched when the
// user first navigates to a Pyodide-powered page (/workspace, /activity/…,
// etc.).  If the user goes offline before visiting any of those pages the
// Service Worker cache is empty and the analyzer fails with a network error.
//
// This module fixes that by spawning a short-lived "warm-up" worker the
// moment the user signs in (or is already signed in on app load).  The
// worker runs INIT_ENGINE, which causes the browser to download and cache
// all Pyodide assets through the normal SW pipeline.  Once ENGINE_READY
// arrives the worker is terminated — the assets are now in the SW cache and
// any subsequent real PyodideProvider mount will load from cache, even
// completely offline.
//
// USAGE
// -----
//   import { prefetchPyodideEngine } from './utils/pyodidePrefetch';
//   prefetchPyodideEngine();   // fire-and-forget, safe to call repeatedly
//
// OFFLINE FALLBACK
// ----------------
// If the user has never been online long enough to cache Pyodide AND is
// currently offline, initPyodide() in the worker will throw.  We silently
// swallow that error here — PyodideContext will surface its own error UI
// when the real worker also fails to initialise.

let prefetchStarted = false;
let prefetchDone = false;

/**
 * Returns true once the warm-up worker has successfully reported ENGINE_READY.
 * PyodideContext can use this to skip its progress "Downloading Python
 * runtime…" stage when assets are already locally cached.
 */
export const isPyodideWarmed = () => prefetchDone;

/**
 * Idempotent.  Spawns a hidden analyzer worker whose sole job is to run
 * INIT_ENGINE so all Pyodide assets are fetched and stored in the Service
 * Worker cache.  The worker is terminated as soon as it responds (success or
 * failure).  Subsequent calls are no-ops.
 */
export const prefetchPyodideEngine = () => {
    // Only one warm-up attempt per session.
    if (prefetchStarted) return;
    prefetchStarted = true;

    let worker;
    try {
        worker = new Worker(
            new URL('../workers/analyzer.worker.js', import.meta.url),
            { type: 'module' }
        );
    } catch (err) {
        // Workers blocked (e.g. strict CSP in some test environments) — silent.
        console.warn('[PyodidePrefetch] Could not create warm-up worker:', err);
        prefetchStarted = false; // allow retry
        return;
    }

    const cleanup = () => {
        try { worker.terminate(); } catch (_) { /* noop */ }
    };

    // Timeout: if the worker never responds within 3 minutes (e.g. extremely
    // slow connection), give up and clean up so it doesn't leak forever.
    const timeoutId = setTimeout(() => {
        console.warn('[PyodidePrefetch] Warm-up worker timed out — engine may not be cached yet.');
        cleanup();
    }, 3 * 60 * 1000);

    worker.addEventListener('message', (e) => {
        const { type } = e.data;

        if (type === 'ENGINE_READY') {
            prefetchDone = true;
            clearTimeout(timeoutId);
            cleanup();
            // Dispatch a custom event so any listening UI can react
            // (e.g. show "Analyzer ready for offline use").
            window.dispatchEvent(new CustomEvent('pyodide-prefetch-ready'));

        } else if (type === 'ENGINE_ERROR') {
            // Failed — likely offline with an empty SW cache.  PyodideContext
            // will surface a proper error when the real worker also fails.
            clearTimeout(timeoutId);
            cleanup();
        } else if (type === 'ENGINE_PROGRESS') {
            // Forwarded so DevTools can show download progress in console.
            // Nothing to do in the UI since this is a background operation.
        }
    });

    worker.addEventListener('error', (err) => {
        clearTimeout(timeoutId);
        cleanup();
        console.warn('[PyodidePrefetch] Warm-up worker error:', err.message);
    });

    worker.postMessage({ type: 'INIT_ENGINE' });
};
