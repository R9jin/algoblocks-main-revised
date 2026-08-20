// frontend/src/components/LessonBlockPlayground.jsx
//
// The lesson-embedded, editable counterpart to BlockExampleRunner.jsx (the
// read-only version used in the Block Explorer glossary). Same overall
// idea -- a small scenario, a live workspace, an "Equivalent Python" panel,
// a Run button -- but here the blocks are fully interactive: add new ones
// from the toolbox, edit fields, delete pieces, and reset back to the
// original example whenever you want. The Python panel regenerates live
// from whatever is actually on the canvas, so it always matches what the
// learner built, not just the original.
import { pythonGenerator } from "blockly/python";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiActivity, FiRotateCcw, FiTerminal } from "react-icons/fi";
import ComplexityPanelContent from "./panelContent/ComplexityPanelContent.jsx";
import BlockPlaygroundWorkspace from "./BlockPlaygroundWorkspace.jsx";
import "../styles/LessonBlockPlayground.css";
// Complexity tab styling (.complexity-content, .footer-tab, the CSS custom
// properties like --panel-bg/--dark-bg, etc.) lives in WorkspaceShared.css,
// which normally only ships in MainApp's/ActivityApp's own lazy-loaded
// route chunk. Lesson pages are a separate chunk, so it's imported here
// directly to guarantee the Complexity tab is styled correctly even for
// someone who lands on a lesson without ever having opened the workspace.
import "../styles/WorkspaceShared.css";

