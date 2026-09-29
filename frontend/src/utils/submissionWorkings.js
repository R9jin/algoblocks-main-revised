// frontend/src/utils/submissionWorkings.js
//
// The per-submission "workings" behind the Learning Impact Excel report.
//
// Before this module the Submissions sheet only had TSR as a formula; AES and
// ROG were typed-in numbers copied off the database. A panelist who clicked an
// AES cell saw a literal. Now every submission row carries the whole chain as
// live formulas, left to right:
//
//   TSR            = tests passed / tests total                    (dashboard TSR)
//   Functional TSR = functional passed / functional total          (TSR inside AES)
//   Weights        = look up each Big-O string in 'AES-ROG Reference'
//   Time ratio     = MIN(1, target time weight  / actual time weight)
//   Space ratio    = MIN(1, target space weight / actual space weight)
//   Efficiency     = (time ratio + space ratio) / 2
//   Latest AES     = INT(Functional TSR x Efficiency x 100)
//   Final AES      = MAX(Latest AES, best earlier attempt); frozen when code unchanged
//   Baseline AES   = INT(baseline efficiency x 100)   (starter solution, TSR = 1)
//   ROG            = MAX(0, Final AES - Baseline AES)  (optimization activities only)
//
// These are the same rules ActivityApp.jsx applies when the learner presses
// "Run Tests" (getComplexityWeight, timeRatio/spaceRatio, Math.floor, Math.max).
// Each recomputed value is reconciled against the value the app recorded, and
// the check columns / Summary count any row where the two disagree.

import { getComplexityWeight } from "./asymptoticParser.jsx";

export const REF_SHEET = "AES-ROG Reference";

