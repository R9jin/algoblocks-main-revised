// frontend/src/components/tracePlayer/CodePane.jsx
//
// Persistent pseudocode listing shown alongside every trace kind (array,
// matrix, callstack, recursionTree, code). Not a "tab" -- it sits next to
// the visualization stage at all times, and its `activeLine` highlight
// moves in lockstep with the current step, so the person can watch the
// same line "light up" that the ComplexityLedger is currently counting.
export default function CodePane({ codeLines = [], activeLine = -1 }) {
  if (!codeLines.length) return null;

  return (
    <div className="code-pane">
      {codeLines.map((line, i) => (
        <div key={i} className={`code-pane-line${i === activeLine ? " active" : ""}`}>
          <span className="code-pane-line-no">{i + 1}</span>
          <span className="code-pane-line-text">{line}</span>
        </div>
      ))}
    </div>
  );
}
