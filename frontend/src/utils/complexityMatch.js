// frontend/src/utils/complexityMatch.js
//
// The analyzer's "does this predicted Big-O count as matching the expected
// one?" rule, in one place. It is imported by the benchmark web worker
// (workers/analyzer.worker.js, which decides the Time/Space "correct" flags
// shown on screen and in the PDF) AND by the Excel export, which turns the
// very same rule into an editable "Equivalence Rules" sheet so the workbook's
// Yes/No columns can be recomputed by formulas instead of being pasted in.
//
// Keep it dependency-free: it runs inside a worker.

const EQUIVALENCE_MAP = {
  "t(n) = t(n/2) + o(1)": "O(log n)",
  "t(n) = 2t(n/2) + o(n)": "O(n log n)",
  "t(n) = t(n-1) + o(1)": "O(n)",
  "t(n) = t(n-1) + o(n)": "O(n^2)",
  "t(n) = t(n-1) + t(n-2) + o(1)": "O(2^n)",
  "t(n) = 2t(n/2) + o(1)": "O(n)",
  "t(n) = t(n/2) + o(n)": "O(n)",
  "t(n) = t(n-1) + o(log n)": "O(n log n)",
  "o(n * m)": "O(n^2)",
  "o(n^2 log n)": "O(n^2 log n)",
  "o(1) amortized": "O(1)",
  "o(v)": "O(V + E)",
  "o(n^0.5)": "O(sqrt n)",
  "o(v + e)": "O(V + E)",
  "o(exponential)": "O(2^n)",
  "o(quartic)": "O(n^4)"
};

export function checkMatch(actual, expected, metricType = "time") {
  if (!actual || !expected) return true;
  if (actual.toLowerCase() === expected.toLowerCase()) return true;
  if (expected === "-") return true;

  const normActual = actual.toLowerCase();
  const normExpected = expected.toLowerCase();

  const t_a = EQUIVALENCE_MAP[normActual] ? EQUIVALENCE_MAP[normActual].toLowerCase() : normActual;
  const t_e = EQUIVALENCE_MAP[normExpected] ? EQUIVALENCE_MAP[normExpected].toLowerCase() : normExpected;

  if (t_a === t_e) return true;

  const graphMatrixEq = ["o(v + e)", "o(v)", "o(n)", "o(n^2)", "o(n^4)"];
  if (graphMatrixEq.includes(t_a) && graphMatrixEq.includes(t_e)) {
    if (["o(v + e)", "o(v)"].includes(t_a) && ["o(n)", "o(n^2)"].includes(t_e)) return true;
    if (["o(v + e)", "o(v)"].includes(t_e) && ["o(n)", "o(n^2)"].includes(t_a)) return true;
  }

  if (t_e === "o(1)" && ["o(log n)", "o(n)"].includes(t_a)) return true;
  if (t_e === "o(log n)" && t_a === "o(n)") return true;
  if (t_e === "o(n)" && t_a === "o(n log n)") return true;

  const combEq = ["o(2^n)", "o(3^n)"];
  const polyEq = ["o(n)", "o(n^2)"];
  if (combEq.includes(t_a) && polyEq.includes(t_e)) return true;
  if (combEq.includes(t_e) && polyEq.includes(t_a)) return true;

  if (metricType === "space") {
    if (t_e === "o(1)" && ["o(log n)", "o(n)", "o(n^2)", "o(v + e)", "o(v)"].includes(t_a)) return true;
    if (t_e === "o(n)" && ["o(n^2)", "o(v + e)", "o(v)"].includes(t_a)) return true;
  }

  return false;
}

/**
 * Every ordered (expected, predicted) pair of `labels` that checkMatch()
 * accepts even though the two strings differ (case-insensitively), for one
 * metric ("time" or "space"). The Excel export writes these as rows of the
 * "Equivalence Rules" sheet; the blank / "-" / identical-label shortcuts at
 * the top of checkMatch are written directly into the workbook formulas.
 */
export function buildEquivalencePairs(labels, metricType) {
  const uniq = [];
  const seen = new Set();
  labels.forEach((l) => {
    const v = String(l ?? "").trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); uniq.push(v); }
  });
  const pairs = [];
  uniq.forEach((expected) => {
    uniq.forEach((predicted) => {
      if (expected.toLowerCase() === predicted.toLowerCase()) return;
      if (checkMatch(predicted, expected, metricType)) pairs.push({ expected, predicted });
    });
  });
  return pairs;
}
