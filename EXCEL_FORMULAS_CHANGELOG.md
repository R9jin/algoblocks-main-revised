# Excel exports: real formulas instead of pasted-in numbers

Both "Download Excel" actions previously wrote finished numbers into cells.
Double-clicking a precision score or a cohort TSR showed a literal value, not
the arithmetic behind it. This change makes every derived cell a live Excel
formula over raw-data sheets in the same workbook.

## Files changed

| File | Change |
| --- | --- |
| `api/services/admin_analytics_service.py` | Emits per-submission raw rows |
| `frontend/src/utils/excelReport.js` | Two new helpers: `sheetRefs`, `planKeyValueSheet` |
| `frontend/src/pages/EvaluationSuite.jsx` | Benchmark export rewritten (was 100% static) |
| `frontend/src/pages/AdminUserManagement.jsx` | Learning Impact export rewritten |

`frontend/src/utils/regressionReport.js` was already fully formula-driven and
is unchanged.

---

## 1. Dataset testing — Complexity Analyzer Benchmark Report

This export had **no formulas at all**. Precision, recall, F1, support, the
macro/weighted averages and all four accuracy figures were written as
pre-formatted strings like `"85.0%"`.

### Now

**Raw sheets** (the only typed-in values):

- `Full Algorithm Results` — one row per algorithm: the ground-truth label, the
  predicted label, whether the equivalence check passed, processing time, peak
  memory, explanation, source.
- `Line-Level Results` — one row per analyzed statement.

**Computed sheets** (every number a formula):

- Four validation matrices, each with explicit `TP`, `FP`, `FN`, `Support`
  columns so the tally is visible, not just its result:

  ```
  TP        =COUNTIFS('Full Algorithm Results'!$D$2:$D$34,"O(n)",
                      'Full Algorithm Results'!$E$2:$E$34,"O(n)")
  FP        =COUNTIFS('Full Algorithm Results'!$E$2:$E$34,"O(n)")-B5
  FN        =COUNTIFS('Full Algorithm Results'!$D$2:$D$34,"O(n)")-B5
  Support   =B5+D5
  Precision =IF(B5+C5=0,0,B5/(B5+C5))
  Recall    =IF(E5=0,0,B5/E5)
  F1-Score  =IF(F5+G5=0,0,2*F5*G5/(F5+G5))
  ```

  Macro average skips zero-support classes
  (`SUMPRODUCT((support>0)*precision)/COUNTIF(support,">0")`); weighted average
  is `SUMPRODUCT(precision,support)/SUM(support)`. This matches
  `generateClassificationReport()` in `analyzer.worker.js` term for term,
  including its rule that a class with no true instances scores 0.00 across the
  board and is excluded from both averages.

- `Summary` — counts as `COUNTIF`, then ratios referencing those count cells by
  address (`=B9/B8`), the way the table would be built by hand. Timing figures
  are `AVERAGE` / `MEDIAN` / `PERCENTILE` / `MAX` over the per-algorithm column;
  throughput divides the count cell by the execution-time cell.

Only three run-level scalars are typed in, because no cell range exists to
derive them from: total wall-clock seconds, total source lines, dataset name.

`PERCENTILE` (the pre-2010 spelling) is used deliberately — it is
linear-interpolated, exactly what `calcPercentile()` in the worker does, and it
needs no `_xlfn.` prefix.

---

## 2. User management — Learning Impact Report

Partly formula-driven already, but the Respondents and Learning Path Detail
sheets were pasted values, and the cohort TSR/AES/ROG were **weighted
approximations over already-averaged rows** — the old code said so in a comment.

The root cause was upstream: `get_cohort_overview` only ever returned averages,
so the client had nothing finer to compute from.

### Backend

`_submission_raw_row()` emits one flat row per submission, and the overview
payload now carries a `submissions` array. Each row holds resolved raw
observations — tests passed/total, final AES, ROG, per-category test counts,
status, code-unchanged flag — never an average.

The TSR passed/total resolution was extracted into `_resolve_tsr_counts()` and
is now shared with `_submission_metrics()`, so the raw rows cannot drift from
the aggregate that is computed from them.

### Workbook chain

```
Submissions          raw: one row per activity submission
     |  AVERAGEIF / SUMIFS / COUNTIFS keyed on the email cell in each row
     v
Respondents   Learning Path Detail   Per-Module Breakdown
     |  AVERAGE / SUM / COUNTA over those columns
     v
Summary

Pre-Post Test Data   raw: each respondent's two scores
     |  AVERAGE / STDEV.S / T.TEST, Cohen's d, Hake's g
     v
Summary
```

Three per-submission rules are written out in the cells rather than applied
before export:

```
TSR (%)           =IF(AND(ISNUMBER(H2),ISNUMBER(I2),I2>0),H2/I2*100,"")
ROG Counted       =IF(AND(ISNUMBER(K2),ISNUMBER(L2),L2>0),L2,"")
Counted as Passed =IF(OR(AND(ISNUMBER(K2),K2>=50),F2="passed"),1,0)
```

A blank TSR cell means that submission had no scored tests, so it drops out of
every `AVERAGEIF` above — exactly the submissions the backend excludes.

Because the averages are now taken over real submissions rather than over
per-module means, the cohort and per-respondent TSR/AES are **exact**, not
approximations.

### Bug fixed along the way

The assessment section wrote `STDEV.S(...)` and `T.TEST(...)` without the
`_xlfn.` prefix. ExcelJS stores formula text verbatim and Excel requires that
prefix for post-2007 functions, so those cells were likely breaking on open.
`regressionReport.js` already got this right and explains why. Now corrected.

### Fallback

