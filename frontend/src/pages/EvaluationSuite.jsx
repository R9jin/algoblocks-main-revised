// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
  FiActivity,
  FiArrowLeft,
  FiCheckCircle, FiClock, FiCode,
  FiCpu, FiDatabase,
  FiDownload,
  FiHelpCircle, FiLayers, FiPlay,
  FiRefreshCw, FiXCircle, FiZap
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
  const [datasetOption, setDatasetOption] = useState("both");

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
          setStatusText(`Analyzing algorithm complexity for: ${currentItem}...`);
        } else if (type === "BENCHMARK_COMPLETE") {
          setResults(payload);
          setIsLoading(false);
          setStatusText("Benchmark evaluation completed successfully. Classification reports have been generated.");
        } else if (type === "BENCHMARK_ERROR") {
          alert(`Benchmark evaluation failed: ${error}`);
          setIsLoading(false);
          setStatusText("Benchmark evaluation terminated due to an unexpected error.");
      }
    };
    worker.addEventListener("message", handleWorkerMessage);
    return () => worker.removeEventListener("message", handleWorkerMessage);
  }, [worker]);

  const safeFetchText = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith("<!doctype") || text.trim().toLowerCase().startsWith("<html")) {
        return null; 
      }
      return text;
    } catch (e) {
      return null;
    }
  };

  const safeFetchJson = async (url) => {
    const text = await safeFetchText(url);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  const parseCSV = (csvText) => {
    const results = [];
    let isInsideQuotes = false;
    let currentVal = '';
    let row = [];
    
    csvText = csvText.replace(/\r\n/g, '\n');

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (isInsideQuotes && char === '\n' && currentVal.length > 15000) {
          isInsideQuotes = false;
      }

      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; 
      } else if (char === '"') {
        isInsideQuotes = !isInsideQuotes;
      } else if (char === ',' && !isInsideQuotes) {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' && !isInsideQuotes) {
        row.push(currentVal);
        results.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    if (currentVal || row.length > 0) {
      row.push(currentVal);
      results.push(row);
    }
    return results;
  };

  const fetchActiveGauntletData = async (mode) => {
    setStatusText(`Resolving ${mode.toUpperCase()} dataset sources...`);

    if (mode === "textbook") {
      const data = await safeFetchJson("/data/evaluation/ground_truth.json");
      if (!data) return [];
      return data;
    }

    if (mode === "codeforces") {
      const combData = await safeFetchJson("/data/evaluation/curated_ground_truth.json");
      if (Array.isArray(combData) && combData.length > 0) return combData;

      let stitchedArray = [];
      for (let i = 1; i <= 5; i++) {
        const partJson = await safeFetchJson(`/data/evaluation/curated_part_${i}.json`);
        if (partJson) {
          stitchedArray = stitchedArray.concat(partJson);
        }
      }
      return stitchedArray;
    }

    if (mode === "tasty") {
      setStatusText("Fetching Tasty Processed Dataset (CSV)...");
      const csvText = await safeFetchText("/data/evaluation/processed/algo_blocks_dataset.csv");
      if (!csvText) {
        alert("Failed to load Tasty dataset: algo_blocks_dataset.csv missing or HTML fallback triggered.");
        return [];
      }
      const rows = parseCSV(csvText);
      if (rows.length < 2) return [];
      
      const headers = rows[0].map(h => h.trim());
      const codeIdx = headers.indexOf('code');
      const spaceIdx = headers.indexOf('space_complexity');
      const timeIdx = headers.indexOf('time_complexity');
      
      const dataset = [];
      const validComplexities = ['1', 'constant', 'n', 'linear', 'n^2', 'quadratic', 'n^3', 'cubic', 'logn', 'log(n)', 'nlogn', 'n log n', 'n*logn', 'np', 'v+e', 'n*m'];

      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length < headers.length) continue; 
        
        let codeText = rows[i][codeIdx] || '';
        let spaceComp = rows[i][spaceIdx] ? rows[i][spaceIdx].trim() : "";
        let timeComp = rows[i][timeIdx] ? rows[i][timeIdx].trim() : "";
        
        if (!spaceComp && !timeComp && codeText.includes(',')) {
           const parts = codeText.split(',');
           if (parts.length >= 3) {
               let possibleTime = parts[parts.length - 1].trim().replace(/"/g, '').toLowerCase();
               let possibleSpace = parts[parts.length - 2].trim().replace(/"/g, '').toLowerCase();
               
               let isTimeValid = validComplexities.includes(possibleTime) || possibleTime.startsWith('o(');
               let isSpaceValid = validComplexities.includes(possibleSpace) || possibleSpace.startsWith('o(');
               
               if (isTimeValid && isSpaceValid) {
                   timeComp = possibleTime;
                   spaceComp = possibleSpace;
                   parts.pop(); 
                   parts.pop(); 
                   codeText = parts.join(','); 
               }
           }
        }

        codeText = codeText
            .replace(/\\n/g, '\n')           
            .replace(/\\t/g, '    ')         
            .replace(/^["']|["']$/g, '')     
            .replace(/^\s+|\s+$/g, '');      
        
        dataset.push({
          id: `tasty_csv_${i}`,
          name: `Tasty Algo ${i}`,
          code: codeText,
          expected_overall_space: spaceComp || "O(1)",
          expected_overall_time: timeComp || "O(1)",
          category: "Tasty Processed CSV"
        });
      }
      return dataset;
    }

    if (mode === "both") {
      setStatusText("Assembling Mega Gauntlet...");
      const textbookData = await fetchActiveGauntletData("textbook");
      const codeforcesData = await fetchActiveGauntletData("codeforces");
      const tastyData = await fetchActiveGauntletData("tasty");
      return [...textbookData, ...codeforcesData, ...tastyData];
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
      alert(`Critical Failure: Could not assemble data points for target [${datasetOption}]. Ensure JSON/CSV files exist inside /public/data/evaluation/`);
      setIsLoading(false);
      setStatusText("Dataset assembly failed.");
      return;
    }

    setStatusText(`Deploying AST Gauntlet across ${gauntletPayload.length} algorithms...`);
    worker.postMessage({ type: "RUN_BENCHMARK_SUITE", dataset: gauntletPayload });
  };

  const downloadFailuresLog = (details) => {
    const mismatches = details.filter(d => !d.isCompletelyCorrect);
    let logText = "=== EVALUATION FAILURES LOG ===\n\n";
    
    if (mismatches.length === 0) {
        logText += "No mismatches found. Perfect accuracy!\n";
    } else {
        mismatches.forEach(m => {
            logText += `[${m.id} - ${m.name}]\n`;
            logText += `Time Expected: ${m.expectedTime} | Actual: ${m.predictedTime}\n`;
            logText += `Space Expected: ${m.expectedSpace} | Actual: ${m.predictedSpace}\n`;
            logText += `Diagnostic Explanation: ${m.explanation}\n`;
            logText += `Code Snippet:\n${m.codeSnippet.slice(0, 300)}...\n`;
            logText += `${'-'.repeat(60)}\n\n`;
        });
    }
    
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evaluation_failures_log.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredDetails = (results?.details || []).filter((item) => {
    if (activeTab === "time_pass") return item.isTimeCorrect;
    if (activeTab === "space_pass") return item.isSpaceCorrect;
    if (activeTab === "mismatch") return (!item.isTimeCorrect || !item.isSpaceCorrect);
    return true;
  });

  const renderMetricCell = (val) => {
    if (val === undefined || val === null || val === "-" || val === "") return <span>-</span>;
    const num = parseFloat(val);
    if (isNaN(num)) return <span>{val}</span>;
    
    const pct = num <= 1.0 ? num * 100 : num;
    const pctFormatted = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1).replace('.0', '')}%`;
    
    return (
      <div className="dual-metric-cell">
        <strong className="metric-pct">{pctFormatted}</strong>
        <span className="metric-raw">({num <= 1.0 ? num.toFixed(2) : num})</span>
      </div>
    );
  };

  const renderF1Badge = (scoreStr) => {
    const s = parseFloat(scoreStr);
    if (isNaN(s)) return <span>-</span>;
    
    const pct = s <= 1.0 ? s * 100 : s;
    const pctFormatted = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1).replace('.0', '')}%`;
    
    if (s >= 0.80) return <span className="f1-excellent">{pctFormatted} <small className="f1-sub">({s.toFixed(2)})</small></span>;
    if (s >= 0.60) return <span className="f1-good">{pctFormatted} <small className="f1-sub">({s.toFixed(2)})</small></span>;
    if (s >= 0.40) return <span className="f1-warning">{pctFormatted} <small className="f1-sub">({s.toFixed(2)})</small></span>;
    return <span className="f1-poor">{pctFormatted} <small className="f1-sub">({s.toFixed(2)})</small></span>;
  };

  return (
    <div className="eval-suite-container">
      
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

      {isMetricsHelpOpen && (
        <div className="modal-overlay" onClick={() => setIsMetricsHelpOpen(false)}>
          <div className="eval-modal-content metrics-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eval-modal-header">
              <div>
                <h3 className="eval-modal-title">Understanding Classification Performance Metrics</h3>
                <span className="eval-dataset-subtitle">Learn how Precision, Recall, F1-Score, and Support are used to evaluate the performance of the Complexity Analyzer.</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(false)} className="eval-btn-close-sm">
                <FiXCircle size={22} />
              </button>
            </div>

            <div className="metrics-help-body">
              <div className="metric-card-info" style={{ borderLeft: "4px solid #3B82F6" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Precision (Trustworthiness)</span>
                  <span className="metric-formula">TP / (TP + FP)</span>
                </div>
                <p className="metric-desc"><strong>Measures the correctness of positive predictions.</strong> Minimizes false positive classifications.</p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #10B981" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>Recall (Detection Coverage)</span>
                  <span className="metric-formula">TP / (TP + FN)</span>
                </div>
                <p className="metric-desc"><strong>Measures the ability to find all valid complexity patterns.</strong> Minimizes false negatives.</p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #8B5CF6" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" }}>F1-Score (Harmonic Mean)</span>
                  <span className="metric-formula">2 × (P × R) / (P + R)</span>
                </div>
                <p className="metric-desc"><strong>Provides a balanced evaluation of both accuracy and coverage.</strong></p>
              </div>
            </div>

            <div className="eval-modal-footer">
              <button onClick={() => setIsMetricsHelpOpen(false)} className="eval-btn-close">Return to Matrix</button>
            </div>
          </div>
        </div>
      )}

      <header className="workspace-header-purple">
        <div className="wh-left">
          <Link to="/dashboard" className="wh-back-btn eval-exit-link">
            <FiArrowLeft size={18} /><span>Dashboard</span>
          </Link>
          <div className="wh-divider"></div>
          <h2 className="wh-project-title eval-wh-title">
            System Complexity Analyzer Benchmark<span className="wh-benchmark-badge">Benchmark Testing</span>
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

      <div className="eval-main-wrapper">
        
        <div className="eval-dataset-selector-box">
          <div className="eval-dataset-info">
            <FiDatabase style={{ color: "#7928CA" }} size={24} />
            <div>
              <strong className="eval-dataset-title">Select Benchmark Dataset</strong>
              <span className="eval-dataset-subtitle">Select the benchmark dataset to evaluate the accuracy and performance of the system's Complexity Analyzer.</span>
            </div>
          </div>

          <div className="dataset-btn-group">
            <button onClick={() => !isRunning && setDatasetOption("textbook")} className={`dataset-btn ${datasetOption === "textbook" ? "active-ds" : ""}`} disabled={isRunning}>Textbook Ground Truth (106)</button>
            <button onClick={() => !isRunning && setDatasetOption("codeforces")} className={`dataset-btn ${datasetOption === "codeforces" ? "active-ds" : ""}`} disabled={isRunning}>CodeComplex Curated (104)</button>
            <button onClick={() => !isRunning && setDatasetOption("tasty")} className={`dataset-btn ${datasetOption === "tasty" ? "active-ds" : ""}`} disabled={isRunning}>Tasty Dataset (CSV)</button>
            <button onClick={() => !isRunning && setDatasetOption("both")} className={`dataset-btn ${datasetOption === "both" ? "active-ds" : ""}`} disabled={isRunning}>Full Master Suite (All Combined)</button>
          </div>
        </div>

        <div className="eval-status-banner">
          <div className="eval-status-group">
            <span className="eval-status-label">Execution Target:</span>
            <strong className="eval-status-target">{statusText}</strong>
          </div>
          <div className="eval-status-group">
            {results && results.details.filter(d => !d.isCompletelyCorrect).length > 0 && (
                <button className="eval-btn-inspect" onClick={() => downloadFailuresLog(results.details)} style={{marginRight: "15px", display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px"}}>
                   <FiDownload size={14} /> Download Error Logs (TXT)
                </button>
            )}
            <span className="eval-status-label-sm">AST Virtual Machine:</span>
            {isEngineReady ? (
              <span className="eval-vm-ready">● Pyodide Wasm AST Active</span>
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

        {results && (
          <div className="eval-stats-grid">
            <div className="eval-stat-card" style={{ borderTop: "4px solid #10B981" }}>
              <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }}/> Time Accuracy</div>
              <div className={`eval-stat-value ${results.timeAccuracyRate >= 65 ? "val-success" : "val-warning"}`}>{results.timeAccuracyRate}%</div>
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
              <div className="eval-stat-value" style={{ color: results.spaceAccuracyRate >= 65 ? "#0EA5E9" : "#F59E0B" }}>{results.spaceAccuracyRate}%</div>
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

        {/* ---> NEW SECTION: PYODIDE WASM CLIENT EFFICIENCY AUDIT <--- */}
        {results?.efficiency && (
          <div style={{ marginTop: "20px", marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <FiZap style={{ color: "#F59E0B" }} size={20} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#1E293B", margin: 0 }}>
                Pyodide Wasm Sandbox Efficiency & Footprint Audit
              </h3>
            </div>

            <div className="eval-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              
              <div className="eval-stat-card" style={{ borderTop: "4px solid #8B5CF6" }}>
                <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }}/> Suite Elapsed Time</div>
                <div className="eval-stat-value" style={{ color: "#7928CA" }}>
                  {results.efficiency.totalExecutionSec}s
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                  {results.efficiency.totalLines} source lines analyzed
                </div>
              </div>

              <div className="eval-stat-card" style={{ borderTop: "4px solid #3B82F6" }}>
                <div className="eval-stat-title"><FiActivity style={{ display: "inline", marginRight: "4px" }}/> Code Throughput</div>
                <div className="eval-stat-value" style={{ color: "#2563EB" }}>
                  {results.efficiency.throughputAlgos} <span style={{fontSize: "13px", fontWeight: 600}}>algos/s</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                  {results.efficiency.throughputLines} lines / sec
                </div>
              </div>

              <div className="eval-stat-card" style={{ borderTop: "4px solid #10B981" }}>
                <div className="eval-stat-title"><FiCpu style={{ display: "inline", marginRight: "4px" }}/> Latency (Median / P95)</div>
                <div className="eval-stat-value" style={{ color: "#059669" }}>
                  {results.efficiency.medianTimeMs} <span style={{fontSize: "13px", fontWeight: 600}}>ms</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                  Mean: {results.efficiency.meanTimeMs}ms | P95: {results.efficiency.p95TimeMs}ms
                </div>
              </div>

              <div className="eval-stat-card" style={{ borderTop: "4px solid #F59E0B" }}>
                <div className="eval-stat-title"><FiDatabase style={{ display: "inline", marginRight: "4px" }}/> Wasm AST RAM Peak</div>
                <div className="eval-stat-value" style={{ color: "#D97706" }}>
                  {results.efficiency.peakAstMemMB} <span style={{fontSize: "13px", fontWeight: 600}}>MB</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                  Mean Dynamic: {results.efficiency.meanAstMemKB} KB/case
                </div>
              </div>

            </div>
          </div>
        )}

        {results && results.timeReport && results.spaceReport && (
          <div className="eval-sklearn-container">
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title"><FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Classification Performance Report</strong>
                <span className="eval-sklearn-subtitle">Performance statistics generated from the benchmark dataset.</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(true)} className="eval-btn-metrics-help"><FiHelpCircle size={16} /> Understand Percentages</button>
            </div>

            <div className="eval-sklearn-grid">
              {/* Table 1: Time */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title"><span>Time Validation Matrix</span></div>
                <table className="sklearn-table">
                  <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1-Score</th><th>Support</th></tr></thead>
                  <tbody>
                    {Object.keys(results.timeReport.perClass).map((cKey) => {
                      const row = results.timeReport.perClass[cKey];
                      return (<tr key={`time_${cKey}`}><td className="td-class-code">{cKey}</td><td>{renderMetricCell(row.precision)}</td><td>{renderMetricCell(row.recall)}</td><td>{renderF1Badge(row.f1Score)}</td><td className="td-support-count"><strong>{row.support}</strong></td></tr>);
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table 2: Space */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title"><span>Space Validation Matrix</span></div>
                <table className="sklearn-table">
                  <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1-Score</th><th>Support</th></tr></thead>
                  <tbody>
                    {Object.keys(results.spaceReport.perClass).map((cKey) => {
                      const row = results.spaceReport.perClass[cKey];
                      return (<tr key={`space_${cKey}`}><td className="td-class-code">{cKey}</td><td>{renderMetricCell(row.precision)}</td><td>{renderMetricCell(row.recall)}</td><td>{renderF1Badge(row.f1Score)}</td><td className="td-support-count"><strong>{row.support}</strong></td></tr>);
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {results && (
          <div className="eval-table-container">
            <div className="eval-filter-navbar">
              <span className="eval-filter-label">Filter Output:</span>
              <button onClick={() => setActiveTab("all")} className={`eval-filter-btn ${activeTab === "all" ? "filter-all-active" : "filter-all-idle"}`}>All ({results.details.length})</button>
              <button onClick={() => setActiveTab("time_pass")} className={`eval-filter-btn ${activeTab === "time_pass" ? "filter-pass-active" : "filter-pass-idle"}`}>Time Match ({results.timePassed})</button>
              <button onClick={() => setActiveTab("space_pass")} className={`eval-filter-btn ${activeTab === "space_pass" ? "filter-pass-active" : "filter-pass-idle"}`}>Space Match ({results.spacePassed})</button>
              <button onClick={() => setActiveTab("mismatch")} className={`eval-filter-btn ${activeTab === "mismatch" ? "filter-fail-active" : "filter-fail-idle"}`}>Any Mismatch ({results.details.filter(d=>!d.isCompletelyCorrect).length})</button>
            </div>

            <table className="eval-table">
              <thead><tr className="eval-table-header"><th>Algorithm Title</th><th>Category</th><th>Ground Truth</th><th>Model Output</th><th>Time Verdict</th><th>Space Verdict</th><th>AST</th></tr></thead>
              <tbody>
                {filteredDetails.map((row, idx) => (
                  <tr key={`${row.id}_${idx}`}>
                    <td className="cell-algo-name">{row.name}<span style={{display:"block",fontSize:"11px",color:"#94A3B8"}}>{row.id}</span></td>
                    <td className="cell-category">{row.category}</td>
                    <td><code className="code-badge-gt">T: {row.expectedTime}</code> <code className="code-badge-gt" style={{backgroundColor:"#E0F2FE",color:"#0369A1"}}>S: {row.expectedSpace}</code></td>
                    <td><code className={row.isTimeCorrect?"code-badge-pred-pass":"code-badge-pred-fail"}>T: {row.predictedTime}</code> <code className={row.isSpaceCorrect?"code-badge-pred-pass":"code-badge-pred-fail"}>S: {row.predictedSpace}</code></td>
                    <td>{row.isTimeCorrect?<span className="eval-verdict verdict-pass"><FiCheckCircle size={15}/> Pass</span>:<span className="eval-verdict verdict-fail"><FiXCircle size={15}/> Fail</span>}</td>
                    <td>{row.isSpaceCorrect?<span className="eval-verdict verdict-pass" style={{color:"#0EA5E9"}}><FiCheckCircle size={15}/> Pass</span>:<span className="eval-verdict verdict-fail"><FiXCircle size={15}/> Fail</span>}</td>
                    <td><button onClick={()=>setSelectedItemCode(row)} className="eval-btn-inspect"><FiCode size={14}/> Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}