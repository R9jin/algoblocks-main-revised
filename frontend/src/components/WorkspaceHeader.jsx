// frontend/src/components/WorkspaceHeader.jsx
import { FiArrowLeft, FiCode, FiDownload, FiGrid, FiPlay, FiSave, FiUpload } from "react-icons/fi";
import { Link } from "react-router-dom";
import TourHelpButton from "./TourHelpButton";
import "../styles/MainApp.css";

export default function WorkspaceHeader({
  viewMode,
  setViewMode,
  runCode,
  handleExport,
  handleImport,
  handleSaveToDB,
  currentProjectTitle,
  isEvaluating,
  isGuest,
  tour,
  tourPageId,
  isEngineReady = true,
  engineProgress,
}) {
  return (
    <header className="workspace-header-purple">
      <div className="wh-left">
        <Link to="/dashboard" className="wh-back-btn">
          <FiArrowLeft size={18} />
          <span>Dashboard</span>
        </Link>
        <div className="wh-divider"></div>
        <h2 className="wh-project-title">
          {currentProjectTitle || "Untitled Project"}
        </h2>
      </div>

      <div className="wh-center">
        <div className="wh-view-toggle">
          <button 
            className={`wh-toggle-btn ${viewMode === 'workspace' ? 'active' : ''}`}
            onClick={() => setViewMode('workspace')}
          >
            <FiGrid size={16} /> Blocks
          </button>
          <button 
            className={`wh-toggle-btn ${viewMode === 'python' ? 'active' : ''}`}
            onClick={() => setViewMode('python')}
          >
            <FiCode size={16} /> Python
          </button>
        </div>
      </div>

      <div className="wh-right">
        <TourHelpButton pageId={tourPageId} tour={tour} label="Replay workspace tour" />
        {!isGuest && (
          <div className="wh-file-actions">
            <button className="wh-action-icon" onClick={handleExport} title="Export JSON">
              <FiDownload size={18} />
            </button>
            <label className="wh-action-icon" title="Import JSON" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
              <FiUpload size={18} />
              <input 
                type="file" 
                accept=".json" 
                style={{ display: "none" }} 
                onChange={handleImport} 
              />
            </label>
          </div>
        )}

        {!isGuest && (
          <button className="wh-btn-save" type="button" onClick={handleSaveToDB}>
            <FiSave size={16} /> <span>Save</span>
          </button>
        )}

        <button 
          className={`wh-btn-run ${isEvaluating ? 'running' : ''} ${!isEngineReady ? 'engine-loading' : ''}`} 
          type="button"
          onClick={runCode}
          disabled={isEvaluating || !isEngineReady}
          title={!isEngineReady ? (engineProgress?.stage || "Preparing Python engine...") : undefined}
        >
          {!isEngineReady ? (
            <>
              <span className="engine-loading-spinner" />
              <span>{engineProgress?.stage || "Preparing engine..."} {typeof engineProgress?.percent === "number" ? `(${engineProgress.percent}%)` : ""}</span>
            </>
          ) : (
            <>
              <FiPlay size={16} fill={isEvaluating ? "transparent" : "currentColor"} /> 
              <span>{isEvaluating ? "Running..." : "Run Code"}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}