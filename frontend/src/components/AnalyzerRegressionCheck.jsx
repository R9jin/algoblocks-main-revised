// frontend/src/components/AnalyzerRegressionCheck.jsx
//
// Runnable, backend-triggered regression gate for the complexity analyzer,
// surfaced directly in the Admin Dashboard, placed AFTER Dataset Testing
// (EvaluationSuite) so the natural flow is: explore/benchmark first, then
// confirm nothing has regressed.
//
// Deliberately distinct from EvaluationSuite ("Dataset Testing" above this
// panel on the dashboard): EvaluationSuite runs the analyzer client-side via
// Pyodide and is built for exploratory analysis (charts, per-line
// breakdowns, downloadable logs) -- it answers "why is something wrong?".
// This panel calls a FastAPI endpoint that runs the same analyzer
// server-side on plain CPython against fixed accuracy floors and returns a
// single PASS/FAIL verdict -- it answers "has anything broken since last
// time?". Every metric here is a WHOLE-SNIPPET ("overall") comparison, the
// same "overall" terminology EvaluationSuite itself uses for its
// isCompletelyCorrect metric, as opposed to that suite's separate per-line
// metrics. See the in-panel (?) explainer for the version of this aimed at
// someone using the dashboard, not reading this file.
//
// Reuses the same .admin-analytics-dashboard / .analytics-card-grid card
// classes as the rest of the admin pages (see AdminDashboard.jsx) so this
// reads as a native part of that page instead of a bolted-on widget.
import { useState } from "react";
import {
  LuCircleCheckBig,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuCircleX,
  LuCircleHelp,
  LuFlaskConical,
  LuRefreshCw,
} from "react-icons/lu";
import { getErrorMessage } from "../utils/apiError";
import "../styles/AnalyzerRegressionCheck.css";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const getAuthToken = () =>
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  sessionStorage.getItem("authToken");

function VerdictBadge({ passed }) {
  return passed ? (
    <span className="arc-badge arc-badge-pass">
      <LuCircleCheckBig size={15} /> PASS
    </span>
  ) : (
    <span className="arc-badge arc-badge-fail">
      <LuCircleX size={15} /> FAIL
    </span>
  );
}

function MetricCard({ label, accuracy, floorOrCeiling, floorLabel, correct, total, passed }) {
  const pct = Math.round((accuracy ?? 0) * 100);
  return (
    <div className={`analytics-card arc-metric-card ${passed ? "arc-ok" : "arc-bad"}`}>
      <div className="analytics-card-body">
        <div className="arc-metric-top">
          <span className="analytics-card-value">{pct}%</span>
          <VerdictBadge passed={passed} />
        </div>
        <span className="analytics-card-label">{label}</span>
        <span className="arc-metric-sub">
          {correct}/{total} correct &middot; {floorLabel} {Math.round(floorOrCeiling * 100)}%
        </span>
      </div>
    </div>
  );
}

