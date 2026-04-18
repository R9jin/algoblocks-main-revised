// frontend/src/workers/analyzerInstance.js

// Initialize the worker once globally
export const sharedAnalyzerWorker = new Worker(
    new URL('./analyzer.worker.js', import.meta.url),
    { type: 'module' }
);