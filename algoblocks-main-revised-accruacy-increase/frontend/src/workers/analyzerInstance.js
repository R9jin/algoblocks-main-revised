// frontend/src/workers/analyzerInstance.js
//
// Python -> Blocks conversion helper. It uses the app-wide Pyodide engine
// (pyodideEngine.js) instead of creating a second worker + runtime. Each
// request carries its own id and only accepts the result with that id, so
// overlapping conversions (silent auto-sync + manual sync) can't swap results.
import { startEngine, getState } from "./pyodideEngine";

let nextRequestId = 1;

export const convertPythonToBlocks = (code, timeoutMs = 20000) => {
    return new Promise((resolve, reject) => {
        const worker = getState().worker || startEngine();
        if (!worker) {
            reject(new Error("The Python engine is not available."));
            return;
        }
        const requestId = `p2b-${nextRequestId++}`;
        let isFinished = false;

        const cleanup = () => {
            clearTimeout(timeoutId);
            worker.removeEventListener("message", messageHandler);
            worker.removeEventListener("error", errorHandler);
            worker.removeEventListener("messageerror", errorHandler);
        };
        const finish = (fn, value) => {
            if (isFinished) return;
            isFinished = true;
            cleanup();
            fn(value);
        };

        const timeoutId = setTimeout(() => {
            finish(reject, new Error("Converting to blocks timed out. The Python engine may be busy or stuck -- try again, or reload the page if this keeps happening."));
        }, timeoutMs);

        const messageHandler = (e) => {
            const msg = e.data || {};
            if (msg.type === "PYTHON_TO_BLOCKS_RESULT" && msg.requestId === requestId) {
                finish(resolve, msg.data);
            } else if (msg.type === "ENGINE_ERROR") {
                finish(reject, new Error(msg.message || "The Python engine failed to load."));
            }
        };
        const errorHandler = (e) => {
            finish(reject, new Error((e && e.message) || "The Python engine crashed while converting your code."));
        };

        worker.addEventListener("message", messageHandler);
        worker.addEventListener("error", errorHandler);
        worker.addEventListener("messageerror", errorHandler);
        worker.postMessage({ type: "PYTHON_TO_BLOCKS", code, requestId });
    });
};
