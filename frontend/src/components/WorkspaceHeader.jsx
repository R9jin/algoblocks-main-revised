// frontend\src\components\WorkspaceHeader.jsx

import { useNavigate } from "react-router-dom";

export default function WorkspaceHeader({
  viewMode,
  setViewMode,
  runCode,
  handleSaveToDB,
  currentProjectId,       
  currentProjectTitle,    
  handleUpdateDB,          
  handleExport            // NEW: Added handleExport prop
}) {

  const navigate = useNavigate();

  return (
    <header className="workspace-header">
      <div className="header-left">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" />
          Back to Dashboard
        </button>
        <span className="project-name">{currentProjectTitle}</span>
      </div>

      <div className="header-center">
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'workspace' ? 'active' : ''}`}
            onClick={() => setViewMode("workspace")}
          >
            Workspace
          </button>
          <button
            className={`toggle-btn ${viewMode === 'python' ? 'active' : ''}`}
            onClick={() => setViewMode("python")}
          >
            Python Code
          </button>
        </div>
      </div>

      <div className="header-right">
        {/* NEW: Export JSON Button */}
        <button onClick={handleExport} className="action-btn" style={{ backgroundColor: '#6C5CE7', color: 'white', marginRight: '10px' }}>
          Export JSON
        </button>

        <button onClick={runCode} className="action-btn btn-run">
          <img src="/assets/play-icon.png" alt="Run" className="btn-icon" /> Run
        </button>

        {currentProjectId ? (
          <button onClick={handleUpdateDB} className="action-btn btn-save" style={{ backgroundColor: '#27ae60', color: 'white' }}>
            Save Changes
          </button>
        ) : (
          <button onClick={handleSaveToDB} className="action-btn btn-save">
            Save to Cloud
          </button>
        )}
      </div>
    </header>
  );
}