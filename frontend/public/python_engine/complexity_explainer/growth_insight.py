"""
Growth Insight

Helpers that let the explainer talk about *this learner's code* instead of
reciting generic Big-O facts (the "glass box" goal of the manuscript):

  - parse_complexity()      turn an engine string such as "O(n^2)" into a
                            small structured term
  - scaling_line()          concrete "what happens at n = 10 / 100 / 1000"
  - doubling_effect()       plain-language "what if the input doubles?"
  - context_factor()        split a line's total cost into
                            (cost of the line itself) x (cost of the loops /
                            recursion around it)
  - ProgramShape            structural facts read straight from the source
                            (enclosing loops, loop bounds, max nesting) so
                            explanations can name the learner's real loops

Everything here is deterministic and never executes the learner's code.
"""
import ast
import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Big-O string parsing
# ---------------------------------------------------------------------------
@dataclass
class Term:
    """poly/log describe n^poly * (log n)^log. `kind` covers the rest."""
    kind: str = "poly"          # poly | exp | fact | graph | sqrt | multi
    poly: float = 0.0
    log: int = 0
    base: int = 2               # for exp: base^n
    raw: str = ""


def parse_complexity(text: str) -> Optional[Term]:
    """Return a Term for engine strings, or None for anything we can't model
    safely (recurrence text like 'T(n) = 2T(n/2) + O(n)', placeholders...)."""
    if not text:
        return None
    s = str(text).strip()
    low = s.lower()
    if "t(" in low or "placeholder" in low or low in ("-", ""):
        return None
    low = low.replace("amortized", "").replace("²", "^2").replace("³", "^3")
    m = re.search(r"o\((.*)\)", low)
    if not m:
        return None
    body = m.group(1).strip().replace(" ", "")

    if body == "1":
        return Term("poly", 0, 0, raw=s)
    if body in ("v+e", "v"):
        return Term("graph", 1, 0, raw=s)
    if body == "n*n!":
        return Term("fact", 1, 0, raw=s)
    if body == "n!":
        return Term("fact", 0, 0, raw=s)
    mexp = re.fullmatch(r"(\d+)\^n", body)
    if mexp:
        return Term("exp", 0, 0, base=int(mexp.group(1)), raw=s)
    if body in ("sqrtn", "√n"):
        return Term("sqrt", 0.5, 0, raw=s)
    if body in ("n*m",):
        return Term("multi", 2, 0, raw=s)
    if body in ("m",):
        return Term("poly", 1, 0, raw=s)

    poly, log = 0.0, 0
    rest = body
    if "logn" in rest:
        log = 1
        rest = rest.replace("*logn", "").replace("logn*", "").replace("logn", "")
    rest = rest.strip("*")
    if rest == "":
        poly = 0.0
    elif rest == "n":
        poly = 1.0
    else:
        mp = re.fullmatch(r"n\^(\d+(?:\.\d+)?)", rest)
        if not mp:
            return None
        poly = float(mp.group(1))
    if log and poly == 0 and "logmin" in body:
        return Term("poly", 0, 1, raw=s)
    return Term("poly", poly, log, raw=s)


def evaluate(term: Term, n: int) -> float:
    try:
        if term.kind == "poly":
            return (n ** term.poly) * (math.log2(max(n, 2)) ** term.log if term.log else 1)
        if term.kind == "multi":
            return float(n * n)
        if term.kind == "graph":
            return float(2 * n)
        if term.kind == "sqrt":
            return math.sqrt(n)
        if term.kind == "exp":
            return float(term.base) ** n
        if term.kind == "fact":
            v = math.factorial(n)
            return v * n if term.poly else v
    except OverflowError:
        return float("inf")
    return 1.0


def _fmt(x: float) -> str:
    if x == float("inf") or x > 1e18:
        return "an astronomically large number of"
    if x < 1.5:
        return "1"
    if x < 1000:
        return f"{int(round(x)):,}"
    if x < 1e6:
        return f"{int(round(x)):,}"
    if x < 1e9:
        return f"{x / 1e6:.1f} million".replace(".0 ", " ")
    if x < 1e12:
        return f"{x / 1e9:.1f} billion".replace(".0 ", " ")
    return f"{x / 1e12:.1f} trillion".replace(".0 ", " ")


def _sample_sizes(term: Term):
    if term.kind == "fact":
        return (5, 10, 15)
    if term.kind == "exp":
        return (10, 20, 40)
    return (10, 100, 1000)


def is_constant(term: Optional[Term]) -> bool:
    return bool(term) and term.kind == "poly" and term.poly == 0 and term.log == 0


def scaling_line(complexity: str, unit: str = "steps") -> str:
    """'**Scaling:** n = 10 -> ~100 steps, n = 100 -> ~10,000 steps, ...'"""
    t = parse_complexity(complexity)
    if t is None or is_constant(t):
        return ""
    parts = []
    for n in _sample_sizes(t):
        parts.append(f"`n = {n:,}` -> about {_fmt(evaluate(t, n))} {unit}")
    return "**Scaling:** " + "; ".join(parts) + "."


