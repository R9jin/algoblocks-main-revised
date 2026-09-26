import csv

def compress_dataset():
    # Use your cleaned dataset as the input if you want to build on the previous step,
    # or change this to 'algo_blocks_dataset.csv' if you are starting fresh.
    input_file = 'algo_blocks_dataset.csv'
    output_file = 'algo_blocks_dataset_compressed.csv'

    removed_count = 0
    kept_count = 0

    try:
        with open(input_file, mode='r', encoding='utf-8') as infile, \
             open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
            
            reader = csv.DictReader(infile)
            
            if not reader.fieldnames:
                print("Error: Could not read headers from the CSV.")
                return
                
            writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)
            writer.writeheader()
            
            for row in reader:
                # 1. Check if the entire row is completely blank
                is_completely_blank = True
                for value in row.values():
                    if value and str(value).strip():
                        is_completely_blank = False
                        break
                
                # 2. Check if the 'code' column specifically is missing/blank
                # A row without code is useless for the AlgoBlocks AST analyzer
                code_content = str(row.get('code', '')).strip()
                
                # If the row is completely blank OR it has no code snippet, drop it
                if is_completely_blank or not code_content:
                    removed_count += 1
                else:
                    writer.writerow(row)
                    kept_count += 1

        print(f"\nDataset compression complete.")
        print(f"Original dataset untouched. Compressed data saved to: '{output_file}'")
        print(f"-> Valid rows kept: {kept_count}")
        print(f"-> Blank/Gap rows removed: {removed_count}")

    except FileNotFoundError:
        print(f"Error: Could not find '{input_file}'. Ensure the script is in the exact same directory.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    compress_dataset()