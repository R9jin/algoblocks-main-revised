import React from "react";

// The actual code listing now lives in the shared CodePane (rendered by
// StepTracePlayer above the stage for every trace kind). This component
// only handles the optional variables side-panel that "code" traces show
// next to it.
export default function CodeTraceFrame({ variables = {} }) {
  if (!Object.keys(variables).length) return null;

  return (
    <div className="variables-container" style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #ded8ef", minWidth: "150px" }}>
      <h4 style={{ margin: "0 0 12px 0", color: "#4b5563", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Variables</h4>
      {Object.entries(variables).map(([key, val]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px solid #f3f4f6", paddingBottom: "4px" }}>
          <span style={{ fontWeight: "600", color: "#d35400" }}>{key}</span>
          <span style={{ fontFamily: "monospace" }}>{val}</span>
        </div>
      ))}
    </div>
  );
}
