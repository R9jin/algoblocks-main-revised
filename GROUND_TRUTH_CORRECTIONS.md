# Ground Truth Dataset Correction Log

## Context

The 266-snippet complexity evaluation dataset (`ground_truth_chunk_01.json`
through `ground_truth_chunk_29.json`) was originally built by
`generate_ground_truth.py`, which extracted `expected_overall_space` and
`expected_overall_time` labels via regex from a trailing comment on each
scraped source snippet, rather than deriving them independently from the
code itself. This produced systematic space-complexity mislabels: labels
describing a named algorithm's textbook complexity did not always match the
literal auxiliary space used by that specific snippet (e.g. a helper that
allocates a temp array the textbook description doesn't account for).

## Audit method

All 266 snippets were run through the analyzer. Of 117 total space
mismatches, 100 shared one shape: ground truth said `O(1)`, the analyzer
said `O(n)`. Each of the 100 was manually reviewed against its source code
to determine whether the analyzer's `O(n)` call or the dataset's `O(1)`
label was correct.

**86 of 100** were confirmed genuine dataset mislabels: the snippet
provably allocates space that scales with input (hash maps/sets keyed by
input elements, arrays sized by `len(input)`, string accumulation via `+=`
in a loop, slicing/`.copy()`/`sorted()`, or an auxiliary stack/array whose
size is bounded by input size). These 86 entries' `expected_overall_space`
has been corrected from `O(1)` to `O(n)` in this fix.

**14 of 100** were confirmed genuine analyzer false positives, not dataset
errors, and were left unchanged (still `O(1)`, correctly). Root cause: the
analyzer's space heuristic (`_is_linear_type` /  `visit_BinOp` in
`complexity_analyzer/complexity_heuristics.py` and
`complexity_analyzer/ast_node_visitors.py`) flags `[x] * k` and
`[x for i in range(k)]` as O(n) space without checking whether `k` is a
hardcoded module-level constant (e.g. `MAX_CHAR = 26`, a bounded-alphabet
counting array) or genuinely derived from input length. This is a known,
separate analyzer limitation and is not addressed by this dataset fix.

## Entries left unchanged (14) — analyzer false positives, ground truth was already correct

- `algo_n2_077`
- `algo_n2_135`
- `algo_n2_161`
- `algo_n2_207`
- `algo_n_026`
- `algo_n_053`
- `algo_n_070`
- `algo_n_185`
- `algo_n_253`
- `algo_n_263`
- `algo_n_286`
- `algo_nlogn_015`
- `algo_nlogn_147`
- `algo_nlogn_237`

## Entries corrected (86) — O(1) → O(n)

- `algo_logn_100`
- `algo_logn_145`
- `algo_n2_042`
- `algo_n2_043`
- `algo_n2_050`
- `algo_n2_058`
- `algo_n2_098`
- `algo_n2_119`
- `algo_n2_124`
- `algo_n2_130`
- `algo_n2_166`
- `algo_n2_178`
- `algo_n2_203`
- `algo_n2_205`
- `algo_n2_216`
- `algo_n2_222`
- `algo_n2_228`
- `algo_n2_234`
- `algo_n2_241`
- `algo_n2_244`
- `algo_n2_255`
- `algo_n2_277`
- `algo_n2_278`
- `algo_n2_285`
- `algo_n3_018`
- `algo_n_010`
- `algo_n_011`
- `algo_n_020`
- `algo_n_024`
- `algo_n_025`
- `algo_n_030`
- `algo_n_038`
- `algo_n_041`
- `algo_n_048`
- `algo_n_051`
- `algo_n_054`
- `algo_n_055`
- `algo_n_057`
- `algo_n_062`
- `algo_n_063`
- `algo_n_065`
- `algo_n_066`
- `algo_n_069`
- `algo_n_078`
- `algo_n_080`
- `algo_n_082`
- `algo_n_085`
- `algo_n_092`
- `algo_n_101`
- `algo_n_111`
- `algo_n_115`
- `algo_n_117`
- `algo_n_125`
- `algo_n_149`
- `algo_n_151`
- `algo_n_172`
- `algo_n_183`
- `algo_n_189`
- `algo_n_191`
- `algo_n_193`
- `algo_n_195`
- `algo_n_197`
- `algo_n_199`
- `algo_n_202`
- `algo_n_204`
- `algo_n_208`
- `algo_n_224`
- `algo_n_231`
- `algo_n_232`
- `algo_n_238`
- `algo_n_252`
- `algo_n_256`
- `algo_n_257`
- `algo_n_262`
- `algo_n_264`
- `algo_n_274`
- `algo_n_280`
- `algo_n_281`
- `algo_n_284`
- `algo_nlogn_007`
- `algo_nlogn_046`
- `algo_nlogn_081`
- `algo_nlogn_090`
- `algo_nlogn_134`
- `algo_nlogn_170`
- `algo_nlogn_259`

