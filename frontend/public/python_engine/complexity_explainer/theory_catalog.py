"""
Theory Catalog

Explains complexity the way an algorithm-analysis course does: basic operations, summations,
recurrences and the Master Theorem, worst / best / average case, O vs Omega vs Theta, amortized
cost, and the auxiliary-space convention.

It is *compositional* rather than a lookup of a few classes: any result such as O(n^2 * m),
O(n log n + m), O(V^2 + E), O(m log n), O(2^n) or O(n!) is parsed into terms and explained from
its parts (degree per size symbol, log / sqrt / exponential / factorial factors, independent
sums), so every combination the analyzer can print gets a precise, correct explanation.

Public entry points (all pure `ast` + strings, never executes code):
    parse_class(s)                     -> List[Term]
    class_block(s, kind)               -> markdown paragraph(s) about a complexity class
    line_time_notes(tree, node, lt, gt)  -> [(priority, text)] for one line
    line_space_notes(tree, node, ls, gs) -> [(priority, text)]
    overall_theory(tree, time, space)  -> markdown "Theory Notes" section
"""
import ast
import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

_LOOPS = (ast.For, ast.AsyncFor, ast.While)
_FUNCS = (ast.FunctionDef, ast.AsyncFunctionDef)
OPS_PER_SEC = 1e7   # a realistic budget of simple Python operations per second


# ===================================================================== parsing a complexity string
@dataclass
class Term:
    vars: Dict[str, int] = field(default_factory=dict)   # size symbol -> exponent
    logs: int = 0            # power of the log factor
    logvar: str = "n"
    sqrt: Optional[str] = None
    exp: bool = False        # 2^n
    fact: bool = False       # n!
    graph: bool = False      # involves V / E
    loglog: bool = False

    def degree(self) -> int:
        return sum(self.vars.values())


def _norm(s: str) -> str:
    s = str(s or "")
    for a, b in (("\u00b2", "^2"), ("\u00b3", "^3"), ("\u207f", "^n"), ("\u221a", "sqrt "), ("\u00b7", "*"), ("\u00d7", "*"),
                 ("\u0398", ""), ("\u03a9", ""), ("\u2074", "^4")):
        s = s.replace(a, b)
    s = s.strip()
    s = re.sub(r"^[OoTt]\(", "", s)
    if s.endswith(")"):
        s = s[:-1]
    return s.strip()


def parse_class(s: str) -> List[Term]:
    body = _norm(s)
    if not body or body in ("1", "c"):
        return [Term()]
    terms: List[Term] = []
    for raw in re.split(r"\s\+\s|\+(?=\s*[A-Za-z])", body):
        raw = raw.strip()
        if not raw:
            continue
        t = Term()
        if raw.startswith("2^") or raw == "2^n":
            t.exp = True
            terms.append(t)
            continue
        if "!" in raw:
            t.fact = True
            terms.append(t)
            continue
        toks = [x for x in re.split(r"[\s*]+", raw) if x]
        i = 0
        while i < len(toks):
            tok = toks[i]
            if tok == "log":
                t.logs += 1
                nxt = toks[i + 1] if i + 1 < len(toks) else "n"
                if re.fullmatch(r"[A-Za-z]", nxt):
                    t.logvar = nxt
                    i += 1
            elif tok == "sqrt":
                t.sqrt = toks[i + 1] if i + 1 < len(toks) else "n"
                i += 1
            elif tok == "loglog":
                t.loglog = True
            else:
                m = re.fullmatch(r"([A-Za-z])(?:\^(\d+))?", tok)
                if m:
                    t.vars[m.group(1)] = t.vars.get(m.group(1), 0) + int(m.group(2) or 1)
                    if m.group(1) in ("V", "E"):
                        t.graph = True
            i += 1
        terms.append(t)
    return terms or [Term()]


# ===================================================================== describing one class
_ORD = {0: "constant", 1: "linear", 2: "quadratic", 3: "cubic"}


def _name_term(t: Term) -> str:
    if t.exp:
        return "exponential"
    if t.fact:
        return "factorial"
    if t.sqrt:
        return "square-root"
    d, l = t.degree(), t.logs
    if len(t.vars) > 1:
        base = "a product of independent sizes" if all(v >= 1 for v in t.vars.values()) else "polynomial"
        return base + (" with a logarithmic factor" if l else "")
    if d == 0:
        return "constant" if l == 0 else ("logarithmic" if l == 1 else "polylogarithmic")
    base = _ORD.get(d, f"polynomial of degree {d}")
    if l == 0:
        return base
    return "linearithmic (n log n)" if d == 1 and l == 1 else f"{base} with a logarithmic factor"


def _fmt_term(t: Term) -> str:
    if t.exp:
        return "2^n"
    if t.fact:
        return "n!"
    parts = []
    for v, e in sorted(t.vars.items()):
        parts.append(f"{v}^{e}" if e > 1 else v)
    if t.sqrt:
        parts.append(f"sqrt({t.sqrt})")
    if t.logs:
        parts.append(f"log {t.logvar}" if t.logs == 1 else f"log^{t.logs} {t.logvar}")
    return " * ".join(parts) or "1"