def doubling_effect(complexity: str) -> str:
    """Plain-language answer to 'what if my input doubles?'."""
    t = parse_complexity(complexity)
    if t is None:
        return ""
    if is_constant(t):
        return "Doubling the input changes nothing."
    if t.kind == "exp":
        return "Adding just one more item multiplies the work by " + str(t.base) + " -- doubling the input *squares* it."
    if t.kind == "fact":
        return "Adding one more item multiplies the work by roughly n -- this becomes impossible almost immediately."
    if t.kind == "graph":
        return "Doubling the nodes and edges roughly doubles the work."
    if t.kind == "sqrt":
        return "Doubling the input only multiplies the work by about 1.4."
    if t.kind == "multi":
        return "Doubling both inputs multiplies the work by 4; doubling only one doubles it."
    if t.poly == 0 and t.log:
        return "Doubling the input adds only about one extra step."
    if t.poly == 1 and t.log:
        return "Doubling the input a little more than doubles the work."
    factor = 2 ** t.poly
    if t.log:
        return f"Doubling the input multiplies the work by a bit more than {factor:g}."
    return f"Doubling the input multiplies the work by {factor:g}."


def growth_word(complexity: str) -> str:
    """Short adjective used in summaries."""
    t = parse_complexity(complexity)
    if t is None:
        return "input-dependent"
    if is_constant(t):
        return "constant"
    if t.kind in ("exp", "fact"):
        return "explosive"
    if t.poly == 0 and t.log:
        return "logarithmic"
    if t.kind == "sqrt":
        return "sub-linear"
    if t.kind == "graph":
        return "linear in the graph size"
    if t.poly == 1 and not t.log:
        return "linear"
    if t.poly == 1 and t.log:
        return "near-linear"
    return "polynomial"


# ---------------------------------------------------------------------------
# Splitting total cost into (line itself) x (surrounding structure)
# ---------------------------------------------------------------------------
def context_factor(local: str, total: str) -> Optional[Dict]:
    """
    Work out what the surrounding loops/recursion contribute:
        total  =  local  x  factor
    Returns {"poly": k, "log": j, "text": "n^2"} or None when the two strings
    can't be compared safely (exponential, recurrences, mismatched kinds...).
    """
    a, b = parse_complexity(local), parse_complexity(total)
    if a is None or b is None:
        return None
    if a.kind != "poly" or b.kind != "poly":
        return None
    dpoly, dlog = b.poly - a.poly, b.log - a.log
    if dpoly < 0 or dlog < 0:
        return None
    if dpoly == 0 and dlog == 0:
        return {"poly": 0, "log": 0, "text": "1"}
    pieces = []
    if dpoly:
        pieces.append("n" if dpoly == 1 else f"n^{dpoly:g}")
    if dlog:
        pieces.append("log n" if dlog == 1 else f"(log n)^{dlog}")
    return {"poly": dpoly, "log": dlog, "text": " * ".join(pieces)}


def _norm(s: str) -> str:
    return re.sub(r"[\s]", "", str(s)).lower()


# ---------------------------------------------------------------------------
# Structural facts read from the learner's source
# ---------------------------------------------------------------------------
@dataclass
class LoopInfo:
    lineno: int
    kind: str                 # 'for' | 'while'
    header: str
    bound: str                # human description of how often it repeats
    scales: bool = True       # False for constant / halving loops


