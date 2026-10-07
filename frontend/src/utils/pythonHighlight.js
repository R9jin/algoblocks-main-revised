// frontend/src/utils/pythonHighlight.js
//
// A tiny dependency-free Python tokenizer, used only to colour source lines in
// read-only views (e.g. the Line Executions table). It is deliberately simple:
// good enough to tell keywords, strings, comments, numbers and built-ins apart,
// not a full parser. Tokenizing the whole source (not line by line) keeps
// multi-line triple-quoted strings coloured correctly.

const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

const BUILTINS = new Set([
  "print", "input", "range", "len", "int", "float", "str", "bool", "list", "dict", "set", "tuple",
  "sum", "min", "max", "abs", "sorted", "reversed", "enumerate", "zip", "map", "filter", "any", "all",
  "round", "pow", "type", "isinstance", "open", "append", "pop", "insert", "remove", "extend",
]);

// Order matters: triple-quoted strings before single-line strings, comments
// before operators. Each alternative is a named capture group.
const TOKEN_RE = new RegExp(
  [
    "(?<tstr>[rRbBfFuU]{0,2}(?:\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$)))",
    "(?<str>[rRbBfFuU]{0,2}(?:\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?))",
    "(?<comment>#[^\\n]*)",
    "(?<num>\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)",
    "(?<ident>[A-Za-z_][A-Za-z0-9_]*)",
  ].join("|"),
  "g"
);

const classify = (m, prevWord) => {
  const g = m.groups;
  if (g.tstr !== undefined || g.str !== undefined) return "py-str";
  if (g.comment !== undefined) return "py-comment";
  if (g.num !== undefined) return "py-num";
  const word = g.ident;
  if (KEYWORDS.has(word)) return word === "True" || word === "False" || word === "None" ? "py-const" : "py-kw";
  if (prevWord === "def" || prevWord === "class") return "py-def";
  if (BUILTINS.has(word)) return "py-builtin";
  return null;
};

// Returns an array with one entry per source line; each entry is an array of
// { text, cls } segments (cls is null for plain text). The concatenated
// segment text of a line always equals that line, so indentation is preserved.
export function highlightPython(source) {
  const text = String(source ?? "");
  const lines = [[]];
  const push = (segment, cls) => {
    // Split segments (e.g. docstrings) at newlines so each line stays separate.
    const parts = segment.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cls });
    });
  };

  let last = 0;
  let prevWord = null;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), null);
    const cls = classify(m, prevWord);
    push(m[0], cls);
    prevWord = m.groups.ident !== undefined ? m.groups.ident : prevWord;
    if (m.groups.ident === undefined && m[0].trim()) prevWord = null;
    last = m.index + m[0].length;
    if (m[0].length === 0) TOKEN_RE.lastIndex++; // never loop on an empty match
  }
  if (last < text.length) push(text.slice(last), null);
  return lines;
}
