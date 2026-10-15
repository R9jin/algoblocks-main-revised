// frontend/src/components/panelContent/LineExecutionsView.jsx
//
// The "Line Executions" tab of the console: how many times each source line ran
// during the last run. Besides the per-line hit count and frequency bar it
// highlights the hot spot (busiest line), can filter to executed / not-executed
// lines, can sort by hit count, colours the Python source, and lets the learner
// click a line to jump to it in the Python editor.

import { useMemo, useState } from "react";
import { FiChevronRight, FiZap } from "react-icons/fi";
import { highlightPython } from "../../utils/pythonHighlight";
import "../../styles/LineExecutions.css";

const FILTERS = [
  { id: "all", label: "All lines" },
  { id: "executed", label: "Executed" },
  { id: "notrun", label: "Not executed" },
];

const isCodeLine = (text) => {
  const t = text.trim();
  return t !== "" && !t.startsWith("#");
};

export default function LineExecutionsView({
  pythonCode,
  lineExecutions,
  // Overall time complexity of the program (e.g. "O(n)"), or null while the
  // code has errors / hasn't been analysed.
  totalComplexity = null,
  // Optional: (lineNumber) => void. When given, rows are clickable.
  onJumpToLine = null,
}) {
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("line");

  const sourceLines = useMemo(() => String(pythonCode || "").split("\n"), [pythonCode]);
  const highlighted = useMemo(() => highlightPython(pythonCode || ""), [pythonCode]);

  const stats = useMemo(() => {
    const counts = lineExecutions || {};
    let totalHits = 0;
    let maxHits = 0;
    let executed = 0;
    sourceLines.forEach((_, i) => {
      const h = counts[i + 1] || 0;
      totalHits += h;
      if (h > 0) executed += 1;
      if (h > maxHits) maxHits = h;
    });
    const hasRun = totalHits > 0;
    let notRun = 0;
    if (hasRun) sourceLines.forEach((t, i) => { if (isCodeLine(t) && !(counts[i + 1] || 0)) notRun += 1; });
    // A "hot spot" only means something when some line ran more than once.
    const hotLines = maxHits > 1
      ? sourceLines.map((_, i) => i + 1).filter((n) => (counts[n] || 0) === maxHits)
      : [];
    return { totalHits, maxHits, executed, notRun, hasRun, hotLines };
  }, [sourceLines, lineExecutions]);

  const rows = useMemo(() => {
    const counts = lineExecutions || {};
    let list = sourceLines.map((text, i) => ({ n: i + 1, text, hits: counts[i + 1] || 0 }));
    if (filter === "executed") list = list.filter((r) => r.hits > 0);
    else if (filter === "notrun") list = stats.hasRun ? list.filter((r) => r.hits === 0 && isCodeLine(r.text)) : [];
    if (sortBy === "hits") list = [...list].sort((a, b) => b.hits - a.hits || a.n - b.n);
    return list;
  }, [sourceLines, lineExecutions, filter, sortBy, stats.hasRun]);

  if (!stats.hasRun) {
    return (
      <div className="lex-empty">
        <FiChevronRight size={18} />
        <p>Run the program to see how many times each line executes.</p>
      </div>
    );
  }

  const hotText = stats.hotLines.length === 1
    ? `Line ${stats.hotLines[0]}`
    : `Lines ${stats.hotLines.slice(0, 3).join(", ")}${stats.hotLines.length > 3 ? ", ..." : ""}`;

  const jump = (n) => { if (onJumpToLine) onJumpToLine(n); };

  return (
    <div className="lex-root">
      <div className="lex-summary">
        <div className="lex-stat"><strong>{stats.executed}</strong><span>lines ran</span></div>
        <div className="lex-stat"><strong>{stats.totalHits.toLocaleString()}</strong><span>total executions</span></div>
        {stats.notRun > 0 && <div className="lex-stat"><strong>{stats.notRun}</strong><span>not executed</span></div>}
        {stats.hotLines.length > 0 && (
          <button
            type="button"
            className="lex-hot-chip"
            onClick={() => jump(stats.hotLines[0])}
            title={onJumpToLine ? "Jump to the busiest line" : undefined}
          >
            <FiZap size={13} />
            <span>
              Hot spot: {hotText} ran {stats.maxHits.toLocaleString()}×
              {totalComplexity ? <> · program time {totalComplexity}</> : null}
            </span>
          </button>
        )}
      </div>

      <div className="lex-controls">
        <div className="lex-filter-group" role="group" aria-label="Filter lines">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`lex-filter-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="lex-sort">
          Sort
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="line">Line order</option>
            <option value="hits">Most executed</option>
          </select>
        </label>
      </div>

      <div className="complexity-table-wrapper console-table-override lex-table-wrapper">
        <table className="complexity-table">
          <thead>
            <tr>
              <th className="line-num-th">Line</th>
              <th>Source Code</th>
              <th className="hits-th">Hits</th>
              <th className="freq-th">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="lex-no-rows">
                {filter === "notrun" ? "Every line of code ran at least once." : "No lines to show."}
              </td></tr>
            )}
            {rows.map((r) => {
              const isHot = stats.hotLines.includes(r.n);
              const notRun = r.hits === 0 && isCodeLine(r.text);
              const segments = highlighted[r.n - 1] || [];
              const cls = [
                r.hits > 0 ? "row-has-hits" : "",
                isHot ? "lex-hot-row" : "",
                notRun ? "lex-notrun-row" : "",
                onJumpToLine ? "lex-clickable" : "",
              ].filter(Boolean).join(" ");
              return (
                <tr
                  key={r.n}
                  className={cls}
                  onClick={onJumpToLine ? () => jump(r.n) : undefined}
                  onKeyDown={onJumpToLine ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(r.n); } } : undefined}
                  tabIndex={onJumpToLine ? 0 : undefined}
                  title={onJumpToLine ? `Go to line ${r.n} in the Python editor` : undefined}
                >
                  <td className="line-num-td">{r.n}</td>
                  <td className="source-code-td">
                    {segments.length === 0
                      ? " "
                      : segments.map((s, i) => (s.cls ? <span key={i} className={s.cls}>{s.text}</span> : s.text))}
                    {isHot && <span className="lex-badge lex-badge-hot">Hot</span>}
                    {notRun && stats.hasRun && <span className="lex-badge lex-badge-notrun">not run</span>}
                  </td>
                  <td className={`hits-td ${r.hits > 0 ? "active-hits" : ""}`}>{r.hits > 0 ? r.hits.toLocaleString() : "-"}</td>
                  <td className="freq-td">
                    {r.hits > 0 && stats.maxHits > 0 && (
                      <div
                        className={`freq-bar ${r.hits === stats.maxHits && stats.maxHits > 1 ? "max-freq" : ""}`}
                        style={{ width: `${(r.hits / stats.maxHits) * 100}%` }}
                        title={`${Math.round((r.hits / stats.maxHits) * 100)}% of the busiest line`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
