"""
Notation Clarity

Big-O notation is easy to misread, and the same piece of code can honestly be
read in more than one way. This module spots the places in the learner's OWN
program where those different readings come up and says which one Big-O uses,
and why. It never changes the complexity that was computed -- it only explains
it.

The confusions it covers:

  * a fixed number is not "n":      range(1000)            -> O(1), however big 1000 feels
  * a variable can still be fixed:  n = 10; range(n)       -> O(1); n = int(input()) -> O(n)
  * where n comes from:             typed in / len(x) / a parameter -- and a number's
                                    VALUE is not its number of digits
  * constants and offsets vanish:   range(n // 2), range(5, n), range(0, n, 2)  -> O(n)
  * direct ranges look at the gap:  range(i, i + 3) is O(1) even though i grows
  * not every nested loop is x n:   an inner range(3) multiplies by 3, not by n
  * two different inputs:           len(a) x len(b) is O(a*b); the analyzer's single n
                                    only reads as n^2 when both are about equal
  * two styles, same output:        `for x in a` vs `range(len(a))`, and a loop that adds
                                    1..n vs the formula n*(n+1)/2 -- Big-O grades the
                                    work done, not the answer
  * value vs digits:                `while n > 0: n //= 10` is O(log n) in the value of n

Everything is deterministic text built from the source (no learner code is run).
Notes are `(priority, text)` pairs in the same shape the rest of the insight
engine uses; priority 0.5 means "show before the generic loop notes".
"""
import ast
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

Note = Tuple[float, str]

CLARITY_PRIORITY = 0.5

_GROWING = {"size", "input", "param", "derived"}
_FIXED = {"literal", "fixed"}


def _src(node, limit: int = 40) -> str:
    try:
        s = ast.unparse(node)
    except Exception:
        return "?"
    s = " ".join(s.split())
    return s if len(s) <= limit else s[: limit - 3] + "..."


def _is_int(node) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, int) and not isinstance(node.value, bool)


@dataclass
class Origin:
    kind: str                    # literal | fixed | input | size | param | derived | loopvar | unknown
    text: str = ""               # source text of the thing that was resolved
    value: Optional[int] = None  # for literal / fixed
    line: Optional[int] = None   # line where a name got its value
    root: str = ""               # what it measures: the collection / parameter / input name
    base: Optional["Origin"] = None  # for derived: the growing origin it is built from

    @property
    def fixed(self) -> bool:
        return self.kind in _FIXED

    @property
    def growing(self) -> bool:
        return self.kind in _GROWING


