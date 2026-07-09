// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, '') + "/api";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!token) return null;
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

export const SyncManager = {
    /**
     * Executes the main batch sync sequence pushing local changes to Postgres Neon
     */
    async syncDataWithServer() {
        if (!navigator.onLine) {
            console.log("Offline: Skipping background sync.");
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return; // User not logged in, ignore sync

        try {
            // 1. Gather all unsynced data from IndexedDB
            const allProgress = await progressDB.getAll();
            const unsyncedProgress = allProgress.filter(p => !p.isSynced);

            const allAssessments = await assessmentsDB.getAll();
            const unsyncedAssessments = allAssessments.filter(a => !a.isSynced);

            const allSubmissions = await submissionsDB.getAll();
            const unsyncedSubmissions = allSubmissions.filter(s => !s.isSynced);

            const allProjects = await projectsDB.getAll();
            const unsyncedProjects = allProjects.filter(p => !p.isSynced);

            const allTemplates = await templatesDB.getAll();
            const unsyncedTemplates = allTemplates.filter(t => !t.isSynced);

            // 2. Batch Sync Core Metrics (Progress, Assessments, Submissions) to Postgres JSONB
            // The API endpoints are tailored for standard single-item updates, so we sync them individually here
            for (const p of unsyncedProgress) {
                try {
                    const res = await fetch(`${API_BASE_URL}/update-progress`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(p)
                    });
                    if (res.ok) await progressDB.save({ ...p, isSynced: true });
                } catch (e) {
                    console.error("Failed to sync progress", e);
                }
            }

            for (const a of unsyncedAssessments) {
                try {
                    const res = await fetch(`${API_BASE_URL}/update-assessment`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(a)
                    });
                    if (res.ok) await assessmentsDB.save({ ...a, isSynced: true });
                } catch (e) {
                    console.error("Failed to sync assessment", e);
                }
            }

            for (const s of unsyncedSubmissions) {
                try {
                    const res = await fetch(`${API_BASE_URL}/sync-submission`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(s)
                    });
                    if (res.ok) await submissionsDB.save({ ...s, isSynced: true });
                } catch (e) {
                    console.error("Failed to sync submission", e);
                }
            }

            // 3. Sync Individual Projects
            for (const project of unsyncedProjects) {
                try {
                    const apiPayload = { ...project };
                    // Prevent Postgres 500 error by stripping local string IDs
                    if (String(apiPayload.projectId || apiPayload._id).startsWith("local_")) {
                        apiPayload.projectId = null;
                    }
                    
                    const res = await fetch(`${API_BASE_URL}/projects`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(apiPayload)
                    });
                    
                    if (res.ok) {
                        const responseData = await res.json().catch(() => ({}));
                        const realId = responseData.projectId || responseData._id || project.projectId || project._id;
                        
                        // If the backend generated a new numeric ID, swap it out locally
                        if (String(realId) !== String(project.projectId || project._id)) {
                            await projectsDB.delete(project.projectId || project._id);
                            await projectsDB.save({ ...project, projectId: realId, _id: realId, isSynced: true });
                        } else {
                            await projectsDB.save({ ...project, isSynced: true });
                        }
                    }
                } catch (e) {
                    console.error(`Failed to sync project ${project.projectId}`, e);
                }
            }

            // 4. Sync Individual Templates
            for (const template of unsyncedTemplates) {
                try {
                    const apiPayload = { ...template };
                    // Prevent Postgres 500 error by stripping local string IDs
                    if (String(apiPayload.templateId || apiPayload._id).startsWith("local_")) {
                        apiPayload.templateId = null;
                        apiPayload.projectId = null; 
                    }
                    
                    const res = await fetch(`${API_BASE_URL}/templates`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(apiPayload)
                    });
                    
                    if (res.ok) {
                        const responseData = await res.json().catch(() => ({}));
                        const realId = responseData.templateId || responseData._id || template.templateId || template._id;
                        
                        if (String(realId) !== String(template.templateId || template._id)) {
                            await templatesDB.delete(template.templateId || template._id);
                            await templatesDB.save({ ...template, templateId: realId, _id: realId, isSynced: true });
                        } else {
                            await templatesDB.save({ ...template, isSynced: true });
                        }
                    }
                } catch (e) {
                    console.error(`Failed to sync template ${template.templateId}`, e);
                }
            }

            // 5. Process Offline Action Queue (e.g. Project or Template Deletions)
            const queue = await syncQueueDB.getAll();
            for (const task of queue) {
                try {
                    if (task.action === "DELETE_PROJECT") {
                        const res = await fetch(`${API_BASE_URL}/projects/${task.payload.projectId}`, {
                            method: "DELETE",
                            headers
                        });
                        if (res.ok) {
                            await syncQueueDB.remove(task.id);
                        }
                    } else if (task.action === "DELETE_TEMPLATE") {
                        const res = await fetch(`${API_BASE_URL}/templates/${task.payload.templateId}`, {
                            method: "DELETE",
                            headers
                        });
                        if (res.ok) {
                            await syncQueueDB.remove(task.id);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to execute queued action: ${task.action}`, e);
                }
            }

        } catch (error) {
            console.error("Critical error during sync manager execution:", error);
        }
    },

    /**
     * Queues a project deletion to ensure it reaches Postgres when online
     */
    async queueProjectDeletion(projectId) {
        await projectsDB.delete(projectId);
        
        if (!navigator.onLine) {
            await syncQueueDB.add("DELETE_PROJECT", { projectId });
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            const res = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error("Failed to delete remotely");
        } catch (e) {
            await syncQueueDB.add("DELETE_PROJECT", { projectId });
        }
    },

    /**
     * Queues a template deletion to ensure it reaches Postgres when online
     */
    async queueTemplateDeletion(templateId) {
        if(templatesDB.delete) {
            await templatesDB.delete(templateId);
        }
        
        if (!navigator.onLine) {
            await syncQueueDB.add("DELETE_TEMPLATE", { templateId });
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            const res = await fetch(`${API_BASE_URL}/templates/${templateId}`, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error("Failed to delete remotely");
        } catch (e) {
            await syncQueueDB.add("DELETE_TEMPLATE", { templateId });
        }
    },

    /**
     * Forces an immediate pull of the latest relational state from Postgres 
     * and updates the local IndexedDB stores.
     */
    async pullRemoteState() {
        if (!navigator.onLine) return;
        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            // Pull Progress
            const userRes = await fetch(`${API_BASE_URL}/get-progress`, { headers });
            if (userRes.ok) {
                const data = await userRes.json();
                if (data.progress) {
                    for (const [lesson_id, score] of Object.entries(data.progress)) {
                        await progressDB.save({ lesson_id, score, isSynced: true });
                    }
                }
            }

            // Pull Assessments
            const assessmentRes = await fetch(`${API_BASE_URL}/get-assessments`, { headers });
            if (assessmentRes.ok) {
                const data = await assessmentRes.json();
                if (data.assessments) {
                    for (const [assessmentId, details] of Object.entries(data.assessments)) {
                        await assessmentsDB.save({ assessmentId, ...details, isSynced: true });
                    }
                }
            }

            // Pull Submissions
            const submissionsRes = await fetch(`${API_BASE_URL}/get-all-submissions`, { headers });
            if (submissionsRes.ok) {
                const subData = await submissionsRes.json();
                if (subData.submissions) {
                    for (const sub of subData.submissions) {
                        const localSub = await submissionsDB.get(sub.activityId);
                        if (!localSub || localSub.isSynced || (localSub.timestamp || 0) < (sub.timestamp || 0)) {
                            await submissionsDB.save({ ...sub, isSynced: true });
                        }
                    }
                }
            }

            // Pull Projects
            const projRes = await fetch(`${API_BASE_URL}/projects`, { headers });
            if (projRes.ok) {
                const projData = await projRes.json();
                const items = Array.isArray(projData) ? projData : projData.projects || [];
                for (const remoteProj of items) {
                    const localProj = await projectsDB.get(remoteProj.projectId);
                    if (!localProj || localProj.isSynced || (localProj.timestamp || 0) < (remoteProj.timestamp || 0)) {
                        await projectsDB.save({ ...remoteProj, isSynced: true });
                    }
                }
            }
            
            // Pull Templates
            const tplRes = await fetch(`${API_BASE_URL}/templates`, { headers });
            if (tplRes.ok) {
                const tplData = await tplRes.json();
                const items = Array.isArray(tplData) ? tplData : tplData.templates || [];
                for (const remoteTpl of items) {
                    const localTpl = await templatesDB.get(remoteTpl.templateId);
                    if (!localTpl || localTpl.isSynced || (localTpl.timestamp || 0) < (remoteTpl.timestamp || 0)) {
                        await templatesDB.save({ ...remoteTpl, isSynced: true });
                    }
                }
            }
        } catch (error) {
            console.error("Failed to pull remote Postgres state:", error);
        }
    }
};

// ==========================================
// Periodic Background Syncing Exports
// ==========================================

let syncIntervalId = null;

export const startBackgroundSync = (intervalMs = 30000) => {
    if (syncIntervalId) clearInterval(syncIntervalId);
    
    // Initial sync on start
    SyncManager.syncDataWithServer();
    SyncManager.pullRemoteState();
    
    // Set interval for periodic syncing
    syncIntervalId = setInterval(() => {
        SyncManager.syncDataWithServer();
    }, intervalMs);
};

export const stopBackgroundSync = () => {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
};

// ==========================================
// Compatibility exports
// ==========================================
// Several pages (DashboardHeader, Projects, MainApp, LearningPath) import a
// lower-cased `syncManager` object with a `processSyncQueue()` method, and a
// standalone `syncDownFromServer()` function. These names were used across
// the app but never actually defined here after the Postgres migration,
// which broke the module graph (any page importing them failed to load,
// producing a blank screen). Re-export the real implementation under those
// names so every caller resolves correctly.
export const syncManager = {
    ...SyncManager,
    // Pushes any unsynced local data (including the offline action queue)
    // up to the Postgres backend.
    processSyncQueue: () => SyncManager.syncDataWithServer(),
};

// Pulls the latest server-side state down into local IndexedDB.
export const syncDownFromServer = () => SyncManager.pullRemoteState();

// Automatically sync when coming back online
window.addEventListener('online', () => {
    SyncManager.syncDataWithServer();
    SyncManager.pullRemoteState();
});