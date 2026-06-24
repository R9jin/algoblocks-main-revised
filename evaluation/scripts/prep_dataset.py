import pandas as pd
import os

def prep_tasty_dataset():
    print("🚀 Starting Dataset Pre-processing...")
    
    # 1. Define file paths based on the directory structure
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_path = os.path.join(base_dir, 'dataset', 'raw', 'python_data_clean.csv')
    output_path = os.path.join(base_dir, 'dataset', 'processed', 'algo_blocks_dataset.csv')
    
    # Ensure the processed directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # 2. The Translation Dictionary
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
        # 3. Load the dataset
        print(f"📂 Loading raw dataset from: {input_path}")
        df = pd.read_csv(input_path)
        
        initial_row_count = len(df)
        print(f"✅ Loaded {initial_row_count} code snippets.")

        # 4. Clean and Translate the Labels
        # FIX: Fill missing values (NaN) with empty strings first, then force string type
        df['space_complexity'] = df['space_complexity'].fillna('').astype(str).str.strip().str.lower()
        df['time_complexity'] = df['time_complexity'].fillna('').astype(str).str.strip().str.lower()

        # Map the values. If a label isn't in our dictionary, keep the original text
        df['space_complexity'] = df['space_complexity'].map(complexity_map).fillna(df['space_complexity'])
        df['time_complexity'] = df['time_complexity'].map(complexity_map).fillna(df['time_complexity'])

        # 5. Save the processed dataset
        df.to_csv(output_path, index=False)
        print(f"🎉 Success! Processed dataset saved to: {output_path}")
        print("Ready for evaluate_metrics.py!")

    except FileNotFoundError:
        print(f"❌ ERROR: Could not find the input file at {input_path}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

if __name__ == "__main__":
    prep_tasty_dataset()