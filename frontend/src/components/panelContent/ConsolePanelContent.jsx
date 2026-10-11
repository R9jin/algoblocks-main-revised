// frontend/src/components/panelContent/ConsolePanelContent.jsx
//
// The console tab's body content, extracted out of the old
// DockedBottomPanel so it can be docked independently by
// DockableWorkspace. Reuses the original CSS classes (console-*) so
// nothing visually changes.

import { useEffect, useRef } from "react";
import { FiChevronRight, FiSquare } from "react-icons/fi";
import { focusWithoutScroll, scrollToEndWithin } from "../../utils/scrollWithin";
import LineExecutionsView from "./LineExecutionsView.jsx";

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
  // Overall Big-O of the program (null while the code has errors), shown next
  // to the hot spot in the Line Executions tab.
  totalComplexity = null,
  // (lineNumber) => void: jumps to that line in the Python editor.
  onJumpToLine = null,
}) {
  const consoleEndRef = useRef(null);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === "output") {
      scrollToEndWithin(consoleEndRef.current);
    }
  }, [consoleOutput, isWaitingForInput, consoleTab]);

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
          <LineExecutionsView
            pythonCode={pythonCode}
            lineExecutions={lineExecutions}
            totalComplexity={totalComplexity}
            onJumpToLine={onJumpToLine}
          />
        )}
      </div>
    </div>
  );
}
