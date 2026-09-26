"""
generate_accuracy_report.py
============================
Standalone script (not a pytest test) that runs the complexity analyzer
against the full ground-truth dataset and writes a Markdown summary you can
paste into / cite from Chapter 4 (Results).

This intentionally duplicates a bit of logic from test_analyzer_regression.py
rather than importing from it, so it keeps working even if the test file's
internals change shape later.

Usage:
    cd <repo root>
    python tests/generate_accuracy_report.py

Output:
    tests/reports/accuracy_summary.md
"""
import io
import os
from collections import defaultdict
from contextlib import redirect_stdout

from conftest import GROUND_TRUTH_DIR, REPORTS_DIR, load_ground_truth  # noqa: E402
from complexity_analyzer.analyzer import analyze_source_code  # noqa: E402


def main():
    entries = load_ground_truth()
    n = len(entries)

    time_correct = space_correct = both_correct = errors = 0
    per_class = defaultdict(lambda: {"n": 0, "correct": 0})

    for entry in entries:
        buf = io.StringIO()
        with redirect_stdout(buf):
            result = analyze_source_code(entry["code"])

        expected_t = entry["expected_overall_time"]
        expected_s = entry["expected_overall_space"]
        predicted_t = result.get("total")
        predicted_s = result.get("space_total")

        t_ok = predicted_t == expected_t
        s_ok = predicted_s == expected_s

        time_correct += t_ok
        space_correct += s_ok
        both_correct += t_ok and s_ok
        errors += result.get("status") == "error"

        per_class[expected_t]["n"] += 1
        per_class[expected_t]["correct"] += t_ok

    lines = []
    lines.append("# Complexity Analyzer -- Ground Truth Accuracy Report\n")
    lines.append(
        f"Generated from `{os.path.relpath(GROUND_TRUTH_DIR)}` "
        f"({n} labeled samples).\n"
    )
    lines.append("## Overall accuracy\n")
    lines.append("| Metric | Correct / Total | Accuracy |")
    lines.append("|---|---|---|")
    lines.append(f"| Overall time complexity | {time_correct}/{n} | {time_correct/n:.1%} |")
    lines.append(f"| Overall space complexity | {space_correct}/{n} | {space_correct/n:.1%} |")
    lines.append(f"| Both time AND space correct | {both_correct}/{n} | {both_correct/n:.1%} |")
    lines.append(f"| Samples that raised a parse/analysis error | {errors}/{n} | {errors/n:.1%} |")
    lines.append("")

    lines.append("## Accuracy by expected time-complexity class\n")
    lines.append("| Complexity class | n | Correct | Accuracy |")
    lines.append("|---|---|---|---|")

    def class_sort_key(k):
        order = [
            "O(1)", "O(log n)", "O(sqrt(n))", "O(√n)", "O(n)", "O(n log n)",
            "O(V+E)", "O(n^2)", "O(2^n)", "O(n!)",
        ]
        return order.index(k) if k in order else len(order)

    for cls in sorted(per_class.keys(), key=class_sort_key):
        stats = per_class[cls]
        acc = stats["correct"] / stats["n"] if stats["n"] else 0
        lines.append(f"| {cls} | {stats['n']} | {stats['correct']} | {acc:.1%} |")
    lines.append("")

    os.makedirs(REPORTS_DIR, exist_ok=True)
    out_path = os.path.join(REPORTS_DIR, "accuracy_summary.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {out_path}")
    print(f"Overall time accuracy: {time_correct/n:.1%}")
    print(f"Overall space accuracy: {space_correct/n:.1%}")


if __name__ == "__main__":
    main()