def _capacity(t: Term) -> Optional[str]:
    """Largest n a single term allows in about one second (OPS_PER_SEC simple operations)."""
    try:
        if t.exp:
            return f"about n = {int(math.log2(OPS_PER_SEC))}"
        if t.fact:
            n = 1
            while math.factorial(n + 1) <= OPS_PER_SEC:
                n += 1
            return f"about n = {n}"
        if t.sqrt and len(t.vars) == 0 and t.logs == 0:
            return "n up to about 10^14"
        d, l = t.degree(), t.logs
        if d == 0:
            return None if l == 0 else "effectively any n"
        if l == 0 and len(t.vars) == 1:
            n = OPS_PER_SEC ** (1.0 / d)
        elif len(t.vars) == 1:
            n = OPS_PER_SEC ** (1.0 / d)
            for _ in range(40):
                n = (OPS_PER_SEC / max(math.log2(max(n, 2)) ** l, 1)) ** (1.0 / d)
        else:
            return f"the product of the sizes must stay near 10^7 (e.g. {int(OPS_PER_SEC ** (1.0 / max(d, 1)))} for each)"
        return f"n up to about {_human(n)}"
    except Exception:
        return None


def _human(x: float) -> str:
    if x >= 1e9:
        return f"{x:.0e}".replace("e+0", "e").replace("e+", "e")
    if x >= 1e6:
        return f"{x / 1e6:.1f} million".replace(".0 ", " ")
    if x >= 1e3:
        return f"{int(x):,}"
    return str(int(x))


def _doubling(t: Term) -> str:
    if t.exp:
        return "adding just ONE to n doubles the work, and doubling n squares it"
    if t.fact:
        return "adding one to n multiplies the work by (n + 1)"
    if t.sqrt and not t.vars:
        return "doubling n multiplies the work by only \u221a2 \u2248 1.41"
    if not t.vars and t.logs:
        return "doubling n adds a constant amount of work (one more step)"
    if not t.vars:
        return "the work does not change with the input"
    bits = []
    for v, e in sorted(t.vars.items()):
        mult = 2 ** e
        extra = " (a little more because of the log factor)" if t.logs else ""
        bits.append(f"doubling `{v}` multiplies the work by about {mult}{extra}")
    return "; ".join(bits)


_SOURCES = {
    "constant": "a fixed number of steps: arithmetic, an index lookup, a dictionary access, or a loop with a hard-coded bound",
    "logarithmic": "a loop or recursion that halves (or doubles toward) the remaining range each step -- binary search, bit counting, repeated division",
    "polylogarithmic": "nested logarithmic loops -- a halving loop inside another halving loop",
    "square-root": "a loop that stops when i\u00b2 reaches n (trial division up to \u221an), or block decomposition of size \u221an",
    "linear": "one pass over the data: a single loop, one scan, a recursion that peels off one item per call",
    "linearithmic (n log n)": "a linear pass repeated log n times, or divide-and-conquer with linear merging (merge sort), or a sort followed by a pass",
    "quadratic": "two nested loops over the same data (all pairs), an elementary sort, or a linear step inside a linear loop",
    "cubic": "three nested loops, or the textbook matrix multiplication, or Floyd\u2013Warshall",
    "exponential": "a recursion that makes two or more calls on barely-smaller inputs, or a loop over all 2^n subsets",
    "factorial": "generating every ordering (permutation) of n items",
}


_SPACE_SOURCES = {
    "constant": "a fixed number of scalar variables and loop counters, however large the input (in-place algorithms)",
    "logarithmic": "recursion that halves the problem each call (stack depth log n), or a handful of indices into a halved range",
    "square-root": "a block or bucket decomposition of size \u221an",
    "linear": "a copy of the input, a list / set / dict that gains one entry per item, a queue or visited set over n vertices, or a recursion n calls deep (the call stack counts)",
    "linearithmic (n log n)": "log n levels that each hold a linear amount of data at once",
    "quadratic": "an n\u00d7n table or matrix, a dynamic-programming grid, or a slice copied at every level of a recursion that is n deep",
    "cubic": "an n\u00d7n\u00d7n table",
    "exponential": "storing every subset / branch of a decision tree",
    "factorial": "storing every permutation",
}


def _space_scaling(t: Term) -> str:
    base = _doubling(t)
    return base.replace("the work", "the memory").replace("work", "memory")


def class_block(s: str, kind: str = "time") -> str:
    terms = parse_class(s)
    if not terms:
        return ""
    shown = " + ".join(_fmt_term(t) for t in terms)
    parts: List[str] = []
    if len(terms) == 1:
        t = terms[0]
        nm = _name_term(t)
        if t.graph:
            parts.append(f"**Graph measure:** the result is stated in V (vertices) and E (edges), which are separate input sizes -- "
                         f"{'V + E means every vertex and every edge is handled a constant number of times (the adjacency-list traversal bound)' if set(t.vars) >= {'V', 'E'} and t.degree() == 2 else 'the terms are not merged because V and E are independent (E can be anywhere from 0 to about V\u00b2)'}.")
        else:
            src = (_SOURCES if kind == "time" else _SPACE_SOURCES).get(nm.split(" with")[0], "")
            parts.append(f"**Class:** {nm}, f(n) = {shown}. Typical sources: {src}." if src else f"**Class:** {nm}, f(n) = {shown}.")
        parts.append(f"**Scaling:** {_doubling(t) if kind == 'time' else _space_scaling(t)}.")
        if len(t.vars) > 1:
            parts.append("**Independent sizes:** the symbols are separate input sizes, so neither is replaced by the other; "
                         "the cost is the PRODUCT because the loops are nested, and each size is analysed on its own.")
        cap = _capacity(t)
        if cap and kind == "time":
            parts.append(f"**Practical reach:** at about 10^7 simple Python steps per second, one second of work " +
                         (f"is reached when {cap}." if cap.startswith("the product") else f"allows {cap}."))
    else:
        parts.append(f"**Class:** a sum of independent growth terms, f = {shown}. Terms in different size symbols cannot be merged -- "
                     f"which one dominates depends on how the sizes compare, so no term is dropped unless it is dominated in EVERY symbol it contains.")
        dom = max(terms, key=lambda t: (t.degree() + (3 if t.exp else 0) + (6 if t.fact else 0), t.logs))
        parts.append(f"**Dominant behaviour:** `{_fmt_term(dom)}` grows fastest when all sizes grow together; {_doubling(dom)}.")
    if kind == "time":
        parts.append("**Formal reading:** f(n) = O(g(n)) means there are constants c and n\u2080 with f(n) \u2264 c\u00b7g(n) for all n \u2265 n\u2080 -- "
                     "an upper bound that ignores constants and lower-order terms. When the count is exact (no early exit can shorten it), "
                     "the bound is also a lower bound and the tight statement is \u0398(g(n)).")
    return "\n\n".join(parts)


