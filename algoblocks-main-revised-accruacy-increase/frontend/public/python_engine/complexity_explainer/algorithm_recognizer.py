"""
Algorithm Recognizer

Names the *specific, textbook algorithm* a program implements (bubble sort, merge sort, Dijkstra,
Floyd-Warshall, matrix multiplication, ...) from its AST structure, and files it under the right
design paradigm (brute force, divide and conquer, greedy, dynamic programming, backtracking, graph
traversal).  Rules are structural -- they look at what the code DOES (compare adjacent items then
swap them), never at what variables are called -- so a renamed bubble sort is still a bubble sort.

Every verdict quotes the learner's own lines and states the theory the way an algorithms course
states it: worst / best case, Theta vs O, the summation or recurrence behind the result, and the
space accounting convention.

Plugged into paradigm_detector._RULES (specific algorithms outrank the generic paradigm rules).
"""
import ast
from typing import List, Optional, Tuple

from complexity_explainer.paradigm_detector import Match, _src, _name, _line, _LOOPS, _FUNCS, _is_int

SPECIFIC = 96   # a named algorithm outranks every generic paradigm rule (generic rules score <= 92)


# --------------------------------------------------------------------- small AST helpers
def _lin(e) -> Optional[Tuple[str, int]]:
    """`j` -> ('j', 0); `j + 1` -> ('j', 1); `j - 2` -> ('j', -2); anything else -> None."""
    if isinstance(e, ast.Name):
        return (e.id, 0)
    if isinstance(e, ast.BinOp) and isinstance(e.left, ast.Name) and isinstance(e.right, ast.Constant) \
            and isinstance(e.right.value, int):
        if isinstance(e.op, ast.Add):
            return (e.left.id, e.right.value)
        if isinstance(e.op, ast.Sub):
            return (e.left.id, -e.right.value)
    return None


def _sub(e):
    return e if isinstance(e, ast.Subscript) else None


def _adjacent(a, b) -> bool:
    """Two subscripts of the same container at neighbouring positions (x[j], x[j + 1])."""
    if not (_sub(a) and _sub(b)) or _src(a.value) != _src(b.value):
        return False
    la, lb = _lin(a.slice), _lin(b.slice)
    return bool(la and lb and la[0] == lb[0] and abs(la[1] - lb[1]) == 1)


def _swaps(root):
    """Every swap of two container slots under root: tuple swap or the three-line temp swap.
    Returns [(stmt, srcA, srcB)]."""
    out = []
    for node in ast.walk(root):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) \
                and isinstance(node.value, ast.Tuple) and len(node.targets[0].elts) == 2 and len(node.value.elts) == 2:
            t0, t1 = node.targets[0].elts
            v0, v1 = node.value.elts
            if _sub(t0) and _sub(t1) and _src(t0) == _src(v1) and _src(t1) == _src(v0):
                out.append((node, _src(t0), _src(t1)))
        for fld in ("body", "orelse", "finalbody"):
            seq = getattr(node, fld, None)
            if not isinstance(seq, list):
                continue
            for k in range(len(seq) - 2):
                s1, s2, s3 = seq[k:k + 3]
                if all(isinstance(s, ast.Assign) and len(s.targets) == 1 for s in (s1, s2, s3)) \
                        and isinstance(s1.targets[0], ast.Name) and _sub(s1.value) \
                        and _sub(s2.targets[0]) and _src(s2.targets[0]) == _src(s1.value) and _sub(s2.value) \
                        and _sub(s3.targets[0]) and _src(s3.targets[0]) == _src(s2.value) \
                        and isinstance(s3.value, ast.Name) and s3.value.id == s1.targets[0].id:
                    out.append((s1, _src(s2.targets[0]), _src(s3.targets[0])))
    return out


def _inner_loops(outer):
    return [n for n in ast.walk(outer) if isinstance(n, _LOOPS) and n is not outer]


def _loop_var(lp) -> Optional[str]:
    return lp.target.id if isinstance(lp, ast.For) and isinstance(lp.target, ast.Name) else None


def _depth(node, d=0) -> int:
    best = d
    for ch in ast.iter_child_nodes(node):
        best = max(best, _depth(ch, d + 1 if isinstance(ch, _LOOPS) else d))
    return best


def _self_calls(fn):
    return [c for c in ast.walk(fn) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == fn.name]


def _funcs(tree):
    return [n for n in ast.walk(tree) if isinstance(n, _FUNCS)]


