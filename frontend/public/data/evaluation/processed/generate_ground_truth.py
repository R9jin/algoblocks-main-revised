import csv
import re
import json
import math
import random
from collections import defaultdict

# --- CONFIGURATION ---
INPUT_CSV = 'algo_blocks_dataset.csv'
MARGIN_OF_ERROR = 0.05  # 5% margin of error for Slovin's formula
CHUNK_SIZE = 10         # Number of algorithms per JSON file

def normalize_complexity(c):
    """Converts raw dataset terms into standard Big-O notation."""
    c = c.lower().strip().replace('"', '').replace(',', '')
    mapping = {
        '1': 'O(1)', 'constant': 'O(1)', 'o(1)': 'O(1)',
        'n': 'O(n)', 'linear': 'O(n)', 'o(n)': 'O(n)',
        'n^2': 'O(n^2)', 'quadratic': 'O(n^2)',
        'n^3': 'O(n^3)', 'cubic': 'O(n^3)',
        'logn': 'O(log n)', 'logarithmic': 'O(log n)',
        'nlogn': 'O(n log n)', 'linearithmic': 'O(n log n)',
        '2^n': 'O(2^n)', 'exponential': 'O(2^n)',
        'sqrtn': 'O(sqrt(n))', 'n^4': 'O(n^4)'
    }
    return mapping.get(c, None) # Returns None if unrecognized

def main():
    algorithms = []
    
    # Regex to catch the complexities at the end of the code block.
    # It looks for: a comma, word1, a comma, word2, followed by optional garbage characters at the very end.
    pattern = re.compile(r',([a-zA-Z0-9\^]+),([a-zA-Z0-9\^]+)[,"\'\s]*$')

    print("1. Parsing CSV and extracting complexities...")
    with open(INPUT_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        for i, row in enumerate(reader):
            if not row: continue
            
            code_text = row[0].strip()
            
            # Attempt to extract using Regex
            match = pattern.search(code_text)
            
            sc_raw, tc_raw = None, None
            clean_code = code_text
            
            if match:
                sc_raw = match.group(1)
                tc_raw = match.group(2)
                # Clean up code text by removing the complexities from the actual code string
                clean_code = pattern.sub('', code_text).strip()
            else:
                # Fallback: check the last line
                last_line = code_text.split('\n')[-1]
                parts = last_line.split(',')
                if len(parts) >= 3:
                    sc_raw = parts[-2].strip()
                    tc_raw = parts[-1].strip()
            
            if sc_raw and tc_raw:
                norm_sc = normalize_complexity(sc_raw)
                norm_tc = normalize_complexity(tc_raw)
                
                # Only keep valid, recognized Big-O notations
                if norm_sc and norm_tc:
                    # Attempt to extract a decent name from the top comment
                    first_line = clean_code.split('\n')[0]
                    name = first_line.replace('#', '').strip() if first_line.startswith('#') else "Algorithm Snippet"
                    
                    algorithms.append({
                        "code": clean_code,
                        "space": norm_sc,
                        "time": norm_tc,
                        "name": name
                    })

    print(f"   -> Successfully parsed {len(algorithms)} well-formed algorithms.")

    print("\n2. Grouping by Two-Way Stratification (Time & Space)...")
    strata = defaultdict(list)
    for algo in algorithms:
        strata[(algo['space'], algo['time'])].append(algo)

    # Calculate Slovin's Target
    N = len(algorithms)
    n_target = math.ceil(N / (1 + N * (MARGIN_OF_ERROR ** 2)))
    print(f"   -> Total Population (N): {N}")
    print(f"   -> Calculated Sample Size (n): {n_target}")

    print("\n3. Performing Random Stratified Sampling...")
    sampled_algorithms = []
    for (sc, tc), items in strata.items():
        # Calculate proportional representation
        proportion = len(items) / N
        target_allocation = round(proportion * n_target)
        
        # Prevent oversampling in tiny categories
        target_allocation = min(target_allocation, len(items))
        
        # Randomly select the algorithms for this specific Space/Time pair
        sampled = random.sample(items, target_allocation)
        sampled_algorithms.extend(sampled)

    # Shuffle the final deck so the complexities are mixed throughout the JSON files
    random.shuffle(sampled_algorithms)
    print(f"   -> Final Sampled Amount: {len(sampled_algorithms)}")

    print("\n4. Formatting to JSON Schema...")
    final_output = []
    for i, algo in enumerate(sampled_algorithms):
        # Create a clean ID based on time complexity
        tc_clean = algo['time'].replace('O(', '').replace(')', '').replace(' ', '').replace('^', '')
        
        final_output.append({
            "id": f"algo_{tc_clean}_{i+1:03d}",
            "name": algo['name'],
            "code": algo['code'],
            "expected_overall_time": algo['time'],
            "expected_overall_space": algo['space'],
            "line_metrics": []  # Intentionally left blank as requested
        })

    print(f"\n5. Chunking and Saving to Files (Size: {CHUNK_SIZE})...")
    # Helper to chunk the list
    def chunk_list(lst, size):
        for i in range(0, len(lst), size):
            yield lst[i:i + size]

    chunks = list(chunk_list(final_output, CHUNK_SIZE))
    
    for idx, chunk in enumerate(chunks):
        filename = f"ground_truth_chunk_{idx+1:02d}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(chunk, f, indent=2)
        print(f"   -> Saved: {filename} ({len(chunk)} algorithms)")

    print("\nDone! All files successfully generated.")

if __name__ == "__main__":
    main()