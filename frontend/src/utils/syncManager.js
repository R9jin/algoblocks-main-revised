import { db } from "../db";

export const syncLocalToCloud = async () => {
  if (!navigator.onLine) return; // Only sync if online

  const unsynced = await db.projects.where("is_synced").equals(0).toArray();

  for (const project of unsynced) {
    try {
      const response = await fetch("/api/projects/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });

      if (response.ok) {
        // Mark as synced in IndexedDB so we don't upload it again
        await db.projects.update(project.id, { is_synced: 1 });
      }
    } catch (error) {
      console.error("Sync failed for project:", project.title);
    }
  }
};