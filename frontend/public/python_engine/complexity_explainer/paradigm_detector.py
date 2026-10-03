"""
Paradigm Detector

Looks at the *structure* of the whole program and names the approach it
takes -- brute force, dynamic programming, divide and conquer, backtracking,
binary search, two pointers, BFS/DFS, greedy, simple sorting passes, a plain
scan -- and says WHY it thinks so, quoting the learner's own lines.

It never executes anything: pure `ast`. Every verdict carries the line
numbers that triggered it, so the text is built from the code in front of
the learner rather than from a canned label.

    detect(tree) -> List[Match]   (best first, at most 2)
    describe(matches) -> markdown block, or "" when nothing clear was found
"""
import ast
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

_LOOPS = (ast.For, ast.AsyncFor, ast.While)
_FUNCS = (ast.FunctionDef, ast.AsyncFunctionDef)


@dataclass
class Match:
    name: str
    meaning: str                      # one plain sentence: what this approach IS
    why: List[str] = field(default_factory=list)   # evidence, from the learner's code
    tip: str = ""                     # one plain sentence: the usual next step
    score: int = 0


def _src(n, limit: int = 40) -> str:
    try:
        t = " ".join(ast.unparse(n).split())
    except Exception:
        return "..."
    return t if len(t) <= limit else t[: limit - 3] + "..."


def _head(n, limit: int = 46) -> str:
    """First line of a compound statement, e.g. `for i in range(n):`."""
    try:
        t = ast.unparse(n).splitlines()[0].strip()
    except Exception:
        return "..."
    return t if len(t) <= limit else t[: limit - 3] + "..."


def _name(n) -> Optional[str]:
    if isinstance(n, ast.Name):
        return n.id
    if isinstance(n, ast.Attribute):
        return n.attr
    return None


def _is_int(n, v=None) -> bool:
    return isinstance(n, ast.Constant) and isinstance(n.value, int) and not isinstance(n.value, bool) and (v is None or n.value == v)


class _Facts:
    """Everything the rules below need, gathered in one walk."""

    def __init__(self, tree: ast.AST):
        self.tree = tree
        self.funcs: Dict[str, ast.AST] = {}
        for n in ast.walk(tree):
            if isinstance(n, _FUNCS):
                self.funcs[n.name] = n
        self.loops = [n for n in ast.walk(tree) if isinstance(n, _LOOPS)]
        self.max_depth = self._depth(tree, 0)
        self.calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call)]
        self.call_names = {_name(c.func) for c in self.calls if _name(c.func)}

        # recursion: function -> its direct self-calls
        self.self_calls: Dict[str, List[ast.Call]] = {}
        for fname, fn in self.funcs.items():
            cs = [c for c in ast.walk(fn) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == fname]
            if cs:
                self.self_calls[fname] = cs

        # caching
        self.has_cache_decorator = any(
            (_name(d) in ("lru_cache", "cache")) or (isinstance(d, ast.Call) and _name(d.func) in ("lru_cache", "cache"))
            for fn in self.funcs.values() for d in fn.decorator_list)
        self.memo_names = self._memo_names()

    def _depth(self, node, d) -> int:
        best = d
        for ch in ast.iter_child_nodes(node):
            best = max(best, self._depth(ch, d + 1 if isinstance(ch, _LOOPS) else d))
        return best

    def _memo_names(self) -> Set[str]:
        names = set()
        for n in ast.walk(self.tree):
            if isinstance(n, ast.Compare) and any(isinstance(o, (ast.In, ast.NotIn)) for o in n.ops):
                for c in n.comparators:
                    nm = _name(c)
                    if nm and nm.lower() in ("memo", "cache", "seen", "computed", "lookup", "saved", "dp"):
                        names.add(nm)
            if isinstance(n, ast.Assign):
                for t in n.targets:
                    if isinstance(t, ast.Subscript) and _name(t.value) and _name(t.value).lower() in ("memo", "cache", "lookup"):
                        names.add(_name(t.value))
        return names

    def methods_on_same(self, fn, adders, removers):
        """Container names that get `adders(...)` and `removers(...)` inside fn."""
        added, removed = {}, {}
        for c in ast.walk(fn):
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute):
                owner = _src(c.func.value)
                if c.func.attr in adders:
                    added.setdefault(owner, c)
                if c.func.attr in removers:
                    removed.setdefault(owner, c)
        return [(o, added[o], removed[o]) for o in added if o in removed]