class NotationClarity:
    """Composed into EducationalInsightGenerator as `self.notation_clarity`."""

    def __init__(self, generator):
        self.generator = generator
        self._tree_key = None
        self._parents: Dict[int, ast.AST] = {}
        self._by_pos: Dict[tuple, ast.AST] = {}

    # ------------------------------------------------------------------
    # tree / scope helpers
    # ------------------------------------------------------------------
    @property
    def _tree(self):
        return getattr(self.generator.shape, "tree", None)

    def _ensure_parents(self):
        tree = self._tree
        if tree is None:
            return
        if self._tree_key is not id(tree):
            self._parents = {}
            self._by_pos = {}
            for parent in ast.walk(tree):
                for child in ast.iter_child_nodes(parent):
                    self._parents[id(child)] = parent
                if hasattr(parent, "lineno"):
                    self._by_pos[(type(parent).__name__, parent.lineno, getattr(parent, "col_offset", 0))] = parent
            self._tree_key = id(tree)

    def _canon(self, node):
        """The analyzer hands us nodes from its own parse; map them onto this tree
        (by type + position) so parent / scope lookups work."""
        self._ensure_parents()
        if id(node) in self._parents:
            return node
        return self._by_pos.get((type(node).__name__, getattr(node, "lineno", -1), getattr(node, "col_offset", 0)), node)

    def _enclosing_function(self, node):
        self._ensure_parents()
        cur = self._parents.get(id(node))
        while cur is not None:
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                return cur
            cur = self._parents.get(id(cur))
        return None

    def _enclosing_loops(self, node) -> List[ast.AST]:
        self._ensure_parents()
        out = []
        cur = self._parents.get(id(node))
        while cur is not None:
            if isinstance(cur, (ast.For, ast.While, ast.AsyncFor)):
                out.append(cur)
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                break
            cur = self._parents.get(id(cur))
        return out

    @staticmethod
    def _params(fn) -> List[str]:
        if fn is None:
            return []
        a = fn.args
        names = [x.arg for x in getattr(a, "posonlyargs", [])] + [x.arg for x in a.args] + [x.arg for x in a.kwonlyargs]
        if a.vararg:
            names.append(a.vararg.arg)
        if a.kwarg:
            names.append(a.kwarg.arg)
        return names

    def _bindings(self, scope, name: str):
        """Every place `name` is bound inside `scope` (not descending into nested defs)."""
        out = []

        def visit(n):
            for ch in ast.iter_child_nodes(n):
                if isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                    continue
                if isinstance(ch, ast.Assign):
                    for t in ch.targets:
                        if isinstance(t, ast.Name) and t.id == name:
                            out.append(("assign", ch, ch.value))
                        elif any(isinstance(x, ast.Name) and x.id == name for x in ast.walk(t)):
                            out.append(("unpack", ch, None))
                elif isinstance(ch, ast.AnnAssign):
                    if isinstance(ch.target, ast.Name) and ch.target.id == name and ch.value is not None:
                        out.append(("assign", ch, ch.value))
                elif isinstance(ch, ast.AugAssign):
                    if isinstance(ch.target, ast.Name) and ch.target.id == name:
                        out.append(("aug", ch, None))
                elif isinstance(ch, (ast.For, ast.AsyncFor)):
                    if any(isinstance(x, ast.Name) and x.id == name for x in ast.walk(ch.target)):
                        out.append(("loopvar", ch, None))
                elif isinstance(ch, ast.NamedExpr):
                    if isinstance(ch.target, ast.Name) and ch.target.id == name:
                        out.append(("walrus", ch, None))
                visit(ch)

        visit(scope)
        return out

    def _analyzer_says_constant(self, expr) -> bool:
        """Ask the analyzer itself whether it treats this expression as a fixed number, so a
        note never contradicts the complexity the learner sees. (The analyzer deliberately
        keeps dimension-style names -- N, M, ROW, COL, SIZE ... -- as sizes even when they
        are assigned a literal.)"""
        try:
            h = getattr(self.generator.ctx, "complexity_heuristics", None)
            return bool(h._is_constant_expr(expr)) if h is not None else False
        except Exception:
            return False

    # ------------------------------------------------------------------
    # where does a bound come from?
    # ------------------------------------------------------------------
    def origin(self, expr, anchor, _depth: int = 0) -> Origin:
        text = _src(expr, 30)
        if _depth > 3 or expr is None:
            return Origin("unknown", text)
        if isinstance(expr, ast.Constant) and isinstance(expr.value, (int, float)) and not isinstance(expr.value, bool):
            v = int(expr.value) if isinstance(expr.value, int) else None
            return Origin("literal", text, value=v)
        if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, (ast.USub, ast.UAdd)):
            return self.origin(expr.operand, anchor, _depth + 1)
        if isinstance(expr, ast.Call) and isinstance(expr.func, ast.Name):
            fname = expr.func.id
            if fname == "len" and expr.args:
                return Origin("size", text, root=self._root_name(expr.args[0]))
            if fname == "input":
                return Origin("input", text, root="input")
            if fname in ("int", "float", "abs") and expr.args:
                inner = self.origin(expr.args[0], anchor, _depth + 1)
                return inner if inner.kind != "unknown" else Origin("unknown", text)
            if fname in ("min", "max") and expr.args:
                parts = [self.origin(a, anchor, _depth + 1) for a in expr.args]
                grow = next((p for p in parts if p.growing), None)
                if grow is not None:
                    return Origin("derived", text, base=grow, root=grow.root)
                if all(p.fixed for p in parts):
                    return Origin("fixed", text)
            return Origin("unknown", text)
        if isinstance(expr, ast.BinOp):
            a = self.origin(expr.left, anchor, _depth + 1)
            b = self.origin(expr.right, anchor, _depth + 1)
            op = expr.op
            if a.fixed and b.fixed:
                return Origin("fixed", text)
            # Only claim "still grows like n" when exactly one side grows and the other is a
            # fixed number used the way that keeps the growth class (n+1, n//2, 2*n ...).
            # n*n, a+b, 1000//n, n**2 ... change the class, so they are left alone.
            if a.growing != b.growing and (a.fixed or b.fixed):
                grow = a if a.growing else b
                if isinstance(op, (ast.Add, ast.Sub, ast.Mult)):
                    return Origin("derived", text, base=grow, root=grow.root)
                if isinstance(op, (ast.FloorDiv, ast.Div)) and a.growing and b.fixed:
                    return Origin("derived", text, base=grow, root=grow.root)
            return Origin("unknown", text)
        if isinstance(expr, ast.Name):
            o = self._name_origin(expr.id, anchor, text, _depth)
            if o.kind == "fixed" and not self._analyzer_says_constant(expr):
                return Origin("unknown", text)      # the analyzer reads this name as a size: stay silent
            return o
        return Origin("unknown", text)

    def _root_name(self, expr) -> str:
        """The collection a size / iteration is about (`a` in len(a), `a[i]` ...)."""
        for n in ast.walk(expr):
            if isinstance(n, ast.Name):
                return n.id
        return _src(expr, 20)

    def _name_origin(self, name: str, anchor, text: str, depth: int) -> Origin:
        fn = self._enclosing_function(anchor)
        scopes = [fn] if fn is not None else []
        scopes.append(self._tree)
        params = self._params(fn)

        for sc in scopes:
            if sc is None:
                continue
            binds = self._bindings(sc, name)
            if sc is fn and name in params:
                kinds = {b[0] for b in binds}
                if not binds or kinds <= {"aug"}:
                    return Origin("param", text, root=name)
            if not binds:
                continue
            kinds = {b[0] for b in binds}
            if "loopvar" in kinds:
                return Origin("loopvar", text, root=name)
            if kinds != {"assign"}:
                return Origin("unknown", text)
            vals = [b[2] for b in binds]
            line = getattr(binds[0][1], "lineno", None)
            if all(_is_int(v) for v in vals):
                return Origin("fixed", text, value=vals[0].value, line=line)
            if len(vals) == 1:
                o = self.origin(vals[0], binds[0][1], depth + 1)
                if o.kind in ("input", "size", "derived", "fixed", "literal", "param"):
                    kind = "fixed" if o.kind == "literal" else o.kind
                    return Origin(kind, text, value=o.value, line=line, root=o.root or name, base=o.base)
            return Origin("unknown", text)
        return Origin("unknown", text)

    # ------------------------------------------------------------------
    # small phrases
    # ------------------------------------------------------------------
    def _where(self, o: Origin) -> str:
        return f" (line {o.line})" if o.line else ""

    def _loop_bound_expr(self, node):
        """(lo, hi, step) expressions of a range() loop, else None."""
        it = node.iter
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range" and 1 <= len(it.args) <= 3:
            a = it.args
            if len(a) == 1:
                return None, a[0], None
            return a[0], a[1], (a[2] if len(a) > 2 else None)
        return None

    def _root_is_collection(self, node) -> bool:
        """True when the loop walks items of something (for x in a / range(len(a)))."""
        it = node.iter
        if isinstance(it, ast.Name):
            return True
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name):
            if it.func.id in ("enumerate", "reversed", "sorted", "list"):
                return True
            if it.func.id == "range":
                b = self._loop_bound_expr(node)
                if b is not None:
                    o = self.origin(b[1], node)
                    return o.kind == "size" or (o.kind == "derived" and o.base is not None and o.base.kind == "size")
        return False

    def _iter_root(self, node) -> Optional[str]:
        """What a `for` loop is really measuring: `a` for `for x in a` and range(len(a))."""
        it = node.iter
        if isinstance(it, ast.Name):
            return it.id
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name):
            if it.func.id == "range":
                b = self._loop_bound_expr(node)
                if b is None:
                    return None
                o = self.origin(b[1], node)
                if o.kind in ("size", "input", "param", "derived"):
                    return o.root or None
                if o.kind == "loopvar":
                    return None
                if isinstance(b[1], ast.Name):
                    return b[1].id
                return None
            if it.func.id in ("enumerate", "reversed", "sorted", "list") and it.args and isinstance(it.args[0], ast.Name):
                return it.args[0].id
        return None

    # ------------------------------------------------------------------
    # per-line notes
    # ------------------------------------------------------------------
    def time_notes(self, node, line_no: int, local_t: str = "", global_t: str = "") -> List[Note]:
        if self._tree is None:
            return []
        try:
            node = self._canon(node)
            if isinstance(node, (ast.For, ast.AsyncFor)):
                return self._for_notes(node, local_t)
            if isinstance(node, ast.While):
                return self._while_notes(node)
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.Return)):
                return self._assign_notes(node)
        except Exception:
            return []
        return []

    def _used_as_bound(self, name: str, anchor) -> bool:
        """Is `name` the stop value of a range() or the limit a loop condition compares against?"""
        fn = self._enclosing_function(anchor)
        scope = fn if fn is not None else self._tree
        for n in ast.walk(scope):
            if isinstance(n, (ast.For, ast.AsyncFor)):
                b = self._loop_bound_expr(n)
                if b is not None and any(isinstance(x, ast.Name) and x.id == name for x in ast.walk(b[1])):
                    return True
            elif isinstance(n, ast.While) and isinstance(n.test, ast.Compare):
                for comp in n.test.comparators:
                    if any(isinstance(x, ast.Name) and x.id == name for x in ast.walk(comp)):
                        return True
        return False

    def _has_fixed_bound_use(self, name: str, anchor) -> bool:
        """Every range() loop bounded by `name` is a fixed bound in the analyzer's eyes (and there is one)."""
        fn = self._enclosing_function(anchor)
        scope = fn if fn is not None else self._tree
        seen = False
        for n in ast.walk(scope):
            if isinstance(n, (ast.For, ast.AsyncFor)):
                b = self._loop_bound_expr(n)
                if b is not None and isinstance(b[1], ast.Name) and b[1].id == name:
                    seen = True
                    if not self.origin(b[1], n).fixed:
                        return False
        return seen

    @staticmethod
    def _local_is_constant(local_t: str) -> bool:
        return bool(re.fullmatch(r"\s*O\(1\)\s*", str(local_t or "")))

    def _first_bound_use(self, node, name: str) -> bool:
        """True when `node` is the first range() loop (by line) bounded by `name` in its function."""
        fn = self._enclosing_function(node)
        scope = fn if fn is not None else self._tree
        first = None
        for n in ast.walk(scope):
            if isinstance(n, (ast.For, ast.AsyncFor)):
                b = self._loop_bound_expr(n)
                if b is not None and isinstance(b[1], ast.Name) and b[1].id == name:
                    if first is None or (n.lineno, n.col_offset) < (first.lineno, first.col_offset):
                        first = n
        return first is None or first is node

    # -- for loops -------------------------------------------------------
    def _for_notes(self, node, local_t: str = "") -> List[Note]:
        out: List[Note] = []
        bnd = self._loop_bound_expr(node)

        if bnd is not None:
            lo, hi, step = bnd
            o = self.origin(hi, node)
            lo_o = self.origin(lo, node) if lo is not None else Origin("literal", "0", value=0)
            hi_t = _src(hi, 24)
            bound_fixed = o.fixed and lo_o.fixed
            if bound_fixed and local_t and not self._local_is_constant(local_t):
                bound_fixed = False        # the analyzer scores this loop as growing: don't say O(1)
                o = Origin("unknown", o.text)

            # 1. where the bound comes from
            big = f"{hi_t} may feel big, but " if (o.value is not None and o.value >= 100) else ""
            if bound_fixed:
                if lo is None and o.kind == "literal":
                    out.append((CLARITY_PRIORITY, (
                        f"**A fixed number is not n:** `range({hi_t})` always makes exactly {hi_t} passes, whatever the input is, "
                        f"so this loop is O(1). {big}Big-O asks how the work *grows* with the input -- "
                        f"a count that never changes never grows.")))
                elif o.kind == "fixed" and isinstance(hi, ast.Name):
                    out.append((CLARITY_PRIORITY, (
                        f"**A variable can still be a constant:** `{hi.id}` looks like an input name, but here it is only ever "
                        f"set to {o.value if o.value is not None else 'a fixed number'}{self._where(o)}, so the loop always makes the same number of passes: O(1). "
                        f"It becomes O(n) only if the value can grow -- for example `{hi.id} = int(input())`, `{hi.id} = len(data)`, or a function parameter.")))
                else:
                    out.append((CLARITY_PRIORITY, (
                        f"**Both ends are fixed:** `{_src(node.iter, 30)}` always makes the same number of passes, so it is O(1). "
                        f"Big-O only counts loops whose length grows with the input.")))
            elif o.kind == "input":
                out.append((CLARITY_PRIORITY, (
                    f"**Where n comes from:** the bound is typed in by the user{self._where(o)}, so it plays the role of the input -- "
                    f"typing a number twice as big makes twice as many passes: O(n). Here n is the *value* entered, not how many digits it has.")))
            elif o.kind == "size" and (isinstance(hi, ast.Name) or not self._enclosing_loops(node)):
                alias = isinstance(hi, ast.Name)
                coll = o.root or "the data"
                if alias:
                    out.append((CLARITY_PRIORITY, (
                        f"**A new name is still the same n:** `{hi.id}` is just `len({coll})`{self._where(o)}. Renaming the size doesn't change "
                        f"the growth -- this is the same O(n) as `for x in {coll}`.")))
                else:
                    out.append((CLARITY_PRIORITY, (
                        f"**Two styles, same growth:** `range(len({coll}))` and `for x in {coll}` both visit every item once, so both are O(n). "
                        f"Big-O compares how the work grows, not how the loop is written.")))
            elif o.kind == "param" and isinstance(hi, ast.Name) and self._first_bound_use(node, hi.id):
                out.append((CLARITY_PRIORITY, (
                    f"**A number you pass in is the size:** `{hi.id}` is a parameter, so O(n) means the passes grow with the *value* you give it "
                    f"(`{hi.id}` = 1,000,000 means a million passes) -- not with its digits. Calling it with a fixed number like 10 gives one fast run, "
                    f"but Big-O describes the function for any `{hi.id}`.")))
            elif o.kind == "derived":
                base = o.base.text if o.base is not None else "n"
                op = hi.op if isinstance(hi, ast.BinOp) else None
                if isinstance(op, (ast.Add, ast.Sub)):
                    how = "a few more or fewer passes than"
                elif isinstance(op, ast.Mult):
                    how = "a constant multiple of the passes of"
                else:
                    how = "a fraction of the passes of"
                out.append((CLARITY_PRIORITY, (
                    f"**Constants and offsets don't change the class:** `{hi_t}` makes {how} `{base}`, "
                    f"but it still grows in step with `{base}`, so the loop is O(n). Big-O drops the constant.")))

            # 2. a direct range: the gap decides, not the ends
            if lo is not None and not bound_fixed:
                gap_fixed = (isinstance(hi, ast.BinOp) and isinstance(hi.op, (ast.Add, ast.Sub))
                             and ast.dump(hi.left) == ast.dump(lo) and _is_int(hi.right))
                if gap_fixed:
                    out.append((CLARITY_PRIORITY, (
                        f"**A direct range counts the gap:** `{_src(node.iter, 30)}` always spans {hi.right.value} values, even though `{_src(lo, 12)}` itself can be large. "
                        f"Passes = (stop - start), so this window is O(1).")))
                elif lo_o.fixed and o.growing and o.kind != "derived" and not (lo_o.value == 0):
                    out.append((CLARITY_PRIORITY, (
                        f"**A start offset is dropped:** `{_src(node.iter, 30)}` makes about {hi_t} - {_src(lo, 12)} passes. "
                        f"Skipping a fixed number of items at the start is a constant, so the loop is still O(n).")))
                elif lo_o.growing and o.growing and ast.dump(lo) != ast.dump(hi):
                    out.append((CLARITY_PRIORITY, (
                        f"**A direct range counts the gap:** passes = stop - start = {hi_t} - " + (_src(lo, 14) if isinstance(lo, (ast.Name, ast.Constant)) else f"({_src(lo, 14)})") + ". "
                        f"If that gap stays fixed the loop is O(1); if it grows with n (as when start is 0 or a fixed offset) it is O(n).")))

            # 3. a step
            if step is not None and _is_int(step) and abs(step.value) > 1 and not bound_fixed:
                out.append((CLARITY_PRIORITY, (
                    f"**Skipping doesn't change the class:** stepping by {step.value} makes about n / {abs(step.value)} passes -- "
                    f"fewer, but the constant factor is dropped, so this is still O(n). Only a step that *multiplies* (i *= 2) turns it into O(log n).")))

            # 4. constant inner loop inside a growing loop
            if bound_fixed:
                outer = [l for l in self._enclosing_loops(node) if self._loop_grows(l)]
                if outer:
                    out.append((CLARITY_PRIORITY, (
                        f"**Not every nested loop is another factor of n:** this inner loop always runs a fixed number of times, so it multiplies the cost by a constant, "
                        f"not by n. Count the loops whose length grows with the input -- here that stays O(n), not O(n^2).")))
        else:
            it = node.iter
            if isinstance(it, ast.Name) and not self._enclosing_loops(node):
                out.append((CLARITY_PRIORITY, (
                    f"**Two styles, same growth:** `for x in {it.id}` and `for i in range(len({it.id}))` both visit every item once, so both are O(n). "
                    f"The style changes how you read the code, not how the work grows.")))
            elif isinstance(it, (ast.List, ast.Tuple, ast.Set)):
                out.append((CLARITY_PRIORITY, (
                    f"**A list written out in the code is a fixed size:** this loop visits {len(it.elts)} item(s) that are typed into the source, "
                    f"so it makes a fixed number of passes: O(1). Looping over a list that can grow is what makes a loop O(n).")))

        # 5. two different inputs
        out += self._two_inputs_note(node)
        # 6. loop that just adds 1..n
        if self._loop_grows(node):
            out += self._sum_loop_note(node)
        return out

    def _loop_grows(self, loop) -> bool:
        if isinstance(loop, (ast.For, ast.AsyncFor)):
            b = self._loop_bound_expr(loop)
            if b is not None:
                lo, hi, _ = b
                o = self.origin(hi, loop)
                lo_o = self.origin(lo, loop) if lo is not None else Origin("literal", "0", value=0)
                return not (o.fixed and lo_o.fixed)
            return not isinstance(loop.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant))
        return True

    def _enclosing_loops_use_target(self, node, name: str) -> bool:
        for lp in self._enclosing_loops(node):
            if isinstance(lp, (ast.For, ast.AsyncFor)):
                if any(isinstance(x, ast.Name) and x.id == name for x in ast.walk(lp.target)):
                    return True
        return False

    def _two_inputs_note(self, node) -> List[Note]:
        outers = [l for l in self._enclosing_loops(node) if isinstance(l, (ast.For, ast.AsyncFor))]
        if not outers or not self._loop_grows(node):
            return []
        mine = self._iter_root(node)
        if not mine:
            return []
        for lp in outers:
            theirs = self._iter_root(lp)
            if not theirs or theirs == mine:
                continue
            # the inner loop walks something taken from the outer loop (rows of a grid): same input
            if self._enclosing_loops_use_target(node, mine):
                continue
            if isinstance(node.iter, ast.Name) and any(isinstance(x, ast.Name) and x.id == node.iter.id for x in ast.walk(lp.target)):
                continue
            if self._derived_from_loopvar(node, lp):
                continue
            a_coll, b_coll = self._root_is_collection(lp), self._root_is_collection(node)
            A = f"len({theirs})" if a_coll else f"`{theirs}`"
            B = f"len({mine})" if b_coll else f"`{mine}`"
            A = A if a_coll else theirs
            B = B if b_coll else mine
            what = "walks" if (a_coll or b_coll) else "counts up to"
            return [(CLARITY_PRIORITY, (
                f"**Two different inputs:** the outer loop depends on `{theirs}` and this one on `{mine}`, so the work is about {A} x {B} passes -- "
                f"written O({A} * {B}) because the two can differ. The analyzer uses a single n for 'input size', so it writes O(n^2); "
                f"that is exact only when both are about the same size."))]
        return []

    def _derived_from_loopvar(self, node, outer) -> bool:
        tnames = {x.id for x in ast.walk(outer.target) if isinstance(x, ast.Name)}
        return any(isinstance(x, ast.Name) and x.id in tnames for x in ast.walk(node.iter))

    def _sum_loop_note(self, node) -> List[Note]:
        if not isinstance(node.target, ast.Name) or len(node.body) != 1:
            return []
        st = node.body[0]
        tgt = node.target.id
        acc = None
        if isinstance(st, ast.AugAssign) and isinstance(st.op, ast.Add) and isinstance(st.target, ast.Name) \
                and isinstance(st.value, ast.Name) and st.value.id == tgt:
            acc = st.target.id
        elif isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name) \
                and isinstance(st.value, ast.BinOp) and isinstance(st.value.op, ast.Add) \
                and isinstance(st.value.left, ast.Name) and st.value.left.id == st.targets[0].id \
                and isinstance(st.value.right, ast.Name) and st.value.right.id == tgt:
            acc = st.targets[0].id
        if acc is None or self._loop_bound_expr(node) is None:
            return []
        return [(CLARITY_PRIORITY + 0.1, (
            f"**Same output, different Big-O:** adding up `{tgt}` over a range gives the same answer as the formula n * (n - 1) / 2, which is O(1). "
            f"This loop reaches that answer in O(n) steps -- Big-O grades the *work done*, not the result, so two ways of getting the same output can have different notations."))]

    # -- while loops -----------------------------------------------------
    def _while_notes(self, node) -> List[Note]:
        out: List[Note] = []
        test = node.test
        # value vs digits: while n > 0: n //= 10
        if isinstance(test, ast.Compare) and isinstance(test.left, ast.Name):
            v = test.left.id
            for st in ast.walk(node):
                div = None
                if isinstance(st, ast.AugAssign) and isinstance(st.target, ast.Name) and st.target.id == v \
                        and isinstance(st.op, (ast.FloorDiv, ast.Div)) and _is_int(st.value):
                    div = st.value.value
                elif isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name) \
                        and st.targets[0].id == v and isinstance(st.value, ast.BinOp) \
                        and isinstance(st.value.op, (ast.FloorDiv, ast.Div)) and isinstance(st.value.left, ast.Name) \
                        and st.value.left.id == v and _is_int(st.value.right):
                    div = st.value.right.value
                if div and div >= 2:
                    kind = "digits" if div == 10 else "halvings"
                    if div == 10:
                        out.append((CLARITY_PRIORITY, (
                            f"**Value vs. digits:** `{v}` loses one digit per pass, so the loop runs once per digit of `{v}`. "
                            f"In terms of the *value* of `{v}` that is O(log n); in terms of how many digits `{v}` has it is linear. Both describe the same loop -- Big-O here uses the value.")))
                    else:
                        out.append((CLARITY_PRIORITY, (
                            f"**n is a value here:** dividing `{v}` by {div} each pass makes about log n passes, where n is the *value* of `{v}`. "
                            f"A number ten times bigger needs only about one more pass.")))
                    break
        # a fixed stop condition
        if isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.left, ast.Name):
            o = self.origin(test.comparators[0], node)
            if o.fixed and not out:
                v = test.left.id
                moved_by_const = False
                for st in ast.walk(node):
                    if isinstance(st, ast.AugAssign) and isinstance(st.target, ast.Name) and st.target.id == v \
                            and isinstance(st.op, (ast.Add, ast.Sub)) and _is_int(st.value):
                        moved_by_const = True
                if moved_by_const:
                    out.append((CLARITY_PRIORITY, (
                        f"**A fixed stop line:** the loop stops when `{v}` reaches `{_src(test.comparators[0], 16)}`, a fixed number, "
                        f"and `{v}` moves by a fixed amount, so it makes the same number of passes for every input: O(1).")))
        return out

    # -- assignments / returns -------------------------------------------
    def _assign_notes(self, node) -> List[Note]:
        out: List[Note] = []
        value = node.value
        if value is None:
            return out
        target = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            target = node.targets[0].id
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            target = node.target.id

        if target and self._used_as_bound(target, node):
            if _is_int(value):
                if not self._has_fixed_bound_use(target, node):
                    return out
                out.append((CLARITY_PRIORITY, (
                    f"**A name for a fixed number:** `{target} = {value.value}` doesn't make `{target}` the input size. It always holds {value.value}, "
                    f"so loops bounded by it make a fixed number of passes (O(1)). To make it the input, read it from the user (`int(input())`), take it as a parameter, or use `len(...)`.")))
            elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("int", "float") \
                    and value.args and isinstance(value.args[0], ast.Call) and isinstance(value.args[0].func, ast.Name) \
                    and value.args[0].func.id == "input":
                out.append((CLARITY_PRIORITY, (
                    f"**This is where n enters:** `{target}` gets its value from the user, so loops bounded by it are O(n) in the number typed. "
                    f"Different runs can type different values, so Big-O talks about all of them, not just the one you tried.")))
            elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "len" and value.args:
                coll = self._root_name(value.args[0])
                out.append((CLARITY_PRIORITY, (
                    f"**A size, saved under a name:** `{target}` holds len({coll}), the number of items. Loops bounded by `{target}` are O(n) in that count, "
                    f"exactly as if they used `len({coll})` directly.")))

        # closed-form formulas
        txt = _src(value, 80)
        if re.search(r"(\w+) \* \(\1 [+-] 1\)|\((\w+) [+-] 1\) \* \2", txt) and re.search(r"//\s*2|/\s*2", txt):
            out.append((CLARITY_PRIORITY, (
                f"**Same output, different Big-O:** this formula gives the same answer as adding 1 + 2 + ... + n in a loop, but it is a fixed handful of arithmetic steps: O(1). "
                f"The loop version is O(n). Big-O grades the work done, not the answer -- a shortcut with the same output earns a better notation.")))
        return out

    # ------------------------------------------------------------------
    # whole-program notes (used by the Overall narrative)
    # ------------------------------------------------------------------
    def program_notes(self, final_time: str = "") -> List[str]:
        tree = self._tree
        if tree is None:
            return []
        try:
            loops = [n for n in ast.walk(tree) if isinstance(n, (ast.For, ast.AsyncFor))]
            range_loops = [l for l in loops if self._loop_bound_expr(l) is not None]
            notes: List[str] = []

            fixed_loops, growing_loops = [], []
            for l in loops:
                (growing_loops if self._loop_grows(l) else fixed_loops).append(l)

            if loops and not growing_loops and re.fullmatch(r"\s*O\(1\)\s*", str(final_time or "")):
                shown = ", ".join(sorted({f"`{_src(l.iter, 22)}`" for l in fixed_loops}))
                notes.append(
                    f"**Loops, but still O(1):** every loop here ({shown}) runs a fixed number of times, so nothing grows with the input. "
                    f"Seeing a loop is not enough to call something O(n) -- what matters is whether the loop's length can grow. "
                    f"Make a bound come from `input()`, `len(...)` or a parameter and the same loop becomes O(n).")

            sources: Dict[str, str] = {}
            all_params = set()
            for f in ast.walk(tree):
                if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    all_params |= set(self._params(f))
            for l in loops:
                b = self._loop_bound_expr(l)
                if b is not None:
                    o = self.origin(b[1], l)
                    if o.kind == "input":
                        sources.setdefault("input", "the number typed in (its value, not its digits)")
                    elif o.kind == "size" and o.root in all_params:
                        sources.setdefault(o.root, f"the length of `{o.root}`")
                    elif o.kind == "param" and isinstance(b[1], ast.Name):
                        sources.setdefault(b[1].id, f"the value of `{b[1].id}` (the number itself, not its digits)")
                elif isinstance(l.iter, ast.Name) and l.iter.id in all_params and not self._enclosing_loops_use_target(l, l.iter.id):
                    sources.setdefault(l.iter.id, f"the length of `{l.iter.id}`")
            if len(sources) == 1:
                (name, what), = sources.items()
                notes.append(f"**What n means here:** n is {what}. Big-O describes how the work grows as that quantity grows.")
            elif len(sources) >= 2:
                items = "; ".join(f"`{k}`: {v}" for k, v in list(sources.items())[:3])
                notes.append(f"**More than one n:** this program has several size-like quantities ({items}). "
                             f"If two of them multiply, the honest answer is a product of the two sizes; the analyzer folds them into one n, "
                             f"so it reads as n^2 only when they are about the same size.")
            return notes[:2]
        except Exception:
            return []
