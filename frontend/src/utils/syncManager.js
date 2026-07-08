// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, '') + "/api";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
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
            if (unsyncedProgress.length > 0 || unsyncedAssessments.length > 0 || unsyncedSubmissions.length > 0) {
                const batchPayload = {
                    progress: unsyncedProgress,
                    assessments: unsyncedAssessments,
                    submissions: unsyncedSubmissions
                };

                const batchRes = await fetch(`${API_BASE_URL}/batch-sync`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(batchPayload)
                });

                if (batchRes.ok) {
                    // Mark as synced locally
                    for (const p of unsyncedProgress) {
                        await progressDB.save({ ...p, isSynced: true });
                    }
                    for (const a of unsyncedAssessments) {
                        await assessmentsDB.save({ ...a, isSynced: true });
                    }
                    for (const s of unsyncedSubmissions) {
                        await submissionsDB.save({ ...s, isSynced: true });
                    }
                }
            }

            // 3. Sync Individual Projects
            for (const project of unsyncedProjects) {
                try {
                    const res = await fetch(`${API_BASE_URL}/projects/save`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(project)
                    });
                    if (res.ok) {
                        await projectsDB.save({ ...project, isSynced: true });
                    }
                } catch (e) {
                    console.error(`Failed to sync project ${project.projectId}`, e);
                }
            }

            // 4. Sync Individual Templates
            for (const template of unsyncedTemplates) {
                try {
                    const res = await fetch(`${API_BASE_URL}/templates/save`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(template)
                    });
                    if (res.ok) {
                        await templatesDB.save({ ...template, isSynced: true });
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
                        const res = await fetch(`${API_BASE_URL}/projects/delete`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({ projectId: task.payload.projectId })
                        });
                        if (res.ok) {
                            await syncQueueDB.remove(task.id);
                        }
                    } else if (task.action === "DELETE_TEMPLATE") {
                        const res = await fetch(`${API_BASE_URL}/templates/delete`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({ templateId: task.payload.templateId })
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
            const res = await fetch(`${API_BASE_URL}/projects/delete`, {
                method: "POST",
                headers,
                body: JSON.stringify({ projectId })
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
            const res = await fetch(`${API_BASE_URL}/templates/delete`, {
                method: "POST",
                headers,
                body: JSON.stringify({ templateId })
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
                if (projData.projects) {
                    for (const remoteProj of projData.projects) {
                        const localProj = await projectsDB.get(remoteProj.projectId);
                        if (!localProj || localProj.isSynced || (localProj.timestamp || 0) < (remoteProj.timestamp || 0)) {
                            await projectsDB.save({ ...remoteProj, isSynced: true });
                        }
                    }
                }
            }
            
            // Pull Templates
            const tplRes = await fetch(`${API_BASE_URL}/templates`, { headers });
            if (tplRes.ok) {
                const tplData = await tplRes.json();
                if (tplData.templates) {
                    for (const remoteTpl of tplData.templates) {
                        const localTpl = await templatesDB.get(remoteTpl.templateId);
                        if (!localTpl || localTpl.isSynced || (localTpl.timestamp || 0) < (remoteTpl.timestamp || 0)) {
                            await templatesDB.save({ ...remoteTpl, isSynced: true });
                        }
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

// Automatically sync when coming back online
window.addEventListener('online', () => {
    SyncManager.syncDataWithServer();
});