# ===================================================================== AST helpers
_PARENTS: Dict[int, Dict[int, ast.AST]] = {}


def _parents(tree) -> Dict[int, ast.AST]:
    key = id(tree)
    if key not in _PARENTS:
        pm = {}
        for p in ast.walk(tree):
            for c in ast.iter_child_nodes(p):
                pm[id(c)] = p
        if len(_PARENTS) > 4:
            _PARENTS.clear()
        _PARENTS[key] = pm
    return _PARENTS[key]


_INDEX: Dict[int, Dict[tuple, ast.AST]] = {}


def _locate(tree, node):
    """The explainer may hand us a node from another parse of the same source: find its twin in `tree`."""
    pm = _parents(tree)
    if id(node) in pm or node is tree:
        return node
    key = id(tree)
    if key not in _INDEX:
        if len(_INDEX) > 4:
            _INDEX.clear()
        _INDEX[key] = {(type(n).__name__, getattr(n, "lineno", -1), getattr(n, "col_offset", -1)): n
                       for n in ast.walk(tree) if hasattr(n, "lineno")}
    return _INDEX[key].get((type(node).__name__, getattr(node, "lineno", -1), getattr(node, "col_offset", -1)), node)


def _enclosing_loops(tree, node) -> List[ast.AST]:
    pm, out, cur = _parents(tree), [], node
    while id(cur) in pm:
        cur = pm[id(cur)]
        if isinstance(cur, _LOOPS):
            out.append(cur)
        if isinstance(cur, _FUNCS):
            break
    return out[::-1]


def _src(n, limit=50) -> str:
    try:
        t = ast.unparse(n).replace("\n", " ")
    except Exception:
        t = "?"
    return t if len(t) <= limit else t[: limit - 1] + "\u2026"


def _names(n) -> set:
    return {x.id for x in ast.walk(n) if isinstance(x, ast.Name)}


def _const(n):
    return n.value if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)) else None


def _range_args(it):
    return it.args if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range" else None


