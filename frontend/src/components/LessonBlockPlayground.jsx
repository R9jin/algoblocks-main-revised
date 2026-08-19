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
import { useCallback, useRef, useState } from "react";
import { FiRotateCcw } from "react-icons/fi";
import BlockPlaygroundWorkspace from "./BlockPlaygroundWorkspace.jsx";
import "../styles/LessonBlockPlayground.css";

export default function LessonBlockPlayground({ example, runner, caption }) {
  const [pythonCode, setPythonCode] = useState(example.pythonPreview || "");
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const playgroundRef = useRef(null);
  const outputBufferRef = useRef("");

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

      {(output || isRunning) && (
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
      )}
    </div>
  );
}
