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

try:  # the analyzer's switch: score a fixed-bound range() loop as the O(n) loop pattern
    from complexity_analyzer import code_preprocessor as _cp
except Exception:  # pragma: no cover - explainer used on its own
    _cp = None


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
    if t.kind == "multi":
        return "the product of two input sizes"
    if t.poly == 1 and not t.log:
        return "linear"
    if t.poly == 1 and t.log:
        return "near-linear"
    if t.log:
        return "polynomial with a log factor"
    names = {2: "quadratic", 3: "cubic", 4: "quartic"}
    if float(t.poly).is_integer() and int(t.poly) in names:
        return names[int(t.poly)]
    if t.poly >= 5:
        return "high-degree polynomial"
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
# Fixed-bound range() loops: scored O(n) (loop pattern), strictly O(1)
# ---------------------------------------------------------------------------
def symbolic_fixed_range_on() -> bool:
    """Mirror of complexity_analyzer.code_preprocessor.SYMBOLIC_FIXED_RANGE."""
    return bool(getattr(_cp, "SYMBOLIC_FIXED_RANGE", True)) if _cp is not None else True


def _num(e):
    """Numeric value of a literal expression (4, -1, 2 * 5, 2 ** 10), else None."""
    try:
        if isinstance(e, ast.Constant) and isinstance(e.value, (int, float)) and not isinstance(e.value, bool):
            return e.value
        if isinstance(e, ast.UnaryOp) and isinstance(e.op, (ast.USub, ast.UAdd)):
            v = _num(e.operand)
            return None if v is None else (-v if isinstance(e.op, ast.USub) else v)
        if isinstance(e, ast.BinOp):
            a, b = _num(e.left), _num(e.right)
            if a is None or b is None:
                return None
            if isinstance(e.op, ast.Add): return a + b
            if isinstance(e.op, ast.Sub): return a - b
            if isinstance(e.op, ast.Mult): return a * b
            if isinstance(e.op, ast.FloorDiv): return a // b
            if isinstance(e.op, ast.Pow) and 0 <= b <= 64: return a ** b
    except Exception:
        pass
    return None


def _is_alphabet_name(e) -> bool:
    # same named exception the analyzer makes: MAX_CHAR = 26, NO_OF_CHARS = 256 ...
    return isinstance(e, ast.Name) and any(k in e.id.upper() for k in ("CHARS", "MAX_CHAR", "ALPHABET", "ASCII"))


def is_fixed_range(node) -> bool:
    """`for ... in range(<constants only>)` -- the pass count is a fixed number."""
    try:
        it = getattr(node, "iter", None)
        return bool(isinstance(node, (ast.For, ast.AsyncFor)) and isinstance(it, ast.Call)
                    and isinstance(it.func, ast.Name) and it.func.id == "range" and it.args and not it.keywords
                    and all(_fixed_expr(a) for a in it.args))
    except Exception:
        return False


def _fixed_expr(e) -> bool:
    if _num(e) is not None or _is_alphabet_name(e):
        return True
    if isinstance(e, ast.BinOp):
        return _fixed_expr(e.left) and _fixed_expr(e.right)
    if isinstance(e, ast.UnaryOp):
        return _fixed_expr(e.operand)
    return False


def is_symbolic_fixed_range(node) -> bool:
    """A fixed-bound range() loop that the analyzer scores as the O(n) loop pattern.
    (A body that always breaks/returns on its first pass genuinely runs once: O(1), not this.)"""
    if not (symbolic_fixed_range_on() and is_fixed_range(node)):
        return False
    return not any(isinstance(st, (ast.Break, ast.Return)) for st in node.body)


def fixed_range_passes(node) -> Optional[int]:
    """Exact number of passes of a fixed-bound range() loop, or None when unknown/huge."""
    try:
        vals = [_num(a) for a in node.iter.args]
        if any(v is None or float(v) != int(v) for v in vals):
            return None
        return len(range(*[int(v) for v in vals]))
    except Exception:
        return None


