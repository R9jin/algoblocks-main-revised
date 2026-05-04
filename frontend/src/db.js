// frontend\src\db.js
import localforage from 'localforage';

// Initialize offline databases
export const projectsDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "projects"
});

export const templatesDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "templates"
});

export const syncQueueDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "sync_queue"
});

// Helper functions for React components to use
export const saveProjectOffline = async (projectData) => {
    const id = projectData._id || `local_${Date.now()}`;
    const project = { ...projectData, _id: id, synced: false, updatedAt: Date.now() };
    
    await projectsDB.setItem(id, project);
    
    // Add to sync queue so we know to push it to MongoDB later
    await syncQueueDB.setItem(id, { type: 'PROJECT', action: 'UPSERT', data: project });
    return id;
};

export const getOfflineProjects = async () => {
    const projects = [];
    await projectsDB.iterate((value) => {
        projects.push(value);
    });
    return projects;
};