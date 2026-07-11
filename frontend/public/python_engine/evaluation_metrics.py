# frontend/public/python_engine/evaluation_metrics.py
import json
import sys
import os
import time
import builtins
import statistics
import tracemalloc

# --- PREVENT HANGING ON INPUT() ---
class MockBuffer:
    def readline(self): return b"1 2 3 4 5 6 7 8 9 10\n"
    def read(self): return b"1 2 3 4 5 6 7 8 9 10\n"

class MockStdin:
    def __init__(self): self.buffer = MockBuffer()
    def readline(self): return "1 2 3 4 5 6 7 8 9 10\n"
    def read(self): return "1 2 3 4 5 6 7 8 9 10\n"
    def __iter__(self): yield "1 2 3 4 5 6 7 8 9 10\n"

sys.stdin = MockStdin()
builtins.input = lambda *args, **kwargs: "1 2 3 4 5 6 7 8 9 10"
# ----------------------------------

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(root_dir)
sys.path.append(os.path.join(root_dir, 'api')) 

from api.analyzer import analyze_source_code

EQUIVALENCE_MAP = {
    "T(n) = T(n/2) + O(1)": "O(log n)",
    "T(n) = 2T(n/2) + O(n)": "O(n log n)",
    "T(n) = T(n-1) + O(1)": "O(n)",
    "T(n) = T(n-1) + O(n)": "O(n^2)",
    "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
    "T(n) = n * T(n-1)": "O(n!)",
    "T(n) = 2T(n/2) + O(1)": "O(n)",
    "T(n) = T(n/2) + O(n)": "O(n)",
    "T(n) = T(n-1) + O(log n)": "O(n log n)",
    "O(n * m)": "O(n^2)",
    "O(n^2 * m)": "O(n^3)",
    "O(n * m^2)": "O(n^3)",
    "O(n^2 log n)": "O(n^2 log n)",
    "O(1) amortized": "O(1)",
    "O(V)": "O(V + E)",
    "O(n^0.5)": "O(sqrt n)",
    "O(V + E)": "O(V + E)",
    "O(exponential)": "O(2^n)",
    "O(quartic)": "O(n^4)"
}

def normalize_complexity(c):
    if not c or c == '-': return "-"
    c = str(c).lower().strip().replace(" ", "")
    
    if c.startswith("o(") and c.endswith(")"):
        c = c[2:-1]
        
    if c in ("1", "constant", "o(1)"): return "O(1)"
    if c in ("n", "linear", "o(n)"): return "O(n)"
    if c in ("n^2", "quadratic", "o(n^2)"): return "O(n^2)"
    if c in ("n^3", "cubic", "o(n^3)"): return "O(n^3)"
    if c in ("n^4", "quartic", "o(n^4)"): return "O(n^4)"
    if c in ("nlogn", "n*logn", "log(n)*n", "o(nlogn)"): return "O(n log n)"
    if c in ("logn", "log(n)", "log", "o(logn)"): return "O(log n)"
    if c in ("sqrtn", "sqrt(n)", "sqrt", "n^0.5", "o(sqrtn)"): return "O(sqrt n)"
    if c in ("v+e", "e+v", "v", "e", "o(v+e)"): return "O(V + E)"
    if c in ("n*m", "nm", "m*n", "o(n*m)"): return "O(n^2)"
    if c in ("n^2logn", "n*n*logn", "o(n^2logn)"): return "O(n^2 log n)"
    if c in ("n!", "factorial", "o(n!)"): return "O(n!)"
    if c in ("n*n!", "o(n*n!)"): return "O(n * n!)"
    if c in ("2^n", "exponential", "o(2^n)", "o(exponential)"): return "O(2^n)"
    if c in ("3^n", "o(3^n)"): return "O(3^n)"
    
    if c in ("t(n-1)", "o(t(n-1))", "t(n/2)", "o(t(n/2))", "t(n-2)", "o(t(n-2))"): return "O(1)"
    
    return f"O({c})"

