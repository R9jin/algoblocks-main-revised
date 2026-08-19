// frontend/src/components/panelContent/ComplexityPanelContent.jsx
//
// The complexity tab's body content, extracted out of the old
// DockedBottomPanel so it can be docked independently by
// DockableWorkspace. Reuses the original CSS classes so nothing visually
// changes.

import DOMPurify from "dompurify";
import React, { useState } from "react";
import { FiChevronDown, FiInfo } from "react-icons/fi";
import { BLOCK_EXAMPLES } from "../../data/blockExamples";
import { useExampleWorker } from "../../hooks/useExampleWorker.js";
import { formatExplanation, getComplexityColor, getComplexityWeight, parseMarkdown } from "../../utils/asymptoticParser.jsx";
import { formatComplexity } from "../../utils/formatters";
import CallGraphVisualizer from "../CallGraphVisualizer.jsx";
import ComplexityGraph from "../ComplexityGraph.jsx";
import LessonBlockPlayground from "../LessonBlockPlayground.jsx";
import MemoryVisualizer from "../MemoryVisualizer.jsx";
import ScopeWarningModal from "../ScopeWarningModal.jsx";

export default function ComplexityPanelContent({
  activeComplexityTab,
  onComplexityTabChange,
  analysisResult,
  analysisTime,
  defaultWeight = 0,
  analysisTimeLabel = "Analysis:",
  analysisBadgeStyle = null,
  analysisLabelStyle = null,
  analysisValStyle = null,
  extraBadges = null,
}) {
  const [expandedLines, setExpandedLines] = useState({});
  const toggleLine = (index) => setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));

  // Own isolated execution worker for the "try an example" playground shown
  // while there's nothing to analyze yet -- separate from whatever engine
  // is running the student's actual project.
  const exampleWorker = useExampleWorker();

  const lines = analysisResult?.lines || [];
  const safeTotal = analysisResult?.total || "O(1)";
  const safeSpaceTotal = analysisResult?.space_total || "O(1)";
  const safeExplanation = analysisResult?.overall_explanation || "";

  // Which libraries in the code the analyzer has no (or only partial) cost
  // rules for, per the last analysis run. Gating on a key derived from the
  // *set* of flagged modules (rather than re-showing on every re-analysis)
  // means the modal reappears when a genuinely new out-of-scope library
  // shows up, not on every keystroke-triggered reanalysis of code the user
  // already acknowledged.
  const scopeWarnings = analysisResult?.scope_warnings || [];
  const scopeWarningsKey = scopeWarnings.length
    ? scopeWarnings.map((w) => `${w.module}:${w.severity}`).sort().join("|")
    : "";
  const [ackedScopeWarningsKey, setAckedScopeWarningsKey] = useState("");
  const [reviewingScopeWarnings, setReviewingScopeWarnings] = useState(false);
  const scopeGateActive = scopeWarningsKey !== "" && scopeWarningsKey !== ackedScopeWarningsKey;
  const acknowledgeScopeWarnings = () => {
    setAckedScopeWarningsKey(scopeWarningsKey);
    setReviewingScopeWarnings(false);
  };

  let maxWeight = 0;
  let bottleneckIndices = [];
  lines.forEach((line, index) => {
    const weight = getComplexityWeight(activeComplexityTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)", defaultWeight);
    if (weight > maxWeight) {
      maxWeight = weight;
      bottleneckIndices = [index];
    } else if (weight === maxWeight && weight > 0) {
      bottleneckIndices.push(index);
    }
  });
  const actualBottleneckIndices = maxWeight >= 5 ? bottleneckIndices : [];

  return (
    <div className="complexity-content">
      <div className="complexity-tabs">
        <div className="tab-btn-group">
          <button onClick={() => { onComplexityTabChange("overall"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "overall" ? "active" : ""}`}>Overall</button>
          <button onClick={() => { onComplexityTabChange("local"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "local" ? "active" : ""}`}>Local</button>
          <button onClick={() => { onComplexityTabChange("global"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "global" ? "active" : ""}`}>Global</button>
          <button onClick={() => { onComplexityTabChange("memory"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "memory" ? "active" : ""}`}>Memory Map</button>
          <button onClick={() => { onComplexityTabChange("callgraph"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "callgraph" ? "active" : ""}`}>Call Graph</button>
        </div>
        <div className="total-badge-group">
          {analysisBadgeStyle ? (
            <span className="total-badge analysis-time-badge" style={analysisBadgeStyle}>
              <span className="total-label" style={analysisLabelStyle || {}}>{analysisTimeLabel}</span>
              <span className="total-val" style={analysisValStyle || {}}>{analysisTime}ms</span>
            </span>
          ) : (
            <span className="total-badge total-time-badge">
              <span className="total-label">Total Time:</span> <span className="total-val">{formatComplexity(safeTotal)}</span>
            </span>
          )}
          {analysisBadgeStyle ? (
            <>
              <span className="total-badge total-time-badge"><span className="total-label">Total Time:</span> <span className="total-val">{formatComplexity(safeTotal)}</span></span>
              <span className="total-badge total-space-badge"><span className="total-label space-label">Total Space:</span> <span className="total-val">{formatComplexity(safeSpaceTotal)}</span></span>
            </>
          ) : (
            <>
              <span className="total-badge total-space-badge">
                <span className="total-label space-label">Total Space:</span> <span className="total-val">{formatComplexity(safeSpaceTotal)}</span>
              </span>
              <span className="total-badge total-analysis-badge">
                <span className="total-label analysis-label">{analysisTimeLabel}</span> <span className="total-val">{analysisTime} ms</span>
              </span>
            </>
          )}
          {extraBadges}
          {scopeWarnings.length > 0 && (
            <button
              type="button"
              className="total-badge scope-warning-badge"
              onClick={() => setReviewingScopeWarnings(true)}
              title="Some libraries used here aren't fully supported by the analyzer"
            >
              <FiInfo /> {scopeWarnings.length} library {scopeWarnings.length === 1 ? "warning" : "warnings"}
            </button>
          )}
        </div>
      </div>

      {scopeGateActive ? (
        <div className="empty-analysis-state scope-gate-placeholder">
          <FiInfo size={28} />
          <p>This code uses libraries the analyzer can't fully reason about, so the results below may be inaccurate.</p>
          <button type="button" className="btn-modal btn-modal-confirm" onClick={() => setReviewingScopeWarnings(true)}>
            Review warnings
          </button>
        </div>
      ) : activeComplexityTab === "overall" ? (
        <div className="overall-complexity-wrapper">
          {safeExplanation ? (
            <div className="overall-markdown-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseMarkdown(safeExplanation)) }} />
          ) : (
            <div className="empty-analysis-state">
              <p>Run code analysis to see the complete overall complexity report.</p>
              {BLOCK_EXAMPLES.controls_for && (
                <LessonBlockPlayground
                  example={BLOCK_EXAMPLES.controls_for}
                  runner={exampleWorker}
                  caption="While you wait, see how a loop like this gets analyzed: each pass through the blocks costs time, so a loop over n items costs O(n)."
                />
              )}
            </div>
          )}
        </div>
      ) : activeComplexityTab === "memory" ? (
        <div className="memory-wrapper">
          <MemoryVisualizer analysisData={lines} currentStep={lines.length > 0 ? lines.length - 1 : 0} />
        </div>
      ) : activeComplexityTab === "callgraph" ? (
        <div className="callgraph-wrapper" style={{ height: "100%", overflow: "hidden" }}>
          <CallGraphVisualizer analysisData={analysisResult || {}} />
        </div>
      ) : (
        <div className="complexity-table-wrapper">
          <table className="complexity-table">
            <thead>
              <tr>
                <th>Line of Code</th>
                <th>Operation</th>
                <th className="right-align">{activeComplexityTab === "local" ? "Local Time" : "Global Time"}</th>
                <th className="right-align">{activeComplexityTab === "local" ? "Local Space" : "Global Space"}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const timeComplexity = activeComplexityTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)";
                const spaceComplexity = activeComplexityTab === "local" ? line.local_space || "O(1)" : line.global_space || "O(1)";
                let timeExp = line.time_explanation ?? line.local_explanation ?? "Not available.";
                let spaceExp = line.space_explanation ?? line.global_explanation ?? "Not available.";

                const isBottleneck = actualBottleneckIndices.includes(i);
                const timeColor = getComplexityColor(timeComplexity);
                const spaceColor = getComplexityColor(spaceComplexity);
                const compStripped = timeComplexity.toLowerCase().replace(/\s+/g, "");
                const isEfficient = !isBottleneck && (compStripped.includes("logn") || compStripped.includes("√n") || compStripped.includes("sqrt") || compStripped.includes("t(n/2)+o(1)")) && !compStripped.includes("nlogn");

                return (
                  <React.Fragment key={i}>
                    <tr
                      className={`complexity-row ${expandedLines[i] ? "expanded" : ""} ${isBottleneck ? "bottleneck-active" : ""} ${isEfficient ? "efficient-active" : ""}`}
                      onClick={() => toggleLine(i)}
                      style={{ borderLeftColor: isBottleneck ? "#EF4444" : isEfficient ? "#10B981" : expandedLines[i] ? timeColor : "transparent" }}
                    >
                      <td className="code-cell" style={{ paddingLeft: line.indent ? `${line.indent * 15 + 20}px` : "20px" }}>{line.lineOfCode || line.code}</td>
                      <td className="operation-cell">
                        {line.operation || "-"}
                        {isBottleneck && <span className="bottleneck-badge">Bottleneck</span>}
                        {isEfficient && <span className="efficient-badge">Efficient</span>}
                      </td>
                      <td className="complexity-cell" style={{ color: timeColor }}>{formatComplexity(timeComplexity)}</td>
                      <td className="complexity-cell" style={{ color: spaceColor }}>
                        {formatComplexity(spaceComplexity)} <FiChevronDown className={`dropdown-chevron ${expandedLines[i] ? "open" : ""}`} />
                      </td>
                    </tr>
                    {expandedLines[i] && (
                      <tr className="explanation-row">
                        <td colSpan="4">
                          <div className="explanation-grid" style={{ borderLeftColor: timeColor }}>
                            <div className="explanation-section">
                              <div className="explanation-icon-wrapper" style={{ color: timeColor }}><FiInfo size={20} /></div>
                              <div className="explanation-text-content">
                                <strong className="explanation-header" style={{ color: timeColor }}>Time Complexity</strong>
                                <div className="explanation-body">{formatExplanation(timeExp, isBottleneck, activeComplexityTab === "local")}</div>
                              </div>
                            </div>
                            <div className="explanation-section space-section">
                              <div className="explanation-icon-wrapper" style={{ color: spaceColor }}><FiInfo size={20} /></div>
                              <div className="explanation-text-content">
                                <strong className="explanation-header" style={{ color: spaceColor }}>Space Complexity</strong>
                                <div className="explanation-body">{formatExplanation(spaceExp, isBottleneck, activeComplexityTab === "local")}</div>
                              </div>
                            </div>
                            <div className="explanation-graph-wrapper">
                              <ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" />
                            </div>
                            <div className="explanation-graph-wrapper space-graph-wrapper">
                              <ComplexityGraph complexity={spaceComplexity} color={spaceColor} label="Space Curve" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ScopeWarningModal
        isOpen={scopeGateActive || reviewingScopeWarnings}
        warnings={scopeWarnings}
        title="Some libraries here aren't fully supported"
        proceedText="OK, show analysis"
        hideCancel={scopeGateActive}
        onProceed={acknowledgeScopeWarnings}
        onCancel={() => setReviewingScopeWarnings(false)}
      />
    </div>
  );
}
