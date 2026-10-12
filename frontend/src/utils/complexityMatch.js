// frontend/src/utils/complexityMatch.js
//
// The analyzer's "does this predicted Big-O count as matching the expected
// one?" rule, in one place. It is imported by the benchmark web worker
// (workers/analyzer.worker.js, which decides the Time/Space "correct" flags
// shown on screen and in the PDF) and by the Excel export.
//
// STRICT EXACT MATCH. A prediction is correct only when it names the SAME
// complexity class as the ground truth. The only things normalised are
// NOTATION and the benchmark's SIZE SCALE (see the scale fold below) -- a recurrence written out (T(n) = T(n/2) + O(1)), "O(n^0.5)",
// "O(exponential)" and similar spellings of one and the same class are
// rewritten to their canonical label first. Different classes are never
// treated as interchangeable (e.g. predicting O(n log n) for an expected
// O(n) is a MISMATCH), so overall accuracy equals the diagonal of the
// per-class confusion matrix and agrees with precision / recall / F1.
//
// SCALE FOLD. The analyzer reports independent size symbols separately
// (O(n * m), O(n + m), O(n * k), O(m^2 + n) ...). The ground truth is written
// on the benchmark's single-size scale (GROUND_TRUTH_RULES.md): rule 1 -- n is
// the largest size parameter, so O(n x m) is O(n^2) and O(n + m) is O(n); rule
// 9 -- V is n and E <= V^2, so a lower-case edge term e beside an n^2 term is absorbed;
// a label that names a V+E sum stays in the O(V + E) class.
// foldToBenchmarkScale() applies exactly those two rules to a PREDICTED label
// before it is compared. It only picks the single-size representative of the
// class the expression already belongs to; it never changes the analyzer's own
// output (the raw label is kept and reported next to the scored one) and it
// leaves anything it cannot fold (O(t(n-1)), O(n * e), O(n log m)) untouched.
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

const NINE_CLASSES = [
  "O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)",
  "O(n^2)", "O(2^n)", "O(n!)", "O(V + E)",
];
const FOLD_PASSTHROUGH = new Set(["", "-", "MISSING", "PARSE_FAIL", "ERROR"]);

// Mirror of python_engine/benchmark_scale.py -- keep the two in step.
export function foldToBenchmarkScale(label) {
  if (label === null || label === undefined) return label;
  const s = String(label).trim();
  const compact = s.replace(/\s+/g, "");
  // A traversal term that names V and E explicitly (the analyzer's "O(n * m + V+E)" included)
  // is scored as the V+E class -- the benchmark's pre-existing rule; GT writes O(V+E).
  if (compact.includes("V+E") || compact.includes("E+V")) return "O(V + E)";
  if (NINE_CLASSES.includes(s) || FOLD_PASSTHROUGH.has(s)) return s;
  const m = /^o\((.*)\)$/.exec(s.toLowerCase().replace(/\s+/g, ""));
  if (!m) return s;
  const body = m[1];
  if (!/^[a-z0-9^*+]+$/.test(body)) return s; // log, sqrt, !, t(...) etc.: not polynomial

  const terms = [];
  let edgeTerm = false;
  for (const term of body.split("+")) {
    let deg = 0;
    let hasE = false;
    for (const factor of term.split("*")) {
      if (/^\d+$/.test(factor)) continue;
      const f = /^([a-z])(?:\^(\d+))?$/.exec(factor);
      if (!f) return s;
      const power = f[2] ? parseInt(f[2], 10) : 1;
      if (f[1] === "e") hasE = true; // edge count: handled below
      else deg += power;             // n, m, k, v ... all fold to n
    }
    terms.push({ deg, hasE });
    edgeTerm = edgeTerm || hasE;
  }
  const vertexSide = terms.filter((t) => !t.hasE).map((t) => t.deg);
  const top = vertexSide.length ? Math.max(...vertexSide) : 0;
  if (edgeTerm && top < 2) return s; // plain V + E (or n * e): leave to its own class
  if (top === 0) return "O(1)";
  if (top === 1) return "O(n)";
  if (top === 2) return "O(n^2)";
  return `O(n^${top})`;               // outside the nine classes: stays a miss
}

export function checkMatch(actual, expected, metricType = "time") {
  // Nothing to grade against (no ground-truth label for this item / line).
  if (!expected || expected === "-") return true;
  // A ground-truth label exists but the analyzer produced nothing usable.
  if (!actual) return false;

  const normActual = String(actual).trim().toLowerCase();
  const normExpected = String(expected).trim().toLowerCase();

  const canon = (v) => (EQUIVALENCE_MAP[v] ? EQUIVALENCE_MAP[v].toLowerCase() : v);
  const scaled = (v) => foldToBenchmarkScale(canon(v)).toLowerCase();
  return scaled(normActual) === scaled(normExpected);
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
