// frontend/src/utils/syncManager.js
import { db } from "../db";

export const syncProjectsToCloud = async () => {
  if (!navigator.onLine) return; // Silent return if offline

  const unsynced = await db.projects.where("isSynced").equals(0).toArray();

  for (const project of unsynced) {
    try {
      const response = await fetch("/api/projects/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });

      if (response.ok) {
        const { cloudId } = await response.json();
        // Update local record with the MongoDB _id and mark as synced
        await db.projects.update(project.id, { _id: cloudId, isSynced: 1 });
      }
    } catch (err) {
      console.error("Sync failed for:", project.title, err);
    }
  }
};