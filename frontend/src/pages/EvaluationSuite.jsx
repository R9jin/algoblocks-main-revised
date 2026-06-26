// frontend/src/pages/EvaluationSuite.jsx
import { useEffect, useState } from "react";
import {
  FiActivity,
  FiArrowLeft,
  FiCheckCircle, FiClock, FiCode,
  FiCpu, FiDatabase,
  FiDownload,
  FiHelpCircle, FiLayers, FiPlay,
  FiRefreshCw, FiXCircle
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

  // --- VITE SPA FALLBACK GUARDS ---
  const safeFetchText = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      // If Vite returns index.html instead of the requested asset, block it
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
    
    // Normalize line endings to avoid \r\n vs \n split issues
    csvText = csvText.replace(/\r\n/g, '\n');

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      // CSV FAILSAFE: If a single column is astronomically long and we hit a newline, 
      // a quote was left unmatched in the dataset. Force-close the quote loop to save the rest of the file.
      if (isInsideQuotes && char === '\n' && currentVal.length > 15000) {
          isInsideQuotes = false;
      }

      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped double-quotes
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
        
        // --- SALVAGE MANGLED CSV ---
        // The pandas script trapped the complexities inside the code trailing quotes.
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
                   parts.pop(); // Remove time
                   parts.pop(); // Remove space
                   codeText = parts.join(','); // Restore pure code!
               }
           }
        }

        // --- AST ENGINE PRE-SANITIZER ---
        // Converts escaped CSV string variables back into valid executable multi-line Python.
        // Without this, ast.parse() throws SyntaxError on literally rendered "\n" or spaces.
        codeText = codeText
            .replace(/\\n/g, '\n')           // Un-flatten explicit \n into physical carriage returns
            .replace(/\\t/g, '    ')         // Replace explicit \t with 4 spaces
            .replace(/^["']|["']$/g, '')     // Strip trailing/leading CSV wrapping quotes
            .replace(/^\s+|\s+$/g, '');      // Trim to prevent global IndentationErrors
        
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

  // --- PEDAGOGICAL UI FORMATTERS ---
  // Converts standard Scikit-Learn raw decimal strings (e.g. "0.85") into intuitive dual displays
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
                <h3 className="eval-modal-title">Understanding Scikit-Learn Validation Metrics</h3>
                <span className="eval-dataset-subtitle">Translating academic AI benchmarking statistics into plain classroom insights</span>
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
                <p className="metric-desc">
                  <strong>&quot;When the AST engine flags an algorithm as <code>O(N)</code>, how often can you actually trust it?&quot;</strong><br/>
                  Imagine a classroom fire alarm. If it rings 10 times, but only 8 times there was a real fire (and 2 burnt toast false alarms), its Precision is <strong>80%</strong>. High precision proves that when the system identifies a complexity bottleneck, it is almost certainly a genuine code bottleneck rather than a static analysis hallucination.
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #10B981" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>Recall (Catch Rate)</span>
                  <span className="metric-formula">TP / (TP + FN)</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Out of all the real <code>O(N)</code> algorithms hidden in the test bank, how many did the engine successfully find?&quot;</strong><br/>
                  Imagine casting a fishing net into a lake containing 100 salmon. If your net captures 85 salmon (and 15 slip through the mesh holes), your Recall is <strong>85%</strong>. High recall proves that the static AST visitor rarely overlooks or misses true algorithmic complexity patterns across generalized datasets.
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #8B5CF6" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" }}>F1-Score (Reliability Balance)</span>
                  <span className="metric-formula">2 × (P × R) / (P + R)</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;Why standard arithmetic averages lie, and why F1 keeps static validation honest.&quot;</strong><br/>
                  If an AI lazily predicts <code>O(1)</code> for *every single file*, its Recall for <code>O(1)</code> hits 100%, but its Precision drops near 0%. A standard mean grade <code>((100 + 0) / 2)</code> would falsely claim a &quot;50% passing grade&quot;. The F1 harmonic mean severely punishes extreme cheating—if either Precision or Recall crashes toward zero, the F1-Score crashes with it.
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #64748B" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1" }}>Support (Statistical Sample Weight)</span>
                  <span className="metric-formula">Actual Ground Truth Occurrences</span>
                </div>
                <p className="metric-desc">
                  <strong>&quot;How much statistical proof backs up this specific complexity rating?&quot;</strong><br/>
                  In computer science benchmarking, sample size is everything. Achieving a 100% F1-Score on a rare complexity class with a Support of <code>2</code> is statistically fragile, whereas an 88% F1-Score backed by a Support of <code>550</code> algorithms proves genuine, enterprise-grade parsing resilience.
                </p>
              </div>

              <div className="metric-interactive-box">
                <h4 className="interactive-box-title"><FiCpu style={{ display: "inline", marginRight: "6px", color: "#7928CA" }}/> Interactive Live Metric Sandbox</h4>
                <p className="interactive-box-subtitle">Adjust simulated test suite outcomes below to observe how academic classification percentages react in real-time:</p>
                
                <div className="sandbox-controls">
                  <div className="slider-group">
                    <label>True Positives (Correctly spotted complexities): <strong>{sandboxTP} cases</strong></label>
                    <input type="range" min="1" max="100" value={sandboxTP} onChange={(e) => setSandboxTP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>False Positives (False alarms / Hallucinated guesses): <strong>{sandboxFP} cases</strong></label>
                    <input type="range" min="0" max="100" value={sandboxFP} onChange={(e) => setSandboxFP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>False Negatives (Missed complexities / Failed to detect): <strong>{sandboxFN} cases</strong></label>
                    <input type="range" min="0" max="100" value={sandboxFN} onChange={(e) => setSandboxFN(parseInt(e.target.value))} />
                  </div>
                </div>

                <div className="sandbox-results">
                  <div className="sandbox-stat">
                    <span>Simulated Precision</span>
                    <strong style={{ color: "#1D4ED8" }}>{(simPrecision * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simPrecision.toFixed(2)})</small>
                  </div>
                  <div className="sandbox-stat">
                    <span>Simulated Recall</span>
                    <strong style={{ color: "#065F46" }}>{(simRecall * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simRecall.toFixed(2)})</small>
                  </div>
                  <div className="sandbox-stat" style={{ backgroundColor: "#F3E8FF", borderColor: "#D8B4FE" }}>
                    <span style={{ color: "#6B21A8" }}>Simulated F1-Score</span>
                    <strong style={{ color: "#6D28D9" }}>{(simF1 * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simF1.toFixed(2)})</small>
                  </div>
                </div>

                <div className="sandbox-live-commentary">
                  <FiActivity size={16} />
                  <span>
                    {simF1 >= 0.8 ? "🌟 Excellent harmonic equilibrium! The engine demonstrates high reliability across both false alarms and omissions." :
                     simF1 >= 0.6 ? "👍 Solid balance. Static visitor catches most cases with acceptable noise levels." :
                     "⚠️ Severe statistical skew detected! Notice how a deficiency in either catch rate or prediction quality severely penalizes the harmonic F1 rating."}
                  </span>
                </div>
              </div>
            </div>

            <div className="eval-modal-footer">
              <button onClick={() => setIsMetricsHelpOpen(false)} className="eval-btn-close">Return to Benchmark Matrix</button>
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

      <div className="eval-main-wrapper">
        
        <div className="eval-dataset-selector-box">
          <div className="eval-dataset-info">
            <FiDatabase style={{ color: "#7928CA" }} size={24} />
            <div>
              <strong className="eval-dataset-title">Select AST Benchmarking Gauntlet Target</strong>
              <span className="eval-dataset-subtitle">Choose which master JSON partition or CSV to stream into the token classification engine</span>
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
              onClick={() => !isRunning && setDatasetOption("tasty")}
              className={`dataset-btn ${datasetOption === "tasty" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Tasty Dataset (CSV)
            </button>
            <button 
              onClick={() => !isRunning && setDatasetOption("both")}
              className={`dataset-btn ${datasetOption === "both" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Full Master Suite (All Combined)
            </button>
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

        {results && results.timeReport && results.spaceReport && (
          <div className="eval-sklearn-container">
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Advanced Classification Matrix (Scikit-Learn Audit)
                </strong>
                <span className="eval-sklearn-subtitle">Intuitive classroom percentages paired with exact IEEE validation decimals</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(true)} className="eval-btn-metrics-help">
                <FiHelpCircle size={16} /> Understand Metric Percentages
              </button>
            </div>

            <div className="eval-sklearn-grid">
              
              {/* TABLE 1: TIME COMPLEXITY REPORT */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Time Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Algorithms: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP) | Trustworthiness">Precision ⓘ</th>
                      <th title="Recall = TP / (TP + FN) | Catch Rate">Recall ⓘ</th>
                      <th title="Harmonic Mean Balance">F1-Score ⓘ</th>
                      <th title="Ground truth dataset count">Support ⓘ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(results.timeReport.perClass).map((cKey) => {
                      const row = results.timeReport.perClass[cKey];
                      return (
                        <tr key={`time_${cKey}`}>
                          <td className="td-class-code">{cKey}</td>
                          <td>{renderMetricCell(row.precision)}</td>
                          <td>{renderMetricCell(row.recall)}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td className="td-support-count"><strong>{row.support}</strong> <small>cases</small></td>
                        </tr>
                      );
                    })}

                    <tr className="tr-divider">
                      <td>overall accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td><strong style={{ color: "#10B981", fontSize: "14px" }}>{((results.timePassed / results.totalTested) * 100).toFixed(1)}%</strong> <small style={{ color: "#94A3B8" }}>({(results.timePassed / results.totalTested).toFixed(2)})</small></td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{renderMetricCell(results.timeReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(results.timeReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(results.timeReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(results.timeReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(results.timeReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(results.timeReport.weightedAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLE 2: SPACE COMPLEXITY REPORT */}
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Space Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Algorithms: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP) | Trustworthiness">Precision ⓘ</th>
                      <th title="Recall = TP / (TP + FN) | Catch Rate">Recall ⓘ</th>
                      <th title="Harmonic Mean Balance">F1-Score ⓘ</th>
                      <th title="Ground truth dataset count">Support ⓘ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(results.spaceReport.perClass).map((cKey) => {
                      const row = results.spaceReport.perClass[cKey];
                      return (
                        <tr key={`space_${cKey}`}>
                          <td className="td-class-code">{cKey}</td>
                          <td>{renderMetricCell(row.precision)}</td>
                          <td>{renderMetricCell(row.recall)}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td className="td-support-count"><strong>{row.support}</strong> <small>cases</small></td>
                        </tr>
                      );
                    })}

                    <tr className="tr-divider">
                      <td>overall accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td><strong style={{ color: "#0EA5E9", fontSize: "14px" }}>{((results.spacePassed / results.totalTested) * 100).toFixed(1)}%</strong> <small style={{ color: "#94A3B8" }}>({(results.spacePassed / results.totalTested).toFixed(2)})</small></td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{renderMetricCell(results.spaceReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(results.spaceReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(results.spaceReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(results.spaceReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(results.spaceReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(results.spaceReport.weightedAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
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