import csv
import re

def clean_dataset():
    input_file = 'algo_blocks_dataset.csv'
    output_file = 'algo_blocks_dataset_cleaned.csv'

    # Expanded niche patterns to catch normalized strings
    # (e.g., 'nnlogn' catches 'n * n * log n')
    niche_patterns = [
        r'n2logn', 
        r'nnlogn',
        r'n2logk', 
        r'nnlogk',
        r'nlognlogv', 
        r'n\+klogn',
        r'nlog2n',
        r'sqrtn'
    ]
    
    # Compile a regex pattern to match any of the niche complexities
    combined_pattern = re.compile('|'.join(niche_patterns))

    removed_count = 0
    kept_count = 0

    try:
        with open(input_file, mode='r', encoding='utf-8') as infile, \
             open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
            
            # Read the CSV as a dictionary
            reader = csv.DictReader(infile)
            
            # Ensure the output file maintains the exact same headers
            if not reader.fieldnames:
                print("Error: Could not read headers from the CSV.")
                return
                
            writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)
            writer.writeheader()
            
            for row in reader:
                # Safely get the time_complexity value
                raw_time_comp = str(row.get('time_complexity', ''))
                
                # Normalize the string to catch all formatting variations:
                # 1. Convert to lowercase
                normalized_time = raw_time_comp.lower()
                # 2. Remove whitespace, parentheses, carets, and asterisks
                normalized_time = re.sub(r'[\s\(\)\^\*]', '', normalized_time)
                # 3. Strip the leading 'o' (from O notation) if it exists
                if normalized_time.startswith('o'):
                    normalized_time = normalized_time[1:]
                
                # Check if the normalized string contains any of our niche patterns
                if combined_pattern.search(normalized_time):
                    print(f"Filtering out row with complexity: {raw_time_comp}")
                    removed_count += 1
                else:
                    writer.writerow(row)
                    kept_count += 1

        print(f"\nDataset cleaning complete.")
        print(f"Original dataset untouched. Cleaned data saved to: '{output_file}'")
        print(f"-> Rows kept: {kept_count}")
        print(f"-> Rows removed: {removed_count}")

    except FileNotFoundError:
        print(f"Error: Could not find '{input_file}'. Ensure the script is in the same directory as your dataset.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    clean_dataset()