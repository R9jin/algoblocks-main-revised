// frontend/src/workers/analyzer.worker.js
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

    // FETCH THE NEW DYNAMIC TRACER
    const [analyzerCode, astCode, nlgCode, tracerCode] = await Promise.all([
      fetch("/python_engine/analyzer.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/blockly_ast.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/semantic_nlg.py" + cacheBuster).then(res => res.text()),
      fetch("/python_engine/dynamic_tracer.py" + cacheBuster).then(res => res.text())
    ]);

    if (nlgCode.includes("<!DOCTYPE html>")) {
      throw new Error("Service Worker served index.html instead of python files!");
    }

    // WRITE ALL FILES TO VIRTUAL FILE SYSTEM
    tempPyodide.FS.writeFile("analyzer.py", analyzerCode);
    tempPyodide.FS.writeFile("blockly_ast.py", astCode);
    tempPyodide.FS.writeFile("semantic_nlg.py", nlgCode);
    tempPyodide.FS.writeFile("dynamic_tracer.py", tracerCode);

    pyodide = tempPyodide;

  } catch (error) {
    console.error("Pyodide Engine Crash:", error);
    pyodide = null;
    throw error;
  }
}

self.onmessage = async (e) => {
  // Extract testCases for the new RUN_TESTS mode
  const { type, code, data, testCases } = e.data;

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
    // 1. ANALYZE MODE
    // ======================
    if (type === 'ANALYZE_CODE') {
      pyodide.globals.set("user_code", code);

      const resultJsonStr = await pyodide.runPythonAsync(`
import json
import sys

# CLEAR CACHE FOR HOT RELOADING
if 'analyzer' in sys.modules:
    del sys.modules['analyzer']
if 'semantic_nlg' in sys.modules:
    del sys.modules['semantic_nlg']
if 'dynamic_tracer' in sys.modules:
    del sys.modules['dynamic_tracer']

try:
    from analyzer import analyze_source_code
    output_dict = analyze_source_code(user_code)
    output = json.dumps(output_dict)
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
    // 2. PYTHON TO BLOCKS MODE
    // ======================
    else if (type === 'PYTHON_TO_BLOCKS') {
      pyodide.globals.set("user_code", code);

      const resultJsonStr = await pyodide.runPythonAsync(`
import json
import sys

if 'blockly_ast' in sys.modules:
    del sys.modules['blockly_ast']

try:
    from blockly_ast import BlocklyASTConverter
    converter = BlocklyASTConverter()
    result = converter.convert(user_code)
    output = json.dumps(result)
except Exception as e:
    output = json.dumps({"status": "error", "message": str(e)})

output
      `);

      const resultData = JSON.parse(resultJsonStr);
      self.postMessage({ type: 'PYTHON_TO_BLOCKS_RESULT', data: resultData });
    }

    // ======================
    // 3. RUN MODE (Interactive / Standard Run)
    // ======================
    else if (type === 'RUN_CODE') {

      pyodide.setStdout({ batched: (msg) => self.postMessage({ type: 'OUTPUT', data: msg + "\n" }) });
      pyodide.setStderr({ batched: (msg) => self.postMessage({ type: 'ERROR', data: msg + "\n" }) });

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

class InfiniteLoopDetector(ast.NodeVisitor):
    def __init__(self):
        self.warnings = []

    def visit_While(self, node):
        if isinstance(node.test, ast.Constant) and node.test.value is True:
            has_break = any(isinstance(child, (ast.Break, ast.Return)) for child in ast.walk(node))
            if not has_break:
                self.warnings.append("Execution Prevented:\\nRoot Cause: 'while True' loop found with no 'break' or 'return'. This will run forever.")
        else:
            condition_vars = {n.id for n in ast.walk(node.test) if isinstance(n, ast.Name)}
            if condition_vars:
                modified_vars = set()
                for child in node.body:
                    for n in ast.walk(child):
                        if isinstance(n, ast.Assign):
                            for target in n.targets:
                                if isinstance(target, ast.Name): modified_vars.add(target.id)
                        elif isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name):
                             modified_vars.add(n.target.id)

                if not condition_vars.intersection(modified_vars):
                    has_break = any(isinstance(child, (ast.Break, ast.Return)) for child in ast.walk(node))
                    if not has_break:
                        self.warnings.append(f"Execution Prevented:\\nRoot Cause: Variables {list(condition_vars)} control the loop, but are never modified inside it. This will run forever.")
        self.generic_visit(node)

globals()['run_hits_json'] = "{}"
dyn_profiler = LineExecutionProfiler()

try:
    tree = ast.parse(user_code, filename="<user_code>")
    
    detector = InfiniteLoopDetector()
    detector.visit(tree)
    if detector.warnings:
        raise Exception("\\n\\n".join(detector.warnings))

    transformer = AsyncInputTransformer()
    transformed = transformer.visit(tree)
    ast.fix_missing_locations(transformed)

    try:
        if transformer.has_input:
            compiled_code = compile(transformed, "<user_code>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
            sys.settrace(dyn_profiler.trace_lines)
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

except Exception as e:
    if "Execution Prevented" in str(e):
        print(str(e), file=sys.stderr)
    else:
        print(traceback.format_exc(), file=sys.stderr)
      `);

      const countsStr = pyodide.globals.get("run_hits_json");
      const counts = countsStr ? JSON.parse(countsStr) : {};

      clearTimeout(executionTimeout);
      self.postMessage({ type: 'RUN_RESULT', data: "", counts });
    }

    // ======================
    // 4. RUN TESTS MODE (CodeChum-Style Automated Eval)
    // ======================
    else if (type === 'RUN_TESTS') {
      if (!testCases || testCases.length === 0) {
        throw new Error("No test cases provided.");
      }

      const results = [];

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];

        // Pass variables safely to Python scope to avoid string escaping issues
        pyodide.globals.set("current_test_input", tc.input || "");
        pyodide.globals.set("user_code", code);

        try {
          // Execute test case using string IO mocking
          await pyodide.runPythonAsync(`
import sys
import builtins
import ast
import traceback
from io import StringIO

# Reset Stdin/Stdout for CodeChum style testing
sys.stdin = StringIO(current_test_input)
sys.stdout = StringIO()

# Ensure standard input behavior bypasses the async override from normal RUN_CODE
builtins.input = lambda prompt="": sys.stdin.readline().rstrip('\\n')

# Infinite Loop Detector to prevent tests from hanging
class InfiniteLoopDetector(ast.NodeVisitor):
    def __init__(self):
        self.warnings = []
    def visit_While(self, node):
        if isinstance(node.test, ast.Constant) and node.test.value is True:
            has_break = any(isinstance(child, (ast.Break, ast.Return)) for child in ast.walk(node))
            if not has_break:
                self.warnings.append("Execution Prevented: Infinite 'while True' loop detected.")
        else:
            condition_vars = {n.id for n in ast.walk(node.test) if isinstance(n, ast.Name)}
            if condition_vars:
                modified_vars = set()
                for child in node.body:
                    for n in ast.walk(child):
                        if isinstance(n, ast.Assign):
                            for target in n.targets:
                                if isinstance(target, ast.Name): modified_vars.add(target.id)
                        elif isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name):
                             modified_vars.add(n.target.id)
                if not condition_vars.intersection(modified_vars):
                    has_break = any(isinstance(child, (ast.Break, ast.Return)) for child in ast.walk(node))
                    if not has_break:
                        self.warnings.append("Execution Prevented: Loop condition never modified.")
        self.generic_visit(node)

try:
    tree = ast.parse(user_code, filename="<user_code>")
    detector.visit(tree)
    if detector.warnings:
        raise Exception("\\n".join(detector.warnings))

    # Execute the code
    exec(compile(tree, "<user_code>", "exec"), globals())
except Exception as e:
    # Print exceptions to stdout so they are caught as failed tests
    print(f"Error: {e}")
          `);

          // Extract what was printed during the test
          const actualOutput = await pyodide.runPythonAsync("sys.stdout.getvalue()");

          // Standardize expected and actual outputs for comparison
          const cleanExpected = (tc.expectedOutput || "").toString().trim();
          const cleanActual = (actualOutput || "").toString().trim();
          const passed = cleanExpected === cleanActual;

          results.push({
            testIndex: i,
            passed: passed,
            expected: cleanExpected,
            actual: cleanActual,
            input: tc.input,
            isHidden: tc.hidden,
            error: null
          });

        } catch (execError) {
          // Fallback if execution outright crashes the pyodide environment
          results.push({
            testIndex: i,
            passed: false,
            expected: (tc.expectedOutput || "").toString().trim(),
            actual: null,
            input: tc.input,
            isHidden: tc.hidden,
            error: String(execError)
          });
        }
      }

      self.postMessage({ type: 'TEST_RESULTS', results });
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