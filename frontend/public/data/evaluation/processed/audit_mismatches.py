import csv
from analyzer import analyze_source_code

def generate_audit_report(csv_path, output_md):
    # The specific complexities we are highly suspicious of
    target_complexities = {"O(np)", "O(v)", "O(V + E)", "O(m)", "O(n^2logn)", "O(n * m)", "O(n * n!)", "O(2^n)", "O(3^n)"}
    
    audit_cases = []
    
    print(f"Scanning {csv_path} for target discrepancies...")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader):
            expected_time = str(row.get('time_complexity', '')).strip()
            expected_space = str(row.get('space_complexity', '')).strip()
            code = row.get('code', '')
            
            # Only audit if the EXPECTED complexity is one of our low-accuracy targets
            if expected_time in target_complexities or expected_space in target_complexities:
                try:
                    result = analyze_source_code(code)
                    actual_time = result.get('total', 'Error')
                    actual_space = result.get('space_total', 'Error')
                    
                    if expected_time != actual_time or expected_space != actual_space:
                        audit_cases.append({
                            'row': row_idx + 1,
                            'expected_time': expected_time,
                            'actual_time': actual_time,
                            'expected_space': expected_space,
                            'actual_space': actual_space,
                            'code': code
                        })
                except Exception as e:
                    pass

    # Write the report
    with open(output_md, 'w', encoding='utf-8') as f:
        f.write("# Manual Review Audit Report\n\n")
        f.write("Review these specific algorithms to determine if the Dataset is wrong, or if `analyzer.py` is wrong.\n\n")
        
        for case in audit_cases:
            f.write(f"## Row {case['row']}\n")
            f.write(f"- **Time:** Expected `{case['expected_time']}` | Analyzer Got `{case['actual_time']}`\n")
            f.write(f"- **Space:** Expected `{case['expected_space']}` | Analyzer Got `{case['actual_space']}`\n\n")
            f.write("```python\n")
            f.write(case['code'].strip() + "\n")
            f.write("```\n\n")
            f.write("---\n\n")

    print(f"Found {len(audit_cases)} critical mismatches. Report saved to {output_md}")

if __name__ == "__main__":
    generate_audit_report("algo_blocks_dataset.csv", "Manual_Review_Audit.md")