def _m(name, meaning, why, tip, lines=None, score=SPECIFIC):
    return Match(name, meaning, why, tip, score=score, lines=lines or [])


# --------------------------------------------------------------------- sorting algorithms
def _bubble(tree) -> Optional[Match]:
    for outer in [n for n in ast.walk(tree) if isinstance(n, _LOOPS)]:
        for inner in _inner_loops(outer):
            for iff in [n for n in ast.walk(inner) if isinstance(n, ast.If) and isinstance(n.test, ast.Compare)]:
                t = iff.test
                if len(t.comparators) != 1 or not _adjacent(t.left, t.comparators[0]):
                    continue
                pair = {_src(t.left), _src(t.comparators[0])}
                sw = [s for s in _swaps(iff) if {s[1], s[2]} == pair]
                if not sw:
                    continue
                flag = any(isinstance(n, ast.Break) for n in ast.walk(outer)) and \
                    any(isinstance(n, ast.If) for n in outer.body)
                early = (" It also stops early when a full pass makes no swap, so an already-sorted input finishes in one pass "
                         "(best case \u03a9(n)); the worst case is unchanged.") if flag else \
                        " Without an early-exit flag it always makes every pass, even on sorted input."
                return _m(
                    "Bubble sort (exchange sort, brute-force family)",
                    "It sorts by repeatedly comparing each pair of neighbouring items and swapping them when they are out of order, "
                    "so the largest remaining item 'bubbles' to the end on every pass.",
                    [f"{_line(iff)}: `if {_src(t, 40)}` compares neighbours, and {_line(sw[0][0])} swaps them -- inside the loop at "
                     f"{_line(inner)}, which sits inside the loop at {_line(outer)}."],
                    "Basic operation = the comparison. Pass i makes n-i-1 comparisons, so the total is (n-1)+(n-2)+...+1 = n(n-1)/2 "
                    "= \u0398(n\u00b2) in the worst case." + early +
                    " It is in-place (O(1) auxiliary space) and stable; merge sort or quick sort reach O(n log n).",
                    lines=[outer.lineno, inner.lineno, iff.lineno])
    return None


def _selection(tree) -> Optional[Match]:
    for outer in [n for n in ast.walk(tree) if isinstance(n, ast.For)]:
        ov = _loop_var(outer)
        for inner in _inner_loops(outer):
            for iff in [n for n in ast.walk(inner) if isinstance(n, ast.If) and isinstance(n.test, ast.Compare)]:
                tracked = [s.targets[0].id for s in iff.body
                           if isinstance(s, ast.Assign) and isinstance(s.targets[0], ast.Name)]
                if not tracked or not _sub(iff.test.left) and not _sub(iff.test.comparators[0]):
                    continue
                txt = _src(iff.test, 60)
                mn = next((t for t in tracked if t in txt), None)
                if not mn:
                    continue
                sw = [s for s in _swaps(outer) if mn in s[1] + s[2] and ov and ov in s[1] + s[2]]
                if sw:
                    return _m(
                        "Selection sort (brute-force family)",
                        "It repeatedly scans the unsorted part to find the smallest item, then swaps it into its final position.",
                        [f"{_line(iff)}: `{_src(iff.test, 40)}` tracks the position of the minimum in `{mn}`, and "
                         f"{_line(sw[0][0])} swaps it into place after the inner scan."],
                        "The scan for the minimum is always a full pass, so comparisons = n(n-1)/2 = \u0398(n\u00b2) in the best, average and "
                        "worst case alike -- unlike bubble or insertion sort it never gets faster on sorted input. It makes only O(n) "
                        "swaps, uses O(1) auxiliary space and is not stable.",
                        lines=[outer.lineno, inner.lineno, iff.lineno])
    return None


def _insertion(tree) -> Optional[Match]:
    for w in [n for n in ast.walk(tree) if isinstance(n, ast.While)]:
        shift = None
        for a in ast.walk(w):
            if isinstance(a, ast.Assign) and len(a.targets) == 1 and _sub(a.targets[0]) and _sub(a.value) \
                    and _src(a.targets[0].value) == _src(a.value.value):
                lt, lv = _lin(a.targets[0].slice), _lin(a.value.slice)
                if lt and lv and lt[0] == lv[0] and lt[1] - lv[1] == 1:
                    shift = a
        dec = any(isinstance(a, ast.AugAssign) and isinstance(a.op, ast.Sub) for a in ast.walk(w))
        if shift is not None and dec and isinstance(w.test, (ast.Compare, ast.BoolOp)):
            return _m(
                "Insertion sort (incremental, brute-force family)",
                "It takes the next item and slides the bigger items in the sorted part one place right until the item's spot is free.",
                [f"{_line(shift)}: `{_src(shift, 40)}` shifts an item one slot right inside the `while` at {_line(w)}."],
                "Worst case (reverse order): item i shifts i places, 1+2+...+(n-1) = n(n-1)/2 = \u0398(n\u00b2). Best case (already sorted): "
                "the `while` test fails at once, so only n-1 comparisons = \u03a9(n). In-place, stable, and excellent on nearly-sorted data.",
                lines=[w.lineno, shift.lineno])
    return None


