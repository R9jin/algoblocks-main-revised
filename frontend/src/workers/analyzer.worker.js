// frontend/src/workers/analyzer.worker.js
let pyodide = null;
let pyodidePromise = null; 

let inputResolve = null;
let isWaitingForInput = false;
let executionTimeout = null;

async function initPyodide() {
  if (pyodide) return pyodide;
  
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      try {
        const pyodideUrl = self.location.origin + "/pyodide/pyodide.mjs";
        const module = await import(/* @vite-ignore */ pyodideUrl);
        const loadPyodide = module.loadPyodide;

        const tempPyodide = await loadPyodide();
        const cacheBuster = "?t=" + Date.now();

        const [analyzerCode, astCode, nlgCode, tracerCode] = await Promise.all([
          fetch("/python_engine/analyzer.py" + cacheBuster).then(res => res.text()),
          fetch("/python_engine/blockly_ast.py" + cacheBuster).then(res => res.text()),
          fetch("/python_engine/semantic_nlg.py" + cacheBuster).then(res => res.text()),
          fetch("/python_engine/dynamic_tracer.py" + cacheBuster).then(res => res.text())
        ]);

        if (nlgCode.includes("<!DOCTYPE html>")) {
          throw new Error("Service Worker served index.html instead of python files!");
        }

        tempPyodide.FS.writeFile("analyzer.py", analyzerCode);
        tempPyodide.FS.writeFile("blockly_ast.py", astCode);
        tempPyodide.FS.writeFile("semantic_nlg.py", nlgCode);
        tempPyodide.FS.writeFile("dynamic_tracer.py", tracerCode);

        pyodide = tempPyodide;
        return tempPyodide;
      } catch (error) {
        console.error("Pyodide Engine Crash:", error);
        pyodidePromise = null; 
        throw error;
      }
    })();
  }
  
  return await pyodidePromise;
}

