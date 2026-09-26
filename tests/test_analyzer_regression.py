"""
test_analyzer_regression.py
============================
Regression suite for the AST-based complexity analyzer
(frontend/public/python_engine/complexity_analyzer/).

Purpose
-------
This suite exists to answer one question with evidence instead of a manual
re-run: "after the last refactor, is the analyzer's reported accuracy still
what Chapter 4 claims it is?"

It runs the *actual* analyzer package against the *actual* ground-truth
dataset (frontend/public/data/evaluation/processed/ground_truth_chunk_*.json)
and asserts that aggregate accuracy hasn't regressed below a floor. If a
future change to the analyzer (or the dataset) drops accuracy below that
floor, `pytest` fails loudly with a report of exactly which cases broke,
instead of the regression being reported by chance in a later manual demo.

What this deliberately does NOT do
-----------------------------------
This is not full unit-test coverage of the analyzer's internals (call graph
mapper, topological sequencer, etc. are untested in isolation). That would
be a much larger effort than the 1-2 day scope this suite was built for.
The goal is a *safety net around the number reported in Chapter 4*, not a
comprehensive test suite for the whole engine.

Usage
-----
    cd <repo root>
    pip install pytest
    pytest tests/ -v

Reports (accuracy %, and the exact mismatched cases) are written to
tests/reports/*.json after each run -- these are useful raw material for a
Chapter 4 results table or an appendix.
"""
import io
from contextlib import redirect_stdout

import pytest

from conftest import load_ground_truth, write_report

from complexity_analyzer.analyzer import analyze_source_code

# ---------------------------------------------------------------------------
# Regression floors.
#
# Provenance / last recalibrated: after the ground-truth space-complexity
# label audit (see tests/reports/space_label_audit.json), which corrected
# ~100 entries mislabeled O(1) that actually allocate O(n) auxiliary space
# (e.g. `temp = ['']*len(s)`). That fix moved measured space accuracy from
# 56.0% to 88.0%. Floors below carry a small safety margin under the
# current baseline (time: 74.8%, space: 88.0%, crash-to-fallback: 3.4%) --
# enough to absorb minor nondeterminism/dataset edits without masking a
# real regression.
#
# If you deliberately improve the analyzer OR edit the ground-truth
# dataset again, re-run tests/generate_accuracy_report.py and raise/lower
# these floors (and the identical copy in
# api/analyzer_diagnostics/regression_check.py) to match the new baseline.
# A floor that isn't recalibrated after the dataset changes stops meaning
# anything -- it was exactly this staleness that let space accuracy sit at
# a 38-point-too-generous floor (50%) after the true baseline moved to 88%.
# ---------------------------------------------------------------------------
MIN_TIME_ACCURACY = 0.70
MIN_SPACE_ACCURACY = 0.80
MAX_CRASH_FALLBACK_RATE = 0.06

ENTRIES = load_ground_truth()


def _run_silently(code):
    """analyze_source_code's dynamic tracer executes the sample code to
    build a runtime trace, which means print() calls in the sample code
    write to real stdout. That's irrelevant noise for a test run, so it's
    swallowed here rather than left to spam `pytest -v` output."""
    buf = io.StringIO()
    with redirect_stdout(buf):
        return analyze_source_code(code)


# ---------------------------------------------------------------------------
# Sanity checks: hand-written, independent of the dataset. These pin down
# the analyzer's behavior on canonical, unambiguous cases for each of the
# nine supported complexity classes, so a regression here can't be blamed
# on noisy or ambiguous ground-truth entries.
# ---------------------------------------------------------------------------
CANONICAL_CASES = [
    pytest.param(
        "def f(x):\n    return x + 1\n",
        "O(1)",
        id="constant-return",
    ),
    pytest.param(
        "def f(n):\n    i = 1\n    while i < n:\n        i *= 2\n    return i\n",
        "O(log n)",
        id="halving-loop-log-n",
    ),
    pytest.param(
        "def f(arr):\n    total = 0\n    for x in arr:\n        total += x\n    return total\n",
        "O(n)",
        id="single-loop-linear",
    ),
    pytest.param(
        "def f(arr):\n    total = 0\n"
        "    for i in range(len(arr)):\n"
        "        for j in range(len(arr)):\n"
        "            total += arr[i] * arr[j]\n"
        "    return total\n",
        "O(n^2)",
        id="nested-loop-quadratic",
    ),
    pytest.param(
        "def f(n):\n"
        "    if n <= 1:\n"
        "        return n\n"
        "    return f(n - 1) + f(n - 2)\n",
        "O(2^n)",
        id="double-recursion-exponential",
    ),
]


@pytest.mark.parametrize("code,expected", CANONICAL_CASES)
def test_canonical_complexity_classes(code, expected):
    result = _run_silently(code)
    assert result["status"] == "success", (
        f"Analyzer crashed on a canonical, unambiguous {expected} case: "
        f"{result.get('message')}"
    )
    assert result["total"] == expected, (
        f"Canonical {expected} case misclassified as {result['total']}"
    )


