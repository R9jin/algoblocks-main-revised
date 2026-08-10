// frontend/src/pages/AccuracyOverview.jsx
//
// A visual, student-friendly view of "how accurate is AlgoBlocks' complexity
// analyzer, really?" -- built for regular users, not admins.
//
// The FULL sklearn-style benchmark dashboard (per-class precision/recall/F1
// tables, hover Big-O pie charts, per-snippet processing-time chart, raw
// dataset drill-down) stays admin-only at /admin/evaluation-suite. This page
// reuses the exact same Pyodide worker + curated 266-item ground-truth
// dataset to compute REAL numbers, and surfaces the same headline figures
// admins see at the top of their dashboard -- Overall (block-level) and
// Line-by-Line accuracy for both Time and Space, each with its accuracy
// rate, error rate, passed count, and mismatch count -- just presented as
// rings, stat pills, and progress bars instead of a dense grid of raw
// number tiles. Nothing here is watered down; it's the same data, styled
// for a page someone lands on between lessons rather than a benchmarking
// console. Results are cached in localStorage (shared across users on this
// device, not tied to any one account) so almost every visit is instant;
// the check only re-runs in the background when the cache is missing or
// stale, or when the person taps "Re-check now".
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuCheck,
  LuChevronDown,
  LuClock3,
  LuGauge,
  LuHardDrive,
  LuListTree,
  LuRefreshCw,
  LuX,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { usePyodide } from "../context/PyodideContext";
import "../styles/AccuracyOverview.css";

const CACHE_KEY = "algoblocks_accuracy_overview_cache_v2";
const CACHE_FRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.timeAccuracyRate !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(summary) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(summary));
  } catch {
    // Non-fatal -- worst case, the next visit just re-checks.
  }
}

