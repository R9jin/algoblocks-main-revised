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

    const [analyzerCode, astCode, nlgCode] = await Promise.all([
      fetch("/python_engine/analyzer.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/blockly_ast.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/semantic_nlg.py" + cacheBuster).then(res => res.text())
    ]);

    if (nlgCode.includes("<!DOCTYPE html>")) {
      throw new Error("Service Worker served index.html instead of python files!");
    }

    tempPyodide.FS.writeFile("analyzer.py", analyzerCode);
    tempPyodide.FS.writeFile("blockly_ast.py", astCode);
    tempPyodide.FS.writeFile("semantic_nlg.py", nlgCode);

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
      pyodide.globals.set("user_code", code);

      // ✅ FIX: Properly import ComplexityAnalyzer, parse the AST, and return the JSON
      const resultJsonStr = await pyodide.runPythonAsync(`
import json
import ast
import traceback
import sys

# Ensure fresh imports if the worker reloaded the files from the network
if 'analyzer' in sys.modules:
    del sys.modules['analyzer']
if 'semantic_nlg' in sys.modules:
    del sys.modules['semantic_nlg']

try:
    from analyzer import ComplexityAnalyzer

    def do_analyze(code_to_check):
        try:
            tree = ast.parse(code_to_check)
            analyzer_inst = ComplexityAnalyzer(code_to_check)
            analyzer_inst.bfs_first_pass(tree)
            analyzer_inst.visit(tree)
            
            return json.dumps({
                "status": "success",
                "total": analyzer_inst.get_final_asymptotic_badge(),
                "space_total": analyzer_inst.get_final_space_badge(),
                "lines": analyzer_inst.details
            })
        except SyntaxError as e:
            return json.dumps({
                "status": "error",
                "message": f"SyntaxError: {str(e)}",
                "line": getattr(e, 'lineno', -1)
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "message": str(e),
                "line": -1
            })

    output = do_analyze(user_code)
except Exception as init_err:
    output = json.dumps({
        "status": "error",
        "message": f"Analyzer Initialization Error: {str(init_err)}",
        "line": -1
    })

output
      `);
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
import json
from collections import defaultdict
from pyodide.code import eval_code_async

builtins.input = custom_input_sync

class LineExecutionProfiler:
    def __init__(self):
        self.hits = defaultdict(int)

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            if frame.f_code.co_filename == "<user_code>":
                self.hits[frame.f_lineno] += 1
        return self.trace_lines

class AsyncInputTransformer(ast.NodeTransformer):
    def __init__(self):
        self.has_input = False

    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == 'input':
            self.has_input = True
            new_func = ast.Name(id='custom_input_async', ctx=ast.Load())
            new_call = ast.Call(func=new_func, args=node.args, keywords=node.keywords)
            return ast.copy_location(ast.Await(value=new_call), node)
        return node

globals()['run_hits_json'] = "{}"
dyn_profiler = LineExecutionProfiler()

try:
    tree = ast.parse(user_code)
    transformer = AsyncInputTransformer()
    transformed = transformer.visit(tree)
    ast.fix_missing_locations(transformed)

    try:
        if transformer.has_input:
            compiled_code = compile(transformed, "<user_code>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
            sys.settrace(dyn_profiler.trace_lines)
            
            # ✅ FIX: evaluate the compiled code object manually to extract the coroutine
            coro = eval(compiled_code, globals())
            if coro is not None:
                await coro
                
        else:
            compiled_code = compile(transformed, "<user_code>", "exec")
            sys.settrace(dyn_profiler.trace_lines)
            exec(compiled_code, globals())
    finally:
        sys.settrace(None)
        globals()['run_hits_json'] = json.dumps(dict(dyn_profiler.hits))

except SyntaxError:
    try:
        compiled_code = compile(user_code, "<user_code>", "exec")
        sys.settrace(dyn_profiler.trace_lines)
        try:
            exec(compiled_code, globals())
        finally:
            sys.settrace(None)
            globals()['run_hits_json'] = json.dumps(dict(dyn_profiler.hits))
    except Exception:
        print(traceback.format_exc(), file=sys.stderr)

except Exception:
    print(traceback.format_exc(), file=sys.stderr)
      `);

      const countsStr = pyodide.globals.get("run_hits_json");
      const counts = countsStr ? JSON.parse(countsStr) : {};

      clearTimeout(executionTimeout);
      self.postMessage({ type: 'RUN_RESULT', data: "", counts });
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