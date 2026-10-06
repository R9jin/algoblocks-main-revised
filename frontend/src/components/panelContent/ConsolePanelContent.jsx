// frontend/src/components/panelContent/ConsolePanelContent.jsx
//
// The console tab's body content, extracted out of the old
// DockedBottomPanel so it can be docked independently by
// DockableWorkspace. Reuses the original CSS classes (console-*) so
// nothing visually changes.

import { useEffect, useRef } from "react";
import { FiChevronRight, FiSquare } from "react-icons/fi";
import { focusWithoutScroll, scrollToEndWithin } from "../../utils/scrollWithin";

export default function ConsolePanelContent({
  consoleTab,
  onConsoleTabChange,
  consoleOutput,
  onClearConsole,
  isWaitingForInput,
  userInput,
  setUserInput,
  onSendInput,
  isEvaluating = false,
  onStopRun,
  pythonCode,
  lineExecutions,
}) {
  const consoleEndRef = useRef(null);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === "output") {
      scrollToEndWithin(consoleEndRef.current);
    }
  }, [consoleOutput, isWaitingForInput, consoleTab]);

  const pythonLines = (pythonCode || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(lineExecutions || {}));

  return (
    <div className="console-content-wrapper">
      <div className="complexity-tabs">
        <div className="tab-btn-group">
          <button onClick={() => onConsoleTabChange("output")} className={`tab-btn ${consoleTab === "output" ? "active" : ""}`}>Terminal Output</button>
          <button onClick={() => onConsoleTabChange("executions")} className={`tab-btn ${consoleTab === "executions" ? "active" : ""}`}>Line Executions</button>
        </div>
        {consoleTab === "output" && (
          <div className="console-toolbar-actions">
            {isEvaluating && onStopRun && (
              <button className="stop-console-btn" type="button" onClick={onStopRun} title="Stop the running program (Ctrl+C while typing input)">
                <FiSquare size={11} fill="currentColor" /> Stop
              </button>
            )}
            <button className="clear-console-btn" onClick={onClearConsole}>Clear</button>
          </div>
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
                  ref={focusWithoutScroll}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Terminal convention: Ctrl+C (no text selected) stops the program.
                    if (onStopRun && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !window.getSelection().toString()) {
                      e.preventDefault(); onStopRun(); return;
                    }
                    onSendInput(e);
                  }}
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
  );
}