## Worst-case tightness pass

Correcting `O(1)` → `O(n)` only re-verifies the *direction* of each label (that
some real input-scaling allocation exists). It does not by itself confirm `O(n)`
is the *tightest* worst-case bound — a snippet could genuinely need `O(n^2)`.
Every one of the 86 corrections was re-checked for this specifically:

- 20 entries whose declared time complexity is `O(n^2)`/`O(n^3)` (nested loops —
  the highest-risk zone for underestimating space) were individually reviewed.
- All corrected `O(n)` structures were confirmed to be sized by a single loop
  dimension (one array/set/dict populated from one index), **except one**:

  **`algo_n2_205`** (`unique(mat, r, c)`) inserts every visited matrix cell
  value into a dict keyed by that value, across a nested `r × c` loop. In the
  worst case (all cell values distinct), the dict holds `r*c` entries — that's
  `O(n^2)` space for a matrix whose dimension is `n`, not `O(n)`. This entry was
  corrected to `O(n^2)`, not `O(n)`. Note the analyzer itself still predicts
  `O(n)` here — this specific case remains a live analyzer gap (see
  "Bug 1"-style undercounting, not overcounting), separate from the constant-array
  false positives described above.
- A broader regex sweep across all 86 for other 2D-write patterns (`arr[i][j]=`,
  tuple-keyed dicts, nested list comprehensions) found no further cases.

This does not constitute a formal proof of tightness for all 86 — it's a
targeted check of the highest-risk pattern (nested-loop-fed hash/array growth),
not an exhaustive re-derivation of every bound from scratch. Treat `algo_n2_205`
as a demonstrated existence case, not a guarantee no others remain.

## Result

| Metric | Before | After |
|---|---|---|
| Space accuracy | 149/266 (56.0%) | 234/266 (88.0%) |
| Time accuracy | 199/266 (74.8%) | 199/266 (74.8%) — unaffected |

Files updated (identical content, kept in sync):
- `api/analyzer_diagnostics/ground_truth/ground_truth_chunk_*.json`
- `frontend/public/data/evaluation/processed/ground_truth_chunk_*.json`

Note: `frontend/public/data/evaluation/processed/dataset.zip` and
`tasty_ground_truth_jsons_2.7z` are archival backups of the old dataset and
were **not** modified — regenerate them from the corrected loose JSON files
if anything in the pipeline reads from the archives instead of the JSONs.

`MIN_SPACE_ACCURACY` in `regression_check.py` / `tests/test_analyzer_regression.py`
is still set to the old 0.50 floor and was intentionally left as-is — raise it
once you're ready to lock in the corrected baseline.

## Analyzer-side fixes (not a dataset change)

Everything above corrected the *dataset*. The entries below are the first
pass at the *analyzer* limitations the dataset audit surfaced but
deliberately left unaddressed (the "known, separate analyzer limitation"
notes throughout this file), plus a couple of others found the same way
(re-run every ground-truth sample through the analyzer, diff against
expected, inspect the mismatched source). All five are in
`complexity_analyzer/` (both vendored copies -- `api/analyzer_diagnostics/`
and `frontend/public/python_engine/` -- kept byte-identical as before) and
are covered by inline comments at each change site:

1. **`.get()` receiver-blind worst-case.** Any `.get()` call was treated as
   a dict lookup (worst-case O(n) for hash collisions), including
   `queue.Queue.get()` and other non-dict APIs. A single `Queue.get()`
   inside an O(n) loop silently inflated the whole function to O(n^2).
   Now gated on the receiver actually being a confirmed dict
   (`ast_node_visitors.py`).
2. **List-comprehension constant bound.** `[0 for i in range(k)]` only
   recognized a literal int (`range(26)`) as a constant bound, not a
   named module constant (`range(MAX_CHAR)`) -- the exact pattern this
   file's space audit flagged and left unfixed. Now uses the same
   `_is_constant_expr` check the plain-loop and `[x]*k` paths already used
   (`ast_node_visitors.py`).
3. **`visit_BinOp` overwriting `visit_Assign`'s correct answer.**
   `frequency = [0] * MAX_CHAR` was correctly classified O(1) by
   `visit_Assign`, but `generic_visit` then re-visits the same `BinOp`
   node, and `visit_BinOp` unconditionally treated any `List * anything`
   as O(n) "Concatenation / Repetition" -- silently overwriting the
   correct classification. Now checks the multiplier for constant-ness
   before overwriting (`ast_node_visitors.py`).
4. **Constructor calls assumed O(n) space by capitalization alone.**
   `x = SomeClass()` was flagged O(n) space purely because the callee
   name starts with a capital letter, regardless of arguments --
   misclassifying bare constructors like `PriorityQueue()`, `Stack()`.
   Now only applies when a linear-typed argument is actually passed in
   (`signature_recorder.py`).
5. **Constant detection was name-only, not AST-verified.** `_is_constant_expr`
   guessed constant-ness purely from naming convention (`MAX_CHAR`,
   `ALPHABET`, all-caps) and explicitly excluded short names (`R`, `C`, `M`,
   `N`, ...) since those are also the common convention for an actual input
   dimension. Added an AST scan for real module-level literal-int/float
   assignments (`analyzer.py`, populated once in `analyze_source_code`),
   consulted for names *outside* that short-name blocklist (the blocklist
   itself is kept -- overriding it for `R`/`C`/`M`/`N` regressed more cases
   than it fixed, see commit history). Net effect on this dataset is
   neutral since every short-name collision here is already covered by
   the blocklist, but it now correctly resolves other/longer constant
   names an AST scan can see but a naming heuristic can't.
6. **`code_preprocessor.py` sync.** The two vendored copies had silently
   diverged: `frontend/public/python_engine/` already had backtracking
   placement-pattern detection (N-Queens/Sudoku-style `for ... range(n): if
   <valid>: recurse` and bitmask/counter variants) that
   `api/analyzer_diagnostics/` did not. This is what the O(2^n)/O(n!)
   classes were actually missing -- it took O(2^n) from 33.3%→100.0% and
   O(n!) from 50.0%→100.0% on this dataset. Copied forward into
   `api/analyzer_diagnostics/` so both copies match again.

## Result (analyzer fixes)

| Metric | Before | After |
|---|---|---|
| Time accuracy | 199/266 (74.8%) | 204/266 (76.7%) |
| Space accuracy | 235/266 (88.3%) | 242/266 (91.0%) |
| O(1) time | 30.8% | 30.8% -- unaddressed, see below |
| O(2^n) time | 33.3% | 100.0% |
| O(n!) time | 50.0% | 100.0% |

Regenerated via `python tests/generate_accuracy_report.py` and
`pytest tests/test_analyzer_regression.py` (274 passed against the existing
70%/80% floors).

**Not fixed / still open:** O(1) time accuracy is unchanged. The remaining
mismatches are a mix of (a) genuinely-quadratic-but-generously-labeled
ground truth (Python string concatenation via `+=` in a loop really is
O(n) per call, i.e. O(n^2) total across a loop -- several dataset entries
label the enclosing function O(n) based on algorithmic intent, not literal
per-line cost) and (b) a handful of O(n^2)/O(2^n)/O(n!)/O(V+E) cases not
yet root-caused. Weakening the analyzer to match (a) would make it
pedagogically wrong, so those were deliberately left alone rather than
"fixed" to move the accuracy number.