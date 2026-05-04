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