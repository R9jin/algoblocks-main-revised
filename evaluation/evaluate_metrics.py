# evaluation/evaluation_metrics.py
import json
import sys
import os
import time

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(root_dir)
sys.path.append(os.path.join(root_dir, 'api')) 

from api.analyzer import analyze_source_code

# --- THE ACADEMIC EQUIVALENCE MAP ---
# This allows the independent ground truth to remain in standard Big-O notation,
# while allowing the analyzer to output precise mathematical recurrence relations.
EQUIVALENCE_MAP = {
    # Recursion Equivalencies
    "T(n) = T(n/2) + O(1)": "O(log n)",
    "T(n) = 2T(n/2) + O(n)": "O(n log n)",
    "T(n) = T(n-1) + O(1)": "O(n)",
    "T(n) = T(n-1) + O(n)": "O(n^2)",
    "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
    
    # Structural Equivalencies (where standard theory assumes n=m)
    "O(n * m)": "O(n^2)",
    "O(n^2 * m)": "O(n^3)",
    
    # Amortized Equivalencies
    "O(1) amortized": "O(1)"
}

def check_match(actual, expected):
    """Checks if actual matches expected, factoring in mathematical equivalence."""
    if actual == expected:
        return True
    
    # Check if the actual output translates to the expected standard Big-O
    translated_actual = EQUIVALENCE_MAP.get(actual)
    if translated_actual == expected:
        return True
        
    return False

def calculate_metrics():
    dataset_path = os.path.join(os.path.dirname(__file__), 'dataset', 'ground_truth.json')
    with open(dataset_path, 'r', encoding='utf-8') as f:
        dataset = json.load(f)
        
    total_algorithms = len(dataset)
    overall_correct = 0
    total_lines_evaluated = 0
    lines_correct = 0
    total_processing_time = 0
    
    print("Starting Independent AST Complexity Evaluation...\n")

    for item in dataset:
        code_snippet = item['code']
        expected_overall_time = item['expected_overall_time']
        
        start_time = time.perf_counter()
        results = analyze_source_code(code_snippet)
        end_time = time.perf_counter()
        
        if results.get("status") == "error":
            continue

        processing_time_ms = (end_time - start_time) * 1000
        total_processing_time += processing_time_ms
        
        actual_overall_time = results.get("total", "O(1)")
        actual_details = results.get("lines", [])
        
        # 1. Validate Overall Complexity
        if check_match(actual_overall_time, expected_overall_time):
            overall_correct += 1
        else:
            print(f"[Overall Mismatch] {item['name']}: Expected {expected_overall_time}, got {actual_overall_time}")
            
        # 2. Validate Line-Level Complexity
        actual_lines_dict = { detail.get('lineno'): detail for detail in actual_details }
        
        for expected_line in item.get('line_metrics', []):
            total_lines_evaluated += 1
            lineno = expected_line['lineno']
            
            if lineno in actual_lines_dict:
                actual_line = actual_lines_dict[lineno]
                actual_local = actual_line.get('local_time')
                actual_global = actual_line.get('global_time')
                
                if check_match(actual_local, expected_line['local_time']) and check_match(actual_global, expected_line['global_time']):
                    lines_correct += 1
                else:
                    print(f"  -> [Line {lineno} Mismatch] {item['name']}:")
                    print(f"     Expected: Local {expected_line['local_time']}, Global {expected_line['global_time']}")
                    print(f"     Got     : Local {actual_local}, Global {actual_global}")

    # --- CALCULATE SOP 2 METRICS ---
    overall_accuracy = (overall_correct / total_algorithms) * 100
    line_accuracy = (lines_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    avg_processing_time = total_processing_time / total_algorithms
    error_rate = 100 - overall_accuracy

    # --- PRINT FINAL REPORT ---
    print("\n" + "="*50)
    print("   SOP 2: ALGORITHM STRUCTURAL ACCURACY")
    print("="*50)
    print(f"Total Algorithms Tested   : {total_algorithms}")
    print(f"Total Lines Evaluated     : {total_lines_evaluated}")
    print("-" * 50)
    print(f"1. Complexity Detection Accuracy : {overall_accuracy:.2f}%")
    print(f"2. Line-Level Classification Acc : {line_accuracy:.2f}%")
    print(f"3. Average Processing Time       : {avg_processing_time:.2f} ms")
    print(f"4. Error Rate                    : {error_rate:.2f}%")
    print("="*50)

if __name__ == "__main__":
    calculate_metrics()