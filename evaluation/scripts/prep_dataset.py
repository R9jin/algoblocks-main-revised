import pandas as pd
import os
import re

def is_python_code(code_str):
    """
    Heuristic to identify and exclude C, C++, and Java code 
    that slipped into the dataset and breaks Python AST parsers.
    """
    if not isinstance(code_str, str):
        return False
        
    c_cpp_java_indicators = [
        r'#include\s*<',
        r'using\s+namespace\s+std;',
        r'int\s+main\s*\(',
        r'public\s+static\s+void\s+main',
        r'std::',
        r'cout\s*<<',
        r'cin\s*>>',
        r'#define\s+',
        r'System\.out\.println',
        r'import\s+java\.',
        r'#include\s*"',
        r'vector<',
        r'Scanner\s+sc\s*=',
        r'long\s+long\s+',
        r'scanf\(',
        r'printf\(',
        r'\}\s*catch\s*\('
    ]
    
    # Check for foreign keywords
    for indicator in c_cpp_java_indicators:
        if re.search(indicator, code_str):
            return False
            
    # Check for excessive C-style block syntax not typical of Python
    if code_str.count('{') >= 3 and code_str.count('}') >= 3 and code_str.count(';') >= 5:
        return False
        
    return True

def prep_tasty_dataset():
    print("🚀 Starting Dataset Pre-processing...")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_path = os.path.join(base_dir, 'dataset', 'raw', 'python_data_clean.csv')
    output_path = os.path.join(base_dir, 'dataset', 'processed', 'algo_blocks_dataset.csv')
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    complexity_map = {
        'constant': 'O(1)',
        'logarithmic': 'O(log n)',
        'linear': 'O(n)',
        'n log n': 'O(n log n)',
        'quadratic': 'O(n^2)',
        'cubic': 'O(n^3)',
        'exponential': 'O(2^n)'
    }

    try:
        print(f"📂 Loading raw dataset from: {input_path}")
        df = pd.read_csv(input_path)
        initial_row_count = len(df)
        print(f"✅ Loaded {initial_row_count} initial snippets.")

        # --- NEW: Filter out non-Python code ---
        # Assuming your code column is named 'code' or 'source_code'. Adjust if necessary.
        code_col = 'code' if 'code' in df.columns else ('source_code' if 'source_code' in df.columns else df.columns[0])
        
        df = df[df[code_col].apply(is_python_code)]
        python_row_count = len(df)
        print(f"🧹 Filtered out {initial_row_count - python_row_count} non-Python (C++/Java) files.")
        print(f"✅ Retained {python_row_count} valid Python snippets for evaluation.")

        # Clean and Translate the Labels
        df['space_complexity'] = df['space_complexity'].fillna('').astype(str).str.strip().str.lower()
        df['time_complexity'] = df['time_complexity'].fillna('').astype(str).str.strip().str.lower()

        df['space_complexity'] = df['space_complexity'].map(complexity_map).fillna(df['space_complexity'])
        df['time_complexity'] = df['time_complexity'].map(complexity_map).fillna(df['time_complexity'])

        df.to_csv(output_path, index=False)
        print(f"🎉 Success! Processed dataset saved to: {output_path}")
        print("Ready for evaluate_metrics.py!")

    except FileNotFoundError:
        print(f"❌ ERROR: Could not find the input file at {input_path}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

if __name__ == "__main__":
    prep_tasty_dataset()