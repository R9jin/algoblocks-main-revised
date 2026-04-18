export function formatComplexity(str) {
  // BULLETPROOF CHECK: If it's missing or not a string, return it safely without crashing
  if (!str || typeof str !== 'string') {
    return str;
  }
  
  const superscripts = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    'n': 'ⁿ', 'x': 'ˣ', '+': '⁺', '-': '⁻'
  };

  return str.replace(/\^([0-9nx+-]+)/g, (match, p1) => {
    return p1.split('').map(char => superscripts[char] || char).join('');
  });
}
export const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, '');
  if (comp.includes("o(1)")) return 1;
  if (comp.includes("logn") && !comp.includes("nlog")) return 2;
  if (comp.includes("o(n)") && !comp.includes("log")) return 3;
  if (comp.includes("nlogn")) return 4;
  if (comp.includes("n^2") || comp.includes("n²")) return 5;
  if (comp.includes("n^3") || comp.includes("n³")) return 6;
  if (comp.includes("2^n") || comp.includes("2ⁿ")) return 7;
  if (comp.includes("n!")) return 8;
  return 0; 
};