self.onmessage = async (e) => {
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

  const MAX_CODE_LENGTH = 10000;
  if (code && code.length > MAX_CODE_LENGTH) {
    const errorMsg = `Code payload too large. Maximum allowed is ${MAX_CODE_LENGTH} characters.`;
    if (type === 'ANALYZE_CODE') {
      self.postMessage({ type: 'ANALYZE_RESULT', data: { status: 'error', message: errorMsg } });
    } else {
      self.postMessage({ type: 'ERROR', data: errorMsg });
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
import ast

# CLEAR CACHE FOR HOT RELOADING
if 'analyzer' in sys.modules:
    del sys.modules['analyzer']
if 'semantic_nlg' in sys.modules:
    del sys.modules['semantic_nlg']
if 'dynamic_tracer' in sys.modules:
    del sys.modules['dynamic_tracer']

# --- DEEP STACK LINTER ---
def gather_custom_lint_errors(code_str):
    errs = []
    lines = code_str.split('\\n')
    
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}
    
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith('#'):
            continue
            
        # 1. Missing Colon Checker
        if s.startswith(('def ', 'if ', 'elif ', 'else', 'for ', 'while ', 'class ', 'try', 'except', 'finally')):
            s_no_comment = s.split('#')[0].strip()
            if not s_no_comment.endswith(':') and not s_no_comment.endswith(('(', '[', '{', ',', '\\\\')):
                errs.append({"line": i+1, "message": "expected ':'"})
                
        # 2. Unbalanced Bracket Checker
        in_str = False
        str_char = ''
        escape = False
        for char in line:
            if escape:
                escape = False
                continue
            if char == '\\\\':
                escape = True
                continue
                
            if char in '"\\'' and not in_str:
                in_str = True
                str_char = char
            elif char == str_char and in_str:
                in_str = False
            
            if not in_str:
                if char in pairs:
                    stack.append((char, i+1))
                elif char in pairs.values():
                    if not stack:
                        errs.append({"line": i+1, "message": f"unmatched '{char}'"})
                    else:
                        top, _ = stack.pop()
                        if pairs[top] != char:
                            errs.append({"line": i+1, "message": f"closing '{char}' does not match opening '{top}'"})
                            
    for char, l in stack:
         errs.append({"line": l, "message": f"unclosed '{char}'"})

    return errs

try:
    from analyzer import analyze_source_code
    output_dict = analyze_source_code(user_code)
    
    # --- INTERCEPT THE SWALLOWED ERROR ---
    # analyzer.py gracefully catches SyntaxErrors. We must intercept it 
    # to run our deep-stack checker and append the multiple errors.
    if isinstance(output_dict, dict) and output_dict.get("status") == "error":
        custom_errs = gather_custom_lint_errors(user_code)
        
        real_line = output_dict.get("line", 1)
        real_msg = output_dict.get("message", "Syntax Error")
        
        all_errors = [{"line": real_line, "message": real_msg}]
        
        for ce in custom_errs:
            if not any(existing['line'] == ce['line'] for existing in all_errors):
                all_errors.append(ce)
                
        all_errors.sort(key=lambda x: x['line'])
        output_dict["multiple_errors"] = all_errors

    output = json.dumps(output_dict)
    
except Exception as e:
    # Failsafe if the analyzer actually crashes
    custom_errs = gather_custom_lint_errors(user_code)
    real_line = getattr(e, 'lineno', 1) or 1
    real_msg = str(e)
    
    all_errors = [{"line": real_line, "message": real_msg}]
    for ce in custom_errs:
        if not any(existing['line'] == ce['line'] for existing in all_errors):
            all_errors.append(ce)
            
    all_errors.sort(key=lambda x: x['line'])
    
    output = json.dumps({
        "status": "error",
        "multiple_errors": all_errors,
        "line": real_line,
        "message": real_msg
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
    // 3. RUN MODE
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
    // 4. BENCHMARK SUITE MODE
    // ======================
    else if (type === 'RUN_BENCHMARK_SUITE') {
      try {
        await initPyodide();
        const { dataset } = e.data;
        let passedCount = 0;
        let failedCount = 0;
        const detailedResults = [];

        for (let i = 0; i < dataset.length; i++) {
          const item = dataset[i];
          const testName = item.name || item.title || item.algorithm || `Test Case #${i + 1}`;
          
          self.postMessage({ 
            type: 'BENCHMARK_PROGRESS', 
            progress: Math.round(((i + 1) / dataset.length) * 100),
            currentItem: testName
          });

          pyodide.globals.set("user_code", item.code || "");
          const pyResultStr = await pyodide.runPythonAsync(`
import json
import sys
try:
    from analyzer import analyze_source_code
    res = analyze_source_code(user_code)
except Exception as err:
    res = {"status": "error", "total": "ERROR", "overall_explanation": str(err)}
json.dumps(res)
          `);
          const resultJs = JSON.parse(pyResultStr);

          const expectedComplexity = String(item.expected_time || item.expectedComplexity || item.complexity || "O(1)").toLowerCase().replace(/\s+/g, "");
          const predictedComplexity = String(resultJs.total || "").toLowerCase().replace(/\s+/g, "");

          const isCorrect = (predictedComplexity === expectedComplexity) || 
                            (predictedComplexity.includes(expectedComplexity) && expectedComplexity !== "") || 
                            (expectedComplexity.includes(predictedComplexity) && predictedComplexity !== "");

          if (isCorrect) {
            passedCount++;
          } else {
            failedCount++;
          }

          detailedResults.push({
            id: item.id || `case_${i + 1}`,
            name: testName,
            category: item.category || item.algorithm_type || "Algorithm Benchmark",
            codeSnippet: item.code || "# No code snippet provided",
            expectedTime: item.expected_time || item.expectedComplexity || item.complexity || "O(1)",
            predictedTime: resultJs.total || "PARSE_FAIL",
            isCorrect: isCorrect,
            explanation: resultJs.overall_explanation || "No explanation yielded."
          });
        }

        const accuracyRate = dataset.length > 0 ? (passedCount / dataset.length) * 100 : 0;

        self.postMessage({
          type: 'BENCHMARK_COMPLETE',
          payload: {
            totalTested: dataset.length,
            passed: passedCount,
            failed: failedCount,
            accuracyRate: parseFloat(accuracyRate.toFixed(2)),
            details: detailedResults
          }
        });

      } catch (err) {
        self.postMessage({ type: 'BENCHMARK_ERROR', error: err.message });
      }
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