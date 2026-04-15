// frontend/src/workers/analyzer.worker.js

// Import Pyodide (We use CDN for dev, but you will download these locally later for the strict "zero-bandwidth" requirement)
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodideReadyPromise = async () => {
  const pyodide = await loadPyodide();
  
  // 1. Fetch your Python files from the Vite public directory
  const [analyzerSrc, blocklyAstSrc, modelsSrc] = await Promise.all([
    fetch('/python_engine/analyzer.py').then(r => r.text()),
    fetch('/python_engine/blockly_ast.py').then(r => r.text()),
    fetch('/python_engine/models.py').then(r => r.text())
  ]);

  // 2. Write them to Pyodide's virtual file system so Python can import them
  pyodide.FS.writeFile('/analyzer.py', analyzerSrc);
  pyodide.FS.writeFile('/blockly_ast.py', blocklyAstSrc);
  pyodide.FS.writeFile('/models.py', modelsSrc);

  return pyodide;
};

let pyodideInstance = pyodideReadyPromise();

self.onmessage = async (event) => {
  const { code } = event.data;
  
  try {
    const pyodide = await pyodideInstance;
    
    // 3. Mount the user's code into a variable in the Python environment
    pyodide.globals.set("user_code", code);
    
    // 4. Run the Python execution script
    let output = pyodide.runPython(`
import json
from analyzer import analyze_code

# Run the AST analyzer
try:
    result = analyze_code(user_code)
    # Return as JSON string to easily pass back to JavaScript
    json.dumps(result)
except Exception as e:
    json.dumps({"error": str(e), "status": "failed"})
    `);
    
    self.postMessage({ status: 'success', result: JSON.parse(output) });
    
  } catch (error) {
    // Catch syntax errors or Pyodide initialization errors
    self.postMessage({ status: 'error', error: error.message });
  }
};