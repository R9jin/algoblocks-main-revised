// frontend/src/utils/staticJsonCache.js
//
// One place for "load a static JSON file that ships with the app" so that
// every caller gets the same layered offline behaviour instead of a bare
// fetch() that dies the moment the network does:
//
//   1. network / service-worker  -- fetch(url). Online this hits the server;
//      offline the Workbox precache answers it (templates/**, data/** are in
//      the precache manifest). A successful response is mirrored into
//      IndexedDB (curriculumCache) as a second safety net.
//   2. Cache Storage             -- caches.match(url, { ignoreSearch: true }),
//      for the case where the service worker isn't controlling the page
//      (first load after install, Shift+reload) but the file was precached.
//   3. IndexedDB                 -- the copy saved by step 1 on an earlier
//      visit.
//
// curriculumCacheDB is the store built for exactly this kind of static app
// content (it is not per-user data and is never pushed to the server by
// syncManager), so nothing here can be mistaken for a user template.
import { curriculumCacheDB } from "../db";

// Stored wrapped (see db.js _isWrappedPayload) so getItem() hands back the
// exact JSON that was fetched -- a plain setItem() would stamp `id` and
// `timestamp` fields onto the template itself.
const remember = (url, json) =>
  curriculumCacheDB.save({ id: url, _isWrappedPayload: true, value: json }).catch(() => {});

const looksLikeJson = (res) => {
  const type = res.headers.get("content-type") || "";
  // The SPA fallback answers unknown paths with index.html (HTML, status
  // 200). Treat that as a miss, never as data.
  return !type.toLowerCase().includes("text/html");
};

// A dead-but-"connected" network (captive portal, lie-fi) can leave fetch()
// pending for minutes. These files are small, so give up quickly and use the
// local copies instead of leaving the page on a skeleton.
const NETWORK_TIMEOUT_MS = 8000;

async function fromNetwork(url) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (res.ok && looksLikeJson(res)) {
      const json = await res.json();
      remember(url, json);
      return json;
    }
  } catch (e) {
    // offline / SW could not answer / timed out -- caller falls through
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}

async function fromCacheStorage(url) {
  try {
    if (typeof caches === "undefined") return null;
    const hit = await caches.match(url, { ignoreSearch: true });
    if (hit && hit.ok && looksLikeJson(hit)) {
      const json = await hit.json();
      remember(url, json);
      return json;
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function fromIndexedDb(url) {
  try {
    const cached = await curriculumCacheDB.getItem(url);
    if (cached) return cached;
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * @param {string} url
 * @param {{ preferLocal?: boolean }} [opts]
 *   preferLocal: answer from IndexedDB immediately when we have a copy (the
 *   curriculum pages read ~40 files at once and used to do exactly this),
 *   then refresh that copy quietly in the background so a new deploy's
 *   content still arrives. Default is network first.
 */
export async function fetchStaticJson(url, opts = {}) {
  if (opts.preferLocal) {
    const local = await fromIndexedDb(url);
    if (local) {
      if (typeof navigator === "undefined" || navigator.onLine) fromNetwork(url);
      return local;
    }
  }
  const json = (await fromNetwork(url)) || (await fromCacheStorage(url)) || (await fromIndexedDb(url));
  if (json) return json;
  throw new Error(`"${url}" is not available offline yet.`);
}

// Best-effort background warm-up: pulls each URL through fetchStaticJson so
// it lands in IndexedDB. Sequential and silent -- it must never compete
// with whatever the user is actually doing.
export async function warmStaticJson(urls) {
  for (const url of urls) {
    try { await fetchStaticJson(url); } catch (e) { /* keep going */ }
  }
}
