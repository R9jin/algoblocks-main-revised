// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ==========================================
// BACKGROUND SYNC MANAGER
// ==========================================
export const startBackgroundSync = async () => {
  if (!navigator.onLine) return;

  await syncQueueDB.iterate(async (task, id) => {
    try {
      let endpoint = '';
      let method = task.action === 'DELETE' ? 'DELETE' : 'POST';
      let targetId = task.data._id || task.data.id;

      // Route to the correct endpoint based on task type
      if (task.type === 'TEMPLATE') endpoint = '/api/templates';
      else if (task.type === 'PROJECT') endpoint = '/api/projects';
      else if (task.type === 'SUBMISSION') endpoint = '/api/update-progress'; // FIX APPLIED HERE
      else if (task.type === 'PROGRESS') endpoint = '/api/update-progress';
      else if (task.type === 'ASSESSMENT') endpoint = '/api/update-assessment';

      const url = (method === 'POST' || ['SUBMISSION', 'PROGRESS', 'ASSESSMENT'].includes(task.type)) 
          ? `${API_BASE}${endpoint}` 
          : `${API_BASE}${endpoint}/${targetId}`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === 'DELETE' ? null : JSON.stringify(task.data),
      });

      if (response.ok) {
        const result = await response.json();
        
        // If it was a new project/template, update the local ID from "local_..." to the MongoDB ObjectId
        if (method === 'POST' && result.id && (task.type === 'TEMPLATE' || task.type === 'PROJECT')) {
          const db = task.type === 'TEMPLATE' ? templatesDB : projectsDB;
          const item = await db.getItem(id);
          if (item) {
              await db.removeItem(id);
              await db.setItem(result.id, { ...item, _id: result.id, synced: true });
          }
        }

        if (task.type === 'SUBMISSION') {
            const submissionId = id.replace('sync_', '');
            const sub = await submissionsDB.getItem(submissionId);
            if (sub) await submissionsDB.setItem(submissionId, { ...sub, isSynced: true });
        }

        if (task.type === 'PROGRESS') {
            // Supports both the new draft format and the old lesson_id format
            const progId = task.data.activityId 
                ? `draft_${task.data.userId}_${task.data.moduleId}_${task.data.activityId}`
                : task.data.lesson_id;
            
            if (progId) {
                const prog = await progressDB.getItem(progId);
                if (prog) await progressDB.setItem(progId, { ...prog, isSynced: true });
            }
        }

        if (task.type === 'ASSESSMENT') {
            const assKey = task.data.assessment_key;
            const ass = await assessmentsDB.getItem(assKey);
            if (ass) await assessmentsDB.setItem(assKey, { ...ass, isSynced: true });
        }

        // Remove from queue after successful sync
        await syncQueueDB.removeItem(id);
      }
    } catch (err) {
      console.warn("Background sync failed for item:", id, err);
    }
  });
};

// Listen for connection return to auto-trigger sync immediately
window.addEventListener('online', startBackgroundSync);

// Poll every 30s as a fallback
setInterval(startBackgroundSync, 30000); 
startBackgroundSync(); // Run immediately on start


// ==========================================
// FETCH CLOUD DATA (On Login / App Load)
// ==========================================
export const fetchCloudData = async (userEmail) => {
  if (!navigator.onLine || !userEmail) return;

  try {
    // 1. Fetch Projects from cloud
    const projRes = await fetch(`${API_BASE}/api/projects`);
    if (projRes.ok) {
      const projects = await projRes.json();
      for (const p of projects) {
        if (p.owner_id === userEmail) { 
          await projectsDB.setItem(p._id, { ...p, synced: true });
        }
      }
    }

    // 2. Fetch Templates from cloud
    const tempRes = await fetch(`${API_BASE}/api/templates`);
    if (tempRes.ok) {
      const templates = await tempRes.json();
      for (const t of templates) {
        if (t.owner_id === userEmail) {
          await templatesDB.setItem(t._id, { ...t, synced: true });
        }
      }
    }

    // 3. Fetch User Progress and Assessments
    const localUser = JSON.parse(localStorage.getItem("user") || "{}");
    let updated = false;

    try {
        const progRes = await fetch(`${API_BASE}/api/get-progress?email=${userEmail}`);
        if (progRes.ok) {
            const data = await progRes.json();
            const progressDataRaw = data.progress || data;
            
            // Normalize Array to Object Mapping
            let normalizedProg = {};
            if (Array.isArray(progressDataRaw)) {
                progressDataRaw.forEach(item => {
                    const k = item.lesson_id || item.key;
                    if (k) normalizedProg[k] = item.score !== undefined ? item.score : (item.data?.score ?? 1);
                });
            } else if (typeof progressDataRaw === 'object' && progressDataRaw !== null) {
                normalizedProg = progressDataRaw;
            }

            for (const [key, val] of Object.entries(normalizedProg)) {
                if (typeof key === 'string' && isNaN(Number(key))) {
                    await progressDB.setItem(key, { score: val, isSynced: true });
                }
            }
            localUser.progress = { ...localUser.progress, ...normalizedProg };
            updated = true;
        }
    } catch (e) { console.warn("Could not sync progress"); }

    try {
        const assRes = await fetch(`${API_BASE}/api/get-assessments?email=${userEmail}`);
        if (assRes.ok) {
            const data = await assRes.json();
            const assDataRaw = data.assessments || data;

            // Normalize Array to Object Mapping
            let normalizedAssm = {};
            if (Array.isArray(assDataRaw)) {
                assDataRaw.forEach(item => {
                    const k = item.assessment_key || item.key;
                    if (k) normalizedAssm[k] = item.data || item;
                });
            } else if (typeof assDataRaw === 'object' && assDataRaw !== null) {
                normalizedAssm = assDataRaw;
            }

            for (const [key, val] of Object.entries(normalizedAssm)) {
                if (typeof key === 'string' && isNaN(Number(key))) {
                    await assessmentsDB.setItem(key, { ...val, isSynced: true });
                }
            }
            localUser.assessments = { ...localUser.assessments, ...normalizedAssm };
            updated = true;
        }
    } catch (e) { console.warn("Could not sync assessments"); }

    if (updated) {
        localStorage.setItem("user", JSON.stringify(localUser));
    }

  } catch (error) {
    console.error("Failed to fetch cloud data:", error);
  }
};