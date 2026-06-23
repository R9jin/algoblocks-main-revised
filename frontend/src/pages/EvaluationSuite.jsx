// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCode,
  FiCpu,
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

  // Authentication Verification
  useEffect(() => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!userStr) navigate("/");
  }, [navigate]);

  const [isRunning, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("System idle.");
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'time_pass', 'space_pass', 'mismatch'
  const [selectedItemCode, setSelectedItemCode] = useState(null);

  useEffect(() => {
    if (!worker) return;
    const handleWorkerMessage = (e) => {
      const { type, progress, currentItem, payload, error } = e.data;
      if (type === "BENCHMARK_PROGRESS") {
        setProgress(progress);
        setStatusText(`Evaluating AST Complexity for: ${currentItem}...`);
      } else if (type === "BENCHMARK_COMPLETE") {
        setResults(payload);
        setIsLoading(false);
        setStatusText("SOP 2 Benchmark completed successfully.");
      } else if (type === "BENCHMARK_ERROR") {
        alert(`System Diagnostics Failed: ${error}`);
        setIsLoading(false);
        setStatusText("Engine runtime exception encountered.");
      }
    };
    worker.addEventListener("message", handleWorkerMessage);
    return () => worker.removeEventListener("message", handleWorkerMessage);
  }, [worker]);

  const handleStartEvaluation = async () => {
    if (!isEngineReady) {
      alert("The Pyodide Python AST Engine is currently warming up in the background. Please wait 3 seconds.");
      return;
    }
    setIsLoading(true); setProgress(0); setResults(null);
    setStatusText("Fetching Ground Truth Benchmark Dataset...");

    try {
      const res = await fetch("/data/evaluation/ground_truth.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dataset = await res.json();
      worker.postMessage({ type: "RUN_BENCHMARK_SUITE", dataset });
    } catch (err) {
      setStatusText("Attempting fallback curated dataset fetch...");
      try {
        const fall = await fetch("/data/evaluation/curated_part_1.json");
        const dataset = await fall.json();
        worker.postMessage({ type: "RUN_BENCHMARK_SUITE", dataset });
      } catch (e) {
        alert("Critical Failure: Could not locate benchmark dataset JSON in /public/data/evaluation/");
        setIsLoading(false); setStatusText("Dataset fetch failed.");
      }
    }
  };

  const filteredDetails = (results?.details || []).filter((item) => {
    if (activeTab === "time_pass") return item.isTimeCorrect;
    if (activeTab === "space_pass") return item.isSpaceCorrect;
    if (activeTab === "mismatch") return (!item.isTimeCorrect || !item.isSpaceCorrect);
    return true;
  });

  return (
    <div className="eval-suite-container">
      
      {/* Code Inspection Modal */}
      {selectedItemCode && (
        <div className="modal-overlay" onClick={() => setSelectedItemCode(null)}>
          <div className="eval-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="eval-modal-header">
              <div>
                <h3 className="eval-modal-title">{selectedItemCode.name}</h3>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>ID: {selectedItemCode.id}</span>
              </div>
              <div className="eval-modal-badges">
                <span className="eval-modal-badge-gt">
                  GT Time: {selectedItemCode.expectedTime} | Space: {selectedItemCode.expectedSpace}
                </span>
              </div>
            </div>
            
            <div className="eval-section-label">Source Code Snippet</div>
            <pre className="eval-code-preview">{selectedItemCode.codeSnippet}</pre>

            <div className="eval-section-label">AST VM Profiler Explanation & Trace</div>
            <div className="eval-explanation-box">{selectedItemCode.explanation}</div>

            <div className="eval-modal-footer">
              <button onClick={() => setSelectedItemCode(null)} className="eval-btn-close">Close View</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="workspace-header-purple">
        <div className="wh-left">
          <Link to="/dashboard" className="wh-back-btn eval-exit-link">
            <FiArrowLeft size={18} /><span>Dashboard</span>
          </Link>
          <div className="wh-divider"></div>
          <h2 className="wh-project-title eval-wh-title">
            System Analytical Benchmark Suite <span className="wh-benchmark-badge">SOP 2 BENCHMARK</span>
          </h2>
        </div>

        <div className="wh-right">
          <button 
            onClick={handleStartEvaluation} 
            disabled={isRunning || !isEngineReady}
            className={`eval-btn-run ${isRunning || !isEngineReady ? "eval-run-disabled" : "eval-run-ready"}`}
          >
            {isRunning ? <FiRefreshCw className="spinner" size={16} /> : <FiPlay fill="#fff" size={16} />}
            <span>{isRunning ? `Running Suite (${progress}%)...` : "Execute SOP 2 Benchmark"}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="eval-main-wrapper">
        
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

        {isRunning && (
          <div className="eval-progress-track">
            <div className="eval-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        {/* SOP 2 DUAL KPI STATS GRID */}
        {results && (
          <div className="eval-stats-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            
            <div className="eval-stat-card" style={{ borderTop: "4px solid #10B981" }}>
              <div className="eval-stat-title"><FiClock style={{ display:"inline", marginRight:"4px" }}/> Time Accuracy</div>
              <div className={`eval-stat-value ${results.timeAccuracyRate >= 65 ? "val-success" : "val-warning"}`}>
                {results.timeAccuracyRate}%
              </div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Time Passed</div>
              <div className="eval-stat-value val-success">{results.timePassed}</div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Time Mismatches</div>
              <div className={`eval-stat-value ${results.timeFailed > 0 ? "val-danger" : "val-muted"}`}>{results.timeFailed}</div>
            </div>

            <div className="eval-stat-card" style={{ borderTop: "4px solid #0EA5E9" }}>
              <div className="eval-stat-title"><FiCpu style={{ display:"inline", marginRight:"4px" }}/> Space Accuracy</div>
              <div className={`eval-stat-value ${results.spaceAccuracyRate >= 65 ? "val-success" : "val-warning"}`} style={{ color: results.spaceAccuracyRate >= 65 ? "#0EA5E9" : "#F59E0B" }}>
                {results.spaceAccuracyRate}%
              </div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Space Passed</div>
              <div className="eval-stat-value" style={{ color: "#0EA5E9" }}>{results.spacePassed}</div>
            </div>

            <div className="eval-stat-card">
              <div className="eval-stat-title">Space Mismatches</div>
              <div className={`eval-stat-value ${results.spaceFailed > 0 ? "val-danger" : "val-muted"}`}>{results.spaceFailed}</div>
            </div>

          </div>
        )}

        {/* Detailed Audit Table */}
        {results && (
          <div className="eval-table-container">
            
            <div className="eval-filter-navbar">
              <span className="eval-filter-label">Filter Output:</span>
              <button onClick={() => setActiveTab("all")} className={`eval-filter-btn ${activeTab === "all" ? "filter-all-active" : "filter-all-idle"}`}>
                All Algorithms ({results.details.length})
              </button>
              <button onClick={() => setActiveTab("time_pass")} className={`eval-filter-btn ${activeTab === "time_pass" ? "filter-pass-active" : "filter-pass-idle"}`}>
                Time Match ({results.timePassed})
              </button>
              <button onClick={() => setActiveTab("space_pass")} className={`eval-filter-btn ${activeTab === "space_pass" ? "filter-pass-active" : "filter-pass-idle"}`} style={{ backgroundColor: activeTab === "space_pass" ? "#0EA5E9" : "", borderColor: activeTab === "space_pass" ? "#0EA5E9" : "" }}>
                Space Match ({results.spacePassed})
              </button>
              <button onClick={() => setActiveTab("mismatch")} className={`eval-filter-btn ${activeTab === "mismatch" ? "filter-fail-active" : "filter-fail-idle"}`}>
                Any Mismatch ({results.details.length - results.perfectPassed})
              </button>
            </div>

            <table className="eval-table">
              <thead>
                <tr className="eval-table-header">
                  <th>Algorithm Title</th>
                  <th>Domain Category</th>
                  <th>Ground Truth (T / S)</th>
                  <th>AST Model Output (T / S)</th>
                  <th>Time Status</th>
                  <th>Space Status</th>
                  <th>Diagnostic</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-algo-name">
                      {row.name}
                      <span style={{ display:"block", fontSize:"11px", color:"#94A3B8", fontWeight:"normal" }}>{row.id}</span>
                    </td>
                    <td className="cell-category">{row.category}</td>
                    
                    {/* Ground truth pill */}
                    <td>
                      <code className="code-badge-gt" style={{ display:"block", marginBottom:"4px" }}>
                        T: {row.expectedTime}
                      </code>
                      <code className="code-badge-gt" style={{ display:"block", backgroundColor:"#E0F2FE", color:"#0369A1", borderColor:"#BAE6FD" }}>
                        S: {row.expectedSpace}
                      </code>
                    </td>

                    {/* Prediction pill */}
                    <td>
                      <code className={row.isTimeCorrect ? "code-badge-pred-pass" : "code-badge-pred-fail"} style={{ display:"block", marginBottom:"4px" }}>
                        T: {row.predictedTime}
                      </code>
                      <code className={row.isSpaceCorrect ? "code-badge-pred-pass" : "code-badge-pred-fail"} style={{ display:"block", backgroundColor: row.isSpaceCorrect ? "#ECFDF5" : "#FEF2F2", color: row.isSpaceCorrect ? "#0EA5E9" : "#991B1B", borderColor: row.isSpaceCorrect ? "#A7F3D0" : "#FECACA" }}>
                        S: {row.predictedSpace}
                      </code>
                    </td>

                    {/* Time Verdict */}
                    <td>
                      {row.isTimeCorrect ? (
                        <span className="eval-verdict verdict-pass"><FiCheckCircle size={15}/> Pass</span>
                      ) : (
                        <span className="eval-verdict verdict-fail"><FiXCircle size={15}/> Mismatch</span>
                      )}
                    </td>

                    {/* Space Verdict */}
                    <td>
                      {row.isSpaceCorrect ? (
                        <span className="eval-verdict verdict-pass" style={{ color:"#0EA5E9" }}><FiCheckCircle size={15}/> Pass</span>
                      ) : (
                        <span className="eval-verdict verdict-fail"><FiXCircle size={15}/> Mismatch</span>
                      )}
                    </td>

                    <td>
                      <button onClick={() => setSelectedItemCode(row)} className="eval-btn-inspect">
                        <FiCode size={14} /> Inspect AST
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredDetails.length === 0 && (
              <div className="eval-empty-state">No algorithms match the selected filter.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}