// frontend/src/db.js
import { openDB } from "idb";

const DB_NAME = "AlgoBlocksDB";
const DB_VERSION = 6; // Bumped to 6 to fix submissions keyPath

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
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

            // FIX: Recreate submissions store with correct primary key "id"
            if (db.objectStoreNames.contains("submissions")) {
                db.deleteObjectStore("submissions");
            }
            const subStore = db.createObjectStore("submissions", { keyPath: "id" });
            subStore.createIndex("isSynced", "isSynced", { unique: false });
            
            if (!db.objectStoreNames.contains("syncQueue")) {
                const store = db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
            }

            if (!db.objectStoreNames.contains("curriculumCache")) {
                const store = db.createObjectStore("curriculumCache", { keyPath: "id" });
            }
        },
    });
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