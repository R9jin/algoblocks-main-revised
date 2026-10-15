import React from "react";

const ROLE_LABELS = {
  compare: "Comparing",
  swap: "Swapped",
  found: "Match / Selected",
  sorted: "Locked in",
  candidate: "Candidate",
  eliminated: "Ruled out",
};

export default function MatrixTraceFrame({ matrix = [], roles = {}, pointers = [] }) {
  const usedRoles = [...new Set(Object.values(roles))];

  return (
    <div className="array-trace-frame matrix-trace-frame" style={{ gap: "4px" }}>
      {matrix.map((row, r) => (
        <div key={r} className="array-trace-row" style={{ marginBottom: "4px" }}>
          <div className="array-trace-index" style={{ width: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>{r}</div>
          {row.map((value, c) => {
            const cellKey = `${r},${c}`;
            const role = roles[cellKey];
            const labelsHere = pointers.filter((p) => p.row === r && p.col === c).map((p) => p.label);
            
            return (
              <div key={c} className="array-trace-cell-wrap" style={{ gap: "2px" }}>
                <div className="array-trace-pointer-slot" style={{ height: "16px", marginBottom: "-4px" }}>
                  {labelsHere.length > 0 && (
                    <div className="array-trace-pointer" style={{ fontSize: "0.6rem" }}>
                      {labelsHere.join(", ")}
                    </div>
                  )}
                </div>
                <div
                  className={`array-trace-cell${role ? ` role-${role}` : ""}`}
                  style={{ width: "40px", minWidth: "40px", height: "40px", padding: 0 }}
                >
                  {value}
                </div>
                {r === matrix.length - 1 && (
                  <div className="array-trace-index" style={{ marginTop: "2px" }}>{c}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {usedRoles.length > 0 && (
        <div className="array-trace-legend" style={{ marginTop: "12px" }}>
          {usedRoles.map((role) => (
            <span key={role} className={`array-trace-legend-item role-${role}`}>
              <span className="array-trace-legend-swatch" />
              {ROLE_LABELS[role] || role}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