def _line(n) -> str:
    return f"line {getattr(n, 'lineno', '?')}"


# =====================================================================
# individual rules -- each returns a Match or None
# =====================================================================
def _dp_table(f: _Facts) -> Optional[Match]:
    """A table (list / grid) whose slots are filled from OTHER slots of the same table."""
    for n in ast.walk(f.tree):
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Subscript):
            base = _src(n.targets[0].value)
            reads = [s for s in ast.walk(n.value) if isinstance(s, ast.Subscript) and _src(s.value) == base]
            if reads and any(isinstance(a, _LOOPS) for a in ast.walk(f.tree)):
                inside_loop = any(isinstance(p, _LOOPS) and n in list(ast.walk(p)) for p in f.loops)
                if inside_loop:
                    return Match(
                        "Dynamic programming (bottom-up table)",
                        "It solves small sub-problems first, writes their answers in a table, and builds bigger answers from the stored ones, so nothing is solved twice.",
                        [f"{_line(n)}: `{_src(n, 46)}` fills one slot of `{base}` from other slots of `{base}`."],
                        "To save memory, check whether you only need the last row or last few slots of the table.",
                        score=90)
    return None


def _dp_memo(f: _Facts) -> Optional[Match]:
    rec = {k: v for k, v in f.self_calls.items()}
    if not rec:
        return None
    if f.has_cache_decorator:
        fname = next(iter(rec))
        return Match(
            "Dynamic programming (top-down with a cache)",
            "It uses a recursive formula, but remembers every answer it has already found, so each sub-problem is solved only once.",
            [f"`{fname}` calls itself and a cache decorator (`lru_cache`/`cache`) saves its results."],
            "Each distinct input is computed once, so total work is about (number of distinct inputs) x (work per input).",
            score=92)
    if f.memo_names:
        nm = sorted(f.memo_names)[0]
        fname = next(iter(rec))
        return Match(
            "Dynamic programming (top-down with memoization)",
            "It uses a recursive formula, but looks answers up in a saved collection before recomputing them.",
            [f"`{fname}` calls itself and checks / fills `{nm}` so repeated sub-problems are skipped."],
            "Each distinct input is computed once, so total work is about (number of distinct inputs) x (work per input).",
            score=92)
    return None


def _backtracking(f: _Facts) -> Optional[Match]:
    for fname, calls in f.self_calls.items():
        fn = f.funcs[fname]
        pairs = f.methods_on_same(fn, {"append", "add"}, {"pop", "remove", "discard"})
        if pairs:
            owner, add, rem = pairs[0]
            return Match(
                "Backtracking",
                "It builds an answer one choice at a time, goes deeper with recursion, and then undoes the last choice to try the next option.",
                [f"{_line(add)}: adds to `{owner}` (make a choice), then {_line(rem)}: removes it again (undo the choice) around the recursive call in `{fname}`."],
                "If many branches can be ruled out early, stop them as soon as they cannot work (pruning).",
                score=88)
        # choose / un-choose through a state flag, e.g. used[i] = True ... used[i] = False
        flags = {}
        for a in ast.walk(fn):
            if isinstance(a, ast.Assign) and len(a.targets) == 1 and isinstance(a.targets[0], ast.Subscript) \
                    and isinstance(a.value, ast.Constant) and isinstance(a.value.value, bool):
                flags.setdefault(_src(a.targets[0].value), set()).add(a.value.value)
        for owner, vals in flags.items():
            if vals == {True, False}:
                return Match(
                    "Backtracking",
                    "It marks an option as used, recurses, then un-marks it so the next option can be tried.",
                    [f"`{fname}` sets entries of `{owner}` to True and back to False around its recursive calls."],
                    "Prune a branch early as soon as it cannot lead to a valid answer.",
                    score=86)
    return None


def _divide_conquer(f: _Facts) -> Optional[Match]:
    for fname, calls in f.self_calls.items():
        halves = 0
        for c in calls:
            txt = " ".join(_src(a, 60) for a in c.args)
            if any(k in txt for k in ("// 2", "/ 2", "mid", "half", ":len(", "[:", "[mid", ":mid")):
                halves += 1
        has_mid = any(isinstance(a, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ("mid", "middle", "m", "half") for t in a.targets)
                      for a in ast.walk(f.funcs[fname]))
        if len(calls) >= 2 and (halves >= 2 or has_mid) and not f.memo_names and not f.has_cache_decorator:
            return Match(
                "Divide and conquer",
                "It splits the problem into smaller pieces of the same kind, solves each piece by calling itself, then combines the results.",
                [f"`{fname}` calls itself {len(calls)} times ({', '.join('`' + _src(c, 26) + '`' for c in calls[:2])}), each time on a smaller part of the data."],
                "Count how many pieces it makes (a), how much smaller each one is (b) and the work to combine (f(n)): the Master Theorem then gives the total.",
                score=85)
    return None


