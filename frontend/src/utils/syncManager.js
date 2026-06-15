// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, submissionsDB, syncQueueDB } from "../db";

const API_BASE_URL = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
    : "/api";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
};

export const syncManager = {
    isSyncing: false,

    async processQueue() {
        if (!navigator.onLine) {
            console.log("Offline: Sync deferred until connection is restored.");
            return;
        }
        
        if (this.isSyncing) {
            console.log("Sync already in progress. Skipping duplicate call.");
            return;
        }

        this.isSyncing = true;

        try {
            const queue = [];
            
            // Extract everything currently in the IndexedDB Sync Queue
            await syncQueueDB.iterate((value, key) => {
                queue.push({ key, ...value });
            });

            if (queue.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`Processing ${queue.length} items from sync queue...`);

            // Categorize the queued items into our batch payload structure
            const payload = { 
                progress: [], 
                submissions: [], 
                assessments: [] 
            };
            
            const keysToDelete = [];

            queue.forEach(item => {
                if (item.type === "PROGRESS") {
                    payload.progress.push(item.data);
                } else if (item.type === "SUBMISSION") {
                    payload.submissions.push(item.data);
                } else if (item.type === "ASSESSMENT") {
                    payload.assessments.push(item.data);
                } else {
                    console.warn(`Unknown sync item type encountered: ${item.type}`, item);
                }
                keysToDelete.push(item.key);
            });

            const headers = getAuthHeaders();
            
            if (!headers.Authorization) {
                console.warn("No auth token found. Skipping background sync process to avoid unauthorized errors.");
                this.isSyncing = false;
                return;
            }

            // Fire the Batch Request to the FastApi Backend
            const response = await fetch(`${API_BASE_URL}/batch-sync`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const responseData = await response.json();
                console.log(`Background sync completed successfully. Synced ${responseData.synced_items || keysToDelete.length} items.`);

                // Cleanup: Remove successfully synced items from the offline queue
                for (const key of keysToDelete) {
                    await syncQueueDB.removeItem(key);
                }

                // Update Local State: Mark Submissions as Synced
                payload.submissions.forEach(async (sub) => {
                    const subId = `${sub.userId}_${sub.moduleId}_${sub.activityId}`;
                    try {
                        const localSub = await submissionsDB.getItem(subId);
                        if (localSub) {
                            await submissionsDB.setItem(subId, { ...localSub, isSynced: true });
                        }
                    } catch(e) {
                        console.error(`Failed to update local sync status for submission ${subId}`, e);
                    }
                });

                // Update Local State: Mark Progress as Synced
                payload.progress.forEach(async (prog) => {
                    try {
                        const localProg = await progressDB.getItem(prog.lesson_id);
                        if (localProg) {
                            await progressDB.setItem(prog.lesson_id, { ...localProg, isSynced: true });
                        }
                    } catch(e) {
                        console.error(`Failed to update local sync status for progress ${prog.lesson_id}`, e);
                    }
                });

                // Update Local State: Mark Assessments as Synced
                payload.assessments.forEach(async (ass) => {
                    try {
                        const localAss = await assessmentsDB.getItem(ass.assessmentId);
                        if (localAss) {
                            await assessmentsDB.setItem(ass.assessmentId, { ...localAss, isSynced: true });
                        }
                    } catch(e) {
                        console.error(`Failed to update local sync status for assessment ${ass.assessmentId}`, e);
                    }
                });

                // Dispatch global event so the UI components can drop their "Offline/Syncing" indicators
                window.dispatchEvent(new Event("localDataSynced"));

            } else {
                console.warn(`Batch sync failed with HTTP status: ${response.status}. Items will remain in queue.`);
            }
        } catch (error) {
            console.error("Critical error during background sync execution:", error);
        } finally {
            this.isSyncing = false;
        }
    },

    init() {
        // Event Listener: Immediately try to flush the queue when internet is restored
        window.addEventListener("online", () => {
            console.log("Network connection restored. Processing offline sync queue...");
            this.processQueue();
        });

        // Fail-safe: Periodic background sweep every 60 seconds
        setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.processQueue();
            }
        }, 60000);
        
        // Run once on load just in case
        setTimeout(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.processQueue();
            }
        }, 3000);
    },

    async enqueue(type, data) {
        // Generate a unique key for the IndexedDB store
        const key = `sync_${type.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        try {
            await syncQueueDB.setItem(key, { 
                type: type, 
                action: "UPSERT", 
                data: data, 
                timestamp: Date.now() 
            });
            console.log(`Successfully queued ${type} data for offline sync.`);
        } catch (error) {
            console.error(`Failed to enqueue ${type} data to IndexedDB:`, error);
        }

        // If we are online, trigger the queue processor immediately so it feels real-time
        if (navigator.onLine) {
            this.processQueue();
        }
    }
};

export default syncManager;