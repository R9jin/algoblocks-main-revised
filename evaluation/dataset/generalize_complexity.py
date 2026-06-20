import json
import glob
import re

# The 7 standard buckets we want to map everything back to
STANDARD_BUCKETS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)"]

def generalize_big_o(comp_str):
    if not comp_str:
        return "O(1)"
        
    c = comp_str.replace(" ", "")

    # 1. Constant Time
    if c == "O(1)":
        return "O(1)"

    # 2. Exponential Time (Catch anything with 2^n)
    if "2^n" in c:
        return "O(2^n)"

    # 3. Cubic Time (Catch n^3 or 3-variable multiplications)
    if "n^3" in c or "R*G*B" in c or "n^2*k" in c or "n^2*m" in c or "|rs|^3" in c or "K*n*m" in c or "t*N*K" in c:
        return "O(n^3)"

    # 4. Quadratic Time (Catch n^2 or 2-variable multiplications)
    if "n^2" in c or "n*m" in c or "n*k" in c or "s*l" in c or "M^2" in c or "VAL^2" in c or "nsqrtn" in c or "a*sqrt(a)" in c or "N*L" in c or "|s1|*|s2|" in c:
        return "O(n^2)"

    # 5. Log-Linear Time (Catch n log n variations)
    if "nlog" in c or "q*log" in c or "t*log" in c or "slogs" in c or "RlogR" in c or "GlogG" in c or "BlogB" in c or "VALlog" in c:
        return "O(n log n)"

    # 6. Logarithmic Time (Catch log or sqrt without a leading n)
    if "log" in c or "sqrt" in c:
        return "O(log n)"

    # 7. Linear Time (Catch anything else that has variables left over, e.g., O(n), O(q), O(MAX_VAL), O(|b|))
    # If it didn't hit the above filters but isn't O(1), it collapses to O(n)
    return "O(n)"

def process_datasets():
    files = glob.glob('curated_part_*.json')
    
    if not files:
        print("No curated_part_*.json files found!")
        return

    for file in files:
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for item in data:
            # Generalize overall metrics
            item['expected_overall_time'] = generalize_big_o(item.get('expected_overall_time', 'O(1)'))
            item['expected_overall_space'] = generalize_big_o(item.get('expected_overall_space', 'O(1)'))
            
            # Generalize line-by-line metrics
            if 'line_metrics' in item:
                for metric in item['line_metrics']:
                    metric['local_time'] = generalize_big_o(metric.get('local_time', 'O(1)'))
                    metric['global_time'] = generalize_big_o(metric.get('global_time', 'O(1)'))
                    metric['space'] = generalize_big_o(metric.get('space', 'O(1)'))

        # Save the generalized data back to the file
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print(f"Successfully generalized metrics in {file}")

if __name__ == "__main__":
    process_datasets()
    print("\nAll datasets have been successfully mapped to the 7 standard baseline complexities!")