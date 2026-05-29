# evaluation/evaluation_metrics.py
import json
import sys
import os
import time

# 1. Fix the import path so Python can find your 'api' folder
# This points sys.path to the root directory of your repository
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import your actual analyzer class
from api.analyzer import ComplexityAnalyzer

def calculate_metrics():
    # Load the custom Ground Truth dataset
    dataset_path = os.path.join(os.path.dirname(__file__), 'dataset', 'ground_truth.json')
    with open(dataset_path, 'r') as f:
        dataset = json.load(f)
        
    total_algorithms = len(dataset)
    overall_correct = 0
    
    total_lines_evaluated = 0
    lines_correct = 0
    
    total_processing_time = 0
    
    print("Starting AST Complexity Evaluation...")

    for item in dataset:
        code_snippet = item['code']
        expected_overall_time = item['expected_overall_time']
        
        # --- START TIMING ---
        start_time = time.perf_counter()
        
        # Run your AST algorithm
        # Note: Adjust the method calls here if your analyzer uses a different execution function
        analyzer = ComplexityAnalyzer(code_snippet)
        
        # --- STOP TIMING ---
        end_time = time.perf_counter()
        
        # Calculate processing time in milliseconds (ms)
        processing_time_ms = (end_time - start_time) * 1000
        total_processing_time += processing_time_ms
        
        # Format the actual results from your analyzer
        # (Replace ._details or .max_poly_str with your actual getter methods if they are different)
        actual_overall_time = analyzer.max_poly_str if hasattr(analyzer, 'max_poly_str') else "O(1)"
        actual_details = analyzer._details if hasattr(analyzer, '_details') else []
        
        # 1. Validate Overall Complexity (Detection Accuracy)
        if actual_overall_time == expected_overall_time:
            overall_correct += 1
        else:
            print(f"[Mismatch] {item['name']}: Expected {expected_overall_time}, got {actual_overall_time}")
            
        # 2. Validate Line-Level Complexity (Local & Global)
        # Convert the analyzer's output list to a dictionary keyed by line number for easy checking
        actual_lines_dict = { detail.get('lineno'): detail for detail in actual_details }
        
        for expected_line in item.get('line_metrics', []):
            total_lines_evaluated += 1
            lineno = expected_line['lineno']
            
            if lineno in actual_lines_dict:
                actual_line = actual_lines_dict[lineno]
                # Check if both local and global time match the ground truth
                if (actual_line.get('local_time') == expected_line['local_time'] and 
                    actual_line.get('global_time') == expected_line['global_time']):
                    lines_correct += 1
            else:
                pass # The analyzer missed this line entirely

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