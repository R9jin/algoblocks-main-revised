// frontend/src/components/BlockExampleRunner.jsx
import { pythonGenerator } from "blockly/python";
import { useRef, useState } from "react";
import BlockExampleWorkspace from "./BlockExampleWorkspace.jsx";

export default function BlockExampleRunner({ example, runner }) {
  const [pythonCode, setPythonCode] = useState(example.pythonPreview);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const workspaceInstanceRef = useRef(null);
  const outputBufferRef = useRef("");

  const handleWorkspaceReady = (ws) => {
    workspaceInstanceRef.current = ws;
    try {
      const code = pythonGenerator.workspaceToCode(ws).trim();
      if (code) setPythonCode(code);
    } catch (e) {
      // Fall back to the pre-verified cached snippet if live generation
      // ever fails for some reason -- the example still shows correct code.
    }
  };

  const handleRun = async () => {
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
    <div className="block-example-runner">
      <div className="block-example-section-label">Example scenario</div>
      <p className="block-example-goal"><strong>Goal:</strong> {example.goal}</p>
      <p className="block-example-goal"><strong>This block's role:</strong> {example.role}</p>
      <p className="block-example-goal"><strong>How it connects:</strong> {example.interaction}</p>

      <div className="block-example-hint">Drag the blocks below to explore how they fit together — they're locked so the example can't be broken.</div>
      <BlockExampleWorkspace workspaceState={example.workspaceState} onWorkspaceReady={handleWorkspaceReady} />

      <div className="block-example-code-row">
        <div className="block-example-section-label">Equivalent Python</div>
        <pre className="block-example-python-code">{pythonCode}</pre>
      </div>

      <div className="block-example-run-row">
        <button className="block-example-run-btn" onClick={handleRun} disabled={isRunning}>
          {isRunning ? (runner.isBooting ? "Starting engine…" : "Running…") : "▶ Run this example"}
        </button>
      </div>

      {(output || isRunning) && (
        <div className="block-example-console">
          <div className="block-example-section-label">Output</div>
          <pre className="block-example-console-output">{output || (isRunning ? "..." : "")}</pre>
          {inputPrompt !== null && (
            <div className="block-example-input-row">
              <span>{inputPrompt}</span>
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitInput(); }}
              />
              <button onClick={submitInput}>Submit</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
