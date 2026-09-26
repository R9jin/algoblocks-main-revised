// frontend/src/pages/EvaluationSuite.jsx
import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import ExcelJS from "exceljs";
import { addTableSheet, addKeyValueSheet, downloadWorkbook, planKeyValueSheet, sheetRefs, excelCriterion } from "../utils/excelReport";
import { buildEquivalencePairs } from "../utils/complexityMatch";
import {
  FiActivity,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiChevronDown, FiChevronUp,
  FiChevronLeft, FiChevronRight,
  FiClock, FiCode,
  FiCornerDownRight,
  FiCpu, FiDatabase,
  FiDownload,
  FiFileText,
  FiHelpCircle, FiLayers,
  FiList,
  FiPieChart,
  FiPlay,
  FiRefreshCw,
  FiTrendingDown,
  FiTrendingUp,
  FiX,
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
import { prefetchGroundTruth } from "../utils/datasetCache";
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
  "O(n!)": "#9333EA",
  "O(V + E)": "#EC4899",
  "O(V)": "#DB2777",
  "O(E)": "#BE185D",
};
const BIGO_FALLBACK_COLORS = ["#7928CA", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#22D3EE"];
const getBigOColor = (label, idx) => BIGO_COLOR_MAP[label] || BIGO_FALLBACK_COLORS[idx % BIGO_FALLBACK_COLORS.length];

// Controls the "Generate Full Report" trigger/modal at the bottom of the
// Dataset Testing suite (standalone page and the embedded Admin Dashboard
// copy). Set to `false` to hide it again -- everything it depends on
// (results, PDF export, the modal itself) is untouched.
const SHOW_FULL_REPORT_FEATURE = true;

// The complete, fixed set of Big-O classes the analyzer is designed to
// recognize -- nothing else. Shown to the user directly on the benchmark
// page so a mismatch against, say, O(n^3) or O(n^2 log n) reads as "outside
// the analyzer's supported taxonomy" rather than "the analyzer is broken."
const SUPPORTED_BIGO_CLASSES = [
  "O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)", "O(n!)", "O(V + E)",
];

// Builds a Google-search-style page number list: always shows the first and
// last page, a window around the current page, and "..." markers to bridge
// any gaps -- instead of rendering every single page number when there are
// dozens of them.
function getPaginationRange(current, total) {
  const delta = 2;
  const range = [];
  const withDots = [];
  let last;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  range.forEach((i) => {
    if (last) {
      if (i - last === 2) {
        withDots.push(last + 1);
      } else if (i - last > 2) {
        withDots.push("...");
      }
    }
    withDots.push(i);
    last = i;
  });

  return withDots;
}

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

// Visual ring + stat-pill panel for a single Time/Space metric, matching the
// simplified user-facing AccuracyOverview page's visual language so admins
// get the same at-a-glance readability instead of a dense grid of bare
// number tiles. This is purely presentational -- it renders whatever
// accuracy/errorRate/passed/mismatches numbers it's given, same data as
// before, just laid out as a ring with supporting stats instead of 4
// separate tiles. Meant to be wrapped in <MetricPieHoverCard> so the
// existing hover-to-see-Big-O-breakdown behavior keeps working unchanged.
function EvalMetricPanel({ title, icon, tint, accuracy, errorRate, passed, mismatches, hoverable }) {
  const size = 108;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, accuracy ?? 0));
  const isFull = clamped >= 100;
  const isZero = clamped <= 0;

  // With stroke-linecap: round, the round cap extends by strokeWidth / 2 (~5px, ~5.85 deg).
  // Offset the SVG rotation so the tip of the rounded start cap begins precisely at 12 o'clock.
  const capAngleDeg = ((strokeWidth / 2) / circumference) * 360;
  const svgRotation = -90 + capAngleDeg;

  // Calculate tip-to-tip visual arc length:
  // For clamped <= 80%: 1:1 true visual ratio.
  // For clamped in (80, 100): smoothly transition so that high accuracy rates
  // (e.g., 98.2%, 98.6%, 99.5%) maintain a distinct, visible ~22-25px (~26-29 deg) visual opening,
  // preventing the round end-caps from touching or overlapping before achieving true 100%.
  let visualLength;
  const minTipGap = 21; // px visible opening between rounded caps
  if (clamped <= 80) {
    visualLength = (clamped / 100) * circumference;
  } else {
    const t = (clamped - 80) / 20;
    const maxVisual = circumference - minTipGap;
    const visualAt80 = 0.80 * circumference;
    visualLength = visualAt80 + t * (maxVisual - visualAt80);
  }

  // With stroke-linecap: round, the visible stroke spans strokeLength + strokeWidth.
  const strokeLength = isFull ? circumference : Math.max(0, visualLength - strokeWidth);
  const offset = isFull ? 0 : circumference - strokeLength;
  const c = size / 2;
  const total = (passed ?? 0) + (mismatches ?? 0);
  const passPct = total > 0 ? (passed / total) * 100 : 0;

  return (
    <div className={`eval-metric-panel ${hoverable ? "eval-metric-panel-hoverable" : ""}`}>
      <div className="eval-metric-panel-head">
        <span className="eval-metric-panel-icon" style={{ background: `${tint}1F`, color: tint }}>
          {icon}
        </span>
        <span>{title}</span>
        {hoverable && <FiPieChart className="stat-hover-hint-icon" size={12} />}
      </div>

      <div className="eval-metric-panel-body">
        <div className="eval-metric-ring-visual" style={{ width: size, height: size }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="eval-metric-ring-svg"
            style={{
              width: size,
              height: size,
              transform: `rotate(${svgRotation}deg)`
            }}
          >
            <circle
              cx={c}
              cy={c}
              r={radius}
              className="eval-metric-ring-track"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={c}
              cy={c}
              r={radius}
              className="eval-metric-ring-progress"
              strokeWidth={strokeWidth}
              strokeLinecap={isFull ? "butt" : "round"}
              style={{
                stroke: tint,
                strokeDasharray: circumference,
                strokeDashoffset: offset,
                opacity: isZero ? 0 : 1,
                filter: `drop-shadow(0 2px 5px ${tint}40)`
              }}
            />
          </svg>
          <div className="eval-metric-ring-center">
            <span className="eval-metric-ring-percent">{clamped.toFixed(1)}%</span>
          </div>
        </div>

        <div className="eval-metric-panel-stats">
          <div className="eval-metric-stat-row">
            <span className="eval-metric-stat-dot eval-metric-stat-dot-pass"><FiCheckCircle size={11} /></span>
            <span className="eval-metric-stat-name">Passed</span>
            <strong className="eval-metric-stat-num eval-metric-num-pass">{passed?.toLocaleString?.() ?? passed}</strong>
          </div>
          <div className="eval-metric-stat-row">
            <span className="eval-metric-stat-dot eval-metric-stat-dot-fail"><FiXCircle size={11} /></span>
            <span className="eval-metric-stat-name">Mismatches</span>
            <strong className="eval-metric-stat-num eval-metric-num-fail">{mismatches?.toLocaleString?.() ?? mismatches}</strong>
          </div>
          <div className="eval-metric-stat-row eval-metric-stat-row-muted">
            <span className="eval-metric-stat-name">Error rate</span>
            <strong className="eval-metric-stat-num">{errorRate}%</strong>
          </div>
        </div>
      </div>

      <div className="eval-metric-panel-bar" aria-hidden="true">
        <div className="eval-metric-panel-bar-fill" style={{ width: `${passPct}%`, background: tint }} />
      </div>
    </div>
  );
}

