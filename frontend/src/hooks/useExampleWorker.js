// frontend/src/hooks/useExampleWorker.js
import { useCallback, useEffect, useRef, useState } from "react";

// Wraps the current run's callbacks so worker messages always route to
// whichever example most recently called runCode, even if the modal is
// juggling several expanded rows across a session.
export function useExampleWorker() {
  const workerRef = useRef(null);
  const readyRef = useRef(false);
  const listenerRef = useRef(null);
  const [isBooting, setIsBooting] = useState(false);

  const ensureWorker = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (workerRef.current && readyRef.current) {
        resolve(workerRef.current);
        return;
      }
      if (!workerRef.current) {
        setIsBooting(true);
        // Same worker file/Pyodide setup the main app uses (the "same
        // appropriate execution mechanism") but a completely separate
        // Worker instance/thread, so this never shares Pyodide globals or
        // message traffic with the student's actual project run.
        const worker = new Worker(
          new URL("../workers/analyzer.worker.js", import.meta.url),
          { type: "module" }
        );
        workerRef.current = worker;
        const onReadyMessage = (event) => {
          if (event.data?.type === "ENGINE_READY") {
            readyRef.current = true;
            setIsBooting(false);
            worker.removeEventListener("message", onReadyMessage);
            resolve(worker);
          } else if (event.data?.type === "ENGINE_ERROR") {
            setIsBooting(false);
            worker.removeEventListener("message", onReadyMessage);
            reject(new Error(event.data.message || "Failed to start the example engine."));
          }
        };
        worker.addEventListener("message", onReadyMessage);
        worker.postMessage({ type: "INIT_ENGINE" });
      } else {
        // Already booting from a previous call; wait for readiness.
        const onReadyMessage = (event) => {
          if (event.data?.type === "ENGINE_READY") {
            readyRef.current = true;
            setIsBooting(false);
            workerRef.current.removeEventListener("message", onReadyMessage);
            resolve(workerRef.current);
          }
        };
        workerRef.current.addEventListener("message", onReadyMessage);
      }
    });
  }, []);

  // Runs one example's code in isolation. Wraps the generated Python in a
  // throwaway function so each example's variables don't leak into the
  // worker's persistent global namespace between runs (keeps repeated runs
  // of different examples in the same session from colliding on names like
  // "result" or "i").
  const runCode = useCallback(async (code, { onOutput, onError, onDone, onInputRequest }) => {
    const worker = await ensureWorker();
    if (listenerRef.current) worker.removeEventListener("message", listenerRef.current);

    // Wrapping in a throwaway function keeps this example's variables out of
    // the worker's persistent global namespace between runs. Skipped for
    // snippets using input(): the worker's input-handling transform only
    // supports awaiting input() at module top level, not inside a nested
    // sync function, so wrapping would break those specific examples.
    const needsTopLevel = /\binput\s*\(/.test(code);
    const wrapped = needsTopLevel
      ? code
      : `def __algoblocks_example__():\n${code.split("\n").map((l) => (l ? "    " + l : l)).join("\n")}\n__algoblocks_example__()\n`;

    const handleMessage = (event) => {
      const { type, data } = event.data;
      if (type === "OUTPUT") onOutput?.(data);
      else if (type === "ERROR") onError?.(data);
      else if (type === "RUN_RESULT") onDone?.();
      else if (type === "INPUT_REQUEST") onInputRequest?.(data);
    };
    listenerRef.current = handleMessage;
    worker.addEventListener("message", handleMessage);
    worker.postMessage({ type: "RUN_CODE", code: wrapped });
  }, [ensureWorker]);

  const sendInput = useCallback((value) => {
    if (workerRef.current) workerRef.current.postMessage({ type: "INPUT_RESPONSE", data: value });
  }, []);

  // Static complexity analysis (the same ANALYZE_CODE/ANALYZE_RESULT
  // round-trip MainApp and ActivityApp use for their Complexity tab) on
  // this same isolated worker/thread. Kept on its own listener ref so it
  // can't collide with a concurrent runCode() listener on the same worker
  // instance -- a lesson playground may run the example AND analyze its
  // complexity independently.
  const analyzeListenerRef = useRef(null);
  const analyzeCode = useCallback(async (code) => {
    const worker = await ensureWorker();
    if (analyzeListenerRef.current) worker.removeEventListener("message", analyzeListenerRef.current);

    return new Promise((resolve) => {
      const handleMessage = (event) => {
        if (event.data?.type === "ANALYZE_RESULT") {
          worker.removeEventListener("message", handleMessage);
          analyzeListenerRef.current = null;
          resolve(event.data.data);
        }
      };
      analyzeListenerRef.current = handleMessage;
      worker.addEventListener("message", handleMessage);
      worker.postMessage({ type: "ANALYZE_CODE", code });
    });
  }, [ensureWorker]);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = null;
    };
  }, []);

  return { runCode, sendInput, analyzeCode, isBooting };
}
