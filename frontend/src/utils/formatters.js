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

export function resolveRecurrenceToBigO(compStr) {
  if (!compStr || typeof compStr !== 'string') return "O(1)";

  // Normalize the string for easy matching
  const comp = compStr.toLowerCase().replace(/\s+/g, '');

  // If it's already a standard Big-O notation, return it as-is
  if (comp.includes("o(") && !comp.includes("t(")) return compStr;

  // Map Master Theorem / Recurrence Relations to closed-form Big-O
  if (comp.includes("n*t(n-1)")) return "O(n!)";
  if (comp.includes("t(n-1)+t(n-2)")) return "O(2^n)";
  if (comp.includes("2t(n/2)+o(n)")) return "O(n log n)";
  if (comp.includes("t(n-1)+o(n)")) return "O(n^2)";
  if (comp.includes("2t(n/2)+o(1)") || comp.includes("t(n/2)+o(n)")) return "O(n)";
  if (comp.includes("t(n/2)+o(1)")) return "O(log n)";
  if (comp.includes("t(n-1)+o(1)")) return "O(n)";

  // Fallback if unrecognized
  return "O(1)";
}