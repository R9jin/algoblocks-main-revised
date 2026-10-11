// frontend/src/utils/complexityMatch.js
//
// The analyzer's "does this predicted Big-O count as matching the expected
// one?" rule, in one place. It is imported by the benchmark web worker
// (workers/analyzer.worker.js, which decides the Time/Space "correct" flags
// shown on screen and in the PDF) and by the Excel export.
//
// STRICT EXACT MATCH. A prediction is correct only when it names the SAME
// complexity class as the ground truth. The only thing normalised is
// NOTATION -- a recurrence written out (T(n) = T(n/2) + O(1)), "O(n^0.5)",
// "O(exponential)" and similar spellings of one and the same class are
// rewritten to their canonical label first. Different classes are never
// treated as interchangeable (e.g. predicting O(n log n) for an expected
// O(n) is a MISMATCH), so overall accuracy equals the diagonal of the
// per-class confusion matrix and agrees with precision / recall / F1.
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
  "o(n^2 log n)": "O(n^2 log n)",
  "o(1) amortized": "O(1)",
  "o(n^0.5)": "O(sqrt n)",
  "o(v + e)": "O(V + E)",
  "o(exponential)": "O(2^n)",
  "o(quartic)": "O(n^4)"
};

export function checkMatch(actual, expected, metricType = "time") {
  // Nothing to grade against (no ground-truth label for this item / line).
  if (!expected || expected === "-") return true;
  // A ground-truth label exists but the analyzer produced nothing usable.
  if (!actual) return false;

  const normActual = String(actual).trim().toLowerCase();
  const normExpected = String(expected).trim().toLowerCase();

  const canon = (v) => (EQUIVALENCE_MAP[v] ? EQUIVALENCE_MAP[v].toLowerCase() : v);
  return canon(normActual) === canon(normExpected);
}

/**
 * Every ordered (expected, predicted) pair of `labels` that checkMatch()
 * accepts even though the two strings differ (case-insensitively), for one
 * metric ("time" or "space"). With the strict rule this is only notation aliases
 * (normally none among the benchmark's nine classes).
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
