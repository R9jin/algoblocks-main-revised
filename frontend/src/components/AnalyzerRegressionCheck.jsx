// frontend/src/components/AnalyzerRegressionCheck.jsx
//
// Runnable, backend-triggered regression gate for the complexity analyzer,
// surfaced directly in the Admin Dashboard.
//
// Deliberately distinct from EvaluationSuite ("Dataset Testing" below this
// panel on the dashboard): EvaluationSuite runs the analyzer client-side via
// Pyodide and is built for exploratory analysis (charts, per-line
// breakdowns, downloadable logs). This panel calls a FastAPI endpoint that
// runs the same analyzer server-side on plain CPython against a fixed
// accuracy floor and returns a single PASS/FAIL verdict -- the answer to
// "how do you know accuracy hasn't regressed," runnable in a couple of
// seconds with no browser WASM load required.
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
  LuFlaskConical,
  LuRefreshCw,
} from "react-icons/lu";
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || r.id}</td>
                  <td>{r.expected}</td>
                  <td>{r.predicted ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AnalyzerRegressionCheck() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      if (!response.ok) throw new Error(data.detail || "Regression check failed");
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
        <h2><LuFlaskConical size={20} /> Analyzer Regression Check</h2>
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

      <p className="arc-intro">
        Runs the complexity analyzer server-side against all {report?.dataset_size ?? "266"}{" "}
        ground-truth samples and checks the result against fixed accuracy floors --
        the backend, pass/fail counterpart to the interactive Dataset Testing
        benchmark below.
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
              label="Overall Time Complexity Accuracy"
              accuracy={report.time_complexity.accuracy}
              correct={report.time_complexity.correct}
              total={report.time_complexity.n}
              floorOrCeiling={report.time_complexity.floor}
              floorLabel="floor"
              passed={report.time_complexity.passed}
            />
            <MetricCard
              label="Overall Space Complexity Accuracy"
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
            <h3>Accuracy by expected complexity class</h3>
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
            title="Time complexity mismatches"
            rows={report.time_complexity.mismatches}
            truncated={report.time_complexity.mismatches_truncated}
          />
          <MismatchTable
            title="Space complexity mismatches"
            rows={report.space_complexity.mismatches}
            truncated={report.space_complexity.mismatches_truncated}
          />
        </>
      )}
    </div>
  );
}
