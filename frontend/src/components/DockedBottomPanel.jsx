// frontend/src/components/DockedBottomPanel.jsx
import DOMPurify from "dompurify";
import React, { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiInfo, FiX } from "react-icons/fi";
import { formatExplanation, getComplexityColor, getComplexityWeight, parseMarkdown } from "../utils/asymptoticParser.jsx";
import { formatComplexity } from "../utils/formatters";
import CallGraphVisualizer from "./CallGraphVisualizer.jsx";
import ComplexityGraph from "./ComplexityGraph.jsx";
import MemoryVisualizer from "./MemoryVisualizer.jsx";

export default function DockedBottomPanel({
  bottomPanel,
  onClosePanel,
  panelHeight,
  onDragStart,
  consoleTab,
  onConsoleTabChange,
  consoleOutput,
  onClearConsole,
  isWaitingForInput,
  userInput,
  setUserInput,
  onSendInput,
  pythonCode,
  lineExecutions,
  activeComplexityTab,
  onComplexityTabChange,
  analysisResult,
  analysisTime,
  defaultWeight = 0,
  analysisTimeLabel = "Analysis:",
  analysisBadgeStyle = null,
  analysisLabelStyle = null,
  analysisValStyle = null,
  extraBadges = null
}) {
  const [expandedLines, setExpandedLines] = useState({});
  const consoleEndRef = useRef(null);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === "output") {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleOutput, isWaitingForInput, consoleTab]);

  const toggleLine = (index) => setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));

  const lines = analysisResult?.lines || [];
  const safeTotal = analysisResult?.total || "O(1)";
  const safeSpaceTotal = analysisResult?.space_total || "O(1)";
  const safeExplanation = analysisResult?.overall_explanation || "";

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
  const pythonLines = (pythonCode || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(lineExecutions || {}));

  return (
    <div className="bottom-docked-panel" style={{ height: `${panelHeight}px` }}>
      <div className="panel-resizer" onMouseDown={onDragStart}>
        <div className="panel-resizer-handle"></div>
      </div>
      <div className="panel-header">
        <span className="panel-title">{bottomPanel === "console" ? "Console Panel" : "Complexity Analysis"}</span>
        <button onClick={onClosePanel} className="panel-close-btn"><FiX size={18} /></button>
      </div>
      <div className="panel-body">
        {bottomPanel === "console" ? (
          <div className="console-content-wrapper">
            <div className="complexity-tabs">
              <div className="tab-btn-group">
                <button onClick={() => onConsoleTabChange("output")} className={`tab-btn ${consoleTab === "output" ? "active" : ""}`}>Terminal Output</button>
                <button onClick={() => onConsoleTabChange("executions")} className={`tab-btn ${consoleTab === "executions" ? "active" : ""}`}>Line Executions</button>
              </div>
              {consoleTab === "output" && (
                <button className="clear-console-btn" onClick={onClearConsole}>Clear</button>
              )}
            </div>
            <div className="console-view-area">
              {consoleTab === "output" ? (
                <div className="console-container">
                  <pre className="console-output">{consoleOutput}</pre>
                  {isWaitingForInput && (
                    <div className="console-input-line">
                      <span className="console-cursor"><FiChevronRight size={14} /></span>
                      <input
                        autoFocus
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={onSendInput}
                        className="console-input-field"
                        placeholder="Type here and press Enter..."
                      />
                    </div>
                  )}
                  <div ref={consoleEndRef} />
                </div>
              ) : (
                <div className="complexity-table-wrapper console-table-override">
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
                      {pythonLines.map((lineText, idx) => {
                        const hits = (lineExecutions || {})[idx + 1] || 0;
                        return (
                          <tr key={idx} className={hits > 0 ? "row-has-hits" : ""}>
                            <td className="line-num-td">{idx + 1}</td>
                            <td className="source-code-td">{lineText || " "}</td>
                            <td className={`hits-td ${hits > 0 ? "active-hits" : ""}`}>{hits > 0 ? hits : "-"}</td>
                            <td className="freq-td">
                              {hits > 0 && maxExecutions > 0 && (
                                <div className={`freq-bar ${hits === maxExecutions ? "max-freq" : ""}`} style={{ width: `${(hits / maxExecutions) * 100}%` }} title={`${Math.round((hits / maxExecutions) * 100)}%`} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
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
              </div>
            </div>

            {activeComplexityTab === "overall" ? (
              <div className="overall-complexity-wrapper">
                {safeExplanation ? (
                  <div className="overall-markdown-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseMarkdown(safeExplanation)) }} />
                ) : (
                  <div className="empty-analysis-state">
                    <p>Run code analysis to see the complete overall complexity report.</p>
                  </div>
                )}
              </div>
            ) : activeComplexityTab === "memory" ? (
              <div className="memory-wrapper">
                <MemoryVisualizer analysisData={lines} currentStep={lines.length > 0 ? lines.length - 1 : 0} />
              </div>
            ) : activeComplexityTab === "callgraph" ? (
              <div className="callgraph-wrapper" style={{ height: '100%', overflow: 'hidden' }}>
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
                            style={{ borderLeftColor: isBottleneck ? "#EF4444" : isEfficient ? "#10B981" : expandedLines[i] ? timeColor : "transparent", }}
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
          </div>
        )}
      </div>
    </div>
  );
}