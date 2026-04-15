// frontend/src/utils/syncManager.js
// Change this import to match what is actually exported in db.js
import { projectsDB } from "../db";

export const pullProjectsFromCloud = async (userEmail) => {
  if (!navigator.onLine) return;

  try {
    const response = await fetch("/api/projects");
    if (response.ok) {
      const data = await response.json();
      const cloudProjects = data.projects.filter(p => p.owner_id === userEmail);
      
      for (const proj of cloudProjects) {
        // Use localForage syntax (setItem) instead of Dexie syntax (put)
        await projectsDB.setItem(proj._id, {
          ...proj,
          isSynced: 1 
        });
      }
    }
  } catch (error) {
    console.error("Failed to pull projects from cloud:", error);
  }
};

export const pushOfflineChangesToCloud = async () => {
  if (!navigator.onLine) return; 

  // localForage does not support .where() queries like Dexie.
  // You must iterate through the projects to find unsynced ones.
  await projectsDB.iterate(async (project, id) => {
    if (project.isSynced === 0) {
      try {
        const response = await fetch("/api/projects/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project),
        });

        if (response.ok) {
          const cloudData = await response.json();
          await projectsDB.setItem(id, { 
            ...project,
            isSynced: 1,
            _id: cloudData.insertedId || project._id
          });
        }
      } catch (err) {
        console.error("Sync failed for project:", project.title);
      }
    }
  });
};