// Column order of the Submissions sheet. `group` picks the header colour.
export const SUB_COLUMNS = [
  // ---- who / what
  { key: "email", header: "Respondent ID", width: 16, group: "id" },
  { key: "module", header: "Module", width: 26, group: "id" },
  { key: "activity", header: "Activity", width: 26, group: "id" },
  { key: "type", header: "Type", width: 12, group: "id" },
  { key: "status", header: "Status", width: 12, group: "id" },
  { key: "unchanged", header: "Code Unchanged", width: 15, group: "id" },
  { key: "inRoster", header: "In Respondents", width: 16, group: "id" },
  // ---- TSR (all tests, as on the dashboard)
  { key: "tsrPassed", header: "Tests Passed", width: 13, group: "tsr" },
  { key: "tsrTotal", header: "Tests Total", width: 13, group: "tsr" },
  { key: "tsr", header: "TSR % (Passed / Total x 100)", width: 18, numFmt: "0.00", group: "tsr" },
  // ---- AES inputs
  { key: "funcPassed", header: "Functional Passed", width: 16, group: "aesIn" },
  { key: "funcTotal", header: "Functional Total", width: 16, group: "aesIn" },
  { key: "funcTsr", header: "Functional TSR (Passed / Total)", width: 18, numFmt: "0.0000", group: "aesIn" },
  { key: "tgtTime", header: "Target Time Complexity", width: 18, group: "aesIn" },
  { key: "tgtSpace", header: "Target Space Complexity", width: 18, group: "aesIn" },
  { key: "latTime", header: "Actual Time Complexity (latest run)", width: 20, group: "aesIn" },
  { key: "latSpace", header: "Actual Space Complexity (latest run)", width: 20, group: "aesIn" },
  // ---- weights (lookups)
  { key: "wTgtTime", header: "Weight: Target Time", width: 13, numFmt: "0", group: "weight" },
  { key: "wTgtSpace", header: "Weight: Target Space", width: 13, numFmt: "0", group: "weight" },
  { key: "wLatTime", header: "Weight: Actual Time", width: 13, numFmt: "0", group: "weight" },
  { key: "wLatSpace", header: "Weight: Actual Space", width: 13, numFmt: "0", group: "weight" },
  // ---- AES calculation
  { key: "timeRatio", header: "Time Ratio = MIN(1, Target / Actual)", width: 18, numFmt: "0.0000", group: "aes" },
  { key: "spaceRatio", header: "Space Ratio = MIN(1, Target / Actual)", width: 18, numFmt: "0.0000", group: "aes" },
  { key: "efficiency", header: "Efficiency = (Time + Space) / 2", width: 18, numFmt: "0.0000", group: "aes" },
  { key: "aesLatest", header: "Latest AES = INT(TSR x Efficiency x 100)", width: 20, numFmt: "0", group: "aes" },
  { key: "aesLatestRec", header: "Latest AES (recorded by app)", width: 16, numFmt: "0", group: "aes" },
  { key: "aesRec", header: "Final AES (recorded by app)", width: 16, numFmt: "0", group: "aes" },
  { key: "earlierBest", header: "Best Earlier-Attempt AES", width: 16, numFmt: "0", group: "aes" },
  { key: "aes", header: "Final AES = MAX(Latest, Earlier Best)", width: 20, numFmt: "0", group: "aes" },
  // ---- ROG calculation
  { key: "basTime", header: "Baseline Time Complexity (starter)", width: 20, group: "rog" },
  { key: "basSpace", header: "Baseline Space Complexity (starter)", width: 20, group: "rog" },
  { key: "wBasTime", header: "Weight: Baseline Time", width: 13, numFmt: "0", group: "rog" },
  { key: "wBasSpace", header: "Weight: Baseline Space", width: 13, numFmt: "0", group: "rog" },
  { key: "basTimeRatio", header: "Baseline Time Ratio", width: 14, numFmt: "0.0000", group: "rog" },
  { key: "basSpaceRatio", header: "Baseline Space Ratio", width: 14, numFmt: "0.0000", group: "rog" },
  { key: "basEff", header: "Baseline Efficiency", width: 14, numFmt: "0.0000", group: "rog" },
  { key: "baseAesCalc", header: "Starter AES = INT(Efficiency x 100), TSR assumed 1", width: 22, numFmt: "0", group: "rog" },
  { key: "initialRec", header: "Baseline AES (recorded by app)", width: 16, numFmt: "0", group: "rog" },
  { key: "baseAes", header: "Baseline AES used", width: 14, numFmt: "0", group: "rog" },
  { key: "rog", header: "ROG = MAX(0, Final AES - Baseline AES)", width: 20, numFmt: "0", group: "rog" },
  { key: "rogRec", header: "ROG (recorded by app)", width: 14, numFmt: "0", group: "rog" },
  { key: "rogCounted", header: "ROG Counted", width: 13, numFmt: "0.00", group: "rog" },
  { key: "rogEligible", header: "ROG Eligible", width: 13, numFmt: "0", group: "rog" },
  // ---- pass rule, checks, remaining raw fields
  { key: "countedPassed", header: "Counted as Passed", width: 16, group: "check" },
  { key: "latestCheck", header: "Check: Latest AES", width: 14, group: "check" },
  { key: "finalCheck", header: "Check: Final AES", width: 14, group: "check" },
  { key: "baseCheck", header: "Info: Baseline vs Starter Recalc", width: 18, group: "check" },
  { key: "rogCheck", header: "Check: ROG", width: 12, group: "check" },
  { key: "compPassed", header: "Complexity Passed", width: 16, group: "id" },
  { key: "compTotal", header: "Complexity Total", width: 16, group: "id" },
  { key: "hidPassed", header: "Hidden Passed", width: 14, group: "id" },
  { key: "hidTotal", header: "Hidden Total", width: 14, group: "id" },
  { key: "timestamp", header: "Timestamp", width: 22, group: "id" },
];

export const SUB_KEYS = SUB_COLUMNS.map((c) => c.key);

const GROUP_COLORS = {
  id: "5A1398",
  tsr: "1D4ED8",
  aesIn: "0F766E",
  weight: "0F766E",
  aes: "15803D",
  rog: "C2410C",
  check: "475569",
};

