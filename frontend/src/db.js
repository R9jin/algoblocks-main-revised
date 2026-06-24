// frontend/src/db.js
import localforage from 'localforage';

export const projectsDB = localforage.createInstance({
    name: "AlgoBlocks_Projects",
    storeName: "projects"
});

export const templatesDB = localforage.createInstance({
    name: "AlgoBlocks_Templates",
    storeName: "templates"
});

export const syncQueueDB = localforage.createInstance({
    name: "AlgoBlocks_SyncQueue",
    storeName: "sync_queue"
});

// Activity Submissions, Progress, and Assessment DBs
export const submissionsDB = localforage.createInstance({
    name: "AlgoBlocks_Submissions",
    storeName: "submissions"
});

export const progressDB = localforage.createInstance({
    name: "AlgoBlocks_Progress",
    storeName: "progress"
});

export const assessmentsDB = localforage.createInstance({
    name: "AlgoBlocks_Assessments",
    storeName: "assessments"
});

// Cache for Curriculum JSON files to prevent slow network waterfalls
export const curriculumCacheDB = localforage.createInstance({
    name: "AlgoBlocks_Curriculum",
    storeName: "curriculum_cache"
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