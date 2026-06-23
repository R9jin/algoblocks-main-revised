import json
import os
import math

def split_curated_into_five():
    input_file = 'curated_ground_truth.json'
    
    if not os.path.exists(input_file):
        print(f"Error: Could not find '{input_file}' in the current directory!")
        print("Please ensure you have generated the curated dataset first.")
        return

    # Read the highly curated dataset
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total_items = len(data)
    if total_items == 0:
        print("Error: The curated dataset is empty.")
        return

    # Calculate how many items per file to get exactly 5 files
    num_files = 5
    chunk_size = math.ceil(total_items / num_files)
    
    print(f"Total items found: {total_items}")
    print(f"Targeting {num_files} files (approximately {chunk_size} items per file)...\n")

    for i in range(num_files):
        # Calculate the start and end slice indices for this chunk
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_items)
        
        chunk = data[start_idx:end_idx]
        
        # If we've run out of data before reaching 5 files (e.g., if total_items < 5), break early
        if not chunk:
            break
            
        # Write the chunk to a new JSON file
        output_filename = f'curated_part_{i+1}.json'
        with open(output_filename, 'w', encoding='utf-8') as out_f:
            # ensure_ascii=False is kept to prevent \uXXXX escaping issues again
            json.dump(chunk, out_f, indent=2, ensure_ascii=False)
            
        print(f"Saved {output_filename} with {len(chunk)} items.")

    print("\nSuccess! The curated dataset has been split.")

if __name__ == "__main__":
    split_curated_into_five()