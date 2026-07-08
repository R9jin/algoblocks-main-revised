// frontend/src/db.js
import { openDB } from "idb";

const DB_NAME = "AlgoBlocksDB";
const DB_VERSION = 4; // Bumped to ensure clean schema application

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
                db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
            }
        },
    });
};

// Factory to create standardized store wrappers with all required methods
const createStoreWrapper = (storeName) => ({
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
    }
});

export const projectsDB = createStoreWrapper("projects");
export const templatesDB = createStoreWrapper("templates");
export const progressDB = createStoreWrapper("progress");
export const assessmentsDB = createStoreWrapper("assessments");
export const submissionsDB = createStoreWrapper("submissions");

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