def _merge_sort(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        if len(calls) < 2:
            continue
        merge = any(isinstance(n, ast.While) and any(isinstance(c, ast.Compare) and _sub(c.left) and
                                                       _sub(c.comparators[0] if c.comparators else None)
                                                       for c in ast.walk(n)) for n in ast.walk(fn)) \
            or any(isinstance(c, ast.Call) and _name(c.func) in ("merge", "_merge") for c in ast.walk(fn)) \
            or any(isinstance(n, ast.FunctionDef) and n.name in ("merge", "_merge") for n in ast.walk(tree))
        halves = any(k in " ".join(_src(a, 60) for c in calls for a in c.args) for k in ("mid", "// 2", ":len(", "[:", "half"))
        if merge and halves:
            return _m(
                "Merge sort (divide and conquer)",
                "It splits the list in half, sorts each half by calling itself, then merges the two sorted halves into one sorted list.",
                [f"`{fn.name}` calls itself {len(calls)} times on halves of its input, and a merge step ({_line(fn)}) combines the results."],
                "Recurrence: T(n) = 2T(n/2) + \u0398(n) -- a = 2, b = 2, f(n) = n = n^(log_b a), so case 2 of the Master Theorem gives \u0398(n log n) in "
                "every case. The merge needs O(n) extra space, plus O(log n) for the call stack.",
                lines=[fn.lineno] + [c.lineno for c in calls])
    return None


def _quick_sort(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        txt = ast.dump(fn)
        has_pivot = "pivot" in txt.lower() or any(isinstance(c, ast.Call) and _name(c.func) in ("partition", "_partition") for c in ast.walk(fn)) \
            or any(isinstance(n, ast.FunctionDef) and n.name in ("partition", "_partition") for n in ast.walk(tree))
        if len(calls) >= 2 and has_pivot:
            return _m(
                "Quick sort (divide and conquer, partition-based)",
                "It picks a pivot, moves smaller items to one side and larger items to the other, then sorts each side by calling itself.",
                [f"`{fn.name}` partitions around a pivot and calls itself {len(calls)} times on the two sides ({_line(calls[0])})."],
                "Balanced splits give T(n) = 2T(n/2) + \u0398(n) = \u0398(n log n) (average case). A consistently bad pivot gives "
                "T(n) = T(n-1) + \u0398(n) = \u0398(n\u00b2) (worst case, e.g. already-sorted input with a first-element pivot). "
                "Recursion depth is O(log n) on average and O(n) in the worst case.",
                lines=[fn.lineno] + [c.lineno for c in calls])
    return None


def _heap_sort(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        txt = _src(fn, 4000)
        kids = ("2 * i + 1" in txt or "2*i+1" in txt or "2 * i + 2" in txt or "2*i+2" in txt or "2 * root + 1" in txt)
        if kids and _swaps(fn) and (_self_calls(fn) or any(isinstance(n, ast.While) for n in ast.walk(fn))):
            return _m(
                "Heap sift-down (heap sort / heapify)",
                "It treats the list as a binary heap (children of i sit at 2i+1 and 2i+2) and repeatedly swaps an item down until the heap rule holds.",
                [f"`{fn.name}` computes the children of a node and swaps the node with the larger child ({_line(_swaps(fn)[0][0])})."],
                "One sift-down walks one root-to-leaf path: O(log n). Building the heap costs \u0398(n) and n extractions cost \u0398(n log n), so heap sort "
                "is \u0398(n log n) in every case with O(1) auxiliary space.",
                lines=[fn.lineno])
    return None


def _counting_sort(tree) -> Optional[Match]:
    for a in ast.walk(tree):
        if isinstance(a, ast.AugAssign) and isinstance(a.op, ast.Add) and _sub(a.target) and isinstance(a.value, ast.Constant) \
                and a.value.value == 1 and "count" in _src(a.target.value).lower():
            base = _src(a.target.value)
            # the second phase writes the values back IN ORDER: `arr[k] = v`, `out.append(v)`, or `[v] * count[v]`.
            # Merely tallying frequencies (most-frequent character, first unique character) is not a sort.
            writes_back = any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and isinstance(n.left, ast.List)
                              and any(isinstance(x, ast.Subscript) and _src(x.value) == base for x in ast.walk(n.right))
                              for n in ast.walk(tree)) or any(
                isinstance(lp, _LOOPS) and any(isinstance(x, ast.Subscript) and _src(x.value) == base for x in ast.walk(lp.iter if isinstance(lp, ast.For) else lp.test))
                and any((isinstance(x, ast.Assign) and any(isinstance(t, ast.Subscript) for t in x.targets) and a is not x) or
                        (isinstance(x, ast.Call) and isinstance(x.func, ast.Attribute) and x.func.attr in ("append", "extend"))
                        for x in ast.walk(lp)) for lp in ast.walk(tree))
            if writes_back and (any(isinstance(n, ast.Call) and _name(n.func) == "max" for n in ast.walk(tree)) or
                                any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and isinstance(n.left, ast.List) for n in ast.walk(tree))):
                return _m(
                    "Counting sort (non-comparison sort)",
                    "It counts how many times each value occurs in a table indexed by the value, then writes the values back in order.",
                    [f"{_line(a)}: `{_src(a, 40)}` tallies occurrences in a table indexed by the value itself."],
                    "Time \u0398(n + k) and space \u0398(k), where k is the range of values. It beats the \u03a9(n log n) bound of comparison sorts "
                    "because it never compares two items -- but only pays off when k is not much larger than n.",
                    lines=[a.lineno])
    return None


# --------------------------------------------------------------------- searching / number theory
def _linear_search(tree) -> Optional[Match]:
    # a linear search is the ONLY loop work: nowhere nested, no recursion
    if _depth(tree) > 1 or any(_self_calls(f) for f in _funcs(tree)):
        return None
    for lp in [n for n in ast.walk(tree) if isinstance(n, ast.For)]:
        if _depth(lp) > 1 and any(isinstance(n, _LOOPS) for n in ast.walk(lp) if n is not lp):
            continue
        for iff in [n for n in lp.body if isinstance(n, ast.If) and isinstance(n.test, ast.Compare)
                    and any(isinstance(o, ast.Eq) for o in n.test.ops)
                    and not any(isinstance(c, ast.Call) for c in ast.walk(n.test))]:
            lv = {n.id for n in ast.walk(lp.target) if isinstance(n, ast.Name)}
            def _item(e):   # the loop variable itself, or the item it indexes: `x` / `a[i]` -- not `n % i`
                return (isinstance(e, ast.Name) and e.id in lv) or (isinstance(e, ast.Subscript) and isinstance(e.slice, ast.Name) and e.slice.id in lv)
            if not (_item(iff.test.left) or any(_item(c) for c in iff.test.comparators)):
                continue
            if any(isinstance(r, ast.Return) for r in ast.walk(iff)) and not any(
                    isinstance(c, ast.Call) and _name(c.func) in ("sum", "min", "max", "sorted", "len", "count", "index")
                    for c in ast.walk(lp) if c is not iff.test):
                return _m(
                    "Linear search (sequential scan, brute-force family)",
                    "It checks the items one by one until it finds the target or runs out of items.",
                    [f"{_line(iff)}: `if {_src(iff.test, 36)}` is tested for each item of the loop at {_line(lp)}, and returns on the first match."],
                    "Basic operation = the comparison. Best case: target is first, \u0398(1). Worst case: absent or last, n comparisons = \u0398(n). "
                    "Average over a uniformly placed target: about (n+1)/2 comparisons, still \u0398(n). Sorted data allows binary search, O(log n).",
                    lines=[lp.lineno, iff.lineno])
    return None


def _gcd(tree) -> Optional[Match]:
    for w in [n for n in ast.walk(tree) if isinstance(n, ast.While)]:
        for a in ast.walk(w):
            if isinstance(a, ast.Assign) and isinstance(a.targets[0], ast.Tuple) and isinstance(a.value, ast.Tuple) \
                    and any(isinstance(e, ast.BinOp) and isinstance(e.op, ast.Mod) for e in a.value.elts):
                return _m(
                    "Euclid's algorithm (greatest common divisor)",
                    "It replaces the pair (a, b) by (b, a mod b) until the remainder is zero; the last non-zero value is the gcd.",
                    [f"{_line(a)}: `{_src(a, 40)}` replaces the pair with (b, a mod b) on every pass of the `while` at {_line(w)}."],
                    "Every two passes the larger value at least halves (Lam\u00e9's theorem: the worst case is consecutive Fibonacci numbers), "
                    "so the loop runs O(log(min(a, b))) times -- logarithmic in the VALUE of the input, i.e. linear in the number of its digits.",
                    lines=[w.lineno, a.lineno])
    return None


def _sieve(tree) -> Optional[Match]:
    for lp in [n for n in ast.walk(tree) if isinstance(n, ast.For)]:
        for inner in [n for n in _inner_loops(lp) if isinstance(n, ast.For)]:
            it = inner.iter
            if isinstance(it, ast.Call) and _name(it.func) == "range" and len(it.args) == 3:
                st = it.args[0]
                if isinstance(st, ast.BinOp) and isinstance(st.op, ast.Mult) or (isinstance(st, ast.BinOp) and isinstance(st.op, ast.Pow)):
                    return _m(
                        "Sieve of Eratosthenes (marking multiples)",
                        "It crosses out the multiples of each prime, starting at p\u00b2, and whatever stays unmarked is prime.",
                        [f"{_line(inner)}: `{_head_src(inner)}` strides through the multiples of the outer value."],
                        "The inner loop runs n/p times for each prime p, and the sum of n/p over primes p \u2264 n is n \u00b7 ln ln n, "
                        "so the total is \u0398(n log log n) -- almost linear. Space is \u0398(n) for the marks.",
                        lines=[lp.lineno, inner.lineno])
    return None


def _head_src(lp) -> str:
    return _src(lp, 44).split("\n")[0]


# --------------------------------------------------------------------- recursion patterns
def _fib_like(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        if len(calls) == 2:
            lins = [_lin(c.args[0]) for c in calls if c.args]
            if all(lins) and sorted(l[1] for l in lins) == [-2, -1] and not any(
                    isinstance(d, (ast.Name, ast.Call)) and _name(d if isinstance(d, ast.Name) else d.func) in ("lru_cache", "cache")
                    for d in fn.decorator_list):
                memo = any("memo" in _src(a, 30).lower() or "cache" in _src(a, 30).lower() or "dp" == _src(a, 4).lower()
                           for a in ast.walk(fn) if isinstance(a, ast.Name))
                if memo:
                    continue
                return _m(
                    "Naive overlapping recursion (Fibonacci-style, brute force)",
                    "Each call spawns two calls on n-1 and n-2, which recompute the same sub-problems again and again.",
                    [f"`{fn.name}` calls `{_src(calls[0], 24)}` and `{_src(calls[1], 24)}` and saves no results."],
                    "Recurrence: T(n) = T(n-1) + T(n-2) + O(1). Its solution is \u0398(\u03c6\u207f) with \u03c6 = (1+\u221a5)/2 \u2248 1.618 -- exponential, and O(2\u207f) as a "
                    "simple upper bound. Only n distinct sub-problems exist, so memoization (or a bottom-up loop) brings the time to \u0398(n).",
                    lines=[fn.lineno] + [c.lineno for c in calls])
    return None


def _hanoi(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        if len(calls) == 2 and all(c.args and _lin(c.args[0]) == (_src(c.args[0]).split()[0], -1) for c in calls) \
                and any(isinstance(n, ast.Call) and _name(n.func) == "print" for n in ast.walk(fn)):
            if len(fn.args.args) >= 3:
                return _m(
                    "Tower of Hanoi (recursion by problem reduction)",
                    "To move n disks it moves n-1 disks aside, moves the biggest disk, then moves the n-1 disks back on top.",
                    [f"`{fn.name}` makes two recursive calls on n-1 disks with one move between them."],
                    "Recurrence: T(n) = 2T(n-1) + 1, which solves to 2\u207f - 1 moves = \u0398(2\u207f). The move count is the minimum possible, so the exponential cost is "
                    "inherent in the problem, not a flaw of the code. Stack depth is only O(n).",
                    lines=[fn.lineno])
    return None


def _permutations(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        if not calls:
            continue
        if any(isinstance(c, ast.Compare) and any(isinstance(o, (ast.In, ast.NotIn)) for o in c.ops) for c in ast.walk(fn)):
            continue   # a membership guard prunes / de-duplicates: not a plain enumeration of n! orderings
        flags = {}
        for a in ast.walk(fn):
            if isinstance(a, ast.Assign) and len(a.targets) == 1 and _sub(a.targets[0]) and isinstance(a.value, ast.Constant) \
                    and isinstance(a.value.value, bool):
                flags.setdefault(_src(a.targets[0].value), set()).add(a.value.value)
        used = [k for k, v in flags.items() if v == {True, False}]
        if used and any(isinstance(n, _LOOPS) for n in ast.walk(fn)):
            return _m(
                "Permutation generation by backtracking (choose, explore, un-choose)",
                "For each position it tries every unused item: mark it used, recurse to fill the next position, then un-mark it so the next item can be tried.",
                [f"`{fn.name}` marks `{used[0]}[i]` True before the recursive call and False after it, inside the loop at {_line(next(n for n in ast.walk(fn) if isinstance(n, _LOOPS)))}."],
                "The decision tree has n choices at level 1, n-1 at level 2, ...: n! leaves and \u0398(n \u00b7 n!) total work if each finished permutation is copied. "
                "It needs \u03a9(n!) time because that many answers must be produced; the call stack and the `used` array need only O(n) auxiliary space.",
                lines=[fn.lineno])
        for lp in [n for n in ast.walk(fn) if isinstance(n, _LOOPS)]:
            inside = [c for c in calls if any(c is x for x in ast.walk(lp))]
            if not inside:
                continue
            slices = [a for a in ast.walk(lp) if isinstance(a, ast.BinOp) and isinstance(a.op, ast.Add)
                      and isinstance(a.left, ast.Subscript) and isinstance(a.right, ast.Subscript)]
            removes = [c for c in ast.walk(lp) if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr in ("remove", "pop")]
            if slices or removes:
                return _m(
                    "Permutation generation (exhaustive search over orderings, brute force)",
                    "For every item it removes that item, recursively arranges the rest, and combines the answers, so every ordering is produced.",
                    [f"{_line(lp)}: the loop in `{fn.name}` removes one item (`{_src((slices or removes)[0], 36)}`) and recurses on the remainder."],
                    "Recurrence: T(n) = n \u00b7 T(n-1) + O(n), which unrolls to \u0398(n \u00b7 n!). There are n! orderings, so any algorithm that lists them all needs "
                    "\u03a9(n!) time. Practical only for roughly n \u2264 10-12. The slices copy n-1, n-2, ... items per active frame: O(n\u00b2) peak auxiliary space.",
                    lines=[lp.lineno])
    return None


def _subsets(tree) -> Optional[Match]:
    for fn in _funcs(tree):
        calls = _self_calls(fn)
        if len(calls) == 2 and not any(isinstance(n, _LOOPS) for n in ast.walk(fn)):
            lins = [_lin(c.args[-1]) if c.args else None for c in calls]
            txt = " ".join(_src(c, 60) for c in calls)
            if all(lins) and all(l[1] == 1 for l in lins) and (".append" in _src(fn, 2000) or "+" in txt or "[" in txt):
                return _m(
                    "Subset enumeration (include / exclude decision tree, brute force)",
                    "For each item it makes two recursive calls -- one that keeps the item and one that skips it -- so every subset is explored.",
                    [f"`{fn.name}` calls itself twice on the next index ({_line(calls[0])}, {_line(calls[1])})."],
                    "Recurrence: T(n) = 2T(n-1) + O(1) = \u0398(2\u207f), the size of the power set. Each leaf may copy a subset of up to n items, giving \u0398(n \u00b7 2\u207f) "
                    "if every subset is stored. Pruning (backtracking) or DP over overlapping states is the way to avoid the full 2\u207f.",
                    lines=[fn.lineno])
    return None


# --------------------------------------------------------------------- matrices / graphs / DP
def _matmul(tree) -> Optional[Match]:
    for a in ast.walk(tree):
        if isinstance(a, ast.AugAssign) and isinstance(a.op, ast.Add) and isinstance(a.target, ast.Subscript) \
                and isinstance(a.value, ast.BinOp) and isinstance(a.value.op, ast.Mult) \
                and _sub(a.value.left) and _sub(a.value.right) and _depth(tree) >= 3:
            return _m(
                "Matrix multiplication (triple loop, brute-force definition)",
                "Each output cell is the dot product of a row and a column, computed straight from the definition.",
                [f"{_line(a)}: `{_src(a, 44)}` accumulates row \u00d7 column products inside three nested loops."],
                "n\u00b2 output cells, each needing n multiply-adds: \u0398(n\u00b3) for n\u00d7n matrices (or \u0398(n \u00b7 m \u00b7 p) for an n\u00d7m times m\u00d7p product). "
                "Strassen's divide-and-conquer lowers the exponent to log\u2082 7 \u2248 2.81. The result matrix needs \u0398(n\u00b2) space.",
                lines=[a.lineno])
    return None


def _floyd(tree) -> Optional[Match]:
    for a in ast.walk(tree):
        if isinstance(a, ast.Assign) and len(a.targets) == 1 and _sub(a.targets[0]) and isinstance(a.value, ast.Call) \
                and _name(a.value.func) == "min" and _depth(tree) >= 3 and len(a.value.args) == 2:
            tgt = _src(a.targets[0])
            if any(_src(x) == tgt for x in a.value.args) and any(isinstance(x, ast.BinOp) and isinstance(x.op, ast.Add)
                                                                  for x in a.value.args):
                return _m(
                    "Floyd\u2013Warshall (all-pairs shortest paths, dynamic programming)",
                    "It improves the best known distance between every pair of vertices by trying each vertex k as an intermediate stop.",
                    [f"{_line(a)}: `{_src(a, 46)}` relaxes the distance i\u2192j through k inside three nested loops."],
                    "Three nested loops over the V vertices: \u0398(V\u00b3) time in every case, \u0398(V\u00b2) space for the distance table.",
                    lines=[a.lineno])
    return None


def _dijkstra(tree) -> Optional[Match]:
    names = {_name(c.func) for c in ast.walk(tree) if isinstance(c, ast.Call)}
    if {"heappush", "heappop"} <= names and any(isinstance(n, ast.Name) and "dist" in n.id.lower() for n in ast.walk(tree)):
        c = next(c for c in ast.walk(tree) if isinstance(c, ast.Call) and _name(c.func) == "heappop")
        return _m(
            "Dijkstra's algorithm (shortest paths, greedy with a priority queue)",
            "It repeatedly settles the closest unsettled vertex and relaxes the distances of its neighbours -- a greedy choice that is safe when no edge weight is negative.",
            [f"{_line(c)}: `{_src(c, 40)}` always hands over the vertex with the smallest tentative distance."],
            "With a binary heap each edge causes at most one push and each push/pop costs O(log V), so the total is O((V + E) log V). With a plain list "
            "instead of a heap it is O(V\u00b2). Space is O(V + E) counting the graph, O(V) auxiliary. Negative weights break the greedy argument (use Bellman\u2013Ford).",
            lines=[c.lineno])
    return None


def _bellman_ford(tree) -> Optional[Match]:
    for lp in [n for n in ast.walk(tree) if isinstance(n, _LOOPS)]:
        for inner in _inner_loops(lp):
            for iff in [n for n in ast.walk(inner) if isinstance(n, ast.If) and isinstance(n.test, ast.Compare)]:
                t = _src(iff.test, 80)
                if "dist" in t and "+" in t and "<" in t or ("dist" in t and "+" in t and ">" in t):
                    if isinstance(lp, ast.For) and isinstance(lp.iter, ast.Call) and _name(lp.iter.func) == "range" and "- 1" in _src(lp.iter, 40):
                        return _m(
                            "Bellman\u2013Ford (shortest paths by repeated relaxation, dynamic programming)",
                            "It relaxes every edge, and repeats that V-1 times, so shortest paths with 1, 2, ... edges are settled in turn.",
                            [f"{_line(iff)}: `if {_src(iff.test, 40)}` relaxes an edge inside a loop that runs V-1 times."],
                            "V-1 rounds \u00d7 E edges = \u0398(V \u00b7 E) time. It tolerates negative weights, and one extra round that still improves a distance reveals a negative cycle.",
                            lines=[lp.lineno, iff.lineno])
    return None


def _dp_special(tree) -> Optional[Match]:
    """Named dynamic-programming problems recognised from the shape of the recurrence."""
    for a in ast.walk(tree):
        if not (isinstance(a, ast.Assign) and len(a.targets) == 1 and _sub(a.targets[0])):
            continue
        tgt = a.targets[0]
        base = _src(tgt.value)
        reads = [s for s in ast.walk(a.value) if _sub(s) and _src(s.value) == base]
        if not reads:
            continue
        txt = _src(a.value, 120)
        inloop = _depth(tree) >= 1
        if not inloop:
            continue
        # LCS / edit distance: 2-D table, diagonal read, character comparison somewhere in the function
        two_d = isinstance(tgt.value, ast.Subscript) or (isinstance(tgt.slice, ast.Tuple))
        diag = "- 1][" in _src(a, 140) and "- 1]" in _src(a, 140)
        if two_d and diag:
            cmp_chars = any(isinstance(c, ast.Compare) and any(isinstance(o, (ast.Eq, ast.NotEq)) for o in c.ops)
                            and _sub(c.left) and _sub(c.comparators[0]) for c in ast.walk(tree))
            if cmp_chars:
                edit = "min(" in _src(tree, 4000) and "+ 1" in _src(tree, 4000)
                nm = "Edit distance (dynamic programming)" if edit else "Longest common subsequence (dynamic programming)"
                return _m(
                    nm, "It fills an (n+1)\u00d7(m+1) table where cell (i, j) answers the sub-problem for the first i and j characters, "
                        "built from the three neighbouring cells.",
                    [f"{_line(a)}: `{_src(a, 46)}` builds cell (i, j) from neighbouring cells after comparing characters."],
                    "Number of sub-problems \u00d7 work per sub-problem = (n \u00b7 m) \u00d7 O(1) = \u0398(n \u00b7 m) time and \u0398(n \u00b7 m) space "
                    "(\u0398(min(n, m)) if only the previous row is kept).",
                    lines=[a.lineno])
        # knapsack: max(skip, take) where take reads a row above shifted by a weight
        if "max(" in txt and "- 1][" in txt and "+" in txt and two_d:
            return _m(
                "0/1 knapsack (dynamic programming)",
                "It fills a table over (items considered, capacity left); each cell is the better of skipping or taking the current item.",
                [f"{_line(a)}: `{_src(a, 46)}` chooses the larger of leaving the item out or taking it."],
                "Sub-problems = n items \u00d7 W capacities, O(1) work each: \u0398(n \u00b7 W) time and space. W is a numeric VALUE, not the input's length, so this is "
                "pseudo-polynomial -- exponential in the number of bits of W.",
                lines=[a.lineno])
        # coin change / unbounded: dp[i] = min(dp[i], dp[i - c] + 1)
        if ("min(" in txt or "max(" in txt) and any(_lin(r.slice) and _lin(r.slice)[1] < 0 or isinstance(r.slice, ast.BinOp) for r in reads) and not two_d:
            if any(isinstance(n, ast.For) for n in ast.walk(tree)) and _depth(tree) >= 2:
                return _m(
                    "Coin-change / unbounded-choice DP (dynamic programming)",
                    "It fills a one-dimensional table where entry i is the best answer for amount i, built from entries at i minus each allowed choice.",
                    [f"{_line(a)}: `{_src(a, 46)}` builds entry i from earlier entries of the same table."],
                    "Sub-problems = the target amount A; each looks at k choices: \u0398(A \u00b7 k) time, \u0398(A) space. A is a value, so this is pseudo-polynomial.",
                    lines=[a.lineno])
    return None


def _lis(tree) -> Optional[Match]:
    for a in ast.walk(tree):
        if isinstance(a, ast.Assign) and len(a.targets) == 1 and _sub(a.targets[0]) and isinstance(a.value, ast.Call) \
                and _name(a.value.func) == "max" and any(_sub(x) and _src(x.value) == _src(a.targets[0].value) for x in ast.walk(a.value)) \
                and _depth(tree) >= 2:
            if any(isinstance(c, ast.Compare) and _sub(c.left) and _sub(c.comparators[0]) and isinstance(c.ops[0], (ast.Gt, ast.Lt))
                   for c in ast.walk(tree)):
                return _m(
                    "Longest increasing subsequence (O(n\u00b2) dynamic programming)",
                    "dp[i] holds the best subsequence ending at i, found by checking every earlier element that is smaller.",
                    [f"{_line(a)}: `{_src(a, 46)}` extends the best chain ending at an earlier, smaller item."],
                    "Each of the n sub-problems scans up to n predecessors: 1+2+...+(n-1) = \u0398(n\u00b2). A patience-sorting variant with binary search reaches O(n log n).",
                    lines=[a.lineno])
    return None


RULES = (_bubble, _selection, _insertion, _merge_sort, _quick_sort, _heap_sort, _counting_sort, _gcd, _sieve,
         _fib_like, _hanoi, _permutations, _subsets, _matmul, _floyd, _dijkstra, _bellman_ford, _dp_special, _lis, _linear_search)


def as_rules():
    """Adapt (tree)-style rules to paradigm_detector's (facts)-style rules."""
    def wrap(rule):
        def _r(facts):
            return rule(facts.tree)
        _r.__name__ = rule.__name__
        return _r
    return tuple(wrap(r) for r in RULES)
