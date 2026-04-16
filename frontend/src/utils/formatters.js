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