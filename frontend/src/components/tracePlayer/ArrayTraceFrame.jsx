// frontend/src/components/tracePlayer/ArrayTraceFrame.jsx
//
// Renders one step of an array-based algorithm trace (linear/binary search,
// bubble/selection sort, etc.) as a row of highlighted cells. `roles` maps
// an array index to a highlight role for *this* step; `pointers` places
// named labels (e.g. "i", "min") above specific indices.
const ROLE_LABELS = {
  compare: "Comparing",
  swap: "Swapped",
  found: "Match",
  sorted: "Locked in",
  candidate: "Current minimum",
  eliminated: "Ruled out",
};

export default function ArrayTraceFrame({ array = [], roles = {}, pointers = [] }) {
  const usedRoles = [...new Set(Object.values(roles))];

  return (
    <div className="array-trace-frame">
      <div className="array-trace-row">
        {array.map((value, i) => {
          const role = roles[i];
          const labelsHere = pointers.filter((p) => p.index === i).map((p) => p.label);
          return (
            <div key={i} className="array-trace-cell-wrap">
              <div className="array-trace-pointer-slot">
                {labelsHere.length > 0 && (
                  <div className="array-trace-pointer">
                    {labelsHere.join(", ")}
                    <span className="array-trace-pointer-arrow" />
                  </div>
                )}
              </div>
              <div
                key={`${i}-${role || "default"}`}
                className={`array-trace-cell${role ? ` role-${role}` : ""}`}
              >
                {value}
              </div>
              <div className="array-trace-index">{i}</div>
            </div>
          );
        })}
      </div>

      {usedRoles.length > 0 && (
        <div className="array-trace-legend">
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
