// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiBookOpen,
  FiCheckCircle,
  FiClock,
  FiCode,
  FiCpu,
  FiDatabase,
  FiHelpCircle,
  FiLayers,
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

  useEffect(() => {
    console.log("DUAL-DATASET GAUNTLET & SCIKIT-LEARN AUDIT MOUNTED!");
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!userStr) navigate("/");
  }, [navigate]);

  const [isRunning, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("System idle.");
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); 
  const [selectedItemCode, setSelectedItemCode] = useState(null);
  const [datasetOption, setDatasetOption] = useState("codeforces");

  // Explainer Modal State & Interactive Sandbox State
  const [isMetricsHelpOpen, setIsMetricsHelpOpen] = useState(false);
  const [sandboxTP, setSandboxTP] = useState(80);
  const [sandboxFP, setSandboxFP] = useState(10);
  const [sandboxFN, setSandboxFN] = useState(10);

  // Real-time sandbox calculations
  const simPrecision = sandboxTP / (sandboxTP + sandboxFP) || 0;
  const simRecall = sandboxTP / (sandboxTP + sandboxFN) || 0;
  const simF1 = (simPrecision + simRecall > 0) ? (2 * simPrecision * simRecall) / (simPrecision + simRecall) : 0;

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
        setStatusText("Master Gauntlet & Classification Matrix built successfully.");
      } else if (type === "BENCHMARK_ERROR") {
        alert(`System Diagnostics Failed: ${error}`);
        setIsLoading(false);
        setStatusText("Engine runtime exception encountered.");
      }
    };
    worker.addEventListener("message", handleWorkerMessage);
    return () => worker.removeEventListener("message", handleWorkerMessage);
  }, [worker]);

  const fetchActiveGauntletData = async (mode) => {
    setStatusText(`Resolving ${mode.toUpperCase()} dataset sources...`);

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

    if (mode === "codeforces") {
      try {
        const combRes = await fetch("/data/evaluation/curated_ground_truth.json");
        if (combRes.ok) {
          const combData = await combRes.json();
          if (Array.isArray(combData) && combData.length > 0) return combData;
        }
      } catch (e) {}

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
    
    const gauntletPayload = await fetchActiveGauntletData(datasetOption);

    if (!gauntletPayload || gauntletPayload.length === 0) {
      alert(`Critical Failure: Could not assemble data points for target [${datasetOption}]. Ensure JSON files exist inside /public/data/evaluation/`);
      setIsLoading(false);
      setStatusText("Dataset assembly failed.");
      return;
    }

    setStatusText(`Deploying AST Gauntlet across ${gauntletPayload.length} algorithms...`);
    worker.postMessage({ type: "RUN_BENCHMARK_SUITE", dataset: gauntletPayload });
  };

  const filteredDetails = (results?.details || []).filter((item) => {
    if (activeTab === "time_pass") return item.isTimeCorrect;
    if (activeTab === "space_pass") return item.isSpaceCorrect;
    if (activeTab === "mismatch") return (!item.isTimeCorrect || !item.isSpaceCorrect);
    return true;
  });

  const renderF1Badge = (scoreStr) => {
    const s = parseFloat(scoreStr);
    if (isNaN(s)) return <span>-</span>;
    if (s >= 0.80) return <span className="f1-excellent">{scoreStr}</span>;
    if (s >= 0.60) return <span className="f1-good">{scoreStr}</span>;
    if (s >= 0.40) return <span className="f1-warning">{scoreStr}</span>;
    return <span className="f1-poor">{scoreStr}</span>;
  };

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

      {/* Scikit-Learn Classification Metrics Explainer & Interactive Sandbox Modal */}
      {isMetricsHelpOpen && (
        <div className="modal-overlay" onClick={() => setIsMetricsHelpOpen(false)}>
          <div className="eval-modal-content metrics-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eval-modal-header">
              <div>
                <h3 className="eval-modal-title">Understanding Classification Metrics</h3>
                <span className="eval-dataset-subtitle">A practical guide to Precision, Recall, F1-Score, and Support</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(false)} className="eval-btn-close-sm">
                <FiXCircle size={22} />
              </button>
            </div>

            <div className="metrics-help-body">
              <div className="metric-card-info">
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Precision</span>
                  <span className="metric-formula">TP / (TP + FP)</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Quality of Predictions&quot;</strong> — When the AST engine predicts an algorithm has a specific complexity (e.g., <code>O(N)</code>), Precision measures how often that prediction is correct. A score of 1.0 means every time it guessed <code>O(N)</code>, it was absolutely right.
                </p>
              </div>

              <div className="metric-card-info">
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>Recall</span>
                  <span className="metric-formula">TP / (TP + FN)</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Detection Completeness&quot;</strong> — Out of all algorithms that *actually* have a specific complexity in the ground truth, Recall measures how many the AST engine successfully detected. A score of 1.0 means it didn&apos;t miss a single <code>O(N)</code> algorithm.
                </p>
              </div>

              <div className="metric-card-info">
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" }}>F1-Score ( &amp; F2 )</span>
                  <span className="metric-formula">2 × (P × R) / (P + R)</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Harmonic Balance&quot;</strong> — F1 is the harmonic mean of Precision and Recall. It punishes extreme disparities (e.g., 1.0 recall but 0.1 precision). <br />
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                    <FiBookOpen style={{ display: "inline", marginRight: "4px" }} /> <strong>What about F2-Score?</strong> The F2-Score weights Recall twice as heavily as Precision. In automated grading, F2 is often monitored because missing a student&apos;s correct algorithm (False Negative) is considered more harmful than accidentally passing an inefficient one (False Positive).
                  </span>
                </p>
              </div>

              <div className="metric-card-info">
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}>Support</span>
                  <span className="metric-formula">Count ( N )</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Sample Weight&quot;</strong> — The actual occurrence count of ground truth test cases belonging to this complexity class inside the benchmarking gauntlet.
                </p>
              </div>

              {/* Interactive Demo Sandbox inside Modal */}
              <div className="metric-interactive-box">
                <h4 className="interactive-box-title"><FiCpu style={{ display: "inline", marginRight: "6px", color: "#7928CA" }}/> Interactive Metric Sandbox</h4>
                <p className="interactive-box-subtitle">Adjust the slider values below to see how false alarms and missed detections alter the final Scikit-Learn numbers in real time:</p>
                
                <div className="sandbox-controls">
                  <div className="slider-group">
                    <label>True Positives (Correct Detections): <strong>{sandboxTP}</strong></label>
                    <input type="range" min="1" max="100" value={sandboxTP} onChange={(e) => setSandboxTP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>False Positives (False Alarms / Guessed Wrong): <strong>{sandboxFP}</strong></label>
                    <input type="range" min="0" max="100" value={sandboxFP} onChange={(e) => setSandboxFP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>False Negatives (Missed Detections / Failed to Spot): <strong>{sandboxFN}</strong></label>
                    <input type="range" min="0" max="100" value={sandboxFN} onChange={(e) => setSandboxFN(parseInt(e.target.value))} />
                  </div>
                </div>

                <div className="sandbox-results">
                  <div className="sandbox-stat">
                    <span>Simulated Precision</span>
                    <strong style={{ color: "#1D4ED8" }}>{simPrecision.toFixed(2)}</strong>
                  </div>
                  <div className="sandbox-stat">
                    <span>Simulated Recall</span>
                    <strong style={{ color: "#065F46" }}>{simRecall.toFixed(2)}</strong>
                  </div>
                  <div className="sandbox-stat" style={{ backgroundColor: "#F3E8FF", borderColor: "#D8B4FE" }}>
                    <span style={{ color: "#6B21A8" }}>Simulated F1-Score</span>
                    <strong style={{ color: "#6D28D9" }}>{simF1.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="eval-modal-footer">
              <button onClick={() => setIsMetricsHelpOpen(false)} className="eval-btn-close">Got It, Close Guide</button>
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
            System Analytical Benchmark Suite <span className="wh-benchmark-badge">Benchmark Testing</span>
          </h2>
        </div>

        <div className="wh-right">
          <button 
            onClick={handleStartEvaluation} 
            disabled={isRunning || !isEngineReady}
            className={`eval-btn-run ${isRunning || !isEngineReady ? "eval-run-disabled" : "eval-run-ready"}`}
          >
            {isRunning ? <FiRefreshCw className="spinner" size={16} /> : <FiPlay fill="#fff" size={16} />}
            <span>{isRunning ? `Running Benchmark (${progress}%)...` : "Execute Benchmark"}</span>
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
              CodeComplex Curated (104)
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

        {/* SCIKIT-LEARN AUTHENTIC CLASSIFICATION REPORT SECTION */}
        {results && results.timeReport && results.spaceReport && (
          <div className="eval-sklearn-container">
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Advanced Classification Metrics (Scikit-Learn Audit)
                </strong>
                <span className="eval-sklearn-subtitle">Per-class asymptotic token precision, recall, and harmonic F1-score distributions</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(true)} className="eval-btn-metrics-help">
                <FiHelpCircle size={16} /> Understand Metric Numbers
              </button>
            </div>

            <div className="eval-sklearn-grid">
              
              {/* TABLE 1: TIME COMPLEXITY REPORT */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Time Complexity Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Support: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP). Correctness rate when predicting this exact class.">Precision ⓘ</th>
                      <th title="Recall = TP / (TP + FN). Detection rate across all actual cases of this class.">Recall ⓘ</th>
                      <th title="F1-Score = Harmonic mean of Precision and Recall.">F1-Score ⓘ</th>
                      <th title="Support = Ground truth occurrence count.">Support ⓘ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(results.timeReport.perClass).map((cKey) => {
                      const row = results.timeReport.perClass[cKey];
                      return (
                        <tr key={`time_${cKey}`}>
                          <td>{cKey}</td>
                          <td>{row.precision}</td>
                          <td>{row.recall}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td>{row.support}</td>
                        </tr>
                      );
                    })}

                    {/* Divider rows */}
                    <tr className="tr-divider">
                      <td>accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td>{(results.timePassed / results.totalTested).toFixed(2)}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{results.timeReport.macroAvg.precision}</td>
                      <td>{results.timeReport.macroAvg.recall}</td>
                      <td>{results.timeReport.macroAvg.f1Score}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{results.timeReport.weightedAvg.precision}</td>
                      <td>{results.timeReport.weightedAvg.recall}</td>
                      <td>{results.timeReport.weightedAvg.f1Score}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLE 2: SPACE COMPLEXITY REPORT */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Space Complexity Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Support: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP). Correctness rate when predicting this exact class.">Precision ⓘ</th>
                      <th title="Recall = TP / (TP + FN). Detection rate across all actual cases of this class.">Recall ⓘ</th>
                      <th title="F1-Score = Harmonic mean of Precision and Recall.">F1-Score ⓘ</th>
                      <th title="Support = Ground truth occurrence count.">Support ⓘ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(results.spaceReport.perClass).map((cKey) => {
                      const row = results.spaceReport.perClass[cKey];
                      return (
                        <tr key={`space_${cKey}`}>
                          <td>{cKey}</td>
                          <td>{row.precision}</td>
                          <td>{row.recall}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td>{row.support}</td>
                        </tr>
                      );
                    })}

                    {/* Divider rows */}
                    <tr className="tr-divider">
                      <td>accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td>{(results.spacePassed / results.totalTested).toFixed(2)}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{results.spaceReport.macroAvg.precision}</td>
                      <td>{results.spaceReport.macroAvg.recall}</td>
                      <td>{results.spaceReport.macroAvg.f1Score}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{results.spaceReport.weightedAvg.precision}</td>
                      <td>{results.spaceReport.weightedAvg.recall}</td>
                      <td>{results.spaceReport.weightedAvg.f1Score}</td>
                      <td>{results.totalTested}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

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