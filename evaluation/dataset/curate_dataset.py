import json
import os
import glob

# ==========================================
# CURATION CONFIGURATION
# ==========================================
SAMPLES_PER_COMPLEXITY = 15  # Adjust this to get more/less data (e.g., 15 * 7 classes = ~105 total scripts)
MAX_LINES_OF_CODE = 60       # Skips massive competitive programming boilerplates
MIN_LINES_OF_CODE = 4        # Skips trivial 1-liners

# NEW FILTERS TO CLEAN GARBAGE DATA
MAX_NON_ASCII = 20           # Skips files with too many non-ASCII chars (e.g., Chinese character spam)
MAX_LINE_LENGTH = 150        # Skips files with insanely long lines (hardcoded payloads/obfuscation)
# ==========================================

def get_base_problem_id(submission_id):
    # Converts "1036_B_500" -> "1036_B" to ensure we only get unique problems
    parts = submission_id.split('_')
    if len(parts) >= 2:
        return f"{parts[0]}_{parts[1]}"
    return submission_id

def curate_dataset():
    # Find all the split JSON files in the current directory
    input_files = glob.glob('ground_truth_part_*.json')
    
    if not input_files:
        print("No ground_truth_part files found in this directory.")
        return

    # Track how many we have collected per complexity class
    complexity_counts = {
        "O(1)": 0, "O(n)": 0, "O(n^2)": 0, "O(n^3)": 0, 
        "O(log n)": 0, "O(n log n)": 0, "O(2^n)": 0
    }
    
    seen_problems = set()
    curated_dataset = []
    
    for file in input_files:
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            for item in data:
                comp = item.get('expected_overall_time')
                code = item.get('code', '')
                base_prob_id = get_base_problem_id(item['id'])
                
                # Filter 1: Does this complexity class exist in our tracker?
                if comp not in complexity_counts:
                    continue
                    
                # Filter 2: Do we already have enough of this complexity?
                if complexity_counts[comp] >= SAMPLES_PER_COMPLEXITY:
                    continue
                    
                # Filter 3: Have we already included a submission for this specific problem?
                if base_prob_id in seen_problems:
                    continue
                    
                # Filter 4: Is the code too long (boilerplate) or too short?
                lines = code.split('\n')
                line_count = len(lines)
                if line_count > MAX_LINES_OF_CODE or line_count < MIN_LINES_OF_CODE:
                    continue
                    
                # Filter 5: Skip codes with insanely long lines (obfuscation/hardcoded payloads)
                if any(len(line) > MAX_LINE_LENGTH for line in lines):
                    continue
                    
                # Filter 6: Skip codes with excessive non-ASCII characters (like the Chinese spam)
                non_ascii_count = sum(1 for c in code if ord(c) > 127)
                if non_ascii_count > MAX_NON_ASCII:
                    continue
                
                # If it passes all filters, add it!
                seen_problems.add(base_prob_id)
                complexity_counts[comp] += 1
                curated_dataset.append(item)
                
                # Early exit if we have filled all buckets
                if all(count >= SAMPLES_PER_COMPLEXITY for count in complexity_counts.values()):
                    break
        
        # Check early exit condition again outside inner loop
        if all(count >= SAMPLES_PER_COMPLEXITY for count in complexity_counts.values()):
            break

    # Save the highly curated, balanced dataset
    output_filename = 'curated_ground_truth.json'
    with open(output_filename, 'w', encoding='utf-8') as out_f:
        # ensure_ascii=False prevents the \uXXXX escape sequences
        json.dump(curated_dataset, out_f, indent=2, ensure_ascii=False)

    print(f"Curation complete! Saved {len(curated_dataset)} highly diverse scripts to {output_filename}.")
    print("Class breakdown:")
    for k, v in complexity_counts.items():
        print(f"  - {k}: {v} scripts")

if __name__ == "__main__":
    curate_dataset()