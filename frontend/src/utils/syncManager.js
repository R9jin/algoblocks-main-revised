// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, submissionsDB, syncQueueDB } from "../db";

const API_BASE_URL = "http://localhost:8000/api";

/**
 * Helper to securely get the token and build headers
 */
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    
    if (!token) {
        console.warn("SyncManager: No auth token found in localStorage.");
        return { "Content-Type": "application/json" };
    }

    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` // STRICT JWT REQUIREMENT
    };
};

/**
 * Offline Support: Adds failed or offline requests to the local IndexedDB sync queue
 */
const addToSyncQueue = async (url, method, payload, type) => {
    try {
        const id = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
        await syncQueueDB.setItem(id, { 
            url, 
            method, 
            payload, 
            type, 
            timestamp: Date.now() 
        });
        console.log(`[Offline] Saved ${type} to sync queue.`);
    } catch (err) {
        console.error("Failed to add to sync queue", err);
    }
};

export const syncManager = {
    /**
     * Syncs a specific coding submission to the backend & Local DB
     */
    syncSubmission: async (activityId, code, output, isCompleted) => {
        const payload = {
            activityId,
            code,
            output,
            isCompleted,
            timestamp: new Date().toISOString()
        };

        // 1. ALWAYS save locally first for immediate UI response & offline support
        try {
            await submissionsDB.setItem(activityId, payload);
        } catch (err) {
            console.error("Failed to save submission locally:", err);
        }

        // 2. Check network status
        if (!navigator.onLine) {
            await addToSyncQueue(`${API_BASE_URL}/sync-submission`, "POST", payload, "submission");
            return { status: "offline_saved", message: "Saved locally. Will sync when online." };
        }

        // 3. Attempt server sync
        try {
            const response = await fetch(`${API_BASE_URL}/sync-submission`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                console.error("SyncManager: Unauthorized (401). Token may be expired.");
                await addToSyncQueue(`${API_BASE_URL}/sync-submission`, "POST", payload, "submission");
                return false;
            }

            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            
            return await response.json();
        } catch (error) {
            console.error("Sync Error [Submission]:", error);
            await addToSyncQueue(`${API_BASE_URL}/sync-submission`, "POST", payload, "submission");
            return false;
        }
    },

    /**
     * Syncs lesson progress to the backend & Local DB
     */
    updateProgress: async (lessonId, progressData) => {
        const payload = {
            lesson_id: lessonId,
            ...progressData
        };

        // 1. Save locally
        try {
            await progressDB.setItem(lessonId, payload);
        } catch (err) {}

        if (!navigator.onLine) {
            await addToSyncQueue(`${API_BASE_URL}/update-progress`, "POST", payload, "progress");
            return { status: "offline_saved" };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/update-progress`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                await addToSyncQueue(`${API_BASE_URL}/update-progress`, "POST", payload, "progress");
                return false;
            }

            if (!response.ok) throw new Error("Failed to update progress");

            return await response.json();
        } catch (error) {
            console.error("Sync Error [Progress]:", error);
            await addToSyncQueue(`${API_BASE_URL}/update-progress`, "POST", payload, "progress");
            return false;
        }
    },

    /**
     * Syncs assessment scores to the backend & Local DB
     */
    updateAssessment: async (assessmentKey, score, passed) => {
        const payload = {
            key: assessmentKey,
            score: score,
            passed: passed,
            timestamp: new Date().toISOString()
        };

        // 1. Save locally
        try {
            await assessmentsDB.setItem(assessmentKey, payload);
        } catch (err) {}

        if (!navigator.onLine) {
            await addToSyncQueue(`${API_BASE_URL}/update-assessment`, "POST", payload, "assessment");
            return { status: "offline_saved" };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/update-assessment`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                await addToSyncQueue(`${API_BASE_URL}/update-assessment`, "POST", payload, "assessment");
                return false;
            }

            if (!response.ok) throw new Error("Failed to update assessment");

            return await response.json();
        } catch (error) {
            console.error("Sync Error [Assessment]:", error);
            await addToSyncQueue(`${API_BASE_URL}/update-assessment`, "POST", payload, "assessment");
            return false;
        }
    },

    /**
     * BACKGROUND PROCESSOR: Flushes the offline queue when connection is restored
     */
    processSyncQueue: async () => {
        if (!navigator.onLine) return;

        try {
            const keys = await syncQueueDB.keys();
            if (keys.length === 0) return;

            console.log(`SyncManager: Processing ${keys.length} items in background sync queue...`);

            for (const key of keys) {
                const item = await syncQueueDB.getItem(key);
                try {
                    const response = await fetch(item.url, {
                        method: item.method,
                        headers: getAuthHeaders(),
                        body: JSON.stringify(item.payload)
                    });

                    if (response.ok) {
                        await syncQueueDB.removeItem(key); // Clean up upon success
                        console.log(`[Sync] Successfully processed queued ${item.type}`);
                    } else if (response.status === 401) {
                        console.warn("[Sync] Queue item failed (401 Unauthorized). Halting queue flush.");
                        break; // Stop processing the queue if token is invalid to avoid 401 spam
                    }
                } catch (err) {
                    console.error(`[Sync] Queue item ${key} failed, keeping in queue.`);
                }
            }
        } catch (err) {
            console.error("Failed to process sync queue", err);
        }
    }
};

// =====================================================================
// MISSING EXPORT FIX FOR UserHeader.jsx
// =====================================================================
/**
 * Triggers the background sync interval for processing queued offline requests.
 * Used globally by components like UserHeader.
 */
export const startBackgroundSync = () => {
    // Run an initial check immediately
    syncManager.processSyncQueue();
    
    // Set up a loop to check the offline queue every 30 seconds
    setInterval(() => {
        syncManager.processSyncQueue();
    }, 30000);
};

// Listen for the browser coming back online to automatically flush the queue
window.addEventListener("online", () => {
    console.log("Network restored! Triggering background sync...");
    syncManager.processSyncQueue();
});