// frontend/src/pages/EvaluationSuite.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiChevronDown, FiChevronUp,
  FiClock, FiCode,
  FiCornerDownRight,
  FiCpu, FiDatabase,
  FiDownload,
  FiHelpCircle, FiLayers,
  FiList,
  FiPieChart,
  FiPlay,
  FiRefreshCw,
  FiTrendingDown,
  FiTrendingUp,
  FiXCircle, FiZap
} from "react-icons/fi";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { usePyodide } from "../context/PyodideContext";
import "../styles/EvaluationSuite.css";

// Stable color palette for Big-O complexity classes so the same class always
// renders with the same color across every pie chart in the suite.
const BIGO_COLOR_MAP = {
  "O(1)": "#10B981",
  "O(log n)": "#0EA5E9",
  "O(sqrt n)": "#22D3EE",
  "O(n)": "#3B82F6",
  "O(n log n)": "#7928CA",
  "O(n^2)": "#F59E0B",
  "O(n^4)": "#F97316",
  "O(2^n)": "#EF4444",
  "O(V + E)": "#EC4899",
  "O(V)": "#DB2777",
  "O(E)": "#BE185D",
};
const BIGO_FALLBACK_COLORS = ["#7928CA", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#22D3EE"];
const getBigOColor = (label, idx) => BIGO_COLOR_MAP[label] || BIGO_FALLBACK_COLORS[idx % BIGO_FALLBACK_COLORS.length];

// Small hover-triggered popover that reveals a Big-O distribution pie chart
// on top of a metric stat card. Purely CSS-driven (:hover) so it never
// interferes with click handlers elsewhere on the page.
function MetricPieHoverCard({ label, data, total, children }) {
  const hasData = data && data.length > 0 && total > 0;
  return (
    <div className="metric-hover-wrapper">
      {children}
      {hasData && (
        <div className="metric-hover-popover">
          <div className="metric-hover-popover-header">
            <FiPieChart size={13} />
            <span>{label} &mdash; Big-O Breakdown</span>
          </div>
          <div className="metric-hover-popover-body">
            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={58}
                    paddingAngle={2}
                    stroke="#FFFFFF"
                    strokeWidth={1}
                  >
                    {data.map((entry, idx) => (
                      <Cell key={`cell-${entry.name}-${idx}`} fill={getBigOColor(entry.name, idx)} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value, name) => [`${value} case${value === 1 ? "" : "s"} (${((value / total) * 100).toFixed(1)}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="metric-hover-legend">
              {data.map((entry, idx) => (
                <li key={`legend-${entry.name}-${idx}`}>
                  <span className="legend-dot" style={{ backgroundColor: getBigOColor(entry.name, idx) }} />
                  <span className="legend-label">{entry.name}</span>
                  <span className="legend-value">{entry.value} <small>({((entry.value / total) * 100).toFixed(0)}%)</small></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EvaluationSuite() {
  const navigate = useNavigate();
  const { worker, isEngineReady } = usePyodide();

  useEffect(() => {
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

  const [expandedRows, setExpandedRows] = useState({});

  // Explainer Modal State & Interactive Sandbox State
  const [isMetricsHelpOpen, setIsMetricsHelpOpen] = useState(false);

  const [sandboxTP, setSandboxTP] = useState(80);
  const [sandboxFP, setSandboxFP] = useState(10);
  const [sandboxFN, setSandboxFN] = useState(10);

  // Real-time sandbox calculations
  const simPrecision = sandboxTP / (sandboxTP + sandboxFP) || 0;
  const simRecall = sandboxTP / (sandboxTP + sandboxFN) || 0;
  const simF1 = (simPrecision + simRecall > 0) ?
    (2 * simPrecision * simRecall) / (simPrecision + simRecall) : 0;

  const toggleRowDropdown = (rowId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

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

  // --- VITE SPA FALLBACK GUARDS ---
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

    if (mode === "chunks") {
      setStatusText("Fetching Ground Truth Chunks (01 to 29)...");
      let stitchedArray = [];
      for (let i = 1; i <= 29; i++) {
        const paddedNum = i.toString().padStart(2, '0');
        const partJson = await safeFetchJson(`/data/evaluation/processed/ground_truth_chunk_${paddedNum}.json`);
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
      const codeIdx = headers.indexOf('code') !== -1 ? headers.indexOf('code') : 0;
      const spaceIdx = headers.indexOf('space_complexity');
      const timeIdx = headers.indexOf('time_complexity');

      const dataset = [];
      const validComplexities = ['1', 'constant', 'n', 'linear', 'n^2', 'quadratic', 'n^4', 'quartic', 'logn', 'log(n)', 'nlogn', 'n log n', 'n*logn', 'np', 'v+e', 'v', 'e', 'n*m', 'sqrtn', 'sqrt(n)', 'sqrt n', 'exponential', '2^n', '3^n'];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i] || rows[i].length === 0 || (rows[i].length === 1 && !rows[i][0].trim())) continue;
        let codeText = rows[i][codeIdx] !== undefined ? rows[i][codeIdx] : (rows[i][0] || '');
        let spaceComp = spaceIdx !== -1 && rows[i][spaceIdx] ? rows[i][spaceIdx].trim() : "";
        let timeComp = timeIdx !== -1 && rows[i][timeIdx] ? rows[i][timeIdx].trim() : "";
        if (!spaceComp && !timeComp && codeText.includes(',')) {
          const parts = codeText.split(',');
          while (parts.length > 0 && !parts[parts.length - 1].replace(/"/g, '').trim()) {
            parts.pop();
          }

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
      const chunksData = await fetchActiveGauntletData("chunks");
      return [...textbookData, ...codeforcesData, ...tastyData, ...chunksData];
    }

    return [];
  };

  const handleStartEvaluation = async () => {
    if (!isEngineReady) {
      alert("The Pyodide Python AST Engine is currently warming up in the background. Please wait 3 seconds.");
      return;
    }

    setIsLoading(true); setProgress(0); setResults(null); setExpandedRows({});

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

  const totalErrorsCount = results?.details.filter(d =>
    !d.isCompletelyCorrect || d.lineValidationResults?.some(l => l.hasGroundTruth && !l.isPassed)
  ).length || 0;

  // ROBUST FALLBACK GETTERS
  const getProp = (obj, keys, defaultVal = "-") => {
    if (!obj) return defaultVal;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return defaultVal;
  };

  const downloadFailuresLog = (details) => {
    const mismatches = details.filter(d =>
      !d.isCompletelyCorrect || d.lineValidationResults?.some(l => l.hasGroundTruth && !l.isPassed)
    );

    if (mismatches.length === 0) {
      let logText = "=== EVALUATION FAILURES LOG ===\n\nNo mismatches found. Perfect accuracy!\n";
      const blob = new Blob([logText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "evaluation_failures_log.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const numChunks = 10;
    const chunkSize = Math.ceil(mismatches.length / numChunks);

    for (let i = 0; i < numChunks; i++) {
      const chunk = mismatches.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) continue;

      let logText = `=== EVALUATION FAILURES LOG (Part ${i + 1}) ===\n\n`;
      chunk.forEach(m => {
        logText += `[${m.id} - ${m.name}]\n`;
        logText += `Time Expected: ${m.expectedTime} | Actual: ${m.predictedTime}\n`;
        logText += `Space Expected: ${m.expectedSpace} | Actual: ${m.predictedSpace}\n`;
        logText += `Full Code:\n${m.codeSnippet}\n`;
        if (m.lineValidationResults && m.lineValidationResults.filter(l => !l.isPassed && l.hasGroundTruth).length > 0) {
          logText += `\nLine Level Mismatches:\n`;
          m.lineValidationResults.filter(l => !l.isPassed && l.hasGroundTruth).forEach(l => {
            const expLT = getProp(l, ['expLocalTime', 'expectedLocalTime', 'local_time']);
            const predLT = getProp(l, ['predLocalTime', 'predictedLocalTime']);
            const expGT = getProp(l, ['expGlobalTime', 'expectedGlobalTime', 'global_time']);
            const predGT = getProp(l, ['predGlobalTime', 'predictedGlobalTime']);
            const expLS = getProp(l, ['expLocalSpace', 'expectedLocalSpace', 'local_space']);
            const predLS = getProp(l, ['predLocalSpace', 'predictedLocalSpace']);
            const expGS = getProp(l, ['expGlobalSpace', 'expectedGlobalSpace', 'global_space']);
            const predGS = getProp(l, ['predGlobalSpace', 'predictedGlobalSpace']);

            logText += `  -> Line ${l.lineno}:\n`;
            logText += `     LT Exp [${expLT}] Act [${predLT}]\n`;
            logText += `     GT Exp [${expGT}] Act [${predGT}]\n`;
            logText += `     LS Exp [${expLS}] Act [${predLS}]\n`;
            logText += `     GS Exp [${expGS}] Act [${predGS}]\n`;
          });
        }
        logText += `${'-'.repeat(60)}\n\n`;
      });

      setTimeout(() => {
        const blob = new Blob([logText], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evaluation_failures_log_part_${i + 1}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, i * 500);
    }
  };

  const filteredDetails = (results?.details || []).filter((item) => {
    const gtLines = item.lineValidationResults?.filter(l => l.hasGroundTruth) || [];
    const lineFails = gtLines.filter(l => !l.isPassed).length;
    const hasLineMismatch = lineFails > 0;

    if (activeTab === "overall_pass") return item.isCompletelyCorrect;
    if (activeTab === "line_pass") return gtLines.length > 0 && !hasLineMismatch;
    if (activeTab === "overall_mismatch") return !item.isCompletelyCorrect;
    if (activeTab === "line_mismatch") return hasLineMismatch;
    return true;
  });

  const overallPassCount = results?.details.filter(d => d.isCompletelyCorrect).length || 0;
  const overallMismatchCount = results?.details.filter(d => !d.isCompletelyCorrect).length || 0;

  const linePassCount = results?.details.filter(d =>
    d.lineValidationResults?.some(l => l.hasGroundTruth) &&
    !d.lineValidationResults?.some(l => l.hasGroundTruth && !l.isPassed)
  ).length || 0;
  const lineMismatchCount = results?.details.filter(d =>
    d.lineValidationResults?.some(l => l.hasGroundTruth && !l.isPassed)
  ).length || 0;

  const lineTimeErrorRate = results?.totalLinesTested > 0 ? (100 - results.lineTimeAccuracyRate).toFixed(1) : 0;
  const lineSpaceErrorRate = results?.totalLinesTested > 0 ? (100 - results.lineSpaceAccuracyRate).toFixed(1) : 0;
  const lineTimeFailed = results?.totalLinesTested > 0 ? (results.totalLinesTested - results.lineTimePassed) : 0;
  const lineSpaceFailed = results?.totalLinesTested > 0 ? (results.totalLinesTested - results.lineSpacePassed) : 0;

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

  const renderDualBadge = (expVal, predVal, isMatch) => {
    const safeExp = (expVal && expVal !== 'undefined' && expVal !== '-') ? expVal : null;
    const safePred = (predVal && predVal !== 'undefined') ? predVal : '-';
    if (safeExp) {
      return (
        <div className="dual-comp-badge">
          <span className="comp-exp">Exp: <strong>{safeExp}</strong></span>
          <span className="comp-arrow"><FiArrowRight size={12} /></span>
          <span className={`comp-act ${isMatch ? "comp-pass" : "comp-fail"}`}>{safePred}</span>
        </div>
      );
    }
    return <span className="comp-act comp-neutral">{safePred}</span>;
  };

  const processReport = (report) => {
    if (!report || !report.perClass) return report;
    const newPerClass = { ...report.perClass };

    const mergeKeys = (sourceKey, targetKey) => {
      if (newPerClass[sourceKey]) {
        const source = newPerClass[sourceKey];
        const target = newPerClass[targetKey] || { precision: 0, recall: 0, f1Score: 0, support: 0 };
        const totalSupport = source.support + target.support;
        if (totalSupport > 0) {
          target.precision = ((source.precision * source.support) + (target.precision * target.support)) / totalSupport;
          target.recall = ((source.recall * source.support) + (target.recall * target.support)) / totalSupport;
          target.f1Score = ((source.f1Score * source.support) + (target.f1Score * target.support)) / totalSupport;
        }
        target.support = totalSupport;

        newPerClass[targetKey] = target;
        delete newPerClass[sourceKey];
      }
    };

    mergeKeys("O(exponential)", "O(2^n)");
    mergeKeys("O(v)", "O(V)");

    if (newPerClass["O(quartic)"]) {
      newPerClass["O(n^4)"] = newPerClass["O(quartic)"];
      delete newPerClass["O(quartic)"];
    }

    return { ...report, perClass: newPerClass };
  };

  const processedTimeReport = results?.timeReport ? processReport(results.timeReport) : null;
  const processedSpaceReport = results?.spaceReport ? processReport(results.spaceReport) : null;

  // --- Big-O distributions powering the hover-pie-charts on the accuracy cards ---
  const toDistribution = (perClass) => {
    if (!perClass) return [];
    return Object.keys(perClass)
      .map((cKey) => ({ name: cKey, value: perClass[cKey].support || 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const overallTimeDistribution = useMemo(
    () => toDistribution(processedTimeReport?.perClass),
    [processedTimeReport]
  );
  const overallSpaceDistribution = useMemo(
    () => toDistribution(processedSpaceReport?.perClass),
    [processedSpaceReport]
  );

  // Line-level ground-truth distributions aren't precomputed by the worker,
  // so tally them here from every statement's ground-truth Big-O class.
  const tallyLineDistribution = (details, keys) => {
    const counts = {};
    (details || []).forEach((row) => {
      (row.lineValidationResults || []).forEach((l) => {
        if (!l.hasGroundTruth) return;
        const val = getProp(l, keys, null);
        if (!val || val === "MISSING" || val === "-") return;
        counts[val] = (counts[val] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map((k) => ({ name: k, value: counts[k] }))
      .sort((a, b) => b.value - a.value);
  };

  const lineTimeDistribution = useMemo(
    () => tallyLineDistribution(results?.details, ["expGlobalTime", "expectedGlobalTime", "expTime"]),
    [results]
  );
  const lineSpaceDistribution = useMemo(
    () => tallyLineDistribution(results?.details, ["expGlobalSpace", "expectedGlobalSpace", "expSpace"]),
    [results]
  );

  // --- Per-snippet processing time series powering the "Processing Time Across Dataset" chart ---
  const processingTimeChartData = useMemo(() => {
    if (!results?.details) return [];
    return results.details.map((d, idx) => ({
      idx: idx + 1,
      id: d.id,
      name: d.name,
      ms: d.processingTimeMs || 0,
    }));
  }, [results]);

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
                  <span className="metric-name-badge" style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                    Precision (Accuracy of Predictions)
                  </span>
                  <span className="metric-formula">TP / (TP + FP)</span>
                </div>
                <p className="metric-desc">
                  <strong>How often the analyzer is right when it predicts a specific complexity.</strong>
                  <br />
                  If your engine labels an algorithm as O(n²), precision tells you the odds that it actually is O(n²). A high precision means you can trust the analyzer's output, as it rarely gives false positive classifications for a given Big-O class.
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #10B981" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>
                    Recall (Detection Rate)
                  </span>
                  <span className="metric-formula">TP / (TP + FN)</span>
                </div>
                <p className="metric-desc">
                  <strong>How well the analyzer catches all algorithms of a certain complexity.</strong>
                  <br />
                  Recall measures detection rate. If there are 50 O(n) algorithms in your dataset, recall tells you how many of them your engine successfully found. High recall means the system rarely misses valid patterns (low false negatives).
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #8B5CF6" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" }}>
                    F1-Score (Balanced Metric)
                  </span>
                  <span className="metric-formula">2 × (P × R) / (P + R)</span>
                </div>
                <p className="metric-desc">
                  <strong>The balance between Precision and Recall.</strong>
                  <br />
                  You want an analyzer that is both accurate and comprehensive. The F1-Score calculates the harmonic mean of Precision and Recall, heavily penalizing the score if either metric drops too low. A high F1-Score proves your engine is highly reliable overall.
                </p>
              </div>

              <div className="metric-card-info" style={{ borderLeft: "4px solid #64748B" }}>
                <div className="metric-card-header">
                  <span className="metric-name-badge" style={{ backgroundColor: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1" }}>
                    Support (Sample Size)
                  </span>
                  <span className="metric-formula">Actual Ground Truth Occurrences</span>
                </div>
                <p className="metric-desc">
                  <strong>The actual number of algorithms in the dataset for a specific class.</strong>
                  <br />
                  Support is simply your sample size. It tells you how many O(1), O(n), etc., test cases exist in the ground truth data. Higher support means you have a larger sample size, making your performance metrics for that class much more statistically reliable.
                </p>
              </div>

              <div className="metric-interactive-box">
                <h4 className="interactive-box-title">
                  <FiCpu style={{ display: "inline", marginRight: "6px", color: "#7928CA" }} />
                  Interactive Classification Metric Simulator
                </h4>
                <p className="interactive-box-subtitle">
                  Adjust the classification outcomes below to observe how changes in True Positives, False Positives, and False Negatives affect Precision, Recall, and the F1-Score in real time.
                </p>

                <div className="sandbox-controls">
                  <div className="slider-group">
                    <label>
                      True Positives (Correct Classifications): <strong>{sandboxTP} cases</strong>
                    </label>
                    <input type="range" min="1" max="100" value={sandboxTP} onChange={(e) => setSandboxTP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>
                      False Positives (Incorrect Positive Classifications): <strong>{sandboxFP} cases</strong>
                    </label>
                    <input type="range" min="0" max="100" value={sandboxFP} onChange={(e) => setSandboxFP(parseInt(e.target.value))} />
                  </div>
                  <div className="slider-group">
                    <label>
                      False Negatives (Missed Classifications): <strong>{sandboxFN} cases</strong>
                    </label>
                    <input type="range" min="0" max="100" value={sandboxFN} onChange={(e) => setSandboxFN(parseInt(e.target.value))} />
                  </div>
                </div>

                <div className="sandbox-results">
                  <div className="sandbox-stat">
                    <span>Precision</span>
                    <strong style={{ color: "#1D4ED8" }}>{(simPrecision * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simPrecision.toFixed(2)})</small>
                  </div>
                  <div className="sandbox-stat">
                    <span>Recall</span>
                    <strong style={{ color: "#065F46" }}>{(simRecall * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simRecall.toFixed(2)})</small>
                  </div>
                  <div className="sandbox-stat" style={{ backgroundColor: "#F3E8FF", borderColor: "#D8B4FE" }}>
                    <span style={{ color: "#6B21A8" }}>F1-Score</span>
                    <strong style={{ color: "#6D28D9" }}>{(simF1 * 100).toFixed(1)}%</strong>
                    <small className="stat-dec">({simF1.toFixed(2)})</small>
                  </div>
                </div>

                <div className="sandbox-live-commentary">
                  <FiActivity size={16} />
                  <span>
                    {simF1 >= 0.8
                      ? "These simulated results show a solid balance between accuracy and detection rate, which is great for building a reliable analyzer."
                      : simF1 >= 0.6
                        ? "These results are okay, but improving either Precision or Recall will help boost the overall F1-Score."
                        : "These results indicate a heavily skewed or inaccurate model. You'll need to improve prediction accuracy, detection coverage, or both."}
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

      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />

      <div className="eval-main-wrapper">
        <div className="eval-page-toolbar">
          <div className="eval-page-toolbar-left">
            <h2 className="eval-page-title">
              System Complexity Analyzer Benchmark
              <span className="wh-benchmark-badge">Benchmark Testing</span>
            </h2>
            <p className="eval-page-subtitle">Run the AST-based analyzer against the ground-truth dataset and review classification performance.</p>
          </div>
          <button
            onClick={handleStartEvaluation}
            disabled={isRunning || !isEngineReady}
            className={`eval-btn-run ${isRunning || !isEngineReady ? "eval-run-disabled" : "eval-run-ready"}`}
          >
            {isRunning ? <FiRefreshCw className="spinner" size={16} /> : <FiPlay fill="#fff" size={16} />}
            <span>{isRunning ? `Running Benchmark (${progress}%)...` : "Execute Benchmark"}</span>
          </button>
        </div>

        <div className="eval-dataset-selector-box">
          <div className="eval-dataset-info">
            <FiDatabase style={{ color: "#7928CA" }} size={24} />
            <div>
              <strong className="eval-dataset-title">Select Benchmark Dataset</strong>
              <span className="eval-dataset-subtitle">
                Select the benchmark dataset to evaluate the accuracy and performance of the system's Complexity Analyzer.
              </span>
            </div>
          </div>
          <div className="dataset-btn-group">
            <button
              onClick={() => !isRunning && setDatasetOption("chunks")}
              className={`dataset-btn ${datasetOption === "chunks" ? "active-ds" : ""}`}
              disabled={isRunning}
            >
              Tasty Ground Truth Dataset
            </button>
          </div>
        </div>

        <div className="eval-status-banner">
          <div className="eval-status-group">
            <span className="eval-status-label">Execution Target:</span>
            <strong className="eval-status-target">{statusText}</strong>
          </div>
          <div className="eval-status-group">
            {results && totalErrorsCount > 0 && (
              <button className="eval-btn-inspect" onClick={() => downloadFailuresLog(results.details)} style={{ marginRight: "15px", display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px" }}>
                <FiDownload size={14} /> Download Error Logs (TXT)
              </button>
            )}
            <span className="eval-status-label-sm">AST Virtual Machine:</span>
            {isEngineReady ? (
              <span className="eval-vm-ready"><FiCheckCircle size={13} /> Pyodide 3.11 AST Active</span>
            ) : (
              <span className="eval-vm-booting"><FiRefreshCw className="spinner" size={13} /> Wasm Engine Initializing...</span>
            )}
          </div>
        </div>

        {isRunning && (
          <div className="eval-progress-track">
            <div className="eval-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        {results && (
          <div className="eval-sklearn-container" style={{ marginBottom: "24px" }}>
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiCode style={{ display: "inline", color: "#10B981", marginRight: "8px" }} /> Overall Algorithm Accuracy
                </strong>
                <span className="eval-sklearn-subtitle">
                  Validates the final computed Time and Space complexity for each fully processed algorithm block.
                </span>
              </div>
            </div>

            <div className="eval-stats-grid">
              <MetricPieHoverCard label="Overall Time Accuracy" data={overallTimeDistribution} total={processedTimeReport?.totalSupport}>
                <div className="eval-stat-card eval-stat-card-hoverable" style={{ borderTop: "4px solid #10B981" }}>
                  <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }} /> Overall Time Accuracy <FiPieChart className="stat-hover-hint-icon" size={11} /></div>
                  <div className={`eval-stat-value ${results.timeAccuracyRate >= 65 ? "val-success" : "val-warning"}`}>
                    {results.timeAccuracyRate}%
                  </div>
                </div>
              </MetricPieHoverCard>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #EF4444" }}>
                <div className="eval-stat-title"><FiTrendingDown style={{ display: "inline", marginRight: "4px" }} /> Overall Time Error Rate</div>
                <div className="eval-stat-value val-danger">
                  {results.timeErrorRate}%
                </div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Overall Time Passed</div>
                <div className="eval-stat-value val-success">{results.timePassed}</div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Overall Time Mismatches</div>
                <div className={`eval-stat-value ${results.timeFailed > 0 ? "val-danger" : "val-muted"}`}>{results.timeFailed}</div>
              </div>
              <MetricPieHoverCard label="Overall Space Accuracy" data={overallSpaceDistribution} total={processedSpaceReport?.totalSupport}>
                <div className="eval-stat-card eval-stat-card-hoverable" style={{ borderTop: "4px solid #0EA5E9" }}>
                  <div className="eval-stat-title"><FiCpu style={{ display: "inline", marginRight: "4px" }} /> Overall Space Accuracy <FiPieChart className="stat-hover-hint-icon" size={11} /></div>
                  <div className="eval-stat-value" style={{ color: results.spaceAccuracyRate >= 65 ? "#0EA5E9" : "#F59E0B" }}>
                    {results.spaceAccuracyRate}%
                  </div>
                </div>
              </MetricPieHoverCard>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #EF4444" }}>
                <div className="eval-stat-title"><FiTrendingDown style={{ display: "inline", marginRight: "4px" }} /> Overall Space Error Rate</div>
                <div className="eval-stat-value val-danger">
                  {results.spaceErrorRate}%
                </div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Overall Space Passed</div>
                <div className="eval-stat-value" style={{ color: "#0EA5E9" }}>{results.spacePassed}</div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Overall Space Mismatches</div>
                <div className={`eval-stat-value ${results.spaceFailed > 0 ? "val-danger" : "val-muted"}`}>{results.spaceFailed}</div>
              </div>
            </div>
          </div>
        )}

        {results && results.totalLinesTested >= 0 && (
          <div className="eval-sklearn-container" style={{ marginBottom: "24px" }}>
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Statement-Level (Line-by-Line) Accuracy
                </strong>
                <span className="eval-sklearn-subtitle">
                  Verified {results.totalLinesTested} individual source lines. This metric is strictly isolated from the Overall block.
                </span>
              </div>
            </div>

            <div className="eval-stats-grid">
              <MetricPieHoverCard label="Line Time Accuracy" data={lineTimeDistribution} total={results.totalLinesTested}>
                <div className="eval-stat-card eval-stat-card-hoverable" style={{ borderTop: "4px solid #10B981" }}>
                  <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }} /> Line Time Accuracy <FiPieChart className="stat-hover-hint-icon" size={11} /></div>
                  <div className={`eval-stat-value ${results.lineTimeAccuracyRate >= 65 ? "val-success" : "val-warning"}`}>
                    {results.totalLinesTested > 0 ? results.lineTimeAccuracyRate : "0.0"}%
                  </div>
                </div>
              </MetricPieHoverCard>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #EF4444" }}>
                <div className="eval-stat-title"><FiTrendingDown style={{ display: "inline", marginRight: "4px" }} /> Line Time Error Rate</div>
                <div className="eval-stat-value val-danger">
                  {lineTimeErrorRate}%
                </div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Line Time Passed</div>
                <div className="eval-stat-value val-success">{results.lineTimePassed}</div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Line Time Mismatches</div>
                <div className={`eval-stat-value ${lineTimeFailed > 0 ? "val-danger" : "val-muted"}`}>{lineTimeFailed}</div>
              </div>
              <MetricPieHoverCard label="Line Space Accuracy" data={lineSpaceDistribution} total={results.totalLinesTested}>
                <div className="eval-stat-card eval-stat-card-hoverable" style={{ borderTop: "4px solid #0EA5E9" }}>
                  <div className="eval-stat-title"><FiCpu style={{ display: "inline", marginRight: "4px" }} /> Line Space Accuracy <FiPieChart className="stat-hover-hint-icon" size={11} /></div>
                  <div className="eval-stat-value" style={{ color: results.lineSpaceAccuracyRate >= 65 ? "#0EA5E9" : "#F59E0B" }}>
                    {results.totalLinesTested > 0 ? results.lineSpaceAccuracyRate : "0.0"}%
                  </div>
                </div>
              </MetricPieHoverCard>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #EF4444" }}>
                <div className="eval-stat-title"><FiTrendingDown style={{ display: "inline", marginRight: "4px" }} /> Line Space Error Rate</div>
                <div className="eval-stat-value val-danger">
                  {lineSpaceErrorRate}%
                </div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Line Space Passed</div>
                <div className="eval-stat-value" style={{ color: "#0EA5E9" }}>{results.lineSpacePassed}</div>
              </div>
              <div className="eval-stat-card">
                <div className="eval-stat-title">Line Space Mismatches</div>
                <div className={`eval-stat-value ${lineSpaceFailed > 0 ? "val-danger" : "val-muted"}`}>{lineSpaceFailed}</div>
              </div>
            </div>
          </div>
        )}

        {results && results.efficiency && (
          <div className="eval-sklearn-container" style={{ marginBottom: "24px" }}>
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiZap style={{ display: "inline", color: "#F59E0B", marginRight: "8px" }} /> System Performance & Efficiency
                </strong>
                <span className="eval-sklearn-subtitle">
                  Speed and memory usage statistics for the code analyzer, measured across {results.efficiency.totalLines} lines of source code.
                </span>
              </div>
            </div>
            <div className="eval-stats-grid" style={{ padding: "16px 20px 20px", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #F59E0B" }}>
                <div className="eval-stat-title"><FiClock style={{ display: "inline", marginRight: "4px" }} /> Total Evaluation Time</div>
                <div className="eval-stat-value" style={{ color: "#D97706" }}>
                  {results.efficiency.totalExecutionSec}s
                </div>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                  {results.totalTested} algorithms processed
                </span>
              </div>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #3B82F6" }}>
                <div className="eval-stat-title"><FiTrendingUp style={{ display: "inline", marginRight: "4px" }} /> Processing Speed</div>
                <div className="eval-stat-value" style={{ color: "#2563EB" }}>
                  {results.efficiency.throughputAlgos} <small style={{ fontSize: "13px", fontWeight: "normal", color: "#64748B" }}>algos/s</small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                  {results.efficiency.throughputLines} lines/sec
                </span>
              </div>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #8B5CF6" }}>
                <div className="eval-stat-title"><FiActivity style={{ display: "inline", marginRight: "4px" }} /> Avg. Time per Algorithm</div>
                <div className="eval-stat-value" style={{ color: "#7C3AED" }}>
                  {results.efficiency.meanTimeMs} <small style={{ fontSize: "13px", fontWeight: "normal", color: "#64748B" }}>ms</small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                  Median: {results.efficiency.medianTimeMs} ms
                </span>
              </div>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #EC4899" }}>
                <div className="eval-stat-title"><FiBarChart2 style={{ display: "inline", marginRight: "4px" }} /> Slowest Times (P95 / Peak)</div>
                <div className="eval-stat-value" style={{ color: "#DB2777" }}>
                  {results.efficiency.p95TimeMs} <small style={{ fontSize: "13px", fontWeight: "normal", color: "#64748B" }}>ms</small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                  Peak Max: {results.efficiency.maxTimeMs} ms
                </span>
              </div>
              <div className="eval-stat-card" style={{ borderTop: "4px solid #10B981" }}>
                <div className="eval-stat-title"><FiCpu style={{ display: "inline", marginRight: "4px" }} /> Peak Memory Usage</div>
                <div className="eval-stat-value" style={{ color: "#059669" }}>
                  {results.efficiency.peakAstMemMB} <small style={{ fontSize: "13px", fontWeight: "normal", color: "#64748B" }}>MB</small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748B", marginTop: "4px", display: "block" }}>
                  Average Memory: {results.efficiency.meanAstMemKB} KB
                </span>
              </div>
            </div>
          </div>
        )}

        {processingTimeChartData.length > 0 && (
          <div className="eval-sklearn-container" style={{ marginBottom: "24px" }}>
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiBarChart2 style={{ display: "inline", color: "#3B82F6", marginRight: "8px" }} /> Processing Time Across Dataset
                </strong>
                <span className="eval-sklearn-subtitle">
                  AST processing time (ms) for every one of the {processingTimeChartData.length} code snippets tested, in run order. Hover any point for the exact snippet and timing.
                </span>
              </div>
            </div>

            <div className="processing-time-chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={processingTimeChartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="idx"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    label={{ value: "Snippet # (run order)", position: "insideBottom", offset: -4, fontSize: 12, fill: "#64748B" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    label={{ value: "Processing Time (ms)", angle: -90, position: "insideLeft", fontSize: 12, fill: "#64748B" }}
                  />
                  <RechartsTooltip
                    formatter={(value) => [`${value} ms`, "Processing Time"]}
                    labelFormatter={(_, payload) => {
                      const item = payload && payload[0] && payload[0].payload;
                      return item ? `${item.name} (${item.id})` : "";
                    }}
                  />
                  {results?.efficiency && (
                    <ReferenceLine
                      y={results.efficiency.meanTimeMs}
                      stroke="#7928CA"
                      strokeDasharray="4 4"
                      label={{ value: `Mean: ${results.efficiency.meanTimeMs}ms`, position: "right", fontSize: 11, fill: "#7928CA" }}
                    />
                  )}
                  {results?.efficiency && (
                    <ReferenceLine
                      y={results.efficiency.p95TimeMs}
                      stroke="#EC4899"
                      strokeDasharray="4 4"
                      label={{ value: `P95: ${results.efficiency.p95TimeMs}ms`, position: "right", fontSize: 11, fill: "#EC4899" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="ms"
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    dot={processingTimeChartData.length <= 60}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {processedTimeReport && processedSpaceReport && (
          <div className="eval-sklearn-container">
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Classification Performance Report
                </strong>
                <span className="eval-sklearn-subtitle">Performance statistics generated from the benchmark dataset using the Scikit-learn classification report. Values are shown in both percentage and decimal formats for clarity.</span>
              </div>
              <button onClick={() => setIsMetricsHelpOpen(true)} className="eval-btn-metrics-help">
                <FiHelpCircle size={16} /> Understand Metric Percentages
              </button>
            </div>

            <div className="eval-sklearn-grid">
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Time Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Algorithms: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP) | Accuracy of Predictions">Precision <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Recall = TP / (TP + FN) | Detection Rate">Recall <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Harmonic Mean Balance">F1-Score <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Ground truth dataset count">Support <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(processedTimeReport.perClass).map((cKey) => {
                      const row = processedTimeReport.perClass[cKey];
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
                      <td>{renderMetricCell(processedTimeReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(processedTimeReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(processedTimeReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(processedTimeReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(processedTimeReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(processedTimeReport.weightedAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Space Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Algorithms: {results.totalTested}</span>
                </div>
                <table className="sklearn-table">
                  <thead>
                    <tr>
                      <th>Complexity Class</th>
                      <th title="Precision = TP / (TP + FP) | Accuracy of Predictions">Precision <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Recall = TP / (TP + FN) | Detection Rate">Recall <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Harmonic Mean Balance">F1-Score <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                      <th title="Ground truth dataset count">Support <FiHelpCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(processedSpaceReport.perClass).map((cKey) => {
                      const row = processedSpaceReport.perClass[cKey];
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
                      <td>{renderMetricCell(processedSpaceReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(processedSpaceReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(processedSpaceReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalTested}</strong> <small>cases</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(processedSpaceReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(processedSpaceReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(processedSpaceReport.weightedAvg.f1Score)}</td>
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
              <button onClick={() => setActiveTab("overall_pass")} className={`eval-filter-btn ${activeTab === "overall_pass" ? "filter-pass-active" : "filter-pass-idle"}`}>
                Overall Match ({overallPassCount})
              </button>
              <button onClick={() => setActiveTab("line_pass")} className={`eval-filter-btn ${activeTab === "line_pass" ? "filter-pass-active" : "filter-pass-idle"}`} style={{ backgroundColor: activeTab === "line_pass" ? "#0EA5E9" : "", color: activeTab === "line_pass" ? "#FFFFFF" : "" }}>
                Line Match ({linePassCount})
              </button>
              <button onClick={() => setActiveTab("overall_mismatch")} className={`eval-filter-btn ${activeTab === "overall_mismatch" ? "filter-fail-active" : "filter-fail-idle"}`}>
                Overall Mismatch ({overallMismatchCount})
              </button>
              <button onClick={() => setActiveTab("line_mismatch")} className={`eval-filter-btn ${activeTab === "line_mismatch" ? "filter-fail-active" : "filter-fail-idle"}`}>
                Line Mismatch ({lineMismatchCount})
              </button>
            </div>

            <table className="eval-table">
              <thead>
                <tr className="eval-table-header">
                  <th>Algorithm Title</th>
                  <th>Domain Category</th>
                  <th>Ground Truth (T / S)</th>
                  <th>AST Model Output (T / S)</th>
                  <th>Time (Overall)</th>
                  <th>Space (Overall)</th>
                  <th>Lines (Detailed)</th>
                  <th>Verification Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((row, idx) => {
                  const isExpanded = !!expandedRows[row.id];
                  const gtLines = row.lineValidationResults?.filter(l => l.hasGroundTruth) || [];
                  const lineFails = gtLines.filter(l => !l.isPassed).length;
                  const hasLineMismatch = lineFails > 0;
                  const hasLines = gtLines.length > 0;

                  return (
                    <React.Fragment key={`${row.id}_${idx}`}>
                      <tr className={isExpanded ? "tr-expanded-parent" : ""}>
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
                            <span className="eval-verdict verdict-pass"><FiCheckCircle size={15} /> Pass</span>
                          ) : (
                            <span className="eval-verdict verdict-fail"><FiXCircle size={15} /> Mismatch</span>
                          )}
                        </td>
                        <td>
                          {row.isSpaceCorrect ? (
                            <span className="eval-verdict verdict-pass" style={{ color: "#0EA5E9" }}><FiCheckCircle size={15} /> Pass</span>
                          ) : (
                            <span className="eval-verdict verdict-fail"><FiXCircle size={15} /> Mismatch</span>
                          )}
                        </td>
                        <td>
                          {!hasLines ? (
                            <span className="eval-verdict" style={{ color: "#94A3B8" }}>-</span>
                          ) : hasLineMismatch ? (
                            <span className="eval-verdict verdict-fail" title={`${lineFails} lines mismatched`}><FiXCircle size={15} /> {lineFails} Mismatched</span>
                          ) : (
                            <span className="eval-verdict verdict-pass" style={{ color: "#10B981" }}><FiCheckCircle size={15} /> Perfect</span>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-group">
                            <button onClick={() => setSelectedItemCode(row)} className="eval-btn-inspect">
                              <FiCode size={14} /> Inspect AST
                            </button>
                            <button onClick={() => toggleRowDropdown(row.id)} className={`eval-btn-dropdown ${isExpanded ? "active-dropdown" : ""} ${hasLineMismatch && !isExpanded ? "btn-dropdown-error" : ""}`}>
                              <FiList size={14} /> <span>{isExpanded ? "Hide Lines" : (hasLineMismatch ? "Review Errors" : "Line Checks")}</span> {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="tr-dropdown-content">
                          <td colSpan="8" className="td-dropdown-cell">
                            <div className="line-checks-dropdown-box">
                              <div className="dropdown-box-header">
                                <div className="dbh-left">
                                  <FiCornerDownRight size={16} className="dbh-icon" />
                                  <strong>Line-by-Line Complexity & Execution Verification</strong>
                                  <span className="dbh-sub">Statement-level Big-O detection trace for {row.name}</span>
                                </div>
                                <div className="dbh-right">
                                  <span className="line-count-pill">
                                    <FiLayers size={13} style={{ marginRight: "5px" }} />
                                    {row.lineValidationResults?.length || 0} Statements Evaluated
                                  </span>
                                </div>
                              </div>

                              <div className="dropdown-table-wrapper">
                                <table className="dropdown-line-table">
                                  <thead>
                                    <tr>
                                      <th>Line #</th>
                                      <th>Source Statement</th>
                                      <th>Local Time</th>
                                      <th>Global Time</th>
                                      <th>Local Space</th>
                                      <th>Global Space</th>
                                      <th>Line Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(row.lineValidationResults || []).map((lineItem, lIdx) => {
                                      const expLT = getProp(lineItem, ['expLocalTime', 'expectedLocalTime', 'local_time']);
                                      const predLT = getProp(lineItem, ['predLocalTime', 'predictedLocalTime']);
                                      const expGT = getProp(lineItem, ['expGlobalTime', 'expectedGlobalTime', 'global_time']);
                                      const predGT = getProp(lineItem, ['predGlobalTime', 'predictedGlobalTime']);
                                      const expLS = getProp(lineItem, ['expLocalSpace', 'expectedLocalSpace', 'local_space']);
                                      const predLS = getProp(lineItem, ['predLocalSpace', 'predictedLocalSpace']);
                                      const expGS = getProp(lineItem, ['expGlobalSpace', 'expectedGlobalSpace', 'global_space']);
                                      const predGS = getProp(lineItem, ['predGlobalSpace', 'predictedGlobalSpace']);

                                      return (
                                        <tr key={`line_${row.id}_${lineItem.lineno}_${lIdx}`} className={!lineItem.isPassed && lineItem.hasGroundTruth ? "line-tr-fail" : ""}>
                                          <td className="line-td-num">{lineItem.lineno}</td>
                                          <td className="line-td-code"><code>{lineItem.lineOfCode || "-"}</code></td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expLT, predLT, lineItem.ltMatch)
                                              : <span className="comp-act comp-neutral">{predLT || "-"}</span>}
                                          </td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expGT, predGT, lineItem.gtMatch)
                                              : <span className="comp-act comp-neutral">{predGT || "-"}</span>}
                                          </td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expLS, predLS, lineItem.lsMatch)
                                              : <span className="comp-act comp-neutral">{predLS || "-"}</span>}
                                          </td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expGS, predGS, lineItem.gsMatch)
                                              : <span className="comp-act comp-neutral">{predGS || "-"}</span>}
                                          </td>
                                          <td className="line-td-status">
                                            {lineItem.hasGroundTruth ? (
                                              lineItem.isPassed ? (
                                                <span className="line-verdict verdict-pass"><FiCheckCircle size={13} /> Match</span>
                                              ) : (
                                                <span className="line-verdict verdict-fail"><FiXCircle size={13} /> Mismatch</span>
                                              )
                                            ) : (
                                              <span className="line-verdict verdict-none">AST Verified</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}

                                    {(!row.lineValidationResults || row.lineValidationResults.length === 0) && (
                                      <tr>
                                        <td colSpan="7" style={{ padding: "28px", textAlign: "center", color: "#64748B" }}>
                                          No statement-level AST trace recorded for this dataset snippet.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              <div className="dropdown-box-footer">
                                <div className="dbf-verdict">
                                  <span>Overall Algorithm Verdict:</span>
                                  {row.isCompletelyCorrect ? (
                                    <strong className="verdict-pass"><FiCheckCircle size={16} /> PASSED OVERALL</strong>
                                  ) : (
                                    <strong className="verdict-fail"><FiXCircle size={16} /> FAILED OVERALL</strong>
                                  )}
                                </div>
                                <div className="dbf-metrics">
                                  <div className="dbf-metric-item">
                                    <span>Overall Time:</span>
                                    <strong className={row.isTimeCorrect ? "verdict-pass" : "verdict-fail"}>
                                      Exp {row.expectedTime} vs Act {row.predictedTime}
                                    </strong>
                                  </div>
                                  <div className="dbf-metric-item">
                                    <span>Overall Space:</span>
                                    <strong className={row.isSpaceCorrect ? "verdict-pass" : "verdict-fail"}>
                                      Exp {row.expectedSpace} vs Act {row.predictedSpace}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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