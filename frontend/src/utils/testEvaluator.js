// frontend/src/utils/testEvaluator.js
import { translatePythonError } from "./errorTranslator.js";

export const executeLocalTest = (code, worker, timeoutMs = 10000) => {
  return new Promise((resolve, reject) => {
    let outputAccumulator = "";
    let isDone = false;

    // Safety fallback for infinite loops
    const timeoutId = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        reject(new Error("Timeout: Infinite Loop detected. Execution timed out after 10 seconds."));
      }
    }, timeoutMs);

    // Dedicated one-time listener for this specific test
    worker.onmessage = (event) => {
      if (isDone) return;
      const { type, data, counts } = event.data;

      if (type === 'OUTPUT') {
        outputAccumulator += data;
      } else if (type === 'RUN_RESULT') {
        isDone = true;
        clearTimeout(timeoutId);
        outputAccumulator += (data !== undefined && data !== null) ? data : "";
        resolve({ output: outputAccumulator, counts: counts || {} });
      } else if (type === 'ERROR') {
        isDone = true;
        clearTimeout(timeoutId);
        const hint = translatePythonError(data);
        reject(new Error(data + (hint ? `\n${hint}` : "")));
      } else if (type === 'INPUT_REQUEST') {
        isDone = true;
        clearTimeout(timeoutId);
        reject(new Error("Test cases cannot supply user input. Please remove input() calls."));
      }
    };

    worker.postMessage({ type: 'RUN_CODE', code });
  });
};