def fixed_while_info(tree, node):
    """`i = 0` ... `while i < 10: i += 1` -- the `while` twin of a fixed range(): the counter starts at a literal,
    is only stepped by literals and is compared with a literal. Returns (is_fixed, passes_or_None).
    Mirror of ComplexityHeuristics._is_literal_counter_loop (which decides the score)."""
    try:
        if not (symbolic_fixed_range_on() and isinstance(node, ast.While) and tree is not None):
            return (False, None)
        if any(isinstance(c, ast.Break) for c in ast.walk(node)) or any(isinstance(st, (ast.Break, ast.Return)) for st in node.body):
            return (False, None)
        test = node.test
        if not isinstance(test, ast.Compare) or len(test.ops) != 1 or len(test.comparators) != 1:
            return (False, None)
        lit = lambda e: _num(e) is not None
        l, r = test.left, test.comparators[0]
        if isinstance(l, ast.Name) and lit(r):
            name, limit, name_left = l.id, _num(r), True
        elif isinstance(r, ast.Name) and lit(l):
            name, limit, name_left = r.id, _num(l), False
        else:
            return (False, None)
        block, idx = None, None
        for parent in ast.walk(tree):
            for fld in ("body", "orelse", "finalbody"):
                lst = getattr(parent, fld, None)
                if isinstance(lst, list) and any(st is node for st in lst):
                    block, idx = lst, next(i for i, st in enumerate(lst) if st is node)
                    break
            if block is not None:
                break
        if block is None:
            return (False, None)
        start = None
        for st in reversed(block[:idx]):
            if isinstance(st, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in st.targets):
                start = _num(st.value)
                break
            if any(isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, ast.Store) for n in ast.walk(st)):
                return (False, None)
        if start is None:
            return (False, None)
        step = None
        for sub in ast.walk(node):
            if isinstance(sub, ast.AugAssign) and isinstance(sub.target, ast.Name) and sub.target.id == name:
                v = _num(sub.value)
                if v is None:
                    return (False, None)
                step = (type(sub.op), v)
            elif isinstance(sub, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in sub.targets):
                v = sub.value
                if not (isinstance(v, ast.BinOp) and isinstance(v.left, ast.Name) and v.left.id == name and _num(v.right) is not None):
                    return (False, None)
                step = (type(v.op), _num(v.right))
        if step is None:
            return (False, None)
        # count the passes by running the counter (bounded, so a bad guess can never hang the explainer)
        ops = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
               ast.FloorDiv: lambda a, b: a // b if b else a, ast.Div: lambda a, b: a / b if b else a}
        f = ops.get(step[0])
        cmp_ops = {ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b,
                   ast.GtE: lambda a, b: a >= b, ast.NotEq: lambda a, b: a != b}
        c = cmp_ops.get(type(test.ops[0]))
        if f is None or c is None:
            return (True, None)
        x, passes = start, 0
        while passes <= 10000 and (c(x, limit) if name_left else c(limit, x)):
            nx = f(x, step[1])
            if nx == x:
                return (True, None)
            x, passes = nx, passes + 1
        return (True, passes if passes <= 10000 else None)
    except Exception:
        return (False, None)


def strict_without_fixed(total: str, k: int) -> Optional[str]:
    """Strict complexity of a line scored `total` once `k` fixed-bound loops are treated as the
    constants they really are (each one was scored as a factor of n)."""
    t = parse_complexity(total)
    if t is None or t.kind != "poly" or t.poly < k or float(t.poly - k) != int(t.poly - k):
        return None
    poly = int(t.poly - k)
    parts = []
    if poly:
        parts.append("n" if poly == 1 else f"n^{poly}")
    if t.log:
        parts.append("log n" if t.log == 1 else f"(log n)^{t.log}")
    return "O(" + (" * ".join(parts) if parts else "1") + ")"


def symbolic_scoring_note(tree) -> str:
    """One general note listing every place the analyzer read a fixed value in the code as an example of an
    input size `n` (symbolic scoring) rather than as the strict constant it literally is. Not specific to
    `for` loops: fixed range() bounds, variables holding a fixed value that bound a loop, and calls to a
    scaling function with literal arguments are all covered. Returns "" when none of them occur."""
    try:
        found = []  # (lineno, text)
        theoretical = bool(getattr(_cp, "THEORETICAL_MODE", True)) if _cp is not None else True

        # 1. fixed-bound range() loops
        for node in ast.walk(tree):
            if isinstance(node, ast.For) and is_symbolic_fixed_range(node):
                found.append((node.lineno, f"line {node.lineno}: `{ast.unparse(node.iter)}` is a fixed bound, read as the loop pattern (work grows with its bound)"))
            elif isinstance(node, ast.While) and fixed_while_info(tree, node)[0]:
                found.append((node.lineno, f"line {node.lineno}: `while {ast.unparse(node.test)}` has a fixed bound, read as the loop pattern (work grows with its bound)"))

        # 2. a script-level variable holding a fixed number, used as a loop bound
        if theoretical:
            consts = {}
            counts = {}
            for stmt in getattr(tree, "body", []):
                if (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name)
                        and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, (int, float))
                        and not isinstance(stmt.value.value, bool)):
                    consts[stmt.targets[0].id] = stmt.value.value
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                    counts[node.id] = counts.get(node.id, 0) + 1
            consts = {k: v for k, v in consts.items() if counts.get(k, 0) == 1}
            if consts:
                for node in ast.walk(tree):
                    hdr = node.iter if isinstance(node, ast.For) else node.test if isinstance(node, ast.While) else None
                    if hdr is None:
                        continue
                    names = [n.id for n in ast.walk(hdr) if isinstance(n, ast.Name) and n.id in consts]
                    if names:
                        nm = names[0]
                        found.append((node.lineno, f"line {node.lineno}: `{nm}` holds the fixed value {consts[nm]}, but is read as the input size `n`"))

        # 3. a call to a user function that scales with its argument, given only literal arguments
        scaling = set()
        for fn in ast.walk(tree):
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for sub in ast.walk(fn):
                    if isinstance(sub, (ast.For, ast.While)) or (
                            isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name) and sub.func.id == fn.name):
                        scaling.add(fn.name)
                        break
        if scaling:
            def lit(a):
                return (isinstance(a, ast.Constant) and isinstance(a.value, (int, float)) and not isinstance(a.value, bool)) or (
                    isinstance(a, ast.UnaryOp) and isinstance(a.op, ast.USub) and lit(a.operand))
            inside = {}
            for fn in ast.walk(tree):
                if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for sub in ast.walk(fn):
                        inside.setdefault(id(sub), fn.name)
            for node in ast.walk(tree):
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in scaling
                        and node.args and all(lit(a) for a in node.args) and inside.get(id(node)) != node.func.id):
                    found.append((node.lineno, f"line {node.lineno}: `{ast.unparse(node)}` is called with fixed argument(s), read as the input size `n`"))

        if not found:
            return ""
        found.sort(key=lambda t: t[0])
        seen, bullets = set(), []
        for _, text in found:
            if text not in seen:
                seen.add(text)
                bullets.append(text)
        shown = "\n".join(f"- {b}" for b in bullets[:5]) + (f"\n- ... and {len(bullets) - 5} more" if len(bullets) > 5 else "")
        return (
            "**Symbolic scoring:** AlgoBlocks treats some parts of your code symbolically instead of applying strict asymptotic "
            "analysis to the exact program. Fixed values written in the code are read as examples of an input size `n`, so you "
            "can see how the same operation generally scales. For those parts the feedback is a generalized learning example "
            "and can differ from the strict complexity of this exact code (which may be O(1)).\n\nHere this applies to:\n" + shown
        )
    except Exception:
        return ""


