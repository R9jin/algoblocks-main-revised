# evaluation/evaluation_metrics.py
import json
import sys
import os
import time
import glob
import builtins
import csv
import io
import contextlib

# Add project root to Python path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(root_dir)
sys.path.append(os.path.join(root_dir, 'api')) 

from api.analyzer import analyze_source_code

# --- PREVENT HANGING ON INPUT() (DEFERRED) ---
class MockBuffer:
    def readline(self): return b"1 2 3 4 5 6 7 8 9 10\n"
    def read(self): return b"1 2 3 4 5 6 7 8 9 10\n"

class MockStdin:
    def __init__(self): self.buffer = MockBuffer()
    def readline(self): return "1 2 3 4 5 6 7 8 9 10\n"
    def read(self): return "1 2 3 4 5 6 7 8 9 10\n"
    def __iter__(self): yield "1 2 3 4 5 6 7 8 9 10\n"

def activate_mock_inputs():
    """Activates terminal input blocking AFTER the user selects a menu option."""
    sys.stdin = MockStdin()
    builtins.input = lambda *args, **kwargs: "1 2 3 4 5 6 7 8 9 10"


# --- THE ACADEMIC EQUIVALENCE MAP ---
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

def check_match(actual, expected):
    """Checks if the parsed Big-O matches the expert ground truth."""
    if not actual and not expected:
        return False # Prevent blank vs blank false positives
    if actual == expected:
        return True
    if EQUIVALENCE_MAP.get(actual) == expected:
        return True
    if EQUIVALENCE_MAP.get(expected) == actual:
        return True
    return False

def translate_for_sklearn(value):
    """Translates to standard Big-O for strictly aligned Scikit-Learn matrices."""
    return EQUIVALENCE_MAP.get(value, value)


def get_target_files():
    """Displays menu and returns the list of selected file paths."""
    dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
    processed_dir = os.path.join(dataset_dir, 'processed')
    
    options = {
        "1": [os.path.join(dataset_dir, 'ground_truth.json')],
        "2": [os.path.join(dataset_dir, 'curated_part_1.json')],
        "3": [os.path.join(dataset_dir, 'curated_part_2.json')],
        "4": [os.path.join(dataset_dir, 'curated_part_3.json')],
        "5": [os.path.join(dataset_dir, 'curated_part_4.json')],
        "6": [os.path.join(dataset_dir, 'curated_part_5.json')],
        "7": [os.path.join(processed_dir, 'algo_blocks_dataset.csv')],
    }
    
    all_files = []
    for file_list in options.values():
        all_files.extend(file_list)
    options["8"] = all_files

    print("\n" + "="*60)
    print(" 🧪 ALGOBLOCKS GLASS-BOX EVALUATION SUITE")
    print("="*60)
    print("  [1] ground_truth.json")
    print("  [2] curated_part_1.json")
    print("  [3] curated_part_2.json")
    print("  [4] curated_part_3.json")
    print("  [5] curated_part_4.json")
    print("  [6] curated_part_5.json")
    print("  [7] algo_blocks_dataset.csv (TASTY ML Benchmark)")
    print("  [8] RUN ALL DATASETS")
    print("  [0] Exit")
    print("="*60)
    
    choice = input("\nSelect dataset to evaluate (0-8): ").strip()
    
    if choice == "0":
        print("Exiting evaluation...")
        sys.exit(0)
        
    return options.get(choice, [])


