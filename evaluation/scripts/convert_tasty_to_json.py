import csv
import json
import os
import ast
import sys
import math

# ==========================================
# CONVERSION & SPLIT CONFIGURATION
# ==========================================
NUM_CHUNKS = 113  # Splits the dataset into 10 separate files for easy manual editing

CSV_COMPLEXITY_MAP = {
    "constant": "O(1)",
    "logn": "O(log n)",
    "linear": "O(n)",
    "nlogn": "O(n log n)",
    "quadratic": "O(n^2)",
    "cubic": "O(n^3)",
    "np": "O(2^n)",
    "exponential": "O(2^n)",
    "o(1)": "O(1)",
    "o(logn)": "O(log n)",
    "o(log n)": "O(log n)",
    "o(n)": "O(n)",
    "o(nlogn)": "O(n log n)",
    "o(n log n)": "O(n log n)",
    "o(n^2)": "O(n^2)",
    "o(n^3)": "O(n^3)",
    "o(2^n)": "O(2^n)",
    "o(n!)": "O(n!)",
}


def generate_ast_line_metrics(code_str, overall_time, overall_space):
    """
    Parses code lines and assigns baseline O(1) to flat statements,
    while propagating the snippet's overall Big-O to loops and comprehensions.
    """
    lines = code_str.split('\n')
    line_map = {}

    # Step 1: Initialize all valid executable lines to baseline O(1)
    for idx, line_text in enumerate(lines, start=1):
        stripped = line_text.strip()
        if stripped and not stripped.startswith('#'):
            line_map[idx] = {
                "lineno": idx,
                "code": line_text,
                "global_time": "O(1)",
                "global_space": "O(1)"
            }

    # Step 2: AST Walk to propagate snippet complexity into loop bodies
    try:
        tree = ast.parse(code_str)
        for node in ast.walk(tree):
            if isinstance(node, (ast.For, ast.While, ast.ListComp, ast.DictComp, ast.SetComp)):
                for child in ast.walk(node):
                    if hasattr(child, 'lineno') and child.lineno in line_map:
                        line_map[child.lineno]["global_time"] = overall_time
                        if overall_space != "O(1)":
                            line_map[child.lineno]["global_space"] = overall_space
    except SyntaxError:
        # Fallback keyword heuristic if code contains syntax unparseable by AST
        for idx, line_text in enumerate(lines, start=1):
            if idx in line_map:
                if any(kw in line_text for kw in ('for ', 'while ', '.sort(', 'sorted(')):
                    line_map[idx]["global_time"] = overall_time
                    if overall_space != "O(1)":
                        line_map[idx]["global_space"] = overall_space

    return [line_map[k] for k in sorted(line_map.keys())]


def convert_and_split_tasty_dataset():
    print("🚀 Starting Tasty CSV -> Chunked JSON Ground Truth Conversion...")

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_path = os.path.join(base_dir, 'dataset', 'processed', 'algo_blocks_dataset.csv')
    dataset_dir = os.path.join(base_dir, 'dataset')

    if not os.path.exists(input_path):
        print(f"❌ ERROR: Processed dataset not found at: {input_path}")
        print("Run prep_dataset.py first!")
        sys.exit(1)

    json_dataset = []
    skipped_count = 0

    with open(input_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=1):
            code_str = row.get('code', '')
            space_str = row.get('space_complexity', '')
            time_str = row.get('time_complexity', '')

            if not time_str and not space_str:
                parts = code_str.rsplit(',', 2)
                if len(parts) == 3:
                    code_str = parts[0]
                    space_str = parts[1].strip()
                    time_str = parts[2].strip()

            code_str = code_str.strip()
            if not code_str:
                skipped_count += 1
                continue

            if code_str.endswith('"'):
                code_str = code_str[:-1].strip()

            norm_time = CSV_COMPLEXITY_MAP.get(str(time_str).lower().strip(), str(time_str).strip())
            norm_space = CSV_COMPLEXITY_MAP.get(str(space_str).lower().strip(), str(space_str).strip())

            line_metrics = generate_ast_line_metrics(code_str, norm_time, norm_space)

            json_dataset.append({
                "id": f"Tasty_ML_{i}",
                "code": code_str,
                "expected_overall_time": norm_time if norm_time else "O(1)",
                "expected_overall_space": norm_space if norm_space else "O(1)",
                "line_metrics": line_metrics
            })

    total_items = len(json_dataset)
    print(f"✅ Converted {total_items} valid snippets. Splitting into {NUM_CHUNKS} files...")

    # Calculate chunk sizes
    chunk_size = math.ceil(total_items / NUM_CHUNKS)

    for chunk_idx in range(NUM_CHUNKS):
        start_idx = chunk_idx * chunk_size
        end_idx = min(start_idx + chunk_size, total_items)
        
        chunk_data = json_dataset[start_idx:end_idx]
        
        if not chunk_data:
            break

        part_num = chunk_idx + 1
        output_filename = f'tasty_ground_truth_part_{part_num}.json'
        output_path = os.path.join(dataset_dir, output_filename)

        with open(output_path, 'w', encoding='utf-8') as out_f:
            json.dump(chunk_data, out_f, indent=2, ensure_ascii=False)

        print(f"  📄 Saved Part {part_num:2d}: {output_filename} ({len(chunk_data)} snippets)")

    print("-" * 60)
    print(f"🎉 Success! All chunks saved in directory: {dataset_dir}")
    if skipped_count > 0:
        print(f"⚠️ Skipped {skipped_count} empty rows.")


if __name__ == "__main__":
    convert_and_split_tasty_dataset()