def _binary_search(f: _Facts) -> Optional[Match]:
    for w in f.loops:
        if not isinstance(w, ast.While) or not isinstance(w.test, ast.Compare):
            continue
        body_src = "\n".join(_src(s, 80) for s in ast.walk(w) if isinstance(s, ast.Assign))
        if ("// 2" in body_src or ">> 1" in body_src) and ("mid" in body_src or "middle" in body_src):
            moves = [s for s in ast.walk(w) if isinstance(s, ast.Assign) and isinstance(s.targets[0], ast.Name)
                     and s.targets[0].id in ("lo", "hi", "low", "high", "left", "right", "l", "r")]
            if moves:
                return Match(
                    "Binary search (halving the search range)",
                    "It looks at the middle item and throws away the half that cannot contain the answer, so the range keeps halving.",
                    [f"{_line(w)}: `while {_src(w.test)}` keeps a shrinking range, and a middle position is computed inside it."],
                    "Halving each time means about log n steps, which is why this is so fast on sorted data.",
                    score=87)
    for fname, calls in f.self_calls.items():
        fn = f.funcs[fname]
        if len(calls) >= 1 and any(isinstance(a, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ("mid", "middle") for t in a.targets) for a in ast.walk(fn)) \
                and len(calls) <= 2 and not f.memo_names:
            # recursion that only follows ONE half
            branch_returns = [r for r in ast.walk(fn) if isinstance(r, ast.Return) and any(
                isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == fname for c in ast.walk(r))]
            if len(branch_returns) >= 2 and len(calls) == len(branch_returns):
                return Match(
                    "Binary search (recursive)",
                    "It checks the middle and recurses into only one half, so the problem halves every call.",
                    [f"`{fname}` computes a middle position and calls itself on just one side."],
                    "Halving each time means about log n calls.",
                    score=85)
    return None


def _two_pointers(f: _Facts) -> Optional[Match]:
    for w in f.loops:
        if isinstance(w, ast.While) and isinstance(w.test, ast.Compare) and len(w.test.ops) == 1 \
                and isinstance(w.test.ops[0], (ast.Lt, ast.LtE)):
            l, r = _name(w.test.left), _name(w.test.comparators[0])
            if not l or not r:
                continue
            ups = [s for s in ast.walk(w) if isinstance(s, ast.AugAssign) and _name(s.target) == l and isinstance(s.op, ast.Add)]
            downs = [s for s in ast.walk(w) if isinstance(s, ast.AugAssign) and _name(s.target) == r and isinstance(s.op, ast.Sub)]
            if ups and downs:
                return Match(
                    "Two pointers",
                    "It keeps two positions, one moving up and one moving down, and moves them toward each other until they meet.",
                    [f"{_line(w)}: `while {_src(w.test)}` with `{l}` moving forward and `{r}` moving backward."],
                    "Because each pointer only moves one way, the whole scan is one pass: O(n).",
                    score=80)
    return None


def _graph_traversal(f: _Facts) -> Optional[Match]:
    pops_left = [c for c in f.calls if isinstance(c.func, ast.Attribute) and c.func.attr == "popleft"]
    pop0 = [c for c in f.calls if isinstance(c.func, ast.Attribute) and c.func.attr == "pop" and c.args and _is_int(c.args[0], 0)]
    visited = any(isinstance(n, ast.Name) and n.id in ("visited", "seen") for n in ast.walk(f.tree))
    if (pops_left or pop0) and any(isinstance(l, ast.While) for l in f.loops) and visited:
        c = (pops_left or pop0)[0]
        return Match(
            "Breadth-first search (BFS)",
            "It explores a graph level by level using a queue, remembering which nodes it has already visited.",
            [f"{_line(c)}: takes the oldest item off the front of a queue, inside a `while` loop, with a visited set."],
            "Every node and edge is handled once, so the work grows like V + E.",
            score=84)
    stack_pop = [c for c in f.calls if isinstance(c.func, ast.Attribute) and c.func.attr == "pop" and not c.args]
    if stack_pop and any(isinstance(l, ast.While) for l in f.loops) and visited:
        return Match(
            "Depth-first search (using a stack)",
            "It explores a graph by going as deep as possible first, using a stack, and remembers visited nodes.",
            [f"{_line(stack_pop[0])}: takes the newest item off a stack inside a `while` loop, with a visited set."],
            "Every node and edge is handled once, so the work grows like V + E.",
            score=82)
    for fname, calls in f.self_calls.items():
        if visited and any(isinstance(a, ast.Name) and a.id in ("visited", "seen") for a in ast.walk(f.funcs[fname])):
            return Match(
                "Depth-first search (recursive)",
                "It explores a graph by recursing into each neighbour, using a visited set so no node is processed twice.",
                [f"`{fname}` calls itself on neighbours and checks / fills a visited set."],
                "Every node and edge is handled once, so the work grows like V + E.",
                score=82)
    return None


