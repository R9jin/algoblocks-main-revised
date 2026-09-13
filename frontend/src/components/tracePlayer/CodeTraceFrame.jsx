import React from "react";

export default function CodeTraceFrame({ codeLines = [], activeLine = -1, variables = {} }) {
  return (
    <div className="code-trace-frame" style={{ display: "flex", gap: "20px", width: "100%", justifyContent: "center" }}>
      <div className="code-block-container" style={{ background: "#f5f3ff", padding: "16px", borderRadius: "8px", border: "1px solid #ded8ef", flex: "1", maxWidth: "400px", fontFamily: "monospace", fontSize: "0.9rem" }}>
        {codeLines.map((line, i) => (
          <div 
            key={i} 
            style={{ 
              padding: "2px 8px", 
              backgroundColor: i === activeLine ? "#dbeafe" : "transparent",
              borderLeft: i === activeLine ? "4px solid #3b82f6" : "4px solid transparent",
              color: i === activeLine ? "#1e40af" : "#374151",
              fontWeight: i === activeLine ? "bold" : "normal",
              transition: "all 0.2s ease"
            }}
          >
            <span style={{ color: "#9ca3af", marginRight: "12px", userSelect: "none" }}>{i + 1}</span>
            {line}
          </div>
        ))}
      </div>
      
      {Object.keys(variables).length > 0 && (
        <div className="variables-container" style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #ded8ef", minWidth: "150px" }}>
          <h4 style={{ margin: "0 0 12px 0", color: "#4b5563", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Variables</h4>
          {Object.entries(variables).map(([key, val]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px solid #f3f4f6", paddingBottom: "4px" }}>
              <span style={{ fontWeight: "600", color: "#d35400" }}>{key}</span>
              <span style={{ fontFamily: "monospace" }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