# ===================================================================== loop forms (summation view)
def loop_form(node, outer_vars: List[str]) -> Optional[Tuple[str, str]]:
    """Returns (shape key, theory sentence) for a loop header, or None."""
    if isinstance(node, (ast.For, ast.AsyncFor)):
        v = node.target.id if isinstance(node.target, ast.Name) else "item"
        ra = _range_args(node.iter)
        if ra is not None:
            n_args = len(ra)
            stop = ra[0] if n_args == 1 else ra[1]
            start = ra[0] if n_args >= 2 else None
            step = ra[2] if n_args == 3 else None
            sc, stc = _const(step), _const(stop)
            used_outer = [o for o in outer_vars if o in _names(stop) | (_names(start) if start is not None else set())]
            if all(_const(a) is not None for a in ra):
                return ("const", f"The bound `{_src(node.iter, 30)}` is a fixed number, not tied to the input, so the loop runs a constant number of times: "
                                 f"\u03a3 1 over a constant range = \u0398(1). (If this were `range(n)` with n the problem size it would be \u0398(n).)")
            if used_outer and n_args >= 1:
                return ("triangular", f"The bound depends on the outer variable `{used_outer[-1]}`, so the iteration count changes each pass. "
                                      f"Add it up: for example \u03a3_{{i=0}}^{{n-1}} i = n(n-1)/2 = \u0398(n\u00b2), and "
                                      f"\u03a3 (n-i) gives the same triangular number. The inner loop is therefore about half of the n\u00b7n square -- "
                                      f"the same class as a full nested loop, only with a smaller constant.")
            if step is not None and sc is not None and sc < 0:
                return ("down", f"Counting down (step {sc}) still visits about |stop - start|/{abs(sc)} values: the loop runs \u0398(n) times; the direction does not matter.")
            if step is not None and sc is not None and abs(sc) > 1:
                return ("step", f"With step {sc} the loop runs about n/{sc} times. The constant factor 1/{sc} is dropped in Big-O: \u0398(n/{sc}) = \u0398(n).")
            if step is not None and sc is None:
                return ("harmonic", f"The step `{_src(step, 20)}` is not a constant. If it grows with an outer variable i, the passes add up to "
                                    f"\u03a3 n/i = n\u00b7H\u2099 \u2248 n ln n (the harmonic sum) -- this is exactly why the sieve of Eratosthenes costs \u0398(n log log n)-ish, not n\u00b2.")
            if isinstance(stop, ast.BinOp) and isinstance(stop.op, ast.Mult) and _src(stop.left) == _src(stop.right):
                return ("square", f"`{_src(stop, 24)}` is n\u00b7n, so this single loop already runs \u0398(n\u00b2) times -- count the bound's VALUE, not the number of loops.")
            if isinstance(stop, ast.BinOp) and isinstance(stop.op, ast.Pow) and _const(stop.left) == 2:
                return ("pow2", f"`{_src(stop, 24)}` is 2^k, so the loop runs exponentially many times in k: \u0398(2^k).")
            if isinstance(stop, ast.BinOp) and isinstance(stop.op, ast.Pow) and _const(stop.right) is not None:
                return ("polyrange", f"`{_src(stop, 24)}` makes the bound a power of n, so the loop runs \u0398(n^{_const(stop.right)}) times.")
            if isinstance(stop, ast.BinOp) and isinstance(stop.op, (ast.FloorDiv, ast.Div)) and _const(stop.right):
                return ("fraction", f"A bound of n/{_const(stop.right)} is still proportional to n: \u0398(n). Constant fractions of n never change the class.")
            if isinstance(stop, ast.Call) and isinstance(stop.func, ast.Name) and stop.func.id in ("int", "isqrt") and "sqrt" in _src(stop):
                return ("sqrt", "A bound of \u221an makes the loop run \u0398(\u221an) times -- the trial-division bound: any factor pair has one member \u2264 \u221an.")
            if isinstance(stop, ast.Call) and isinstance(stop.func, ast.Name) and stop.func.id == "len":
                return ("len", f"The loop runs len({_src(stop.args[0], 16)}) times, so n here is the length of `{_src(stop.args[0], 16)}`: \u03a3_{{i=0}}^{{n-1}} 1 = n = \u0398(n).")
            cnt = _count_expr(node)
            return ("range", f"`{_src(node.iter, 30)}` makes {cnt} passes, so the body runs \u03a3_{{{v}}} 1 = {cnt} times -- linear in the size symbol of the bound, \u0398(n). "
                             f"Offsets and constant multiples such as n\u22121 or n/2 are absorbed by the \u0398.")
        # iterating a collection
        it = node.iter
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id in ("enumerate", "reversed", "sorted", "list", "set"):
            extra = " (sorted() first costs \u0398(n log n) -- that dominates the pass)" if it.func.id == "sorted" else ""
            return ("iter", f"`{it.func.id}(...)` does not change how many items are visited: the loop runs once per item, \u0398(n){extra}.")
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "zip":
            return ("zip", "`zip` stops at the SHORTEST input, so the loop runs min(n, m) times -- bounded by the smaller size, \u0398(min(n, m)).")
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr in ("items", "keys", "values"):
            return ("dict", f"Iterating `.{it.func.attr}()` visits each stored entry once: \u0398(k) for a dictionary of k entries.")
        if isinstance(it, ast.Name) and it.id in outer_vars:
            return ("nested-iter", f"`{it.id}` is the outer loop's current item, so the inner loop's length depends on it -- sum the inner lengths over the outer items to get the total.")
        return ("collection", f"The loop body runs once per element of `{_src(it, 24)}`: n = the number of elements, so \u03a3 1 = n = \u0398(n).")
    if isinstance(node, ast.While):
        t = _src(node.test, 40)
        body = node.body
        upd = [s for s in ast.walk(node) if isinstance(s, (ast.AugAssign, ast.Assign))]
        for s in upd:
            tgt = val = op = None
            if isinstance(s, ast.AugAssign) and isinstance(s.target, ast.Name):
                tgt, op, val = s.target.id, s.op, s.value
            elif isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name) and isinstance(s.value, ast.BinOp):
                tgt, op, val = s.targets[0].id, s.value.op, s.value.right
                if not (isinstance(s.value.left, ast.Name) and s.value.left.id == tgt):
                    tgt = None
            if tgt is None or tgt not in _names(node.test):
                continue
            c = _const(val)
            if isinstance(op, ast.Mult) and c and c >= 2:
                return ("double", f"The control variable `{tgt}` is multiplied by {c} each pass, so after k passes it is {c}^k. The loop ends when {c}^k \u2265 n, i.e. k = log_{c} n: "
                                  f"\u0398(log n) passes. (The base of the log is a constant factor: log\u2082 n and log\u2081\u2080 n differ only by a constant.)")
            if isinstance(op, (ast.FloorDiv, ast.Div, ast.RShift)) and c and c >= 1:
                return ("halve", f"`{tgt}` shrinks by a constant factor each pass, so it takes log n passes to reach 0 or 1 -- recurrence T(n) = T(n/2) + \u0398(1) = \u0398(log n).")
            if isinstance(op, ast.Add) and c:
                return ("step-while", f"`{tgt}` grows by {c} each pass towards the bound: about (bound / {c}) passes = \u0398(n). A constant step never changes the class.")
            if isinstance(op, ast.Sub) and c:
                return ("step-down", f"`{tgt}` shrinks by {c} each pass: about (start / {c}) passes = \u0398(n).")
            if isinstance(op, ast.Mult) and isinstance(val, ast.Name) and val.id == tgt:
                return ("loglog", f"`{tgt}` is squared each pass (1, 2, 4, 16, 256, ...), so it reaches n after only log log n passes -- \u0398(log log n).")
            if isinstance(s, ast.Assign) and isinstance(s.value, ast.BinOp) and isinstance(s.value.op, ast.Mult) and _src(s.value.left) == _src(s.value.right) == tgt:
                return ("loglog", f"`{tgt}` is squared each pass, so it reaches n after only log log n passes -- \u0398(log log n).")
        if "*" in t and any(isinstance(x, ast.BinOp) and isinstance(x.op, ast.Mult) and _src(x.left) == _src(x.right) for x in ast.walk(node.test)):
            return ("sqrt-while", "The test `i * i < n` fails once i reaches \u221an, so the loop runs \u0398(\u221an) times.")
        if isinstance(node.test, ast.Constant) and node.test.value is True:
            return ("forever", "`while True` has no bound of its own: the cost is decided by whichever `break` / `return` ends it. Analyse the worst input for which that exit fires as late as possible.")
        if re.search(r"\b(lo|low|left|l)\b.*<.*\b(hi|high|right|r)\b", t):
            return ("binary", "The search range [lo, hi] shrinks by half every pass, so the loop runs \u230alog\u2082 n\u230b + 1 times in the worst case: \u0398(log n).")
        if isinstance(node.test, ast.Name) or (isinstance(node.test, ast.UnaryOp) and isinstance(node.test.op, ast.Not)):
            return ("worklist", f"`while {t}` runs until a work list / flag empties. Count how many times an item can enter it (each item at most once => the loop runs at most n times).")
        return ("while", f"The loop runs while `{t}` holds. To bound it, find how the tested quantity changes per pass (add, multiply, halve) and how many passes bring it past the bound.")
    return None


