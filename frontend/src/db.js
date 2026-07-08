// frontend/src/db.js
import { openDB } from "idb";

const DB_NAME = "AlgoBlocksDB";
const DB_VERSION = 5; // Must be 5 or higher to prevent VersionError downgrades

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            // Projects: Uses projectId as the local key
            if (!db.objectStoreNames.contains("projects")) {
                const store = db.createObjectStore("projects", { keyPath: "projectId" });
                store.createIndex("userId", "userId", { unique: false });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            // Templates: Uses templateId as the local key
            if (!db.objectStoreNames.contains("templates")) {
                const store = db.createObjectStore("templates", { keyPath: "templateId" });
                store.createIndex("category", "category", { unique: false });
            }

            // Progress tracking
            if (!db.objectStoreNames.contains("progress")) {
                const store = db.createObjectStore("progress", { keyPath: "lesson_id" });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            // Assessments tracking
            if (!db.objectStoreNames.contains("assessments")) {
                const store = db.createObjectStore("assessments", { keyPath: "assessmentId" });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            // Submissions tracking
            if (!db.objectStoreNames.contains("submissions")) {
                const store = db.createObjectStore("submissions", { keyPath: "activityId" });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }
            
            // Sync Queue for handling offline actions
            if (!db.objectStoreNames.contains("syncQueue")) {
                const store = db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
            }

            // Curriculum Cache for caching JSON data locally
            if (!db.objectStoreNames.contains("curriculumCache")) {
                const store = db.createObjectStore("curriculumCache", { keyPath: "id" });
            }
        },
    });
};

// Factory to create standardized store wrappers with all required methods
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
            return db.put(storeName, { ...item, timestamp: Date.now() });
        },
        async delete(id) {
            const db = await initDB();
            return db.delete(storeName, id);
        },
        async clear() {
            const db = await initDB();
            return db.clear(storeName);
        },
        // Compatibility layer to prevent "db.setItem is not a function" and match localForage API
        async getItem(id) {
            const data = await this.get(id);
            // Check if this was a primitive/array wrapped safely by setItem
            if (data && data._isWrappedPayload) {
                return data.value;
            }
            return data;
        },
        async setItem(id, value) {
            // If value is an array or primitive, wrap it to avoid IndexedDB KeyPath DataErrors
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
export const submissionsDB = createStoreWrapper("submissions", "activityId");
export const curriculumCacheDB = createStoreWrapper("curriculumCache", "id");

export const syncQueueDB = {
    async add(action, payload) {
        const db = await initDB();
        return db.add("syncQueue", { action, payload, timestamp: Date.now() });
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