// ---- Complexity weights ----------------------------------------------------
// One row per substring getComplexityWeight() (asymptoticParser.jsx) tests for,
// in the order it tests them. The text is lower-cased with spaces removed, then
// the FIRST pattern found decides the weight; nothing found -> 6, the default
// ActivityApp passes. The lookup formula reads this table, so the numbers a
// panelist sees here are the numbers the workbook uses.
export const WEIGHT_TABLE = [
  ["n!", 9, "O(n!)"], ["n*t(n-1)", 9, "O(n!)"],
  ["2^n", 8, "O(2^n)"], ["2ⁿ", 8, "O(2^n)"], ["c^n", 8, "O(2^n)"], ["t(n-1)+t(n-2)", 8, "O(2^n)"],
  ["n^2", 7, "O(n^2)"], ["n²", 7, "O(n^2)"], ["n*n", 7, "O(n^2)"], ["n*m", 7, "O(n^2)"], ["m*n", 7, "O(n^2)"], ["t(n-1)+o(n)", 7, "O(n^2)"],
  ["nlogn", 6, "O(n log n)"], ["n*log", 6, "O(n log n)"], ["nlog", 6, "O(n log n)"], ["2t(n/2)+o(n)", 6, "O(n log n)"], ["t(n-1)+o(log", 6, "O(n log n)"],
  ["v+e", 5, "O(V+E)"], ["e+v", 5, "O(V+E)"], ["n+m", 5, "O(V+E)"], ["m+n", 5, "O(V+E)"],
  ["o(n)", 4, "O(n)"], ["o(m)", 4, "O(n)"], ["2t(n/2)+o(1)", 4, "O(n)"], ["t(n/2)+o(n)", 4, "O(n)"], ["t(n-1)+o(1)", 4, "O(n)"],
  ["√n", 3, "O(sqrt n)"], ["sqrt", 3, "O(sqrt n)"],
  ["logn", 2, "O(log n)"], ["log(n)", 2, "O(log n)"], ["log", 2, "O(log n)"], ["t(n/2)+o(1)", 2, "O(log n)"],
  ["o(1)", 1, "O(1)"],
];
const DEFAULT_WEIGHT = 6;

const DEFINITIONS = [
  ["Task Success Rate (TSR)", "Tests passed / tests total for one submission (every test type). A submission with no scored tests is left blank and drops out of every average."],
  ["Functional TSR", "Functional tests passed / functional total. This is the TSR that goes inside AES (complexity tests are excluded because they are already measured by the efficiency term). 1 when there are no functional tests."],
  ["Algorithmic Efficiency Score (AES)", "INT(Functional TSR x Efficiency x 100). Efficiency = (Time ratio + Space ratio) / 2, where each ratio = MIN(1, target weight / actual weight)."],
  ["Final AES", "The best AES across the learner's attempts = MAX(this attempt's calculated AES, the best earlier attempt). The earlier best is only known through the recorded Final AES, so it is the one input taken from the database. Exception: when Code Unchanged = Yes the app freezes the final AES at its earlier value (a resubmission of identical code cannot raise it), so the recorded value is used and the ROG stays frozen with it."],
  ["Refactoring Optimization Gain (ROG)", "MAX(0, Final AES - Baseline AES), for OPTIMIZATION activities only. The Baseline AES is the AES of the learner's first evaluation as the app recorded it (failed tests included), so it is used as stored. Beside it, the starter solution's AES is recalculated from its Big-O classes with TSR assumed 1; it equals the baseline when the first run passed every test and is higher when it did not (information only, it does not feed ROG)."],
  ["Check columns", "Latest AES, Final AES and ROG are each compared with the value the app stored. OK = identical, DIFF = different, n/a = one side missing (e.g. draft or older record). The Summary sheet counts DIFF rows. The baseline column is information only (see ROG above)."],
  ["Header colours", "Blue = TSR, teal = AES inputs and weights, green = AES calculation, orange = ROG calculation, grey = pass rule and checks."],
];

// Layout of the reference sheet (1-based rows), computed once so the
// formulas' ranges and the sheet itself can never disagree.
const TABLE_HEADER_ROW = DEFINITIONS.length + 5;
const TABLE_FIRST_ROW = TABLE_HEADER_ROW + 1;
const TABLE_LAST_ROW = TABLE_FIRST_ROW + WEIGHT_TABLE.length - 1;
const refRange = (col) => `'${REF_SHEET}'!$${col}$${TABLE_FIRST_ROW}:$${col}$${TABLE_LAST_ROW}`;
const PRIORITY_RANGE = refRange("A");
const PATTERN_RANGE = refRange("B");
const WEIGHT_RANGE = refRange("C");