def _count_expr(lp) -> str:
    """How many passes a loop makes, written as an expression (n - 1, len(a), log n, ...)."""
    if isinstance(lp, (ast.For, ast.AsyncFor)):
        ra = _range_args(lp.iter)
        if ra is not None:
            stop = ra[0] if len(ra) == 1 else ra[1]
            start = _const(ra[0]) if len(ra) >= 2 else 0
            st = _src(stop, 18)
            if start in (0, None):
                return st if re.fullmatch(r"[A-Za-z_]\w*", st) else f"({st})"
            return f"({st} \u2212 {_src(ra[0], 10)})"
        it = _src(lp.iter, 14)
        return f"len({it})"
    return "k"


def _outer_vars(loops) -> List[str]:
    out = []
    for lp in loops:
        if isinstance(lp, (ast.For, ast.AsyncFor)) and isinstance(lp.target, ast.Name):
            out.append(lp.target.id)
    return out


# ===================================================================== builtin operations (worst / amortized / average)
_OPS: Dict[str, str] = {
    "append": "**Amortized analysis:** `list.append` is O(1) *amortized*. Most appends write one slot; an occasional append triggers a resize that copies all k items. "
              "Because capacity grows geometrically, n appends copy at most 2n items in total (aggregate method), so the cost per append averages out to O(1) even though a single append can cost O(n).",
    "insert": "`list.insert(i, x)` shifts every item after position i one slot right, so it costs \u0398(n \u2212 i): \u0398(n) in the worst case (insert at the front).",
    "pop0": "`list.pop(0)` removes the FIRST item and shifts all remaining items left: \u0398(n) per call, so n calls cost \u0398(n\u00b2). `collections.deque.popleft()` is O(1).",
    "pop": "`list.pop()` at the end is O(1); `pop(i)` anywhere else shifts the tail, \u0398(n \u2212 i).",
    "remove": "`list.remove(x)` first searches for x (\u0398(n) comparisons), then shifts the tail: \u0398(n) in the best-to-worst range of cases.",
    "index": "`list.index(x)` is a linear search: best case \u0398(1) (first item), worst case \u0398(n) comparisons.",
    "count": "`list.count(x)` must inspect every item: \u0398(n) in every case (no early exit).",
    "sort": "Comparison sorting has a lower bound of \u03a9(n log n) (a decision tree with n! leaves has height \u2265 log\u2082 n!). Python's Timsort meets it: \u0398(n log n) worst case, and \u0398(n) on already-sorted data because it detects runs.",
    "reverse": "`reverse` swaps pairs from both ends: n/2 swaps = \u0398(n), in place with O(1) extra space.",
    "extend": "`list.extend(other)` copies len(other) items: \u0398(k) for k new items (amortized, like append).",
    "copy": "Copying a container touches every element once: \u0398(n) time and \u0398(n) new memory.",
    "join": "`str.join` computes the total length first and builds the result once: \u0398(total characters). Repeated `s += piece` in a loop re-copies the growing string each time: \u03a3 = \u0398(n\u00b2).",
    "find": "`str.find` / `in` on strings may compare up to m characters at each of n \u2212 m + 1 start positions: \u0398(n\u00b7m) worst case for the naive method (CPython uses faster heuristics, but the model bound is n\u00b7m).",
    "get": "Dictionary and set operations are O(1) *expected* (average over a good hash function) but \u0398(n) in the worst case when many keys collide into one bucket -- state which case you are quoting.",
    "add": "Set `add` / `in` is O(1) expected, \u0398(n) worst case (all keys colliding); inserting a new key may trigger a rehash, which is O(1) amortized.",
    "heappush": "A binary-heap `push` sifts the new item up one root-to-leaf path: O(log n) worst case. `heapify` builds a whole heap in \u0398(n), not n log n.",
    "heappop": "A heap `pop` moves the last item to the root and sifts it down one path: O(log n). Draining a heap item by item costs \u0398(n log n) -- that is heap sort.",
    "bisect": "Binary search halves the range each step: O(log n) comparisons -- but the list must already be sorted, and `bisect.insort` still shifts items afterwards: O(n).",
    "popleft": "`deque.popleft` / `appendleft` are O(1) because a deque is a doubly-linked block structure, unlike a list that must shift items.",
    "sorted": "`sorted` copies the data (\u0398(n) extra space) and sorts it: \u0398(n log n) time, \u03a9(n log n) for any comparison sort.",
    "min": "`min` / `max` / `sum` / `any` / `all` scan the whole input once: \u0398(n) (`any`/`all` can stop early, so their best case is \u0398(1)).",
    "len": "`len` reads a stored size field: \u0398(1), independent of how many items the container holds.",
    "set": "Building a set from n items inserts each one: \u0398(n) expected time, \u0398(n) space.",
    "slice": "A slice `x[a:b]` creates a NEW list and copies b \u2212 a items: \u0398(b \u2212 a) time and extra space -- not O(1).",
    "concat": "`a + b` on lists or strings builds a new sequence of len(a) + len(b) items: \u0398(len(a) + len(b)). Inside a loop this repeats and can turn a linear algorithm quadratic.",
}


