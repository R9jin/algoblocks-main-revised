"""
regression_check.py -- the actual pass/fail logic behind the admin
"Analyzer Regression Check" panel.

This is the server-side counterpart to tests/test_analyzer_regression.py.
Same dataset, same floors, same idea -- but importable from a FastAPI route
and returning a JSON-able report instead of pytest assertions, so it can
be triggered from the admin dashboard on demand.
"""
import glob
import io
import os
import sys
import time
from collections import defaultdict
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Any, Dict, List

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    # Makes `import complexity_analyzer...` resolve to the vendored copy
    # sitting right next to this file, the same way Pyodide puts
    # frontend/public/python_engine on sys.path for the browser copy.
    sys.path.insert(0, _HERE)

from complexity_analyzer.analyzer import analyze_source_code  # noqa: E402

GROUND_TRUTH_DIR = os.path.join(_HERE, "ground_truth")

# ---------------------------------------------------------------------------
# Regression floors -- kept identical to tests/test_analyzer_regression.py
# on purpose. If you improve the analyzer and want to raise these, update
# both places.
# ---------------------------------------------------------------------------
MIN_TIME_ACCURACY = 0.70
MIN_SPACE_ACCURACY = 0.50
MAX_CRASH_FALLBACK_RATE = 0.06

# Hand-written canonical cases, independent of the ground-truth dataset.
CANONICAL_CASES = [
    {
        "name": "constant-return",
        "code": "def f(x):\n    return x + 1\n",
        "expected": "O(1)",
    },
    {
        "name": "halving-loop-log-n",
        "code": "def f(n):\n    i = 1\n    while i < n:\n        i *= 2\n    return i\n",
        "expected": "O(log n)",
    },
    {
        "name": "single-loop-linear",
        "code": "def f(arr):\n    total = 0\n    for x in arr:\n        total += x\n    return total\n",
        "expected": "O(n)",
    },
    {
        "name": "nested-loop-quadratic",
        "code": (
            "def f(arr):\n    total = 0\n"
            "    for i in range(len(arr)):\n"
            "        for j in range(len(arr)):\n"
            "            total += arr[i] * arr[j]\n"
            "    return total\n"
        ),
        "expected": "O(n^2)",
    },
    {
        "name": "double-recursion-exponential",
        "code": (
            "def f(n):\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    return f(n - 1) + f(n - 2)\n"
        ),
        "expected": "O(2^n)",
    },
]

MAX_MISMATCHES_RETURNED = 25  # keep the API payload bounded


def _load_ground_truth() -> List[Dict[str, Any]]:
    entries = []
    pattern = os.path.join(GROUND_TRUTH_DIR, "ground_truth_chunk_*.json")
    import json

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
            "The vendored dataset may be missing from this deployment."
        )
    return entries


def _run_silently(code: str) -> Dict[str, Any]:
    """The analyzer's dynamic tracer executes the sample code to build a
    runtime trace, so print() calls inside sample code hit real stdout.
    Irrelevant noise for a diagnostic run -- swallow it."""
    buf = io.StringIO()
    with redirect_stdout(buf):
        return analyze_source_code(code)


def run_regression_check() -> Dict[str, Any]:
    """Runs every canonical case + every ground-truth entry through the
    analyzer once and returns a single JSON-able report with a pass/fail
    verdict for each metric plus an overall verdict."""
    start = time.perf_counter()

    # --- canonical sanity cases ---
    sanity_checks = []
    for case in CANONICAL_CASES:
        result = _run_silently(case["code"])
        actual = result.get("total")
        sanity_checks.append(
            {
                "name": case["name"],
                "expected": case["expected"],
                "actual": actual,
                "passed": actual == case["expected"] and result.get("status") == "success",
            }
        )
    sanity_passed = all(c["passed"] for c in sanity_checks)

    # --- ground truth pass ---
    entries = _load_ground_truth()
    n = len(entries)

    time_correct = space_correct = errors = 0
    time_mismatches, space_mismatches = [], []
    per_class = defaultdict(lambda: {"n": 0, "correct": 0})

    for entry in entries:
        result = _run_silently(entry["code"])

        expected_t = entry["expected_overall_time"]
        expected_s = entry["expected_overall_space"]
        predicted_t = result.get("total")
        predicted_s = result.get("space_total")
        status = result.get("status")

        per_class[expected_t]["n"] += 1

        t_ok = predicted_t == expected_t
        s_ok = predicted_s == expected_s
        if t_ok:
            time_correct += 1
            per_class[expected_t]["correct"] += 1
        elif len(time_mismatches) < MAX_MISMATCHES_RETURNED:
            time_mismatches.append(
                {
                    "id": entry["id"],
                    "name": entry["name"],
                    "source_file": entry["_source_file"],
                    "expected": expected_t,
                    "predicted": predicted_t,
                }
            )

        if s_ok:
            space_correct += 1
        elif len(space_mismatches) < MAX_MISMATCHES_RETURNED:
            space_mismatches.append(
                {
                    "id": entry["id"],
                    "name": entry["name"],
                    "source_file": entry["_source_file"],
                    "expected": expected_s,
                    "predicted": predicted_s,
                }
            )

        if status == "error":
            errors += 1

    time_accuracy = time_correct / n
    space_accuracy = space_correct / n
    crash_rate = errors / n

    time_passed = time_accuracy >= MIN_TIME_ACCURACY
    space_passed = space_accuracy >= MIN_SPACE_ACCURACY
    crash_passed = crash_rate <= MAX_CRASH_FALLBACK_RATE

    def class_sort_key(k):
        order = [
            "O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)",
            "O(V + E)", "O(n^2)", "O(2^n)", "O(n!)",
        ]
        return order.index(k) if k in order else len(order)

    per_class_report = [
        {
            "class": cls,
            "n": stats["n"],
            "correct": stats["correct"],
            "accuracy": round(stats["correct"] / stats["n"], 4) if stats["n"] else 0,
        }
        for cls, stats in sorted(per_class.items(), key=lambda kv: class_sort_key(kv[0]))
    ]

    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": duration_ms,
        "dataset_size": n,
        "sanity_checks": {
            "passed": sanity_passed,
            "cases": sanity_checks,
        },
        "time_complexity": {
            "correct": time_correct,
            "n": n,
            "accuracy": round(time_accuracy, 4),
            "floor": MIN_TIME_ACCURACY,
            "passed": time_passed,
            "mismatches": time_mismatches,
            "mismatches_truncated": (n - time_correct) > MAX_MISMATCHES_RETURNED,
        },
        "space_complexity": {
            "correct": space_correct,
            "n": n,
            "accuracy": round(space_accuracy, 4),
            "floor": MIN_SPACE_ACCURACY,
            "passed": space_passed,
            "mismatches": space_mismatches,
            "mismatches_truncated": (n - space_correct) > MAX_MISMATCHES_RETURNED,
        },
        "crash_fallback": {
            "errors": errors,
            "n": n,
            "rate": round(crash_rate, 4),
            "ceiling": MAX_CRASH_FALLBACK_RATE,
            "passed": crash_passed,
        },
        "per_class": per_class_report,
        "overall_passed": sanity_passed and time_passed and space_passed and crash_passed,
    }