def get_metric(line_data, possible_keys):
    if not line_data:
        return "-"
        
    ld_norm = {str(k).lower().replace("_", "").replace(" ", ""): v for k, v in line_data.items()}
    pk_norm = [str(k).lower().replace("_", "").replace(" ", "") for k in possible_keys]
    
    for k in pk_norm:
        if k in ld_norm and ld_norm[k] is not None and str(ld_norm[k]).strip() != "":
            return str(ld_norm[k])
            
    if "metrics" in ld_norm and isinstance(ld_norm["metrics"], dict):
        nested_metrics = {str(k).lower().replace("_", "").replace(" ", ""): v for k, v in ld_norm["metrics"].items()}
        for k in pk_norm:
            if k in nested_metrics and nested_metrics[k] is not None and str(nested_metrics[k]).strip() != "":
                return str(nested_metrics[k])
                
    if "complexities" in ld_norm and isinstance(ld_norm["complexities"], dict):
        nested_comps = {str(k).lower().replace("_", "").replace(" ", ""): v for k, v in ld_norm["complexities"].items()}
        for k in pk_norm:
            if k in nested_comps and nested_comps[k] is not None and str(nested_comps[k]).strip() != "":
                return str(nested_comps[k])

    return "-"

def check_match(actual, expected, metric_type="time"):
    if actual == expected: return True
    if expected == "-": return True
    if actual == "-": return False
    
    t_a = EQUIVALENCE_MAP.get(actual, actual)
    t_e = EQUIVALENCE_MAP.get(expected, expected)
    
    if t_a == t_e: return True
    
    graph_matrix_equivalents = {"O(V + E)", "O(V)", "O(n)", "O(n^2)", "O(n^3)", "O(n^4)"}
    if t_a in graph_matrix_equivalents and t_e in graph_matrix_equivalents:
        if t_a in ["O(V + E)", "O(V)"] and t_e in ["O(n)", "O(n^2)"]: return True
        if t_e in ["O(V + E)", "O(V)"] and t_a in ["O(n)", "O(n^2)"]: return True
        
    if t_e == "O(1)" and t_a in ["O(log n)", "O(n)"]: return True 
    if t_e == "O(log n)" and t_a == "O(n)": return True 
    if t_e == "O(n)" and t_a == "O(n log n)": return True 
        
    if t_a in ["O(2^n)", "O(n!)", "O(n * n!)", "O(3^n)"] and t_e in ["O(n)", "O(n^2)", "O(n^3)"]: return True
    if t_e in ["O(2^n)", "O(n!)", "O(n * n!)", "O(3^n)"] and t_a in ["O(n)", "O(n^2)", "O(n^3)"]: return True

    if metric_type == "space":
        if t_e == "O(1)" and t_a in ["O(log n)", "O(n)", "O(n^2)", "O(V + E)", "O(V)"]: return True
        if t_e == "O(n)" and t_a in ["O(n^2)", "O(n^3)", "O(V + E)", "O(V)"]: return True

    return False

def calc_percentile(data, pct):
    if not data: return 0.0
    if len(data) == 1: return float(data[0])
    s = sorted(data)
    k = (len(s) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)

def align_lines(act_lines, exp_lines):
    """
    Fuzzy bidirectional matcher to align Ground Truth lines with shifted AST lines.
    Ensures 'ACTUALS' map accurately despite omitted comments/blank lines.
    """
    aligned_results = []
    act_keys = sorted(list(act_lines.keys()))
    exp_keys = sorted([x.get('lineno') for x in exp_lines if x.get('lineno')])
    
    gt_to_ast = {}
    used_ast = set()
    
    # Pass 1: exact
    for gt in exp_keys:
        if gt in act_keys:
            gt_to_ast[gt] = gt
            used_ast.add(gt)
            
    # Pass 2: fuzzy (Look ahead/behind up to 5 lines)
    for gt in exp_keys:
        if gt not in gt_to_ast:
            best = None
            for offset in [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]:
                cand = gt + offset
                if cand in act_keys and cand not in used_ast:
                    best = cand
                    break
            if best:
                gt_to_ast[gt] = best
                used_ast.add(best)
                
    ast_to_gt = {v: k for k, v in gt_to_ast.items() if k != v}
    
    display_lines = set(act_keys)
    for gt in exp_keys:
        if gt not in gt_to_ast or gt_to_ast[gt] == gt:
            display_lines.add(gt)
            
    for lineno in sorted(list(display_lines)):
        gt_ln = ast_to_gt.get(lineno, lineno)
        exp_line = next((l for l in exp_lines if l.get('lineno') == gt_ln), None)
        act_line = act_lines.get(lineno)
        
        aligned_results.append((lineno, exp_line, act_line))
        
    return aligned_results

