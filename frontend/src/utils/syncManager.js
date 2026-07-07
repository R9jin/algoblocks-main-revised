// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, '') + "/api";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");
    if (!token) return { "Content-Type": "application/json" };
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

const addToSyncQueue = async (type, data) => {
    try {
        const id = `sync_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await syncQueueDB.setItem(id, { type: type.toUpperCase(), action: "UPSERT", data, timestamp: Date.now() });
        console.log(`[Offline] Saved ${type} to sync queue.`);
    } catch (err) {
        console.error("Failed to add to sync queue", err);
    }
};

const notifySyncStart = () => window.dispatchEvent(new Event("sync-start"));
const notifySyncEnd = () => window.dispatchEvent(new Event("sync-end"));

export const syncManager = {
    syncSubmission: async (activityId, code, output, isCompleted) => {
        const payload = { activityId, code, output, isCompleted, timestamp: new Date().toISOString() };

        try {
            await submissionsDB.setItem(activityId, payload);
            window.dispatchEvent(new Event("localDataSynced"));
        } catch (err) { }

        if (!navigator.onLine) {
            await addToSyncQueue("SUBMISSION", payload);
            return { status: "offline_saved", message: "Saved locally. Will sync when online." };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/sync-submission`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
            if (response.status === 401) {
                await addToSyncQueue("SUBMISSION", payload);
                return false;
            }
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            return await response.json();
        } catch (error) {
            await addToSyncQueue("SUBMISSION", payload);
            return false;
        }
    },

    updateProgress: async (lessonId, progressData) => {
        const payload = { lesson_id: lessonId, ...progressData };
        try {
            await progressDB.setItem(lessonId, payload);
            window.dispatchEvent(new Event("localDataSynced"));
        } catch (err) { }

        if (!navigator.onLine) {
            await addToSyncQueue("PROGRESS", payload);
            return { status: "offline_saved" };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/update-progress`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
            if (response.status === 401) {
                await addToSyncQueue("PROGRESS", payload);
                return false;
            }
            if (!response.ok) throw new Error("Failed to update progress");
            return await response.json();
        } catch (error) {
            await addToSyncQueue("PROGRESS", payload);
            return false;
        }
    },

    updateAssessment: async (assessmentKey, score, passed) => {
        const payload = { key: assessmentKey, score: score, passed: passed, timestamp: new Date().toISOString() };
        try {
            await assessmentsDB.setItem(assessmentKey, payload);
            window.dispatchEvent(new Event("localDataSynced"));
        } catch (err) { }

        if (!navigator.onLine) {
            await addToSyncQueue("ASSESSMENT", payload);
            return { status: "offline_saved" };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/update-assessment`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
            if (response.status === 401) {
                await addToSyncQueue("ASSESSMENT", payload);
                return false;
            }
            if (!response.ok) throw new Error("Failed to update assessment");
            return await response.json();
        } catch (error) {
            await addToSyncQueue("ASSESSMENT", payload);
            return false;
        }
    },

    processSyncQueue: async () => {
        if (!navigator.onLine) return;
        notifySyncStart();

        try {
            const keys = await syncQueueDB.keys();
            if (keys.length === 0) return;

            const batchPayload = { progress: [], submissions: [], assessments: [] };
            const keysToDelete = [];

            for (const key of keys) {
                const item = await syncQueueDB.getItem(key);
                if (!item) continue;

                const itemType = (item.type || "").toUpperCase();
                const itemData = item.data || item.payload;

                if (!itemData && item.action !== "DELETE") {
                    keysToDelete.push(key);
                    continue;
                }

                if (itemType === "SUBMISSION") batchPayload.submissions.push(itemData);
                else if (itemType === "PROGRESS") batchPayload.progress.push(itemData);
                else if (itemType === "ASSESSMENT") batchPayload.assessments.push(itemData);
                
                // NATIVE WORKSPACE ENGINE: Intercept Projects & Templates
                else if (itemType === "PROJECT" || itemType === "TEMPLATE") {
                    const isTpl = itemType === "TEMPLATE";
                    const targetDB = isTpl ? templatesDB : projectsDB;

                    if (item.action === "DELETE") {
                        try {
                            const delId = itemData._id || itemData.id;
                            const delRoute = isTpl ? `/templates/${delId}` : `/projects/${delId}`;
                            await fetch(`${API_BASE_URL}${delRoute}`, { method: "DELETE", headers: getAuthHeaders() });
                            keysToDelete.push(key);
                        } catch (e) { continue; }
                        continue;
                    }

                    try {
                        const userEmail = itemData.userId || itemData.owner_id;
                        const apiPayload = isTpl
                            ? { templateId: itemData._id?.startsWith("local_") ? null : itemData._id, userId: userEmail, name: itemData.title || itemData.name, description: itemData.description || "", category: itemData.category || "Custom Templates", workspace: itemData.workspace || { blocklyJson: itemData.data } }
                            : { projectId: itemData._id?.startsWith("local_") ? null : itemData._id, userId: userEmail, name: itemData.title || itemData.name, workspace: itemData.workspace || { blocklyJson: itemData.data }, pythonCode: itemData.pythonCode || "" };

                        let primaryPath = isTpl ? "/templates/save" : "/projects/save";
                        let res = await fetch(`${API_BASE_URL}${primaryPath}`, {
                            method: "POST",
                            headers: getAuthHeaders(),
                            body: JSON.stringify(apiPayload)
                        });

                        // Fallback against strict REST prefix routes
                        if (res.status === 404) {
                            let fallbackPath = isTpl ? "/templates" : "/projects";
                            res = await fetch(`${API_BASE_URL}${fallbackPath}`, {
                                method: "POST",
                                headers: getAuthHeaders(),
                                body: JSON.stringify(apiPayload)
                            });
                        }

                        if (res.ok) {
                            const savedData = await res.json();
                            const cloudId = savedData.projectId || savedData.templateId || savedData._id || itemData._id;
                            
                            const syncedDoc = { ...itemData, _id: cloudId, synced: true };
                            if (cloudId !== itemData._id) {
                                await targetDB.removeItem(itemData._id);
                            }
                            await targetDB.setItem(cloudId, syncedDoc);
                            keysToDelete.push(key);
                            window.dispatchEvent(new Event("localDataSynced"));
                        } else if (res.status !== 401 && res.status >= 400 && res.status < 500) {
                            keysToDelete.push(key); // Drop unfixable 4xx schemas
                        }
                    } catch (netErr) {
                        continue; // Network partition, retry next cycle
                    }
                }
                else {
                    keysToDelete.push(key);
                }
            }

            if (batchPayload.progress.length || batchPayload.submissions.length || batchPayload.assessments.length) {
                const response = await fetch(`${API_BASE_URL}/batch-sync`, { 
                    method: "POST", 
                    headers: getAuthHeaders(), 
                    body: JSON.stringify(batchPayload) 
                });

                if (response.ok) {
                    for (const key of keysToDelete) {
                        await syncQueueDB.removeItem(key);
                    }
                    console.log(`[Sync] Batch synced items successfully.`);
                }
            } else {
                for (const key of keysToDelete) await syncQueueDB.removeItem(key);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error("[Sync] Error processing sync queue:", err);
        } finally {
            notifySyncEnd();
        }
    }
};

