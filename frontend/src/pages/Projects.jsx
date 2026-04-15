import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
// Ensure this import matches your localForage exports in db.js
import { projectsDB } from "../db";
import "../styles/Projects.css";

// --- Minimal Inline SVG Icons ---
const FolderIcon = () => (
  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const DocumentIcon = () => (
  <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(storedUser);

      const loadedProjects = [];
      // Updated to use localForage iterate as per your db.js configuration
      await projectsDB.iterate((value) => {
        if (value.owner_id === user.email) {
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
      // Logic for local deletion via localForage
      await projectsDB.removeItem(projectId);
      setProjects(projects.filter(p => p._id !== projectId));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  return (
    <div className="page-container">
      <DashboardHeader />

      <div className="page-body">
        <main className="page-main">
          <div className="page-header-row">
            <div>
              <h1 className="section-title">My Projects</h1>
              <p className="page-subtitle">Manage and load your saved algorithm workspaces.</p>
            </div>
            <button className="btn-new-project-large" onClick={() => navigate('/app')}>
              <PlusIcon /> Blank Workspace
            </button>
          </div>

          {loading ? (
            <div className="loading-state">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><DocumentIcon /></div>
              <h3 className="empty-title">No projects found</h3>
              <p className="empty-desc">You haven't saved any algorithmic workspaces to the cloud yet. Start a new blank workspace to begin building!</p>
              <button className="btn-new-project-large" onClick={() => navigate('/app')}>
                <PlusIcon /> Create First Project
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {projects.map(proj => (
                <div key={proj._id} className="project-card" onClick={() => navigate(`/app?id=${proj._id}`)}>
                  <div className="project-card-header">
                    <div className="project-icon-wrapper">
                      <FolderIcon />
                    </div>
                    <button
                      className="btn-delete"
                      title="Delete Project"
                      onClick={(e) => handleDeleteProject(e, proj._id)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="project-details">
                    <h3>{proj.title || "Untitled Project"}</h3>
                    <p>{proj.synced ? "Saved to Cloud" : "Local Draft"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}