def _op_key(call: ast.Call) -> Optional[str]:
    f = call.func
    nm = f.attr if isinstance(f, ast.Attribute) else (f.id if isinstance(f, ast.Name) else None)
    if nm is None:
        return None
    if nm == "pop" and call.args and _const(call.args[0]) == 0:
        return "pop0"
    if nm in ("insert",) and call.args and _const(call.args[0]) == 0:
        return "insert"
    if nm in ("min", "max", "sum", "any", "all"):
        return "min"
    if nm in ("get", "setdefault", "update"):
        return "get"
    if nm in ("heappush", "heapify"):
        return "heappush"
    if nm in ("heappop",):
        return "heappop"
    if nm in ("bisect", "bisect_left", "bisect_right", "insort"):
        return "bisect"
    if nm in ("sort",):
        return "sort"
    if nm in ("sorted",):
        return "sorted"
    if nm in ("append", "insert", "remove", "index", "count", "reverse", "extend", "join", "find", "add", "popleft", "appendleft", "len", "copy", "set", "pop"):
        return {"appendleft": "popleft"}.get(nm, nm)
    return None


# ===================================================================== per-line notes
def line_time_notes(tree, node, local_t: str, global_t: str) -> List[Tuple[float, str]]:
    notes: List[Tuple[float, str]] = []
    if tree is None or node is None:
        return notes
    node = _locate(tree, node)
    inner = node.value if isinstance(node, ast.Expr) else node
    loops = _enclosing_loops(tree, inner)
    ov = _outer_vars([l for l in loops if l is not inner])
    try:
        if isinstance(inner, _LOOPS):
            lf = loop_form(inner, ov)
            if lf:
                txt = f"**Counting iterations (theory):** {lf[1]}"
                nest = list(loops) + [inner]
                if len(nest) > 1 and all(isinstance(l, (ast.For, ast.AsyncFor)) for l in nest) and not (lf and lf[0] == "triangular"):
                    prod = " \u00b7 ".join(_count_expr(l) for l in nest)
                    txt += f" Over the whole nest the innermost body runs {prod} times, which the analyzer reports as {global_t}."
                notes.append((0.5, txt))
        elif isinstance(inner, ast.If):
            has_exit = any(isinstance(x, (ast.Break, ast.Return)) for x in ast.walk(inner))
            txt = ("**Branch cost in worst-case analysis:** the cost of an `if` is the cost of its test plus the COSTLIER branch -- never the sum of branches, "
                   "because only one runs per execution. ")
            txt += ("Because a branch here can `break`/`return`, the best case may be far cheaper than the worst case; Big-O still reports the worst case, "
                    "so assume the exit fires as late as possible." if has_exit else
                    "Here the test is O(1), so the branch adds a constant factor and never changes the class.")
            notes.append((0.5, txt))
        elif isinstance(inner, (ast.Assign, ast.AugAssign, ast.Return, ast.Expr, ast.AnnAssign)):
            call = next((c for c in ast.walk(inner) if isinstance(c, ast.Call) and _op_key(c)), None)
            sl = next((s for s in ast.walk(inner) if isinstance(s, ast.Subscript) and isinstance(s.slice, ast.Slice)), None)
            if call is not None:
                notes.append((0.5, "**Cost model:** " + _OPS[_op_key(call)]))
            elif sl is not None:
                notes.append((0.5, "**Cost model:** " + _OPS["slice"]))
            elif isinstance(inner, ast.Assign) and isinstance(inner.value, ast.BinOp) and isinstance(inner.value.op, ast.Add) and \
                    any(isinstance(x, ast.Subscript) for x in ast.walk(inner.value)) and isinstance(inner.value.left, (ast.Subscript, ast.List)):
                notes.append((0.5, "**Cost model:** " + _OPS["concat"]))
            elif loops and str(local_t).replace(" ", "") == "O(1)" and str(global_t).replace(" ", "") != "O(1)":
                prod = " \u00b7 ".join(_count_expr(l) if isinstance(l, ast.For) else "log n" for l in loops)
                notes.append((0.5, f"**Basic operation:** this statement is one O(1) step. Total cost = (cost per execution) \u00d7 (number of executions) = "
                                   f"1 \u00d7 [iterations of {len(loops)} enclosing loop{'s' if len(loops) > 1 else ''}], which the analyzer reports as {global_t}. "
                                   f"Nested loops multiply their iteration counts: {prod}."))
        elif isinstance(inner, _FUNCS):
            notes.append((0.5, "**Input size:** a function's complexity is a function of its input size n, chosen before analysis -- here the parameters. "
                               "Defining the function is O(1); its cost is the cost of one CALL, found by summing its body's lines."))
    except Exception:
        pass
    return notes