export const syncDownFromServer = async () => {
    notifySyncStart();
    try {
        const headers = getAuthHeaders();
        if (!headers.Authorization) return;

        const progRes = await fetch(`${API_BASE_URL}/get-progress`, { headers });
        if (progRes.ok) {
            const data = await progRes.json();
            const progressList = data.progress || data;
            if (Array.isArray(progressList)) {
                for (const item of progressList) {
                    const normalized = item.data ? { ...item, ...item.data } : item;
                    await progressDB.setItem(normalized.key || normalized.lesson_id, normalized);
                }
            } else if (typeof progressList === 'object' && progressList !== null) {
                for (const [key, val] of Object.entries(progressList)) {
                    const normalized = typeof val === 'object' && val !== null ? (val.data ? { ...val, ...val.data } : val) : { score: val };
                    await progressDB.setItem(key, normalized);
                }
            }
        }

        const assRes = await fetch(`${API_BASE_URL}/get-assessments`, { headers });
        if (assRes.ok) {
            const data = await assRes.json();
            const assessmentList = data.assessments || data;
            if (Array.isArray(assessmentList)) {
                for (const item of assessmentList) {
                    const normalized = item.data ? { ...item, ...item.data } : item;
                    await assessmentsDB.setItem(normalized.key || normalized.assessment_key, normalized);
                }
            } else if (typeof assessmentList === 'object' && assessmentList !== null) {
                for (const [key, val] of Object.entries(assessmentList)) {
                    const normalized = typeof val === 'object' && val !== null ? (val.data ? { ...val, ...val.data } : val) : val;
                    await assessmentsDB.setItem(key, normalized);
                }
            }
        }

        const subRes = await fetch(`${API_BASE_URL}/get-all-submissions`, { headers });
        if (subRes.ok) {
            const data = await subRes.json();
            const submissionsList = data.submissions || data;
            if (Array.isArray(submissionsList)) {
                for (const item of submissionsList) {
                    const normalized = item.data ? { ...item, ...item.data } : item;
                    if (normalized.activityId) {
                        await submissionsDB.setItem(normalized.activityId, normalized);
                        if (normalized.userId && normalized.moduleId) {
                            await submissionsDB.setItem(`${normalized.userId}_${normalized.moduleId}_${normalized.activityId}`, normalized);
                        }
                    }
                }
            }
        }
        window.dispatchEvent(new Event("localDataSynced"));
    } catch (error) { 
        if (error.name === 'AbortError') return;
        console.error("[Sync] Error pulling from server:", error);
    } finally {
        notifySyncEnd();
    }
};

let syncInterval = null;

export const stopBackgroundSync = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
};

export const startBackgroundSync = () => {
    syncDownFromServer();
    syncManager.processSyncQueue();
    
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(() => { syncManager.processSyncQueue(); }, 30000);
};

window.addEventListener("online", () => syncManager.processSyncQueue());