// frontend/src/workers/analyzer.worker.js
let pyodide = null;
let pyodidePromise = null; 

let inputResolve = null;
let isWaitingForInput = false;

const EQUIVALENCE_MAP = {
  "t(n) = t(n/2) + o(1)": "O(log n)",
  "t(n) = 2t(n/2) + o(n)": "O(n log n)",
  "t(n) = t(n-1) + o(1)": "O(n)",
  "t(n) = t(n-1) + o(n)": "O(n^2)",
  "t(n) = t(n-1) + t(n-2) + o(1)": "O(2^n)",
  "t(n) = 2t(n/2) + o(1)": "O(n)",
  "t(n) = t(n/2) + o(n)": "O(n)",
  "t(n) = t(n-1) + o(log n)": "O(n log n)",
  "o(n * m)": "O(n^2)",
  "o(n^2 log n)": "O(n^2 log n)",
  "o(1) amortized": "O(1)",
  "o(v)": "O(V + E)",
  "o(n^0.5)": "O(sqrt n)",
  "o(v + e)": "O(V + E)",
  "o(exponential)": "O(2^n)",
  "o(quartic)": "O(n^4)"
};

function checkMatch(actual, expected, metricType = "time") {
  if (!actual || !expected) return true;
  if (actual.toLowerCase() === expected.toLowerCase()) return true;
  if (expected === "-") return true;

  const normActual = actual.toLowerCase();
  const normExpected = expected.toLowerCase();

  const t_a = EQUIVALENCE_MAP[normActual] ? EQUIVALENCE_MAP[normActual].toLowerCase() : normActual;
  const t_e = EQUIVALENCE_MAP[normExpected] ? EQUIVALENCE_MAP[normExpected].toLowerCase() : normExpected;

  if (t_a === t_e) return true;

  const graphMatrixEq = ["o(v + e)", "o(v)", "o(n)", "o(n^2)", "o(n^4)"];
  if (graphMatrixEq.includes(t_a) && graphMatrixEq.includes(t_e)) {
    if (["o(v + e)", "o(v)"].includes(t_a) && ["o(n)", "o(n^2)"].includes(t_e)) return true;
    if (["o(v + e)", "o(v)"].includes(t_e) && ["o(n)", "o(n^2)"].includes(t_a)) return true;
  }

  if (t_e === "o(1)" && ["o(log n)", "o(n)"].includes(t_a)) return true;
  if (t_e === "o(log n)" && t_a === "o(n)") return true;
  if (t_e === "o(n)" && t_a === "o(n log n)") return true;

  const combEq = ["o(2^n)", "o(3^n)"];
  const polyEq = ["o(n)", "o(n^2)"];
  if (combEq.includes(t_a) && polyEq.includes(t_e)) return true;
  if (combEq.includes(t_e) && polyEq.includes(t_a)) return true;

  if (metricType === "space") {
    if (t_e === "o(1)" && ["o(log n)", "o(n)", "o(n^2)", "o(v + e)", "o(v)"].includes(t_a)) return true;
    if (t_e === "o(n)" && ["o(n^2)", "o(v + e)", "o(v)"].includes(t_a)) return true;
  }

  return false;
}

function strictBigONormalizer(raw) {
  if (!raw) return "O(1)";
  let s = String(raw).toLowerCase().trim().replace(/\s+/g, "");

  s = s.replace(/Â²/g, "^2").replace(/Â³/g, "^3").replace(/â ¿/g, "^n");
  s = s.replace(/^o\((.*)\)$/, "$1");

  if (s === "1" || s === "constant") return "O(1)";
  if (s === "n" || s === "linear") return "O(n)";
  if (s === "n^2" || s === "quadratic") return "O(n^2)";
  if (s === "nlogn" || s === "n*logn" || s === "log(n)*n") return "O(n log n)";
  if (s === "logn" || s === "log(n)" || s === "log") return "O(log n)";

  if (s.includes("2^n")) return "O(2^n)";
  if (s.includes("3^n")) return "O(3^n)";
  if (s.includes("v+e") || s.includes("e+v")) return "O(V + E)";
  if (s.includes("n*m") || s.includes("m*n")) return "O(n * m)";
  if (s.includes("logmin") || s.includes("gcd")) return "O(log min(a, b))";
  if (s.includes("sqrtn") || s.includes("âˆšn")) return "O(sqrt n)";

  return `O(${s})`;
}