def line_space_notes(tree, node, local_s: str, global_s: str) -> List[Tuple[float, str]]:
    notes: List[Tuple[float, str]] = []
    if tree is None or node is None:
        return notes
    node = _locate(tree, node)
    inner = node.value if isinstance(node, ast.Expr) else node
    try:
        call = next((c for c in ast.walk(inner) if isinstance(c, ast.Call) and _op_key(c)), None)
        if call is not None and _op_key(call) in ("sorted", "copy", "set", "extend", "join"):
            notes.append((0.5, "**Space accounting:** this builds a new container proportional to the input, so it adds \u0398(n) AUXILIARY space (memory beyond the input). "
                               "Space is the peak amount alive at once -- not the sum of everything ever allocated."))
        elif any(isinstance(s, ast.Subscript) and isinstance(s.slice, ast.Slice) for s in ast.walk(inner)):
            notes.append((0.5, "**Space accounting:** a slice allocates a copy of the selected part. Inside a recursion, every ACTIVE call keeps its own copy alive, "
                               "so the peak is the sum over the call stack (n + (n\u22121) + \u2026 = \u0398(n\u00b2) for slice-per-call recursion)."))
        elif isinstance(inner, (ast.Return,)) and False:
            pass
        elif isinstance(inner, _FUNCS):
            notes.append((0.5, "**Space convention:** auxiliary space counts extra memory the algorithm allocates, excluding the input it was given; "
                               "total space = input + auxiliary. Recursive frames count too: depth d keeps d frames alive, \u0398(d) stack space."))
    except Exception:
        pass
    return notes


# ===================================================================== recurrence analysis (Master Theorem)
def _divisor(args) -> Optional[int]:
    for a in args:
        for x in ast.walk(a):
            if isinstance(x, ast.BinOp) and isinstance(x.op, (ast.FloorDiv, ast.Div)) and _const(x.right) and _const(x.right) >= 2:
                return int(_const(x.right))
            if isinstance(x, ast.BinOp) and isinstance(x.op, ast.RShift):
                return 2
        txt = _src(a)
        if "mid" in txt or "half" in txt or re.search(r"\[:\s*len\(.*\)\s*//\s*2\]", txt):
            return 2
    return None


def _subtract(args) -> Optional[int]:
    for a in args:
        if isinstance(a, ast.BinOp) and isinstance(a.op, ast.Sub) and _const(a.right):
            return int(_const(a.right))
    return None


def _work_degree(fn) -> Tuple[int, str]:
    """Polynomial degree of the NON-recursive work of one call: deepest loop nest (ignoring the recursive calls)."""
    def depth(n, d=0):
        best = d
        for ch in ast.iter_child_nodes(n):
            if isinstance(ch, _FUNCS):
                continue
            best = max(best, depth(ch, d + 1 if isinstance(ch, _LOOPS) else d))
        return best
    d = depth(fn)
    slicing = any(isinstance(s, ast.Subscript) and isinstance(s.slice, ast.Slice) for s in ast.walk(fn))
    if d == 0 and slicing:
        return 1, "n"
    return d, "n"


