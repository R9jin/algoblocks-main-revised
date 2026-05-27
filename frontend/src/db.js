// frontend/src/db.js
import localforage from 'localforage';

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

// Activity Submissions, Progress, and Assessment DBs
export const submissionsDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "submissions"
});

export const progressDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "progress"
});

export const assessmentsDB = localforage.createInstance({
    name: "AlgoBlocks",
    storeName: "assessments"
});

// Helper functions for React components to use
export const saveProjectOffline = async (projectData) => {
    const id = projectData._id || `local_${Date.now()}`;
    const project = { ...projectData, _id: id, synced: false, updatedAt: Date.now() };
    
    await projectsDB.setItem(id, project);
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