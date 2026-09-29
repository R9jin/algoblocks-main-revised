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

export async function fetchStaticJson(url) {
  try {
    const res = await fetch(url);
    if (res.ok && looksLikeJson(res)) {
      const json = await res.json();
      remember(url, json);
      return json;
    }
  } catch (e) {
    // offline / SW could not answer -- fall through to the local layers
  }

  try {
    if (typeof caches !== "undefined") {
      const hit = await caches.match(url, { ignoreSearch: true });
      if (hit && hit.ok && looksLikeJson(hit)) {
        const json = await hit.json();
        remember(url, json);
        return json;
      }
    }
  } catch (e) { /* ignore */ }

  try {
    const cached = await curriculumCacheDB.getItem(url);
    if (cached) return cached;
  } catch (e) { /* ignore */ }

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