def _elementary_sort(f: _Facts) -> Optional[Match]:
    if f.max_depth < 2:
        return None
    for lp in f.loops:
        for a in ast.walk(lp):
            if isinstance(a, ast.Assign) and len(a.targets) == 1 and isinstance(a.targets[0], ast.Tuple) \
                    and isinstance(a.value, ast.Tuple) and len(a.value.elts) == 2 \
                    and all(isinstance(t, ast.Subscript) for t in a.targets[0].elts):
                return Match(
                    "Simple comparison sort (compare and swap in nested loops)",
                    "It sorts by repeatedly comparing items and swapping the ones that are out of order, using a loop inside a loop.",
                    [f"{_line(a)}: `{_src(a, 46)}` swaps two items inside nested loops."],
                    "Two nested passes over n items cost O(n^2); merge sort or quick sort get this to O(n log n).",
                    score=78)
    # insertion sort: shift items right inside a while
    for lp in f.loops:
        if isinstance(lp, ast.While):
            shifts = [a for a in ast.walk(lp) if isinstance(a, ast.Assign) and len(a.targets) == 1 and isinstance(a.targets[0], ast.Subscript)
                      and isinstance(a.value, ast.Subscript)]
            if shifts and f.max_depth >= 2:
                return Match(
                    "Simple comparison sort (insertion style: shift items to make room)",
                    "It takes one item at a time and slides bigger items over until the right spot is free.",
                    [f"{_line(shifts[0])}: `{_src(shifts[0], 46)}` shifts an item along inside a `while` that sits in another loop."],
                    "Two nested passes over n items cost O(n^2) in the worst case.",
                    score=70)
    return None


def _brute_force(f: _Facts) -> Optional[Match]:
    # (a) library generators of every combination
    for c in f.calls:
        nm = _name(c.func)
        if nm in ("permutations", "combinations", "product", "combinations_with_replacement"):
            return Match(
                "Brute force (tries every possibility)",
                "It generates every possible arrangement or combination and checks each one, with no shortcuts.",
                [f"{_line(c)}: `{_src(c, 46)}` produces all {nm.replace('_', ' ')} to test one by one."],
                "Look for a rule that rules out whole groups at once (greedy, sorting, a hash set, or dynamic programming).",
                score=75)

    # (b) naive recursion that branches 2+ ways, no cache, not halving
    for fname, calls in f.self_calls.items():
        if len(calls) >= 2 and not f.memo_names and not f.has_cache_decorator:
            halves = any(k in " ".join(_src(a, 60) for c in calls for a in c.args) for k in ("// 2", "mid", "/ 2"))
            if not halves:
                return Match(
                    "Brute force by naive recursion (tries every branch)",
                    "It splits into several recursive calls that do not share their answers, so the same sub-problems are solved again and again.",
                    [f"`{fname}` makes {len(calls)} recursive calls ({', '.join('`' + _src(c, 22) + '`' for c in calls[:2])}) and never saves results."],
                    "Saving each answer (memoization) would turn this into dynamic programming and cut the work dramatically.",
                    score=80)

    # (c) nested loops that look at every pair / triple of positions
    if f.max_depth >= 2:
        for outer in f.loops:
            inner = [n for n in ast.walk(outer) if isinstance(n, _LOOPS) and n is not outer]
            if not inner:
                continue
            ev = None
            for a in ast.walk(outer):
                if isinstance(a, ast.If) and isinstance(a.test, (ast.Compare, ast.BoolOp)):
                    ev = a
                    break
            if ev is not None:
                kind = "every pair" if f.max_depth == 2 else f"every group of {f.max_depth} items"
                return Match(
                    "Brute force (checks every combination)",
                    f"It tries {kind} of positions with nested loops and tests each one, instead of using a shortcut to skip the ones that cannot work.",
                    [f"{_line(outer)}: `{_head(outer)}` contains another loop, and {_line(ev)}: `if {_src(ev.test, 36)}` tests every combination."],
                    "Ask whether a dictionary / set lookup, sorting, or two pointers could replace the inner loop.",
                    score=72)
    return None


