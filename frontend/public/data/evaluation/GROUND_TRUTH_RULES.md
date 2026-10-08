# AlgoBlocks ground truth: worst-case annotation rules

**Status:** conventions below confirmed by the project owner as general, language-independent complexity rules (not CPython-specific). Human validator sign-off on the individual labels is still pending.

Labels in `processed/` were derived from the code alone, by writing down each loop's trip count and each statement's cost and multiplying them out (see `tools/ground_truth/`). No analyzer output was consulted. Only the nine notations are used: O(1), O(log n), O(sqrt n), O(n), O(n log n), O(n^2), O(V+E), O(2^n), O(n!).

1. **Worst case.** The label is the maximum cost over all inputs of size n. n is the largest size parameter (so n x m is O(n^2) with n = max(n, m)); when the only input is a number, n is its value.
2. **Line time** is the cumulative cost of that line over the whole run (executions x cost per execution). A line that can run at most once (an early return or break) is O(1). A def line is O(1). A call to a non-recursive user function includes the callee's work; a recursive call line counts only its own executions (the work belongs to the lines inside the callee).
3. **Line space** is the auxiliary memory that line allocates and keeps live; call lines carry the peak stack/auxiliary memory of the callee. Overall space is the peak. Memory beyond the input only.
4. **Library costs.** dict/set operations are O(1). list `in`, `index`, `remove`, `insert`, `pop(0)`, slicing, `list()`/`copy`, `sum`, `max`, `min` are linear. sort/sorted is O(n log n) time and O(n) auxiliary space. Counter/str.lower()/join/split are linear in time and space.
5. **Strings are immutable.** `s += x` and `s = s + x` inside a loop copy the string every step (O(n^2) in total). `s = x + s` and slice-and-join always copy. The rule is the general immutable-string model, not CPython's in-place optimization, so the 4 records that are out of scope only under this rule stay removed. The 12 kept records whose labels depend on it carry a `gt_alt_inplace_concat` block for comparison only.
6. **Integers and floats are O(1)**; values fit in a machine word (so gcd, or a binary search over a value range, is a constant number of steps). Costs that depend on the digits of a single numeric input are written in log n.
7. **Constants are O(1):** alphabet-sized arrays (26, 256), fixed-capacity preallocations (MAX = 1000), hard-coded loop bounds (range(8), range(10)).
8. **Exponential tiers.** Any c^n recursion or enumeration is O(2^n); factorial enumeration is O(n!); polynomial factors on top are absorbed.
9. **Graphs.** Lines that run once per vertex are O(n) with n = V; lines that run once per edge, and whole traversals, are O(V+E). Grid problems are expressed in the grid side n (so a full-grid sweep is O(n^2)).
10. **Scope.** A record is removed when any of its labels falls outside the nine notations (for example O(n^3), O(n^4) or a polylogarithmic bound; O(n x m) is not a reason, it becomes O(n^2) under rule 1) or when the code does not terminate on some inputs. Removed records are listed with the reason in the change log.
11. **Syntax repair.** Eight records did not parse (else if, Python 2 print, sys.maxint). They were repaired mechanically (elif, print(...), maxsize) with no line numbers moved; the original code is kept in `dataset_original_code`.
12. **Duplicates.** Records with byte-identical code are kept once (lowest id).