export function addAesRogReferenceSheet(workbook) {
  const sheet = workbook.addWorksheet(REF_SHEET);
  sheet.columns = [{ width: 34 }, { width: 24 }, { width: 12 }, { width: 16 }, { width: 60 }];

  const title = sheet.getCell("A1");
  title.value = "How AES and ROG are calculated in this workbook";
  title.font = { bold: true, size: 13, color: { argb: "FF5A1398" } };

  DEFINITIONS.forEach(([label, text], i) => {
    const r = i + 3;
    sheet.getCell(`A${r}`).value = label;
    sheet.getCell(`A${r}`).font = { bold: true };
    sheet.getCell(`A${r}`).alignment = { vertical: "top" };
    sheet.mergeCells(r, 2, r, 5);
    sheet.getCell(`B${r}`).value = text;
    sheet.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(r).height = Math.max(30, Math.ceil(text.length / 95) * 15);
  });

  const head = sheet.getRow(TABLE_HEADER_ROW);
  ["Priority", "Text contains (lower-case, no spaces)", "Weight", "Class"].forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5A1398" } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  sheet.getCell(`E${TABLE_HEADER_ROW}`).value =
    `Weight lookup: the first row whose text appears in the Big-O string wins; no match gives ${DEFAULT_WEIGHT}.`;
  sheet.getCell(`E${TABLE_HEADER_ROW}`).alignment = { wrapText: true };

  WEIGHT_TABLE.forEach(([pattern, weight, cls], i) => {
    const r = TABLE_FIRST_ROW + i;
    sheet.getCell(`A${r}`).value = i + 1;
    // Stored as plain text so a leading "=" or "+" is never read as a formula.
    sheet.getCell(`B${r}`).value = pattern;
    sheet.getCell(`B${r}`).numFmt = "@";
    sheet.getCell(`C${r}`).value = weight;
    sheet.getCell(`D${r}`).value = cls;
  });
  return sheet;
}

/**
 * Formula turning a Big-O text cell into its weight, via the reference table.
 * Blank cell -> "" (so a missing input is not silently treated as weight 6).
 */
