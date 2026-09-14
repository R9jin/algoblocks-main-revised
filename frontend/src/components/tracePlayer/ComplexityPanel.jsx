import React from "react";

// Shown inside StepTracePlayer's "Complexity" tab. Reads a plain
// `{ opsSoFar, opsTotal, bigO, formula, note }` object off the current
// step -- the same step data every trace kind (array/matrix/callstack/
// recursionTree/code) already carries -- so it works for all of them
// without any per-kind rendering logic.
export default function ComplexityPanel({ complexity, index, total }) {
  if (!complexity) {
    return (
      <div className="complexity-panel complexity-panel-empty">
        No complexity data for this step yet.
      </div>
    );
  }

  const { opsSoFar, opsTotal, bigO, formula, note } = complexity;
  const pct =
    typeof opsSoFar === "number" && typeof opsTotal === "number" && opsTotal > 0
      ? Math.min(100, Math.round((opsSoFar / opsTotal) * 100))
      : Math.round(((index + 1) / Math.max(total, 1)) * 100);

  return (
    <div className="complexity-panel">
      {bigO && <div className="complexity-panel-tag">{bigO}</div>}

      <div className="complexity-panel-counter">
        <span className="complexity-panel-counter-value">
          {opsSoFar ?? index + 1}
        </span>
        {typeof opsTotal === "number" && (
          <span className="complexity-panel-counter-total">/ {opsTotal} operations</span>
        )}
      </div>

      <div className="complexity-panel-bar">
        <div className="complexity-panel-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {formula && <div className="complexity-panel-formula">{formula}</div>}
      {note && <div className="complexity-panel-note">{note}</div>}
    </div>
  );
}