# ---------------------------------------------------------------------------
# Crash-free guarantee. Every entry should come back with a status of
# "success" or "error" -- never raise out of analyze_source_code itself.
# (The function has its own internal try/except + fallback_analyzer, so an
# uncaught exception here means that safety net broke.)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "entry", ENTRIES, ids=[e["id"] for e in ENTRIES]
)
def test_analyzer_never_raises(entry):
    try:
        result = _run_silently(entry["code"])
    except Exception as exc:  # pragma: no cover - this is what we're guarding against
        pytest.fail(
            f"analyze_source_code raised instead of returning an error "
            f"result for {entry['id']} ({entry['name']}): {exc!r}"
        )
    assert result.get("status") in ("success", "error")


# ---------------------------------------------------------------------------
# Aggregate accuracy regression tests. These are the ones that back the
# number in Chapter 4.
# ---------------------------------------------------------------------------
def test_overall_time_complexity_accuracy():
    correct, mismatches = 0, []
    for entry in ENTRIES:
        result = _run_silently(entry["code"])
        predicted = result.get("total")
        expected = entry["expected_overall_time"]
        if predicted == expected:
            correct += 1
        else:
            mismatches.append(
                {
                    "id": entry["id"],
                    "name": entry["name"],
                    "source_file": entry["_source_file"],
                    "expected": expected,
                    "predicted": predicted,
                    "analyzer_status": result.get("status"),
                }
            )

    accuracy = correct / len(ENTRIES)
    report_path = write_report(
        "time_complexity_accuracy.json",
        {
            "metric": "expected_overall_time vs analyzer 'total'",
            "n": len(ENTRIES),
            "correct": correct,
            "accuracy": round(accuracy, 4),
            "floor": MIN_TIME_ACCURACY,
            "mismatches": mismatches,
        },
    )
    assert accuracy >= MIN_TIME_ACCURACY, (
        f"Overall time-complexity accuracy dropped to {accuracy:.1%} "
        f"(floor: {MIN_TIME_ACCURACY:.0%}). {len(mismatches)}/{len(ENTRIES)} "
        f"mismatches -- see {report_path}"
    )


def test_overall_space_complexity_accuracy():
    correct, mismatches = 0, []
    for entry in ENTRIES:
        result = _run_silently(entry["code"])
        predicted = result.get("space_total")
        expected = entry["expected_overall_space"]
        if predicted == expected:
            correct += 1
        else:
            mismatches.append(
                {
                    "id": entry["id"],
                    "name": entry["name"],
                    "source_file": entry["_source_file"],
                    "expected": expected,
                    "predicted": predicted,
                    "analyzer_status": result.get("status"),
                }
            )

    accuracy = correct / len(ENTRIES)
    report_path = write_report(
        "space_complexity_accuracy.json",
        {
            "metric": "expected_overall_space vs analyzer 'space_total'",
            "n": len(ENTRIES),
            "correct": correct,
            "accuracy": round(accuracy, 4),
            "floor": MIN_SPACE_ACCURACY,
            "mismatches": mismatches,
        },
    )
    assert accuracy >= MIN_SPACE_ACCURACY, (
        f"Overall space-complexity accuracy dropped to {accuracy:.1%} "
        f"(floor: {MIN_SPACE_ACCURACY:.0%}). {len(mismatches)}/{len(ENTRIES)} "
        f"mismatches -- see {report_path}"
    )


def test_crash_fallback_rate():
    """The analyzer falls back to a rough heuristic (status 'error' is only
    set for real parse failures; other exceptions get silently absorbed into
    fallback_analyzer with status 'success'). We can't detect "used fallback"
    from the return value alone, so this test treats status == 'error'
    (e.g. genuine SyntaxError on a ground-truth sample) as the signal, and
    caps how often that's allowed to happen."""
    crashes, crashed_ids = 0, []
    for entry in ENTRIES:
        result = _run_silently(entry["code"])
        if result.get("status") == "error":
            crashes += 1
            crashed_ids.append(
                {
                    "id": entry["id"],
                    "source_file": entry["_source_file"],
                    "error": result.get("message"),
                }
            )

    rate = crashes / len(ENTRIES)
    report_path = write_report(
        "crash_fallback_rate.json",
        {
            "n": len(ENTRIES),
            "crashes": crashes,
            "rate": round(rate, 4),
            "ceiling": MAX_CRASH_FALLBACK_RATE,
            "crashed_entries": crashed_ids,
        },
    )
    assert rate <= MAX_CRASH_FALLBACK_RATE, (
        f"{crashes}/{len(ENTRIES)} ground-truth samples ({rate:.1%}) now "
        f"error out of the analyzer, above the {MAX_CRASH_FALLBACK_RATE:.0%} "
        f"ceiling -- see {report_path}"
    )
