import json
import os

# ==========================================
# DIRECTORY CONFIGURATION
# ==========================================
INPUT_FILE_PATH = r"D:\ROGINNE FILES DONT DELETE\algoblocks-main-revised\evaluation\dataset\python_data.jsonl" 
OUTPUT_DIRECTORY = r"D:\ROGINNE FILES DONT DELETE\algoblocks-main-revised\evaluation\dataset" 
# ==========================================

complexity_map = {
    "constant": "O(1)",
    "linear": "O(n)",
    "quadratic": "O(n^2)",
    "cubic": "O(n^3)",
    "logn": "O(log n)",
    "nlogn": "O(n log n)",
    "np": "O(2^n)"
}

chunk_size = 500
current_chunk = []
file_index = 1
total_processed = 0

print(f"Looking for file at: {INPUT_FILE_PATH}")

# 1. Check if the input file exists
if not os.path.exists(INPUT_FILE_PATH):
    print(f"\nERROR: Could not find the file!")
    print(f"Please make sure python_data.jsonl is actually located inside the 'dataset' folder.")
    exit(1)

# 2. Ensure output directory exists (it should, but just in case)
if not os.path.exists(OUTPUT_DIRECTORY):
    os.makedirs(OUTPUT_DIRECTORY)

print("File found! Starting to process and split...")

# 3. Read and process the file
with open(INPUT_FILE_PATH, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if not line.strip():
            continue
            
        data = json.loads(line)
        
        formatted_item = {
            "id": f"{data.get('problem', 'unknown')}_{i}",
            "name": f"Codeforces Submission {data.get('problem', 'unknown')}",
            "code": data.get("src", ""),
            "expected_overall_time": complexity_map.get(data.get("complexity", ""), "O(1)"),
            "expected_overall_space": "O(1)",  
            "line_metrics": []  
        }
        
        current_chunk.append(formatted_item)
        total_processed += 1
        
        # When we hit 1000 items, save to a new file
        if len(current_chunk) == chunk_size:
            output_filename = os.path.join(OUTPUT_DIRECTORY, f'ground_truth_part_{file_index}.json')
            with open(output_filename, 'w', encoding='utf-8') as out_f:
                json.dump(current_chunk, out_f, indent=2)
            
            print(f"Saved {output_filename} ({len(current_chunk)} items).")
            
            current_chunk = []
            file_index += 1

# 4. Save any leftovers
if current_chunk:
    output_filename = os.path.join(OUTPUT_DIRECTORY, f'ground_truth_part_{file_index}.json')
    with open(output_filename, 'w', encoding='utf-8') as out_f:
        json.dump(current_chunk, out_f, indent=2)
    print(f"Saved {output_filename} ({len(current_chunk)} items).")

print(f"\nSuccess! Processed {total_processed} total submissions into {file_index} files inside your dataset folder.")