// frontend/src/workers/analyzer.worker.js

// Import Pyodide via CDN (or serve locally for strict offline mode later)
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodideReadyPromise = loadPyodide();

self.onmessage = async (event) => {
  const { code, type } = event.data;
  
  try {
    const pyodide = await pyodideReadyPromise;
    
    // In the future, we will mount your analyzer_engine/analyzer.py into the Pyodide virtual filesystem here.
    
    // For now, let's just evaluate the raw code
    let output = pyodide.runPython(code);
    
    self.postMessage({ status: 'success', result: output });
  } catch (error) {
    // This is where you will catch SyntaxErrors and map them to beginner-friendly suggestions
    self.postMessage({ status: 'error', error: error.message });
  }
};