If the backend does not send `submissions` (older deployment), the export falls
back to the previous behaviour: formulas over the Respondents sheet, weighted by
activity count. Still formula-driven, but the TSR/AES weighting is approximate,
so the Summary sheet says which mode produced it. Deploy the backend change with
the frontend to get the exact path.

---

## Verification

Both exporters were run against mock data with a stand-in for ExcelJS, and every
formula cell was parsed and evaluated to confirm it reproduces its own cached
value:

- Benchmark export: **528 formula cells, 0 mismatches**. All four matrices
  reproduce `generateClassificationReport` exactly.
- Learning Impact export: **447 formula cells, 0 mismatches**. Cohort Summary,
  all 6 respondents × 9 metrics, all 3 modules and all 15 respondent-module rows
  match the backend's own `_submission_metrics` output, with the fixture built by
  calling the real Python aggregation functions.
- Edge cases checked: empty cohort, no statement-level data, a single algorithm,
  and the no-raw-submissions fallback. No crashes.

Cached values are the backend's figures (rounded to 1 dp as the dashboard shows
them); the formulas compute at full precision. Cell number formats mean the
displayed value is identical either way, so recalculating in Excel does not shift
any number shown in the PDF or on screen.

## Worth knowing

Every formula cell carries the server's value as a cached result, so the numbers
read correctly before Excel recalculates. Recalculation reproduces them rather
than changing them — that was the point of mirroring the backend definitions
term for term instead of writing "better" statistics.

---

# Addendum: AES and ROG calculated in every submission row

The Learning Impact export already computed each submission's TSR in its own
cell, but **AES and ROG were typed-in values** copied from the database, so a
panelist clicking an AES cell saw a literal. Every submission row on the
`Submissions` sheet now carries the whole chain as live formulas.

## Files changed

| File | Change |
| --- | --- |
| `api/services/admin_analytics_service.py` | `_submission_raw_row` also sends the raw AES/ROG inputs: `initial_aes`, `latest_aes`, target / baseline / latest time and space complexity strings |
| `frontend/src/utils/submissionWorkings.js` | **New.** Column layout, formulas, cached results and the `AES-ROG Reference` sheet |
| `frontend/src/pages/AdminUserManagement.jsx` | Submissions block now uses the module; two reconciliation rows added to Summary |

## Formula chain (one row per submission, left to right)

```
TSR %             =IF(AND(ISNUMBER(H2),ISNUMBER(I2),I2>0),H2/I2*100,"")
Functional TSR    =IF(funcTotal>0, funcPassed/funcTotal, 1)
Weight (x6)       lookup of each Big-O string in 'AES-ROG Reference'
Time Ratio        =MIN(1, targetTimeWeight / actualTimeWeight)
Space Ratio       =MIN(1, targetSpaceWeight / actualSpaceWeight)
Efficiency        =(TimeRatio + SpaceRatio) / 2
Latest AES        =INT(FunctionalTSR * Efficiency * 100)
Best Earlier AES  =IF(recordedFinal > recordedLatest, recordedFinal, "")
Final AES         =MAX(LatestAES, BestEarlierAES)
Baseline AES      =INT(BaselineEfficiency * 100)         (starter solution, TSR = 1)
ROG               =MAX(0, FinalAES - BaselineAES)        (optimization activities only)
```

These are the rules `ActivityApp.jsx` applies on "Run Tests" (`getComplexityWeight`,
`timeRatio` / `spaceRatio`, `Math.floor`, `Math.max`).

## Check columns

Each recalculated value sits beside the value the app recorded, with an
`OK` / `DIFF` / `n/a` check column (latest AES, final AES, baseline AES, ROG).
Summary counts the DIFF rows for Final AES and ROG; 0 means every figure
reproduces exactly. Older records that lack the new fields fall back to the
recorded value, so their numbers do not change.

## Things worth knowing

* **Final AES** is the best AES across attempts. Earlier attempts are not stored,
  so their best is taken from the recorded final AES; the latest attempt is fully
  recalculated.
* **Baseline AES** uses the value the app recorded. That is the learner's *first
  evaluation* (failed tests included), so it is often lower than the starter's
  complexity alone would give. The starter's AES is recalculated beside it
  (TSR assumed 1) as information only; it does not feed ROG.
* **Unchanged-code resubmissions** (`Code Unchanged = Yes`): the app freezes the
  final AES at its earlier value, so the formula uses that value and the ROG
  stays frozen with it.
* The AES uses **functional** TSR; the dashboard TSR uses **all** tests. Both are
  visible in separate columns.
* Weights are looked up from a visible table (`AES-ROG Reference`) mirroring
  `getComplexityWeight()` pattern for pattern, so the table can be shown to the
  panel.

## Verification

Simulated 120 submissions (regular and optimization, multiple attempts, 15
different Big-O spellings including unrecognised text), recalculated in
LibreOffice: 3,364 formulas, 0 errors, and all 6,360 cells on the Submissions
sheet equal the expected values. The recalculated AES and ROG match an
independent re-implementation of the `ActivityApp.jsx` math on every row.

## Verification on real data (2026-09-29 export, 3,055 submissions)

The first version of this change moved the cohort figures (Avg AES 91.8 -> 91.9,
Avg ROG +16.9 -> +17.2) because it ignored the app's unchanged-code freeze: 12
submissions had a recalculated final AES above the frozen recorded one. Fixed in
`submissionWorkings.js`. After the fix, rebuilt from the same 3,055 rows and
recalculated in LibreOffice (85,547 formulas, 0 errors):

* Final AES, latest AES and ROG differ from the recorded values in **0** rows.
* Avg AES 91.78 and Avg ROG +16.86 (n' = 459), identical to the 09-25 export.
* Per-row Final AES, ROG counted / eligible, counted-as-passed and TSR match the
  09-25 export on every row.