function weightFormula(cell) {
  const text = `LOWER(SUBSTITUTE(${cell}," ",""))`;
  const idx = `SUMPRODUCT(MIN(${PRIORITY_RANGE}+(1-ISNUMBER(FIND(${PATTERN_RANGE},${text})))*1000))`;
  return `IF(LEN(${cell})=0,"",IF(${idx}>1000,${DEFAULT_WEIGHT},INDEX(${WEIGHT_RANGE},${idx})))`;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const blank = (v) => v === null || v === undefined || v === "";
const weightOf = (text) => (blank(text) ? "" : (getComplexityWeight(text, DEFAULT_WEIGHT) || DEFAULT_WEIGHT));
const ratio = (target, actual) => (isNum(target) && isNum(actual) ? Math.min(1, target / actual) : "");
const mean2 = (a, b) => (isNum(a) && isNum(b) ? (a + b) / 2 : "");

/** The same chain the formulas encode, in JS -- used for cached results. */
export function computeWorkings(s) {
  const isOpt = s.type === "optimization";
  const funcTsr = (s.functional_total ?? 0) > 0 ? (s.functional_passed ?? 0) / s.functional_total : 1;
  const wTT = weightOf(s.target_time);
  const wTS = weightOf(s.target_space);
  const wLT = weightOf(s.latest_time);
  const wLS = weightOf(s.latest_space);
  const wBT = weightOf(s.baseline_time);
  const wBS = weightOf(s.baseline_space);

  const timeRatio = ratio(wTT, wLT);
  const spaceRatio = ratio(wTS, wLS);
  const efficiency = mean2(timeRatio, spaceRatio);
  const aesLatest = isNum(efficiency) ? Math.floor(funcTsr * efficiency * 100) : "";

  const aesRec = isNum(s.final_aes) ? s.final_aes : "";
  const aesLatestRec = isNum(s.latest_aes) ? s.latest_aes : "";
  const earlierBest = isNum(aesRec) && isNum(aesLatestRec) && aesRec > aesLatestRec ? aesRec : "";
  // An unchanged-code resubmission is frozen by the app at its prior final AES
  // (ActivityApp.jsx: isDuplicateCodeResubmission -> bestAes = final_aes), so
  // the new run does not lift it and the recorded value is the answer.
  const frozen = s.code_unchanged === true;
  const aes = !isNum(aesRec) ? "" : frozen ? aesRec : isNum(aesLatest) ? Math.max(aesLatest, isNum(earlierBest) ? earlierBest : 0) : aesRec;

  const basTimeRatio = isOpt ? ratio(wTT, wBT) : "";
  const basSpaceRatio = isOpt ? ratio(wTS, wBS) : "";
  const basEff = mean2(basTimeRatio, basSpaceRatio);
  const baseAesCalc = isNum(basEff) ? Math.floor(basEff * 100) : "";
  const initialRec = isNum(s.initial_aes) ? s.initial_aes : "";
  const baseAes = !isOpt ? "" : isNum(initialRec) ? initialRec : isNum(baseAesCalc) ? baseAesCalc : "";
  const rogRec = isNum(s.rog) ? s.rog : "";
  const rog = !(isOpt && isNum(aes)) ? ""
    : isNum(baseAes) ? Math.max(0, aes - baseAes)
    : isNum(rogRec) ? rogRec : aes;

  const cmp = (calc, rec) => (isNum(calc) && isNum(rec) ? (calc === rec ? "OK" : "DIFF") : "n/a");
  return {
    funcTsr, wTT, wTS, wLT, wLS, wBT, wBS, timeRatio, spaceRatio, efficiency, aesLatest,
    aesRec, aesLatestRec, earlierBest, aes, basTimeRatio, basSpaceRatio, basEff, baseAesCalc,
    initialRec, baseAes, rogRec, rog,
    latestCheck: cmp(aesLatest, aesLatestRec),
    finalCheck: cmp(aes, aesRec),
    baseCheck: isOpt ? (isNum(baseAesCalc) && isNum(initialRec) ? (baseAesCalc === initialRec ? "Same" : "First run differed") : "n/a") : "n/a",
    rogCheck: cmp(rog, rogRec),
  };
}

/**
 * One Submissions-sheet row as { key: value | { formula, result } }.
 * `sub` is the sheetRefs() object for this sheet (for local cell addresses),
 * `ctx` supplies moduleTitle(), the roster set and the Respondents ranges.
 */
export function buildSubmissionRow(s, i, sub, ctx) {
  const c = (key) => sub.localCell(key, i);
  const w = computeWorkings(s);
  const f = (formula, result) => ({ formula, result });

  const countsTsr = isNum(s.tsr_passed) && isNum(s.tsr_total) && s.tsr_total > 0;
  const countsRog = s.type === "optimization" && isNum(s.final_aes) && isNum(s.rog);
  const isOpt = `${c("type")}="optimization"`;
  const cmp = (a, b) => `IF(AND(ISNUMBER(${a}),ISNUMBER(${b})),IF(${a}=${b},"OK","DIFF"),"n/a")`;

  return {
    email: s.email,
    module: ctx.moduleTitle(s.moduleId),
    activity: s.activityId ?? "",
    type: s.type ?? "",
    status: s.status ?? "",
    unchanged: s.code_unchanged ? "Yes" : "No",
    inRoster: f(`IF(COUNTIF(${ctx.respEmailRange},${c("email")})>0,1,0)`, ctx.rosterIds.has(s.email) ? 1 : 0),

    tsrPassed: s.tsr_passed ?? "",
    tsrTotal: s.tsr_total ?? "",
    tsr: f(`IF(AND(ISNUMBER(${c("tsrPassed")}),ISNUMBER(${c("tsrTotal")}),${c("tsrTotal")}>0),${c("tsrPassed")}/${c("tsrTotal")}*100,"")`,
      countsTsr ? (s.tsr_passed / s.tsr_total) * 100 : ""),

    funcPassed: s.functional_passed ?? 0,
    funcTotal: s.functional_total ?? 0,
    funcTsr: f(`IF(${c("funcTotal")}>0,${c("funcPassed")}/${c("funcTotal")},1)`, w.funcTsr),
    tgtTime: s.target_time ?? "",
    tgtSpace: s.target_space ?? "",
    latTime: s.latest_time ?? "",
    latSpace: s.latest_space ?? "",

    wTgtTime: f(weightFormula(c("tgtTime")), w.wTT),
    wTgtSpace: f(weightFormula(c("tgtSpace")), w.wTS),
    wLatTime: f(weightFormula(c("latTime")), w.wLT),
    wLatSpace: f(weightFormula(c("latSpace")), w.wLS),

    timeRatio: f(`IF(AND(ISNUMBER(${c("wTgtTime")}),ISNUMBER(${c("wLatTime")})),MIN(1,${c("wTgtTime")}/${c("wLatTime")}),"")`, w.timeRatio),
    spaceRatio: f(`IF(AND(ISNUMBER(${c("wTgtSpace")}),ISNUMBER(${c("wLatSpace")})),MIN(1,${c("wTgtSpace")}/${c("wLatSpace")}),"")`, w.spaceRatio),
    efficiency: f(`IF(AND(ISNUMBER(${c("timeRatio")}),ISNUMBER(${c("spaceRatio")})),(${c("timeRatio")}+${c("spaceRatio")})/2,"")`, w.efficiency),
    aesLatest: f(`IF(ISNUMBER(${c("efficiency")}),INT(${c("funcTsr")}*${c("efficiency")}*100),"")`, w.aesLatest),
    aesLatestRec: w.aesLatestRec,
    aesRec: w.aesRec,
    earlierBest: f(`IF(AND(ISNUMBER(${c("aesRec")}),ISNUMBER(${c("aesLatestRec")})),IF(${c("aesRec")}>${c("aesLatestRec")},${c("aesRec")},""),"")`, w.earlierBest),
    // Final AES: nothing was evaluated -> blank; "Code Unchanged" = Yes -> the
    // app froze it at its prior value, so that value; otherwise the higher of
    // this attempt's calculated AES and the best earlier attempt. Falls back to
    // the recorded value only when the run's Big-O strings were not stored.
    aes: f(`IF(NOT(ISNUMBER(${c("aesRec")})),"",IF(${c("unchanged")}="Yes",${c("aesRec")},IF(ISNUMBER(${c("aesLatest")}),MAX(${c("aesLatest")},IF(ISNUMBER(${c("earlierBest")}),${c("earlierBest")},0)),${c("aesRec")})))`, w.aes),

    basTime: s.baseline_time ?? "",
    basSpace: s.baseline_space ?? "",
    wBasTime: f(weightFormula(c("basTime")), w.wBT),
    wBasSpace: f(weightFormula(c("basSpace")), w.wBS),
    basTimeRatio: f(`IF(AND(${isOpt},ISNUMBER(${c("wTgtTime")}),ISNUMBER(${c("wBasTime")})),MIN(1,${c("wTgtTime")}/${c("wBasTime")}),"")`, w.basTimeRatio),
    basSpaceRatio: f(`IF(AND(${isOpt},ISNUMBER(${c("wTgtSpace")}),ISNUMBER(${c("wBasSpace")})),MIN(1,${c("wTgtSpace")}/${c("wBasSpace")}),"")`, w.basSpaceRatio),
    basEff: f(`IF(AND(ISNUMBER(${c("basTimeRatio")}),ISNUMBER(${c("basSpaceRatio")})),(${c("basTimeRatio")}+${c("basSpaceRatio")})/2,"")`, w.basEff),
    baseAesCalc: f(`IF(ISNUMBER(${c("basEff")}),INT(${c("basEff")}*100),"")`, w.baseAesCalc),
    initialRec: w.initialRec,
    baseAes: f(`IF(NOT(${isOpt}),"",IF(ISNUMBER(${c("initialRec")}),${c("initialRec")},IF(ISNUMBER(${c("baseAesCalc")}),${c("baseAesCalc")},"")))`, w.baseAes),
    // ROG = MAX(0, Final AES - Baseline AES), optimization activities only.
    // Without any baseline (older export) the recorded ROG is used.
    rog: f(`IF(AND(${isOpt},ISNUMBER(${c("aes")})),IF(ISNUMBER(${c("baseAes")}),MAX(0,${c("aes")}-${c("baseAes")}),IF(ISNUMBER(${c("rogRec")}),${c("rogRec")},${c("aes")})),"")`, w.rog),
    rogRec: w.rogRec,
    // ROG counts for every evaluated optimization submission, zero gain
    // included; regular activities feed TSR and AES only.
    rogCounted: f(`IF(AND(${isOpt},ISNUMBER(${c("aes")}),ISNUMBER(${c("rog")})),${c("rog")},"")`, countsRog && isNum(w.rog) ? w.rog : ""),
    rogEligible: f(`IF(AND(${isOpt},ISNUMBER(${c("aes")}),ISNUMBER(${c("rog")})),1,0)`, countsRog && isNum(w.rog) ? 1 : 0),

    countedPassed: f(`IF(OR(AND(ISNUMBER(${c("aes")}),${c("aes")}>=50),${c("status")}="passed"),1,0)`,
      (isNum(w.aes) && w.aes >= 50) || s.status === "passed" ? 1 : 0),
    latestCheck: f(cmp(c("aesLatest"), c("aesLatestRec")), w.latestCheck),
    finalCheck: f(cmp(c("aes"), c("aesRec")), w.finalCheck),
    // Informational only: the recorded baseline is the learner's FIRST evaluation
    // (failed tests included), the recalculation assumes the starter passes
    // everything, so they legitimately differ whenever the first run had
    // failing tests. ROG uses the recorded baseline either way.
    baseCheck: f(`IF(${isOpt},IF(AND(ISNUMBER(${c("baseAesCalc")}),ISNUMBER(${c("initialRec")})),IF(${c("baseAesCalc")}=${c("initialRec")},"Same","First run differed"),"n/a"),"n/a")`, w.baseCheck),
    rogCheck: f(cmp(c("rog"), c("rogRec")), w.rogCheck),

    compPassed: s.complexity_passed ?? 0,
    compTotal: s.complexity_total ?? 0,
    hidPassed: s.hidden_passed ?? 0,
    hidTotal: s.hidden_total ?? 0,
    timestamp: s.timestamp ?? "",
  };
}

/** Colours each header cell by group and adds hover notes on the key columns. */
export function styleSubmissionHeaders(sheet) {
  const notes = {
    funcTsr: "TSR used inside AES: functional tests passed / functional total (1 if none).",
    aesLatest: "Floor of Functional TSR x Efficiency x 100 -- the same Math.floor the app uses on 'Run Tests'.",
    aes: "Best AES for this activity: MAX(latest attempt calculated here, best earlier attempt). Frozen at the recorded value when Code Unchanged = Yes.",
    baseAesCalc: "AES of the starter solution: INT(efficiency x 100), TSR assumed 1. Information only.",
    baseAes: "Baseline the ROG uses: the value the app recorded when present, else the recalculation.",
    rog: "Refactoring Optimization Gain = MAX(0, Final AES - Baseline AES). Optimization activities only.",
  };
  const header = sheet.getRow(1);
  SUB_COLUMNS.forEach((col, idx) => {
    const cell = header.getCell(idx + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GROUP_COLORS[col.group] || "5A1398"}` } };
    if (notes[col.key]) cell.note = notes[col.key];
  });
  header.height = 48;
  // Keep respondent / module / activity visible while scrolling right.
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
}

/** Summary rows: how many rows disagree with what the app recorded. */
export function reconciliationCounts(rawSubs, rosterIds) {
  let aes = 0;
  let rog = 0;
  rawSubs.forEach((s) => {
    if (!rosterIds.has(s.email)) return;
    const w = computeWorkings(s);
    if (w.finalCheck === "DIFF") aes += 1;
    if (w.rogCheck === "DIFF") rog += 1;
  });
  return { aes, rog };
}
