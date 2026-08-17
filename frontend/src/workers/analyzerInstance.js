// frontend/src/workers/analyzerInstance.js

let sharedAnalyzerWorker = new Worker(
    new URL('./analyzer.worker.js', import.meta.url),
    { type: 'module' }
);

export const runCodeWithTimeout = (code, timeoutMs = 4000, onOutput, onError) => {
    return new Promise((resolve) => {
        let isFinished = false;

        const timeoutId = setTimeout(() => {
            if (!isFinished) {
                isFinished = true;
                
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                sharedAnalyzerWorker.terminate(); 
                
                onError("Execution Prevented:\nRoot Cause: Infinite Loop detected.\nSuggestion: Check your loop conditions.");
                
                // Resurrect a fresh worker for the next run
                sharedAnalyzerWorker = new Worker(
                    new URL('./analyzer.worker.js', import.meta.url),
                    { type: 'module' }
                );
                
                sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });
                resolve();
            }
        }, timeoutMs);

        // FIX: Use addEventListener so we don't overwrite other active worker tasks
        const messageHandler = (e) => {
            const { type, data } = e.data;
            
            if (type === 'OUTPUT') {
                onOutput(data);
            } else if (type === 'ERROR') {
                onError(data);
            } else if (type === 'RUN_RESULT') {
                isFinished = true;
                clearTimeout(timeoutId);
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                resolve();
            }
        };

        sharedAnalyzerWorker.addEventListener('message', messageHandler);
        sharedAnalyzerWorker.postMessage({ type: 'RUN_CODE', code });
    });
};

// NEW: Function to request AST parsing from the Web Worker
export const convertPythonToBlocks = (code, timeoutMs = 20000) => {
    return new Promise((resolve, reject) => {
        let isFinished = false;

        // Safety net: even with the worker-side fix (see analyzer.worker.js),
        // a Pyodide-level crash or a worker that never responds at all
        // (e.g. it died mid-init) would otherwise hang this promise forever
        // with the "Sync to Blocks" button showing no feedback at all. If
        // nothing comes back within timeoutMs, reject instead so the caller
        // can show an error and the button unlocks again.
        const timeoutId = setTimeout(() => {
            if (!isFinished) {
                isFinished = true;
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                reject(new Error("Converting to blocks timed out. The Python engine may be busy or stuck -- try again, or reload the page if this keeps happening."));
            }
        }, timeoutMs);

        const messageHandler = (e) => {
            const { type, data } = e.data;
            if (type === 'PYTHON_TO_BLOCKS_RESULT') {
                if (isFinished) return;
                isFinished = true;
                clearTimeout(timeoutId);
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                resolve(data);
            } else if (type === 'ENGINE_ERROR') {
                // The shared worker's Python engine failed to (re)initialize --
                // this would otherwise also hang forever since it's not the
                // message type being waited for above.
                if (isFinished) return;
                isFinished = true;
                clearTimeout(timeoutId);
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                reject(new Error(e.data.message || "The Python engine failed to load."));
            }
        };
        
        sharedAnalyzerWorker.addEventListener('message', messageHandler);
        sharedAnalyzerWorker.postMessage({ type: 'PYTHON_TO_BLOCKS', code });
    });
};

export { sharedAnalyzerWorker };

