// frontend/src/pages/Projects.jsx
import { useEffect, useState } from "react";
import { FiChevronRight, FiClock, FiCloud, FiFileText, FiFolder, FiHardDrive, FiPlus, FiTrash2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { projectsDB, syncQueueDB } from "../db";
import "../styles/Projects.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (!storedUser) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(storedUser);

      // --- 1. PULL CLOUD DATA FIRST ---
      if (navigator.onLine) {
        try {
          const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
          const headers = {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          };

          const res = await fetch(`${API_BASE}/api/projects?userId=${user.email}`, { headers });
          if (res.ok) {
            const data = await res.json();
            
            let cloudProjects = [];
            if (data && Array.isArray(data.projects)) {
                cloudProjects = data.projects;
            } else if (Array.isArray(data)) {
                cloudProjects = data;
            }

            for (const cp of cloudProjects) {
              if (cp.owner_id === user.email || cp.userId === user.email) {
                await projectsDB.setItem(cp._id, { ...cp, synced: true });
              }
            }
          }
        } catch (fetchErr) {
          console.error("Failed to fetch cloud projects:", fetchErr);
        }
      }

      // --- 2. LOAD FROM LOCAL DB ---
      const loadedProjects = [];
      await projectsDB.iterate((value) => {
        if (value.owner_id === user.email || value.userId === user.email) {
          loadedProjects.push(value);
        }
      });
      setProjects(loadedProjects.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (e, projectId) => {
    e.stopPropagation();
    const confirmDelete = window.confirm("Are you sure you want to delete this project? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
      // 1. Delete locally
      await projectsDB.removeItem(projectId);

      // 2. Queue for Cloud Sync Deletion
      if (projectId.startsWith('local_')) {
        await syncQueueDB.removeItem(projectId);
      } else {
        await syncQueueDB.setItem(`delete_${projectId}`, {
          type: 'PROJECT',
          action: 'DELETE',
          data: { _id: projectId }
        });
      }

      // 3. Update UI
      setProjects(projects.filter(p => p._id !== projectId));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  return (
    <div className="projects-bento-layout">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />

      <main className="projects-bento-content">
        <div className="projects-grid-container">
          
          {/* Hero Section */}
          <section className="bento-hero-card projects-hero">
            <div className="hero-text">
              <h1 className="hero-title">My Projects</h1>
              <p className="hero-subtitle">
                Manage, edit, and load your saved algorithm workspaces.
              </p>
            </div>
            <button 
              className="hero-primary-btn" 
              onClick={() => navigate('/workspace')}
            >
              <FiPlus size={20} strokeWidth={3} />
              <span>Blank Workspace</span>
            </button>
          </section>

          {/* Projects List Section */}
          <section className="projects-list-section">
            {loading ? (
              <div className="projects-loading-state">
                <div className="spinner"></div>
                <p>Syncing your workspace data...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="projects-empty-state">
                <div className="empty-state-icon">
                  <FiFileText size={48} />
                </div>
                <h3 className="empty-title">No projects found</h3>
                <p className="empty-desc">
                  You haven't saved any algorithmic workspaces to the cloud yet. Start a new blank workspace to begin building!
                </p>
                <button className="empty-action-btn" onClick={() => navigate('/workspace')}>
                  <FiPlus size={18} strokeWidth={3} /> Create First Project
                </button>
              </div>
            ) : (
              <div className="projects-bento-grid">
                {projects.map(proj => (
                  <div 
                    key={proj._id} 
                    className="bento-project-card" 
                    onClick={() => navigate("/workspace", { state: { projectToLoad: proj } })}
                  >
                    <div className="project-card-top">
                      <div className="project-icon-wrapper">
                        <FiFolder size={24} />
                      </div>
                      <button
                        className="btn-delete-project"
                        title="Delete Project"
                        onClick={(e) => handleDeleteProject(e, proj._id)}
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                    
                    <div className="project-card-body">
                      <h3 className="project-title">{proj.title || proj.name || "Untitled Project"}</h3>
                      <div className="project-meta-info">
                        <span className="meta-date">
                          <FiClock size={14} /> 
                          {new Date(proj.updatedAt || Date.now()).toLocaleDateString()}
                        </span>
                        <span className={`sync-status ${proj.synced ? "synced" : "local"}`}>
                          {proj.synced ? (
                            <><FiCloud size={14} /> Cloud</>
                          ) : (
                            <><FiHardDrive size={14} /> Local</>
                          )}
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