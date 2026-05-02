// frontend\src\components\WorkspaceHeader.jsx

import { useNavigate } from "react-router-dom";

export default function WorkspaceHeader({
  viewMode,
  setViewMode,
  runCode,
  handleSaveToDB,
  currentProjectId,       // NEW
  currentProjectTitle,    // NEW
  handleUpdateDB          // NEW
}) {

  const navigate = useNavigate();

  return (
    <header className="workspace-header">
      <div className="header-left">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" />
          Back to Dashboard
        </button>
        {/* Update this span to use the dynamic title */}
        <span className="project-name">{currentProjectTitle}</span>
      </div>

      <div className="header-center">
        <div className="view-toggle">

          {/*
            Workspace view toggle button.
            Highlights as active when the current viewMode matches.
          */}
          <button
            className={`toggle-btn ${viewMode === 'workspace' ? 'active' : ''}`}
            onClick={() => setViewMode("workspace")}
          >
            Workspace
          </button>

          {/*
            Python Code view toggle button.
            Highlights as active when the current viewMode matches.
          */}
          <button
            className={`toggle-btn ${viewMode === 'python' ? 'active' : ''}`}
            onClick={() => setViewMode("python")}
          >
            Python Code
          </button>

        </div>
      </div>

      <div className="header-right">
        <button onClick={runCode} className="action-btn btn-run">
          <img src="/assets/play-icon.png" alt="Run" className="btn-icon" /> Run
        </button>

        {/* Conditionally render "Save Changes" if a project is loaded, otherwise show "Save to Cloud" */}
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