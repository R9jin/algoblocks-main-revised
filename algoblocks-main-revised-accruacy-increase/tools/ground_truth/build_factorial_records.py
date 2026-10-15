"""Append the hand-labelled O(n!) records (factorial_records_src.py) to the
processed ground-truth set. Idempotent: records whose id already exists are
replaced, so re-running never duplicates. Run from the repo root:
    python tools/ground_truth/build_factorial_records.py
"""
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from factorial_records_src import RECORDS

TAG = re.compile(r"\s*#@\s*(\w+)\s*\|\s*(\w+)\s*$")
CLS = {"1": "O(1)", "n": "O(n)", "n2": "O(n^2)", "f": "O(n!)"}
TARGETS = [
    os.path.join(ROOT, "frontend", "public", "data", "evaluation", "processed"),
    os.path.join(ROOT, "api", "analyzer_diagnostics", "ground_truth", "processed"),
]
CHUNK_MAX = 10

def build(rec):
    lines, metrics = [], []
    for i, line in enumerate(rec["code"].split("\n"), 1):
        m = TAG.search(line)
        if m:
            metrics.append({"lineno": i, "time": CLS[m.group(1)], "space": CLS[m.group(2)]})
            line = TAG.sub("", line)
        lines.append(line)
    return {
        "id": rec["id"], "name": rec["name"], "code": "\n".join(lines),
        "expected_overall_time": CLS[rec["T"]], "expected_overall_space": CLS[rec["S"]],
        "line_metrics": metrics,
        "dataset_original_time": None, "dataset_original_space": None,
        "gt_note": rec["note"],
        "gt_added": "post-processing addition: genuine O(n!) records, labels derived from the code by hand",
    }

def write_chunks(folder, new_records):
    paths = sorted(glob.glob(os.path.join(folder, "ground_truth_chunk_*.json")))
    chunks = [json.load(open(p, encoding="utf-8")) for p in paths]
    ids = {r["id"] for r in new_records}
    chunks = [[r for r in c if r["id"] not in ids] for c in chunks]      # idempotent
    chunks = [c for c in chunks if c]
    for r in new_records:
        if len(chunks[-1]) >= CHUNK_MAX: chunks.append([])
        chunks[-1].append(r)
    for p in paths: os.remove(p)
    for i, c in enumerate(chunks, 1):
        with open(os.path.join(folder, f"ground_truth_chunk_{i:02d}.json"), "w", encoding="utf-8") as f:
            json.dump(c, f, indent=2, ensure_ascii=False)
    return sum(len(c) for c in chunks), len(chunks)

def main():
    new = [build(r) for r in RECORDS]
    for folder in TARGETS:
        print(folder, "->", write_chunks(folder, new), "(records, chunks)")
    dl_path = os.path.join(HERE, "derived_labels.json")
    dl = json.load(open(dl_path, encoding="utf-8"))
    for r in new:
        dl[r["id"]] = {"T": r["expected_overall_time"], "S": r["expected_overall_space"],
                       "lines": r["line_metrics"]}
    json.dump(dl, open(dl_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("derived_labels.json entries:", len(dl))
main()
