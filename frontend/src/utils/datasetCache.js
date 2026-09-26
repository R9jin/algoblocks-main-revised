// frontend/src/utils/datasetCache.js
//
// Background prefetch + persistent cache for the ground-truth benchmark
// dataset (/data/evaluation/processed/ground_truth_chunk_NN.json).
//
// PREVIOUSLY: both EvaluationSuite.jsx and AccuracyOverview.jsx re-fetched
// every chunk, one at a time, awaiting each request in sequence, and ONLY
// when the user actually pressed "Start Evaluation" / opened the Accuracy
// page -- so pressing Start on a slow or unstable connection meant sitting
// through ~30 sequential round-trips before the analyzer even began. This
// module fetches the whole chunk set in parallel batches, as early as
// possible (right after sign-in -- see App.jsx), and persists the result
// in IndexedDB (see db.js's `datasetCache` store) so it survives page
// reloads and sign-out/sign-in, not just the current tab session.
import { datasetCacheDB } from "../db.js";

const CHUNK_URL = (n) => `/data/evaluation/processed/ground_truth_chunk_${String(n).padStart(2, "0")}.json`;
const CACHE_KEY = "ground_truth_chunks_v1";

// Matches the original loop's tolerance: a static host has no directory
// listing, so we keep probing sequential chunk numbers until a run of
// this many consecutive misses, rather than hardcoding a chunk count.
const MAX_CONSECUTIVE_MISSES = 3;
// How many chunk requests to have in flight at once. Keeps the original
// "stop after N consecutive misses" semantics (processed in request
// order) while no longer paying one full network round-trip per chunk.
const BATCH_SIZE = 8;

let memoryCache = null; // resolved chunk array for this tab session
let inFlight = null; // de-dupes concurrent prefetch calls

async function fetchChunkJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        const trimmed = text.trim().toLowerCase();
        // Guard against a SPA/service-worker fallback silently returning
        // index.html for a chunk that doesn't exist.
        if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) return null;
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

async function fetchAllChunksFromNetwork() {
    let stitched = [];
    let consecutiveMisses = 0;
    let next = 1;

    while (consecutiveMisses < MAX_CONSECUTIVE_MISSES) {
        const batchNums = Array.from({ length: BATCH_SIZE }, (_, k) => next + k);
        const batchResults = await Promise.all(batchNums.map((n) => fetchChunkJson(CHUNK_URL(n))));

        for (const part of batchResults) {
            if (part) {
                stitched = stitched.concat(part);
                consecutiveMisses = 0;
            } else {
                consecutiveMisses += 1;
                if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) break;
            }
        }
        next += BATCH_SIZE;
    }

    return stitched;
}

// Returns the cached ground-truth dataset, fetching and persisting it if
// this is the first call this tab session (or the IndexedDB cache is
// empty). Safe to call from multiple places -- concurrent callers share
// the same in-flight fetch instead of each re-downloading everything.
export async function prefetchGroundTruth() {
    if (memoryCache) return memoryCache;
    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            const cached = await datasetCacheDB.getItem(CACHE_KEY);
            if (cached && Array.isArray(cached.chunks) && cached.chunks.length > 0) {
                memoryCache = cached.chunks;
                return memoryCache;
            }
        } catch (e) {
            // IndexedDB unavailable/blocked -- fall through to network.
        }

        const chunks = await fetchAllChunksFromNetwork();
        if (chunks.length > 0) {
            memoryCache = chunks;
            // Best-effort persist; a write failure shouldn't block the
            // caller from getting the data it just fetched.
            datasetCacheDB.setItem(CACHE_KEY, { chunks, cachedAt: Date.now() }).catch(() => {});
        }
        return chunks;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
}

// Synchronous peek at whatever's already resolved in memory, for callers
// that want to show "ready instantly" UI without awaiting.
export function getCachedGroundTruthSync() {
    return memoryCache;
}

// Forces a fresh network fetch (bypassing both the in-memory and
// IndexedDB cache) and re-persists the result. Not used by default --
// available if a future "refresh dataset" action is added.
export async function refreshGroundTruth() {
    memoryCache = null;
    inFlight = null;
    const chunks = await fetchAllChunksFromNetwork();
    memoryCache = chunks;
    if (chunks.length > 0) {
        datasetCacheDB.setItem(CACHE_KEY, { chunks, cachedAt: Date.now() }).catch(() => {});
    }
    return chunks;
}
