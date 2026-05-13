// frontend/src/utils/syncManager.js
import { projectsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE = import.meta.env.VITE_API_URL || "";

export const startBackgroundSync = () => {
  // Check every 30 seconds or when the browser comes back online
  const sync = async () => {
    if (!navigator.onLine) return;

    await syncQueueDB.iterate(async (task, id) => {
      try {
        const endpoint = task.type === 'TEMPLATE' ? '/api/templates' : '/api/projects';
        const method = task.action === 'DELETE' ? 'DELETE' : (task.data._id.startsWith('local_') ? 'POST' : 'PUT');
        
        // FIX: Extract the actual _id from the task payload, not the IndexedDB key
        const targetId = task.data._id;
        const url = method === 'POST' ? `${API_BASE}${endpoint}` : `${API_BASE}${endpoint}/${targetId}`;

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === 'DELETE' ? null : JSON.stringify(task.data),
        });

        if (response.ok) {
          const result = await response.json();
          // If it was a new item, update the local ID from "local_..." to the MongoDB ObjectId
          if (method === 'POST' && result.id) {
            const db = task.type === 'TEMPLATE' ? templatesDB : projectsDB;
            const item = await db.getItem(id);
            await db.removeItem(id);
            await db.setItem(result.id, { ...item, _id: result.id, synced: true });
          }
          // Remove from queue after successful sync
          await syncQueueDB.removeItem(id);
        }
      } catch (err) {
        console.warn("Background sync failed for item:", id, err);
      }
    });
  };

  window.addEventListener('online', sync);
  setInterval(sync, 30000); // Poll every 30s
  sync(); // Run immediately on start
};

export const fetchCloudData = async (userEmail) => {
  if (!navigator.onLine) return;

  try {
    // 1. Fetch Projects from cloud
    const projRes = await fetch(`${API_BASE}/api/projects`);
    if (projRes.ok) {
      const projects = await projRes.json();
      // Populate local DB with cloud projects
      for (const p of projects) {
        // Assuming your backend returns owner_id. Filter by user.
        if (p.owner_id === userEmail) { 
          await projectsDB.setItem(p._id, { ...p, synced: true });
        }
      }
    }

    // 2. Fetch Templates from cloud
    const tempRes = await fetch(`${API_BASE}/api/templates`);
    if (tempRes.ok) {
      const templates = await tempRes.json();
      // Populate local DB with cloud templates
      for (const t of templates) {
        if (t.owner_id === userEmail) {
          await templatesDB.setItem(t._id, { ...t, synced: true });
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch cloud data:", error);
  }
};