function timeAgo(ts) {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function AccuracyRing({ percent, tint, size = 128, strokeWidth = 12 }) {
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const c = size / 2;

  return (
    <div className="acc-ring-visual" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="acc-ring-svg" style={{ width: size, height: size }}>
        <circle cx={c} cy={c} r={radius} className="acc-ring-track" strokeWidth={strokeWidth} />
        <circle
          cx={c} cy={c} r={radius}
          className="acc-ring-progress"
          strokeWidth={strokeWidth}
          style={{ stroke: tint, strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="acc-ring-center">
        <span className="acc-ring-percent" style={{ fontSize: size * 0.19 }}>{clamped.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function MetricPanel({ title, icon, tint, accuracy, errorRate, passed, mismatches }) {
  const total = (passed ?? 0) + (mismatches ?? 0);
  const passPct = total > 0 ? (passed / total) * 100 : 0;

  return (
    <div className="acc-metric-panel">
      <div className="acc-metric-panel-head">
        <span className="acc-metric-panel-icon" style={{ background: `${tint}1F`, color: tint }}>
          {icon}
        </span>
        <span>{title}</span>
      </div>

      <div className="acc-metric-panel-body">
        <AccuracyRing percent={accuracy} tint={tint} size={104} strokeWidth={10} />

        <div className="acc-metric-stats">
          <div className="acc-metric-stat-row">
            <span className="acc-stat-dot acc-stat-dot-pass"><LuCheck size={11} /></span>
            <span className="acc-metric-stat-name">Passed</span>
            <strong className="acc-metric-stat-num acc-num-pass">{passed?.toLocaleString()}</strong>
          </div>
          <div className="acc-metric-stat-row">
            <span className="acc-stat-dot acc-stat-dot-fail"><LuX size={11} /></span>
            <span className="acc-metric-stat-name">Mismatches</span>
            <strong className="acc-metric-stat-num acc-num-fail">{mismatches?.toLocaleString()}</strong>
          </div>
          <div className="acc-metric-stat-row acc-metric-stat-row-muted">
            <span className="acc-metric-stat-name">Error rate</span>
            <strong className="acc-metric-stat-num">{errorRate}%</strong>
          </div>
        </div>
      </div>

      <div className="acc-metric-bar" aria-hidden="true">
        <div className="acc-metric-bar-fill" style={{ width: `${passPct}%`, background: tint }} />
      </div>
    </div>
  );
}

export default function AccuracyOverview() {
  const navigate = useNavigate();
  const { worker, isEngineReady } = usePyodide();

  const [summary, setSummary] = useState(() => readCache());
  const [isChecking, setIsChecking] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!userStr) navigate("/");
  }, [navigate]);

  const runCheck = useCallback(async () => {
    if (!worker || !isEngineReady) return;
    setIsChecking(true);
    setCheckFailed(false);

    let stitched = [];
    for (let i = 1; i <= 29; i++) {
      const padded = i.toString().padStart(2, "0");
      try {
        const r = await fetch(`/data/evaluation/processed/ground_truth_chunk_${padded}.json`);
        if (r.ok) {
          const json = await r.json();
          if (Array.isArray(json)) stitched = stitched.concat(json);
        }
      } catch {
        // skip a missing/broken chunk rather than failing the whole check
      }
    }

    if (stitched.length === 0) {
      if (isMountedRef.current) {
        setIsChecking(false);
        setCheckFailed(true);
      }
      return;
    }

    const handleMessage = (e) => {
      const { type, payload } = e.data;
      if (type === "BENCHMARK_COMPLETE") {
        const lineTimeFailed = (payload.totalLinesTested ?? 0) - (payload.lineTimePassed ?? 0);
        const lineSpaceFailed = (payload.totalLinesTested ?? 0) - (payload.lineSpacePassed ?? 0);
        const nextSummary = {
          totalTested: payload.totalTested,
          totalLinesTested: payload.totalLinesTested,

          timePassed: payload.timePassed,
          timeFailed: payload.timeFailed,
          timeAccuracyRate: payload.timeAccuracyRate,
          timeErrorRate: payload.timeErrorRate,

          spacePassed: payload.spacePassed,
          spaceFailed: payload.spaceFailed,
          spaceAccuracyRate: payload.spaceAccuracyRate,
          spaceErrorRate: payload.spaceErrorRate,

          lineTimePassed: payload.lineTimePassed,
          lineTimeFailed,
          lineTimeAccuracyRate: payload.lineTimeAccuracyRate,
          lineTimeErrorRate: parseFloat((100 - payload.lineTimeAccuracyRate).toFixed(2)),

          lineSpacePassed: payload.lineSpacePassed,
          lineSpaceFailed,
          lineSpaceAccuracyRate: payload.lineSpaceAccuracyRate,
          lineSpaceErrorRate: parseFloat((100 - payload.lineSpaceAccuracyRate).toFixed(2)),

          checkedAt: Date.now(),
        };
        writeCache(nextSummary);
        if (isMountedRef.current) {
          setSummary(nextSummary);
          setIsChecking(false);
        }
        worker.removeEventListener("message", handleMessage);
      } else if (type === "BENCHMARK_ERROR") {
        if (isMountedRef.current) {
          setIsChecking(false);
          setCheckFailed(true);
        }
        worker.removeEventListener("message", handleMessage);
      }
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage({ type: "RUN_BENCHMARK_SUITE", dataset: stitched });
  }, [worker, isEngineReady]);

  // On first mount: if the cache is missing or stale, quietly check in the
  // background. A visitor with a warm cache never sees a loading state at
  // all -- the friendly numbers are just already there.
  useEffect(() => {
    const cached = readCache();
    const isStale = !cached || (Date.now() - (cached.checkedAt || 0) > CACHE_FRESH_MS);
    if (isStale && isEngineReady && worker) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEngineReady, worker]);

  const hasData = !!summary;

  return (
    <div className="acc-overview-page">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tourPageId="accuracy-overview" />

      <div className="acc-overview-content">
        <div className="acc-overview-hero">
          <div className="acc-overview-hero-icon"><LuGauge size={26} /></div>
          <div>
            <h1>How accurate is AlgoBlocks?</h1>
            <p>
              We regularly test the complexity analyzer against a curated set of real
              algorithms with known, textbook-correct Big-O answers -- so you can see how
              much to trust its verdicts.
            </p>
            <p className="acc-scope-note">
              The analyzer classifies into a fixed set of <strong>9 Big-O classes</strong> --
              it is not a general-purpose solver that can identify literally any growth rate.
            </p>
            <div className="acc-scope-badges">
              {["O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)", "O(n!)", "O(V + E)"].map((cls) => (
                <span key={cls} className="acc-scope-badge">{cls}</span>
              ))}
            </div>
          </div>
        </div>

        {!hasData && isChecking && (
          <div className="acc-overview-skeleton">
            <div className="acc-skeleton-ring" />
            <div className="acc-skeleton-ring" />
            <p>Running a quick check against our test set for the first time...</p>
          </div>
        )}

        {!hasData && !isChecking && checkFailed && (
          <div className="acc-overview-error">
            <p>We couldn't run a fresh accuracy check just now. Please try again in a moment.</p>
            <button type="button" className="acc-refresh-btn" onClick={runCheck}>
              <LuRefreshCw size={15} /> Try again
            </button>
          </div>
        )}

        {hasData && (
          <>
            <section className="acc-section">
              <div className="acc-section-head">
                <h2>Overall Algorithm Accuracy</h2>
                <p>
                  Checks the final computed Time and Space complexity for each fully
                  processed algorithm, tested against <strong>{summary.totalTested}</strong> real
                  algorithms with known correct answers.
                </p>
              </div>
              <div className="acc-metric-grid">
                <MetricPanel
                  title="Time Complexity"
                  icon={<LuClock3 size={16} />}
                  tint="#7C5CFF"
                  accuracy={summary.timeAccuracyRate}
                  errorRate={summary.timeErrorRate}
                  passed={summary.timePassed}
                  mismatches={summary.timeFailed}
                />
                <MetricPanel
                  title="Space Complexity"
                  icon={<LuHardDrive size={16} />}
                  tint="#10B981"
                  accuracy={summary.spaceAccuracyRate}
                  errorRate={summary.spaceErrorRate}
                  passed={summary.spacePassed}
                  mismatches={summary.spaceFailed}
                />
              </div>
            </section>

            <section className="acc-section">
              <div className="acc-section-head">
                <h2>Line-by-Line Accuracy</h2>
                <p>
                  Checks the complexity contribution of each individual line of code,
                  verified across <strong>{summary.totalLinesTested?.toLocaleString()}</strong> source
                  lines -- measured independently of the overall result above.
                </p>
              </div>
              <div className="acc-metric-grid">
                <MetricPanel
                  title="Time Complexity"
                  icon={<LuListTree size={16} />}
                  tint="#F59E0B"
                  accuracy={summary.lineTimeAccuracyRate}
                  errorRate={summary.lineTimeErrorRate}
                  passed={summary.lineTimePassed}
                  mismatches={summary.lineTimeFailed}
                />
                <MetricPanel
                  title="Space Complexity"
                  icon={<LuListTree size={16} />}
                  tint="#EC4899"
                  accuracy={summary.lineSpaceAccuracyRate}
                  errorRate={summary.lineSpaceErrorRate}
                  passed={summary.lineSpacePassed}
                  mismatches={summary.lineSpaceFailed}
                />
              </div>
            </section>

            <p className="acc-overview-footnote">
              Last checked {timeAgo(summary.checkedAt)}.
              <button
                type="button"
                className="acc-refresh-link"
                onClick={runCheck}
                disabled={isChecking}
              >
                <LuRefreshCw size={13} className={isChecking ? "acc-spin" : ""} />
                {isChecking ? "Checking..." : "Re-check now"}
              </button>
            </p>

            <div className="acc-explainer">
              <button
                type="button"
                className="acc-explainer-toggle"
                onClick={() => setShowExplainer((v) => !v)}
              >
                <span>What do these numbers actually mean?</span>
                <LuChevronDown size={16} className={showExplainer ? "acc-chevron-open" : ""} />
              </button>
              {showExplainer && (
                <div className="acc-explainer-body">
                  <p>
                    AlgoBlocks reads your code's structure and estimates its Big-O time and
                    space complexity -- the same way you'd reason through it by hand. To keep
                    it honest, we run it against algorithms whose correct complexity is
                    already known (binary search, quicksort, classic interview problems, and
                    more), and check how often it agrees.
                  </p>
                  <p>
                    <strong>Overall accuracy</strong> is whether the final verdict for the
                    whole algorithm is correct. <strong>Line-by-line accuracy</strong> is
                    stricter -- it checks whether each individual line's contribution to that
                    complexity was correctly identified along the way, which is a much finer
                    -grained (and harder) thing to get right.
                  </p>
                  <p>
                    A higher percentage means you can trust the verdict more. It's not
                    perfect -- some unusual or tricky code can still trip it up -- so if a
                    result ever looks surprising, it's worth double-checking by hand too.
                  </p>
                  <p>
                    One more important limit: the analyzer only recognizes 9 specific Big-O
                    classes -- O(1), O(log n), O(sqrt n), O(n), O(n log n), O(n^2), O(2^n),
                    O(n!), and O(V + E) for graph traversals. If a test case's true complexity
                    falls outside that list (say, O(n^3) or O(n^2 log n)), it will always be
                    counted as a mismatch above -- that's a known scope limit, not a sign the
                    analyzer got confused.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
