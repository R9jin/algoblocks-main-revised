let pyodide = null;

// async input control
let inputResolve = null;
let isWaitingForInput = false;
let executionTimeout = null;

async function initPyodide() {
  if (pyodide) return;

  try {
    const pyodideUrl = self.location.origin + "/pyodide/pyodide.mjs";
    const module = await import(/* @vite-ignore */ pyodideUrl);
    const loadPyodide = module.loadPyodide;

    const tempPyodide = await loadPyodide();

    const cacheBuster = "?t=" + Date.now();
    
    // ✅ FIX 1: Added profiler.py to the fetch list
    const [analyzerCode, astCode, nlgCode, profilerCode] = await Promise.all([
      fetch("/python_engine/analyzer.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/blockly_ast.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/semantic_nlg.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/profiler.py" + cacheBuster).then(res => res.text())
    ]);

    if (nlgCode.includes("<!DOCTYPE html>")) {
      throw new Error("Service Worker served index.html instead of python files!");
    }

    tempPyodide.FS.writeFile("analyzer.py", analyzerCode);
    tempPyodide.FS.writeFile("blockly_ast.py", astCode);
    tempPyodide.FS.writeFile("semantic_nlg.py", nlgCode);
    tempPyodide.FS.writeFile("profiler.py", profilerCode); // ✅ FIX 1: Write to FS

    await tempPyodide.runPythonAsync(`
import sys
import json
import ast
import importlib

import semantic_nlg
import analyzer
import profiler  # ✅ FIX 2: Import profiler

importlib.reload(semantic_nlg)
importlib.reload(analyzer)
importlib.reload(profiler)

def do_analyze(code):
    try:
        # --- 1. Static Analysis ---
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

        # --- 2. Dynamic Execution Profiling ---
        # Run the code to get exact line hit counts
        dyn_profiler = profiler.LineExecutionProfiler()
        hit_counts = dyn_profiler.run_code(code)

        def to_asymp(comp):
            if not comp: return "-"
            if "n * T(n-1)" in comp: return "O(n!)"
            if "2T(n/2)" in comp: return "O(n log n)"
            if "T(n-1) + T(n-2)" in comp: return "O(2^n)"
            if "T(n/2)" in comp: return "O(log n)"
            if "T(n-1) + O(n)" in comp: return "O(n^2)"
            if "T(n-1)" in comp: return "O(n)"
            return comp

        # --- 3. Merge Data ---
        lines = []
        for line in anal.details:
            lineno = line.get("lineno", -1)
            # Default to 0 if the line wasn't executed dynamically
            hits = hit_counts.get(lineno, 0) if lineno != -1 else 0

            lines.append({
                "lineno": lineno,
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
                "space_explanation": line.get("space_explanation", ""),
                "hits": hits # ✅ FIX 3: Inject hits into the JSON directly
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

    pyodide = tempPyodide;

  } catch (error) {
    console.error("Pyodide Engine Crash:", error);
    pyodide = null;
    throw error;
  }
}

self.onmessage = async (e) => {
  const { type, code, data } = e.data;

  if (type === 'INPUT_RESPONSE') {
    if (inputResolve) {
      clearTimeout(executionTimeout); 
      isWaitingForInput = false;      
      inputResolve(data);
      inputResolve = null;
    }
    return;
  }

  if (type === 'INIT_ENGINE') {
    try {
      await initPyodide();
      self.postMessage({ type: 'ENGINE_READY' });
    } catch (err) {
      console.error(err);
    }
    return;
  }

  try {
    await initPyodide();

    // ======================
    // ANALYZE MODE
    // ======================
    if (type === 'ANALYZE_CODE') {
      // It now seamlessly does BOTH static and dynamic analysis internally!
      pyodide.globals.set("user_code", code);
      const resultJsonStr = await pyodide.runPythonAsync(`do_analyze(user_code)`);
      const resultData = JSON.parse(resultJsonStr);

      self.postMessage({ type: 'ANALYZE_RESULT', data: resultData });
    }

    // ======================
    // RUN MODE
    // ======================
    else if (type === 'RUN_CODE') {

      pyodide.setStdout({
        batched: (msg) => self.postMessage({ type: 'OUTPUT', data: msg + "\n" })
      });

      pyodide.setStderr({
        batched: (msg) => self.postMessage({ type: 'ERROR', data: msg + "\n" })
      });

      pyodide.globals.set("custom_input_sync", (prompt) => {
        const safePrompt = prompt === undefined ? "" : String(prompt);
        if (safePrompt) self.postMessage({ type: 'OUTPUT', data: safePrompt });
        self.postMessage({ type: 'INPUT_REQUEST', data: { prompt: "" } });
        const simulated = " [Simulated Input - Nested function limitation]";
        self.postMessage({ type: 'OUTPUT', data: simulated + "\n" });
        return simulated;
      });

      pyodide.globals.set("custom_input_async", async (prompt) => {
        return new Promise((resolve) => {
          inputResolve = (value) => {
            isWaitingForInput = false; 
            resolve(value);
          };
          isWaitingForInput = true; 
          const safePrompt = prompt === undefined ? "" : String(prompt);
          self.postMessage({
            type: 'INPUT_REQUEST',
            data: { prompt: safePrompt }
          });
        });
      });

      pyodide.globals.set("user_code", code);

      executionTimeout = setTimeout(() => {
        if (!isWaitingForInput) {
          self.postMessage({
            type: 'ERROR',
            data: "Execution Prevented:\nRoot Cause: Infinite Loop detected.\nSuggestion: Check your loop conditions."
          });
        }
      }, 3000);

      await pyodide.runPythonAsync(`
import builtins
import sys
import traceback
import ast
from pyodide.code import eval_code_async

builtins.input = custom_input_sync

class AsyncInputTransformer(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == 'input':
            new_func = ast.Name(id='custom_input_async', ctx=ast.Load())
            new_call = ast.Call(func=new_func, args=node.args, keywords=node.keywords)
            return ast.copy_location(ast.Await(value=new_call), node)
        return node

try:
    tree = ast.parse(user_code)
    transformed = AsyncInputTransformer().visit(tree)
    ast.fix_missing_locations(transformed)

    code_str = ast.unparse(transformed)

    compile(code_str, "<string>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)

    await eval_code_async(code_str, globals())

except SyntaxError:
    try:
        exec(user_code)
    except Exception:
        print(traceback.format_exc(), file=sys.stderr)

except Exception:
    print(traceback.format_exc(), file=sys.stderr)
      `);

      clearTimeout(executionTimeout); 
      self.postMessage({ type: 'RUN_RESULT', data: "" });
    }

  } catch (err) {
    clearTimeout(executionTimeout);
    if (type === 'ANALYZE_CODE') {
      self.postMessage({
        type: 'ANALYZE_RESULT',
        data: { status: 'error', message: err.message }
      });
    } else {
      self.postMessage({ type: 'ERROR', data: err.message });
    }
  }
};