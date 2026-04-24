// frontend/src/workers/analyzerInstance.js

let sharedAnalyzerWorker = new Worker(
    new URL('./analyzer.worker.js', import.meta.url),
    { type: 'module' }
);

export const runCodeWithTimeout = (code, timeoutMs = 4000, onOutput, onError) => {
    return new Promise((resolve) => {
        let isFinished = false;

        // 1. Set the timeout on the MAIN THREAD
        const timeoutId = setTimeout(() => {
            if (!isFinished) {
                isFinished = true;
                // 2. Kill the frozen worker
                sharedAnalyzerWorker.terminate(); 
                
                // 3. Send the error to the UI
                onError("Execution Prevented:\nRoot Cause: Infinite Loop detected.\nSuggestion: Check your loop conditions.");
                
                // 4. Resurrect a fresh worker for the next run
                sharedAnalyzerWorker = new Worker(
                    new URL('./analyzer.worker.js', import.meta.url),
                    { type: 'module' }
                );
                
                // Initialize the new worker quietly
                sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });
                resolve();
            }
        }, timeoutMs);

        // 5. Listen for messages from the worker
        sharedAnalyzerWorker.onmessage = (e) => {
            const { type, data } = e.data;
            
            if (type === 'OUTPUT') {
                onOutput(data);
            } else if (type === 'ERROR') {
                onError(data);
            } else if (type === 'RUN_RESULT') {
                isFinished = true;
                clearTimeout(timeoutId);
                resolve();
            }
        };

        // 6. Start the execution
        sharedAnalyzerWorker.postMessage({ type: 'RUN_CODE', code });
    });
};

export { sharedAnalyzerWorker };
