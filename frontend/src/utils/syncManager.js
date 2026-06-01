// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, submissionsDB, syncQueueDB } from "../db";

// CRITICAL FIX: Use environment variables so it works on both Localhost AND Vercel
const API_BASE_URL = import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : "http://localhost:8000/api";

const getAuthHeaders = () => {
    // Check both potential token storage keys to be safe
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token");
    if (!token) {
        return { "Content-Type": "application/json" };
    }
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

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
    syncSubmission: async (activityId, code, output, isCompleted) => {
        const payload = {
            activityId,
            code,
            output,
            isCompleted,
            timestamp: new Date().toISOString()
        };

        try {
            await submissionsDB.setItem(activityId, payload);
            window.dispatchEvent(new Event("localDataSynced")); // Notify UI immediately
        } catch (err) {}

        if (!navigator.onLine) {
            await addToSyncQueue(`${API_BASE_URL}/sync-submission`, "POST", payload, "submission");
            return { status: "offline_saved", message: "Saved locally. Will sync when online." };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/sync-submission`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
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

    updateProgress: async (lessonId, progressData) => {
        const payload = {
            lesson_id: lessonId,
            ...progressData
        };

        try {
            await progressDB.setItem(lessonId, payload);
            window.dispatchEvent(new Event("localDataSynced"));
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

    updateAssessment: async (assessmentKey, score, passed) => {
        const payload = {
            key: assessmentKey,
            score: score,
            passed: passed,
            timestamp: new Date().toISOString()
        };

        try {
            await assessmentsDB.setItem(assessmentKey, payload);
            window.dispatchEvent(new Event("localDataSynced"));
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
                        await syncQueueDB.removeItem(key);
                        console.log(`[Sync] Successfully processed queued ${item.type}`);
                    } else if (response.status === 401) {
                        break; 
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

/**
 * PULLS cloud data into local IndexedDB
 */
export const syncDownFromServer = async () => {
    try {
        const headers = getAuthHeaders();
        if (!headers.Authorization) return;

        // 1. Progress
        const progRes = await fetch(`${API_BASE_URL}/get-progress`, { headers });
        if (progRes.ok) {
            const data = await progRes.json();
            const progressList = data.progress || data; 
            if (Array.isArray(progressList)) {
                for (const item of progressList) {
                    await progressDB.setItem(item.key || item.lesson_id, item);
                }
            }
        }

        // 2. Assessments
        const assRes = await fetch(`${API_BASE_URL}/get-assessments`, { headers });
        if (assRes.ok) {
            const data = await assRes.json();
            const assessmentList = data.assessments || data; 
            if (Array.isArray(assessmentList)) {
                for (const item of assessmentList) {
                    await assessmentsDB.setItem(item.key || item.assessment_key, item);
                }
            }
        }

        // 3. Submissions (The Fix)
        const subRes = await fetch(`${API_BASE_URL}/get-submissions`, { headers });
        if (subRes.ok) {
            const data = await subRes.json();
            const submissionsList = data.submissions || data;
            if (Array.isArray(submissionsList)) {
                for (const item of submissionsList) {
                    if (item.activityId) {
                        await submissionsDB.setItem(item.activityId, item);
                        if (item.userId && item.moduleId) {
                             await submissionsDB.setItem(`${item.userId}_${item.moduleId}_${item.activityId}`, item);
                        }
                    }
                }
            }
        }

        // Inform the UI to re-render
        window.dispatchEvent(new Event("localDataSynced"));

    } catch (error) {
        console.error("Failed to sync down from server:", error);
    }
};

export const startBackgroundSync = () => {
    syncDownFromServer();
    syncManager.processSyncQueue();
    setInterval(() => {
        syncManager.processSyncQueue();
    }, 30000);
};

window.addEventListener("online", () => {
    syncManager.processSyncQueue();
});