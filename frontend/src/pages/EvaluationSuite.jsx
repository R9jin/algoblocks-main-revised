// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCode,
  FiCpu,
  FiDatabase,
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

  // Authentication Logger
  useEffect(() => {
    console.log("🔥 SOP 2 DUAL-DATASET GAUNTLET SUCCESSFULLY MOUNTED!");
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!userStr) navigate("/");
  }, [navigate]);

  const [isRunning, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("System idle.");
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); 
  const [selectedItemCode, setSelectedItemCode] = useState(null);
  
  // Ultimate Gauntlet Selector State ('codeforces' | 'textbook' | 'both')
  const [datasetOption, setDatasetOption] = useState("codeforces");

  useEffect(() => {
    if (!worker) return;
    const handleWorkerMessage = (e) => {
      const { type, progress, currentItem, payload, error } = e.data;
      if (type === "BENCHMARK_PROGRESS") {
        setProgress(progress);
        setStatusText(`Analyzing AST Complexity for: ${currentItem}...`);
      } else if (type === "BENCHMARK_COMPLETE") {
        setResults(payload);
        setIsLoading(false);
        setStatusText("SOP 2 Master Gauntlet Benchmark finished successfully.");
      } else if (type === "BENCHMARK_ERROR") {
        alert(`System Diagnostics Failed: ${error}`);
        setIsLoading(false);
        setStatusText("Engine runtime exception encountered.");
      }
    };
    worker.addEventListener("message", handleWorkerMessage);
    return () => worker.removeEventListener("message", handleWorkerMessage);
  }, [worker]);

  // Master Stitching Network Fetcher
  const fetchActiveGauntletData = async (mode) => {
    setStatusText(`Resolving ${mode.toUpperCase()} dataset sources...`);

    // 1. TEXTBOOK MASTER (ground_truth.json - 106 items)
    if (mode === "textbook") {
      try {
        const res = await fetch("/data/evaluation/ground_truth.json");
        if (!res.ok) throw new Error("ground_truth.json missing");
        return await res.json();
      } catch (err) {
        alert(`Failed to load Textbook dataset: ${err.message}`);
        return [];
      }
    }

    // 2. CODEFORCES MASTER (104 items)
    if (mode === "codeforces") {
      // Try single compiled file first
      try {
        const combRes = await fetch("/data/evaluation/curated_ground_truth.json");
        if (combRes.ok) {
          const combData = await combRes.json();
          if (Array.isArray(combData) && combData.length > 0) return combData;
        }
      } catch (e) {}

      // Defensive Network Stitching: manually loop and staple curated parts 1 through 5!
      setStatusText("Stitching curated Codeforces parts 1 through 5 over network...");
      let stitchedArray = [];
      for (let i = 1; i <= 5; i++) {
        try {
          const partRes = await fetch(`/data/evaluation/curated_part_${i}.json`);
          if (partRes.ok) {
            const partJson = await partRes.json();
            stitchedArray = stitchedArray.concat(partJson);
          }
        } catch (err) {
          console.warn(`Silently skipped missing curated_part_${i}.json`);
        }
      }
      return stitchedArray;
    }

    // 3. MEGA GAUNTLET (Both combined - 210 items)
    if (mode === "both") {
      setStatusText("Assembling Mega Gauntlet...");
      const textbookData = await fetchActiveGauntletData("textbook");
      const codeforcesData = await fetchActiveGauntletData("codeforces");
      return [...textbookData, ...codeforcesData];
    }

    return [];
  };

  const handleStartEvaluation = async () => {
    if (!isEngineReady) {
      alert("The Pyodide Python AST Engine is currently warming up in the background. Please wait 3 seconds.");
      return;
    }

    setIsLoading(true); setProgress(0); setResults(null);
    
    // Fetch and stitch requested target
    const gauntletPayload = await fetchActiveGauntletData(datasetOption);

    if (!gauntletPayload || gauntletPayload.length === 0) {
      alert(`Critical Failure: Could not assemble data points for target [${datasetOption}]. Ensure JSON files exist inside /public/data/evaluation/`);
      setIsLoading(false);
      setStatusText("Dataset assembly failed.");
      return;
    }

    setStatusText(`Deploying AST Gauntlet across ${gauntletPayload.length} algorithms...`);
    worker.postMessage({
      type: "RUN_BENCHMARK_SUITE",
      dataset: gauntletPayload
    });
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

      {/* Top Header Navigation */}
      <header className="workspace-header-purple">
        <div className="wh-left">
          <Link to="/dashboard" className="wh-back-btn eval-exit-link">
            <FiArrowLeft size={18} /><span>Dashboard</span>
          </Link>
          <div className="wh-divider"></div>
          <h2 className="wh-project-title eval-wh-title">
            System Analytical Benchmark Suite <span className="wh-benchmark-badge">SOP 2 GAUNTLET</span>
          </h2>
        </div>

        <div className="wh-right">
          <button 
            onClick={handleStartEvaluation} 
            disabled={isRunning || !isEngineReady}
            className={`eval-btn-run ${isRunning || !isEngineReady ? "eval-run-disabled" : "eval-run-ready"}`}
          >
            {isRunning ? <FiRefreshCw className="spinner" size={16} /> : <FiPlay fill="#fff" size={16} />}
            <span>{isRunning ? `Running Gauntlet (${progress}%)...` : "Execute SOP 2 Benchmark"}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="eval-main-wrapper">
        
        {/* Gauntlet Dataset Selection Control Box */}
        <div className="eval-dataset-selector-box">
          <div className="eval-dataset-info">
            <FiDatabase style={{ color: "#7928CA" }} size={24} />
            <div>
              <strong className="eval-dataset-title">Select AST Benchmarking Gauntlet Target</strong>
              <span className="eval-dataset-subtitle">Choose which master JSON partition to stream into the token classification engine</span>
            </div>
          </div>

          <div className="dataset-btn-group">
            <button 
              onClick={() => !isRunning && setDatasetOption("textbook")}
              className={`dataset-btn ${datasetOption === "textbook" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Textbook Ground Truth (106)
            </button>
            <button 
              onClick={() => !isRunning && setDatasetOption("codeforces")}
              className={`dataset-btn ${datasetOption === "codeforces" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Wild Codeforces Curated (104)
            </button>
            <button 
              onClick={() => !isRunning && setDatasetOption("both")}
              className={`dataset-btn ${datasetOption === "both" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Full Master Suite (210 Combined)
            </button>
          </div>
        </div>

        {/* Status Banner */}
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
          <div className="eval-stats-grid">
            <div className="eval-stat-card" style={{ borderTop: "4px solid #10B981" }}>
              <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }}/> Time Accuracy</div>
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
              <div className="eval-stat-title"><FiCpu style={{ display: "inline", marginRight: "4px" }}/> Space Accuracy</div>
              <div className="eval-stat-value" style={{ color: results.spaceAccuracyRate >= 65 ? "#0EA5E9" : "#F59E0B" }}>
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
              <button onClick={() => setActiveTab("space_pass")} className={`eval-filter-btn ${activeTab === "space_pass" ? "filter-pass-active" : "filter-pass-idle"}`} style={{ backgroundColor: activeTab === "space_pass" ? "#0EA5E9" : "", color: activeTab === "space_pass" ? "#FFFFFF" : "" }}>
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
                {filteredDetails.map((row, idx) => (
                  <tr key={`${row.id}_${idx}`}>
                    <td className="cell-algo-name">
                      {row.name}
                      <span style={{ display: "block", fontSize: "11px", color: "#94A3B8", fontWeight: "normal" }}>{row.id}</span>
                    </td>
                    <td className="cell-category">{row.category}</td>
                    
                    <td>
                      <code className="code-badge-gt" style={{ marginBottom: "4px" }}>
                        T: {row.expectedTime}
                      </code>
                      <code className="code-badge-gt" style={{ backgroundColor: "#E0F2FE", color: "#0369A1", borderColor: "#BAE6FD" }}>
                        S: {row.expectedSpace}
                      </code>
                    </td>

                    <td>
                      <code className={row.isTimeCorrect ? "code-badge-pred-pass" : "code-badge-pred-fail"} style={{ marginBottom: "4px" }}>
                        T: {row.predictedTime}
                      </code>
                      <code className={row.isSpaceCorrect ? "code-badge-pred-pass" : "code-badge-pred-fail"} style={{ backgroundColor: row.isSpaceCorrect ? "#ECFDF5" : "#FEF2F2", color: row.isSpaceCorrect ? "#0EA5E9" : "#991B1B", borderColor: row.isSpaceCorrect ? "#A7F3D0" : "#FECACA" }}>
                        S: {row.predictedSpace}
                      </code>
                    </td>

                    <td>
                      {row.isTimeCorrect ? (
                        <span className="eval-verdict verdict-pass"><FiCheckCircle size={15}/> Pass</span>
                      ) : (
                        <span className="eval-verdict verdict-fail"><FiXCircle size={15}/> Mismatch</span>
                      )}
                    </td>

                    <td>
                      {row.isSpaceCorrect ? (
                        <span className="eval-verdict verdict-pass" style={{ color: "#0EA5E9" }}><FiCheckCircle size={15}/> Pass</span>
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