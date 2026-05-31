import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ==========================================
// BACKGROUND SYNC MANAGER
// ==========================================
export const startBackgroundSync = async () => {
  if (!navigator.onLine) return;

  // Security & Bug Fix: Fallback to sessionStorage if the user did not check 'Stay signed in'
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
  const headers = { "Content-Type": "application/json" };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  await syncQueueDB.iterate(async (task, id) => {
    try {
      let endpoint = '';
      let method = task.action === 'DELETE' ? 'DELETE' : 'POST';
      let targetId = task.data._id || task.data.id;

      if (task.type === 'TEMPLATE') endpoint = '/api/templates';
      else if (task.type === 'PROJECT') endpoint = '/api/projects';
      else if (task.type === 'SUBMISSION') endpoint = '/api/sync-submission'; 
      else if (task.type === 'PROGRESS') endpoint = '/api/update-progress';
      else if (task.type === 'ASSESSMENT') endpoint = '/api/update-assessment';

      const url = (method === 'POST' || ['SUBMISSION', 'PROGRESS', 'ASSESSMENT'].includes(task.type)) 
          ? `${API_BASE}${endpoint}` 
          : `${API_BASE}${endpoint}/${targetId}`;

      const response = await fetch(url, {
        method,
        headers, 
        body: method === 'DELETE' ? null : JSON.stringify(task.data),
      });

      if (response.ok) {
        await syncQueueDB.removeItem(id);
      }
    } catch (err) {
      console.warn("Background sync failed for item:", id, err);
    }
  });
};

window.addEventListener('online', startBackgroundSync);
setInterval(startBackgroundSync, 30000); 
startBackgroundSync(); 


// ==========================================
// FETCH CLOUD DATA (On Login / App Load)
// ==========================================
export const fetchCloudData = async (userEmail) => {
  if (!navigator.onLine || !userEmail) return;

  // Security & Bug Fix: Fallback to sessionStorage if the user did not check 'Stay signed in'
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
  const headers = { "Content-Type": "application/json" };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    // 1. Fetch Projects from cloud
    const projRes = await fetch(`${API_BASE}/api/projects?userId=${encodeURIComponent(userEmail)}`, { headers }); 
    if (projRes.ok) {
      const data = await projRes.json();
      const projects = data.projects || data; 
      if (Array.isArray(projects)) {
        for (const p of projects) {
          if (p.userId === userEmail || p.owner_id === userEmail) { 
            await projectsDB.setItem(p._id, { ...p, synced: true });
          }
        }
      }
    }

    // 2. Fetch Templates from cloud
    const tempRes = await fetch(`${API_BASE}/api/templates`, { headers });
    if (tempRes.ok) {
      const templates = await tempRes.json();
      for (const t of templates) {
        if (t.owner_id === userEmail) {
          await templatesDB.setItem(t._id, { ...t, synced: true });
        }
      }
    }

    // Load Local User state safely
    const localUserStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    const localUser = JSON.parse(localUserStr || "{}");
    let updated = false;

    // 3. Fetch Progress
    try {
        const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers }); 
        if (progRes.ok) {
            const data = await progRes.json();
            const progressDataRaw = data.progress || data;
            
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
    } catch (e) { console.warn("Could not sync progress", e); }

    // 4. Fetch Assessments
    try {
        const assRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
        if (assRes.ok) {
            const data = await assRes.json();
            const assDataRaw = data.assessments || data;

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
    } catch (e) { console.warn("Could not sync assessments", e); }

    // 5. Fetch ALL Submissions (Fix for missing Python code)
    try {
        const subRes = await fetch(`${API_BASE}/api/get-all-submissions?email=${encodeURIComponent(userEmail)}`, { headers });
        if (subRes.ok) {
            const data = await subRes.json();
            const submissionsRaw = data.submissions || data;
            
            if (Array.isArray(submissionsRaw)) {
                for (const sub of submissionsRaw) {
                    const key = sub.activityId || sub._id;
                    if (key) {
                        await submissionsDB.setItem(key, { ...sub, isSynced: true });
                    }
                }
            }
        }
    } catch (e) { console.warn("Could not sync submissions", e); }

    // Save state back to whatever storage mechanism is currently active
    if (updated) {
        if (localStorage.getItem("user")) {
            localStorage.setItem("user", JSON.stringify(localUser));
        } else {
            sessionStorage.setItem("user", JSON.stringify(localUser));
        }
    }

  } catch (error) {
    console.error("Failed to fetch cloud data:", error);
  }
};