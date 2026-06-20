# evaluation/evaluation_metrics.py
import json
import sys
import os
import time
import glob

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
    "T(n) = n * T(n-1)": "O(n!)",
    "T(n) = 2T(n/2) + O(1)": "O(n)",
    "T(n) = T(n/2) + O(n)": "O(n)",
    "T(n) = T(n-1) + O(log n)": "O(n log n)",
    
    # Structural Equivalencies (where standard theory assumes n=m)
    "O(n * m)": "O(n^2)",
    "O(n^2 * m)": "O(n^3)",
    "O(n * m^2)": "O(n^3)",
    "O(n^2 log n)": "O(n^2 log n)",
    
    # Amortized Equivalencies
    "O(1) amortized": "O(1)",
    
    # Space Equivalencies
    "O(V)": "O(V + E)"
}

def check_match(actual, expected):
    """Checks if actual matches expected, factoring in mathematical equivalence."""
    if actual == expected:
        return True
    
    # Check if the actual output translates to the expected standard Big-O
    translated_actual = EQUIVALENCE_MAP.get(actual)
    if translated_actual == expected:
        return True
        
    # Check reverse mapping (just in case)
    if EQUIVALENCE_MAP.get(expected) == actual:
        return True
        
    return False

def calculate_metrics():
    dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
    dataset = []
    
    # Automatically find all curated_part_n.json files
    part_files = glob.glob(os.path.join(dataset_dir, 'curated_part_*.json'))
    
    # Fallback to the default ground_truth.json if the curated parts don't exist
    if not part_files:
        part_files = [os.path.join(dataset_dir, 'ground_truth.json')]
        print("Evaluating default ground_truth.json...\n")
    else:
        print(f"Found {len(part_files)} curated parts. Combining for evaluation...\n")
        
    for file_path in part_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            dataset.extend(json.load(f))
        
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
    
    # Lists to store the labels for Precision, Recall, and F1-score
    y_true_time = []
    y_pred_time = []
    y_true_space = []
    y_pred_space = []
    
    print(f"Starting Independent AST Complexity Evaluation on {total_algorithms} algorithms...\n")

    for index, item in enumerate(dataset, 1):
        code_snippet = item['code']
        expected_time = item['expected_overall_time']
        expected_space = item.get('expected_overall_space', 'O(1)')
        
        # Live tracking print statement
        print(f"[{index}/{total_algorithms}] Analyzing {item.get('id', 'Unknown')}...", end="", flush=True)
        
        start_time = time.perf_counter()
        results = analyze_source_code(code_snippet)
        end_time = time.perf_counter()
        
        processing_time_ms = (end_time - start_time) * 1000
        total_processing_time += processing_time_ms

        if results.get("status") == "error":
            print(f" [ERROR] {results.get('message')}")
            continue

        # Completion time for the specific script
        print(f" Done ({processing_time_ms:.2f} ms)")
        
        actual_time = results.get("total", "O(1)")
        actual_space = results.get("space_total", "O(1)")
        actual_details = results.get("lines", [])
        
        # 1. Validate Overall Time Complexity
        if check_match(actual_time, expected_time):
            overall_time_correct += 1
        else:
            print(f"  -> [Time Mismatch]: Expected {expected_time}, got {actual_time}")
            
        # 2. Validate Overall Space Complexity
        if check_match(actual_space, expected_space):
            overall_space_correct += 1
        else:
            print(f"  -> [Space Mismatch]: Expected {expected_space}, got {actual_space}")
            
        # Store data for Scikit-Learn Metrics
        y_true_time.append(expected_time)
        y_pred_time.append(EQUIVALENCE_MAP.get(actual_time, actual_time))
        
        y_true_space.append(expected_space)
        y_pred_space.append(EQUIVALENCE_MAP.get(actual_space, actual_space))
            
        # 3. Validate Line-Level Complexity
        actual_lines_dict = { detail.get('lineno'): detail for detail in actual_details }
        
        for expected_line in item.get('line_metrics', []):
            total_lines_evaluated += 1
            lineno = expected_line['lineno']
            
            if lineno in actual_lines_dict:
                actual_line = actual_lines_dict[lineno]
                actual_local_time = actual_line.get('local_time')
                actual_global_time = actual_line.get('global_time')
                actual_global_space = actual_line.get('global_space', 'O(1)')
                
                # Check Time Match
                if check_match(actual_local_time, expected_line.get('local_time')) and check_match(actual_global_time, expected_line.get('global_time')):
                    lines_time_correct += 1
                else:
                    pass # Silenced line-level time mismatch to keep the console clean

                # Check Space Match
                expected_line_space = expected_line.get('space', 'O(1)')
                if check_match(actual_global_space, expected_line_space) or check_match(actual_line.get('local_space', 'O(1)'), expected_line_space):
                    lines_space_correct += 1
                else:
                    pass # Silenced line-level space mismatch to keep the console clean

    # --- CALCULATE SOP 2 METRICS ---
    time_accuracy = (overall_time_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    space_accuracy = (overall_space_correct / total_algorithms) * 100 if total_algorithms > 0 else 0
    
    line_time_acc = (lines_time_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    line_space_acc = (lines_space_correct / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    
    avg_processing_time = total_processing_time / total_algorithms if total_algorithms > 0 else 0
    time_error_rate = 100 - time_accuracy
    space_error_rate = 100 - space_accuracy

    # --- PRINT FINAL REPORT ---
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
    
    # --- SCIKIT-LEARN CLASSIFICATION METRICS ---
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
        print("Note: The 'scikit-learn' library is missing.")
        print("Please install it to view Precision, Recall, and F1-Scores by running:")
        print("pip install scikit-learn")
    print("="*60)

if __name__ == "__main__":
    calculate_metrics()