export default function LessonBlockPlayground({ example, runner, caption }) {
  const [pythonCode, setPythonCode] = useState(example.pythonPreview || "");
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const playgroundRef = useRef(null);
  const outputBufferRef = useRef("");

  // Console / Complexity footer tabs -- same idea as the docked footer bar
  // in the real MainApp/ActivityApp workspace. Complexity analysis is only
  // ever kicked off once the learner actually opens that tab, so opening a
  // "Try it yourself" block to just run it doesn't pay for an analyzer pass
  // nobody asked to see.
  const [activeFooterTab, setActiveFooterTab] = useState("console");
  const [activeComplexityTab, setActiveComplexityTab] = useState("overall");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisTime, setAnalysisTime] = useState("0.00");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analyzeTimeoutRef = useRef(null);
  const analyzeRequestIdRef = useRef(0);

  useEffect(() => {
    if (activeFooterTab !== "complexity") return undefined;
    if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);

    if (!pythonCode || codeUnavailable) {
      setAnalysisResult(null);
      setIsAnalyzing(false);
      return undefined;
    }

    setIsAnalyzing(true);
    const requestId = ++analyzeRequestIdRef.current;
    analyzeTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await runner.analyzeCode(pythonCode);
        if (requestId !== analyzeRequestIdRef.current) return; // stale response, code changed again meanwhile
        if (data && data.status === "success") {
          setAnalysisResult({
            total: data.total,
            space_total: data.space_total || "O(1)",
            overall_explanation: data.overall_explanation || "",
            lines: data.lines || [],
            call_graph: data.call_graph || {},
            is_recursive: data.is_recursive || false,
            scope_warnings: data.scope_warnings || [],
          });
          setAnalysisTime(data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00");
        } else {
          setAnalysisResult(null);
        }
      } catch (e) {
        setAnalysisResult(null);
      } finally {
        if (requestId === analyzeRequestIdRef.current) setIsAnalyzing(false);
      }
    }, 600);

    return () => clearTimeout(analyzeTimeoutRef.current);
  }, [activeFooterTab, pythonCode, codeUnavailable, runner]);

  const handleWorkspaceChange = useCallback((ws) => {
    try {
      const code = pythonGenerator.workspaceToCode(ws).trim();
      setPythonCode(code);
      setCodeUnavailable(!code);
    } catch (e) {
      // A block was deleted/left with an empty required socket, or two
      // pieces don't fit together the way Python expects. Keep the last
      // good code on screen isn't right either (it'd be describing blocks
      // that no longer exist), so show a friendly placeholder instead.
      setCodeUnavailable(true);
    }
  }, []);

  const handleReset = () => {
    playgroundRef.current?.reset();
    setOutput("");
    setInputPrompt(null);
    setInputValue("");
  };

  const handleRun = async () => {
    if (!pythonCode || codeUnavailable) return;
    setOutput("");
    outputBufferRef.current = "";
    setInputPrompt(null);
    setIsRunning(true);
    try {
      await runner.runCode(pythonCode, {
        onOutput: (data) => {
          outputBufferRef.current += data;
          setOutput(outputBufferRef.current);
        },
        onError: (data) => {
          outputBufferRef.current += "\n" + data;
          setOutput(outputBufferRef.current);
          setIsRunning(false);
        },
        onDone: () => setIsRunning(false),
        onInputRequest: (data) => setInputPrompt(data?.prompt ?? ""),
      });
    } catch (e) {
      setOutput(`Couldn't start the example engine: ${e.message}`);
      setIsRunning(false);
    }
  };

  const submitInput = () => {
    if (inputPrompt !== null) outputBufferRef.current += inputValue + "\n";
    setOutput(outputBufferRef.current);
    runner.sendInput(inputValue);
    setInputPrompt(null);
    setInputValue("");
  };

  return (
    <div className="lesson-block-playground">
      <div className="lesson-block-playground-header">
        <button
          type="button"
          className="lesson-block-playground-reset"
          onClick={handleReset}
          title="Reset the blocks back to the original example"
        >
          <FiRotateCcw size={13} /> Reset
        </button>
      </div>

      {(caption || example.goal) && (
        <p className="lesson-block-playground-goal">
          <strong>Goal:</strong> {caption || example.goal}
        </p>
      )}
      {example.role && <p className="lesson-block-playground-goal">{example.role}</p>}

      <div className="lesson-block-playground-hint">
        Drag blocks in from the toolbox on the left, change the numbers or text, or delete pieces you don't need. Reset any time to get the original example back.
      </div>

      <BlockPlaygroundWorkspace
        ref={playgroundRef}
        workspaceState={example.workspaceState}
        onWorkspaceChange={handleWorkspaceChange}
      />

      <div className="lesson-block-playground-code-row">
        <div className="lesson-block-playground-section-label">Equivalent Python</div>
        <pre className="lesson-block-playground-python-code">
          {codeUnavailable
            ? "# Connect all the blocks together to see valid Python here."
            : pythonCode}
        </pre>
      </div>

      <div className="lesson-block-playground-run-row">
        <button
          type="button"
          className="lesson-block-playground-run-btn"
          onClick={handleRun}
          disabled={isRunning || codeUnavailable || !pythonCode}
        >
          {isRunning ? (runner.isBooting ? "Starting engine…" : "Running…") : "▶ Run this example"}
        </button>
      </div>

      <div className="lesson-block-playground-footer-tabs">
        <button
          type="button"
          className={`footer-tab ${activeFooterTab === "console" ? "active" : ""}`}
          onClick={() => setActiveFooterTab("console")}
        >
          <FiTerminal size={13} /> Console
        </button>
        <button
          type="button"
          className={`footer-tab ${activeFooterTab === "complexity" ? "active" : ""}`}
          onClick={() => setActiveFooterTab("complexity")}
        >
          <FiActivity size={13} /> Complexity
        </button>
      </div>

      {activeFooterTab === "console" ? (
        (output || isRunning) && (
          <div className="lesson-block-playground-console">
            <div className="lesson-block-playground-section-label">Output</div>
            <pre className="lesson-block-playground-console-output">{output || (isRunning ? "..." : "")}</pre>
            {inputPrompt !== null && (
              <div className="lesson-block-playground-input-row">
                <span>{inputPrompt}</span>
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitInput();
                  }}
                />
                <button type="button" onClick={submitInput}>Submit</button>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="lesson-block-playground-complexity-panel">
          {codeUnavailable || !pythonCode ? (
            <div className="lesson-block-playground-complexity-empty">
              <FiActivity size={22} />
              <p>Connect all the blocks together to see the time and space complexity analysis here.</p>
            </div>
          ) : !analysisResult && isAnalyzing ? (
            <div className="lesson-block-playground-complexity-empty">
              <FiActivity size={22} />
              <p>Analyzing this code's time and space complexity…</p>
            </div>
          ) : (
            <ComplexityPanelContent
              activeComplexityTab={activeComplexityTab}
              onComplexityTabChange={setActiveComplexityTab}
              analysisResult={analysisResult}
              analysisTime={analysisTime}
              defaultWeight={7}
              analysisTimeLabel="Analyzed In:"
            />
          )}
        </div>
      )}
    </div>
  );
}
