// frontend/src/pages/Projects.jsx
import { useEffect, useState } from "react";
import { FiChevronRight, FiClock, FiCloud, FiFileText, FiFolder, FiHardDrive, FiPlus, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DashboardHeader from "../components/DashboardHeader";
import { projectsDB, syncQueueDB } from "../db";
import "../styles/Projects.css";
import { syncManager } from "../utils/syncManager";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [syncState, setSyncState] = useState({ syncing: false, pendingCount: 0, lastSynced: null });
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", isDanger: false, onConfirmAction: null });
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  useEffect(() => {
    loadProjects();
    
    const handleAutoSync = () => loadProjects();
    const onStart = () => setGlobalSyncing(true);
    const onEnd = () => { setGlobalSyncing(false); loadProjects(); };

    window.addEventListener("online", handleAutoSync);
    window.addEventListener("localDataSynced", handleAutoSync);
    window.addEventListener("sync-start", onStart);
    window.addEventListener("sync-end", onEnd);
    return () => {
      window.removeEventListener("online", handleAutoSync);
      window.removeEventListener("localDataSynced", handleAutoSync);
      window.removeEventListener("sync-start", onStart);
      window.removeEventListener("sync-end", onEnd);
    };
  }, []);

  const normalizeEpoch = (val) => {
    if (!val) return Date.now();
    if (typeof val === 'string') {
      const parsed = new Date(val).getTime();
      return isNaN(parsed) ? Date.now() : parsed;
    }
    return typeof val === 'number' && val < 10000000000 ? val * 1000 : val;
  };

  const formatDisplayDate = (val) => {
    const ms = normalizeEpoch(val);
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const loadProjects = async () => {
    try {
      setSyncState(prev => ({ ...prev, syncing: true }));
      const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (!storedUser) {
        setLoading(false);
        setSyncState(prev => ({ ...prev, syncing: false }));
        return;
      }
      const user = JSON.parse(storedUser);

      // 1. PULL CLOUD DATA & MERGE SYNC STATES
      if (navigator.onLine && API_BASE) {
        try {
          const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
          const headers = {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          };

          const res = await fetch(`${API_BASE}/api/projects?userId=${encodeURIComponent(user.email)}`, { headers });
          const contentType = res.headers.get("content-type") || "";
          
          if (res.ok && contentType.includes("application/json")) {
            const data = await res.json();
            let cloudProjects = Array.isArray(data?.projects) ? data.projects : (Array.isArray(data) ? data : []);

            for (const cp of cloudProjects) {
              if (cp.owner_id === user.email || cp.userId === user.email) {
                const existingLocal = await projectsDB.getItem(cp._id || cp.projectId);
                await projectsDB.setItem(cp._id || cp.projectId, { 
                  ...existingLocal, 
                  ...cp, 
                  synced: true, 
                  isSynced: true, 
                  updatedAt: normalizeEpoch(cp.updatedAt || cp.updated_at || cp.timestamp) 
                });
              }
            }
          }
        } catch (fetchErr) {
          console.warn("Cloud pull degraded gracefully to offline storage:", fetchErr);
        }
      }

      // 2. CHECK QUEUE COUNT
      // syncQueueDB (../db) only exposes add/getAll/remove/clear — there is
      // no .keys() method, so this previously always evaluated to an empty
      // array and silently showed "0 Local Pending" no matter what was
      // actually queued.
      //
      // syncQueue is a single shared IndexedDB table used for more than
      // just project deletions -- AssessmentPage.jsx also queues retryable
      // assessment/progress requests ("RETRY_REQUEST") into the same
      // table. This page is specifically about projects/templates, so only
      // count the deletion actions that actually belong to it; otherwise
      // an unrelated queued assessment retry would inflate the "Local
      // Pending" badge shown here.
      const allQueuedActions = await syncQueueDB.getAll();
      const queuedActions = allQueuedActions.filter(
        (t) => t.action === "DELETE_PROJECT" || t.action === "DELETE_TEMPLATE"
      );

      // 3. READ LOCAL IDB RECONCILED STATE
      const loadedProjects = [];
      await projectsDB.iterate((value) => {
        if (value.owner_id === user.email || value.userId === user.email) {
          loadedProjects.push({
            ...value,
            // The IndexedDB store's keyPath is "projectId" (see db.js), not
            // "_id" — local-only (not-yet-synced) projects never receive an
            // "_id" until they've been pushed to the backend. Normalize a
            // single canonical identifier here so the rest of this page
            // never has to guess which field is populated.
            id: value.projectId || value._id,
            updatedAt: normalizeEpoch(value.updatedAt || value.updated_at || value.timestamp)
          });
        }
      });

      const unsyncedProjects = loadedProjects.filter(p => !p.isSynced && !p.synced);
      const pendingCount = unsyncedProjects.length + queuedActions.length;

      setProjects(loadedProjects.sort((a, b) => b.updatedAt - a.updatedAt));
      setSyncState({ syncing: false, pendingCount, lastSynced: new Date() });
    } catch (error) {
      console.error("Failed to load projects:", error);
      setSyncState(prev => ({ ...prev, syncing: false }));
    } finally {
      setLoading(false);
    }
  };

  const handleManualTrigger = async () => {
    setSyncState(prev => ({ ...prev, syncing: true }));
    if (syncManager?.processSyncQueue) {
      await syncManager.processSyncQueue();
    }
    await loadProjects();
  };

  const handleDeleteProject = (e, proj) => {
    e.stopPropagation();
    const id = proj.id || proj.projectId || proj._id;
    if (!id) {
      console.error("Cannot delete project: no identifier found on record", proj);
      return;
    }

    const title = proj.title || proj.name || "this project";
    setModalConfig({
      isOpen: true,
      title: "Delete Project?",
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      confirmText: "Delete",
      isDanger: true,
      onConfirmAction: () => confirmDeleteProject(id, title),
    });
  };

  const confirmDeleteProject = async (id, title) => {
    closeModal();
    // Optimistically drop it from the visible list right away so the UI
    // never looks like the delete "didn't do anything".
    setProjects(prev => prev.filter(p => (p.id || p.projectId || p._id) !== id));

    try {
      // syncQueueDB (from ../db) only exposes add/getAll/remove/clear — it
      // has no setItem/removeItem methods, so calling those here (as this
      // used to) threw and aborted the delete before the UI ever updated.
      // syncManager.queueProjectDeletion() is the real, working code path:
      // it removes the record from IndexedDB, attempts an immediate DELETE
      // against the backend when online, and transparently falls back to
      // the offline action queue (processed later by processSyncQueue)
      // when it's not.
      await syncManager.queueProjectDeletion(id);
      await refreshPendingCount();
      showToast(`"${title || "Project"}" deleted successfully.`, "success");
    } catch (error) {
      console.error("Failed to delete project:", error);
      showToast("Failed to delete project. Please try again.", "error");
      // Deletion failed outright — reload from source of truth so the
      // project reappears rather than leaving the UI in a false state.
      loadProjects();
    }
  };

  const refreshPendingCount = async () => {
    try {
      const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
      const user = storedUser ? JSON.parse(storedUser) : null;
      const allQueuedActions = await syncQueueDB.getAll();
      const queuedActions = allQueuedActions.filter(
        (t) => t.action === "DELETE_PROJECT" || t.action === "DELETE_TEMPLATE"
      );
      let unsyncedCount = 0;
      await projectsDB.iterate((value) => {
        if (user && value.owner_id !== user.email && value.userId !== user.email) return;
        if (!value.isSynced && !value.synced) unsyncedCount++;
      });
      setSyncState(prev => ({ ...prev, pendingCount: unsyncedCount + queuedActions.length, lastSynced: new Date() }));
    } catch (error) {
      console.warn("Failed to refresh pending sync count:", error);
    }
  };

  const isActivelySyncing = syncState.syncing || globalSyncing;

  const projectsTour = {
    id: "projects-tour",
    pageId: "projects",
    title: "Projects Tour",
    steps: [
      { target: ".projects-hero", title: "Start a workspace", description: "Create a blank project when you want to begin from scratch." },
      { target: ".projects-list-section", title: "Browse saved projects", description: "Review and reopen your stored projects and templates here." },
      { target: ".view-all-projects-btn, .empty-action-btn", title: "Load or create", description: "Use the main action to open the workspace from the project library." },
    ],
  };

  return (
    <div className="projects-bento-layout">
      <style>{`
        @keyframes projSpin { 100% { transform: rotate(360deg); } }
        .spin-anim { animation: projSpin 1s linear infinite; }
      `}</style>

      {toast.show && (
        <div className={`projects-toast-notification ${toast.type === "error" ? "projects-toast-error" : "projects-toast-success"}`}>
          {toast.message}
        </div>
      )}

      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText="Cancel"
        isDanger={modalConfig.isDanger}
        onCancel={closeModal}
        onConfirm={modalConfig.onConfirmAction}
      />

      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={projectsTour} tourPageId="projects" />

      <main className="projects-bento-content">
        <div className="projects-grid-container">
          
          <section className="bento-hero-card projects-hero">
            <div className="hero-text">
              <h1 className="hero-title">My Projects</h1>
              <p className="hero-subtitle">Manage, edit, and load your saved algorithm workspaces.</p>
            </div>
            <button className="hero-primary-btn" onClick={() => navigate('/workspace')}>
              <FiPlus size={20} strokeWidth={3} />
              <span>Blank Workspace</span>
            </button>
          </section>

          {/* Live Sync Status Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', marginBottom: '16px', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem' }}>
              {isActivelySyncing ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60A5FA' }}>
                  <FiRefreshCw className="spin-anim" /> Synchronizing cloud storage...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981' }}>
                  <FiCloud /> Storage up to date {syncState.lastSynced && `(${syncState.lastSynced.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                </span>
              )}

              {syncState.pendingCount > 0 && (
                <span style={{ background: '#F59E0B', color: '#000', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '800' }}>
                  {syncState.pendingCount} Local Pending
                </span>
              )}
            </div>

            <button 
              onClick={handleManualTrigger} 
              disabled={isActivelySyncing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: '8px', cursor: isActivelySyncing ? 'wait' : 'pointer', fontSize: '0.82rem', fontWeight: '600' }}
            >
              <FiRefreshCw className={isActivelySyncing ? "spin-anim" : ""} /> Force Sync
            </button>
          </div>

          <section className="projects-list-section">
            {loading ? (
              <div className="projects-loading-state">
                <div className="spinner"></div>
                <p>Reading workspace databases...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="projects-empty-state">
                <div className="empty-state-icon"><FiFileText size={48} /></div>
                <h3 className="empty-title">No projects found</h3>
                <p className="empty-desc">You haven't saved any algorithmic workspaces to the cloud yet. Start a new blank workspace to begin building!</p>
                <button className="empty-action-btn" onClick={() => navigate('/workspace')}>
                  <FiPlus size={18} strokeWidth={3} /> Create First Project
                </button>
              </div>
            ) : (
              <div className="projects-bento-grid">
                {projects.map(proj => (
                  <div key={proj.id} className="bento-project-card" onClick={() => navigate("/workspace", { state: { projectToLoad: proj } })}>
                    <div className="project-card-top">
                      <div className="project-icon-wrapper"><FiFolder size={24} /></div>
                      <button className="btn-delete-project" title="Delete Project" onClick={(e) => handleDeleteProject(e, proj)}>
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                    
                    <div className="project-card-body">
                      <h3 className="project-title">{proj.title || proj.name || "Untitled Project"}</h3>
                      <div className="project-meta-info">
                        <span className="meta-date">
                          <FiClock size={14} /> {formatDisplayDate(proj.updatedAt)}
                        </span>
                        <span className={`sync-status ${proj.synced || proj.isSynced ? "synced" : "local"}`}>
                          {proj.synced || proj.isSynced ? <><FiCloud size={14} /> Cloud</> : <><FiHardDrive size={14} /> Local</>}
                        </span>
                      </div>
                    </div>

                    <div className="project-card-footer">
                      <span className="open-text">Open Project</span>
                      <FiChevronRight size={18} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}