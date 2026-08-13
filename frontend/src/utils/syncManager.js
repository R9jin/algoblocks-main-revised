// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, '') + "/api";

// Tracks the last onboarding_state payload actually pushed to Postgres, so
// syncDataWithServer() can skip the POST when nothing changed (see step 5
// below). Module-level by design: it should persist across sync cycles for
// the lifetime of the tab, not reset per-call.
let lastPushedOnboardingState = null;

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
                    } else if (res.status === 403) {
                        // Permanent rejection (account is at the project cap), not a
                        // connectivity problem -- retrying on the next 30s tick would
                        // just get 403 forever while this phantom "unsynced" project
                        // keeps showing up in the local project list as if it were
                        // real. Drop the local copy and tell the UI so it can surface
                        // this to the person instead of silently failing forever.
                        await projectsDB.delete(project.projectId || project._id);
                        let limitMessage = "A locally saved project could not be synced: project limit reached.";
                        try {
                            const errData = await res.json();
                            if (errData?.detail) limitMessage = errData.detail;
                        } catch (e) {}
                        window.dispatchEvent(new CustomEvent("syncLimitReached", { detail: { kind: "project", message: limitMessage } }));
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
                    } else if (res.status === 403) {
                        // A 403 can mean the account hit the template cap, but it can also be a
                        // permission rejection when attempting to update an existing templateId.
                        // Only treat it as a limit error when the backend detail indicates that.
                        let errDetail = "";
                        try {
                            const errData = await res.json();
                            errDetail = errData?.detail || "";
                        } catch (e) {}

                        if (/limit reached/i.test(errDetail)) {
                            await templatesDB.delete(template.templateId || template._id);
                            const limitMessage = errDetail || "A locally saved template could not be synced: template limit reached.";
                            window.dispatchEvent(new CustomEvent("syncLimitReached", { detail: { kind: "template", message: limitMessage } }));
                        } else {
                            console.error("Template sync rejected (403):", errDetail || "(no detail)");
                        }
                    }
                } catch (e) {
                    console.error(`Failed to sync template ${template.templateId}`, e);
                }
            }

            // 5. Push onboarding tour completion state (guards against the
            // OnboardingContext's own POST never firing in this tab/session,
            // e.g. a stale tab that never re-mounted the provider).
            //
            // COST NOTE: this used to fire an unconditional POST every single
            // sync cycle (every 30s, for every open authenticated tab) even
            // when onboarding_state hadn't changed since the last push --
            // pure ambient cost with zero benefit. Compare against what was
            // last successfully pushed and skip the request when nothing
            // changed; the "stale tab" guard this exists for is still
            // covered the moment onboarding_state actually differs.
            try {
                const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
                if (storedUser && storedUser !== "null" && storedUser !== "undefined") {
                    const parsedUser = JSON.parse(storedUser);
                    if (parsedUser?.onboarding_state) {
                        const serializedOnboarding = JSON.stringify(parsedUser.onboarding_state);
                        if (serializedOnboarding !== lastPushedOnboardingState) {
                            await fetch(`${API_BASE_URL}/update-onboarding`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({ onboarding_state: parsedUser.onboarding_state })
                            });
                            lastPushedOnboardingState = serializedOnboarding;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to sync onboarding state", e);
            }

            // 6. Process Offline Action Queue (e.g. Project or Template Deletions)
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
            // Pull Onboarding Tour Progress
            const onboardingRes = await fetch(`${API_BASE_URL}/get-onboarding`, { headers });
            if (onboardingRes.ok) {
                const onboardingData = await onboardingRes.json();
                if (onboardingData.onboarding_state) {
                    const activeStorage = localStorage.getItem("user") ? localStorage : sessionStorage;
                    const storedUser = activeStorage.getItem("user");
                    if (storedUser && storedUser !== "null" && storedUser !== "undefined") {
                        try {
                            const parsedUser = JSON.parse(storedUser);
                            activeStorage.setItem("user", JSON.stringify({
                                ...parsedUser,
                                onboarding_state: onboardingData.onboarding_state,
                            }));
                            // OnboardingContext listens for this event and re-merges
                            // the freshly pulled server state with its local cache,
                            // which is what actually suppresses a tour on this
                            // device once another device has completed it.
                            window.dispatchEvent(new Event("localDataSynced"));
                        } catch (e) {
                            console.error("Failed to apply pulled onboarding state", e);
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
let lastPullTimestamp = 0;

// Minimum time between pullRemoteState() calls, independent of the push
// interval. pullRemoteState() always fires 6 GET requests (progress,
// assessments, submissions, projects, templates, onboarding) no matter
// whether anything actually changed remotely -- it exists to catch
// cross-device edits, which are comparatively rare. syncDataWithServer()
// (the push side) is already cheap on its own: it loops over locally
// unsynced records, so it makes zero network calls when there's nothing
// to push. Throttling the pull side separately, on a longer cadence,
// keeps cross-device sync working while cutting the dominant source of
// ambient serverless invocations (and Neon compute wake-ups) per open tab.
const PULL_MIN_INTERVAL_MS = 120000; // 2 minutes

const maybePullRemoteState = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPullTimestamp < PULL_MIN_INTERVAL_MS) return;
    lastPullTimestamp = now;
    SyncManager.pullRemoteState();
};

export const startBackgroundSync = (intervalMs = 30000) => {
    if (syncIntervalId) clearInterval(syncIntervalId);

    // Initial sync + pull on start, always forced so the user sees fresh
    // state right after login/reload rather than waiting for the throttle.
    SyncManager.syncDataWithServer();
    maybePullRemoteState(true);

    // Set interval for periodic syncing
    syncIntervalId = setInterval(() => {
        // Skip the whole cycle while the tab is in the background. Students
        // routinely leave AlgoBlocks open in an inactive tab; there's
        // nothing to push/pull that anyone is looking at, so there's no
        // reason to keep hitting the API (and keeping Neon's compute
        // awake) for it. Sync resumes automatically via the
        // visibilitychange listener below the moment the tab is focused
        // again.
        if (document.hidden) return;

        SyncManager.syncDataWithServer(); // no-op network-wise when nothing's unsynced
        maybePullRemoteState();           // throttled independently, see above
    }, intervalMs);
};

export const stopBackgroundSync = () => {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
};

// Catch up immediately when a backgrounded tab regains focus, instead of
// waiting out the rest of the poll interval -- keeps the UX snappy while
// still respecting PULL_MIN_INTERVAL_MS so rapid tab-switching can't be
// used to bypass the throttle.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && syncIntervalId) {
        SyncManager.syncDataWithServer();
        maybePullRemoteState();
    }
});

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