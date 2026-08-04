# Complexity Analyzer Regression Suite

A small, targeted test suite whose only job is to protect the accuracy
numbers cited in Chapter 4. It does **not** attempt full coverage of the
analyzer's internals.

## What's here

- `conftest.py` — points Python at `frontend/public/python_engine` (where
  `complexity_analyzer` lives) and loads the ground-truth dataset from
  `frontend/public/data/evaluation/processed/`.
- `test_analyzer_regression.py` — the actual pytest suite:
  - 5 hand-written **canonical cases** (one per major complexity shape:
    O(1), O(log n), O(n), O(n^2), O(2^n)) — a sanity net independent of the
    dataset.
  - `test_analyzer_never_raises` — parametrized over all 266 ground-truth
    entries; asserts `analyze_source_code` always returns a result instead
    of throwing.
  - `test_overall_time_complexity_accuracy` / `test_overall_space_complexity_accuracy`
    — assert aggregate accuracy hasn't dropped below a floor.
  - `test_crash_fallback_rate` — asserts the analyzer's error rate hasn't
    crept up.
- `generate_accuracy_report.py` — a standalone script (not a test) that
  produces `reports/accuracy_summary.md`, a per-class accuracy breakdown
  you can paste straight into Chapter 4 or an appendix.

## Running it

```bash
cd <repo root>
pip install pytest
pytest tests/ -v
```

To regenerate the Chapter-4-ready markdown table:

```bash
cd tests
python3 generate_accuracy_report.py
```

Both commands write JSON/Markdown into `tests/reports/` (gitignored-worthy —
add `tests/reports/` to `.gitignore` if you don't want generated reports
committed).

## Current baseline (captured when this suite was written)

| Metric | Value |
|---|---|
| Overall time-complexity accuracy | 74.8% (199/266) |
| Overall space-complexity accuracy | 56.0% (149/266) |
| Both correct simultaneously | 45.1% (120/266) |
| Samples that error out (fallback triggered) | 3.4% (9/266) |

**Worth knowing before you write Chapter 4:** the commonly-cited "~75%"
figure is the *time*-complexity number. Space-complexity accuracy is
meaningfully lower (56%), and per-class breakdown shows O(1) is
surprisingly weak (30.8%, 13 samples) while O(n log n) and O(n^2) are
strong (93.8%, 86.9%). O(2^n), O(n!), and O(V+E) have very small sample
counts (2-3 each) — real numbers, but not statistically load-bearing on
their own; say so if you cite them.

## Adjusting the floors

`MIN_TIME_ACCURACY`, `MIN_SPACE_ACCURACY`, and `MAX_CRASH_FALLBACK_RATE` at
the top of `test_analyzer_regression.py` are set with a small safety margin
below the baseline above. If you deliberately improve the analyzer, rerun
the suite and raise the floors to match the new baseline — don't leave them
stale, or the suite stops meaning anything.

## What this suite intentionally skips

No isolated unit tests for `CallGraphMapper`, `TopologicalSequencer`, etc.
No tests for the FastAPI backend, auth, or database layer. No frontend/UI
tests. This suite was scoped to answer one question defensibly in a
panel: "how do you know the number in Chapter 4 is still accurate?"
Broader coverage is legitimate future work, not something this suite
claims to provide.
