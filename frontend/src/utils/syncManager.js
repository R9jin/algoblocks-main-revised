// frontend/src/utils/syncManager.js
import { db } from "../db";

// 1. PULL FROM CLOUD (Used when a user logs in)
export const pullProjectsFromCloud = async (userEmail) => {
  if (!navigator.onLine) return; // Cannot pull if offline

  try {
    const response = await fetch("/api/projects");
    if (response.ok) {
      const data = await response.json();
      
      // Filter only this user's projects
      const cloudProjects = data.projects.filter(p => p.owner_id === userEmail);
      
      // Save them all to local IndexedDB
      for (const proj of cloudProjects) {
        await db.projects.put({
          ...proj,
          isSynced: 1 // Mark as synced since it came from the cloud
        });
      }
    }
  } catch (error) {
    console.error("Failed to pull projects from cloud:", error);
  }
};

// 2. PUSH TO CLOUD (Used to sync offline changes back to MongoDB)
export const pushOfflineChangesToCloud = async () => {
  if (!navigator.onLine) return; 

  // Find all projects that were saved locally while offline
  const unsyncedProjects = await db.projects.where("isSynced").equals(0).toArray();

  for (const project of unsyncedProjects) {
    try {
      const response = await fetch("/api/projects/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });

      if (response.ok) {
        const cloudData = await response.json();
        // Update the local record to show it is now synced, and attach the MongoDB _id
        await db.projects.update(project.id, { 
          isSynced: 1,
          _id: cloudData.insertedId || project._id
        });
      }
    } catch (err) {
      console.error("Sync failed for project:", project.title);
    }
  }
};