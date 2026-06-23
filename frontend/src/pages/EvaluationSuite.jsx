// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
    FiArrowLeft,
    FiCheckCircle,
    FiCode,
    FiPlay,
    FiRefreshCw,
    FiXCircle
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { usePyodide } from "../context/PyodideContext";
import "../styles/EvaluationSuite.css";
import "../styles/MainApp.css";

export default function EvaluationSuite() {
  const navigate = useNavigate();
  const { worker, isEngineReady } = usePyodide();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isRunning, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("System idle.");
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedItemCode, setSelectedItemCode] = useState(null);

  // Security Verification: Ensure only elevated admin users can mount this view
  useEffect(() => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    const userObj = userStr ? JSON.parse(userStr) : null;
    
    if (!userObj?.isAdmin) {
      navigate("/dashboard");
    } else {
      setIsAdmin(true);
    }
  }, [navigate]);

  // Global Worker Listener: Intercept benchmark execution updates
  useEffect(() => {
    if (!worker) return;

    const handleWorkerMessage = (e) => {
      const { type, progress, currentItem, payload, error } = e.data;

      if (type === "BENCHMARK_PROGRESS") {
        setProgress(progress);
        setStatusText(`Analyzing Asymptotic Complexity for: ${currentItem}...`);
      } else if (type === "BENCHMARK_COMPLETE") {
        setResults(payload);
        setIsLoading(false);
        setStatusText("Evaluation suite benchmark finished successfully.");
      } else if (type === "BENCHMARK_ERROR") {
        alert(`System Evaluation Diagnostics Failed: ${error}`);
        setIsLoading(false);
        setStatusText("Engine runtime exception encountered.");
      }
    };

    worker.addEventListener("message", handleWorkerMessage);
    return () => worker.removeEventListener("message", handleWorkerMessage);
  }, [worker]);

  // Suite Trigger: Load ground truth JSON and dispatch to Web Worker
  const handleStartEvaluation = async () => {
    if (!isEngineReady) {
      alert("The Pyodide Python AST Engine is currently warming up in the background. Please wait a few seconds.");
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setResults(null);
    setStatusText("Fetching Ground Truth Benchmark Dataset (/data/ground_truth.json)...");

    try {
      const res = await fetch("/data/evaluation/ground_truth.json");
      if (!res.ok) {
        throw new Error(`HTTP error status: ${res.status}`);
      }
      const dataset = await res.json();

      worker.postMessage({
        type: "RUN_BENCHMARK_SUITE",
        dataset: dataset
      });
    } catch (err) {
      alert(`Failed to load ground truth dataset file: ${err.message}. Verifying fallback curated parts...`);
      try {
        const fallbackRes = await fetch("/data/evaluation/curated_part_1.json");
        const fallbackDataset = await fallbackRes.json();
        setStatusText("Using fallback curated benchmark dataset part 1...");
        worker.postMessage({
          type: "RUN_BENCHMARK_SUITE",
          dataset: fallbackDataset
        });
      } catch (fallbackErr) {
        alert("Critical Failure: Could not locate ground truth benchmark JSON files in /public/data/evaluation/.");
        setIsLoading(false);
        setStatusText("Dataset fetch failed.");
      }
    }
  };

  if (!isAdmin) return null;

  const filteredDetails = (results?.details || []).filter((item) => {
    if (activeTab === "passed") return item.isCorrect;
    if (activeTab === "failed") return !item.isCorrect;
    return true;
  });

  return (
    <div className="eval-suite-container">
      
      {/* Code Inspection Modal for Auditing AST Classification Output */}
      {selectedItemCode && (
        <div className="modal-overlay" onClick={() => setSelectedItemCode(null)}>
          <div className="eval-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="eval-modal-header">
              <h3 className="eval-modal-title">{selectedItemCode.name}</h3>
              <div className="eval-modal-badges">
                <span className="eval-badge-gt">
                  Ground Truth: {selectedItemCode.expectedTime}
                </span>
                <span className={`eval-badge-pred ${selectedItemCode.isCorrect ? "pred-correct" : "pred-incorrect"}`}>
                  AST Predicted: {selectedItemCode.predictedTime}
                </span>
              </div>
            </div>
            
            <div className="eval-section-label">Source Code Snippet</div>
            <pre className="eval-code-preview">
              {selectedItemCode.codeSnippet}
            </pre>

            <div className="eval-section-label">AST Profiler Explanation & Trace</div>
            <div className="eval-explanation-box">
              {selectedItemCode.explanation}
            </div>

            <div className="eval-modal-footer">
              <button 
                onClick={() => setSelectedItemCode(null)}
                className="eval-btn-close"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Navigation */}
      <header className="workspace-header-purple eval-header-override">
        <div className="wh-left">
          <Link to="/dashboard" className="wh-back-btn eval-exit-link">
            <FiArrowLeft size={18} />
            <span>Dashboard</span>
          </Link>
          <div className="wh-divider eval-wh-divider"></div>
          <h2 className="wh-project-title eval-wh-title">
            System Analytical Benchmark Suite <span className="eval-admin-badge">EVALUATION UI</span>
          </h2>
        </div>

        <div className="wh-right">
          <button 
            onClick={handleStartEvaluation} 
            disabled={isRunning || !isEngineReady}
            className={`eval-btn-run ${isRunning || !isEngineReady ? "eval-run-active" : "eval-run-idle"}`}
          >
            {isRunning ? <FiRefreshCw className="spinner" size={16} /> : <FiPlay fill="#fff" size={16} />}
            <span>{isRunning ? `Running Suite (${progress}%)...` : "Execute Benchmark Metrics"}</span>
          </button>
        </div>
      </header>

      {/* Suite Dashboard Content Area */}
      <div className="eval-main-wrapper">
        
        {/* Environment Status Banner */}
        <div className="eval-status-banner">
          <div className="eval-status-group">
            <span className="eval-status-label">Execution Target:</span>
            <strong className="eval-status-target">{statusText}</strong>
          </div>
          <div className="eval-status-group">
            <span className="eval-status-label-sm">AST Virtual Machine:</span>
            {isEngineReady ? (
              <span className="eval-vm-ready">● Pyodide 3.11 AST Active</span>
            ) : (
              <span className="eval-vm-booting">○ Wasm Engine Initializing...</span>
            )}
          </div>
        </div>

        {/* Live Progress Bar */}
        {isRunning && (
          <div className="eval-progress-track">
            <div className="eval-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        {/* Aggregate KPI Stat Cards */}
        {results && (
          <div className="eval-stats-grid">
            <div className="eval-stat-card">
              <div className="eval-stat-title">Classification Accuracy</div>
              <div className={`eval-stat-value ${results.accuracyRate >= 85 ? "val-green" : "val-yellow"}`}>
                {results.accuracyRate}%
              </div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Total Algorithms Tested</div>
              <div className="eval-stat-value val-white">
                {results.totalTested}
              </div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Verified Correct (Pass)</div>
              <div className="eval-stat-value val-green">
                {results.passed}
              </div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Misclassifications (Fail)</div>
              <div className={`eval-stat-value ${results.failed > 0 ? "val-red" : "val-muted"}`}>
                {results.failed}
              </div>
            </div>
          </div>
        )}

        {/* Detailed Suite Audit Table */}
        {results && (
          <div className="eval-table-container">
            
            {/* Table Filter Tabs */}
            <div className="eval-filter-navbar">
              <span className="eval-filter-label">Filter View:</span>
              <button 
                onClick={() => setActiveTab("all")} 
                className={`eval-filter-btn ${activeTab === "all" ? "filter-all-active" : "filter-all-idle"}`}
              >
                All Test Cases ({results.details.length})
              </button>
              <button 
                onClick={() => setActiveTab("passed")} 
                className={`eval-filter-btn ${activeTab === "passed" ? "filter-pass-active" : "filter-pass-idle"}`}
              >
                Passed Match ({results.passed})
              </button>
              <button 
                onClick={() => setActiveTab("failed")} 
                className={`eval-filter-btn ${activeTab === "failed" ? "filter-fail-active" : "filter-fail-idle"}`}
              >
                Failed Match ({results.failed})
              </button>
            </div>

            {/* Main Data Table */}
            <table className="eval-table">
              <thead>
                <tr className="eval-table-header">
                  <th>Algorithm Name / Identifier</th>
                  <th>Domain Category</th>
                  <th>Ground Truth (Expected)</th>
                  <th>AST Model Prediction</th>
                  <th>Evaluation Verdict</th>
                  <th>Diagnostic Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-algo-name">{row.name}</td>
                    <td className="cell-category">{row.category}</td>
                    <td>
                      <code className="eval-table-code-gt">
                        {row.expectedTime}
                      </code>
                    </td>
                    <td>
                      <code className={`eval-table-code-pred ${row.isCorrect ? "pred-match-pass" : "pred-match-fail"}`}>
                        {row.predictedTime || "PARSE_FAIL"}
                      </code>
                    </td>
                    <td>
                      {row.isCorrect ? (
                        <span className="eval-verdict verdict-pass">
                          <FiCheckCircle size={16} /> Passed
                        </span>
                      ) : (
                        <span className="eval-verdict verdict-fail">
                          <FiXCircle size={16} /> Mismatch
                        </span>
                      )}
                    </td>
                    <td>
                      <button 
                        onClick={() => setSelectedItemCode(row)}
                        className="eval-btn-inspect"
                      >
                        <FiCode size={14} /> Inspect AST
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredDetails.length === 0 && (
              <div className="eval-empty-state">
                No algorithms match the selected view filter.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}