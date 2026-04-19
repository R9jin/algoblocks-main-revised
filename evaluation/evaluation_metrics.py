# evaluation/evaluate_metrics.py
import json
import sys
import os

# Add the analyzer_engine to the path so we can import it
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'analyzer_engine')))
from api.analyzer import analyze_code # Ensure this matches your actual function name

def calculate_accuracy():
    with open('evaluation/dataset/ground_truth.json', 'r') as f:
        dataset = json.load(f)
        
    true_positives = 0
    false_positives = 0
    total = len(dataset)
    
    for item in dataset:
        code_snippet = item['code']
        expected_complexity = item['time_complexity']
        
        # Run your AST algorithm
        result = analyze_code(code_snippet)
        actual_complexity = result.get('time_complexity')
        
        if actual_complexity == expected_complexity:
            true_positives += 1
        else:
            false_positives += 1
            print(f"Mismatch! Expected {expected_complexity}, got {actual_complexity}")
            
    accuracy = (true_positives / total) * 100
    print(f"Total Accuracy: {accuracy}%")
    print(f"True Positives: {true_positives}")
    print(f"False Positives: {false_positives}")

if __name__ == "__main__":
    calculate_accuracy()