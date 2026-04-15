import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs";

let pyodide = null;

async function initPyodide() {
  if (pyodide) return;
  pyodide = await loadPyodide();
  
  // 1. Fetch the Python logic from your public folder
  const [analyzerCode, astCode] = await Promise.all([
    fetch("/python_engine/analyzer.py").then(res => res.text()),
    fetch("/python_engine/blockly_ast.py").then(res => res.text())
  ]);

  // 2. Write to Pyodide's virtual filesystem
  pyodide.FS.writeFile("analyzer.py", analyzerCode);
  pyodide.FS.writeFile("blockly_ast.py", astCode);
  
  // 3. Import the analyzer
  await pyodide.runPythonAsync(`import analyzer`);
}

self.onmessage = async (e) => {
  const { code, type } = e.data;
  
  try {
    await initPyodide();
    
    // Convert JS string to Python string and run analysis
    pyodide.globals.set("user_code", code);
    const results = await pyodide.runPythonAsync(`
        # Call the specific analyze function from your engine
        analyzer.analyze_code(user_code)
    `);
    
    self.postMessage({ type: "ANALYSIS_SUCCESS", results: results.toJs() });
  } catch (err) {
    self.postMessage({ type: "ANALYSIS_ERROR", error: err.message });
  }
};