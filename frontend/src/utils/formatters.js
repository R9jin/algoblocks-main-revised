// frontend\src\utils\formatters.js
export function formatComplexity(str) {
  // BULLETPROOF CHECK: If it's missing or not a string, return it safely without crashing
  if (!str || typeof str !== 'string') {
    return str;
  }

  // Pre-process unformatted output commonly generated from analyzers
  let formatted = str
    .replace(/n2/g, 'n²')
    .replace(/n3/g, 'n³');

  const superscripts = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    'n': 'ⁿ', 'x': 'ˣ', '+': '⁺', '-': '⁻'
  };

  return formatted.replace(/\^([0-9nx+-]+)/g, (match, p1) => {
    return p1.split('').map(char => superscripts[char] || char).join('');
  });
}

export const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, '');
  if (comp.includes("o(1)") || comp === "1") return 1;
  // Check n^2 / n^3 before n to avoid "O(n2)" triggering "O(n)"
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("n2")) return 5;
  if (comp.includes("n^3") || comp.includes("n³") || comp.includes("n3")) return 6;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("2n")) return 7;
  if (comp.includes("n!")) return 8;
  if (comp.includes("nlogn")) return 4;
  if (comp.includes("logn")) return 2;
  if (comp.includes("o(n)") || comp === "n") return 3;
  return 0;
};

// True when the string is a recurrence relation / recursive placeholder
// (e.g. "T(n) = 2T(n/2) + O(n)", "T(n-1)") rather than a closed-form bound.
export function isRecurrence(compStr) {
  return typeof compStr === 'string' && /(^|[^a-z])t\(/i.test(compStr);
}

// Formats an exponent pair as a Big-O string: (1, 1) -> "O(n log n)".
function formatBound(exp, logPow) {
  const parts = [];
  if (exp !== 0) {
    const e = Number.isInteger(exp) ? exp : Number(exp.toFixed(2));
    parts.push(e === 1 ? 'n' : `n^${e}`);
  }
  if (logPow === 1) parts.push('log n');
  else if (logPow > 1) parts.push(`log^${logPow} n`);
  return `O(${parts.length ? parts.join(' ') : '1'})`;
}

// Parses the non-recursive "work" term f(n) into n^d * log^k n.
function parseWorkTerm(work) {
  if (work === '' || work === 'o(1)' || work === '1') return { d: 0, k: 0 };
  const m = work.match(/^o\((?:(n)(?:\^(\d+)|([\u00B2\u00B3]))?)?(logn)?\)$/);
  if (!m || (!m[1] && !m[4])) return null;
  let d = 0;
  if (m[1]) d = m[2] ? Number(m[2]) : m[3] ? (m[3] === '\u00B2' ? 2 : 3) : 1;
  return { d, k: m[4] ? 1 : 0 };
}

// Resolves a recurrence relation to its closed-form Big-O bound (the
// "Master Theorem Assigner" step described in Chapter III):
//   * T(n) = a*T(n/b) + f(n)      -> Master Theorem (three cases)
//   * T(n) = T(n-c) + f(n)        -> f(n) summed over n levels
//   * branching / factorial forms -> O(2^n) / O(n!)
// Anything that is already closed-form is returned untouched, and a
// relation the resolver does not recognise is returned as-is (never
// silently downgraded to O(1)).
export function resolveRecurrenceToBigO(compStr) {
  if (!compStr || typeof compStr !== 'string') return "O(1)";
  const raw = compStr.trim();
  const comp = raw.toLowerCase().replace(/\s+/g, '').replace(/[\u00B7\u2022\u00D7\u22C5]/g, '*').replace(/\u2212/g, '-');

  if (!isRecurrence(comp)) return comp.includes("o(") ? raw : "O(1)";

  // A bare call cost such as "T(n-1)" is a placeholder, not a relation.
  if (!comp.includes('=')) return raw;
  const body = comp.split('=').slice(1).join('=');

  // n * T(n-1)  ->  factorial
  if (/^n\*t\(n-\d+\)/.test(body)) return "O(n!)";

  // Two or more subtract-a-constant calls (Fibonacci-style) or a*T(n-c), a >= 2
  const subtractCalls = (body.match(/t\(n-\d+\)/g) || []).length;
  const subtractCoef = body.match(/^(\d+)\*?t\(n-\d+\)/);
  if (subtractCalls >= 2 || (subtractCoef && Number(subtractCoef[1]) >= 2)) return "O(2^n)";

  // T(n) = T(n-c) + f(n)  ->  n levels of f(n)
  const sub = body.match(/^t\(n-\d+\)\+?(.*)$/);
  if (sub) {
    const w = parseWorkTerm(sub[1]);
    return w ? formatBound(w.d + 1, w.k) : raw;
  }

  // T(n) = a*T(n/b) + f(n)  ->  Master Theorem
  const div = body.match(/^(?:(\d+)\*?)?t\(n\/(\d+)\)\+?(.*)$/);
  if (div) {
    const a = div[1] ? Number(div[1]) : 1;
    const b = Number(div[2]);
    const w = parseWorkTerm(div[3]);
    if (!w || b < 2) return raw;
    const crit = Math.log(a) / Math.log(b); // log_b(a)
    const eps = 1e-9;
    if (w.d < crit - eps) return formatBound(crit, 0);          // case 1: leaves dominate
    if (Math.abs(w.d - crit) < eps) return formatBound(w.d, w.k + 1); // case 2: balanced
    return formatBound(w.d, w.k);                                // case 3: root dominates
  }

  return raw;
}

// Convenience for display code: closed-form bound for recurrences, the
// original string for everything else.
export function toClosedFormBigO(compStr) {
  return isRecurrence(compStr) ? resolveRecurrenceToBigO(compStr) : compStr;
}