export default function EvaluationSuite({ embedded = false } = {}) {
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
  const [datasetOption, setDatasetOption] = useState("chunks");

  const [expandedRows, setExpandedRows] = useState({});

  // Pagination for the results table at the bottom -- Google-style, fixed
  // page size, reset to page 1 whenever the active filter tab changes so
  // the person never lands on a now-nonexistent page.
  const RESULTS_PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Explainer Modal State & Interactive Sandbox State
  const [isMetricsHelpOpen, setIsMetricsHelpOpen] = useState(false);

  // Full Benchmark Report Modal State -- mirrors the "Generate Full Report"
  // pattern in AdminUserManagement.jsx: rolls up whatever the most recent
  // benchmark run produced (results/processedTimeReport/processedSpaceReport)
  // into one printable view + downloadable PDF, generated on demand rather
  // than kept in sync live.
  const [showFullReport, setShowFullReport] = useState(false);

  const [sandboxTP, setSandboxTP] = useState(80);
  const [sandboxFP, setSandboxFP] = useState(10);
  const [sandboxFN, setSandboxFN] = useState(10);

  // Real-time sandbox calculations
  const simPrecision = sandboxTP / (sandboxTP + sandboxFP) || 0;
  const simRecall = sandboxTP / (sandboxTP + sandboxFN) || 0;
  const simF1 = (simPrecision + simRecall > 0) ?
    (2 * simPrecision * simRecall) / (simPrecision + simRecall) : 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, results]);

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
  // (safeFetchText/safeFetchJson/the manual chunk-fetch loop that used to
  // live here have moved into utils/datasetCache.js, which every page
  // that needs the ground-truth dataset now shares -- see below.)

  const handleStartEvaluation = async () => {
    if (!isEngineReady) {
      alert("The Pyodide Python AST Engine is currently warming up in the background. Please wait 3 seconds.");
      return;
    }

    setIsLoading(true); setProgress(0); setResults(null); setExpandedRows({});

    // Ground-truth chunks are pre-fetched in the background as soon as the
    // user signs in (see App.jsx) and cached in IndexedDB, so this
    // normally resolves instantly instead of stalling on ~30 sequential
    // requests right when the user is waiting to see progress.
    setStatusText("Loading ground-truth dataset...");
    const gauntletPayload = await prefetchGroundTruth();
    if (!gauntletPayload || gauntletPayload.length === 0) {
      alert("Critical Failure: Could not load the ground-truth chunks. Ensure ground_truth_chunk_01.json (and onward) exist inside /public/data/evaluation/processed/");
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
            const expTime = getProp(l, ['expTime', 'expectedTime', 'time']);
            const predTime = getProp(l, ['predTime', 'predictedTime']);
            const expSpace = getProp(l, ['expSpace', 'expectedSpace', 'space']);
            const predSpace = getProp(l, ['predSpace', 'predictedSpace']);

            logText += `  -> Line ${l.lineno}:\n`;
            logText += `     Time Exp [${expTime}] Act [${predTime}]\n`;
            logText += `     Space Exp [${expSpace}] Act [${predSpace}]\n`;
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

  const totalResultPages = Math.max(1, Math.ceil(filteredDetails.length / RESULTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalResultPages);
  const pageDetails = filteredDetails.slice(
    (safeCurrentPage - 1) * RESULTS_PAGE_SIZE,
    safeCurrentPage * RESULTS_PAGE_SIZE
  );

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
          <span className={`comp-act ${isMatch ? "comp-pass" : "comp-fail"}`}>
            {isMatch ? <FiCheckCircle size={11} /> : <FiXCircle size={11} />} {safePred}
          </span>
        </div>
      );
    }
    return <span className="comp-act comp-neutral">{safePred}</span>;
  };

  // Caption printed under any matrix that contains support-0 rows, so a
  // 0.00% precision/recall/F1 is read as "this dataset has no ground-truth
  // instances of that class" rather than "the analyzer failed this class".
  const renderEmptyClassNote = (report, unitLabel) => {
    if (!report?.perClass) return null;
    const emptyClasses = Object.keys(report.perClass).filter((cKey) => !report.perClass[cKey].support);
    if (emptyClasses.length === 0) return null;
    return (
      <p className="sklearn-empty-note">
        <strong>Note:</strong> {emptyClasses.join(", ")} {emptyClasses.length === 1 ? "has" : "have"} a support of 0 -- the
        dataset contains no ground-truth {unitLabel} for {emptyClasses.length === 1 ? "this class" : "these classes"}, so the
        0% precision, recall and F1-score indicate an absence of test cases rather than a misclassification by the analyzer.
        {emptyClasses.length === 1 ? " This class is" : " These classes are"} excluded from the macro and weighted averages.
      </p>
    );
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
    // Graph-class labels only ever come out of the analyzer as the combined
    // "O(V + E)" class (see complexity_synthesizer.py) -- O(V) and O(E) are
    // not classes it supports on their own. Any stray single-letter label
    // (upper- or lower-case, from ground truth or a normalizer miss) folds
    // into "O(V + E)" instead of forming its own row.
    mergeKeys("O(v)", "O(V + E)");
    mergeKeys("O(V)", "O(V + E)");
    mergeKeys("O(e)", "O(V + E)");
    mergeKeys("O(E)", "O(V + E)");

    if (newPerClass["O(quartic)"]) {
      newPerClass["O(n^4)"] = newPerClass["O(quartic)"];
      delete newPerClass["O(quartic)"];
    }

    // Every matrix (time / space, overall / line-level) renders the SAME
    // fixed set of rows in the SAME order -- the analyzer's full supported
    // taxonomy. A class the dataset never exercises still gets a row with
    // 0.0 / 0.0 / 0.0 and support 0, so the space matrices line up
    // row-for-row against the time matrices instead of silently collapsing
    // to whichever classes happened to appear. Classes outside the
    // taxonomy (e.g. a stray O(n^4)) are kept and appended after the
    // canonical nine so nothing is lost.
    const orderedPerClass = {};
    SUPPORTED_BIGO_CLASSES.forEach((cKey) => {
      orderedPerClass[cKey] = newPerClass[cKey] || {
        precision: 0,
        recall: 0,
        f1Score: 0,
        support: 0,
        isEmptyClass: true,
      };
    });
    Object.keys(newPerClass).forEach((cKey) => {
      if (!orderedPerClass[cKey]) orderedPerClass[cKey] = newPerClass[cKey];
    });

    return { ...report, perClass: orderedPerClass };
  };

  const processedTimeReport = results?.timeReport ? processReport(results.timeReport) : null;
  const processedSpaceReport = results?.spaceReport ? processReport(results.spaceReport) : null;

  // Statement-level (global time / global space) matrices -- same shape as
  // the two above, but computed per annotated source line rather than per
  // whole algorithm, so they get their own cards/sections instead of being
  // folded into the overall ones.
  const processedLineTimeReport = results?.lineTimeReport ? processReport(results.lineTimeReport) : null;
  const processedLineSpaceReport = results?.lineSpaceReport ? processReport(results.lineSpaceReport) : null;

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
    () => tallyLineDistribution(results?.details, ["expTime", "expectedTime"]),
    [results]
  );
  const lineSpaceDistribution = useMemo(
    () => tallyLineDistribution(results?.details, ["expSpace", "expectedSpace"]),
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

  const reportScopeLabel = datasetOption === "chunks" ? "Tasty Ground Truth Dataset" : datasetOption;

  const buildBenchmarkNarrative = () => {
    if (!results) return "";
    const timePct = ((results.timePassed / results.totalTested) * 100).toFixed(1);
    const spacePct = ((results.spacePassed / results.totalTested) * 100).toFixed(1);
    return `The AST-based complexity analyzer was benchmarked against ${results.totalTested} algorithm${results.totalTested === 1 ? "" : "s"} from the ${reportScopeLabel}. Overall Time Complexity accuracy was ${timePct}% (${results.timePassed}/${results.totalTested} correct), and overall Space Complexity accuracy was ${spacePct}% (${results.spacePassed}/${results.totalTested} correct). At the statement level, ${results.totalLinesTested} individual source lines with ground-truth annotations were verified, isolated from the overall-block metric above.`;
  };

  // Builds and downloads an actual .pdf file directly in the browser -- no
  // print dialog, no "print to PDF" step. jsPDF + autoTable draw the
  // report's text and tables onto PDF pages ourselves (same approach as the
  // "Generate Full Report" feature in AdminUserManagement.jsx), so
  // pagination is fully under our control and the per-class/per-algorithm
  // tables repeat their headers and break cleanly across pages on their own.
  const handleDownloadBenchmarkPdf = () => {
    if (!results) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const brandColor = [121, 40, 202]; // #7928CA, this page's accent color
    let y = 54;

    const ensureRoom = (needed) => {
      if (y + needed > pageHeight - 40) {
        doc.addPage();
        y = 54;
      }
    };

    const addHeading = (text) => {
      ensureRoom(24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...brandColor);
      doc.text(text, marginX, y);
      y += 18;
      doc.setTextColor(20, 20, 20);
    };

    const addParagraph = (text) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text, pageWidth - marginX * 2);
      lines.forEach((line) => {
        ensureRoom(14);
        doc.text(line, marginX, y);
        y += 13;
      });
      y += 8;
    };

    const addKeyValueTable = (rows) => {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: brandColor },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 } },
        body: rows,
      });
      y = doc.lastAutoTable.finalY + 20;
    };

    // `total` defaults to the algorithm-level denominator (results.totalTested);
    // the line-level matrices pass their own statement-count denominator
    // instead, since they're a different unit of analysis.
    const addClassBreakdownTable = (title, report, passed, total = results.totalTested) => {
      addHeading(title);
      // Rows for classes with no ground-truth samples are still emitted (so
      // all four matrices have the same rows in the same order); they're
      // just rendered in grey so a 0.0% reads as "not exercised by this
      // dataset" instead of a failure.
      const emptyRowIndexes = new Set();
      const body = Object.keys(report.perClass).map((cKey, idx) => {
        const row = report.perClass[cKey];
        if (!row.support) emptyRowIndexes.add(idx);
        return [
          cKey,
          `${(row.precision <= 1 ? row.precision * 100 : row.precision).toFixed(1)}%`,
          `${(row.recall <= 1 ? row.recall * 100 : row.recall).toFixed(1)}%`,
          `${(row.f1Score <= 1 ? row.f1Score * 100 : row.f1Score).toFixed(1)}%`,
          String(row.support),
        ];
      });
      body.push([
        "Overall Accuracy", "--", "--",
        `${((passed / total) * 100).toFixed(1)}%`,
        String(total),
      ]);
      body.push([
        "Macro Avg",
        `${(report.macroAvg.precision <= 1 ? report.macroAvg.precision * 100 : report.macroAvg.precision).toFixed(1)}%`,
        `${(report.macroAvg.recall <= 1 ? report.macroAvg.recall * 100 : report.macroAvg.recall).toFixed(1)}%`,
        `${(report.macroAvg.f1Score <= 1 ? report.macroAvg.f1Score * 100 : report.macroAvg.f1Score).toFixed(1)}%`,
        String(total),
      ]);
      body.push([
        "Weighted Avg",
        `${(report.weightedAvg.precision <= 1 ? report.weightedAvg.precision * 100 : report.weightedAvg.precision).toFixed(1)}%`,
        `${(report.weightedAvg.recall <= 1 ? report.weightedAvg.recall * 100 : report.weightedAvg.recall).toFixed(1)}%`,
        `${(report.weightedAvg.f1Score <= 1 ? report.weightedAvg.f1Score * 100 : report.weightedAvg.f1Score).toFixed(1)}%`,
        String(total),
      ]);
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: brandColor },
        head: [["Complexity Class", "Precision", "Recall", "F1-Score", "Support"]],
        body,
        didParseCell: (data) => {
          if (data.section === "body" && emptyRowIndexes.has(data.row.index)) {
            data.cell.styles.textColor = [150, 150, 165];
            data.cell.styles.fontStyle = "italic";
          }
        },
      });
      y = doc.lastAutoTable.finalY + 8;

      // Footnote so a 0.00% row is never read as a failed class.
      if (emptyRowIndexes.size > 0) {
        ensureRoom(26);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(110, 110, 130);
        const note = doc.splitTextToSize(
          "Note: Rows shown in grey have a support of 0 -- the dataset contains no ground-truth instances of that complexity class for this metric, so their 0.00% precision, recall and F1-score indicate an absence of test cases rather than a misclassification by the analyzer. These classes are excluded from the Macro Avg and Weighted Avg above.",
          pageWidth - marginX * 2
        );
        doc.text(note, marginX, y);
        y += note.length * 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 20);
      }
      y += 14;
    };

    // Title block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 20, 50);
    doc.text("AlgoBlocks \u2014 Complexity Analyzer Benchmark Report", marginX, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 110);
    doc.text(`Generated ${new Date().toLocaleString()}`, marginX, y);
    y += 13;
    doc.text(`Dataset: ${reportScopeLabel}`, marginX, y);
    y += 24;
    doc.setTextColor(20, 20, 20);

    // 1. Benchmark summary
    addHeading("1. Benchmark Summary");
    addParagraph(buildBenchmarkNarrative());
    addKeyValueTable([
      ["Algorithms Tested", String(results.totalTested)],
      ["Overall Time Accuracy (TCDA)", `${((results.timePassed / results.totalTested) * 100).toFixed(1)}% (${results.timePassed}/${results.totalTested}, ${results.totalTested - results.timePassed} mismatches)`],
      ["Time Complexity Error Rate (TCER)", `${(100 - (results.timePassed / results.totalTested) * 100).toFixed(2)}%`],
      ["Overall Space Accuracy (SCDA)", `${((results.spacePassed / results.totalTested) * 100).toFixed(1)}% (${results.spacePassed}/${results.totalTested}, ${results.totalTested - results.spacePassed} mismatches)`],
      ["Space Complexity Error Rate (SCER)", `${(100 - (results.spacePassed / results.totalTested) * 100).toFixed(2)}%`],
      ["Statements Verified (Line-Level)", String(results.totalLinesTested)],
      ["Line Time Accuracy", results.totalLinesTested > 0 ? `${results.lineTimeAccuracyRate}% (${results.lineTimePassed}/${results.totalLinesTested})` : "--"],
      ["Line-Level Time Error Rate", results.totalLinesTested > 0 ? `${(100 - results.lineTimeAccuracyRate).toFixed(2)}%` : "--"],
      ["Line Space Accuracy", results.totalLinesTested > 0 ? `${results.lineSpaceAccuracyRate}% (${results.lineSpacePassed}/${results.totalLinesTested})` : "--"],
      ["Line-Level Space Error Rate", results.totalLinesTested > 0 ? `${(100 - results.lineSpaceAccuracyRate).toFixed(2)}%` : "--"],
      ...(results.efficiency ? [
        ["Total Execution Time", `${results.efficiency.totalExecutionSec}s`],
        ["Throughput", `${results.efficiency.throughputAlgos} algos/s \u00b7 ${results.efficiency.throughputLines} lines/s`],
        ["Mean / Median Processing Time", `${results.efficiency.meanTimeMs}ms / ${results.efficiency.medianTimeMs}ms`],
        ["P95 / Max Processing Time", `${results.efficiency.p95TimeMs}ms / ${results.efficiency.maxTimeMs}ms`],
        ["Peak AST Memory", `${results.efficiency.peakAstMemMB}MB (avg ${results.efficiency.meanAstMemKB}KB)`],
      ] : []),
    ]);

    // 2 & 3. Per-class breakdowns (algorithm-level)
    if (processedTimeReport) {
      addClassBreakdownTable("2. Time Complexity Validation Matrix", processedTimeReport, results.timePassed);
    }
    if (processedSpaceReport) {
      addClassBreakdownTable("3. Space Complexity Validation Matrix", processedSpaceReport, results.spacePassed);
    }

    // 4 & 5. Per-class breakdowns (line-level, global time/space only)
    if (processedLineTimeReport) {
      addClassBreakdownTable("4. Line-Level Time Complexity Validation Matrix", processedLineTimeReport, results.lineTimePassed, results.totalLinesTimeTested);
    }
    if (processedLineSpaceReport) {
      addClassBreakdownTable("5. Line-Level Space Complexity Validation Matrix", processedLineSpaceReport, results.lineSpacePassed, results.totalLinesSpaceTested);
    }

    // 6. Full algorithm-by-algorithm results
    addHeading(`6. Full Algorithm Results (${results.details.length})`);
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: brandColor },
      head: [["ID", "Algorithm", "Category", "Exp Time", "Act Time", "Exp Space", "Act Space", "Overall"]],
      body: results.details.map((d) => [
        d.id,
        d.name,
        d.category || "--",
        d.expectedTime,
        d.predictedTime,
        d.expectedSpace,
        d.predictedSpace,
        d.isCompletelyCorrect ? "Pass" : "Mismatch",
      ]),
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 7) {
          data.cell.styles.textColor = data.cell.raw === "Pass" ? [16, 185, 129] : [239, 68, 68];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    doc.save(`AlgoBlocks-Benchmark-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Builds and downloads the .xlsx counterpart of the report above -- same
  // benchmark run, same scope, but since a spreadsheet isn't paginated the
  // way a PDF page is, this carries the *full* underlying data: every field
  // captured per algorithm (including the source snippet, the analyzer's
  // explanation string, and per-run timing/memory), plus a fully flattened
  // statement-by-statement sheet built from every algorithm's
  // lineValidationResults.
  // ---------------------------------------------------------------------
  // IMPORTANT: nothing derived is written as a literal value here.
  //
  // Only two kinds of cell in this workbook hold a typed-in value:
  //
  //   1. Raw observations -- "Full Algorithm Results" and "Line-Level
  //      Results" (one row per algorithm / per analyzed statement: the
  //      ground-truth label, the label the analyzer predicted, wall-clock
  //      time, peak memory, the source snippet) plus the "Equivalence Rules"
  //      sheet (which label pairs the analyzer treats as the same answer).
  //   2. Two run-level scalars that have no cell-range to be computed
  //      from (total wall-clock seconds, dataset name).
  //
  // The Yes/No columns -- "Time Correct", "Space Correct", "Time Match",
  // "Space Match", "Has Ground Truth" -- are formulas over the label cells
  // beside them and the Equivalence Rules sheet, NOT pasted-in verdicts, so
  // editing a label or a rule re-scores that row and everything downstream.
  //
  // Every range points at a WHOLE COLUMN of the raw sheets, so rows that are
  // deleted, pasted in or added below the last one are all picked up.
  //
  // Everything else -- every TP/FP/FN count, every precision, recall and
  // F1-score, both macro and weighted averages, all four accuracy figures,
  // the throughput and the timing percentiles -- is a live Excel formula
  // over those raw rows. Double-click any of them and the formula bar shows
  // the arithmetic, exactly as it would if the matrix had been tallied by
  // hand: precision as TP/(TP+FP) pointing at its own row's count cells,
  // those counts as COUNTIFS over the raw label columns, and the averages
  // as SUMPRODUCT over the per-class rows above them.
  //
  // The formulas reproduce generateClassificationReport() in
  // analyzer.worker.js term for term (including its rule that a class with
  // zero support scores 0.00 across the board and is excluded from both
  // averages), so recalculating the workbook cannot drift away from the
  // numbers on screen. Each formula cell also carries the already-computed
  // value as its cached result, so the figures are readable before Excel
  // recalculates.
  const handleDownloadBenchmarkExcel = async () => {
    if (!results) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AlgoBlocks";
    workbook.created = new Date();
    const headerColor = "7928CA";

    const details = results.details || [];

    // Flattened statement-level rows -- built up front because the matrix
    // sheets need to know how many there are before they can address them.
    const lineRows = details.flatMap((d) =>
      (d.lineValidationResults || []).map((l) => ({
        algorithmId: d.id,
        algorithmName: d.name,
        lineno: l.lineno,
        lineOfCode: l.lineOfCode,
        operation: l.operation,
        predTime: l.predTime,
        expTime: l.expTime,
        isTimeMatch: l.isTimeMatch ? "Yes" : "No",
        predSpace: l.predSpace,
        expSpace: l.expSpace,
        isSpaceMatch: l.isSpaceMatch ? "Yes" : "No",
        hasGroundTruth: l.hasGroundTruth ? "Yes" : "No",
        hits: l.hits,
        // Source objects for the cached values of the formulas below.
        _isPassed: l.isPassed,
      }))
    );

    // ----- Addresses of the two raw-data sheets -------------------------
    // Built before either sheet exists; Excel resolves forward references,
    // which is what lets Summary and the matrices sit as the first tabs.
    const ALGO_SHEET = "Full Algorithm Results";
    const ALGO_KEYS = [
      "id", "name", "category", "expectedTime", "predictedTime", "isTimeCorrect",
      "expectedSpace", "predictedSpace", "isSpaceCorrect", "overall",
      "processingTimeMs", "peakMemBytes", "explanation", "codeSnippet",
    ];
    const algo = sheetRefs(ALGO_SHEET, ALGO_KEYS, details.length);

    const LINE_SHEET = "Line-Level Results";
    const LINE_KEYS = [
      "algorithmId", "algorithmName", "lineno", "lineOfCode", "operation",
      "predTime", "expTime", "isTimeMatch", "predSpace", "expSpace",
      "isSpaceMatch", "hasGroundTruth", "isPassed", "hits",
    ];
    const line = sheetRefs(LINE_SHEET, LINE_KEYS, lineRows.length);

    const hasLines = lineRows.length > 0;

    // ----- Equivalence Rules (raw, editable) ---------------------------
    // The analyzer does not demand string equality: checkMatch() in
    // utils/complexityMatch.js also accepts some different-looking pairs
    // (e.g. expected O(1) / predicted O(n) for time). Those accepted pairs
    // are written out here, one row each, and the Yes/No formulas below look
    // a pair up in this sheet -- so the workbook applies exactly the rule the
    // benchmark itself applied, and a reader can add or delete a row to see
    // what a stricter or looser rule would do.
    const RULES_SHEET = "Equivalence Rules";
    const RULES_KEYS = ["metric", "expected", "predicted"];
    const rules = sheetRefs(RULES_SHEET, RULES_KEYS, 0);
    const labelUniverse = [
      "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(3^n)",
      "O(V + E)", "O(n * m)", "O(sqrt n)", "O(log min(a, b))",
      ...details.flatMap((d) => [d.expectedTime, d.predictedTime, d.expectedSpace, d.predictedSpace]),
      ...lineRows.flatMap((l) => [l.predTime, l.expTime, l.predSpace, l.expSpace]),
      ...[processedTimeReport, processedSpaceReport, processedLineTimeReport, processedLineSpaceReport]
        .flatMap((r) => Object.keys(r?.perClass || {})),
    ];
    const ruleRows = [
      ...buildEquivalencePairs(labelUniverse, "time").map((p) => ({ metric: "Time", ...p })),
      ...buildEquivalencePairs(labelUniverse, "space").map((p) => ({ metric: "Space", ...p })),
    ];

    // "Does the predicted label count as matching the expected one?" as a
    // cell formula -- the same four shortcuts checkMatch() starts with
    // (either side blank, identical label, expected "-"), then the rules
    // sheet. Excel's `=` is case-insensitive, like checkMatch's toLowerCase.
    const matchFormula = (expCell, predCell, metric) => {
      const rm = rules.bounded("metric");
      const re = rules.bounded("expected");
      const rp = rules.bounded("predicted");
      return `IF(OR(${predCell}="",${expCell}="",${predCell}=${expCell},${expCell}="-",` +
        `SUMPRODUCT((${rm}="${metric}")*(${re}=${expCell})*(${rp}=${predCell}))>0),"Yes","No")`;
    };

    // ----- Confusion counts, recomputed here for the cached values ------
    // Mirrors generateClassificationReport() in analyzer.worker.js. These
    // are ONLY used as the cached result shown before Excel recalculates --
    // the cell itself holds the COUNTIFS/arithmetic formula.
    const classStats = (rows, expKey, predKey, cls, gtOnly) => {
      let tp = 0, predicted = 0, support = 0;
      rows.forEach((r) => {
        if (gtOnly && r.hasGroundTruth !== "Yes") return;
        const isExp = r[expKey] === cls;
        const isPred = r[predKey] === cls;
        if (isExp) support += 1;
        if (isPred) predicted += 1;
        if (isExp && isPred) tp += 1;
      });
      const fp = predicted - tp;
      const fn = support - tp;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = support > 0 ? tp / support : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      return { tp, fp, fn, support, precision, recall, f1 };
    };

    // ----- One validation-matrix sheet ----------------------------------
    // `report` only decides WHICH class rows appear and in what order (the
    // analyzer's full taxonomy, same rows as the on-screen matrix). Every
    // number in the sheet is computed by the sheet itself.
    const addMatrixSheet = (sheetName, report, src, expKey, predKey, srcRows, opts) => {
      if (!report?.perClass) return;
      const gtOnly = Boolean(opts.gtOnly);
      const classes = Object.keys(report.perClass);
      const expR = src.range(expKey);
      const predR = src.range(predKey);
      const gtR = gtOnly ? src.range("hasGroundTruth") : null;
      const gtTerm = gtOnly ? `,${gtR},"Yes"` : "";

      // Column letters of this sheet, so each row's precision/recall/F1 can
      // point at its own TP/FP/FN cells the way a hand-built table would.
      const C = { cls: "A", tp: "B", fp: "C", fn: "D", support: "E", p: "F", r: "G", f1: "H" };
      const firstClassRow = 2;
      const lastClassRow = firstClassRow + classes.length - 1;
      const supportCol = `$${C.support}$${firstClassRow}:$${C.support}$${lastClassRow}`;
      const metricCol = (letter) => `$${letter}$${firstClassRow}:$${letter}$${lastClassRow}`;

      const stats = classes.map((c) => classStats(srcRows, expKey, predKey, c, gtOnly));

      const rows = classes.map((cls, i) => {
        const R = firstClassRow + i;
        const q = `"${excelCriterion(cls)}"`;
        const s = stats[i];
        return {
          complexityClass: cls,
          // TP: ground truth says this class AND the analyzer said it too.
          tp: { formula: `COUNTIFS(${expR},${q},${predR},${q}${gtTerm})`, result: s.tp },
          // FP: everything the analyzer labelled this class, minus the ones
          // it got right -- i.e. cases pulled into the class wrongly.
          fp: { formula: `COUNTIFS(${predR},${q}${gtTerm})-${C.tp}${R}`, result: s.fp },
          // FN: every true instance of the class, minus the ones caught.
          fn: { formula: `COUNTIFS(${expR},${q}${gtTerm})-${C.tp}${R}`, result: s.fn },
          // Support is TP + FN by definition -- the number of true instances.
          support: { formula: `${C.tp}${R}+${C.fn}${R}`, result: s.support },
          precision: {
            formula: `IF(${C.tp}${R}+${C.fp}${R}=0,0,${C.tp}${R}/(${C.tp}${R}+${C.fp}${R}))`,
            result: s.precision,
          },
          recall: {
            formula: `IF(${C.support}${R}=0,0,${C.tp}${R}/${C.support}${R})`,
            result: s.recall,
          },
          f1: {
            formula: `IF(${C.p}${R}+${C.r}${R}=0,0,2*${C.p}${R}*${C.r}${R}/(${C.p}${R}+${C.r}${R}))`,
            result: s.f1,
          },
        };
      });

      // Overall accuracy: the analyzer's own equivalence check, tallied
      // straight off the raw sheet (NOT the diagonal of the matrix -- the
      // check treats some classes as equivalent, which the matrix does not).
      const correctCount = gtOnly
        ? `COUNTIFS(${gtR},"Yes",${src.range(opts.matchKey)},"Yes")`
        : `COUNTIF(${src.range(opts.matchKey)},"Yes")`;
      const totalCount = gtOnly ? `COUNTIF(${gtR},"Yes")` : src.count("id");

      rows.push({
        complexityClass: "Overall Accuracy",
        tp: { formula: correctCount, result: opts.passed ?? 0 },
        fp: "",
        fn: "",
        support: { formula: totalCount, result: opts.total ?? 0 },
        precision: "",
        recall: "",
        f1: {
          formula: `IF(${totalCount}=0,0,${correctCount}/${totalCount})`,
          result: opts.total ? (opts.passed ?? 0) / opts.total : 0,
        },
      });

      // Macro average: unweighted mean across the classes that actually
      // have true instances. Zero-support rows are skipped, matching
      // generateClassificationReport's scoredClassCount.
      const scored = `COUNTIF(${supportCol},">0")`;
      const macro = (letter, key) => {
        const used = stats.filter((s) => s.support > 0);
        const mean = used.length > 0 ? used.reduce((a, s) => a + s[key], 0) / used.length : 0;
        return {
          formula: `IF(${scored}=0,0,SUMPRODUCT((${supportCol}>0)*${metricCol(letter)})/${scored})`,
          result: mean,
        };
      };
      const totalSupport = stats.reduce((a, s) => a + s.support, 0);
      const weighted = (letter, key) => {
        const mean = totalSupport > 0
          ? stats.reduce((a, s) => a + s[key] * s.support, 0) / totalSupport
          : 0;
        return {
          formula: `IF(SUM(${supportCol})=0,0,SUMPRODUCT(${metricCol(letter)},${supportCol})/SUM(${supportCol}))`,
          result: mean,
        };
      };

      rows.push({
        complexityClass: "Macro Avg",
        tp: "", fp: "", fn: "",
        support: { formula: `SUM(${supportCol})`, result: totalSupport },
        precision: macro(C.p, "precision"),
        recall: macro(C.r, "recall"),
        f1: macro(C.f1, "f1"),
      });
      rows.push({
        complexityClass: "Weighted Avg",
        tp: "", fp: "", fn: "",
        support: { formula: `SUM(${supportCol})`, result: totalSupport },
        precision: weighted(C.p, "precision"),
        recall: weighted(C.r, "recall"),
        f1: weighted(C.f1, "f1"),
      });

      addTableSheet(
        workbook,
        sheetName,
        [
          { header: "Complexity Class", key: "complexityClass", width: 20 },
          { header: "TP", key: "tp", width: 8 },
          { header: "FP", key: "fp", width: 8 },
          { header: "FN", key: "fn", width: 8 },
          { header: "Support (TP+FN)", key: "support", width: 16 },
          { header: "Precision", key: "precision", width: 12, numFmt: "0.0%" },
          { header: "Recall", key: "recall", width: 12, numFmt: "0.0%" },
          { header: "F1-Score", key: "f1", width: 12, numFmt: "0.0%" },
        ],
        rows,
        { headerColor }
      );
    };

    // ----- Summary sheet -------------------------------------------------
    // Laid out in two passes: the skeleton below fixes each row's position
    // so the ratios can reference the count cells above them by address
    // (=B6/B5), the way the same table would be built by hand, instead of
    // repeating the whole COUNTIF inside every percentage.
    const timeCorrectR = algo.range("isTimeCorrect");
    const spaceCorrectR = algo.range("isSpaceCorrect");
    const overallR = algo.range("overall");
    const idR = algo.range("id");
    const msR = algo.range("processingTimeMs");
    const memR = algo.range("peakMemBytes");
    const snipR = algo.bounded("codeSnippet");
    const gtR = line.range("hasGroundTruth");
    const lineTimeR = line.range("isTimeMatch");
    const lineSpaceR = line.range("isSpaceMatch");

    const eff = results.efficiency;
    const skeleton = [
      {
        heading: "AlgoBlocks — Complexity Analyzer Benchmark Report",
        rows: [
          ["Generated", "generated"],
          ["Dataset", "dataset"],
          ["How to read this workbook", "howto"],
        ],
      },
      {
        heading: "1. Benchmark Summary",
        narrative: buildBenchmarkNarrative(),
        rows: [
          ["Algorithms Tested", "tested"],
          ["Algorithms with Correct Time", "timePassed"],
          ["Time Mismatches", "timeMismatch"],
          ["Overall Time Accuracy (Time Complexity Detection Accuracy)", "timeAcc"],
          ["Time Complexity Error Rate (TCER)", "timeErr"],
          ["Algorithms with Correct Space", "spacePassed"],
          ["Space Mismatches", "spaceMismatch"],
          ["Overall Space Accuracy (Space Complexity Detection Accuracy)", "spaceAcc"],
          ["Space Complexity Error Rate (SCER)", "spaceErr"],
          ["Algorithms Correct on Both", "bothPassed"],
          ["Overall Pass Rate (Time & Space)", "bothAcc"],
        ],
      },
      {
        heading: "2. Statement-Level (Line) Verification",
        rows: hasLines ? [
          ["Statements Verified (with ground truth)", "linesTested"],
          ["Statements with Correct Time", "lineTimePassed"],
          ["Line Time Accuracy", "lineTimeAcc"],
          ["Line-Level Time Error Rate", "lineTimeErr"],
          ["Statements with Correct Space", "lineSpacePassed"],
          ["Line Space Accuracy", "lineSpaceAcc"],
          ["Line-Level Space Error Rate", "lineSpaceErr"],
        ] : [["Statements Verified (with ground truth)", "linesNone"]],
      },
      ...(eff ? [{
        heading: "3. Efficiency of the Analyzer",
        narrative:
          "Total execution time is the one raw measurement of the run. " +
          "Every other figure in this section is computed from the per-algorithm timings, " +
          "peak-memory readings and code snippets on the 'Full Algorithm Results' sheet.",
        rows: [
          ["Total Execution Time (s)", "execSec"],
          ["Total Source Lines Analyzed", "srcLines"],
          ["Throughput (algorithms/s)", "thrAlgos"],
          ["Throughput (lines/s)", "thrLines"],
          ["Mean Processing Time (ms)", "meanMs"],
          ["Median Processing Time (ms)", "medianMs"],
          ["P95 Processing Time (ms)", "p95Ms"],
          ["Max Processing Time (ms)", "maxMs"],
          ["Peak AST Memory (MB)", "peakMem"],
          ["Mean AST Memory (KB)", "meanMem"],
        ],
      }] : []),
    ];

    const plan = planKeyValueSheet("Summary", skeleton.map((s) => ({
      ...s,
      rows: s.rows.map(([label, id]) => [label, null, id]),
    })));
    const at = (id) => plan.ref(id);

    const totalLines = eff?.totalLines ?? 0;
    const safeDiv = (a, b) => (b ? a / b : 0);
    const values = {
      generated: new Date().toLocaleString(),
      dataset: reportScopeLabel,
      howto: "Every figure is a formula over the raw sheets (Full Algorithm Results, Line-Level Results, " +
        "Equivalence Rules). Edit a label, delete a row or add a row there and every sheet recalculates.",

      tested: { formula: algo.count("id"), result: details.length },
      timePassed: { formula: `COUNTIF(${timeCorrectR},"Yes")`, result: results.timePassed },
      timeMismatch: {
        formula: `COUNTIF(${timeCorrectR},"No")`,
        result: results.totalTested - results.timePassed,
      },
      timeAcc: {
        formula: `IF(${at("tested")}=0,0,${at("timePassed")}/${at("tested")})`,
        numFmt: "0.0%",
        result: safeDiv(results.timePassed, results.totalTested),
      },
      // TCER = 100% - TCDA, computed off this sheet's own accuracy cell so
      // it can never drift out of step with it.
      timeErr: {
        formula: `1-${at("timeAcc")}`,
        numFmt: "0.0%",
        result: 1 - safeDiv(results.timePassed, results.totalTested),
      },
      spacePassed: { formula: `COUNTIF(${spaceCorrectR},"Yes")`, result: results.spacePassed },
      spaceMismatch: {
        formula: `COUNTIF(${spaceCorrectR},"No")`,
        result: results.totalTested - results.spacePassed,
      },
      spaceAcc: {
        formula: `IF(${at("tested")}=0,0,${at("spacePassed")}/${at("tested")})`,
        numFmt: "0.0%",
        result: safeDiv(results.spacePassed, results.totalTested),
      },
      // SCER = 100% - SCDA
      spaceErr: {
        formula: `1-${at("spaceAcc")}`,
        numFmt: "0.0%",
        result: 1 - safeDiv(results.spacePassed, results.totalTested),
      },
      bothPassed: { formula: `COUNTIF(${overallR},"Pass")`, result: results.perfectPassed ?? 0 },
      bothAcc: {
        formula: `IF(${at("tested")}=0,0,${at("bothPassed")}/${at("tested")})`,
        numFmt: "0.0%",
        result: safeDiv(results.perfectPassed ?? 0, results.totalTested),
      },

      linesNone: 0,
      linesTested: { formula: `COUNTIF(${gtR},"Yes")`, result: results.totalLinesTested ?? 0 },
      lineTimePassed: {
        formula: `COUNTIFS(${gtR},"Yes",${lineTimeR},"Yes")`,
        result: results.lineTimePassed ?? 0,
      },
      lineTimeAcc: {
        formula: `IF(${at("linesTested")}=0,0,${at("lineTimePassed")}/${at("linesTested")})`,
        numFmt: "0.0%",
        result: safeDiv(results.lineTimePassed ?? 0, results.totalLinesTested ?? 0),
      },
      lineTimeErr: {
        formula: `1-${at("lineTimeAcc")}`,
        numFmt: "0.0%",
        result: 1 - safeDiv(results.lineTimePassed ?? 0, results.totalLinesTested ?? 0),
      },
      lineSpacePassed: {
        formula: `COUNTIFS(${gtR},"Yes",${lineSpaceR},"Yes")`,
        result: results.lineSpacePassed ?? 0,
      },
      lineSpaceAcc: {
        formula: `IF(${at("linesTested")}=0,0,${at("lineSpacePassed")}/${at("linesTested")})`,
        numFmt: "0.0%",
        result: safeDiv(results.lineSpacePassed ?? 0, results.totalLinesTested ?? 0),
      },
      lineSpaceErr: {
        formula: `1-${at("lineSpaceAcc")}`,
        numFmt: "0.0%",
        result: 1 - safeDiv(results.lineSpacePassed ?? 0, results.totalLinesTested ?? 0),
      },

      // Raw measurements of the run itself -- no cell range exists to
      // derive these from, so they are the only numbers typed in here.
      execSec: eff?.totalExecutionSec ?? 0,
      // Lines are counted off the code-snippet cells themselves (newlines + 1
      // per non-empty snippet, the same count the worker took with
      // split("\n")), so deleting an algorithm also removes its lines.
      srcLines: {
        formula: `SUMPRODUCT((${snipR}<>"")*(LEN(${snipR})-LEN(SUBSTITUTE(${snipR},CHAR(10),""))+1))`,
        result: totalLines,
      },
      thrAlgos: {
        formula: `IF(${at("execSec")}=0,0,${at("tested")}/${at("execSec")})`,
        numFmt: "0.00",
        result: eff?.throughputAlgos ?? 0,
      },
      thrLines: {
        formula: `IF(${at("execSec")}=0,0,${at("srcLines")}/${at("execSec")})`,
        numFmt: "0.00",
        result: eff?.throughputLines ?? 0,
      },
      // Wrapped in IFERROR(...,0): with every row deleted these have nothing
      // to average, and the worker reports 0 in that case too.
      meanMs: { formula: `IFERROR(AVERAGE(${msR}),0)`, numFmt: "0.00", result: eff?.meanTimeMs ?? 0 },
      medianMs: { formula: `IFERROR(MEDIAN(${msR}),0)`, numFmt: "0.00", result: eff?.medianTimeMs ?? 0 },
      // PERCENTILE (the pre-2010 spelling) is linear-interpolated, exactly
      // what calcPercentile() in the worker does -- and needs no _xlfn prefix.
      p95Ms: { formula: `IFERROR(PERCENTILE(${msR},0.95),0)`, numFmt: "0.00", result: eff?.p95TimeMs ?? 0 },
      maxMs: { formula: `MAX(${msR})`, numFmt: "0.00", result: eff?.maxTimeMs ?? 0 },
      peakMem: { formula: `MAX(${memR})/1048576`, numFmt: "0.0000", result: eff?.peakAstMemMB ?? 0 },
      meanMem: { formula: `IFERROR(AVERAGE(${memR})/1024,0)`, numFmt: "0.00", result: eff?.meanAstMemKB ?? 0 },
    };

    addKeyValueSheet(
      workbook,
      "Summary",
      skeleton.map((s) => ({ ...s, rows: s.rows.map(([label, id]) => [label, values[id]]) })),
      { headerColor }
    );

    // ----- The four validation matrices ---------------------------------
    addMatrixSheet("Time Complexity Matrix", processedTimeReport, algo,
      "expectedTime", "predictedTime", details,
      { matchKey: "isTimeCorrect", passed: results.timePassed, total: results.totalTested });

    addMatrixSheet("Space Complexity Matrix", processedSpaceReport, algo,
      "expectedSpace", "predictedSpace", details,
      { matchKey: "isSpaceCorrect", passed: results.spacePassed, total: results.totalTested });

    if (hasLines) {
      addMatrixSheet("Line-Level Time Matrix", processedLineTimeReport, line,
        "expTime", "predTime", lineRows,
        {
          gtOnly: true, matchKey: "isTimeMatch",
          passed: results.lineTimePassed, total: results.totalLinesTimeTested,
        });

      addMatrixSheet("Line-Level Space Matrix", processedLineSpaceReport, line,
        "expSpace", "predSpace", lineRows,
        {
          gtOnly: true, matchKey: "isSpaceMatch",
          passed: results.lineSpacePassed, total: results.totalLinesSpaceTested,
        });
    }

    // ----- Raw data: every field captured per algorithm -----------------
    // The expected/predicted labels below are the normalized ones the
    // classification actually ran on, so the COUNTIFS above count exactly
    // what the worker counted.
    addTableSheet(
      workbook,
      ALGO_SHEET,
      [
        { header: "ID", key: "id", width: 14 },
        { header: "Algorithm", key: "name", width: 26 },
        { header: "Category", key: "category", width: 22 },
        { header: "Expected Time", key: "expectedTime", width: 14 },
        { header: "Predicted Time", key: "predictedTime", width: 14 },
        { header: "Time Correct", key: "isTimeCorrect", width: 12 },
        { header: "Expected Space", key: "expectedSpace", width: 14 },
        { header: "Predicted Space", key: "predictedSpace", width: 14 },
        { header: "Space Correct", key: "isSpaceCorrect", width: 12 },
        { header: "Overall", key: "overall", width: 12 },
        { header: "Processing Time (ms)", key: "processingTimeMs", width: 18, numFmt: "0.00" },
        { header: "Peak Memory (bytes)", key: "peakMemBytes", width: 18 },
        { header: "Explanation", key: "explanation", width: 50, wrap: true },
        { header: "Code Snippet", key: "codeSnippet", width: 60, wrap: true },
      ],
      details.map((d, i) => ({
        id: d.id,
        name: d.name,
        category: d.category || "--",
        expectedTime: d.expectedTime,
        predictedTime: d.predictedTime,
        // Scored by formula from the two label cells on this row (and the
        // Equivalence Rules sheet), so editing either label re-scores it.
        isTimeCorrect: {
          formula: matchFormula(algo.localCell("expectedTime", i), algo.localCell("predictedTime", i), "Time"),
          result: d.isTimeCorrect ? "Yes" : "No",
        },
        expectedSpace: d.expectedSpace,
        predictedSpace: d.predictedSpace,
        isSpaceCorrect: {
          formula: matchFormula(algo.localCell("expectedSpace", i), algo.localCell("predictedSpace", i), "Space"),
          result: d.isSpaceCorrect ? "Yes" : "No",
        },
        // A case counts as a pass only when BOTH checks passed -- written
        // as the AND of the two cells on its own row rather than restated.
        overall: {
          formula: `IF(AND(${algo.localCell("isTimeCorrect", i)}="Yes",${algo.localCell("isSpaceCorrect", i)}="Yes"),"Pass","Mismatch")`,
          result: d.isCompletelyCorrect ? "Pass" : "Mismatch",
        },
        processingTimeMs: d.processingTimeMs,
        peakMemBytes: d.peakMemBytes,
        explanation: d.explanation,
        codeSnippet: d.codeSnippet,
      })),
      { headerColor }
    );

    // ----- Raw data: one row per analyzed statement ---------------------
    if (hasLines) {
      addTableSheet(
        workbook,
        LINE_SHEET,
        [
          { header: "Algorithm ID", key: "algorithmId", width: 14 },
          { header: "Algorithm", key: "algorithmName", width: 24 },
          { header: "Line #", key: "lineno", width: 8 },
          { header: "Line of Code", key: "lineOfCode", width: 46, wrap: true },
          { header: "Operation", key: "operation", width: 16 },
          { header: "Predicted Time", key: "predTime", width: 14 },
          { header: "Expected Time", key: "expTime", width: 14 },
          { header: "Time Match", key: "isTimeMatch", width: 11 },
          { header: "Predicted Space", key: "predSpace", width: 14 },
          { header: "Expected Space", key: "expSpace", width: 14 },
          { header: "Space Match", key: "isSpaceMatch", width: 11 },
          { header: "Has Ground Truth", key: "hasGroundTruth", width: 14 },
          { header: "Passed", key: "isPassed", width: 9 },
          { header: "Hits", key: "hits", width: 8 },
        ],
        lineRows.map((l, i) => ({
          ...l,
          // Ground truth exists exactly when an expected label is present;
          // the two match columns are scored like the algorithm-level ones.
          hasGroundTruth: {
            formula: `IF(${line.localCell("expTime", i)}<>"","Yes","No")`,
            result: l.hasGroundTruth,
          },
          isTimeMatch: {
            formula: matchFormula(line.localCell("expTime", i), line.localCell("predTime", i), "Time"),
            result: l.isTimeMatch,
          },
          isSpaceMatch: {
            formula: matchFormula(line.localCell("expSpace", i), line.localCell("predSpace", i), "Space"),
            result: l.isSpaceMatch,
          },
          isPassed: {
            formula: `IF(AND(${line.localCell("isTimeMatch", i)}="Yes",${line.localCell("isSpaceMatch", i)}="Yes"),"Yes","No")`,
            result: l._isPassed ? "Yes" : "No",
          },
        })),
        { headerColor }
      );
    }

    // ----- Raw data: the label pairs the analyzer treats as matching -----
    addTableSheet(
      workbook,
      RULES_SHEET,
      [
        { header: "Metric", key: "metric", width: 10 },
        { header: "Expected", key: "expected", width: 22 },
        { header: "Predicted (also counts as correct)", key: "predicted", width: 34 },
      ],
      ruleRows,
      { headerColor }
    );

    await downloadWorkbook(workbook, `AlgoBlocks-Benchmark-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Ctrl+S / Cmd+S shortcut -- intercepts the browser's "Save Page" dialog
  // while on the benchmark/dataset-testing screen and instead downloads the
  // benchmark PDF report directly, same output as clicking "Download PDF".
  // Only fires once a benchmark run has actually produced `results`; if the
  // suite hasn't been run yet, the shortcut is a no-op (nothing to export).
  useEffect(() => {
    const handleSaveShortcut = (e) => {
      const isSaveCombo = (e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey);
      if (!isSaveCombo) return;
      e.preventDefault();
      if (results) {
        handleDownloadBenchmarkPdf();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
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

      {!embedded && <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />}

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

        <div className="eval-scope-notice">
          <FiHelpCircle className="eval-scope-notice-icon" size={18} />
          <div className="eval-scope-notice-body">
            <strong className="eval-scope-notice-title">The analyzer only classifies into 9 Big-O classes</strong>
            <p className="eval-scope-notice-text">
              It is not a general-purpose complexity solver — it is designed to recognize exactly the classes badged
              below. A ground-truth case labeled outside this taxonomy (e.g. <code>O(n^3)</code>, <code>O(n^4)</code>,
              or <code>O(n^2 log n)</code>) will always be reported as a mismatch below by design, not because the
              analyzer made a mistake.
            </p>
            <div className="eval-scope-badges">
              {SUPPORTED_BIGO_CLASSES.map((cls) => (
                <span key={cls} className="eval-scope-badge" style={{ "--badge-color": getBigOColor(cls) }}>
                  {cls}
                </span>
              ))}
            </div>
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

            <div className="eval-metric-grid">
              <MetricPieHoverCard label="Overall Time Accuracy" data={overallTimeDistribution} total={processedTimeReport?.totalSupport}>
                <EvalMetricPanel
                  title="Time Complexity"
                  icon={<FiClock size={16} />}
                  tint="#10B981"
                  accuracy={results.timeAccuracyRate}
                  errorRate={results.timeErrorRate}
                  passed={results.timePassed}
                  mismatches={results.timeFailed}
                  hoverable={overallTimeDistribution?.length > 0}
                />
              </MetricPieHoverCard>
              <MetricPieHoverCard label="Overall Space Accuracy" data={overallSpaceDistribution} total={processedSpaceReport?.totalSupport}>
                <EvalMetricPanel
                  title="Space Complexity"
                  icon={<FiCpu size={16} />}
                  tint="#0EA5E9"
                  accuracy={results.spaceAccuracyRate}
                  errorRate={results.spaceErrorRate}
                  passed={results.spacePassed}
                  mismatches={results.spaceFailed}
                  hoverable={overallSpaceDistribution?.length > 0}
                />
              </MetricPieHoverCard>
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

            <div className="eval-metric-grid">
              <MetricPieHoverCard label="Line Time Accuracy" data={lineTimeDistribution} total={results.totalLinesTested}>
                <EvalMetricPanel
                  title="Time Complexity"
                  icon={<FiClock size={16} />}
                  tint="#10B981"
                  accuracy={results.totalLinesTested > 0 ? results.lineTimeAccuracyRate : 0}
                  errorRate={results.totalLinesTested > 0 ? lineTimeErrorRate : "0.0"}
                  passed={results.lineTimePassed}
                  mismatches={lineTimeFailed}
                  hoverable={lineTimeDistribution?.length > 0}
                />
              </MetricPieHoverCard>
              <MetricPieHoverCard label="Line Space Accuracy" data={lineSpaceDistribution} total={results.totalLinesTested}>
                <EvalMetricPanel
                  title="Space Complexity"
                  icon={<FiCpu size={16} />}
                  tint="#0EA5E9"
                  accuracy={results.totalLinesTested > 0 ? results.lineSpaceAccuracyRate : 0}
                  errorRate={results.totalLinesTested > 0 ? lineSpaceErrorRate : "0.0"}
                  passed={results.lineSpacePassed}
                  mismatches={lineSpaceFailed}
                  hoverable={lineSpaceDistribution?.length > 0}
                />
              </MetricPieHoverCard>
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
                        <tr key={`time_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
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
                {renderEmptyClassNote(processedTimeReport, "algorithms")}
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
                        <tr key={`space_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
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
                {renderEmptyClassNote(processedSpaceReport, "algorithms")}
              </div>
            </div>
          </div>
        )}

        {processedLineTimeReport && processedLineSpaceReport && (
          <div className="eval-sklearn-container">
            <div className="eval-sklearn-header">
              <div className="eval-sklearn-header-left">
                <strong className="eval-sklearn-title">
                  <FiLayers style={{ display: "inline", color: "#7928CA", marginRight: "8px" }} /> Line-Level Classification Performance Report
                </strong>
                <span className="eval-sklearn-subtitle">Same Scikit-learn report, scored per individual annotated source line (global time / global space) instead of per whole algorithm. Lines without their own global ground truth are excluded from support.</span>
              </div>
            </div>

            <div className="eval-sklearn-grid">
              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Line-Level Time Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Statements: {results.totalLinesTimeTested}</span>
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
                    {Object.keys(processedLineTimeReport.perClass).map((cKey) => {
                      const row = processedLineTimeReport.perClass[cKey];
                      return (
                        <tr key={`line_time_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                          <td className="td-class-code">{cKey}</td>
                          <td>{renderMetricCell(row.precision)}</td>
                          <td>{renderMetricCell(row.recall)}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td className="td-support-count"><strong>{row.support}</strong> <small>lines</small></td>
                        </tr>
                      );
                    })}
                    <tr className="tr-divider">
                      <td>overall accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td><strong style={{ color: "#10B981", fontSize: "14px" }}>{results.lineTimeAccuracyRate}%</strong> <small style={{ color: "#94A3B8" }}>({(results.lineTimeAccuracyRate / 100).toFixed(2)})</small></td>
                      <td className="td-support-count"><strong>{results.totalLinesTimeTested}</strong> <small>lines</small></td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{renderMetricCell(processedLineTimeReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(processedLineTimeReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(processedLineTimeReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalLinesTimeTested}</strong> <small>lines</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(processedLineTimeReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(processedLineTimeReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(processedLineTimeReport.weightedAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalLinesTimeTested}</strong> <small>lines</small></td>
                    </tr>
                  </tbody>
                </table>
                {renderEmptyClassNote(processedLineTimeReport, "annotated lines")}
              </div>

              <div className="sklearn-table-box">
                <div className="sklearn-table-title">
                  <span>Line-Level Space Complexity Validation Matrix</span>
                  <span style={{ fontWeight: "normal", color: "#64748B" }}>Total Statements: {results.totalLinesSpaceTested}</span>
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
                    {Object.keys(processedLineSpaceReport.perClass).map((cKey) => {
                      const row = processedLineSpaceReport.perClass[cKey];
                      return (
                        <tr key={`line_space_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                          <td className="td-class-code">{cKey}</td>
                          <td>{renderMetricCell(row.precision)}</td>
                          <td>{renderMetricCell(row.recall)}</td>
                          <td>{renderF1Badge(row.f1Score)}</td>
                          <td className="td-support-count"><strong>{row.support}</strong> <small>lines</small></td>
                        </tr>
                      );
                    })}
                    <tr className="tr-divider">
                      <td>overall accuracy</td>
                      <td>-</td>
                      <td>-</td>
                      <td><strong style={{ color: "#0EA5E9", fontSize: "14px" }}>{results.lineSpaceAccuracyRate}%</strong> <small style={{ color: "#94A3B8" }}>({(results.lineSpaceAccuracyRate / 100).toFixed(2)})</small></td>
                      <td className="td-support-count"><strong>{results.totalLinesSpaceTested}</strong> <small>lines</small></td>
                    </tr>
                    <tr>
                      <td>macro avg</td>
                      <td>{renderMetricCell(processedLineSpaceReport.macroAvg.precision)}</td>
                      <td>{renderMetricCell(processedLineSpaceReport.macroAvg.recall)}</td>
                      <td>{renderMetricCell(processedLineSpaceReport.macroAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalLinesSpaceTested}</strong> <small>lines</small></td>
                    </tr>
                    <tr className="tr-weighted">
                      <td>weighted avg</td>
                      <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.precision)}</td>
                      <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.recall)}</td>
                      <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.f1Score)}</td>
                      <td className="td-support-count"><strong>{results.totalLinesSpaceTested}</strong> <small>lines</small></td>
                    </tr>
                  </tbody>
                </table>
                {renderEmptyClassNote(processedLineSpaceReport, "annotated lines")}
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
                {pageDetails.map((row, idx) => {
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
                                      <th>Time</th>
                                      <th>Space</th>
                                      <th>Line Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(row.lineValidationResults || []).map((lineItem, lIdx) => {
                                      const expTime = getProp(lineItem, ['expTime', 'expectedTime', 'time']);
                                      const predTime = getProp(lineItem, ['predTime', 'predictedTime']);
                                      const expSpace = getProp(lineItem, ['expSpace', 'expectedSpace', 'space']);
                                      const predSpace = getProp(lineItem, ['predSpace', 'predictedSpace']);

                                      return (
                                        <tr key={`line_${row.id}_${lineItem.lineno}_${lIdx}`} className={!lineItem.isPassed && lineItem.hasGroundTruth ? "line-tr-fail" : ""}>
                                          <td className="line-td-num">{lineItem.lineno}</td>
                                          <td className="line-td-code"><code>{lineItem.lineOfCode || "-"}</code></td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expTime, predTime, lineItem.isTimeMatch)
                                              : <span className="comp-act comp-neutral">{predTime || "-"}</span>}
                                          </td>
                                          <td className="line-td-comp">
                                            {lineItem.hasGroundTruth
                                              ? renderDualBadge(expSpace, predSpace, lineItem.isSpaceMatch)
                                              : <span className="comp-act comp-neutral">{predSpace || "-"}</span>}
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
                                        <td colSpan="5" style={{ padding: "28px", textAlign: "center", color: "#64748B" }}>
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

            {filteredDetails.length > 0 && totalResultPages > 1 && (
              <div className="eval-pagination">
                <span className="eval-pagination-range">
                  Showing {(safeCurrentPage - 1) * RESULTS_PAGE_SIZE + 1}
                  &ndash;{Math.min(safeCurrentPage * RESULTS_PAGE_SIZE, filteredDetails.length)} of {filteredDetails.length}
                </span>
                <div className="eval-pagination-controls">
                  <button
                    type="button"
                    className="eval-page-arrow"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    aria-label="Previous page"
                  >
                    <FiChevronLeft />
                  </button>

                  {getPaginationRange(safeCurrentPage, totalResultPages).map((p, i) =>
                    p === "..." ? (
                      <span key={`dots-${i}`} className="eval-page-dots">&hellip;</span>
                    ) : (
                      <button
                        type="button"
                        key={p}
                        className={`eval-page-num ${p === safeCurrentPage ? "eval-page-num-active" : ""}`}
                        onClick={() => setCurrentPage(p)}
                        aria-current={p === safeCurrentPage ? "page" : undefined}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    className="eval-page-arrow"
                    onClick={() => setCurrentPage((p) => Math.min(totalResultPages, p + 1))}
                    disabled={safeCurrentPage === totalResultPages}
                    aria-label="Next page"
                  >
                    <FiChevronRight />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FULL REPORT -- rolls up whatever the most recent benchmark run
            produced (overall Time/Space accuracy, per-class validation
            matrices, engine performance, and the full algorithm-by-algorithm
            table) into one printable view, same pattern as the "Generate
            Full Report" feature on the System User Management page. Reuses
            the same `results` payload already held for the dashboard above
            so the report and the on-screen charts never disagree.
            Toggle with SHOW_FULL_REPORT_FEATURE -- see top of file. */}
        {SHOW_FULL_REPORT_FEATURE && (
          <div className="eval-full-report-trigger">
            <button
              className={`eval-btn-run ${!results ? "eval-run-disabled" : "eval-run-ready"}`}
              onClick={() => setShowFullReport(true)}
              disabled={!results}
            >
              <FiFileText size={18} /> Generate Full Report
            </button>
            <span className="eval-full-report-hint">
              {results
                ? `Rolls up the current benchmark run (${results.totalTested} algorithms, ${reportScopeLabel}) into a printable report.`
                : "Run a benchmark above to enable the full report."}
            </span>
          </div>
        )}
      </div>

      {/* FULL REPORT MODAL */}
      {SHOW_FULL_REPORT_FEATURE && showFullReport && results && (
        <div className="modal-overlay eval-report-overlay" onClick={(e) => {
          if (e.target.classList.contains('eval-report-overlay')) setShowFullReport(false);
        }}>
          <div className="eval-report-card">
            <div className="eval-report-header">
              <div className="eval-report-title">
                <FiFileText size={22} />
                <h3>Full Benchmark Report</h3>
              </div>
              <div className="eval-report-header-actions">
                <button className="eval-btn-inspect" onClick={handleDownloadBenchmarkExcel}>
                  <FiFileText size={16} /> Download Excel
                </button>
                <button className="eval-btn-inspect" onClick={handleDownloadBenchmarkPdf}>
                  <FiFileText size={16} /> Download PDF
                </button>
                <button className="eval-report-close" onClick={() => setShowFullReport(false)}>
                  <FiX size={20} />
                </button>
              </div>
            </div>

            <div className="eval-report-body">
              <div className="eval-report-meta">
                <h1>AlgoBlocks &mdash; Complexity Analyzer Benchmark Report</h1>
                <p>Generated {new Date().toLocaleString()}</p>
                <p>Dataset: {reportScopeLabel}</p>
              </div>

              <section className="eval-report-section">
                <h2>1. Benchmark Summary</h2>
                <p>{buildBenchmarkNarrative()}</p>
                <table className="eval-report-table">
                  <tbody>
                    <tr><th>Algorithms Tested</th><td>{results.totalTested}</td></tr>
                    <tr><th>Overall Time Accuracy</th><td>{((results.timePassed / results.totalTested) * 100).toFixed(1)}% ({results.timePassed}/{results.totalTested})</td></tr>
                    <tr><th>Overall Space Accuracy</th><td>{((results.spacePassed / results.totalTested) * 100).toFixed(1)}% ({results.spacePassed}/{results.totalTested})</td></tr>
                    <tr><th>Statements Verified (Line-Level)</th><td>{results.totalLinesTested}</td></tr>
                    <tr><th>Line Time Accuracy</th><td>{results.totalLinesTested > 0 ? `${results.lineTimeAccuracyRate}% (${results.lineTimePassed}/${results.totalLinesTested})` : "--"}</td></tr>
                    <tr><th>Line Space Accuracy</th><td>{results.totalLinesTested > 0 ? `${results.lineSpaceAccuracyRate}% (${results.lineSpacePassed}/${results.totalLinesTested})` : "--"}</td></tr>
                    {results.efficiency && (
                      <>
                        <tr><th>Total Execution Time</th><td>{results.efficiency.totalExecutionSec}s</td></tr>
                        <tr><th>Throughput</th><td>{results.efficiency.throughputAlgos} algos/s &middot; {results.efficiency.throughputLines} lines/s</td></tr>
                        <tr><th>Mean / Median Processing Time</th><td>{results.efficiency.meanTimeMs}ms / {results.efficiency.medianTimeMs}ms</td></tr>
                        <tr><th>P95 / Max Processing Time</th><td>{results.efficiency.p95TimeMs}ms / {results.efficiency.maxTimeMs}ms</td></tr>
                        <tr><th>Peak AST Memory</th><td>{results.efficiency.peakAstMemMB}MB (avg {results.efficiency.meanAstMemKB}KB)</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </section>

              {processedTimeReport && (
                <section className="eval-report-section">
                  <h2>2. Time Complexity Validation Matrix</h2>
                  <table className="eval-report-table wide">
                    <thead>
                      <tr>
                        <th>Complexity Class</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1-Score</th>
                        <th>Support</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(processedTimeReport.perClass).map((cKey) => {
                        const row = processedTimeReport.perClass[cKey];
                        return (
                          <tr key={`rep_time_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                            <td>{cKey}</td>
                            <td>{renderMetricCell(row.precision)}</td>
                            <td>{renderMetricCell(row.recall)}</td>
                            <td>{renderF1Badge(row.f1Score)}</td>
                            <td>{row.support}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td><strong>Overall Accuracy</strong></td>
                        <td>--</td>
                        <td>--</td>
                        <td><strong>{((results.timePassed / results.totalTested) * 100).toFixed(1)}%</strong></td>
                        <td>{results.totalTested}</td>
                      </tr>
                      <tr>
                        <td>Macro Avg</td>
                        <td>{renderMetricCell(processedTimeReport.macroAvg.precision)}</td>
                        <td>{renderMetricCell(processedTimeReport.macroAvg.recall)}</td>
                        <td>{renderMetricCell(processedTimeReport.macroAvg.f1Score)}</td>
                        <td>{results.totalTested}</td>
                      </tr>
                      <tr>
                        <td>Weighted Avg</td>
                        <td>{renderMetricCell(processedTimeReport.weightedAvg.precision)}</td>
                        <td>{renderMetricCell(processedTimeReport.weightedAvg.recall)}</td>
                        <td>{renderMetricCell(processedTimeReport.weightedAvg.f1Score)}</td>
                        <td>{results.totalTested}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderEmptyClassNote(processedTimeReport, "algorithms")}
                </section>
              )}

              {processedSpaceReport && (
                <section className="eval-report-section">
                  <h2>3. Space Complexity Validation Matrix</h2>
                  <table className="eval-report-table wide">
                    <thead>
                      <tr>
                        <th>Complexity Class</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1-Score</th>
                        <th>Support</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(processedSpaceReport.perClass).map((cKey) => {
                        const row = processedSpaceReport.perClass[cKey];
                        return (
                          <tr key={`rep_space_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                            <td>{cKey}</td>
                            <td>{renderMetricCell(row.precision)}</td>
                            <td>{renderMetricCell(row.recall)}</td>
                            <td>{renderF1Badge(row.f1Score)}</td>
                            <td>{row.support}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td><strong>Overall Accuracy</strong></td>
                        <td>--</td>
                        <td>--</td>
                        <td><strong>{((results.spacePassed / results.totalTested) * 100).toFixed(1)}%</strong></td>
                        <td>{results.totalTested}</td>
                      </tr>
                      <tr>
                        <td>Macro Avg</td>
                        <td>{renderMetricCell(processedSpaceReport.macroAvg.precision)}</td>
                        <td>{renderMetricCell(processedSpaceReport.macroAvg.recall)}</td>
                        <td>{renderMetricCell(processedSpaceReport.macroAvg.f1Score)}</td>
                        <td>{results.totalTested}</td>
                      </tr>
                      <tr>
                        <td>Weighted Avg</td>
                        <td>{renderMetricCell(processedSpaceReport.weightedAvg.precision)}</td>
                        <td>{renderMetricCell(processedSpaceReport.weightedAvg.recall)}</td>
                        <td>{renderMetricCell(processedSpaceReport.weightedAvg.f1Score)}</td>
                        <td>{results.totalTested}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderEmptyClassNote(processedSpaceReport, "algorithms")}
                </section>
              )}

              {processedLineTimeReport && (
                <section className="eval-report-section">
                  <h2>4. Line-Level Time Complexity Validation Matrix</h2>
                  <table className="eval-report-table wide">
                    <thead>
                      <tr>
                        <th>Complexity Class</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1-Score</th>
                        <th>Support</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(processedLineTimeReport.perClass).map((cKey) => {
                        const row = processedLineTimeReport.perClass[cKey];
                        return (
                          <tr key={`rep_line_time_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                            <td>{cKey}</td>
                            <td>{renderMetricCell(row.precision)}</td>
                            <td>{renderMetricCell(row.recall)}</td>
                            <td>{renderF1Badge(row.f1Score)}</td>
                            <td>{row.support}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td><strong>Overall Accuracy</strong></td>
                        <td>--</td>
                        <td>--</td>
                        <td><strong>{results.lineTimeAccuracyRate}%</strong></td>
                        <td>{results.totalLinesTimeTested}</td>
                      </tr>
                      <tr>
                        <td>Macro Avg</td>
                        <td>{renderMetricCell(processedLineTimeReport.macroAvg.precision)}</td>
                        <td>{renderMetricCell(processedLineTimeReport.macroAvg.recall)}</td>
                        <td>{renderMetricCell(processedLineTimeReport.macroAvg.f1Score)}</td>
                        <td>{results.totalLinesTimeTested}</td>
                      </tr>
                      <tr>
                        <td>Weighted Avg</td>
                        <td>{renderMetricCell(processedLineTimeReport.weightedAvg.precision)}</td>
                        <td>{renderMetricCell(processedLineTimeReport.weightedAvg.recall)}</td>
                        <td>{renderMetricCell(processedLineTimeReport.weightedAvg.f1Score)}</td>
                        <td>{results.totalLinesTimeTested}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderEmptyClassNote(processedLineTimeReport, "annotated lines")}
                </section>
              )}

              {processedLineSpaceReport && (
                <section className="eval-report-section">
                  <h2>5. Line-Level Space Complexity Validation Matrix</h2>
                  <table className="eval-report-table wide">
                    <thead>
                      <tr>
                        <th>Complexity Class</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1-Score</th>
                        <th>Support</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(processedLineSpaceReport.perClass).map((cKey) => {
                        const row = processedLineSpaceReport.perClass[cKey];
                        return (
                          <tr key={`rep_line_space_${cKey}`} className={row.support === 0 ? "tr-empty-class" : undefined}>
                            <td>{cKey}</td>
                            <td>{renderMetricCell(row.precision)}</td>
                            <td>{renderMetricCell(row.recall)}</td>
                            <td>{renderF1Badge(row.f1Score)}</td>
                            <td>{row.support}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td><strong>Overall Accuracy</strong></td>
                        <td>--</td>
                        <td>--</td>
                        <td><strong>{results.lineSpaceAccuracyRate}%</strong></td>
                        <td>{results.totalLinesSpaceTested}</td>
                      </tr>
                      <tr>
                        <td>Macro Avg</td>
                        <td>{renderMetricCell(processedLineSpaceReport.macroAvg.precision)}</td>
                        <td>{renderMetricCell(processedLineSpaceReport.macroAvg.recall)}</td>
                        <td>{renderMetricCell(processedLineSpaceReport.macroAvg.f1Score)}</td>
                        <td>{results.totalLinesSpaceTested}</td>
                      </tr>
                      <tr>
                        <td>Weighted Avg</td>
                        <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.precision)}</td>
                        <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.recall)}</td>
                        <td>{renderMetricCell(processedLineSpaceReport.weightedAvg.f1Score)}</td>
                        <td>{results.totalLinesSpaceTested}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderEmptyClassNote(processedLineSpaceReport, "annotated lines")}
                </section>
              )}

              <section className="eval-report-section">
                <h2>6. Full Algorithm Results ({results.details.length})</h2>
                <div className="algo-report-table-wrapper">
                  <table className="eval-report-table wide algo-report-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Algorithm</th>
                        <th>Category</th>
                        <th>Exp Time</th>
                        <th>Act Time</th>
                        <th>Exp Space</th>
                        <th>Act Space</th>
                        <th>Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.details.map((d) => (
                        <tr key={`rep_row_${d.id}`}>
                          <td>{d.id}</td>
                          <td>{d.name}</td>
                          <td>{d.category || "--"}</td>
                          <td>{d.expectedTime}</td>
                          <td>{d.predictedTime}</td>
                          <td>{d.expectedSpace}</td>
                          <td>{d.predictedSpace}</td>
                          <td>
                            {d.isCompletelyCorrect ? (
                              <span className="eval-verdict verdict-pass"><FiCheckCircle size={13} /> Pass</span>
                            ) : (
                              <span className="eval-verdict verdict-fail"><FiXCircle size={13} /> Mismatch</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}