# Ground-truth audit, 2026-10-12

Scope: all 273 records in `processed/` (unchanged). **No label was changed.** `original_278/` is untouched.

## Checks run over all 273 records
- every overall time and space label is one of the nine supported classes (0 outside)
- overall time == the maximum of the record's own cumulative line-time labels, and overall space == the maximum of its
  line-space labels (0 disagreements out of 273 for time, 0 for space)
- BFS-style records: none of the six `O(V+E)` records uses `list.pop(0)` (the three BFS-style ones use `deque`/`popleft`), nor do the
  two grid-BFS records, so none needs the O(V^2+E) bound (which would be outside the nine classes)
- uncalled helpers: one record contains a function that no code calls (see flags)

## Records that still disagree with the analyzer after the fixes (38 by time and/or space)
For all 38 the stored label and its `gt_note` were checked against the code and the rules, and the code was read in full for 12 of
them (algo_n_028, n_045, n2_049, n2_077, n2_121, n_131, n2_161, n_162, 1_163, n_201, n2_205, n_260). No label was found wrong. The
disagreements read as analyzer limitations (for example memoised DP not resolved to its state count, `arr.count` on a fixed 9-cell board, digit-count
loops that are O(log n), a fixed-size table preallocation read as O(n)). They remain misses in the benchmark; they are not relabelled.

## Flags (kept as is, listed for sign-off)
| id | flag |
|---|---|
| algo_n_249 | code as written raises TypeError (`freq.append(n)` then a loop over ints); the label is for the intended bucket algorithm. Ambiguous under rule 10 - kept, flagged. |
| algo_n_260 | label O(2^n) rests on rule 8 (a repeat count parsed from digits grows like 10^n, folded into the 2^n tier by convention). Kept, flagged. |
| algo_n2_226 | the only function (`insertionSort`) is never called by the file; treated as the entry point. |
| algo_n2_049 and every record with a named constant bound (`MAX`, `M`, `R`) | rule 7 scores `max = 100` preallocations as O(1); the analyzer's theoretical mode treats an assigned name as symbolic (`MAX = 50; for i in range(MAX)` is O(n) in tests/test_theoretical_analysis.py). The two conventions conflict; needs an owner decision before any relabelling. |

## Not verified
Labels outside those 33 records were checked structurally (above) but not re-derived by hand. Human validator sign-off on
individual labels is still pending, as noted in GROUND_TRUTH_RULES.md.
