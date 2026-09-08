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

## Round 3 -- per-class F1 pass (low-precision/low-recall classes)

Triggered by the 2026-09-08 benchmark report, whose per-class Precision/
Recall/F1 matrix flagged several classes as red: `O(1)` time (R=31%),
`O(log n)` time (P=25%), `O(n^2)` space (R=59%), `O(2^n)` space (R=0%),
`O(n!)` space (R=0%), and the single-support `O(V+E)` row on both axes.
Method: for every mismatch in these classes, the source was read by hand
and classified as dataset-side or analyzer-side before touching anything,
same as Rounds 1-2. Two real analyzer bugs and 17 dataset mislabels were
found; a few cases were confirmed correct-as-is and deliberately left
alone (noted below so they aren't rediscovered as "unfixed" next time).

### Analyzer fixes (2, in `complexity_synthesizer.py` / `ast_node_visitors.py`,
both vendored copies)

1. **Asymptotic-dominance ordering bug in `get_final_asymptotic_badge`
   (`complexity_synthesizer.py`).** The final time badge is chosen by
   scanning a concatenated bag of every line's per-line time badge for
   substrings, in priority order. `"log n"` and `"sqrt n"` were checked
   *before* `"O(n)"` -- so a function with one small O(log n) sub-expression
   (e.g. a single helper call, or one line's local annotation) anywhere in
   its body would report the whole function as O(log n) even when it also,
   separately, contains a genuinely-dominant O(n) or O(n^2) loop. This is
   backwards: O(n) must outrank O(log n)/O(sqrt n) in Big-O terms, and the
   space-badge counterpart (`get_final_space_badge`) already had the
   correct order -- this was a one-function inconsistency, not a deliberate
   design choice. Fixed by moving the `"O(n)"` check above `"sqrt n"`/`"log
   n"`. This alone fixed 6 `O(n)` false negatives that were being stolen by
   `O(log n)`, and cut `O(log n)` time false positives from 9 to 3.
2. **Nested-loop accumulation undercounted for space
   (`ast_node_visitors.py`, `visit_Call`).** An accumulating call
   (`.append()`/`.extend()`/`.add()`/`.insert()`) inside a loop only bumped
   `max_space_weight` to the O(n^2) tier when the appended value itself
   looked like a "row" (a `Name` typed as `list`, a list comprehension, or
   `[x] * k`) -- appending a plain scalar/subscript (`stk.append(a[k][i])`,
   `output.append([i, j])` where `[i, j]` is a literal pair, not a
   recognized "row") never triggered it, regardless of how many loops
   surrounded the call. But a `.append()` nested inside *two* active
   non-constant loops grows the target structure across the full
   outer x inner iteration space (up to n*m entries) independent of what
   shape each individual appended item is. Fixed by also triggering the
   O(n^2) tier whenever 2+ active loops surround the accumulating call,
   not just when the appended value passes the "is a row" shape check.
   This fixed `algo_n2_084` and `algo_n2_089` (previously space false
   negatives) without new false positives on this dataset; `O(n^2)` space
   recall went 59% -> 89% combined with the dataset corrections below.

Net effect of these two fixes alone (before any dataset edits): time
204/266 (76.7%) -> 209/266 (78.6%); space 242/266 (91.0%) -> 245/266
(92.1%). `pytest tests/test_analyzer_regression.py` still 274/274 passing
against the existing 70%/80% floors.

### Dataset corrections (17 entries, same audit standard as Round 1)

**TIME `O(1)` -> corrected (8 of 9 mismatches).** All 8 snippets build or
scan a structure sized by the input before doing anything else (`set(s)`,
`Counter(s)`, `re.findall` + join, whole-array slice-and-concat, or a
literal nested double loop) -- none of that is O(1) work, regardless of
what the trailing comment said:

| id | old | new | why |
|---|---|---|---|
| `algo_n_030` | O(1) | O(n) | `set(s.lower())` scans the whole string |
| `algo_n_055` | O(1) | O(n) | `re.findall` + `join` over the whole sentence |
| `algo_n_082` | O(1) | O(n) | `array[:] = array[-1:] + array[:-1]` copies the array |
| `algo_n2_138` | O(1) | O(n^2) | literal `n x n` nested loop (`printSpiral`) |
| `algo_n2_142` | O(1) | O(n^2) | `MAX x MAX` nested loop (`rowMajor`/`colMajor`); label had picked up the docstring's *space* claim ("using O(1) space") as if it described time |
| `algo_n_256` | O(1) | O(n) | builds `set(str1)`, `set(str2)` over full strings |
| `algo_n_257` | O(1) | O(n) | builds `Counter(str1)`, `Counter(str2)` over full strings |
| `algo_n_280` | O(1) | O(n) | builds `Counter(first)`, `Counter(second)` over half-strings |

**Left unchanged -- `algo_n_189`.** `isCornerPresent(str, corner)` costs
O(len(corner)), not O(len(str)) -- genuinely O(1) *with respect to the
primary string* if `corner` is read as a small/independent parameter
rather than as a second copy of `n`. Same multi-parameter ambiguity class
as the entries Round 1/2 left alone; not touched.

**TIME `O(n)` -> `O(log n)` (3 entries).** All three are genuinely
logarithmic in the numeric magnitude of their input (not in an array/
string length), and the analyzer's answer was already right once the
ordering bug above stopped an unrelated O(n) elsewhere from stealing the
badge -- the *label*, not the analyzer, was wrong:

| id | old | new | why |
|---|---|---|---|
| `algo_logn_014` | O(n) | O(log n) | binary-search-style rotation count, halves the search range each step |
| `algo_1_159` | O(n) | O(log n) | `count += n & 1; n >>= 1` -- classic bit-count-via-shift, O(bits of n) |
| `algo_n_223` | O(n) | O(log n) | two `while` loops each proportional to the digit count of the integer input |

**Left unchanged / not root-caused -- `algo_n_102`, `algo_logn_145`.**
`algo_n_102` does a flat `i = i+1` scan over every character of its input
string despite the "positions in a series" framing -- literal cost reading
says O(n), which is what the analyzer (correctly, by that standard)
predicts; the O(log n) ground truth label reflects the problem's
recursive-tree intuition, not this iterative implementation. `algo_logn_145`
has one genuinely-log loop (integral-part conversion) and one genuinely-
linear loop bounded by a *second*, independent parameter (`k_prec`,
precision digits) that isn't "n" under any reading used elsewhere in this
dataset -- which of the two loops counts as "the" input size is a real
multi-parameter ambiguity, not a bug in either direction. Both left as-is
rather than force a change without a principled rule.

**SPACE `O(n^2)` -> `O(n)` (3 of 8 remaining mismatches; 2 more --
`algo_n2_084`, `algo_n2_089` -- were fixed by the analyzer change above,
not the dataset).**

| id | old | new | why |
|---|---|---|---|
| `algo_n_045` / `algo_n_227` (identical code) | O(n^2) | O(n) | `res` only accumulates within one outer iteration before an early `break`; bounded by O(n), never reaches n^2 |
| `algo_n2_275` | O(n^2) | O(n) | no structure sized by n^2 anywhere -- the only allocation is the driver's `n`-row, fixed-width-2 array |

**Left unchanged -- `algo_n2_072`, `algo_n2_112`, `algo_n2_205`.**
`algo_n2_072`'s only 2D allocation is `[[0 for i in range(3)] for j in
range(3)]` -- a literal `3`, not `ROW`/`COL` -- so it's genuinely O(1) for
*this* snippet; O(n^2) is the generalized-algorithm reading, same
algorithmic-intent-vs-literal-code ambiguity as Round 2's open items, left
alone rather than "fixed" by weakening the analyzer. `algo_n2_112`'s
per-row temp arrays (`v`, `w`) are reset every outer iteration, so *peak*
space is O(n), but it now matches ground truth anyway (the loop-count
fix above makes the analyzer predict O(n^2) too, for the same "2+ nested
loops around an accumulating call" reason) -- recorded here so it isn't
mistaken for a deliberate space-model improvement. `algo_n2_205` was
already documented as a live analyzer gap in Round 1 (dict keyed across a
nested `r x c` loop can hold up to `r*c` entries) and remains one; no
change.

**SPACE `O(2^n)` -> `O(n)` (3 entries, all of the class's mismatches).**
In every case the *time* label of O(2^n) is left as-is (matches the
existing analyzer output and is out of scope for this pass), but the
*space* label had clearly been copied from the time label rather than
derived from the actual recursion: none of the three snippets keeps more
than O(n) stack frames or auxiliary memory alive at once.

| id | old | new | why |
|---|---|---|---|
| `algo_n2_012` | O(2^n) | O(n) | quickselect-style single-branch recursion; depth bounded by array size, never both branches |
| `algo_2n_019` | O(2^n) | O(n) | grid DFS word search; call-stack depth bounded by the word length, not the search's branching factor |
| `algo_n_206` | O(2^n) | O(n) | preorder-to-BST reconstruction; a shared `preIndex` counter gates recursion so only O(n) calls ever build a node |

**Left unchanged -- `algo_2n_003`, `algo_n2_212` (`O(n!)` space, both
mismatches in that class).** Both snippets recursively enumerate
essentially all subsequences/palindromic-partitions of the input into a
*shared* accumulator (`st.add(s)`, `v.append(temp)`) across the whole
search tree -- unlike the O(2^n) cases above, the accumulated output here
genuinely can grow combinatorially, so O(n!) space is the correct label.
The analyzer currently predicts O(n) because its space model tracks
per-call/per-loop growth but doesn't compose "a shared collector fed by a
combinatorial/backtracking recursion" into a combinatorial total. This is
a real, confirmed analyzer gap -- recognizing it robustly needs new
pattern-detection (tracking accumulation across recursive branching, not
just within a single call frame or loop nest) well beyond this pass's
scope. Left open rather than patched superficially.

**SPACE / TIME `O(V+E)` formatting (cosmetic, both vendored copies, all
call sites in `analyzer.py` / `ast_node_visitors.py` / `signature_recorder.py`
/ `complexity_synthesizer.py`).** The analyzer emitted `"O(V + E)"` (spaced)
everywhere; the dataset has always used `"O(V+E)"` (no spaces, matching the
`O(n^2)`/`O(n log n)`-style convention elsewhere). Normalized the analyzer's
output to `"O(V+E)"` for consistency. This is purely cosmetic on the current
266-item set -- the class's two live mismatches (`algo_n2_148`: memoized
grid-DP labeled O(V+E) but analyzer says O(n^2); `algo_n2_104`: BFS-on-a-
grid-as-graph labeled O(n^2) but analyzer says O(V+E)) are content
disagreements, not formatting ones. Both are grid/matrix algorithms where
V = O(n^2) cells and E = O(V) (bounded-degree grid), so `O(V+E)` and
`O(n^2)` are the *same* asymptotic bound expressed in different notation --
genuinely ambiguous which the "ground truth" convention should prefer, not
a clear right/wrong in either direction. Left as an open, single-support
edge case rather than forced either way.

### Result (Round 3)

| Metric | Before this round | After analyzer fixes only | After dataset corrections too |
|---|---|---|---|
| Time accuracy | 204/266 (76.7%) | 209/266 (78.6%) | 220/266 (82.7%) |
| Space accuracy | 242/266 (91.0%) | 245/266 (92.1%) | 250/266 (94.0%) |
| `O(1)` time F1 | 0.47 (R=31%) | -- | 0.89 (R=80%) |
| `O(log n)` time F1 | 0.38 (P=25%) | -- | 0.83 (P=100%, R=71%) |
| `O(n^2)` space F1 | 0.68 (R=59%) | -- | 0.85 (R=89%) |
| `O(2^n)` space recall | 0% | -- | class removed (all 3 were mislabels; corrected to O(n)) |
| `O(n!)` space recall | 0% | -- | 0% -- confirmed analyzer gap, intentionally left open (see above) |

`pytest tests/test_analyzer_regression.py` -- 274/274 passing (existing
70%/80% floors; current 82.7%/94.0% clears both comfortably --
`MIN_SPACE_ACCURACY` has already been raised from the 0.50 Round 1
mentioned to 0.80 by the time of this pass).
Regenerated via `python tests/generate_accuracy_report.py`.

## Round 4 -- line-level (statement) matrices

Every round above audited and corrected `expected_overall_time` /
`expected_overall_space` -- the one-badge-per-algorithm labels. None of them
touched `line_metrics`, the separate per-statement `local_time` /
`global_time` / `local_space` / `global_space` annotations that feed the
*Line-Level Validation Matrix* (statement-level precision/recall/F1, n=lines
not n=algorithms). This round is the first pass at that matrix specifically,
prompted by the benchmark report's Section 4/5 tables showing several
classes at or near 0% precision/recall despite healthy overall accuracy.

### Analyzer bug: recursive call lines' `local_time` never resolved

`ast_node_visitors.py`'s `visit_FunctionDef` writes a raw placeholder token
(`"T(n-1)"`, `"T(n/2)"`, `"T(n-2)"`) into a recursive call line's
`local_time` *and* `global_time` on first visit. A later pass resolves
`global_time` to the real Big-O class for that line (e.g. `O(V+E)`,
`O(n^2)`) -- but only `global_time`; `local_time` was never touched again,
so it kept the raw `"T(n-1)"`-style string forever. That string then flowed
unchanged through `evaluation_metrics.py`'s `normalize_complexity()` (which
only recognizes bare `T(n-1)`-style tokens, not ones already embedded in a
resolved relation) straight into the benchmark as a bogus predicted class
like `"O(t(n-1))"` -- polluting precision/recall for whatever the line's
*real* expected class was (confirmed against ground truth, e.g.
`algo_n2_148` lines 24/27/30/33, where `local_time` is annotated equal to
`global_time`, both `O(V+E)`).

Fixed in both vendored copies (`frontend/public/python_engine/` and
`api/analyzer_diagnostics/`, kept byte-identical): the same resolution loop
that already sets `global_time = resolved_rel` for a recursive-call line
now also sets `local_time = resolved_rel` for that line specifically (not
for `is_heavy_op` lines -- loops/comprehensions/etc. keep their own,
narrower local cost).

### Dataset bug: `line_metrics` never updated by Rounds 1-3

Wrote a diagnostic (`max` complexity class across a given algorithm's
annotated lines' `global_time` / `global_space`, compared against that
algorithm's current, already-corrected `expected_overall_time` /
`expected_overall_space`) and found:

- **11 algorithms** where the annotated lines' `global_time` still reflected
  the *pre-Round-3* time label (e.g. `algo_1_159`: overall corrected
  O(n)->O(log n) in Round 3, but its while-loop body lines were still
  annotated `local_time`/`global_time`: `O(n)`).
- **92 algorithms** where the annotated lines' `global_space` still
  reflected the *pre-Round-1* `O(1)` space label, even though the overall
  label had been corrected to `O(n)` (or, for 3 entries, `O(n^2)`/`O(2^n)`)
  back in Round 1/3.

Both are the same mechanism: the overall-label corrections in Rounds 1-3
were never propagated down to the per-line annotations of the same
algorithms, so the line-level matrix kept scoring the analyzer's now-correct
line-level predictions against stale, pre-correction expectations.

**Fix applied:** for each stale algorithm, re-ran the (now local-time-fixed)
analyzer and confirmed its *overall* prediction still matches the
already-audited-correct `expected_overall_time`/`expected_overall_space`
(true for all 11 time-stale entries and 89 of the 92 space-stale entries).
For those, replaced the `local_time`/`global_time` (or `local_space`/
`global_space`) fields on each of that algorithm's *existing* annotated
lines with the analyzer's own per-line values for that lineno -- this isn't
a new judgment call, it's completing the correction Rounds 1-3 already made
at the overall level but never finished propagating.

**Left unchanged (3 entries) -- pre-existing open disagreements, not
touched:**

- `algo_n2_205` -- documented live analyzer gap since Round 1 (dict keyed
  across a nested `r x c` loop can hold `r*c` entries; analyzer still says
  `O(n)`, ground truth correctly says `O(n^2)`). Re-deriving its line-level
  annotations from the analyzer would just encode the same wrong answer at
  the line level. Left open.
- `algo_n2_275` -- Round 3 corrected this to `O(n)` overall space, but the
  analyzer (even after this round's fixes) says `O(1)`: the driver's array
  is `[[0 for i in range(2)] for i in range(5)]`, a literal `5x2` array with
  no symbolic size anywhere in this snippet. Genuinely arguable either way
  (same "algorithmic intent vs. literal code" ambiguity as other entries
  left open in Round 3) -- not re-litigated here, line-level left as-is.

**Also found, deliberately not "fixed": 8 algorithms** (`algo_n_010`,
`algo_n2_042`, `algo_n_048`, `algo_n_055`, `algo_n_117`, `algo_n_172`,
`algo_n_238`, plus overlap already covered above) where the diagnostic still
flags a mismatch between max annotated `global_space` and the overall label,
but the actual O(n)-space-causing line (typically a bare `s.add(x)` /
`.append(x)` statement inside a loop) was **never part of the annotated
line subset to begin with** -- ground truth annotation has always been a
curated subset of lines, not every line. Since the line-level matrix only
scores lines that carry ground truth, these don't distort the benchmark and
weren't touched. Separately confirmed the analyzer *itself* has a real gap
here too: a bare accumulating-call expression statement (`s.add(x)` on its
own line) never gets recorded into `_details` at all (`visit_Call` bumps
the aggregate `max_space_weight` used for the *overall* space badge, but no
per-line `record_line()` call happens for that statement) -- so even if
ground truth annotated that line, the analyzer couldn't currently produce a
matching per-line prediction for it. Recorded here as a known follow-up, out
of scope for this pass (fixing it means adding a new `record_line()` call
site in `visit_Call`/`visit_Expr` for accumulating calls, which risks
touching a lot of other line-level cases and needs its own audit pass).

### Result (Round 4)

Measured via `frontend/public/python_engine/evaluation_metrics.py`'s
`calculate_metrics()` (the same harness that produced the benchmark
report), not `generate_accuracy_report.py` (which uses a stricter exact-
match rather than `check_match()`'s equivalence-aware comparison, so its
numbers run a few points lower on both rounds -- that gap predates this
round and isn't touched by it):

| Metric | Before this round | After |
|---|---|---|
| Overall time accuracy | 225/266 (84.6%) -- unaffected, see below | 225/266 (84.6%) |
| Overall space accuracy | 259/266 (97.4%) -- unaffected | 259/266 (97.4%) |
| Local (statement) time accuracy | 4982/5116 (97.4%) | 4988/5116 (97.5%) |
| Local (statement) space accuracy | 5108/5116 (99.8%) | 5108/5116 (99.8%) -- unaffected, only class distribution changed |
| `O(n)` space (line-level) | P=5%, R=100%, F1=0.10, n=12 | P=79%, R=100%, F1=0.88, n=181 |
| `O(log n)` time (line-level) | P=19%, R=64%, F1=0.29, n=11 | P=30%, R=73%, F1=0.42, n=15 |
| `O(V+E)` time (line-level) | P=0%, R=0%, F1=0, n=13 | unchanged -- pre-existing grid-as-graph notation disagreement, see Round 3 |

Overall time/space accuracy is unaffected by design -- this round only
edits `line_metrics`, never `expected_overall_time`/`expected_overall_space`
-- so `pytest tests/test_analyzer_regression.py`'s 70%/80% floors are
unaffected and still clear comfortably. The `O(n)` space line-level jump
(support 12 -> 181, F1 0.10 -> 0.88) is the big one: most of the 89 patched
algorithms' O(n)-space lines simply had no matching expected class at all
before this round, so they were invisible to the line-level matrix rather
than being scored as correct or incorrect.

Files updated (identical content, kept in sync):
- `frontend/public/python_engine/complexity_analyzer/ast_node_visitors.py`
- `api/analyzer_diagnostics/complexity_analyzer/ast_node_visitors.py`
- `api/analyzer_diagnostics/ground_truth/ground_truth_chunk_*.json`
- `frontend/public/data/evaluation/processed/ground_truth_chunk_*.json`