// frontend/src/db.js
import { openDB } from "idb";

const DB_NAME = "AlgoBlocksDB";
const DB_VERSION = 7; // Bumped to 7 to add the datasetCache store (offline ground-truth prefetch)

// PERFORMANCE FIX: initDB() used to call openDB(...) fresh every single
// time it was invoked -- and every method on createStoreWrapper below
// (get, setItem, getAll, delete, ...) calls initDB() internally. That
// meant a page loading, say, 100 submissions issued 100 separate
// indexedDB.open() calls instead of reusing one connection, each paying
// its own connection-setup cost on top of the actual read/write. Caching
// the open connection's promise means every caller after the first just
// awaits the same already-resolving (or already-resolved) connection.
let dbPromise = null;
export const initDB = async () => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (!db.objectStoreNames.contains("projects")) {
                const store = db.createObjectStore("projects", { keyPath: "projectId" });
                store.createIndex("userId", "userId", { unique: false });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            if (!db.objectStoreNames.contains("templates")) {
                const store = db.createObjectStore("templates", { keyPath: "templateId" });
                store.createIndex("category", "category", { unique: false });
            }

            if (!db.objectStoreNames.contains("progress")) {
                const store = db.createObjectStore("progress", { keyPath: "lesson_id" });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            if (!db.objectStoreNames.contains("assessments")) {
                const store = db.createObjectStore("assessments", { keyPath: "assessmentId" });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            // Submissions must be keyed by "id". This block used to delete and
            // recreate the store on EVERY schema upgrade, so any future DB_VERSION
            // bump silently wiped every saved submission -- including ones not yet
            // synced to the server. Only rebuild it when it is missing or was
            // created with the old, wrong key path.
            if (db.objectStoreNames.contains("submissions") && transaction.objectStore("submissions").keyPath !== "id") {
                db.deleteObjectStore("submissions");
            }
            if (!db.objectStoreNames.contains("submissions")) {
                const subStore = db.createObjectStore("submissions", { keyPath: "id" });
                subStore.createIndex("isSynced", "isSynced", { unique: false });
            }
            
            if (!db.objectStoreNames.contains("syncQueue")) {
                db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
            }

            if (!db.objectStoreNames.contains("curriculumCache")) {
                db.createObjectStore("curriculumCache", { keyPath: "id" });
            }

            // Holds the pre-fetched ground-truth benchmark chunks (see
            // utils/datasetCache.js) so "Start Evaluation" on Dataset
            // Testing reads from disk instantly instead of re-fetching ~30
            // JSON files one at a time over an unstable connection. Static
            // app content, not per-user data -- same rationale as
            // curriculumCache above.
            if (!db.objectStoreNames.contains("datasetCache")) {
                db.createObjectStore("datasetCache", { keyPath: "id" });
            }
        },
        }).catch((e) => {
            // Don't let a poisoned cache permanently break every DB call --
            // clear it so the next initDB() call gets a fresh attempt.
            dbPromise = null;
            throw e;
        });
    }
    return dbPromise;
};

const createStoreWrapper = (storeName, keyPath) => {
    return {
        async getAll() {
            const db = await initDB();
            return db.getAll(storeName);
        },
        async get(id) { 
            const db = await initDB();
            return db.get(storeName, id);
        },
        async save(item) {
            const db = await initDB();
            // Only stamp a fresh timestamp when the caller didn't already provide
            // one. Previously this always overwrote `timestamp` with Date.now(),
            // which meant every background sync pull (syncManager.pullRemoteState,
            // every 30s) clobbered the real server-side timestamp of projects,
            // templates, etc. with "now" -- making everything look like it was
            // just modified and causing the dashboard's sort-by-updatedAt to
            // reshuffle (flicker) on each poll.
            const timestamp = item.timestamp !== undefined && item.timestamp !== null
                ? item.timestamp
                : Date.now();
            return db.put(storeName, { ...item, timestamp });
        },
        async delete(id) {
            const db = await initDB();
            return db.delete(storeName, id);
        },
        async clear() {
            const db = await initDB();
            return db.clear(storeName);
        },
        async getItem(id) {
            const data = await this.get(id);
            if (data && data._isWrappedPayload) {
                return data.value;
            }
            return data;
        },
        async setItem(id, value) {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return this.save({ [keyPath || "id"]: id, _isWrappedPayload: true, value });
            }
            
            const payload = { ...value };
            if (keyPath) {
                payload[keyPath] = payload[keyPath] || id;
            }
            return this.save(payload);
        },
        async removeItem(id) {
            return this.delete(id);
        },
        async iterate(callback) {
            const allItems = await this.getAll();
            for (let i = 0; i < allItems.length; i++) {
                const item = allItems[i];
                const passedValue = item._isWrappedPayload ? item.value : item;
                await callback(passedValue, item[keyPath || "id"], i);
            }
        }
    };
};

