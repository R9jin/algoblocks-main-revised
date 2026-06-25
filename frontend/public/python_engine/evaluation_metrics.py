# evaluation/evaluation_metrics.py
import json
import csv
import sys
import os
import time
import glob
import builtins

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
    "O(V)": "O(V + E)"
}

def normalize_complexity(c):
    if not c: return "O(1)"
    c = c.lower().strip().replace(" ", "")
    if c in ("1", "constant"): return "O(1)"
    if c in ("n", "linear"): return "O(n)"
    if c in ("n^2", "quadratic"): return "O(n^2)"
    if c in ("n^3", "cubic"): return "O(n^3)"
    if c in ("nlogn", "n*logn", "log(n)*n", "n log n"): return "O(n log n)"
    if c in ("logn", "log(n)", "log"): return "O(log n)"
    return c if c.startswith("o(") else f"O({c})"

def check_match(actual, expected):
    if actual == expected: return True
    translated_actual = EQUIVALENCE_MAP.get(actual)
    if translated_actual == expected: return True
    if EQUIVALENCE_MAP.get(expected) == actual: return True
    return False

def calculate_metrics():
    dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
    dataset = []
    
    part_files = glob.glob(os.path.join(dataset_dir, 'curated_part_*.json'))
    if not part_files:
        part_files = [os.path.join(dataset_dir, 'ground_truth.json')]
        print("Evaluating default ground_truth.json...\n")
    else:
        print(f"Found {len(part_files)} curated parts. Combining for evaluation...\n")
        
    for file_path in part_files:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                dataset.extend(json.load(f))
            
    # Include the Tasty Processed dataset CSV
    csv_path = os.path.join(dataset_dir, 'processed', 'algo_blocks_dataset.csv')
    if os.path.exists(csv_path):
        print(f"Found Tasty processed dataset CSV at {csv_path}. Adding to evaluation...\n")
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                code_text = row.get('code', '')
                space_comp = row.get('space_complexity', '')
                time_comp = row.get('time_complexity', '')
                
                if space_comp: space_comp = space_comp.strip()
                if time_comp: time_comp = time_comp.strip()

                # --- SALVAGE MANGLED CSV LOGIC ---
                if not space_comp and not time_comp and ',' in code_text:
                    parts = code_text.split(',')
                    if len(parts) >= 3:
                        pos_time = parts[-1].strip().replace('"', '').lower()
                        pos_space = parts[-2].strip().replace('"', '').lower()
                        
                        valids = ['1', 'constant', 'n', 'linear', 'n^2', 'quadratic', 'n^3', 'cubic', 'logn', 'log(n)', 'nlogn', 'n log n', 'n*logn', 'np', 'v+e']
                        if pos_time in valids or pos_time.startswith('o('):
                            time_comp = pos_time
                            space_comp = pos_space
                            code_text = ','.join(parts[:-2])

                dataset.append({
                    "id": f"tasty_csv_{reader.line_num}",
                    "name": f"Tasty Algo {reader.line_num}",
                    "code": code_text,
                    "expected_overall_time": time_comp if time_comp else 'O(1)',
                    "expected_overall_space": space_comp if space_comp else 'O(1)'
                })
        
    total_algorithms = len(dataset)
    if total_algorithms == 0:
        print("Dataset is empty. Exiting.")
        return

    overall_time_correct = 0
    overall_space_correct = 0
    total_lines_evaluated = 0
    lines_time_correct = 0
    lines_space_correct = 0
    total_processing_time = 0
    
    y_true_time = []
    y_pred_time = []
    y_true_space = []
    y_pred_space = []
    
    failures_log = []

    print(f"Starting Independent AST Complexity Evaluation on {total_algorithms} algorithms...\n")

    for index, item in enumerate(dataset, 1):
        code_snippet = item.get('code', '')
        
        expected_time = normalize_complexity(item.get('expected_overall_time', item.get('time_complexity', 'O(1)')))
        expected_space = normalize_complexity(item.get('expected_overall_space', item.get('space_complexity', 'O(1)')))
        
        print(f"[{index}/{total_algorithms}] Analyzing {item.get('id', item.get('name', 'Unknown'))}...", end="", flush=True)
        
        start_time = time.perf_counter()
        results = analyze_source_code(code_snippet)
        end_time = time.perf_counter()
        
        processing_time_ms = (end_time - start_time) * 1000
        total_processing_time += processing_time_ms

        if results.get("status") == "error":
            err_msg = results.get('message', 'Unknown Error')
            print(f" [ERROR] {err_msg}")
            failures_log.append(f"[{item.get('id', 'Unknown')}] ERROR: {err_msg}")
            continue

        print(f" Done ({processing_time_ms:.2f} ms)")
        
        actual_time = results.get("total", "O(1)")
        actual_space = results.get("space_total", "O(1)")
        actual_details = results.get("lines", [])
        
        is_time_match = check_match(actual_time, expected_time)
        is_space_match = check_match(actual_space, expected_space)

        if is_time_match: overall_time_correct += 1
        else: print(f"  -> [Time Mismatch]: Expected {expected_time}, got {actual_time}")
            
        if is_space_match: overall_space_correct += 1
        else: print(f"  -> [Space Mismatch]: Expected {expected_space}, got {actual_space}")
            
        if not is_time_match or not is_space_match:
            failures_log.append(f"[{item.get('id', item.get('name', 'Unknown'))}]\n"
                                f"Time Expected: {expected_time} | Actual: {actual_time}\n"
                                f"Space Expected: {expected_space} | Actual: {actual_space}\n"
                                f"Diagnostic Explanation: {results.get('overall_explanation', 'No explanation provided.')}\n"
                                f"Code Snippet:\n{code_snippet[:300]}...\n{'-'*60}")

        y_true_time.append(expected_time)
        y_pred_time.append(EQUIVALENCE_MAP.get(actual_time, actual_time))
        
        y_true_space.append(expected_space)
        y_pred_space.append(EQUIVALENCE_MAP.get(actual_space, actual_space))
            
        actual_lines_dict = { detail.get('lineno'): detail for detail in actual_details }
        
        for expected_line in item.get('line_metrics', []):
            total_lines_evaluated += 1
            lineno = expected_line['lineno']
            
            if lineno in actual_lines_dict:
                actual_line = actual_lines_dict[lineno]
                actual_local_time = actual_line.get('local_time')
                actual_global_time = actual_line.get('global_time')
                actual_global_space = actual_line.get('global_space', 'O(1)')
                
                if check_match(actual_local_time, expected_line.get('local_time')) and check_match(actual_global_time, expected_line.get('global_time')):
                    lines_time_correct += 1

                expected_line_space = expected_line.get('space', 'O(1)')
                if check_match(actual_global_space, expected_line_space) or check_match(actual_line.get('local_space', 'O(1)'), expected_line_space):
                    lines_space_correct += 1

    time_accuracy = (overall_time_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    space_accuracy = (overall_space_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    
    line_time_acc = (lines_time_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    line_space_acc = (lines_space_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    
    avg_processing_time = total_processing_time / total_algorithms if total_algorithms > 0 else 0
    time_error_rate = 100 - time_accuracy
    space_error_rate = 100 - space_accuracy

    print("\n" + "="*60)
    print("   SOP 2: ALGORITHM STRUCTURAL ACCURACY")
    print("="*60)
    print(f"Total Algorithms Tested   : {total_algorithms}")
    print(f"Total Lines Evaluated     : {total_lines_evaluated}")
    print("-" * 60)
    print(f"1. Time Complexity Detection Acc  : {time_accuracy:.2f}%")
    print(f"2. Space Complexity Detection Acc : {space_accuracy:.2f}%")
    print(f"3. Line-Level Time Class. Acc     : {line_time_acc:.2f}%")
    print(f"4. Line-Level Space Class. Acc    : {line_space_acc:.2f}%")
    print(f"5. Average Processing Time        : {avg_processing_time:.2f} ms")
    print(f"6. Time Error Rate                : {time_error_rate:.2f}%")
    print(f"7. Space Error Rate               : {space_error_rate:.2f}%")
    
    # Write failures log
    log_path = os.path.join(os.path.dirname(__file__), 'evaluation_failures_log.txt')
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write("=== EVALUATION FAILURES LOG ===\n\n")
        if failures_log:
            f.write("\n\n".join(failures_log))
        else:
            f.write("No mismatches found. Perfect accuracy!\n")
    print(f"\nSaved failures log to {log_path}")

    print("\n" + "="*60)
    print("   ADVANCED CLASSIFICATION METRICS (Precision/Recall/F1)")
    print("="*60)
    try:
        from sklearn.metrics import classification_report
        print("--- TIME COMPLEXITY REPORT ---")
        time_report = classification_report(y_true_time, y_pred_time, zero_division=0)
        print(time_report)
        
        print("\n--- SPACE COMPLEXITY REPORT ---")
        space_report = classification_report(y_true_space, y_pred_space, zero_division=0)
        print(space_report)
        
    except ImportError:
        pass
    print("="*60)

if __name__ == "__main__":
    calculate_metrics()