@dataclass
class ProgramShape:
    tree: Optional[ast.AST] = None
    loops: List[LoopInfo] = field(default_factory=list)
    _loop_nodes: list = field(default_factory=list)
    _func_nodes: list = field(default_factory=list)
    max_loop_depth: int = 0

    @staticmethod
    def from_source_lines(source_lines) -> "ProgramShape":
        shape = ProgramShape()
        try:
            src = "\n".join(source_lines or [])
            shape.tree = ast.parse(src)
        except Exception:
            return shape
        for node in ast.walk(shape.tree):
            if isinstance(node, (ast.For, ast.While, ast.AsyncFor)):
                shape._loop_nodes.append(node)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                shape._func_nodes.append(node)
        shape._loop_nodes.sort(key=lambda n: (n.lineno, n.col_offset))
        shape.max_loop_depth = shape._max_depth(shape.tree, 0)
        return shape

    def _max_depth(self, node, depth) -> int:
        best = depth
        for child in ast.iter_child_nodes(node):
            d = depth + 1 if isinstance(child, (ast.For, ast.While, ast.AsyncFor)) else depth
            best = max(best, self._max_depth(child, d))
        return best

    # -- enclosing structure of a given line --------------------------------
    def enclosing_loops(self, lineno: int, include_self: bool = False) -> List[LoopInfo]:
        out = []
        for n in self._loop_nodes:
            end = getattr(n, "end_lineno", n.lineno)
            inside = n.lineno < lineno <= end
            if include_self and n.lineno == lineno:
                inside = True
            if inside:
                out.append(self._describe_loop(n))
        return out

    def enclosing_function(self, lineno: int) -> Optional[str]:
        best = None
        for f in self._func_nodes:
            end = getattr(f, "end_lineno", f.lineno)
            if f.lineno <= lineno <= end:
                if best is None or f.lineno >= best.lineno:
                    best = f
        return best.name if best else None

    def all_loops(self) -> List[LoopInfo]:
        return [self._describe_loop(n) for n in self._loop_nodes]

    # -- describing one loop ----------------------------------------------
    def _describe_loop(self, node) -> LoopInfo:
        cache = self.__dict__.setdefault("_loop_cache", {})
        key = (node.lineno, node.col_offset)
        if key not in cache:
            cache[key] = self._describe_loop_uncached(node)
        return cache[key]

    def _describe_loop_uncached(self, node) -> LoopInfo:
        def paren(x: str) -> str:
            return x if re.fullmatch(r"[\w.]+", x) else f"({x})"

        def src(x):
            try:
                return ast.unparse(x)
            except Exception:
                return "?"

        header = ""
        try:
            header = ast.unparse(node).split("\n")[0]
        except Exception:
            header = "loop"

        if isinstance(node, (ast.For, ast.AsyncFor)):
            it = node.iter
            target = src(node.target)
            if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
                args = it.args
                if len(args) == 1:
                    b = src(args[0])
                    if isinstance(args[0], ast.Constant):
                        return LoopInfo(node.lineno, "for", header, f"always repeats {b} times (a fixed number)", False)
                    return LoopInfo(node.lineno, "for", header, f"counts `{target}` from 0 up to {b} - 1, so it repeats {b} times")
                if len(args) >= 2:
                    lo, hi = src(args[0]), src(args[1])
                    step = src(args[2]) if len(args) > 2 else None
                    if step and step not in ("1",):
                        return LoopInfo(node.lineno, "for", header, f"steps `{target}` from {lo} to {hi} by {step}, so it repeats about ({hi} - {paren(lo)}) / {step} times")
                    return LoopInfo(node.lineno, "for", header, f"runs `{target}` from {lo} up to {hi} - 1, so it repeats about {hi} - {paren(lo)} times")
            if isinstance(it, (ast.List, ast.Tuple, ast.Set)) and len(getattr(it, "elts", [])) <= 10:
                return LoopInfo(node.lineno, "for", header, f"loops over a literal of {len(it.elts)} item(s) (a fixed number)", False)
            if isinstance(it, ast.Constant):
                return LoopInfo(node.lineno, "for", header, "loops over a fixed literal", False)
            return LoopInfo(node.lineno, "for", header, f"visits each element of `{src(it)}` once, so it repeats len({src(it)}) times")
        cond = src(node.test)
        low = cond.lower()
        if re.search(r"(lo|low|left|l)\s*<=?\s*(hi|high|right|r)", low):
            return LoopInfo(node.lineno, "while", header, f"keeps going while `{cond}`; each pass discards half of the range, so it repeats about log n times", False)
        return LoopInfo(node.lineno, "while", header, f"keeps repeating while `{cond}` is true")


# ---------------------------------------------------------------------------
# Whole-program recursion / memoization facts (static, from the source)
# ---------------------------------------------------------------------------
def _calls_named(fn_node, name: str) -> int:
    return sum(
        1 for n in ast.walk(fn_node)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == name
    )


def _has_memo_shape(fn_node) -> bool:
    """`if key in cache: return cache[key]` anywhere in the function."""
    for n in ast.walk(fn_node):
        if isinstance(n, ast.If) and isinstance(n.test, ast.Compare) and isinstance(n.test.ops[0], ast.In):
            container = ast.dump(n.test.comparators[0])
            first = n.body[0] if n.body else None
            if isinstance(first, ast.Return) and isinstance(first.value, ast.Subscript) and ast.dump(first.value.value) == container:
                return True
    return False


def _has_cache_decorator(fn_node) -> bool:
    for dec in getattr(fn_node, "decorator_list", []):
        name = getattr(dec, "id", None) or getattr(getattr(dec, "func", None), "id", None) or getattr(dec, "attr", None) or getattr(getattr(dec, "func", None), "attr", None)
        if name in ("lru_cache", "cache"):
            return True
    return False


def _recursion_facts(self):
    """{'recursive': {fn: self_call_count}, 'memoized': {fn,...}}"""
    cached = self.__dict__.get("_rec_cache")
    if cached is not None:
        return cached
    rec, memo = {}, set()
    for f in self._func_nodes:
        k = _calls_named(f, f.name)
        if k:
            rec[f.name] = k
            if _has_memo_shape(f) or _has_cache_decorator(f):
                memo.add(f.name)
    self.__dict__["_rec_cache"] = {"recursive": rec, "memoized": memo}
    return self.__dict__["_rec_cache"]


ProgramShape.recursion_facts = _recursion_facts
