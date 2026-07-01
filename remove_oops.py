import json
import os
import glob
import re
import pandas as pd

def contains_oop(code_string):
    """Checks if the code contains OOP (Object-Oriented Programming) concepts like classes."""
    if not isinstance(code_string, str):
        return False
    # Regex to match class definitions
    if re.search(r'^\s*class\s+[a-zA-Z0-9_]+', code_string, re.MULTILINE):
        return True
    return False

def clean_json_datasets(directory):
    """Filters out OOP entries from JSON files."""
    json_files = glob.glob(os.path.join(directory, '*.json'))
    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError:
            continue
        
        if isinstance(data, list):
            original_len = len(data)
            # Retain only items that do NOT contain OOP
            filtered_data = [item for item in data if not contains_oop(item.get('code', ''))]
            new_len = len(filtered_data)
            
            if original_len != new_len:
                print(f"[*] Removed {original_len - new_len} OOP entries from {os.path.basename(file_path)}")
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(filtered_data, f, indent=2)

def clean_csv_datasets(directory):
    """Filters out OOP entries from CSV files."""
    csv_files = glob.glob(os.path.join(directory, '*.csv'))
    for file_path in csv_files:
        try:
            df = pd.read_csv(file_path)
            if 'code' in df.columns:
                original_len = len(df)
                # Retain only rows that do NOT contain OOP
                df_filtered = df[~df['code'].apply(contains_oop)]
                new_len = len(df_filtered)
                
                if original_len != new_len:
                    print(f"[*] Removed {original_len - new_len} OOP entries from {os.path.basename(file_path)}")
                    df_filtered.to_csv(file_path, index=False)
        except Exception as e:
            print(f"[!] Error processing {os.path.basename(file_path)}: {e}")

if __name__ == "__main__":
    # Define the target paths in the frontend directory
    eval_dir = os.path.join("frontend", "public", "data", "evaluation")
    processed_dir = os.path.join(eval_dir, "processed")
    
    if not os.path.exists(eval_dir):
        print("[!] Evaluation directory not found. Ensure you are running this from the project root.")
        exit(1)

    print("Scanning JSON datasets for OOP structures...")
    clean_json_datasets(eval_dir)
    
    print("\nScanning CSV datasets for OOP structures...")
    if os.path.exists(processed_dir):
        clean_csv_datasets(processed_dir)
    else:
        clean_csv_datasets(eval_dir)
        
    print("\nâœ… OOP removal complete! You can now run the AST Evaluation Suite securely.")