def _greedy(f: _Facts) -> Optional[Match]:
    sorted_call = [c for c in f.calls if _name(c.func) in ("sorted", "sort")]
    heap = [c for c in f.calls if _name(c.func) in ("heappop", "heappush")]
    if (sorted_call or heap) and f.max_depth <= 1 and not f.self_calls:
        if sorted_call:
            c = sorted_call[0]
            ev = f"{_line(c)}: `{_src(c, 40)}` orders the items, then one pass picks the best available choice each step."
        else:
            c = heap[0]
            ev = f"{_line(c)}: `{_src(c, 40)}` always hands over the best remaining item, which is then taken."
        return Match(
            "Greedy",
            "It makes the best-looking choice at each step and never goes back to change it.",
            [ev],
            "Greedy only works if a locally best choice is always safe, so it is worth checking with a small counter-example.",
            score=60)
    return None


def _scan(f: _Facts) -> Optional[Match]:
    if f.self_calls:
        for fname, calls in f.self_calls.items():
            if len(calls) == 1:
                return Match(
                    "Simple recursion (one smaller call each time)",
                    "It solves the problem by solving one slightly smaller version of itself, until a stopping case is reached.",
                    [f"`{fname}` calls itself once (`{_src(calls[0], 30)}`)."],
                    "Each call keeps its place on the call stack, so very deep recursion uses memory too.",
                    score=50)
        return None
    if f.max_depth == 1:
        lp = f.loops[0]
        return Match(
            "Single pass (linear scan)",
            "It goes through the data once, looking at each item a fixed number of times.",
            [f"{_line(lp)}: `{_head(lp)}` is the only loop, with no loop inside it."],
            "One pass is O(n), which is usually the best you can do when every item must be looked at.",
            score=40)
    if f.max_depth == 0 and not f.self_calls and f.funcs:
        return Match(
            "Direct calculation (no loops, no recursion)",
            "It works the answer out with a fixed number of steps, no matter how big the input is.",
            ["There is no loop and no recursion in the code."],
            "",
            score=30)
    return None


_RULES = (_dp_memo, _dp_table, _backtracking, _divide_conquer, _binary_search, _graph_traversal,
          _two_pointers, _elementary_sort, _brute_force, _greedy, _scan)


def detect(tree: Optional[ast.AST]) -> List[Match]:
    if tree is None:
        return []
    try:
        f = _Facts(tree)
    except Exception:
        return []
    found: List[Match] = []
    for rule in _RULES:
        try:
            m = rule(f)
        except Exception:
            m = None
        if m is not None:
            found.append(m)
    found.sort(key=lambda m: -m.score)
    # a table fill and a memo are both DP: keep one
    out: List[Match] = []
    for m in found:
        if any(m.name.split(" (")[0] == o.name.split(" (")[0] for o in out):
            continue
        out.append(m)
    # brute force next to a more specific pattern is noise
    if out and out[0].score >= 70:
        out = [m for m in out if not m.name.startswith("Brute force") or m is out[0]]
    # generic "also" labels (a plain scan / simple recursion) add nothing next to a named approach
    generic = ("Single pass", "Simple recursion", "Direct calculation")
    if out and not out[0].name.startswith(generic):
        out = [out[0]] + [m for m in out[1:] if not m.name.startswith(generic) and m.score >= 60]
    return out[:2]


def describe(matches: List[Match]) -> str:
    if not matches:
        return ""
    top = matches[0]
    lines = [f"**Approach: {top.name}.** {top.meaning}"]
    for w in top.why:
        lines.append(f"*What points to this:* {w}")
    if top.tip:
        lines.append(f"*Good to know:* {top.tip}")
    if len(matches) > 1:
        sec = matches[1]
        lines.append(f"*It also shows traits of:* {sec.name.lower()} -- {sec.why[0] if sec.why else sec.meaning}")
    return "\n\n".join(lines)
