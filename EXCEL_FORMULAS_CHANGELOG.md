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