def recurrence_note(tree) -> str:
    out = []
    for fn in [n for n in ast.walk(tree) if isinstance(n, _FUNCS)]:
        calls = [c for c in ast.walk(fn) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == fn.name]
        if not calls:
            continue
        a = len(calls)
        # calls in mutually exclusive branches count once (binary-search style)
        rets = [r for r in ast.walk(fn) if isinstance(r, ast.Return) and any(isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == fn.name for c in ast.walk(r))]
        in_loop = any(any(c is x for x in ast.walk(lp)) for lp in ast.walk(fn) if isinstance(lp, _LOOPS) for c in calls)
        div = _divisor([x for c in calls for x in c.args])
        sub = _subtract([x for c in calls for x in c.args])
        d, _ = _work_degree(fn)
        if len(rets) >= 2 and len(rets) == a and div:
            a = 1
        name = fn.name
        if in_loop and sub:
            out.append(f"`{name}`: the recursive call sits inside a loop, so each call spawns about n sub-calls on size n\u22121: T(n) = n\u00b7T(n\u22121) + \u0398(n) = \u0398(n\u00b7n!) -- factorial growth.")
        elif div:
            f = f"n^{d}" if d > 1 else ("n" if d == 1 else "1")
            logba = math.log(a, div) if a >= 1 else 0
            if abs(logba - d) < 1e-9:
                res = f"\u0398(n^{d} log n)" if d > 1 else ("\u0398(n log n)" if d == 1 else "\u0398(log n)")
                case = "case 2 (the work per level is balanced: f(n) = \u0398(n^(log_b a)), so every level costs the same and there are log n levels)"
            elif d > logba:
                res = f"\u0398(n^{d})" if d > 1 else "\u0398(n)"
                case = "case 3 (the root's own work f(n) dominates the whole tree)"
            else:
                res = f"\u0398(n^{logba:.3g})" if abs(logba - round(logba)) > 1e-9 else (f"\u0398(n^{int(round(logba))})" if round(logba) > 1 else "\u0398(n)")
                case = "case 1 (the leaves dominate: the tree has n^(log_b a) leaves)"
            out.append(f"`{name}`: a = {a} call{'s' if a != 1 else ''}, each on n/{div}, plus \u0398({f}) work per call: T(n) = {a if a != 1 else ''}T(n/{div}) + \u0398({f}). "
                       f"Master Theorem compares f(n) with n^(log_{div} {a}) = n^{logba:.3g}: {case} \u21d2 T(n) = {res}.")
        elif sub is not None or a >= 1:
            k = sub or 1
            if a == 1:
                f = "1" if d == 0 else (f"n^{d}" if d > 1 else "n")
                res = {0: "\u0398(n)", 1: "\u0398(n\u00b2)"}.get(d, f"\u0398(n^{d + 1})")
                out.append(f"`{name}`: one call on n\u2212{k} plus \u0398({f}) work: T(n) = T(n\u2212{k}) + \u0398({f}). Unrolling gives n/{k} levels of cost {f} each (substitution / recursion-tree method) \u21d2 T(n) = {res}. "
                           f"The Master Theorem does not apply to a subtractive step; use unrolling or the characteristic equation.")
            else:
                out.append(f"`{name}`: {a} calls on n\u2212{k}: T(n) = {a}\u00b7T(n\u2212{k}) + \u0398(1). The recursion tree has {a}{'^n' if k == 1 else f'^(n/{k})'} leaves, so T(n) = \u0398({a}{'^n' if k == 1 else f'^(n/{k})'}) -- exponential. "
                           f"Overlapping sub-problems recomputed from scratch are what memoization (dynamic programming) removes.")
    return "\n".join(f"- {x}" for x in out[:3])


# ===================================================================== overall theory notes
def _early_exit(tree) -> bool:
    for lp in ast.walk(tree):
        if isinstance(lp, _LOOPS) and any(isinstance(x, (ast.Break, ast.Return)) for x in ast.walk(lp)):
            return True
    return False


def _deepest_for_nest(tree):
    best: List[ast.AST] = []

    def walk(n, chain):
        nonlocal best
        for ch in ast.iter_child_nodes(n):
            if isinstance(ch, _FUNCS) and chain:
                continue
            c2 = chain + [ch] if isinstance(ch, (ast.For, ast.AsyncFor)) else chain
            if len(c2) > len(best):
                best = c2
            walk(ch, c2)
    walk(tree, [])
    return best


def summation_note(tree, final_time: str) -> str:
    nest = _deepest_for_nest(tree)
    if len(nest) < 2:
        return ""
    outer: List[str] = []
    counts, tri = [], False
    for lp in nest:
        lf = loop_form(lp, outer)
        tri = tri or bool(lf and lf[0] == "triangular")
        counts.append(_count_expr(lp))
        if isinstance(lp.target, ast.Name):
            outer.append(lp.target.id)
    idx = "ijklmn"[: len(nest)]
    sig = " ".join(f"\u03a3_{{{v}}}" for v in idx)
    if tri:
        body = (f"{sig} 1 with a bound that depends on an outer index -- the inner count changes each pass (for example 0, 1, 2, \u2026, n\u22121), so the total is the "
                "triangular number n(n\u22121)/2 = \u00bdn\u00b2 \u2212 \u00bdn. Drop the constant \u00bd and the lower-order term: \u0398(n\u00b2).")
    else:
        body = f"{sig} 1 = {' \u00b7 '.join(counts)}. Expand the product and keep the dominant term: {final_time}."
    return ("**Counting basic operations**\n\nTake the innermost statement as the basic operation and count how often it runs (a nested sum):\n\n"
            f"{body}")


def overall_theory(tree, final_time: str, final_space: str) -> str:
    blocks: List[str] = []
    try:
        sm = summation_note(tree, final_time) if tree is not None else ""
        if sm:
            blocks.append(sm)
        tb = class_block(final_time, "time")
        if tb:
            blocks.append("**Time complexity in theory**\n\n" + tb)
        rec = recurrence_note(tree) if tree is not None else ""
        if rec:
            blocks.append("**Recurrence relation and Master Theorem**\n\n" + rec)
        if tree is not None and _early_exit(tree):
            blocks.append("**Best, average and worst case**\n\nA `break` or early `return` means the input decides how long it runs. Big-O quotes the **worst case** (the exit fires as late as it can). "
                          "The best case is the lucky input (exit on the first pass) and gives an \u03a9 lower bound; an **average case** needs an assumption about how inputs are distributed, "
                          "so it is only stated together with that assumption. If worst-case O and best-case \u03a9 coincide, the algorithm is \u0398.")
        sb = class_block(final_space, "space")
        if sb:
            blocks.append("**Space complexity in theory**\n\n" + sb +
                          "\n\n**Accounting convention:** space is *auxiliary* (extra memory beyond the input) and *peak* (the most alive at one moment), "
                          "including the call stack of any recursion. Total space = input + auxiliary.")
    except Exception:
        return ""
    return "\n\n".join(blocks)