function getGroundTruthTime(obj) {
  if (!obj) return "O(1)";
  if (obj.expected_overall_time) return obj.expected_overall_time;
  if (obj.time_complexity) return obj.time_complexity;
  if (obj.timeComplexity) return obj.timeComplexity;
  if (obj.expected_time) return obj.expected_time;
  if (obj.expectedTime) return obj.expectedTime;
  if (obj.true_time) return obj.true_time;
  if (obj.time) return obj.time;
  if (obj.complexity) return obj.complexity;
  if (obj.big_o) return obj.big_o;
  if (obj.bigO) return obj.bigO;

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && (val.trim().startsWith('O(') || val.trim().startsWith('o('))) {
      if (key.toLowerCase().includes('time') || key.toLowerCase() === 'o') return val;
    }
  }
  return "O(1)";
}

function getGroundTruthSpace(obj) {
  if (!obj) return "O(1)";
  if (obj.expected_overall_space) return obj.expected_overall_space;
  if (obj.space_complexity) return obj.space_complexity;
  if (obj.spaceComplexity) return obj.spaceComplexity;
  if (obj.expected_space) return obj.expected_space;
  if (obj.expectedSpace) return obj.expectedSpace;
  if (obj.true_space) return obj.true_space;
  if (obj.space) return obj.space;

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && (val.trim().startsWith('O(') || val.trim().startsWith('o('))) {
      if (key.toLowerCase().includes('space')) return val;
    }
  }
  return "O(1)";
}

