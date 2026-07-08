// frontend/src/db.js
import { openDB } from "idb";

const DB_NAME = "AlgoBlocksDB";
const DB_VERSION = 3; // Bumped version to ensure fresh object stores for PostgreSQL structure

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            // Projects: Uses projectId (string UUID) as the local key
            if (!db.objectStoreNames.contains("projects")) {
                const store = db.createObjectStore("projects", { keyPath: "projectId" });
                store.createIndex("userId", "userId", { unique: false });
                store.createIndex("isSynced", "isSynced", { unique: false });
            }

            // Templates: Uses templateId (string UUID) as the local key
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

// Database Access Wrappers
export const projectsDB = {
    async getAll() {
        const db = await initDB();
        return db.getAll("projects");
    },
    async get(projectId) {
        const db = await initDB();
        return db.get("projects", projectId);
    },
    async save(project) {
        const db = await initDB();
        return db.put("projects", { ...project, timestamp: Date.now() });
    },
    async delete(projectId) {
        const db = await initDB();
        return db.delete("projects", projectId);
    }
};

export const templatesDB = {
    async getAll() {
        const db = await initDB();
        return db.getAll("templates");
    },
    async get(templateId) {
        const db = await initDB();
        return db.get("templates", templateId);
    },
    async save(template) {
        const db = await initDB();
        return db.put("templates", { ...template, timestamp: Date.now() });
    },
    async delete(templateId) {
        const db = await initDB();
        return db.delete("templates", templateId);
    }
};

export const progressDB = {
    async getAll() {
        const db = await initDB();
        return db.getAll("progress");
    },
    async save(progress) {
        const db = await initDB();
        return db.put("progress", { ...progress, timestamp: Date.now() });
    }
};

export const assessmentsDB = {
    async getAll() {
        const db = await initDB();
        return db.getAll("assessments");
    },
    async save(assessment) {
        const db = await initDB();
        return db.put("assessments", { ...assessment, timestamp: Date.now() });
    }
};

export const submissionsDB = {
    async getAll() {
        const db = await initDB();
        return db.getAll("submissions");
    },
    async save(submission) {
        const db = await initDB();
        return db.put("submissions", { ...submission, timestamp: Date.now() });
    }
};

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
    }
};