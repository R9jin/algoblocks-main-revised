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
export const convertPythonToBlocks = (code) => {
    return new Promise((resolve) => {
        const messageHandler = (e) => {
            const { type, data } = e.data;
            if (type === 'PYTHON_TO_BLOCKS_RESULT') {
                sharedAnalyzerWorker.removeEventListener('message', messageHandler);
                resolve(data);
            }
        };
        
        sharedAnalyzerWorker.addEventListener('message', messageHandler);
        sharedAnalyzerWorker.postMessage({ type: 'PYTHON_TO_BLOCKS', code });
    });
};

export { sharedAnalyzerWorker };

