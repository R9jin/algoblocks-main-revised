"""
conftest.py -- shared setup for the complexity_analyzer regression suite.

The analyzer package normally runs inside Pyodide (in-browser Python), but
it only depends on the standard library (ast, re, time, collections, sys),
so it imports and runs fine under plain CPython. That's what makes this
test suite possible without a browser: we point sys.path at
frontend/public/python_engine and import complexity_analyzer directly.
"""
import glob
import json
import os
import sys

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))

ENGINE_ROOT = os.path.join(REPO_ROOT, "frontend", "public", "python_engine")
GROUND_TRUTH_DIR = os.path.join(
    REPO_ROOT, "frontend", "public", "data", "evaluation", "processed"
)
REPORTS_DIR = os.path.join(TESTS_DIR, "reports")

if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)


def load_ground_truth():
    """Load every ground_truth_chunk_*.json entry into one flat list.

    Each entry gets a `_source_file` key added so mismatches in the report
    can be traced back to the chunk file they came from.
    """
    entries = []
    pattern = os.path.join(GROUND_TRUTH_DIR, "ground_truth_chunk_*.json")
    for path in sorted(glob.glob(pattern)):
        with open(path, "r", encoding="utf-8") as f:
            chunk = json.load(f)
        for entry in chunk:
            entry = dict(entry)
            entry["_source_file"] = os.path.basename(path)
            entries.append(entry)

    if not entries:
        raise RuntimeError(
            f"No ground truth entries found under {GROUND_TRUTH_DIR}. "
            "Did the dataset move or get renamed?"
        )
    return entries


def write_report(filename, payload):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    path = os.path.join(REPORTS_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path