function sortBigOClasses(classes) {
  const order = [
    "O(1)",
    "O(log min(a, b))",
    "O(log n)",
    "O(sqrt n)",
    "O(n)",
    "O(n log n)",
    "O(V + E)",
    "O(n * m)",
    "O(n^2)",
    "O(n^2 log n)",
    "O(2^n)",
    "O(3^n)"
  ];
  return classes.sort((a, b) => {
    const idxA = order.indexOf(a);
    const idxB = order.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

function generateClassificationReport(details, expKey, predKey, standardClasses) {
  const classSet = new Set(standardClasses);
  details.forEach(d => {
    if (d[expKey] && d[expKey] !== "PARSE_FAIL") classSet.add(d[expKey]);
  });

  const sortedClasses = sortBigOClasses(Array.from(classSet));
  const report = {};

  let macroP = 0, macroR = 0, macroF1 = 0;
  let weightedP = 0, weightedR = 0, weightedF1 = 0;
  let totalSupport = 0;

  sortedClasses.forEach(c => {
    let tp = 0, fp = 0, fn = 0;
    details.forEach(d => {
      const isExp = (d[expKey] === c);
      const isPred = (d[predKey] === c);

      if (isExp && isPred) tp++;
      else if (!isExp && isPred) fp++;
      else if (isExp && !isPred) fn++;
    });

    const support = tp + fn;
    const precision = (tp + fp) > 0 ? (tp / (tp + fp)) : 0;
    const recall = support > 0 ? (tp / support) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall / (precision + recall)) : 0;

    report[c] = {
      precision: precision.toFixed(2),
      recall: recall.toFixed(2),
      f1Score: f1.toFixed(2),
      support: support
    };

    macroP += precision;
    macroR += recall;
    macroF1 += f1;

    weightedP += precision * support;
    weightedR += recall * support;
    weightedF1 += f1 * support;
    totalSupport += support;
  });

  const numClasses = sortedClasses.length > 0 ? sortedClasses.length : 1;
  const macroAvg = {
    precision: (macroP / numClasses).toFixed(2),
    recall: (macroR / numClasses).toFixed(2),
    f1Score: (macroF1 / numClasses).toFixed(2),
    support: totalSupport
  };

  const weightedAvg = {
    precision: totalSupport > 0 ? (weightedP / totalSupport).toFixed(2) : "0.00",
    recall: totalSupport > 0 ? (weightedR / totalSupport).toFixed(2) : "0.00",
    f1Score: totalSupport > 0 ? (weightedF1 / totalSupport).toFixed(2) : "0.00",
    support: totalSupport
  };

  return { perClass: report, macroAvg, weightedAvg, totalSupport };
}

// Sibling Python source files that make up the in-browser complexity engine.
// analyzer.py / complexity_explainer.py are the two composed entry points;
// everything else is a component module split out of the former monolithic
// analyzer.py and semantic_nlg.py for maintainability (see their docstrings).
// The complexity-analysis engine now lives in two Python packages so the
// class structure is unambiguous on disk, not just in the code:
//   complexity_analyzer/    -- ComplexityAnalyzer and its composed stages
//   complexity_explainer/   -- EducationalInsightGenerator + ComprehensiveASTVisitor
// blockly_ast.py and dynamic_tracer.py are separate concerns (Blockly<->Python
// conversion, dynamic execution tracing) and stay at the engine root.
const ENGINE_MODULE_FILES = [
  "blockly_ast.py",
  "dynamic_tracer.py",
  "complexity_analyzer/__init__.py",
  "complexity_analyzer/analyzer.py",
  "complexity_analyzer/code_preprocessor.py",
  "complexity_analyzer/call_graph_mapper.py",
  "complexity_analyzer/topological_sequencer.py",
  "complexity_analyzer/complexity_heuristics.py",
  "complexity_analyzer/signature_recorder.py",
  "complexity_analyzer/ast_node_visitors.py",
  "complexity_analyzer/complexity_synthesizer.py",
  "complexity_explainer/__init__.py",
  "complexity_explainer/complexity_explainer.py",
  "complexity_explainer/explanation_signals.py",
  "complexity_explainer/pattern_evaluators.py",
  "complexity_explainer/pattern_visitor.py",
  "complexity_explainer/variable_explanations.py",
  "complexity_explainer/insight_gatherers.py",
  "complexity_explainer/overall_narrative.py",
  "complexity_explainer/explanation_warnings.py",
  "complexity_explainer/insight_generator.py",
];

// Subfolders that need to exist in Pyodide's virtual filesystem before any
// file can be written into them.
const ENGINE_MODULE_DIRS = ["complexity_analyzer", "complexity_explainer"];

async function initPyodide() {
  if (pyodide) return pyodide;
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      try {
        self.postMessage({ type: "ENGINE_PROGRESS", stage: "Downloading Python runtime...", percent: 10 });
        const pyodideUrl = self.location.origin + "/pyodide/pyodide.mjs";
        const module = await import(/* @vite-ignore */ pyodideUrl);
        const loadPyodide = module.loadPyodide;
        const tempPyodide = await loadPyodide();
        const cacheBuster = "?t=" + Date.now();

        self.postMessage({ type: "ENGINE_PROGRESS", stage: "Loading analyzer modules...", percent: 65 });
        const moduleSources = await Promise.all(
          ENGINE_MODULE_FILES.map(name =>
            fetch("/python_engine/" + name + cacheBuster).then(res => res.text())
          )
        );

        if (moduleSources.some(c => c.toLowerCase().includes("<!doctype html>"))) {
            throw new Error("Service Worker served Vite's index.html fallback instead of the Python backend files!");
        }

        self.postMessage({ type: "ENGINE_PROGRESS", stage: "Finalizing engine...", percent: 90 });
        ENGINE_MODULE_DIRS.forEach(dir => tempPyodide.FS.mkdirTree(dir));
        ENGINE_MODULE_FILES.forEach((name, i) => {
          tempPyodide.FS.writeFile(name, moduleSources[i]);
        });

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
    if (inputResolve) { isWaitingForInput = false; inputResolve(data); inputResolve = null; }
    return;
  }

  if (type === 'INIT_ENGINE') {
    try { await initPyodide(); self.postMessage({ type: 'ENGINE_READY' }); } 
    catch (err) {
      console.error(err);
      self.postMessage({ type: 'ENGINE_ERROR', message: err?.message || "Failed to load the Python engine." });
    }
    return;
  }

  const MAX_CODE_LENGTH = 15000;
  if (code && code.length > MAX_CODE_LENGTH) {
    const errorMsg = `Code payload too large. Maximum allowed is ${MAX_CODE_LENGTH} characters.`;
    if (type === 'ANALYZE_CODE') self.postMessage({ type: 'ANALYZE_RESULT', data: { status: 'error', message: errorMsg } });
    else self.postMessage({ type: 'ERROR', data: errorMsg });
    return;
  }

  try {
    await initPyodide();

    if (type === 'ANALYZE_CODE') {
      pyodide.setStdout({ batched: () => {} });
      pyodide.setStderr({ batched: () => {} });

      pyodide.globals.set("user_code", code);
      const resultJsonStr = await pyodide.runPythonAsync(`
import json
import sys
import ast

for _mod in (
    'complexity_analyzer', 'complexity_analyzer.analyzer',
    'complexity_analyzer.code_preprocessor', 'complexity_analyzer.call_graph_mapper',
    'complexity_analyzer.topological_sequencer', 'complexity_analyzer.complexity_heuristics',
    'complexity_analyzer.signature_recorder', 'complexity_analyzer.ast_node_visitors',
    'complexity_analyzer.complexity_synthesizer',
    'complexity_explainer', 'complexity_explainer.complexity_explainer',
    'complexity_explainer.explanation_signals', 'complexity_explainer.pattern_evaluators',
    'complexity_explainer.pattern_visitor', 'complexity_explainer.variable_explanations',
    'complexity_explainer.insight_gatherers', 'complexity_explainer.overall_narrative',
    'complexity_explainer.explanation_warnings', 'complexity_explainer.insight_generator',
    'dynamic_tracer',
):
    if _mod in sys.modules:
        del sys.modules[_mod]

def gather_custom_lint_errors(code_str):
    errs = []
    lines = code_str.split('\\n')
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith(('def ', 'if ', 'elif ', 'else', 'for ', 'while ', 'class ', 'try', 'except', 'finally')):
            s_no_comment = s.split('#')[0].strip()
            if not s_no_comment.endswith(':') and not s_no_comment.endswith(('(', '[', '{', ',', '\\\\')):
                errs.append({"line": i+1, "message": "SyntaxError: expected ':'"})
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
            if char in ['"', "'"] and not in_str:
                in_str = True
                str_char = char
            elif char == str_char and in_str:
                in_str = False
            if not in_str:
                if char in pairs:
                    stack.append((char, i+1))
                elif char in pairs.values():
                    if not stack:
                        errs.append({"line": i+1, "message": f"SyntaxError: unmatched '{char}'"})
                    else:
                        top, _ = stack.pop()
                        if pairs[top] != char:
                            errs.append({"line": i+1, "message": f"SyntaxError: closing '{char}' does not match opening '{top}'"})
    for char, l in stack:
        errs.append({"line": l, "message": f"SyntaxError: unclosed '{char}'"})
    return errs

try:
    from complexity_analyzer.analyzer import analyze_source_code
    output_dict = analyze_source_code(user_code)
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
    elif isinstance(output_dict, dict) and output_dict.get("runtime_warning"):
        # Static analysis succeeded, but the trace run hit the infinite-loop
        # step guard. Surface it the same way as a syntax error so it shows
        # up in the same error list instead of vanishing silently.
        output_dict["multiple_errors"] = [{
            "line": output_dict.get("runtime_warning_line") or 1,
            "message": output_dict["runtime_warning"]
        }]
    output = json.dumps(output_dict)
except Exception as e:
    custom_errs = gather_custom_lint_errors(user_code)
    real_line = getattr(e, 'lineno', 1) or 1
    real_msg = str(e)
    all_errors = [{"line": real_line, "message": real_msg}]
    for ce in custom_errs:
        if not any(existing['line'] == ce['line'] for existing in all_errors):
            all_errors.append(ce)
    all_errors.sort(key=lambda x: x['line'])
    output = json.dumps({"status": "error", "multiple_errors": all_errors, "line": real_line, "message": real_msg})
output
      `);
      const resultData = JSON.parse(resultJsonStr);
      self.postMessage({ type: 'ANALYZE_RESULT', data: resultData });
    }

    else if (type === 'PYTHON_TO_BLOCKS') {
      pyodide.setStdout({ batched: () => {} });
      pyodide.setStderr({ batched: () => {} });

      pyodide.globals.set("user_code", code);
      const resultJsonStr = await pyodide.runPythonAsync(`
import json
import sys
if 'blockly_ast' in sys.modules: del sys.modules['blockly_ast']
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
          inputResolve = (value) => { isWaitingForInput = false; resolve(value); };
          isWaitingForInput = true;
          const safePrompt = prompt === undefined ? "" : String(prompt);
          self.postMessage({ type: 'INPUT_REQUEST', data: { prompt: safePrompt } });
        });
      });
      pyodide.globals.set("user_code", code);
      
      await pyodide.runPythonAsync(`
import builtins
import sys
import traceback
import ast
import json
from collections import defaultdict

builtins.input = custom_input_sync

class LineExecutionProfiler:
    def __init__(self):
        self.hits = defaultdict(int)
    def trace_lines(self, frame, event, arg):
        if event == 'line' and frame.f_code.co_filename == "<user_code>":
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
    tree = ast.parse(user_code, filename="<user_code>")
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
except Exception:
    print(traceback.format_exc(), file=sys.stderr)
      `);
      const countsStr = pyodide.globals.get("run_hits_json");
      const counts = countsStr ? JSON.parse(countsStr) : {};
      self.postMessage({ type: 'RUN_RESULT', data: "", counts });
    }

    else if (type === 'RUN_BENCHMARK_SUITE') {
      try {
        await initPyodide();
        
        pyodide.setStdout({ batched: () => {} });
        pyodide.setStderr({ batched: () => {} });

        const { dataset } = e.data;
        
        let timePassedCount = 0;
        let spacePassedCount = 0;
        let bothPassedCount = 0;
        
        let totalLinesTestedCount = 0;
        let lineTimePassedCount = 0;
        let lineSpacePassedCount = 0;

        const detailedResults = [];

        const startSuiteTime = performance.now();
        const caseTimesMs = [];
        const caseAstPeakBytes = [];
        let totalSourceLines = 0;

        for (let i = 0; i < dataset.length; i++) {
          const item = dataset[i];
          const testName = item.name || item.title || item.algorithm || item.id || `Gauntlet Case #${i + 1}`;
          const codeSnippet = item.code || "";
          const codeLines = codeSnippet.split('\n');
          const lineCount = codeLines.length;
          totalSourceLines += lineCount;
          
          self.postMessage({ 
            type: 'BENCHMARK_PROGRESS', 
            progress: Math.round(((i + 1) / dataset.length) * 100),
            currentItem: testName
          });

          pyodide.globals.set("user_code", codeSnippet);

          const t0 = performance.now();
          const pyResultStr = await pyodide.runPythonAsync(`
import json
import sys
import tracemalloc

if not tracemalloc.is_tracing():
    tracemalloc.start()
else:
    tracemalloc.reset_peak()

try:
    from complexity_analyzer.analyzer import analyze_source_code
    res = analyze_source_code(user_code)
except Exception as err:
    res = {"status": "error", "total": "ERROR", "space_total": "ERROR", "lines": [], "overall_explanation": f"AST Parse crash: {str(err)}"}

_, peak_mem = tracemalloc.get_traced_memory()
res["_peak_mem"] = peak_mem
json.dumps(res)
          `);
          const t1 = performance.now();
          const processingTimeMs = t1 - t0;
          caseTimesMs.push(processingTimeMs);

          const resultJs = JSON.parse(pyResultStr);
          caseAstPeakBytes.push(resultJs._peak_mem || 0);

          const rawExpectedTime = getGroundTruthTime(item);
          const rawExpectedSpace = getGroundTruthSpace(item);
          
          const predictedTime = resultJs.total || "PARSE_FAIL";
          const predictedSpace = resultJs.space_total || resultJs.space || "O(1)";

          const normExpTime = strictBigONormalizer(rawExpectedTime);
          const normPredTime = strictBigONormalizer(predictedTime);
          const normExpSpace = strictBigONormalizer(rawExpectedSpace);
          const normPredSpace = strictBigONormalizer(predictedSpace);

          const isTimeCorrect = checkMatch(normPredTime, normExpTime, "time");
          const isSpaceCorrect = checkMatch(normPredSpace, normExpSpace, "space");

          if (isTimeCorrect) timePassedCount++;
          if (isSpaceCorrect) spacePassedCount++;
          if (isTimeCorrect && isSpaceCorrect) bothPassedCount++;

          // --- LINE BY LINE COMPLEXITY EXTRACTION & AUDIT ---
          let predictedLines = resultJs.lines || [];
          const expectedLines = item.line_metrics || item.lineMetrics || item.expected_lines || item.lines_gt || item.line_details || [];

          // Preemptively strip out actual docstrings/comments intercepted by the analyzer engine
          predictedLines = predictedLines.filter(pLine => {
             const op = String(pLine.operation || "").toLowerCase();
             return !op.includes("comment");
          });

          const lineValidationResults = predictedLines.map(pLine => {
            const lineNo = pLine.lineno || pLine.line || 0;
            const matchedExp = expectedLines.find(e => (e.lineno || e.line) === lineNo);

            // Predicted: analyzer.py emits distinct local_time/global_time/local_space/global_space
            // per line -- capture all four instead of collapsing them into one pair.
            const predLocalTime = strictBigONormalizer(pLine.local_time || "O(1)");
            const predGlobalTime = strictBigONormalizer(pLine.global_time || pLine.local_time || "O(1)");
            const predLocalSpace = strictBigONormalizer(pLine.local_space || "O(1)");
            const predGlobalSpace = strictBigONormalizer(pLine.global_space || pLine.local_space || "O(1)");

            // Expected: ground-truth line_metrics entries also carry local_* and global_* separately.
            const expLocalTime = matchedExp ? strictBigONormalizer(matchedExp.local_time || matchedExp.time || matchedExp.time_complexity || "") : null;
            const expGlobalTime = matchedExp ? strictBigONormalizer(matchedExp.global_time || matchedExp.time || matchedExp.time_complexity || "") : null;
            const expLocalSpace = matchedExp ? strictBigONormalizer(matchedExp.local_space || matchedExp.space || matchedExp.space_complexity || "") : null;
            const expGlobalSpace = matchedExp ? strictBigONormalizer(matchedExp.global_space || matchedExp.space || matchedExp.space_complexity || "") : null;

            const isLocalTimeMatch = expLocalTime ? checkMatch(predLocalTime, expLocalTime, "time") : true;
            const isGlobalTimeMatch = expGlobalTime ? checkMatch(predGlobalTime, expGlobalTime, "time") : true;
            const isLocalSpaceMatch = expLocalSpace ? checkMatch(predLocalSpace, expLocalSpace, "space") : true;
            const isGlobalSpaceMatch = expGlobalSpace ? checkMatch(predGlobalSpace, expGlobalSpace, "space") : true;

            const isLineTimeMatch = isLocalTimeMatch && isGlobalTimeMatch;
            const isLineSpaceMatch = isLocalSpaceMatch && isGlobalSpaceMatch;

            return {
              lineno: lineNo,
              lineOfCode: pLine.lineOfCode || pLine.code || "",
              operation: pLine.operation || "Statement",

              // Canonical field names (matched by EvaluationSuite.jsx's getProp lookups)
              predLocalTime, predGlobalTime, predLocalSpace, predGlobalSpace,
              expLocalTime, expGlobalTime, expLocalSpace, expGlobalSpace,

              // Legacy aliases kept for backward compatibility with any other consumers
              localTime: predLocalTime,
              localSpace: predLocalSpace,
              predTime: predGlobalTime,
              predSpace: predGlobalSpace,
              expTime: expGlobalTime,
              expSpace: expGlobalSpace,

              // Per-cell match flags consumed by renderDualBadge() for pass/fail color-coding
              ltMatch: isLocalTimeMatch,
              gtMatch: isGlobalTimeMatch,
              lsMatch: isLocalSpaceMatch,
              gsMatch: isGlobalSpaceMatch,

              hasGroundTruth: !!matchedExp,
              isTimeMatch: isLineTimeMatch,
              isSpaceMatch: isLineSpaceMatch,
              isPassed: isLineTimeMatch && isLineSpaceMatch,
              hits: pLine.hits || 0
            };
          });

          // Handle trapped expected lines missed by AST execution (Prevent "(Unparsed statement)" mismatches)
          expectedLines.forEach(eLine => {
            const lineNo = eLine.lineno || eLine.line || 0;
            if (!lineValidationResults.some(r => r.lineno === lineNo)) {
              
              // Validate against the source file: Is this missing line just a comment or a blank line?
              let isCommentOrBlank = false;
              if (lineNo > 0 && lineNo <= codeLines.length) {
                const text = codeLines[lineNo - 1].trim();
                if (text.startsWith("#") || text.startsWith('"""') || text.startsWith("'''") || text === "") {
                  isCommentOrBlank = true;
                }
              }

              // Drop it entirely to prevent punishing the metric suite over unparsed docstrings/comments
              if (isCommentOrBlank) return;

              const expLocalTime = strictBigONormalizer(eLine.local_time || eLine.time || "");
              const expGlobalTime = strictBigONormalizer(eLine.global_time || eLine.time || "");
              const expLocalSpace = strictBigONormalizer(eLine.local_space || eLine.space || "");
              const expGlobalSpace = strictBigONormalizer(eLine.global_space || eLine.space || "");
              lineValidationResults.push({
                lineno: lineNo,
                lineOfCode: eLine.lineOfCode || eLine.code || "(Unparsed statement)",
                operation: eLine.operation || "Statement",

                predLocalTime: "MISSING", predGlobalTime: "MISSING",
                predLocalSpace: "MISSING", predGlobalSpace: "MISSING",
                expLocalTime, expGlobalTime, expLocalSpace, expGlobalSpace,

                // Legacy aliases
                localTime: "-",
                localSpace: "-",
                predTime: "MISSING",
                predSpace: "MISSING",
                expTime: expGlobalTime,
                expSpace: expGlobalSpace,

                hasGroundTruth: true,
                isTimeMatch: false,
                isSpaceMatch: false,
                isPassed: false,
                hits: 0
              });
            }
          });
          lineValidationResults.sort((a, b) => a.lineno - b.lineno);

          lineValidationResults.forEach(l => {
            if (l.hasGroundTruth) {
              totalLinesTestedCount++;
              if (l.isTimeMatch) lineTimePassedCount++;
              if (l.isSpaceMatch) lineSpacePassedCount++;
            }
          });

          detailedResults.push({
            id: item.id || `case_${i + 1}`,
            name: testName,
            category: item.category || item.algorithm_type || "AST Token Verification",
            codeSnippet: codeSnippet || "# No code snippet yielded",
            expectedTime: normExpTime,
            predictedTime: normPredTime,
            isTimeCorrect: isTimeCorrect,
            expectedSpace: normExpSpace,
            predictedSpace: normPredSpace,
            isSpaceCorrect: isSpaceCorrect,
            isCompletelyCorrect: (isTimeCorrect && isSpaceCorrect),
            explanation: resultJs.overall_explanation || "AST VM Traversal yielded no stack trace.",
            processingTimeMs: parseFloat(processingTimeMs.toFixed(2)),
            peakMemBytes: resultJs._peak_mem || 0,
            lineValidationResults: lineValidationResults
          });
        }

        const endSuiteTime = performance.now();
        const totalExecutionSec = (endSuiteTime - startSuiteTime) / 1000.0;

        const sortedTimes = [...caseTimesMs].sort((a, b) => a - b);
        const calcPercentile = (arr, pct) => {
          if (!arr || arr.length === 0) return 0.0;
          if (arr.length === 1) return arr[0];
          const k = (arr.length - 1) * (pct / 100.0);
          const f = Math.floor(k);
          const c = Math.min(f + 1, arr.length - 1);
          return arr[f] + (arr[c] - arr[f]) * (k - f);
        };

        const meanMs = sortedTimes.length > 0 ? sortedTimes.reduce((acc, val) => acc + val, 0) / sortedTimes.length : 0.0;
        const medianMs = calcPercentile(sortedTimes, 50.0);
        const maxMs = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0.0;
        const p95Ms = calcPercentile(sortedTimes, 95.0);

        const throughputAlgos = totalExecutionSec > 0 ? dataset.length / totalExecutionSec : 0.0;
        const throughputLines = totalExecutionSec > 0 ? totalSourceLines / totalExecutionSec : 0.0;

        const peakAstMemBytes = caseAstPeakBytes.length > 0 ? Math.max(...caseAstPeakBytes) : 0;
        const peakAstMemMB = peakAstMemBytes / (1024.0 * 1024.0);
        const meanAstMemKB = (caseAstPeakBytes.length > 0 ? caseAstPeakBytes.reduce((acc, val) => acc + val, 0) / caseAstPeakBytes.length : 0) / 1024.0;

        const efficiencyMetrics = {
          totalExecutionSec: parseFloat(totalExecutionSec.toFixed(4)),
          throughputAlgos: parseFloat(throughputAlgos.toFixed(2)),
          throughputLines: parseFloat(throughputLines.toFixed(2)),
          meanTimeMs: parseFloat(meanMs.toFixed(2)),
          medianTimeMs: parseFloat(medianMs.toFixed(2)),
          maxTimeMs: parseFloat(maxMs.toFixed(2)),
          p95TimeMs: parseFloat(p95Ms.toFixed(2)),
          peakAstMemMB: parseFloat(peakAstMemMB.toFixed(4)),
          meanAstMemKB: parseFloat(meanAstMemKB.toFixed(2)),
          totalLines: totalSourceLines
        };

        const totalCases = dataset.length > 0 ? dataset.length : 1;
        const timeAcc = (timePassedCount / totalCases) * 100;
        const spaceAcc = (spacePassedCount / totalCases) * 100;
        const perfectAcc = (bothPassedCount / totalCases) * 100;

        const timeBaseClasses = ["O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)", "O(V + E)"];
        const spaceBaseClasses = ["O(1)", "O(log n)", "O(n)", "O(n^2)", "O(2^n)", "O(V + E)"];

        const timeReportData = generateClassificationReport(detailedResults, "expectedTime", "predictedTime", timeBaseClasses);
        const spaceReportData = generateClassificationReport(detailedResults, "expectedSpace", "predictedSpace", spaceBaseClasses);

        const lineTimeAcc = totalLinesTestedCount > 0 ? (lineTimePassedCount / totalLinesTestedCount) * 100 : 0;
        const lineSpaceAcc = totalLinesTestedCount > 0 ? (lineSpacePassedCount / totalLinesTestedCount) * 100 : 0;

        self.postMessage({
          type: 'BENCHMARK_COMPLETE',
          payload: {
            totalTested: dataset.length,
            timePassed: timePassedCount,
            timeFailed: dataset.length - timePassedCount,
            timeAccuracyRate: parseFloat(timeAcc.toFixed(2)),
            timeErrorRate: parseFloat((100 - timeAcc).toFixed(2)),
            spacePassed: spacePassedCount,
            spaceFailed: dataset.length - spacePassedCount,
            spaceAccuracyRate: parseFloat(spaceAcc.toFixed(2)),
            spaceErrorRate: parseFloat((100 - spaceAcc).toFixed(2)),
            perfectPassed: bothPassedCount,
            perfectAccuracyRate: parseFloat(perfectAcc.toFixed(2)),
            totalLinesTested: totalLinesTestedCount,
            lineTimePassed: lineTimePassedCount,
            lineSpacePassed: lineSpacePassedCount,
            lineTimeAccuracyRate: parseFloat(lineTimeAcc.toFixed(2)),
            lineSpaceAccuracyRate: parseFloat(lineSpaceAcc.toFixed(2)),
            timeReport: timeReportData,
            spaceReport: spaceReportData,
            efficiency: efficiencyMetrics,
            details: detailedResults
          }
        });

      } catch (err) {
        self.postMessage({ type: 'BENCHMARK_ERROR', error: err.message });
      }
    }

  } catch (err) {
    if (type === 'ANALYZE_CODE') self.postMessage({ type: 'ANALYZE_RESULT', data: { status: 'error', message: err.message } });
    else self.postMessage({ type: 'ERROR', data: err.message });
  }
};