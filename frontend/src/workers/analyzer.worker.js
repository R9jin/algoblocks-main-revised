// frontend/src/workers/analyzer.worker.js
let pyodide = null;

async function initPyodide() {
  if (pyodide) return;

  // By prepending the full website origin (e.g., http://localhost:5173), 
  // Vite treats this as an external web request and completely ignores it,
  // allowing the browser to naturally fetch the file from the public folder!
  const pyodideUrl = self.location.origin + "/pyodide/pyodide.mjs";
  const module = await import(/* @vite-ignore */ pyodideUrl);
  const loadPyodide = module.loadPyodide;

  pyodide = await loadPyodide();

  // 1. Fetch Python files from the public folder
  const [analyzerCode, astCode] = await Promise.all([
    fetch("/python_engine/analyzer.py").then(res => res.text()),
    fetch("/python_engine/blockly_ast.py").then(res => res.text())
  ]);

  // 2. Write to Pyodide's virtual filesystem
  pyodide.FS.writeFile("analyzer.py", analyzerCode);
  pyodide.FS.writeFile("blockly_ast.py", astCode);

  // 3. Inject a Python wrapper that mimics your old FastAPI index.py formatting
  await pyodide.runPythonAsync(`
import sys
import json
import ast
import analyzer

def do_analyze(code):
    try:
        tree = ast.parse(code)
        anal = analyzer.ComplexityAnalyzer(code)
        anal.bfs_first_pass(tree)
        for _, node in anal.symbol_table.items():
            anal.visit(node)
        
        anal.details = []
        anal.max_complexity = anal.max_space_weight = 0
        anal.max_poly = anal.max_log = anal.max_sqrt = 0
        anal.current_depth = anal.loop_depth = 0
        anal.log_loop_depth = anal.sqrt_loop_depth = 0
        
        anal.visit(tree)
        
        # Helper to map raw outputs to asymptotic Big O notation
        def to_asymp(comp):
            if not comp: return "-"
            if "n * T(n-1)" in comp: return "O(n!)"
            if "2T(n/2)" in comp: return "O(n log n)"
            if "T(n-1) + T(n-2)" in comp: return "O(2^n)"
            if "T(n/2)" in comp: return "O(log n)"
            if "T(n-1) + O(n)" in comp: return "O(n^2)"
            if "T(n-1)" in comp: return "O(n)"
            return comp

        lines = []
        for line in anal.details:
            lines.append({
                "lineOfCode": line["lineOfCode"],
                "operation": line.get("operation", "-"),
                "local_time": to_asymp(line.get("local_time")),
                "global_time": to_asymp(line.get("global_time")),
                "local_space": to_asymp(line.get("local_space")),
                "global_space": to_asymp(line.get("global_space")),
                "indent": line.get("indent", 0),
                "color": line.get("color"),
                "weight": line.get("weight", 0),
                "local_explanation": line.get("local_explanation", ""),
                "global_explanation": line.get("global_explanation", "")
            })

        return json.dumps({
            "status": "success",
            "total": anal.get_final_asymptotic_badge(),
            "space_total": anal.get_final_space_badge(),
            "lines": lines,
            "is_recursive": any("T(n)" in str(l.get("global_time", "")) for l in anal.details)
        })
    except SyntaxError as e:
        return json.dumps({
            "status": "error",
            "line": e.lineno,
            "message": e.msg
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        })
  `);
}

self.onmessage = async (e) => {
  const { type, code } = e.data;

  // NEW: Catch the boot-up message from App.jsx
  if (type === 'INIT_ENGINE') {
    try {
      await initPyodide();
      self.postMessage({ type: 'ENGINE_READY' });
    } catch (err) {
      console.error("Failed to pre-warm Pyodide:", err);
    }
    return;
  }

  try {
    await initPyodide();

    // --- MODE 1: ANALYZE COMPLEXITY ---
    if (type === 'ANALYZE_CODE') {
      pyodide.globals.set("user_code", code);
      const resultJsonStr = await pyodide.runPythonAsync(`do_analyze(user_code)`);
      const resultData = JSON.parse(resultJsonStr);

      // Reply in the exact format MainApp.jsx expects
      self.postMessage({ type: 'ANALYZE_RESULT', data: resultData });
    }

    // --- MODE 2: RUN THE CODE (CONSOLE OUTPUT) ---
    else if (type === 'RUN_CODE') {
      // Intercept standard output (print statements) and send to MainApp console
      pyodide.setStdout({ batched: (msg) => self.postMessage({ type: 'OUTPUT', data: msg + "\\n" }) });
      pyodide.setStderr({ batched: (msg) => self.postMessage({ type: 'ERROR', data: msg + "\\n" }) });

      // Provide a mock input() function just like your old fallback API did
      pyodide.globals.set("custom_input", (prompt) => {
        self.postMessage({ type: 'OUTPUT', data: prompt });
        return "Simulated User Input";
      });

      pyodide.globals.set("user_code", code);
      await pyodide.runPythonAsync(`
import builtins
import sys
builtins.input = custom_input
try:
    exec(user_code)
except Exception as e:
    import traceback
    print(traceback.format_exc(), file=sys.stderr)
      `);

      self.postMessage({ type: 'RUN_RESULT', data: "" });
    }

  } catch (err) {
    if (type === 'ANALYZE_CODE') {
      self.postMessage({ type: 'ANALYZE_RESULT', data: { status: 'error', message: err.message } });
    } else {
      self.postMessage({ type: 'ERROR', data: err.message });
    }
  }
};