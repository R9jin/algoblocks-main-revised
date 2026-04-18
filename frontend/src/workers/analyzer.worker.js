let pyodide = null;

async function initPyodide() {
  if (pyodide) return;

  try {
    const pyodideUrl = self.location.origin + "/pyodide/pyodide.mjs";
    const module = await import(/* @vite-ignore */ pyodideUrl);
    const loadPyodide = module.loadPyodide;

    // Load into a temporary variable. Don't mark as "ready" until we succeed!
    const tempPyodide = await loadPyodide();

    // 1. Use a cache-buster (?t=...) to completely bypass the PWA offline cache!
    const cacheBuster = "?t=" + Date.now();
    const [analyzerCode, astCode, nlgCode] = await Promise.all([
      fetch("/python_engine/analyzer.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/blockly_ast.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/semantic_nlg.py" + cacheBuster).then(res => res.text())
    ]);

    // Safety check: Did Vite/PWA serve the default HTML fallback?
    if (nlgCode.includes("<!DOCTYPE html>")) {
      throw new Error("Service Worker served index.html instead of semantic_nlg.py! Please hard refresh the page.");
    }

    // 2. Write to Pyodide's virtual filesystem
    tempPyodide.FS.writeFile("analyzer.py", analyzerCode);
    tempPyodide.FS.writeFile("blockly_ast.py", astCode);
    tempPyodide.FS.writeFile("semantic_nlg.py", nlgCode);

    // 3. Inject a Python wrapper 
    await tempPyodide.runPythonAsync(`
import sys
import json
import ast
import importlib

# Ensure the newly written modules are actually re-evaluated
import semantic_nlg
import analyzer
importlib.reload(semantic_nlg)
importlib.reload(analyzer)

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
                "time_explanation": line.get("time_explanation", ""),
                "space_explanation": line.get("space_explanation", "")
            })

        return json.dumps({
            "status": "success",
            "total": anal.get_final_asymptotic_badge(),
            "space_total": anal.get_final_space_badge(),
            "lines": lines,
            "is_recursive": any("T(n)" in str(l.get("global_time", "")) for l in anal.details)
        })
    except SyntaxError as e:
        return json.dumps({"status": "error", "line": e.lineno, "message": e.msg})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})
    `);
    // Only assign to the global variable AFTER everything initialized perfectly!
    pyodide = tempPyodide;

  } catch (error) {
    console.error("Pyodide Engine Crash during boot:", error);
    pyodide = null; // Ensure it attempts to re-initialize on the next ping
    throw error;
  }
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
      pyodide.setStdout({ batched: (msg) => self.postMessage({ type: 'OUTPUT', data: msg + "\n" }) });
      pyodide.setStderr({ batched: (msg) => self.postMessage({ type: 'ERROR', data: msg + "\n" }) });

      // FIX: Ensure the prompt is printed, but don't just return a static string immediately if we want it to look interactive.
      // Since we can't easily block, we will use the simulated input, but fix the 'undefined' issue.
      pyodide.globals.set("custom_input", (prompt) => {
        self.postMessage({ type: 'INPUT_REQUEST', data: { prompt: prompt } });
        // It will still return immediately because we can't block here without Atomics.
        // We return a placeholder to prevent it crashing, but notify the user.
        return " [Simulated Input - Real input requires SharedArrayBuffer] ";
      });

      pyodide.globals.set("user_code", code);

      // FIX: Do not print the result of exec(), which causes the 'undefined'
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