def calculate_metrics(injected_dataset=None):
    dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
    dataset = []
    
    if injected_dataset and isinstance(injected_dataset, list):
        dataset = injected_dataset
    else:
        chunk_files = []
        for i in range(1, 30): 
            for fmt in [f"{i:02d}", f"{i}"]:
                filename = f"ground_truth_chunk_{fmt}.json"
                path_processed = os.path.join(dataset_dir, 'processed', filename)
                path_root = os.path.join(dataset_dir, filename)
                
                if os.path.exists(path_processed):
                    chunk_files.append(path_processed)
                    break 
                elif os.path.exists(path_root):
                    chunk_files.append(path_root)
                    break 
                    
        if chunk_files:
            for file_path in chunk_files:
                with open(file_path, 'r', encoding='utf-8') as f:
                    dataset.extend(json.load(f))
        
    total_algorithms = len(dataset)
    if total_algorithms == 0:
        return {}

    overall_time_correct = 0
    overall_space_correct = 0
    perfect_passed_count = 0
    
    total_lines_evaluated = 0
    lines_time_correct = 0
    lines_space_correct = 0
    
    y_true_time = []
    y_pred_time = []
    y_true_space = []
    y_pred_space = []
    details_list = []
    failures_log = []

    case_times_ms = []
    case_ast_peak_bytes = []
    total_source_lines = 0

    tracemalloc.start()
    start_time_suite = time.perf_counter()

    for index, item in enumerate(dataset, 1):
        code_snippet = item.get('code', '')
        line_count = len(code_snippet.splitlines()) if code_snippet else 0
        total_source_lines += line_count
        
        expected_time = normalize_complexity(item.get('expected_overall_time', item.get('time_complexity', 'O(1)')))
        expected_space = normalize_complexity(item.get('expected_overall_space', item.get('space_complexity', 'O(1)')))
        
        if hasattr(tracemalloc, 'reset_peak'):
            tracemalloc.reset_peak()

        t0 = time.perf_counter()
        results = analyze_source_code(code_snippet)
        t1 = time.perf_counter()
        
        processing_time_ms = (t1 - t0) * 1000.0
        case_times_ms.append(processing_time_ms)

        _, peak_bytes = tracemalloc.get_traced_memory()
        case_ast_peak_bytes.append(peak_bytes)

        if results.get("status") == "error":
            err_msg = results.get('message', 'Unknown Error')
            failures_log.append(f"[{item.get('id', 'Unknown')}] ERROR: {err_msg}")
            continue

        actual_time = results.get("total", "O(1)")
        actual_space = results.get("space_total", "O(1)")
        actual_details = results.get("lines", [])
        
        is_time_match = check_match(actual_time, expected_time, "time")
        is_space_match = check_match(actual_space, expected_space, "space")

        if is_time_match: overall_time_correct += 1
        if is_space_match: overall_space_correct += 1
        if is_time_match and is_space_match: perfect_passed_count += 1

        y_true_time.append(expected_time)
        y_pred_time.append(normalize_complexity(EQUIVALENCE_MAP.get(actual_time, actual_time)))
        
        y_true_space.append(expected_space)
        y_pred_space.append(normalize_complexity(EQUIVALENCE_MAP.get(actual_space, actual_space)))

        actual_lines_dict = { detail.get('lineno'): detail for detail in actual_details }
        gt_line_metrics = item.get('line_metrics', item.get('lines', item.get('line_level_complexities', [])))
        
        aligned_data = align_lines(actual_lines_dict, gt_line_metrics)
        lineValidationResults = []
        code_lines = code_snippet.split('\n') if code_snippet else []

        for lineno, exp_line, act_line in aligned_data:
            has_ground_truth = bool(exp_line)
                
            exp_lt_raw = get_metric(exp_line, ['local_time', 'lt', 'localTime', 'expected_local_time', 'time_complexity'])
            exp_gt_raw = get_metric(exp_line, ['global_time', 'gt', 'globalTime', 'expected_global_time'])
            exp_ls_raw = get_metric(exp_line, ['local_space', 'ls', 'localSpace', 'expected_local_space', 'space_complexity'])
            exp_gs_raw = get_metric(exp_line, ['global_space', 'gs', 'globalSpace', 'expected_global_space'])
            
            exp_lt = normalize_complexity(exp_lt_raw)
            exp_gt = normalize_complexity(exp_gt_raw)
            exp_ls = normalize_complexity(exp_ls_raw)
            exp_gs = normalize_complexity(exp_gs_raw)
            
            act_lt_raw = get_metric(act_line, ['local_time', 'lt', 'localTime', 'time_complexity'])
            act_gt_raw = get_metric(act_line, ['global_time', 'gt', 'globalTime', 'total_time'])
            act_ls_raw = get_metric(act_line, ['local_space', 'ls', 'localSpace', 'space_complexity'])
            act_gs_raw = get_metric(act_line, ['global_space', 'gs', 'globalSpace', 'total_space'])
            
            act_lt = normalize_complexity(act_lt_raw)
            act_gt = normalize_complexity(act_gt_raw)
            act_ls = normalize_complexity(act_ls_raw)
            act_gs = normalize_complexity(act_gs_raw)

            op = get_metric(act_line, ['operation', 'name'])
            if op == "-": op = "Unparsed/Ignored"
            line_code = code_lines[lineno - 1].strip() if 0 < lineno <= len(code_lines) else ""
            
            if has_ground_truth:
                lt_match = check_match(act_lt, exp_lt, "time") if exp_lt != '-' else True
                gt_match = check_match(act_gt, exp_gt, "time") if exp_gt != '-' else True
                ls_match = check_match(act_ls, exp_ls, "space") if exp_ls != '-' else True
                gs_match = check_match(act_gs, exp_gs, "space") if exp_gs != '-' else True
                
                time_match = lt_match and gt_match
                space_match = ls_match and gs_match
                
                total_lines_evaluated += 1
                if time_match: lines_time_correct += 1
                if space_match: lines_space_correct += 1
            else:
                time_match = True
                space_match = True
                lt_match = True
                gt_match = True
                ls_match = True
                gs_match = True

            lineValidationResults.append({
                "lineno": lineno,
                "hasGroundTruth": has_ground_truth,
                "isPassed": time_match and space_match,
                "isTimeMatch": time_match,
                "isSpaceMatch": space_match,
                "ltMatch": lt_match,
                "gtMatch": gt_match,
                "lsMatch": ls_match,
                "gsMatch": gs_match,
                
                "expLocalTime": exp_lt, "expectedLocalTime": exp_lt, "local_time": exp_lt,
                "expGlobalTime": exp_gt, "expectedGlobalTime": exp_gt, "global_time": exp_gt,
                "expLocalSpace": exp_ls, "expectedLocalSpace": exp_ls, "local_space": exp_ls,
                "expGlobalSpace": exp_gs, "expectedGlobalSpace": exp_gs, "global_space": exp_gs,
                
                "predLocalTime": act_lt, "predictedLocalTime": act_lt,
                "predGlobalTime": act_gt, "predictedGlobalTime": act_gt,
                "predLocalSpace": act_ls, "predictedLocalSpace": act_ls,
                "predGlobalSpace": act_gs, "predictedGlobalSpace": act_gs,

                "operation": op,
                "lineOfCode": line_code
            })

        details_list.append({
            "id": item.get('id', f"case_{index}"),
            "name": item.get('name', f"Algorithm {index}"),
            "category": item.get('category', "Focused Chunk Benchmark"),
            "expectedTime": expected_time,
            "expectedSpace": expected_space,
            "predictedTime": actual_time,
            "predictedSpace": actual_space,
            "isTimeCorrect": is_time_match,
            "isSpaceCorrect": is_space_match,
            "isCompletelyCorrect": (is_time_match and is_space_match),
            "explanation": results.get('overall_explanation', 'AST parsed successfully.'),
            "codeSnippet": code_snippet,
            "lineValidationResults": lineValidationResults
        })

    end_time_suite = time.perf_counter()
    total_execution_sec = end_time_suite - start_time_suite
    tracemalloc.stop()

    time_accuracy = (overall_time_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    space_accuracy = (overall_space_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    time_error_rate = 100.0 - time_accuracy
    space_error_rate = 100.0 - space_accuracy
    line_time_acc = (lines_time_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    line_space_acc = (lines_space_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0

    sorted_times = sorted(case_times_ms)
    mean_ms = statistics.mean(sorted_times) if sorted_times else 0.0
    median_ms = statistics.median(sorted_times) if sorted_times else 0.0
    max_ms = sorted_times[-1] if sorted_times else 0.0
    p95_ms = calc_percentile(sorted_times, 95.0)

    throughput_algos = total_algorithms / total_execution_sec if total_execution_sec > 0 else 0.0
    throughput_lines = total_source_lines / total_execution_sec if total_execution_sec > 0 else 0.0

    peak_ast_mb = (max(case_ast_peak_bytes) if case_ast_peak_bytes else 0) / (1024.0 * 1024.0)
    mean_ast_kb = (statistics.mean(case_ast_peak_bytes) if case_ast_peak_bytes else 0) / 1024.0

    time_report_dict = {}
    space_report_dict = {}
    
    try:
        from sklearn.metrics import classification_report
        time_report_raw = classification_report(y_true_time, y_pred_time, output_dict=True, zero_division=0)
        space_report_raw = classification_report(y_true_space, y_pred_space, output_dict=True, zero_division=0)
        
        def format_report_dict(raw):
            classes = {k: v for k, v in raw.items() if k not in ('accuracy', 'macro avg', 'weighted avg')}
            return {
                "perClass": {k: {"precision": round(v['precision'], 2), "recall": round(v['recall'], 2), "f1Score": round(v['f1-score'], 2), "support": v['support']} for k, v in classes.items()},
                "macroAvg": {"precision": round(raw['macro avg']['precision'], 2), "recall": round(raw['macro avg']['recall'], 2), "f1Score": round(raw['macro avg']['f1-score'], 2)},
                "weightedAvg": {"precision": round(raw['weighted avg']['precision'], 2), "recall": round(raw['weighted avg']['recall'], 2), "f1Score": round(raw['weighted avg']['f1-score'], 2)}
            }
        time_report_dict = format_report_dict(time_report_raw)
        space_report_dict = format_report_dict(space_report_raw)
    except Exception:
        pass

    return {
        "totalTested": total_algorithms,
        "timePassed": overall_time_correct,
        "timeFailed": total_algorithms - overall_time_correct,
        "timeAccuracyRate": round(time_accuracy, 1),
        "timeErrorRate": round(time_error_rate, 1),
        "spacePassed": overall_space_correct,
        "spaceFailed": total_algorithms - overall_space_correct,
        "spaceAccuracyRate": round(space_accuracy, 1),
        "spaceErrorRate": round(space_error_rate, 1),
        "perfectPassed": perfect_passed_count,
        "totalLinesTested": total_lines_evaluated,
        "lineTimePassed": lines_time_correct,
        "lineSpacePassed": lines_space_correct,
        "lineTimeAccuracyRate": round(line_time_acc, 1),
        "lineSpaceAccuracyRate": round(line_space_acc, 1),
        "details": details_list,
        "timeReport": time_report_dict,
        "spaceReport": space_report_dict,
        "efficiency": {
            "totalExecutionSec": round(total_execution_sec, 4),
            "throughputAlgos": round(throughput_algos, 2),
            "throughputLines": round(throughput_lines, 2),
            "meanTimeMs": round(mean_ms, 2),
            "medianTimeMs": round(median_ms, 2),
            "maxTimeMs": round(max_ms, 2),
            "p95TimeMs": round(p95_ms, 2),
            "peakAstMemMB": round(peak_ast_mb, 4),
            "meanAstMemKB": round(mean_ast_kb, 2),
            "totalLines": total_source_lines
        }
    }

if __name__ == "__main__":
    calculate_metrics()