export const projectsDB = createStoreWrapper("projects", "projectId");
export const templatesDB = createStoreWrapper("templates", "templateId");
export const progressDB = createStoreWrapper("progress", "lesson_id");
export const assessmentsDB = createStoreWrapper("assessments", "assessmentId");
// FIX: Updated keyPath binding to match the new DB schema
export const submissionsDB = createStoreWrapper("submissions", "id");
export const curriculumCacheDB = createStoreWrapper("curriculumCache", "id");
export const datasetCacheDB = createStoreWrapper("datasetCache", "id");

export const syncQueueDB = {
    async add(action, payload) {
        const db = await initDB();
        return db.add("syncQueue", { action, payload, timestamp: Date.now() });
    },
    // Compatibility method: AssessmentPage.jsx (and ActivityApp.jsx's own
    // localStorage-fallback path) call syncQueueDB.setItem(key, data) to
    // queue a retryable HTTP call, but this object never actually defined
    // it -- calling it threw a TypeError, silently dropping the retry
    // (assessment/progress scores entered while offline could be lost
    // instead of syncing once back online). Store it as a "RETRY_REQUEST"
    // task using the same underlying add() so it's picked up by the queue
    // processor in syncManager.js.
    // De-duplicated by key: the same submission/progress write is queued again
    // every time a save or retry fails (e.g. key "sync_<submissionId>"), which
    // piled up identical tasks that were each replayed. Re-queuing a key now
    // replaces the pending task's payload with the newest one and resets its
    // retry counter instead of adding another copy.
    async setItem(key, data) {
        const db = await initDB();
        const tx = db.transaction("syncQueue", "readwrite");
        const store = tx.objectStore("syncQueue");
        const existing = (await store.getAll()).find(t => t.action === "RETRY_REQUEST" && t.key === key);
        let result;
        if (existing) {
            result = await store.put({ ...existing, payload: data, timestamp: Date.now(), attempts: 0 });
        } else {
            result = await store.add({ action: "RETRY_REQUEST", key, payload: data, timestamp: Date.now() });
        }
        await tx.done;
        return result;
    },
    // Persist changes to an existing queued task (e.g. its retry counter).
    async update(task) {
        const db = await initDB();
        return db.put("syncQueue", task);
    },
    async getAll() {
        const db = await initDB();
        return db.getAll("syncQueue");
    },
    async remove(id) {
        const db = await initDB();
        return db.delete("syncQueue", id);
    },
    async clear() {
        const db = await initDB();
        return db.clear("syncQueue");
    }
};

// BUG FIX: Guest accounts (and account switches on a shared browser) were
// showing another account's learning-path progress. Root cause: the local
// IndexedDB cache (`AlgoBlocksDB`) is a single, browser-wide store that is
// NOT namespaced per user -- `progress` is keyed only by `lesson_id` and
// `assessments` only by `assessmentId`, with no userId field at all, and
// nothing ever cleared these stores when a session ended or a guest session
// began. Three separate "Continue as Guest" entry points
// (HomePage.jsx, Header.jsx, SignIn.jsx) each rolled their own cleanup and
// none of them cleared `progress`/`assessments`/`submissions` -- so a real
// account's lesson progress, assessment scores, and activity submissions
// stayed cached locally and were read straight into the next guest (or
// next different-account) session.
//
// This clears every user-scoped local store. `curriculumCache` and
// `datasetCache` are deliberately excluded since they only hold static
// lesson/curriculum and benchmark-dataset content (not per-user data), and
// clearing them would just force needless refetches -- including
// re-downloading the ground-truth chunks right after the sign-out this
// function runs on, defeating the point of caching them ahead of time.
// Which account the locally cached data belongs to. The IndexedDB stores are
// browser-wide and NOT namespaced per user, so every sign-in used to wipe them
// unconditionally to stop one account's data leaking into another. That also
// destroyed the SAME person's not-yet-synced work (offline projects, scores,
// the retry queue) whenever their session expired or they logged out offline and
// signed back in -- even though sign-out deliberately keeps it (see
// utils/sessionCleanup.js). Recording the owner lets a sign-in keep the data when
// the same account returns and still clear it when a different one signs in.
export const LOCAL_DATA_OWNER_KEY = "algoblocks_local_data_owner";

export async function claimLocalDataFor(email) {
    const next = String(email || "").trim().toLowerCase();
    let previous = null;
    try { previous = localStorage.getItem(LOCAL_DATA_OWNER_KEY); } catch (e) { /* storage unavailable */ }
    const sameAccount = !!next && !!previous && previous === next;
    if (!sameAccount) await clearLocalUserData();
    try {
        if (next) localStorage.setItem(LOCAL_DATA_OWNER_KEY, next);
        else localStorage.removeItem(LOCAL_DATA_OWNER_KEY);
    } catch (e) { /* storage unavailable */ }
    return sameAccount;
}

export async function clearLocalUserData() {
    try { localStorage.removeItem(LOCAL_DATA_OWNER_KEY); } catch (e) { /* storage unavailable */ }
    await Promise.all([
        projectsDB.clear(),
        templatesDB.clear(),
        progressDB.clear(),
        assessmentsDB.clear(),
        submissionsDB.clear(),
        syncQueueDB.clear(),
    ]);
}