def strict_asymptotic_note(total: str, fixed_loops, own: bool = False) -> str:
    """The 'strictly this is O(1)' paragraph shown next to a fixed-bound loop's O(n) score.
    `fixed_loops` are the LoopInfo of every fixed-bound loop around (and including) the line."""
    k = len(fixed_loops)
    if not k:
        return ""
    strict = strict_without_fixed(total, k)
    heads = ", ".join(f"`{lp.header}`" for lp in fixed_loops[:3]) + (" ..." if k > 3 else "")
    shown = f"`{total}`"
    if k == 1:
        who = f"{heads} has a fixed bound ({fixed_loops[0].passes_text()})"
        what = "so under strict asymptotic analysis it repeats a constant number of times and adds only a constant factor"
    else:
        who = f"{heads} all have fixed bounds"
        what = "so under strict asymptotic analysis they repeat a constant number of times in total and add only constant factors"
    tail = (f" Strictly, this {'loop' if own else 'line'} is therefore `{strict}`" if strict else "")
    tail += (f"{';' if strict else '.'} {'The' if not strict else 'the'} headline stays {shown} because AlgoBlocks scores a fixed bound symbolically, as an example of an input size n, "
             f"to show how the code grows once that bound becomes the input size.")
    return f"**Strict asymptotic analysis:** {who}, {what}.{tail}"

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
    fixed: bool = False       # fixed-bound range() loop scored as O(n) (strictly O(1))
    passes: Optional[int] = None

    def passes_text(self) -> str:
        return f"exactly {self.passes} passes" if self.passes is not None else "a fixed number of passes"

def live_tree(tree):
    """Drop functions that nothing ever calls.

    The complexity engine leaves a function that is never called out of the total
    ("`fib()` is never called, so its body never runs"). The explanation must follow the
    same rule, otherwise an unused recursive helper still makes the narrative say the
    program is recursive, brute force, and so on. If the file only defines functions and
    never calls any, everything stays (nothing is "unused" yet).
    """
    if not isinstance(tree, ast.Module):
        return tree
    funcs = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    if not funcs:
        return tree

    def used(nodes):
        names = set()
        for node in nodes:
            for n in ast.walk(node):
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id in funcs:
                    names.add(n.id)
        return names

    top = [n for n in tree.body if not (isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))]
    roots = used(top)
    if not roots:
        return tree
    live, stack = set(), list(roots)
    while stack:
        name = stack.pop()
        if name in live:
            continue
        live.add(name)
        stack.extend(used([funcs[name]]) - live)
    body = [n for n in tree.body if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) or n.name in live]
    return ast.Module(body=body, type_ignores=[])


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
            shape.tree = live_tree(ast.parse(src))
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
            if is_fixed_range(node):
                k = fixed_range_passes(node)
                times = f"exactly {k} times" if k is not None else "a fixed number of times"
                if is_symbolic_fixed_range(node):
                    return LoopInfo(node.lineno, "for", header,
                                    f"repeats {times} (a fixed bound, strictly O(1))",
                                    True, True, k)
                return LoopInfo(node.lineno, "for", header, f"always repeats {times} (a fixed number)", False, False, k)
            if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
                args = it.args
                if len(args) == 1:
                    b = src(args[0])
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
        _fx, _k = fixed_while_info(self.tree, node)
        if _fx:
            _times = f"exactly {_k} times" if _k is not None else "a fixed number of times"
            return LoopInfo(node.lineno, "while", header,
                            f"keeps going while `{cond}`, so it repeats {_times} (a fixed bound, strictly O(1))",
                            True, True, _k)
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