function MismatchRow({ row }) {
  const [codeOpen, setCodeOpen] = useState(false);
  return (
    <>
      <tr className={codeOpen ? "arc-row-expanded" : ""}>
        <td>{row.name || row.id}</td>
        <td>{row.expected}</td>
        <td>{row.predicted ?? "—"}</td>
        <td className="arc-code-col">
          <button
            className={`arc-code-toggle ${codeOpen ? "active" : ""}`}
            onClick={() => setCodeOpen((v) => !v)}
          >
            {codeOpen ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            {codeOpen ? "Hide code" : "View code"}
          </button>
        </td>
      </tr>
      {codeOpen && (
        <tr className="arc-code-row">
          <td colSpan={4} className="arc-code-td">
            {/* Same visual language as EvaluationSuite's Review Errors /
                Inspect AST panel (see .line-checks-dropdown-box /
                .eval-code-preview): light card, icon + title + subtitle
                header, light code preview -- so both admin panels show
                mismatched source the same way. */}
            <div className="arc-code-block">
              <div className="arc-code-block-header">
                <div className="arc-code-block-header-left">
                  <LuChevronDown size={14} className="arc-code-block-icon" />
                  <strong>Source Snippet</strong>
                  <span className="arc-code-block-sub">{row.name || row.id}</span>
                </div>
                <span className="arc-code-block-meta">{row.id} &middot; {row.source_file}</span>
              </div>
              <pre className="arc-code-pre"><code>{row.code || "// source not available for this entry"}</code></pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MismatchTable({ title, rows, truncated }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="arc-mismatch-block">
      <button className="arc-mismatch-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
        {title} ({rows.length}{truncated ? "+" : ""} shown)
      </button>
      {open && (
        <div className="arc-mismatch-table-wrap">
          <table className="arc-mismatch-table">
            <thead>
              <tr>
                <th>Sample</th>
                <th>Expected</th>
                <th>Predicted</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <MismatchRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PurposeExplainer({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="arc-explainer">
      <div className="arc-explainer-row">
        <strong>What this checks</strong>
        <p>
          Every ground-truth sample has one label for its <em>whole</em> function
          --  e.g. "this entire snippet is O(n) time, O(1) space." This panel
          re-runs the analyzer over all 266 samples and checks whether that
          single whole-snippet label still matches, then compares the result
          against a fixed minimum (the "floor" shown on each card). If
          accuracy falls below the floor, the card shows FAIL.
        </p>
      </div>
      <div className="arc-explainer-row">
        <strong>"Overall" specifically means whole-snippet, not per-line</strong>
        <p>
          Dataset Testing (below) checks two different things: whole-snippet
          correctness <em>and</em> line-by-line complexity annotations inside
          each snippet. This panel only checks the whole-snippet number --
          that's what "Overall Time/Space Complexity Accuracy" refers to
          here. For line-level detail, use Dataset Testing.
        </p>
      </div>
      <div className="arc-explainer-row">
        <strong>Why it's separate from Dataset Testing</strong>
        <p>
          Dataset Testing runs in your browser (via Pyodide) and is built for
          exploring <em>why</em> something is wrong -- charts, logs, per-line
          breakdowns. This panel runs on the server in plain Python, has no
          browser/WASM load, finishes in a couple of seconds, and exists to
          answer one narrow question: <em>"has accuracy quietly dropped since
          the last time I checked?"</em> Run Dataset Testing to investigate;
          run this to confirm nothing broke.
        </p>
      </div>
      <button className="arc-explainer-close" onClick={onClose}>Got it</button>
    </div>
  );
}

export default function AnalyzerRegressionCheck() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const runCheck = async (forceRefresh) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const url = `${API_BASE}/api/admin/analyzer/regression-check${forceRefresh ? "?refresh=true" : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Regression check failed"));
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-analytics-dashboard arc-panel">
      <div className="analytics-dashboard-header">
        <h2>
          <LuFlaskConical size={20} /> Analyzer Regression Check
          <button
            type="button"
            className="arc-help-btn"
            onClick={() => setShowExplainer((v) => !v)}
            aria-label="What does this check?"
            title="What does this check?"
          >
            <LuCircleHelp size={17} />
          </button>
        </h2>
        <div className="analytics-dashboard-actions">
          <button
            onClick={() => runCheck(true)}
            className="admin-refresh-btn small"
            disabled={loading}
          >
            <LuRefreshCw size={16} className={loading ? "spinner-icon" : ""} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            {loading ? "Running..." : report ? "Re-run" : "Run Regression Check"}
          </button>
        </div>
      </div>

      <PurposeExplainer open={showExplainer} onClose={() => setShowExplainer(false)} />

      <p className="arc-intro">
        Automated <strong>pass/fail</strong> check, not an exploratory benchmark:
        confirms the analyzer's <strong>whole-snippet ("overall")</strong> accuracy
        across all {report?.dataset_size ?? "266"} ground-truth samples hasn't
        dropped below a fixed minimum since the last check.{" "}
        <button type="button" className="arc-inline-help" onClick={() => setShowExplainer(true)}>
          What does "overall" mean here?
        </button>
      </p>

      {error && (
        <div className="admin-message-box error compact">
          <LuCircleAlert size={22} />
          <span>{error}</span>
        </div>
      )}

      {loading && !report && (
        <div className="admin-loading-state compact">
          <LuRefreshCw size={24} className="spinner-icon" style={{ animation: "spin 2s linear infinite" }} />
          <span>Running regression check against the ground-truth dataset...</span>
        </div>
      )}

      {!report && !loading && !error && (
        <div className="arc-empty-state">
          <button onClick={() => runCheck(false)} className="admin-refresh-btn">
            <LuFlaskConical size={18} /> Run Regression Check
          </button>
        </div>
      )}

      {report && (
        <>
          <div className="arc-overall-row">
            <VerdictBadge passed={report.overall_passed} />
            <span className="arc-overall-label">
              {report.overall_passed ? "All checks passed" : "One or more checks failed"}
            </span>
            <span className="arc-meta">
              {report.duration_ms}ms &middot; {report.cached ? "cached result" : "fresh run"} &middot;{" "}
              {new Date(report.generated_at).toLocaleString()}
            </span>
          </div>

          <div className="analytics-card-grid">
            <MetricCard
              label="Overall Time Accuracy (whole-snippet)"
              accuracy={report.time_complexity.accuracy}
              correct={report.time_complexity.correct}
              total={report.time_complexity.n}
              floorOrCeiling={report.time_complexity.floor}
              floorLabel="floor"
              passed={report.time_complexity.passed}
            />
            <MetricCard
              label="Overall Space Accuracy (whole-snippet)"
              accuracy={report.space_complexity.accuracy}
              correct={report.space_complexity.correct}
              total={report.space_complexity.n}
              floorOrCeiling={report.space_complexity.floor}
              floorLabel="floor"
              passed={report.space_complexity.passed}
            />
            <div className={`analytics-card arc-metric-card ${report.crash_fallback.passed ? "arc-ok" : "arc-bad"}`}>
              <div className="analytics-card-body">
                <div className="arc-metric-top">
                  <span className="analytics-card-value">{Math.round(report.crash_fallback.rate * 100)}%</span>
                  <VerdictBadge passed={report.crash_fallback.passed} />
                </div>
                <span className="analytics-card-label">Crash / Fallback Rate</span>
                <span className="arc-metric-sub">
                  {report.crash_fallback.errors}/{report.crash_fallback.n} errored &middot; ceiling {Math.round(report.crash_fallback.ceiling * 100)}%
                </span>
              </div>
            </div>
            <div className={`analytics-card arc-metric-card ${report.sanity_checks.passed ? "arc-ok" : "arc-bad"}`}>
              <div className="analytics-card-body">
                <div className="arc-metric-top">
                  <span className="analytics-card-value">
                    {report.sanity_checks.cases.filter((c) => c.passed).length}/{report.sanity_checks.cases.length}
                  </span>
                  <VerdictBadge passed={report.sanity_checks.passed} />
                </div>
                <span className="analytics-card-label">Canonical Sanity Checks</span>
                <span className="arc-metric-sub">O(1) / O(log n) / O(n) / O(n^2) / O(2^n)</span>
              </div>
            </div>
          </div>

          <div className="arc-per-class">
            <h3>Accuracy by expected complexity class (whole-snippet)</h3>
            <p className="arc-per-class-note">
              For each class, "Correct" counts snippets whose whole-snippet
              label the analyzer got right -- not individual lines within them.
            </p>
            <table className="arc-mismatch-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>n</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {report.per_class.map((row) => (
                  <tr key={row.class}>
                    <td>{row.class}</td>
                    <td>{row.n}</td>
                    <td>{row.correct}</td>
                    <td>{Math.round(row.accuracy * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <MismatchTable
            title="Time complexity mismatches (whole-snippet label)"
            rows={report.time_complexity.mismatches}
            truncated={report.time_complexity.mismatches_truncated}
          />
          <MismatchTable
            title="Space complexity mismatches (whole-snippet label)"
            rows={report.space_complexity.mismatches}
            truncated={report.space_complexity.mismatches_truncated}
          />
        </>
      )}
    </div>
  );
}