def load_dataset(file_paths):
    dataset = []
    for file_path in file_paths:
        if not os.path.exists(file_path):
            print(f" [WARNING] File not found: {os.path.basename(file_path)}")
            continue
            
        try:
            if file_path.endswith('.json'):
                with open(file_path, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                    dataset.extend(file_data)
                    print(f" -> Loaded {len(file_data)} cases from {os.path.basename(file_path)}")
                    
            elif file_path.endswith('.csv'):
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    row_count = 0
                    for i, row in enumerate(reader):
                        dataset.append({
                            'id': f"CSV_Row_{i+1}",
                            'code': row['code'],
                            'expected_overall_time': row['time_complexity'],
                            'expected_overall_space': row['space_complexity'],
                            'line_metrics': [] 
                        })
                        row_count += 1
                    print(f" -> Loaded {row_count} cases from {os.path.basename(file_path)}")
                    
        except Exception as e:
            print(f" [ERROR] Failed to load {os.path.basename(file_path)}: {str(e)}")
            
    return dataset


def calculate_metrics():
    eval_files = get_target_files()
    
    if not eval_files:
        print("\nInvalid choice or no files found. Exiting.")
        return

    print("\nLoading dataset...")
    dataset = load_dataset(eval_files)
        
    total_algorithms = len(dataset)
    if total_algorithms == 0:
        print("\nCombined dataset is empty. Exiting.")
        return

    activate_mock_inputs()
    print("\n🚀 Starting Analysis...")
    print("-" * 60)

    total_lines_evaluated = 0
    correct_time = 0
    correct_space = 0
    correct_line_time = 0
    correct_line_space = 0
    
    y_true_time = []
    y_pred_time = []
    y_true_space = []
    y_pred_space = []

    start_time = time.time()
    
    for item in dataset:
        source_code = item.get('code', "")
        expected_time = item.get('expected_overall_time', '')
        expected_space = item.get('expected_overall_space', '')
        
        try:
            # ---> FIX: Silences the noisy print() outputs from the datasets <---
            suppress_text = io.StringIO()
            with contextlib.redirect_stdout(suppress_text):
                result = analyze_source_code(source_code)
                
            actual_time = result.get('overall_time_complexity', '')
            actual_space = result.get('overall_space_complexity', '')
            
            is_time_correct = check_match(actual_time, expected_time)
            is_space_correct = check_match(actual_space, expected_space)
            
            # --- Overall Complexity Checks & Logging ---
            if is_time_correct and is_space_correct:
                print(f"[PASS] {item['id']} | Time: {expected_time} | Space: {expected_space}")
            else:
                print(f"[FAIL] {item['id']}")
                if not is_time_correct:
                    print(f"       [Time]  Expected: {expected_time} | Actual: {actual_time}")
                if not is_space_correct:
                    print(f"       [Space] Expected: {expected_space} | Actual: {actual_space}")
            
            # Scikit-learn trackers
            if is_time_correct:
                correct_time += 1
                y_pred_time.append(translate_for_sklearn(expected_time)) 
            else:
                y_pred_time.append(translate_for_sklearn(actual_time))
            y_true_time.append(translate_for_sklearn(expected_time))
            
            if is_space_correct:
                correct_space += 1
                y_pred_space.append(translate_for_sklearn(expected_space))
            else:
                y_pred_space.append(translate_for_sklearn(actual_space))
            y_true_space.append(translate_for_sklearn(expected_space))
                
            # --- Line Level Complexity Checks ---
            if item.get('line_metrics'):
                expected_lines = item['line_metrics']
                parsed_lines = result.get('line_details', [])
                
                for expected_line in expected_lines:
                    line_no = expected_line['line']
                    total_lines_evaluated += 1
                    
                    matched_line = next((ln for ln in parsed_lines if ln['line'] == line_no), None)
                    if matched_line:
                        if check_match(matched_line.get('time_complexity', ''), expected_line.get('time', '')):
                            correct_line_time += 1
                        if check_match(matched_line.get('space_complexity', ''), expected_line.get('space', '')):
                            correct_line_space += 1

        except Exception as e:
            print(f"[ERROR] {item.get('id', 'Unknown')} crashed the analyzer: {e}")
            
            y_true_time.append(translate_for_sklearn(expected_time))
            y_pred_time.append("ERROR")
            y_true_space.append(translate_for_sklearn(expected_space))
            y_pred_space.append("ERROR")
            continue
            
    execution_time = time.time() - start_time
    
    # Calculate Final Metric Percentages
    time_accuracy = (correct_time / total_algorithms) * 100 if total_algorithms > 0 else 0
    space_accuracy = (correct_space / total_algorithms) * 100 if total_algorithms > 0 else 0
    time_error_rate = 100 - time_accuracy
    space_error_rate = 100 - space_accuracy
    
    line_time_acc = (correct_line_time / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    line_space_acc = (correct_line_space / total_lines_evaluated) * 100 if total_lines_evaluated > 0 else 0
    
    avg_processing_time = (execution_time / total_algorithms) * 1000 if total_algorithms > 0 else 0

    # Print Results
    print("\n" + "="*60)
    print(" 📊 ALGOBLOCKS PERFORMANCE METRICS")
    print("="*60)
    print(f"Total Algorithms Tested   : {total_algorithms}")
    
    if total_lines_evaluated > 0:
        print(f"Total Lines Evaluated     : {total_lines_evaluated}")
    else:
        print(f"Total Lines Evaluated     : 0 (CSV Datasets contain no line data)")
        
    print("-" * 60)
    print(f"1. Time Complexity Detection Acc  : {time_accuracy:.2f}%")
    print(f"2. Space Complexity Detection Acc : {space_accuracy:.2f}%")
    
    if total_lines_evaluated > 0:
        print(f"3. Line-Level Time Class. Acc     : {line_time_acc:.2f}%")
        print(f"4. Line-Level Space Class. Acc    : {line_space_acc:.2f}%")
    else:
        print(f"3. Line-Level Time Class. Acc     : N/A")
        print(f"4. Line-Level Space Class. Acc    : N/A")
        
    print(f"5. Average Processing Time        : {avg_processing_time:.2f} ms")
    print(f"6. Time Error Rate                : {time_error_rate:.2f}%")
    print(f"7. Space Error Rate               : {space_error_rate:.2f}%")
    
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
        print("❌ Scikit-learn is not installed.")

if __name__ == "__main__":
    calculate_metrics()