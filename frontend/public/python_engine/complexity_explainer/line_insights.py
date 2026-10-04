"""
Line Insights

Builds the *line-specific* "Educational Insight" notes: what this exact
construct does in Python, why it costs what it costs, what to watch out for,
and what the learner's last test run says about it.

The older signal-based notes in insight_gatherers.py only fire when the code
matches a named pattern (halving, memoization, `pop(0)`...). That left plain
but important lines -- a `for` header, an `if` test, `s += x`, a `return` --
with no teaching at all. This module closes that gap: EVERY line gets
insights built from its own AST node, the loops/functions around it, the
variable types the analyzer inferred, and the profiler's hit counts.

Everything here is deterministic (same code -> same words) and never executes
the learner's code. Each note is a (priority, text) pair so the gatherer can
keep the most valuable ones:

    0  performance trap -- slow AND what to do instead
    1  line-specific teaching / measured evidence from the last run
    2  background fact, rules of thumb, scale intuition

Every note starts with a short bold lead-in (e.g. "**Reading the loop:**") so
a learner can skim a long panel and jump to what they need.
"""
import ast
import re
from typing import Dict, List, Optional, Set, Tuple

from complexity_explainer.growth_insight import (
    parse_complexity, is_constant, evaluate, _fmt, Term,
)

Note = Tuple[int, str]

# Very rough speed of a typical computer for simple steps. Only used for
# "reality check" intuition -- deliberately round, never presented as a benchmark.
STRICT = False  # tests flip this on so teaching-text bugs raise instead of being swallowed

OPS_PER_SECOND = 10_000_000

_LOOPS = (ast.For, ast.AsyncFor, ast.While)
_MUTATORS = {"append", "extend", "insert", "remove", "pop", "clear", "add", "discard",
             "update", "popleft", "appendleft", "sort", "reverse"}


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------
def _src(n, limit: int = 60) -> str:
    try:
        s = ast.unparse(n)
    except Exception:
        return "..."
    s = " ".join(s.split())
    # `**` (power) would be read as bold markers by the UI's markdown parser; show it as ^
    s = s.replace(" ** ", "^").replace("**", "^")
    return s if len(s) <= limit else s[: limit - 3] + "..."


def _names(n) -> Set[str]:
    return {x.id for x in ast.walk(n) if isinstance(x, ast.Name)}


def _fmt_time(seconds: float) -> str:
    if seconds < 0.001:
        return "a blink (under a millisecond)"
    if seconds < 1:
        return f"about {max(1, int(round(seconds * 1000))):,} milliseconds"
    if seconds < 60:
        return f"about {int(round(seconds))} second(s)"
    if seconds < 3600:
        return f"about {int(round(seconds / 60))} minute(s)"
    if seconds < 86400:
        return f"about {seconds / 3600:.1f} hours"
    if seconds < 86400 * 365:
        return f"about {int(round(seconds / 86400)):,} day(s)"
    years = seconds / (86400 * 365)
    if years > 1e10:
        return "far longer than the age of the universe"
    return f"about {_fmt(years)} years"


def _feasible_n(term: Term, budget: float = OPS_PER_SECOND) -> Optional[int]:
    """Largest n whose step count still fits in `budget`; None = no practical limit."""
    if term is None or is_constant(term):
        return None
    if term.kind in ("exp", "fact"):
        n = 1
        while n < 200 and evaluate(term, n + 1) <= budget:
            n += 1
        return n
    lo, hi = 1, 10 ** 12
    if evaluate(term, hi) <= budget:
        return None
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if evaluate(term, mid) <= budget:
            lo = mid
        else:
            hi = mid - 1
    return lo


class LineInsights:
    """Composed into EducationalInsightGenerator as `self.line_insights`."""

    def __init__(self, generator):
        self.generator = generator

    # ------------------------------------------------------------------
    # context accessors
    # ------------------------------------------------------------------
    @property
    def _shape(self):
        return self.generator.shape

    def _var_type(self, name: str) -> Optional[str]:
        return (getattr(self.generator.ctx, "var_types", None) or {}).get(name)

    def _line_hits(self) -> Dict[int, int]:
        td = getattr(self.generator.ctx, "trace_data", None) or {}
        return td.get("line_hits") or {}

    def _ran(self) -> bool:
        return self.generator.variable_explanations._tracer_ran()

    def _hits_at(self, stmt) -> int:
        return int(self._line_hits().get(getattr(stmt, "lineno", -1), 0) or 0)

    def _container_phrase(self, expr) -> Tuple[str, str]:
        """(kind, text) for the thing being searched / measured, using the
        analyzer's inferred type when it has one."""
        name = expr.id if isinstance(expr, ast.Name) else None
        t = self._var_type(name) if name else None
        if isinstance(expr, (ast.List, ast.ListComp)):
            t = "list"
        elif isinstance(expr, (ast.Set, ast.SetComp)):
            t = "set"
        elif isinstance(expr, (ast.Dict, ast.DictComp)):
            t = "dict"
        elif isinstance(expr, ast.Constant) and isinstance(expr.value, str):
            t = "str"
        return (t or "unknown", f"`{_src(expr, 30)}`")


    def _resolve_stmt(self, node, line_no: int):
        """The analyzer sometimes hands us an expression node (e.g. the inner Call of
        `return f(n-1) + f(n-2)` or `n = len(x)`). Teach about the whole STATEMENT on
        that line when there is one, so `return`, assignments and tests keep their
        own lessons. Returns (node_to_explain, extra_call_or_None)."""
        if isinstance(node, ast.stmt) or self._shape.tree is None:
            return node, None
        stmts = [x for x in ast.walk(self._shape.tree)
                 if isinstance(x, ast.stmt) and getattr(x, "lineno", -2) == line_no
                 and not isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
        if not stmts:
            return node, None
        stmt = stmts[0]
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
            # a bare call line, e.g. print(fib(8)): teach the outer call, keep the inner one too
            if isinstance(node, ast.Call) and ast.dump(node) != ast.dump(stmt.value):
                return node, stmt.value
            return stmt, None
        if isinstance(stmt, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.Return, ast.If,
                             ast.For, ast.AsyncFor, ast.While, ast.Delete, ast.Raise, ast.Assert)):
            return stmt, None
        return node, None

    # ------------------------------------------------------------------
    # PUBLIC: time notes
    # ------------------------------------------------------------------
    def time_notes(self, node, sig, local_t: str, global_t: str, hits: int, code_snippet: str) -> List[Note]:
        notes: List[Note] = []
        line_no = getattr(node, "lineno", -1)
        node, extra_call = self._resolve_stmt(node, line_no)
        inner = node.value if isinstance(node, ast.Expr) else node

        try:
            if extra_call is not None:
                notes += self._call_facts_time(extra_call, line_no)
            if isinstance(inner, (ast.For, ast.AsyncFor)):
                notes += self._t_for(inner, line_no, hits)
            elif isinstance(inner, ast.While):
                notes += self._t_while(inner, line_no, hits)
            elif isinstance(inner, ast.If):
                notes += self._t_if(inner, line_no, hits)
            elif isinstance(inner, (ast.FunctionDef, ast.AsyncFunctionDef)):
                notes += self._t_funcdef(inner, line_no)
            elif isinstance(inner, ast.Return):
                notes += self._t_return(inner, line_no)
            elif isinstance(inner, ast.Assign):
                notes += self._t_assign(inner, line_no)
            elif isinstance(inner, ast.AugAssign):
                notes += self._t_augassign(inner, line_no)
            elif isinstance(inner, ast.AnnAssign) and inner.value is not None:
                notes += self._t_expr_value(inner.value, line_no, target=inner.target)
            elif isinstance(inner, ast.Break):
                notes += self._t_break()
            elif isinstance(inner, ast.Continue):
                notes += self._t_continue()
            elif isinstance(inner, ast.Pass):
                notes.append((2, "**Placeholder:** `pass` does nothing -- it exists because Python needs *some* statement in an otherwise empty block. It costs O(1) and never changes the complexity."))
            elif isinstance(inner, (ast.Import, ast.ImportFrom)):
                notes += self._t_import()
            elif isinstance(inner, ast.Delete):
                notes += self._t_delete(inner)
            elif isinstance(inner, ast.Try):
                notes += self._t_try()
            elif isinstance(inner, (ast.With, ast.AsyncWith)):
                notes += self._t_with()
            elif isinstance(inner, ast.Raise):
                notes.append((1, "**Abandoning the normal path:** `raise` stops the current function immediately and unwinds the call stack until something catches the error. Raising is rare-path work, so it is usually not what sets Big-O -- but an exception caught inside a hot loop is far slower than a plain `if` check."))
            elif isinstance(inner, ast.Assert):
                notes.append((2, "**Cheap safety net:** `assert` evaluates its condition once and stops the program if it is false. The test itself costs whatever the condition costs (usually O(1)); Python even skips asserts entirely when run with `-O`."))
            elif isinstance(inner, ast.Call):
                notes += self._t_call(inner, line_no)
            elif isinstance(inner, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                notes += self._t_comprehension(inner, line_no)
        except Exception:
            # Teaching text must never break the analysis pipeline.
            if STRICT:
                raise

        has_trap = any(p == 0 for p, _ in notes)
        if not has_trap:
            notes += self._cross_cutting_time(inner, line_no, local_t, global_t)
        notes += self._observed_time(inner, line_no, hits)
        if not has_trap:
            notes += self._reality_check(local_t, global_t, line_no)
        return notes

    # ------------------------------------------------------------------
    # PUBLIC: space notes
    # ------------------------------------------------------------------
    def space_notes(self, node, sig, local_s: str, global_s: str, mem_state: Optional[dict], hits: int) -> List[Note]:
        notes: List[Note] = []
        line_no = getattr(node, "lineno", -1)
        node, extra_call = self._resolve_stmt(node, line_no)
        inner = node.value if isinstance(node, ast.Expr) else node
        try:
            if extra_call is not None:
                notes += self._s_call(extra_call)
            if isinstance(inner, (ast.For, ast.AsyncFor)):
                notes += self._s_for(inner)
            elif isinstance(inner, ast.While):
                notes.append((1, "**What the loop keeps in memory:** a `while` loop does not create anything by itself -- it re-checks a condition built from variables that already exist. Whatever space the loop uses comes from what its *body* builds or grows on each pass."))
            elif isinstance(inner, ast.If):
                notes += self._s_if(inner)
            elif isinstance(inner, (ast.FunctionDef, ast.AsyncFunctionDef)):
                notes += self._s_funcdef(inner, line_no)
            elif isinstance(inner, ast.Return):
                notes += self._s_return(inner, line_no)
            elif isinstance(inner, ast.Assign):
                notes += self._s_assign(inner, line_no)
            elif isinstance(inner, ast.AugAssign):
                notes += self._s_augassign(inner)
            elif isinstance(inner, ast.AnnAssign) and inner.value is not None:
                notes += self._s_value(inner.value, line_no, target=inner.target)
            elif isinstance(inner, ast.Call):
                notes += self._s_call(inner)
            elif isinstance(inner, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                notes += self._s_comprehension(inner)
            elif isinstance(inner, (ast.Break, ast.Continue, ast.Pass)):
                notes.append((1, "**No memory involved:** this is pure control flow. It moves execution around but allocates nothing, so it cannot affect space complexity."))
            elif isinstance(inner, ast.Delete):
                notes.append((1, "**Freeing memory:** `del` removes a *name* (or an item). The underlying object is only reclaimed once nothing else refers to it -- Python counts references and frees an object the moment its count hits zero."))
        except Exception:
            if STRICT:
                raise

        if not any(p == 0 for p, _ in notes):
            notes += self._cross_cutting_space(inner, line_no, local_s, global_s, mem_state)
        return notes

    # ==================================================================
    # TIME: loops
    # ==================================================================
    def _t_for(self, node, line_no: int, hits: int) -> List[Note]:
        out: List[Note] = []
        it, target = node.iter, node.target
        tgt = _src(target, 20)
        body_names = set()
        for s in node.body:
            body_names |= _names(s)

        # --- what is being iterated -----------------------------------
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
            a = it.args
            if len(a) == 1 and isinstance(a[0], ast.Call) and isinstance(a[0].func, ast.Name) and a[0].func.id == "len" and a[0].args:
                coll = _src(a[0].args[0], 25)
                uses_index = any(
                    isinstance(x, ast.Subscript) and isinstance(x.slice, ast.Name) and x.slice.id == tgt
                    for s in node.body for x in ast.walk(s)
                )
                tail = (f" Your body indexes with `{tgt}` (`{coll}[{tgt}]`), and each index lookup is O(1), so the total stays len({coll}) x O(1)."
                        if uses_index else "")
                out.append((1, f"**Reading the loop:** `range(len({coll}))` hands out the positions 0, 1, 2, ... one at a time. `range` is lazy -- it never builds a list of numbers, so the header costs O(1) memory however big `{coll}` is.{tail} If you only need the values, `for item in {coll}:` does the same number of steps with less to read; if you need both, `enumerate({coll})` gives position and value together."))
            elif len(a) == 1:
                out.append((1, f"**Reading the loop:** `range({_src(a[0], 20)})` produces 0 up to {_src(a[0], 20)} - 1 lazily, one value per pass -- it does not allocate a list of numbers, so even a range of a billion numbers costs O(1) memory. The *time* is the number of passes: exactly {_src(a[0], 20)}."))
            elif len(a) >= 2:
                step = a[2] if len(a) > 2 else None
                if step is not None and not (isinstance(step, ast.Constant) and step.value == 1):
                    out.append((1, f"**Reading the loop:** `{_src(it, 40)}` jumps by {_src(step, 15)} each pass instead of 1, so it makes roughly (stop - start) / {_src(step, 15)} passes. A constant step only divides the pass count by a constant -- Big-O still treats it as linear (halving the passes is still O(n); only *multiplying/dividing the variable itself* changes the class)."))
                else:
                    out.append((1, f"**Reading the loop:** `{_src(it, 40)}` starts at {_src(a[0], 15)} and stops just before {_src(a[1], 15)}, so the pass count is (stop - start). The stop value is excluded, which is the classic off-by-one place to double-check."))
        elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "enumerate" and it.args:
            out.append((1, f"**Reading the loop:** `enumerate({_src(it.args[0], 25)})` pairs each item with its position as the loop goes -- lazily, one pair per pass. It adds only a tiny constant per step, so it is the clean way to get an index without `range(len(...))`."))
        elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "zip":
            out.append((1, f"**Reading the loop:** `zip(...)` walks several sequences in lockstep and stops when the *shortest* one runs out, so the pass count is min(len of each), not their sum or product."))
        elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id in ("sorted", "list", "set", "tuple", "reversed"):
            fn = it.func.id
            cost = {"sorted": "O(n log n) to sort", "list": "O(n) to copy", "set": "O(n) to build the hash table", "tuple": "O(n) to copy"}.get(fn)
            if cost:
                out.append((1, f"**The header runs only once:** the expression after `in` -- `{_src(it, 40)}` -- is evaluated a single time *before* the first pass, not on every pass. That one-time setup costs {cost}, and then the loop itself adds O(n) more. The larger of the two decides the line's Big-O."))
            else:
                out.append((1, f"**Reading the loop:** `reversed(...)` walks a sequence backwards without copying it -- O(1) to set up, then one step per item."))
        elif isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr in ("items", "keys", "values"):
            out.append((1, f"**Reading the loop:** `.{it.func.attr}()` returns a *view* of the dictionary -- no copy is made -- and the loop then visits each entry once, so the cost is the number of entries. Adding or deleting keys while looping over a dictionary raises a RuntimeError, so collect changes and apply them after the loop."))
        else:
            coll = _src(it, 30)
            kind, _ = self._container_phrase(it)
            what = {"str": "characters of", "dict": "keys of", "set": "elements of"}.get(kind, "items of")
            out.append((1, f"**Reading the loop:** Python asks `{coll}` for its next item at the top of every pass (the *iterator protocol*), and each request is O(1). So the loop makes one pass for each of the {what} `{coll}` -- the total is len({coll}) passes, which is exactly why this is O(n) in the size of `{coll}`."))

        # --- hazards -------------------------------------------------------
        iter_name = it.id if isinstance(it, ast.Name) else None
        if iter_name:
            for s in node.body:
                for x in ast.walk(s):
                    if (isinstance(x, ast.Call) and isinstance(x.func, ast.Attribute) and isinstance(x.func.value, ast.Name)
                            and x.func.value.id == iter_name and x.func.attr in ("append", "remove", "pop", "insert", "extend", "clear")):
                        out.append((0, f"**Danger -- changing `{iter_name}` while looping over it:** `{iter_name}.{x.func.attr}(...)` inside this loop resizes the very list being walked. Python's iterator tracks a position, so items get skipped (after a removal) or the loop can run far longer than len({iter_name}) (after an append). Loop over a copy (`for {tgt} in {iter_name}[:]`) or build a new list instead."))
                        break
                else:
                    continue
                break

        # --- nesting ---------------------------------------------------------
        outer = self._shape.enclosing_loops(line_no)
        if outer:
            outer_targets = {n for lp in self._outer_loop_nodes(line_no) for n in _names(lp.target)} if self._outer_loop_nodes(line_no) else set()
            depends = bool(outer_targets & _names(it))
            if depends:
                out.append((1, f"**A shrinking (or growing) inner loop:** this loop's range uses a variable from the loop around it, so it does NOT repeat the same number of times on every outer pass. Adding up (n-1) + (n-2) + ... + 1 gives n(n-1)/2, about n^2 / 2 steps. Big-O drops the 1/2 and calls it O(n^2) -- but in real time it is roughly half as slow as a full n x n grid."))
            else:
                out.append((1, f"**Nested loops multiply:** this loop restarts from scratch on every pass of the {len(outer)} loop(s) around it. If the outer loop makes A passes and this one makes B, the body runs A x B times -- never A + B. That multiplication is where O(n^2) and O(n^3) come from."))

        # --- worst case ----------------------------------------------------------
        if any(isinstance(x, (ast.Break, ast.Return)) for s in node.body for x in ast.walk(s)):
            out.append((2, "**Worst case vs. best case:** the body contains an early exit (`break` / `return`), so on lucky input this loop stops long before the end. Big-O deliberately reports the worst case -- the input where the exit never triggers and every pass runs -- because that is the guarantee you can promise."))
        if node.orelse:
            out.append((2, "**A `for ... else`:** the `else` block runs only if the loop finished *without* hitting `break`. It is a neat way to say \"not found\" without a flag variable, and it costs nothing extra."))
        return out

    def _outer_loop_nodes(self, line_no: int):
        res = []
        for n in self._shape._loop_nodes:
            end = getattr(n, "end_lineno", n.lineno)
            if n.lineno < line_no <= end and isinstance(n, (ast.For, ast.AsyncFor)):
                res.append(n)
        return res

    def _t_while(self, node, line_no: int, hits: int) -> List[Note]:
        out: List[Note] = []
        cond = _src(node.test, 40)
        cond_names = {n for n in _names(node.test)} - {"len", "range", "True", "False"}
        updates: Dict[str, str] = {}
        for s in node.body:
            for x in ast.walk(s):
                if isinstance(x, ast.AugAssign) and isinstance(x.target, ast.Name):
                    kind = self._update_kind(x.op, x.value)
                    updates[x.target.id] = kind
                elif isinstance(x, ast.Assign):
                    for t in x.targets:
                        for nm in ([t] if isinstance(t, ast.Name) else (t.elts if isinstance(t, ast.Tuple) else [])):
                            if isinstance(nm, ast.Name):
                                updates[nm.id] = self._assign_update_kind(nm.id, x.value)
        removers, adders = set(), set()
        for st in node.body:
            for x in ast.walk(st):
                if (isinstance(x, ast.Call) and isinstance(x.func, ast.Attribute) and isinstance(x.func.value, ast.Name)
                        and x.func.value.id in cond_names):
                    if x.func.attr in ("pop", "popleft", "remove", "discard", "clear", "popitem", "heappop"):
                        removers.add(x.func.value.id)
                    elif x.func.attr in ("append", "appendleft", "add", "extend", "insert", "heappush", "update"):
                        adders.add(x.func.value.id)
                elif isinstance(x, ast.Delete):
                    for t in x.targets:
                        if isinstance(t, ast.Subscript) and isinstance(t.value, ast.Name) and t.value.id in cond_names:
                            removers.add(t.value.id)
        mutated = removers | adders
        driven = {k: v for k, v in updates.items() if k in cond_names}
        always_true = isinstance(node.test, ast.Constant) and bool(node.test.value)
        has_exit = any(isinstance(x, (ast.Break, ast.Return, ast.Raise)) for s in node.body for x in ast.walk(s))

        window = bool(re.search(r"(lo|low|left|l|start|begin)\b\s*<=?\s*(hi|high|right|r|end|stop)\b", cond.lower()))
        if always_true:
            out.append((1, "**`while True`:** the header never stops the loop -- the *only* way out is a `break`/`return` inside the body. To know how many passes it makes, find that exit and ask what makes it fire; that, not the header, sets the Big-O."))
        elif window:
            out.append((1, f"**A shrinking window:** `{cond}` compares the two ends of a search window. Each pass looks at the middle, then moves one end past it, so the window shrinks n -> n/2 -> n/4 -> ... -> 1. The loop stops when the ends cross, after about log2(n) passes -- 1,000,000 items need only ~20 passes, 1,000,000,000 need ~30."))
        elif mutated and not driven:
            who = sorted(mutated)[0]
            if removers and adders:
                out.append((1, f"**A worklist loop:** `{cond}` stays true while `{who}` still has items, and the body both removes items from it and adds new ones. The pass count is the total number of items EVER put into `{who}` -- if every item is added at most once (for example, tracked with a `visited` set), that is linear; if items can be re-added, it can grow much faster. This is the shape of BFS, DFS and task-queue processing."))
            else:
                out.append((1, f"**A drain loop:** `{cond}` {'is true while `' + who + '` still has items' if cond == who else 'keeps going while `' + who + '` is involved, and `' + who + '` shrinks'}, and the body removes from it each pass, so the loop makes one pass per item taken out -- linear in how many items `{who}` started with. The loop's own bookkeeping is O(1); what each removal costs decides whether the total is O(n) or O(n^2)."))
        elif driven:
            geo = [k for k, v in driven.items() if v == "geometric"]
            lin = [k for k, v in driven.items() if v == "linear"]
            if geo:
                v = geo[0]
                out.append((1, f"**Why this is a *logarithmic* loop candidate:** `{v}` is multiplied or divided on each pass instead of nudged by a fixed amount. If the distance to the stopping value shrinks by a constant *factor* every pass, it takes only about log2(n) passes -- 1,000,000 needs ~20, 1,000,000,000 needs ~30."))
            elif lin:
                v = lin[0]
                out.append((1, f"**How the passes are counted:** `{v}` moves by a fixed amount each pass, so the condition `{cond}` becomes false after about (distance to the limit) / (step size) passes -- a *linear* number of passes. A `while` loop hides its pass count inside how the variable moves; a `for` loop shows it in the header."))
            else:
                out.append((1, f"**How the passes are counted:** the condition `{cond}` depends on `{next(iter(driven))}`, which the body changes. To find the pass count, ask how fast that variable moves toward making the condition false: by a fixed step (linear), by a factor (logarithmic), or irregularly (needs a closer look)."))
        elif not has_exit and not mutated:
            out.append((0, f"**Possible infinite loop:** nothing in the body changes the variables used in `{cond}`, and there is no `break`/`return`. If the condition is true once, it stays true forever. Every `while` loop needs something *inside* it that moves toward making the condition false."))
        else:
            out.append((1, f"**Reading the loop:** `{cond}` is re-checked before every pass, and the body exits early with a `break`/`return`. The pass count depends on whichever happens first -- the condition turning false or the early exit firing."))

        out.append((2, "**Loop invariant thinking:** for any `while` loop, write down one fact that is true before *every* pass (the \"invariant\") and one quantity that strictly moves toward the stop (the \"progress measure\"). The invariant proves it is correct; the progress measure proves it terminates -- and its speed is the Big-O."))
        return out

    @staticmethod
    def _update_kind(op, value) -> str:
        if isinstance(op, (ast.Mult, ast.FloorDiv, ast.Div, ast.RShift, ast.LShift)) and isinstance(value, ast.Constant) and isinstance(value.value, (int, float)) and abs(value.value) >= 2:
            return "geometric"
        if isinstance(op, (ast.Add, ast.Sub)):
            return "linear"
        return "other"

    @staticmethod
    def _assign_update_kind(name: str, value) -> str:
        """'linear' / 'geometric' only when the variable is updated from ITSELF
        (`x = x + 1`, `x = x // 2`). `lo = mid + 1` jumps to a computed position,
        which is a window-narrowing step, not a fixed stride."""
        if isinstance(value, ast.BinOp) and isinstance(value.left, ast.Name) and value.left.id == name:
            if isinstance(value.op, (ast.Mult, ast.FloorDiv, ast.Div, ast.RShift)) and isinstance(value.right, ast.Constant):
                return "geometric"
            if isinstance(value.op, (ast.Add, ast.Sub)):
                return "linear"
        return "other"

    # ==================================================================
    # TIME: branches
    # ==================================================================
    def _t_if(self, node, line_no: int, hits: int) -> List[Note]:
        out: List[Note] = []
        test = node.test
        cond = _src(test, 45)

        # --- what the test itself does ---------------------------------------
        def explain_compare(cmp: ast.Compare):
            op, right, left = cmp.ops[0], cmp.comparators[0], cmp.left
            if isinstance(op, (ast.In, ast.NotIn)):
                kind, who = self._container_phrase(right)
                if kind in ("set", "dict"):
                    return (1, f"**What the test costs:** `in` on {who} (a {kind}) is a hash lookup -- Python hashes the value and jumps straight to its slot, O(1) on average no matter how many items are stored.")
                if kind in ("list", "tuple", "str"):
                    return (0, f"**What the test costs:** `in` on {who} (a {kind}) compares against items one by one from the front, so it is O(n) in the worst case. Inside a loop that silently becomes n x n -- convert to a `set` once, before the loop, and each test drops to O(1).")
                return (1, f"**What the test costs:** `in` depends on what {who} is. For a list, tuple or string Python scans item by item (O(n)); for a set or dict it hashes straight to the answer (O(1) on average). This one choice is behind many easy speedups.")
            if isinstance(op, (ast.Is, ast.IsNot)):
                return (2, "**What the test costs:** `is` / `is not` compares object *identity* (are these the very same object?), a single pointer comparison -- O(1). Use it for `None`; use `==` when you mean \"equal values\".")
            if isinstance(op, (ast.Eq, ast.NotEq)):
                if isinstance(left, ast.BinOp) and isinstance(left.op, ast.Mod):
                    return (1, f"**Reading the condition:** `{_src(left, 25)}` is a remainder test. `% 2 == 0` is the standard even/odd split: it sends about half the passes down each branch. A modulo of two ordinary numbers is O(1).")
                if isinstance(left, ast.Subscript) or isinstance(right, ast.Subscript):
                    return (1, "**What the test costs:** it reads an element by index (O(1) on a list or dict) and compares two single values (O(1)). Looking at one position never depends on how long the list is -- that is the whole point of random access.")
                lk, _ = self._container_phrase(left)
                rk, _ = self._container_phrase(right)
                if "list" in (lk, rk) or "dict" in (lk, rk):
                    return (0, "**What the test costs:** `==` between two whole lists/dicts compares them element by element, so it can cost O(n) -- not the O(1) you get when comparing two numbers.")
            if isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)):
                return (2, f"**What the test costs:** comparing two numbers or two short strings with `<`/`>` is a single O(1) step. (Comparing two long strings or lists compares element by element and can cost up to O(n).)")
            return None

        if isinstance(test, ast.Compare):
            r = explain_compare(test)
            if r:
                out.append(r)
        elif isinstance(test, ast.BoolOp):
            kw = "and" if isinstance(test.op, ast.And) else "or"
            stop = "false" if kw == "and" else "true"
            out.append((1, f"**Short-circuit evaluation:** `{kw}` evaluates its parts left to right and *stops at the first one that is {stop}*. So the real cost is somewhere between the cost of the first test and the sum of all of them. Put the cheapest, most-likely-to-decide test first (for example `i < len(a) and a[i] == x` guards the index so the second test never runs out of bounds)."))
            for v in test.values:
                if isinstance(v, ast.Compare):
                    r = explain_compare(v)
                    if r and r[0] == 0:
                        out.append(r)
                        break
        elif isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
            out.append((2, f"**Truthiness:** `not {_src(test.operand, 25)}` asks Python whether the value is \"empty/zero/None\". For lists, strings, dicts and sets that check is O(1) -- it looks at the stored length rather than counting. This is why `if not items:` beats `if len(items) == 0:` for readability at no cost."))
        elif isinstance(test, ast.Call):
            out.append((1, f"**The call inside the condition:** `{_src(test, 40)}` runs every time this test is evaluated, and its full cost is added each time. If it lives in a loop, that cost is multiplied by the number of passes -- hoist anything that does not change out of the condition."))
        else:
            out.append((2, f"**Truthiness:** a bare `{cond}` is treated as true or false using Python's truthiness rules (empty containers, 0 and None are false). Checking that is O(1)."))

        # --- structure ---------------------------------------------------------
        chain = 0
        cur = node
        while cur.orelse and len(cur.orelse) == 1 and isinstance(cur.orelse[0], ast.If):
            chain += 1
            cur = cur.orelse[0]
        has_else = bool(cur.orelse)
        if chain:
            out.append((1, f"**An `elif` chain:** this `if` starts a chain of {chain + 1} tests that are checked top to bottom, and only the *first* true branch runs -- later conditions are not even evaluated. In the worst case every test fails and all of them are paid for, so put the cheapest and most common cases first."))
        elif has_else:
            out.append((1, "**One branch or the other:** exactly one of the two branches runs per visit, never both. So the time is the *larger* of the two branch costs plus this test -- not their sum. Big-O always charges the heavier branch."))
        else:
            out.append((2, "**No `else`:** when the test is false, execution simply skips the body and moves on, so the cost of a skipped pass is just the test itself. Big-O still counts the body's cost, because the true case is the worst case."))

        last = node.body[-1] if node.body else None
        if isinstance(last, (ast.Return, ast.Raise, ast.Continue, ast.Break)) and not node.orelse:
            kind = {ast.Return: "return", ast.Raise: "raise", ast.Continue: "continue", ast.Break: "break"}[type(last)]
            out.append((1, f"**A guard clause:** the body ends in `{kind}`, so when the test is true the code leaves right here and everything below is skipped. Guard clauses handle special cases early (empty input, base case, \"found it\") and keep the main logic un-nested and easier to reason about."))

        # --- measured branch behaviour -------------------------------------------
        if self._ran() and hits > 0 and node.body:
            body_hits = self._hits_at(node.body[0])
            if body_hits == 0:
                out.append((1, f"**Your last test never took this branch:** the test ran {hits} time(s) but its body ran 0 times. The analysis is static, so the body's cost is still counted (the worst case assumes it can run) -- try an input that makes `{cond}` true to see it in action."))
            elif body_hits < hits:
                pct = round(100.0 * body_hits / hits)
                out.append((1, f"**What your last test did here:** the test was evaluated {hits} time(s) and was true {body_hits} time(s) (about {pct}%). Big-O ignores that ratio and assumes the expensive branch can be taken every time -- but it explains why the *measured* time on your data may be lower than the worst case."))
            elif body_hits == hits:
                out.append((2, f"**What your last test did here:** the test was true every one of its {hits} evaluation(s), so the body ran each time -- the worst case for this branch."))
        return out

    # ==================================================================
    # TIME: statements
    # ==================================================================
    def _t_funcdef(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        name = node.name
        params = [a.arg for a in node.args.args + node.args.kwonlyargs]
        for d in list(node.args.defaults) + [d for d in node.args.kw_defaults if d is not None]:
            if isinstance(d, (ast.List, ast.Dict, ast.Set)) or (isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id in ("list", "dict", "set")):
                out.append((0, "**Classic Python trap -- mutable default argument:** a default like `[]` or `{}` is created ONCE when the function is defined and then shared by every call, so items from earlier calls leak into later ones. Use `None` as the default and create the list inside the function."))
                break
        out.append((1, f"**Defining is not running:** reaching `def {name}(...)` only creates the function object -- O(1). The body's cost is paid on each *call*, so the cost of `{name}` is (cost of its body) x (how many times it is called)."))
        facts = self._shape.recursion_facts()
        k = facts["recursive"].get(name, 0)
        if k:
            memo = name in facts["memoized"]
            if memo:
                out.append((1, f"**A memoized recursive function:** `{name}` calls itself, but it caches answers, so each distinct input is computed once and later calls return the stored result in O(1). That is how a branching recursion collapses from exponential to (number of distinct inputs) x (work each)."))
            elif k >= 2:
                out.append((1, f"**A branching recursion:** `{name}` calls itself {k} times in its body, and the calls are not cached. Each call spawns {k} more, so the number of calls multiplies at every level -- the shape of the call tree, not the amount of work per call, is what makes this exponential. Add a cache (`functools.lru_cache`) and repeated subproblems are solved only once."))
            else:
                out.append((1, f"**A linear recursion:** `{name}` calls itself once per call, so the calls form a single chain: n calls deep for input n. Time is (calls) x (work per call); the chain also means n stack frames are alive at once (see the space side)."))
            first = node.body[0] if node.body else None
            calls = self._hits_at(first) if first is not None else 0
            if calls and self._ran():
                out.append((1, f"**From your last run:** `{name}` was entered about {calls} time(s) in total. That is the real size of the call tree for your test input -- try a slightly bigger input and watch how fast this number grows."))
        elif self._ran() and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(getattr(first, "value", None), ast.Constant) and len(node.body) > 1:
                first = node.body[1]
            calls = self._hits_at(first)
            if calls:
                out.append((1, f"**From your last run:** the body of `{name}` started {calls} time(s), so it was called about {calls} time(s) in your test."))
        out.append((2, f"**Arguments are passed by reference:** calling `{name}({', '.join(params[:3])}{', ...' if len(params) > 3 else ''})` does not copy the values handed in -- the function receives references to the same objects. That is why passing a million-item list costs O(1) to pass, and why changing a list inside the function changes the caller's list too."))
        return out

    def _t_return(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        fn = self._shape.enclosing_function(line_no)
        facts = self._shape.recursion_facts()
        val = node.value
        rec = bool(fn and fn in facts["recursive"])
        self_calls = 0
        if val is not None and fn:
            self_calls = sum(1 for x in ast.walk(val) if isinstance(x, ast.Call) and isinstance(x.func, ast.Name) and x.func.id == fn)
        in_loop = bool(self._shape.enclosing_loops(line_no))

        if rec and self_calls == 0:
            out.append((1, f"**A base case:** this `return` does not call `{fn}` again, so it is where the recursion *stops*. Every recursive function needs at least one base case reachable from every input, otherwise the calls never end and Python raises RecursionError (default limit about 1,000 nested calls)."))
        elif rec and self_calls >= 2:
            out.append((1, f"**Two calls, one expression:** Python evaluates both `{fn}(...)` calls on this line before it can combine them. Each of those calls does the same again, so the number of calls doubles per level -- roughly 2^n without caching. Storing results (memoization) turns repeated calls into O(1) lookups."))
        elif rec and self_calls == 1:
            out.append((1, f"**The recursive step:** `{fn}` calls itself here on a smaller problem. The `return` can only produce its value after that inner call finishes, so each call waits on the one below it -- those waiting calls are what occupy the call stack."))
        if in_loop:
            out.append((1, "**An early return inside a loop:** `return` ends the *whole function*, not just the loop -- remaining passes and every line after the loop are skipped. That makes the best case much cheaper than the worst case; Big-O reports the worst case (the input where this return never fires)."))
        elif fn and self._loop_precedes(line_no, fn):
            if isinstance(val, ast.Constant) or (isinstance(val, ast.UnaryOp) and isinstance(val.operand, ast.Constant)):
                out.append((1, f"**The \"not found / default\" return:** this line sits *after* a loop, so it only runs if the loop finished without returning early -- meaning every pass was spent. A constant like `{_src(val, 12)}` is a sentinel value the caller can test for."))
        if isinstance(val, ast.Tuple):
            out.append((2, f"**Returning several values:** `{_src(val, 35)}` packs the values into one tuple (O(k) for k values) which the caller can unpack. It is a fixed, small number, so it is O(1)."))
        elif isinstance(val, ast.Name):
            out.append((2, f"**Returning a reference:** `return {val.id}` hands back the object itself, not a copy -- even if it is a million-item list, returning it is O(1). The caller and the function now share it."))
        if isinstance(val, (ast.ListComp, ast.SetComp, ast.DictComp)):
            out.append((1, "**Building the result:** the comprehension inside `return` loops over its source and builds a brand-new collection before handing it back -- that loop is the cost of this line, not the `return` keyword."))
        if isinstance(val, ast.Call):
            out += self._call_facts_time(val, line_no)
        return out


    def _loop_precedes(self, line_no: int, fn_name: str) -> bool:
        """True if a loop in the same function finishes before `line_no`."""
        for n in self._shape._loop_nodes:
            end = getattr(n, "end_lineno", n.lineno)
            if end < line_no and self._shape.enclosing_function(n.lineno) == fn_name:
                return True
        return False

    def _t_assign(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        tgt = node.targets[0]
        value = node.value
        # tuple swap
        if isinstance(tgt, ast.Tuple) and isinstance(value, ast.Tuple) and len(tgt.elts) == len(value.elts):
            same = {_src(e, 80) for e in tgt.elts} == {_src(e, 80) for e in value.elts}
            if same:
                idx = any(isinstance(e, ast.Subscript) for e in tgt.elts)
                out.append((1, f"**The Python swap:** the whole right-hand side `{_src(value, 30)}` is evaluated *first* into a temporary pair, and only then are the names assigned. That is why no temp variable is needed -- and a swap{' of two list positions' if idx else ''} is O(1) time with no extra memory."))
                return out
        # several names assigned at once (not a swap)
        if isinstance(tgt, ast.Tuple) and isinstance(value, ast.Tuple) and len(tgt.elts) == len(value.elts):
            out.append((1, f"**Several assignments in one line:** Python builds the whole right-hand side `{_src(value, 35)}` first, then binds the names `{_src(tgt, 25)}` to the results. Because every right-hand expression is evaluated BEFORE any name changes, the values cannot interfere with each other. Cost: one O(1) step per name -- a fixed count, so O(1) overall."))
            for e in value.elts[:3]:
                if not isinstance(e, ast.Constant):
                    out += [n for n in self._t_expr_value(e, line_no) if n[0] <= 1]
            return out
        elif isinstance(tgt, ast.Tuple):
            out.append((1, f"**Unpacking:** `{_src(tgt, 25)} = ...` takes a sequence apart and gives each piece its own name. The cost is one step per name on the left (a fixed number), but the right-hand side must have exactly that many items or Python raises a ValueError."))
        # a computed midpoint
        if isinstance(value, ast.BinOp) and isinstance(value.op, (ast.FloorDiv, ast.RShift)) and isinstance(value.right, ast.Constant) and value.right.value in (2, 1):
            out.append((1, f"**The midpoint:** `{_src(value, 30)}` picks the middle of a range. It is the step that makes halving possible -- look at the middle, decide which side can be thrown away, repeat. (In languages with fixed-size ints, `(lo + hi) / 2` can overflow; Python integers cannot overflow, so this form is safe here.)"))
        # shrinking a search window:  lo = mid + 1 / hi = mid - 1
        if isinstance(tgt, ast.Name) and isinstance(value, ast.BinOp) and isinstance(value.op, (ast.Add, ast.Sub)) \
                and isinstance(value.right, ast.Constant) and value.right.value == 1 and isinstance(value.left, ast.Name) and value.left.id != tgt.id:
            for w in self._shape._loop_nodes:
                if isinstance(w, ast.While) and w.lineno < line_no <= getattr(w, "end_lineno", w.lineno) and tgt.id in _names(w.test):
                    side = "left" if isinstance(value.op, ast.Add) else "right"
                    gone = "everything up to and including" if isinstance(value.op, ast.Add) else "everything from"
                    out.append((1, f"**Shrinking the window:** `{_src(tgt)} = {_src(value)}` moves the {side} edge past `{value.left.id}`, discarding {gone} `{value.left.id}` -- about half the remaining range. The `{'+' if isinstance(value.op, ast.Add) else '-'} 1` matters: `{value.left.id}` was already checked, and without it the window could stop shrinking, leaving the loop stuck forever (a classic off-by-one bug)."))
                    break
        # target-specific facts
        if isinstance(tgt, ast.Subscript):
            if isinstance(tgt.slice, ast.Slice):
                out.append((1, f"**Slice assignment:** writing to `{_src(tgt, 25)}` replaces a whole range, and Python may have to shift everything after it -- O(n), unlike single-index assignment which is O(1)."))
            else:
                kind, who = self._container_phrase(tgt.value)
                if kind == "dict":
                    out.append((1, f"**Writing into a dictionary:** `{_src(tgt, 25)} = ...` hashes the key and stores the value -- O(1) on average. Occasionally the table fills up and Python rebuilds it bigger (a resize), but that cost is spread across many inserts, so it is *amortized* O(1)."))
                else:
                    out.append((1, f"**Writing into one position:** `{_src(tgt, 25)} = ...` overwrites a single slot *in place* -- O(1), no copy of the container. Whether the container is a list (index) or a dict (hashed key), a single write never depends on how many items it holds."))
        elif isinstance(tgt, ast.Name):
            # accumulate / update pattern inside a loop
            if tgt.id in _names(value) and self._shape.enclosing_loops(line_no):
                out.append((1, f"**A carried-forward value:** `{tgt.id}` appears on both sides, so each pass builds on the result of the previous one. That is the signature of an accumulator -- the loop reads the old value, does O(1) work, and stores the new one."))
        out += self._t_expr_value(value, line_no, target=tgt)
        return out

    def _len_note(self, target=None) -> Note:
        tgt_txt = f"`{_src(target, 15)}`" if target is not None else "the result"
        return (1, f"**`len()` is O(1):** Python lists, strings, dicts and sets store their own size, so `len(...)` just reads a number -- it does not count the items. That is why saving it into {tgt_txt} is a convenience, not an optimization, and why `while i < len(a):` does not secretly cost O(n) per check.")

    def _t_expr_value(self, value, line_no: int, target=None) -> List[Note]:
        out: List[Note] = []
        if isinstance(value, ast.BinOp) and any(isinstance(x, ast.Call) and isinstance(x.func, ast.Name) and x.func.id == "len" for x in ast.walk(value)):
            out.append(self._len_note(target))
        if isinstance(value, ast.Constant):
            out.append((2, f"**A plain constant:** binding a name to `{_src(value, 20)}` just points the name at an existing value -- O(1). Assignment in Python never copies data; it attaches a name to an object."))
        elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "len":
            out.append(self._len_note(target))
        elif isinstance(value, ast.Subscript):
            if isinstance(value.slice, ast.Slice):
                out.append((1, f"**A slice makes a copy:** `{_src(value, 30)}` builds a brand-new list/string containing the selected items. Its cost is proportional to how many items it copies (k), not O(1). Pass index bounds instead of slicing when this sits in a loop or a recursion."))
            else:
                out.append((1, f"**Reading by position:** `{_src(value, 30)}` jumps straight to the item -- the position tells it exactly where to look, so it is O(1) whether the list has 10 items or 10 million. (On a dict the same syntax hashes the key: O(1) on average.)"))
        elif isinstance(value, ast.BinOp) and isinstance(value.op, ast.Add) and (self._looks_list(value.left) or self._looks_list(value.right)):
            out.append((0, f"**`+` on lists copies both:** `{_src(value, 35)}` builds a *new* list holding the items of both operands -- O(len(a) + len(b)) time and memory. Inside a loop, `x = x + [item]` re-copies the growing list every pass (n x n total); `x.append(item)` adds in O(1) and is the fix."))
        elif isinstance(value, ast.BinOp) and isinstance(value.op, ast.Mult) and (isinstance(value.left, (ast.List, ast.Constant)) or isinstance(value.right, (ast.List, ast.Constant))) and (isinstance(value.left, ast.List) or isinstance(value.right, ast.List)):
            out.append((1, f"**Pre-allocating a list:** `{_src(value, 30)}` creates all the slots at once, filled with the same starting value -- O(n) to build, but afterwards every write by index is O(1). Careful with `[[0]*m]*n`: it repeats the *same* inner list n times, so changing one row changes them all (use a comprehension)."))
        elif isinstance(value, ast.BinOp) and isinstance(value.op, ast.Pow):
            out.append((2, f"**About the power operator:** exponentiation of ordinary numbers is O(1)-ish, but Python integers have unlimited size, so with huge exponents the *result* can have millions of digits -- and then the arithmetic is no longer constant time."))
        elif isinstance(value, ast.BinOp):
            out.append((2, f"**Arithmetic is cheap:** `{_src(value, 30)}` is a handful of CPU-level operations on small numbers -- O(1). (Python integers can grow without limit, so the cost only creeps up once numbers have thousands of digits.)"))
        elif isinstance(value, ast.IfExp):
            out.append((1, f"**A one-line decision:** `a if cond else b` evaluates the condition and then ONLY the chosen side -- the other side never runs. So the cost is the test plus one branch, like a compact `if/else`."))
        elif isinstance(value, ast.Name) and target is not None and isinstance(target, ast.Name):
            out.append((1, f"**Aliasing, not copying:** `{_src(target, 15)} = {value.id}` makes a second *name* for the same object. If `{value.id}` is a list, dict or set, changes through either name are visible through both. This costs O(1) -- use `{value.id}.copy()` (O(n)) when you really want an independent copy."))
        elif isinstance(value, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            out += self._t_comprehension(value, line_no)
        elif isinstance(value, ast.Call):
            out += self._call_facts_time(value, line_no)
        elif isinstance(value, (ast.List, ast.Dict, ast.Set, ast.Tuple)):
            n = len(getattr(value, "elts", None) or getattr(value, "keys", []) or [])
            kind = type(value).__name__.lower()
            out.append((2, f"**Building a {kind} literal:** creating a {kind} with {n} item(s) written out in the source is O(k) for those k items -- a fixed number, so O(1) as far as input size goes."))
        elif isinstance(value, ast.JoinedStr):
            out.append((2, "**f-strings build once:** an f-string assembles the final text in a single step, so it costs O(length of the result) -- no repeated copying."))
        return out

    def _looks_list(self, n) -> bool:
        if isinstance(n, (ast.List, ast.ListComp)):
            return True
        if isinstance(n, ast.Name):
            return self._var_type(n.id) == "list"
        return False

    def _t_augassign(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        tgt, op, val = node.target, node.op, node.value
        tname = _src(tgt, 20)
        kind = self._var_type(tgt.id) if isinstance(tgt, ast.Name) else None
        in_loop = bool(self._shape.enclosing_loops(line_no))
        sym = {ast.Add: "+=", ast.Sub: "-=", ast.Mult: "*=", ast.FloorDiv: "//=", ast.Div: "/=", ast.Mod: "%=", ast.RShift: ">>=", ast.LShift: "<<=", ast.BitOr: "|=", ast.BitAnd: "&=", ast.BitXor: "^="}.get(type(op), "op=")

        if isinstance(op, ast.Add) and kind == "list":
            out.append((1, f"**`+=` on a list extends it in place:** unlike `{tname} = {tname} + [...]` (which builds a whole new list), `+=` appends the new items onto the existing list -- O(k) for k new items, no full copy."))
        elif isinstance(op, ast.Add) and kind == "str":
            out.append((0, f"**Strings are immutable:** `{tname} += ...` cannot change the string in place, so Python builds a *new* string holding the old text plus the addition. In a loop that re-copies an ever-longer string every pass (O(n^2) total). Collect pieces in a list and use `''.join(pieces)` once."))
        elif isinstance(op, ast.Add) and isinstance(tgt, ast.Name) and in_loop and not (
                isinstance(val, ast.Call) and isinstance(val.func, ast.Name) and val.func.id in ("sum", "len", "max", "min")):
            out.append((1, f"**A running total:** `{tname} {sym} ...` adds into a single number each pass -- O(1) per pass, O(n) for the whole loop. This is the efficient alternative to re-adding up the whole list on every pass, which would be O(n) each time."))
        elif isinstance(op, (ast.Mult, ast.FloorDiv, ast.Div, ast.RShift, ast.LShift)) and isinstance(val, ast.Constant) and isinstance(val.value, (int, float)) and abs(val.value) >= 2:
            out.append((1, f"**Geometric change:** `{tname} {sym} {val.value}` multiplies/divides by a constant each time it runs, so after t runs the value has changed by a factor of {val.value}^t. A loop driven by this reaches its limit in about log n passes -- the fingerprint of O(log n) algorithms such as binary search and counting digits."))
        elif isinstance(op, ast.Add) and isinstance(val, ast.Constant) and val.value == 1:
            out.append((1, f"**A counter:** `{tname} += 1` moves one step at a time, so a loop driven by it takes about n passes -- linear. Compare this with `*= 2` or `//= 2`, which move by a factor and take only about log n."))
        elif isinstance(tgt, ast.Subscript):
            out.append((1, f"**Read, change, write:** `{_src(tgt, 25)} {sym} ...` reads the current item, combines it with the new value, and writes the result back to the same slot. Both the read and the write are O(1), so it stays O(1) -- this is the classic way to build frequency counts in a dictionary."))
        else:
            out.append((1, f"**Update in place:** `{tname} {sym} ...` takes the current value of `{tname}`, combines it with the right-hand side, and stores the result back -- O(1) for ordinary numbers."))
        if isinstance(op, ast.Add) and isinstance(val, ast.Call) and isinstance(val.func, ast.Name) and val.func.id in ("sum", "len", "max", "min"):
            out.append((0, f"**A hidden scan:** `{val.func.id}(...)` on the right re-walks the whole collection every time this line runs. Inside a loop that becomes n x n. Keep a running value in a variable instead of recomputing it."))
        return out

    def _t_break(self) -> List[Note]:
        return [
            (1, "**What `break` really does:** it leaves the *innermost* loop immediately -- an outer loop around it keeps going. The remaining passes never happen, which saves real time on lucky input, but Big-O is the worst case, where the break never fires."),
            (2, "**Skipped `else`:** if the loop has an `else` block, `break` also skips it -- the `else` only runs when the loop finishes all its passes normally."),
        ]

    def _t_continue(self) -> List[Note]:
        return [
            (1, "**What `continue` really does:** it abandons the rest of *this* pass and jumps to the next one. The loop header is still evaluated, so the pass count does not change -- only the work done inside skipped passes shrinks."),
            (2, "**Why it is useful:** `continue` lets you filter out uninteresting items early (\"skip blanks\", \"skip already seen\") and keeps the main work un-indented, which is easier to read than a large `if` wrapping everything."),
        ]

    def _t_import(self) -> List[Note]:
        return [(2, "**Imports run once:** the first `import` of a module loads and runs it; every later import just finds it in a cache (`sys.modules`) and costs almost nothing. Cost-wise it is startup, not per-item work, so it never affects Big-O.")]

    def _t_delete(self, node) -> List[Note]:
        if any(isinstance(t, ast.Subscript) for t in node.targets):
            return [(0, "**Deleting from a list shifts items:** `del a[i]` closes the gap by moving every later element one slot left, so it is O(n - i) -- cheap at the end, expensive at the front. Inside a loop this is a classic hidden n x n. A `deque`, a set/dict, or building a new filtered list avoids the shifting.")]
        return [(2, "**Deleting a name:** `del x` just removes the name; the object is freed when nothing else refers to it. O(1).")]

    def _t_try(self) -> List[Note]:
        return [
            (1, "**Cost of `try`:** entering a `try` block is essentially free when nothing goes wrong. The expense comes only when an exception is actually *raised and caught* -- building the error object and unwinding the stack is far slower than a normal branch."),
            (2, "**EAFP vs LBYL:** Python style often says \"ask forgiveness, not permission\" (try, then catch). That is great when failures are rare; for things that fail often (like a missing key), a plain `if key in d` or `d.get(key)` is faster."),
        ]

    def _t_with(self) -> List[Note]:
        return [(1, "**What `with` guarantees:** the context manager's setup runs on entry and its cleanup runs on exit *even if an error happens inside the block*. The bookkeeping is O(1); the cost of the block is whatever its body costs.")]

    # ------------------------------------------------------------------
    # TIME: calls and comprehensions
    # ------------------------------------------------------------------
    _METHODS = {
        "append": ("O(1) amortized", "Python keeps spare capacity at the end of a list, so most appends just fill an empty slot. Once in a while the list is full and gets copied into a bigger block -- that resize is expensive, but it happens so rarely that the *average* cost per append stays constant."),
        "extend": ("O(k)", "adds each of the k incoming items to the end of the list -- cost grows with how many you add, not with the current size of the list."),
        "insert": ("O(n)", "must shift every item after the insertion point one slot to the right to make room. Inserting at the very front touches every element."),
        "remove": ("O(n)", "has to scan from the front to FIND the first match, then shift everything after it left to close the gap -- two O(n) steps."),
        "index": ("O(n)", "scans from the front comparing each item until it finds a match, so the worst case is checking the whole list."),
        "count": ("O(n)", "must examine every item to tally matches -- it cannot stop early."),
        "sort": ("O(n log n)", "uses Timsort: it finds runs that are already ordered and merges them, so nearly-sorted data is much faster than the worst case. It sorts in place and is stable (equal items keep their relative order)."),
        "reverse": ("O(n)", "swaps items from both ends toward the middle, in place -- every element is touched once."),
        "copy": ("O(n)", "builds a new container and copies a reference to each element."),
        "clear": ("O(n)", "releases every stored reference, so the work grows with the number of items."),
        "add": ("O(1) average", "hashes the value and drops it into its slot in the set's hash table; adding something already present changes nothing."),
        "discard": ("O(1) average", "hashes the value and removes it if present -- no error if it is missing, unlike `remove`."),
        "get": ("O(1) average", "hashes the key and returns the stored value, or the default if the key is absent -- no scanning, and no KeyError."),
        "setdefault": ("O(1) average", "looks the key up once and inserts the default only if it is missing."),
        "update": ("O(k)", "merges k incoming entries into the container -- cost follows the size of the *argument*."),
        "keys": ("O(1)", "returns a live view of the keys without copying them."),
        "values": ("O(1)", "returns a live view of the values without copying them."),
        "items": ("O(1)", "returns a live view of (key, value) pairs without copying them. Looping over it afterwards costs O(entries)."),
        "join": ("O(total characters)", "computes the final length first, allocates ONE string, and copies each piece in. That single allocation is why `''.join(parts)` beats repeated `+=`."),
        "split": ("O(n)", "scans the string once and builds a list of the pieces."),
        "strip": ("O(n)", "scans from each end until it hits a non-whitespace character, then copies the middle."),
        "replace": ("O(n)", "scans the whole string and builds a new one -- strings never change in place."),
        "find": ("O(n)", "scans the string for a match; cost can reach (length) x (pattern length) in the worst case."),
        "startswith": ("O(k)", "compares only the first k characters (k = length of the prefix) -- cheaper than scanning the whole string."),
        "endswith": ("O(k)", "compares only the last k characters (k = length of the suffix)."),
        "upper": ("O(n)", "builds a new string by converting every character."),
        "lower": ("O(n)", "builds a new string by converting every character."),
        "format": ("O(output length)", "assembles the final text in one pass."),
        "popleft": ("O(1)", "removes from the front of a `deque`, which is built for fast operations at both ends -- the O(1) alternative to `list.pop(0)`."),
        "appendleft": ("O(1)", "adds to the front of a `deque` in constant time -- the alternative to `list.insert(0, x)`."),
        "heappush": ("O(log n)", "adds the item at the bottom of the heap and floats it up past larger parents -- at most the height of the tree, about log n levels."),
        "heappop": ("O(log n)", "removes the smallest item, moves the last item to the top, and sinks it down -- at most the height of the tree."),
        "heapify": ("O(n)", "rearranges an existing list into a heap in one bottom-up pass -- cheaper than n separate pushes (O(n log n))."),
        "bisect_left": ("O(log n)", "binary-searches a SORTED list, halving the range each step."),
        "bisect_right": ("O(log n)", "binary-searches a SORTED list, halving the range each step."),
        "insort": ("O(n)", "finds the spot in O(log n) but must still shift items to insert there -- the shifting dominates."),
    }

    _FUNCS = {
        "len": ("O(1)", "reads the size the container already stores -- it never counts the items."),
        "print": ("O(output length)", "writes text to the console. I/O is slow compared with arithmetic -- one `print` can cost more than thousands of simple operations -- so printing inside a hot loop is a common hidden slowdown."),
        "sum": ("O(n)", "adds every element, so it must visit all n of them."),
        "min": ("O(n)", "checks every element once -- there is no shortcut on an unsorted collection."),
        "max": ("O(n)", "checks every element once -- there is no shortcut on an unsorted collection."),
        "sorted": ("O(n log n)", "copies the items into a new list and sorts that copy with Timsort. The original is untouched, which costs extra memory (compare `.sort()`, which works in place)."),
        "reversed": ("O(1)", "returns a lazy iterator that walks the sequence backwards -- nothing is copied until you loop over it."),
        "enumerate": ("O(1)", "returns a lazy iterator that pairs each item with a counter as you loop -- nothing is built up front."),
        "zip": ("O(1)", "returns a lazy iterator that pairs items from several sequences as you loop over it."),
        "map": ("O(1)", "returns a lazy iterator; the function is applied only as each result is requested."),
        "filter": ("O(1)", "returns a lazy iterator; the test is applied only as each item is requested."),
        "range": ("O(1)", "creates a tiny object that remembers start/stop/step and computes each number on demand -- no list of numbers is built."),
        "list": ("O(n)", "walks the input and copies a reference to each item into a new list."),
        "set": ("O(n)", "walks the input and hashes each item into a new hash table."),
        "tuple": ("O(n)", "walks the input and copies a reference to each item into a new tuple."),
        "dict": ("O(n)", "walks the input pairs and hashes each key into a new table."),
        "sqrt": ("O(1)", "a single hardware-level square-root operation."),
        "abs": ("O(1)", "one comparison and, at most, one negation."),
        "pow": ("O(1)", "fast for ordinary numbers (it uses repeated squaring), though huge integers make the arithmetic itself heavier."),
        "any": ("O(n) worst case", "stops at the first true item, so it can finish early -- but if nothing is true it has to look at all n."),
        "all": ("O(n) worst case", "stops at the first false item, so it can finish early -- but if everything is true it has to look at all n."),
        "Counter": ("O(n)", "makes one pass over the input, adding 1 to a dictionary entry per item."),
        "deque": ("O(n)", "copies the input into a double-ended queue (an empty `deque()` is O(1))."),
        "int": ("O(digits)", "converting text to a number reads each digit once; converting between ordinary numbers is O(1)."),
        "str": ("O(length of result)", "builds the text for the value -- longer values take longer."),
        "isinstance": ("O(1)", "one type check."),
        "gcd": ("O(log n)", "the Euclidean algorithm: each step at least halves the numbers, so it needs only about log n steps."),
    }

    def _call_facts_time(self, call: ast.Call, line_no: int) -> List[Note]:
        out: List[Note] = []
        in_loop = bool(self._shape.enclosing_loops(line_no))
        func = call.func
        facts = self._shape.recursion_facts()
        user_funcs = {f.name for f in self._shape._func_nodes}

        if isinstance(func, ast.Attribute):
            name = func.attr
            recv = _src(func.value, 25)
            if name == "pop":
                if call.args:
                    a0 = call.args[0]
                    if isinstance(a0, ast.Constant) and a0.value == 0:
                        out.append((0, f"**`{recv}.pop(0)` is O(n):** removing the FIRST item forces every remaining item to shift one slot left. In a loop that is n x n. `collections.deque.popleft()` removes from the front in O(1)."))
                    else:
                        out.append((1, f"**`{recv}.pop(i)`:** removing from position i shifts everything after it, so it costs O(n - i) -- cheap near the end, expensive near the front. (`pop()` with no argument takes the last item in O(1).)"))
                else:
                    out.append((1, f"**`{recv}.pop()`:** with no argument it removes the LAST item, which needs no shifting -- O(1). That is what makes a list a good stack."))
            elif name in self._METHODS:
                cost, why = self._METHODS[name]
                out.append((1, f"**About `.{name}()` -- {cost}:** `{recv}.{name}(...)` {why}"))
                if in_loop and cost.startswith("O(n") and name not in ("sort",):
                    out.append((0, f"**Inside a loop, this multiplies:** `.{name}()` costs {cost} *per call*, and it runs once per pass of the loop around it. n passes x {cost} = a hidden extra factor of n -- this is the kind of line that quietly turns an O(n) idea into O(n^2)."))
            elif isinstance(func.value, ast.Name) and func.value.id in user_funcs:
                pass
        elif isinstance(func, ast.Name):
            name = func.id
            if name in user_funcs:
                k = facts["recursive"].get(name, 0)
                rec_here = name == self._shape.enclosing_function(line_no)
                if rec_here:
                    out.append((1, f"**A call to itself:** `{name}` calls `{name}` here -- recursion. Each call should work on a *smaller* piece of the problem, with a base case that stops the chain; the number of calls this line triggers is what sets the total cost."))
                else:
                    out.append((1, f"**Calling your own function:** `{name}(...)` costs whatever `{name}`'s body costs, every time it is called. Read the lines inside `{name}` to see that cost -- then multiply by how many times *this* line runs (loops around it repeat the whole call)."))
            elif name in self._FUNCS:
                cost, why = self._FUNCS[name]
                out.append((1, f"**About `{name}()` -- {cost}:** `{_src(call, 35)}` {why}"))
                if in_loop and cost.startswith("O(n") :
                    out.append((0, f"**Inside a loop, this multiplies:** `{name}(...)` costs {cost} on its own and is re-run on every pass -- n passes x {cost}. If the argument does not change between passes, compute it once *before* the loop."))
        return out

    def _t_call(self, call: ast.Call, line_no: int) -> List[Note]:
        return self._call_facts_time(call, line_no) + self._t_call_args(call)

    def _t_call_args(self, call: ast.Call) -> List[Note]:
        out: List[Note] = []
        for a in call.args:
            if isinstance(a, ast.Call) and isinstance(a.func, ast.Name) and a.func.id not in ("len", "range", "print", "str", "int", "float", "abs", "min", "max", "sum") :
                out.append((2, f"**Inner calls run first:** in `{_src(call, 40)}`, Python evaluates the inner call `{_src(a, 25)}` BEFORE the outer one, so the line's cost is the inner cost plus the outer cost."))
                break
        return out

    def _t_comprehension(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        gens = node.generators
        kind = {ast.ListComp: "list", ast.SetComp: "set", ast.DictComp: "dict", ast.GeneratorExp: "generator"}[type(node)]
        nested = len(gens) > 1
        filt = any(g.ifs for g in gens)
        iters = ", ".join(f"`{_src(g.iter, 22)}`" for g in gens)
        if nested:
            out.append((1, f"**A nested comprehension is a nested loop:** with {len(gens)} `for` clauses ({iters}) the expression runs once for every *combination* -- the clauses multiply, exactly like loops nested inside each other."))
        else:
            out.append((1, f"**A comprehension is a loop in disguise:** it visits every item of {iters} once and evaluates the expression each time -- same O(n) work as the equivalent `for` loop, just written in one line."))
        if filt:
            out.append((2, "**The filter does not skip the visiting:** an `if` at the end only decides which results are *kept*. Every source item is still examined, so the time follows the size of the source, not of the result."))
        if kind == "generator":
            out.append((1, "**Generators are lazy:** a generator expression computes each value only when asked, so building it costs O(1) up front and uses O(1) memory -- the loop work happens later, as it is consumed. Use it with `sum()`/`any()`/`join()` to avoid ever building the full list."))
        return out

    # ==================================================================
    # TIME: cross-cutting insights (any line)
    # ==================================================================
    def _cross_cutting_time(self, node, line_no: int, local_t: str, global_t: str) -> List[Note]:
        out: List[Note] = []
        loc, glo = parse_complexity(local_t), parse_complexity(global_t)
        enclosing = self._shape.enclosing_loops(line_no)
        scaling = [lp for lp in enclosing if lp.scales]
        l_norm, g_norm = str(local_t).replace(" ", ""), str(global_t).replace(" ", "")

        if loc is not None and glo is not None and l_norm != g_norm and scaling:
            if is_constant(loc):
                out.append((1, self.generator._v(
                    "**Where to optimize:** this line is already O(1) by itself, so making the line cheaper cannot help -- the only lever left is the loop structure around it (do fewer passes, stop early, or avoid the inner loop with a smarter data structure).",
                    "**What would actually speed this up:** not the line -- it is already a constant-time step. The total comes from how many times the surrounding loops repeat it, so only restructuring the loops (fewer passes, an early exit, a better data structure) can lower it.",
                    "**Cost = per-run cost x runs:** the per-run part is as small as it gets (O(1)), so all the room for improvement is in the *runs* part -- the loops that repeat this line.",
                )))
            else:
                out.append((1, f"**Two levers, one multiplier:** the total `{global_t}` is this line's own cost `{local_t}` times how often the loops repeat it. You can attack either factor -- cheaper line (a better built-in or data structure) or fewer repetitions (restructure the loops). Fixing the line's own cost usually pays off most when it is the larger factor."))
        elif loc is not None and not is_constant(loc) and not scaling and not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.For, ast.AsyncFor, ast.While, ast.If)):
            out.append((2, f"**Not inside a loop, but still not free:** nothing repeats this line, yet it costs `{local_t}` because the work is hidden *inside* the operation itself (a scan, a copy, or a sort). A single line can be a whole loop in disguise -- cost is about what the operation does, not about how many lines it takes."))
        elif loc is not None and is_constant(loc) and not enclosing and glo is not None and is_constant(glo) and isinstance(node, (ast.Assign, ast.AugAssign, ast.Return, ast.Expr)):
            out.append((2, self.generator._v(
                "**Constants add up to a constant:** a fixed number of O(1) lines in a row is still O(1) -- Big-O drops constant factors, so five cheap statements cost the same *class* as one. Only a line that repeats, or whose work grows with the input, can change the complexity class.",
                "**Why a flat line is not the bottleneck:** this statement does a fixed amount of work, so on its own it can never decide the algorithm's complexity. To find what does, look for the lines that sit inside loops or recursion, or that scan/copy/sort a whole collection.",
                "**Cheap now, but context matters:** O(1) here describes this line in isolation. If someone later moves it inside a loop, it runs n times and becomes O(n) in total -- cost is always (cost per run) x (number of runs).",
            )))
        return out

    def _observed_time(self, node, line_no: int, hits: int) -> List[Note]:
        out: List[Note] = []
        if not self._ran() or hits <= 0:
            return out
        if isinstance(node, (ast.For, ast.AsyncFor)) and node.body:
            first = node.body[0]
            early = any(isinstance(x, (ast.Break, ast.Return)) for st in node.body for x in ast.walk(st))
            nested_first = isinstance(first, _LOOPS)
            body_hits = self._hits_at(first)
            if nested_first:
                # the first body line is another loop header, so its count mixes in that loop's
                # own final checks -- only the outermost loop can be read directly
                if not self._shape.enclosing_loops(line_no) and not early and hits > 1:
                    out.append((1, f"**What the count tells you:** this header was visited {hits} time(s). A `for` header is visited once per pass PLUS one final \"no more items\" check, so this loop made {hits - 1} pass(es) -- and each of those passes ran the whole loop nested inside it."))
            elif body_hits > 0:
                starts = hits - body_hits
                if early and hits == body_hits:
                    out.append((1, f"**Your test left this loop early:** the header and the body each ran {hits} time(s). A loop that finishes normally has one MORE header visit (the final \"no more items\" check), so the missing one means a `break`/`return` fired after {body_hits} pass(es). That is the best case at work -- on input where the exit never fires you would see the full count."))
                elif starts == 1:
                    out.append((1, f"**What the count tells you:** the header ran {hits} time(s) and the first body line ran {body_hits}. A `for` header is visited once per pass PLUS one final time when the iterator runs out, so {body_hits} real passes -> {hits} header visits. Counting passes this way is how the profiler turns Big-O into evidence."))
                elif starts > 1 and not early:
                    out.append((1, f"**What the count tells you:** {hits} header visits and {body_hits} passes in total. Every start of a loop ends with one extra final check, so this loop was *started* {starts} times (once per pass of whatever repeats it) and averaged about {body_hits / starts:.1f} pass(es) per start. Total work = (number of starts) x (passes per start) -- exactly the multiplication Big-O describes."))
        elif isinstance(node, ast.While) and node.body:
            body_hits = self._hits_at(node.body[0])
            early = any(isinstance(x, (ast.Break, ast.Return)) for st in node.body for x in ast.walk(st))
            if body_hits > 0 and hits >= body_hits:
                if hits == body_hits and early:
                    out.append((1, f"**Your test left this loop early:** the condition was tested {hits} time(s) and the body started {hits} time(s). A loop that ends because its condition turns false has one extra, final test -- so the missing one means a `break`/`return` ended it after {body_hits} pass(es), before the condition ever failed."))
                elif hits == body_hits + 1:
                    out.append((1, f"**What the count tells you:** the condition was tested {hits} time(s) and the body started {body_hits} time(s). A `while` test runs once per pass plus one final time when it turns false, so there were {body_hits} passes."))
                else:
                    out.append((1, f"**What the count tells you:** the condition was tested {hits} time(s) and the body started {body_hits} time(s) -- if the loop sits inside something that repeats, each fresh start adds its own final test."))
        elif hits > 1 and not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.If, ast.With, ast.AsyncWith, ast.Try)):
            out.append((2, f"**What the count tells you:** this line executed {hits} times, so it sits inside something that repeats. If you feed the program an input twice as large and this number roughly doubles, the line scales linearly; if it quadruples, it scales quadratically -- that experiment is Big-O made visible."))
        return out

    def _reality_check(self, local_t: str, global_t: str, line_no: int) -> List[Note]:
        t = parse_complexity(global_t)
        if t is None:
            return []
        if is_constant(t):
            return [(2, self.generator._v(
                "**Why O(1) is great:** a ten-item input and a million-item input take the same number of steps here, so this line is never what makes a big input slow.",
                "**Scale check:** with 10 items or 10 billion, this line does the same few operations. Look at the lines whose cost grows with n instead.",
                "**What O(1) means:** the number of steps stays the same as n grows, so this line is never the slow part.",
            ))]
        n_ok = _feasible_n(t)
        if t.kind in ("exp", "fact"):
            n_txt = f"only up to about n = {n_ok}" if n_ok else "only for tiny n"
            big = 40 if t.kind == "exp" else 20
            secs = evaluate(t, big) / OPS_PER_SECOND
            return [(2, f"**How big can n get?** A computer does very roughly 10 million simple steps per second. At `{global_t}` that only lasts {n_txt}; at n = {big} it needs about {_fmt(evaluate(t, big))} steps ({_fmt_time(secs)}). A faster computer will not fix this -- a better algorithm will (e.g. saving answers or skipping dead ends).")]
        ref = 100_000 if (t.kind == "poly" and t.poly >= 2) else 1_000_000
        steps = evaluate(t, ref)
        secs = steps / OPS_PER_SECOND
        limit_txt = f"stays within about a second up to roughly n = {n_ok:,}" if n_ok else "is fast at any size you would realistically use"
        return [(2, self.generator._v(
            f"**How big can n get?** A computer does very roughly 10 million simple steps per second, so `{global_t}` {limit_txt}. At n = {ref:,} that is about {_fmt(steps)} steps ({_fmt_time(secs)}). This is a rough guide, not a benchmark.",
            f"**What this means for real inputs:** at about 10 million simple steps a second, `{global_t}` {limit_txt}. At n = {ref:,} expect about {_fmt(steps)} steps ({_fmt_time(secs)}).",
            f"**Will it be fast enough?** Rule of thumb: about 10 million basic steps per second. For `{global_t}` that {limit_txt}; at n = {ref:,} expect about {_fmt(steps)} steps, or {_fmt_time(secs)}.",
        ))]

    # ==================================================================
    # SPACE
    # ==================================================================
    def _s_for(self, node) -> List[Note]:
        out: List[Note] = []
        it = node.iter
        tgt = _src(node.target, 20)
        out.append((1, f"**What the loop itself keeps:** just the loop variable `{tgt}` (one reference that is reassigned each pass) and a small iterator object that remembers its position -- O(1) space. The previous value of `{tgt}` is released as soon as the next one replaces it."))
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name):
            fn = it.func.id
            if fn == "range":
                out.append((1, "**`range` is lazy:** it stores only start, stop and step and computes each number on demand, so `range(1_000_000)` uses the same tiny memory as `range(10)`. (In Python 2 this built a full list -- a common source of old advice.)"))
            elif fn in ("sorted", "list", "set", "tuple"):
                out.append((0, f"**The header builds a full copy:** `{_src(it, 35)}` creates a complete new {fn if fn != 'sorted' else 'sorted list'} BEFORE the loop starts and keeps it alive until the loop ends -- O(n) extra memory. Looping over the original directly avoids it when you do not need the copy."))
            elif fn in ("enumerate", "zip", "reversed", "map", "filter"):
                out.append((1, f"**`{fn}` streams its items:** it hands over one item per pass instead of building a list, so it adds only O(1) memory no matter how long the input is."))
        elif isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr in ("items", "keys", "values"):
            out.append((1, "**Views, not copies:** `.items()` / `.keys()` / `.values()` return lightweight windows onto the dictionary -- O(1) extra memory. (Wrapping them in `list(...)` would copy everything, O(n).)"))
        elif isinstance(it, ast.Subscript) and isinstance(it.slice, ast.Slice):
            out.append((0, f"**Looping over a slice copies it first:** `{_src(it, 30)}` allocates a new list of the selected items before the first pass. If you only need to read them, use index bounds or `itertools.islice` to avoid the copy."))
        return out

    def _s_if(self, node) -> List[Note]:
        out: List[Note] = []
        for x in ast.walk(node.test):
            if isinstance(x, ast.Call) and isinstance(x.func, ast.Name) and x.func.id in ("set", "list", "sorted", "tuple", "dict"):
                out.append((0, f"**A hidden temporary:** `{_src(x, 30)}` inside the condition builds a whole new {x.func.id} every time the test runs, uses O(n) memory for it, and throws it away straight after. Build it once before the loop instead."))
                break
            if isinstance(x, ast.Subscript) and isinstance(x.slice, ast.Slice):
                out.append((1, f"**A slice in the test:** `{_src(x, 30)}` copies the selected items into a temporary list just to compare them, then discards it -- O(k) memory for k items, every time the test runs."))
                break
        out.append((1, "**What a test costs in memory:** evaluating a simple comparison only creates short-lived temporaries (a boolean and maybe a number) that vanish immediately -- O(1). Branching moves execution around; it does not store anything."))
        return out

    def _s_funcdef(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        name = node.name
        facts = self._shape.recursion_facts()
        out.append((1, f"**Frames are the memory of a call:** each time `{name}` runs, Python creates a *frame* holding its parameters and local variables. That frame lives until the call returns, so the memory you see is (size of one frame) x (how many calls are alive at the same moment)."))
        if name in facts["recursive"]:
            out.append((0, f"**Recursion depth is memory:** `{name}` calls itself, so every call that is still waiting for its inner call keeps its frame on the stack. If the recursion goes n levels deep, that is n frames -> O(n) stack space even when each frame is tiny. Python also stops at about 1,000 nested calls (RecursionError) -- an iterative version avoids both limits."))
        out.append((2, f"**Input space is not counted:** when we say `{name}` uses O(1) space, we mean *auxiliary* space -- the extra memory the function creates. The arguments handed in already exist (they are passed by reference, not copied), so they are not charged to this function."))
        return out

    def _s_return(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        val = node.value
        if isinstance(val, ast.Name):
            out.append((1, f"**Returning does not copy:** `return {val.id}` passes back a reference to the existing object, so no new memory is allocated. If the function built `{val.id}` earlier, THAT line is where the space cost was paid."))
        elif isinstance(val, (ast.ListComp, ast.SetComp, ast.DictComp)):
            out.append((1, "**The result is built here:** the comprehension in `return` creates the whole new collection in memory at once -- O(size of the result). If the caller only needs to loop over it once, a generator (`yield` or a generator expression) would need O(1)."))
        elif isinstance(val, ast.Subscript) and isinstance(val.slice, ast.Slice):
            out.append((1, f"**Returning a slice copies:** `{_src(val, 30)}` builds a new object holding the selected items, so memory grows with the slice length."))
        elif isinstance(val, ast.Constant):
            out.append((1, f"**Nothing to allocate:** `return {_src(val, 15)}` hands back a small constant that already exists -- O(1)."))
        fn = self._shape.enclosing_function(line_no)
        if fn and fn in self._shape.recursion_facts()["recursive"]:
            out.append((1, f"**Returning frees a frame:** when this `return` runs, the frame for this call of `{fn}` is released. The stack is at its tallest just before the base case returns, and then it unwinds -- peak memory is the deepest point, not the sum over all calls."))
        return out

    def _s_assign(self, node, line_no: int) -> List[Note]:
        out: List[Note] = []
        tgt = node.targets[0]
        if isinstance(tgt, ast.Tuple) and isinstance(node.value, ast.Tuple):
            if {_src(e, 80) for e in tgt.elts} == {_src(e, 80) for e in node.value.elts}:
                out.append((1, "**A swap needs no new storage:** the two values are exchanged by re-pointing names/slots, using only a tiny temporary pair. That is what 'in place' means -- O(1) extra memory however long the list is."))
                return out
        out += self._s_value(node.value, line_no, target=tgt)
        return out

    def _s_value(self, value, line_no: int, target=None) -> List[Note]:
        out: List[Note] = []
        tname = _src(target, 18) if target is not None else "the result"
        in_loop = bool(self._shape.enclosing_loops(line_no))
        if isinstance(value, ast.Constant) and not isinstance(value.value, str):
            out.append((1, f"**One small number:** `{tname}` is just a name pointing at a single number -- a fixed, tiny amount of memory no matter how big the input is. (Python even reuses the same small-integer objects.)"))
        elif isinstance(value, ast.Constant):
            out.append((1, f"**A fixed string:** the literal text is stored once and `{tname}` points at it -- a constant amount, since it does not depend on the input."))
        elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "len":
            out.append((1, f"**One integer:** `len(...)` returns a number that is already stored, and `{tname}` holds just that one number -- O(1). Remember the *list* it measured is not copied."))
        elif isinstance(value, (ast.List, ast.ListComp)):
            what = "list literal" if isinstance(value, ast.List) else "list comprehension"
            out.append((1, f"**A new list is allocated:** a {what} reserves a block of memory for its elements -- roughly one pointer (8 bytes) per slot plus whatever the items themselves occupy. For n items that is O(n), and it stays alive as long as `{tname}` (or anything else) refers to it."))
        elif isinstance(value, (ast.Dict, ast.DictComp, ast.Set, ast.SetComp)):
            out.append((1, f"**A hash table is allocated:** dicts and sets keep spare empty slots so lookups stay fast, so they typically use noticeably MORE memory per item than a list does -- still O(n), but with a bigger constant. That is the price of O(1) lookups."))
        elif isinstance(value, ast.Subscript) and isinstance(value.slice, ast.Slice):
            out.append((0, f"**A slice allocates a copy:** `{_src(value, 30)}` creates a separate new object, so the memory is O(k) for k copied items -- the original is untouched but now there are two. Index bounds avoid the copy."))
        elif isinstance(value, ast.Subscript):
            out.append((1, f"**No new container:** reading `{_src(value, 28)}` fetches a reference to an item that already exists -- O(1). Nothing is copied."))
        elif isinstance(value, ast.BinOp) and isinstance(value.op, ast.Add) and (self._looks_list(value.left) or self._looks_list(value.right)):
            out.append((0, f"**`+` allocates a brand-new list:** `{_src(value, 32)}` copies both operands into fresh memory (O(len(a) + len(b))), and the old lists are freed only afterwards -- so there is a moment when old and new coexist. `.extend()` / `.append()` grow the list in place."))
        elif isinstance(value, ast.BinOp) and isinstance(value.op, ast.Mult) and (isinstance(value.left, ast.List) or isinstance(value.right, ast.List)):
            out.append((1, f"**Pre-allocation:** `{_src(value, 28)}` reserves all n slots immediately -- O(n) memory, committed up front rather than grown gradually. Good when you know the final size (no repeated resizing), wasteful if most slots stay unused."))
        elif isinstance(value, ast.BinOp):
            out.append((1, "**A single number:** the arithmetic result is one new small number object -- O(1). Temporaries from the calculation vanish the instant nothing refers to them."))
        elif isinstance(value, ast.Name) and isinstance(target, ast.Name):
            out.append((1, f"**No new memory at all:** `{tname} = {value.id}` only attaches a second name to the existing object -- there is still just one object in memory. (Memory would grow only if you made a real copy with `.copy()` or `[:]`.)"))
        elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("sorted", "list", "set", "tuple", "dict", "Counter", "deque"):
            out.append((1, f"**`{value.func.id}(...)` builds a new container:** a complete new object holding the items -- O(n) extra memory, separate from the original."))
        elif isinstance(value, ast.Call) and isinstance(value.func, ast.Attribute) and value.func.attr in ("split", "copy", "keys", "values", "items", "join"):
            m = value.func.attr
            msg = {
                "split": "builds a list of the pieces -- O(n) memory for n characters of text",
                "copy": "creates a second, independent container -- O(n) memory",
                "keys": "returns a view, not a copy -- O(1) memory",
                "values": "returns a view, not a copy -- O(1) memory",
                "items": "returns a view, not a copy -- O(1) memory",
                "join": "allocates ONE string for the final result -- O(total length), with no intermediate copies",
            }[m]
            out.append((1, f"**About `.{m}()`:** it {msg}."))
        elif isinstance(value, ast.GeneratorExp):
            out.append((1, "**A generator holds almost nothing:** it stores just enough state to produce the next value (O(1)). The items are created one at a time, on demand."))
        if in_loop and isinstance(target, ast.Name) and isinstance(value, (ast.List, ast.ListComp, ast.Dict, ast.Set, ast.DictComp, ast.SetComp)):
            out.append((1, f"**Peak, not total:** this line creates a new container on every pass, but `{tname}` is re-pointed each time, so the previous one is freed (nothing else refers to it). The space complexity measures what is alive *at once* -- here one container -- not the sum of everything ever created."))
        return out

    def _s_augassign(self, node) -> List[Note]:
        tgt = node.target
        tname = _src(tgt, 18)
        kind = self._var_type(tgt.id) if isinstance(tgt, ast.Name) else None
        if isinstance(node.op, ast.Add) and kind == "list":
            return [(1, f"**Grows the list in place:** `{tname} += ...` extends the existing list, so memory grows only by the items you add (plus occasional spare capacity) -- no second full copy is made.")]
        if isinstance(node.op, ast.Add) and kind == "str":
            return [(0, f"**A new string every time:** strings cannot grow in place, so `{tname} += ...` allocates a fresh string and frees the old one. Peak memory is about twice the string length for a moment, on every pass.")]
        if isinstance(tgt, ast.Subscript):
            return [(1, "**No new storage:** the update overwrites an existing slot (or adds one dictionary entry) -- O(1) extra memory per run, unless it inserts a brand-new key.")]
        return [(1, f"**One number, replaced:** `{tname}` is overwritten with the new value and the old one is released -- the memory used stays constant no matter how many times this runs. That is why accumulators are O(1) space.")]

    def _s_call(self, call: ast.Call) -> List[Note]:
        out: List[Note] = []
        func = call.func
        name = func.attr if isinstance(func, ast.Attribute) else (func.id if isinstance(func, ast.Name) else "")
        table = {
            "append": "grows the list by one slot. Python over-allocates a little spare room (so most appends need no new memory) and occasionally copies into a bigger block -- the list's memory tracks its length, O(n) overall.",
            "extend": "grows the list by k slots for k incoming items -- memory follows the number of items added.",
            "add": "inserts into the hash table; a duplicate adds nothing, so a set's memory depends on the number of *distinct* items.",
            "pop": "releases one slot (a list that shrinks may keep spare capacity until it is resized).",
            "sort": "rearranges the list in place -- no second list. (Timsort may borrow up to n/2 temporary space while merging, but the result lives in the original list.)",
            "reverse": "swaps items in place -- O(1) extra memory.",
            "insert": "grows the list by one slot after shifting items -- no copy of the whole list.",
            "remove": "frees one slot after shifting items -- no copy of the whole list.",
            "join": "allocates a single result string of the combined length -- O(total characters), with no intermediate strings.",
            "split": "creates a list of new string pieces -- O(n) memory.",
            "copy": "allocates a second container of the same size -- doubling the memory held for this data.",
            "heappush": "adds one item to the heap's underlying list -- O(1) extra memory beyond the item.",
            "heappop": "removes one item from the heap's underlying list.",
            "appendleft": "grows the deque by one item at the front.",
            "popleft": "releases one item from the front of the deque.",
            "update": "adds the incoming entries into the container -- memory grows by the number of *new* entries.",
        }
        if name in table:
            out.append((1, f"**What `.{name}()` does to memory:** `{_src(call, 35)}` {table[name]}"))
        elif name in ("print",):
            out.append((1, "**Output is not stored:** `print` formats the text, hands it to the console, and releases it -- O(length of the text) for a moment, nothing retained."))
        elif name in ("sorted",):
            out.append((1, "**`sorted()` allocates a second list:** the original is untouched and a new sorted copy is built -- O(n) extra memory. `.sort()` rearranges in place instead."))
        elif name:
            fn = name
            if fn in {f.name for f in self._shape._func_nodes}:
                out.append((1, f"**Calling `{fn}` creates a frame:** the call needs space for `{fn}`'s parameters and locals until it returns. If `{fn}` builds data, that memory is accounted on `{fn}`'s own lines."))
        return out

    def _s_comprehension(self, node) -> List[Note]:
        if isinstance(node, ast.GeneratorExp):
            return [(1, "**Constant memory:** a generator expression produces one value at a time instead of storing them all, so it holds O(1) at any moment -- ideal when you only need to loop over or aggregate the results once.")]
        kind = {ast.ListComp: "list", ast.SetComp: "set", ast.DictComp: "dict"}[type(node)]
        nested = len(node.generators) > 1
        extra = " With more than one `for` clause the result can have as many items as the *product* of the sources, so memory can reach O(n^2)." if nested else ""
        return [(1, f"**The whole {kind} is built in memory at once:** every result is stored before the line finishes, so space is O(size of the result).{extra} If you will only loop over the results once, swapping the brackets for parentheses `(...)` gives a generator that needs O(1).")]

    def _cross_cutting_space(self, node, line_no: int, local_s: str, global_s: str, mem_state: Optional[dict]) -> List[Note]:
        out: List[Note] = []
        loc, glo = parse_complexity(local_s), parse_complexity(global_s)
        if loc is not None and glo is not None and is_constant(glo):
            touched = [n for n in sorted(_names(node)) if self._var_type(n) in ("list", "dict", "set", "str", "tuple")
                       or (mem_state and mem_state.get(n, {}).get("size", 0) > 1)]
            if touched:
                nm = touched[0]
                out.append((2, self.generator._v(
                    f"**Using, not building:** this line works with the existing collection `{nm}` but does not create a new one, so no extra memory that scales with n is allocated here. Space complexity charges you for what you BUILD (copies, new lists, caches), not for data you merely read or modify in place.",
                    f"**Reading is free, building is not:** `{nm}` already exists in memory, so touching it here adds only a fixed amount of bookkeeping. Memory would grow only if this line made a copy, a slice, or a brand-new container.",
                )))
            else:
                out.append((2, self.generator._v(
                    "**Auxiliary space:** space complexity counts the *extra* memory your algorithm needs, not the input it was handed. Reading and comparing existing values (indices, counters, flags) adds only a fixed amount, which is why it stays O(1) however large the input grows.",
                    "**Why memory stays flat here:** the variables involved hold single values (numbers, positions, flags). However big the input gets, you still only need a fixed handful of them -- no structure grows with n.",
                    "**Space is about what is kept alive:** nothing on this line accumulates. Each value is replaced or discarded as the program moves on, so peak memory does not rise with the input size.",
                )))
        elif glo is not None and not is_constant(glo):
            out.append((2, f"**Why this matters:** memory that grows like `{global_s}` has to fit in RAM all at once. As a yardstick, a Python list costs about 8 bytes per slot plus the items themselves, so a million-item structure is already tens of megabytes. The faster the growth class, the sooner memory -- not time -- becomes the limit."))
        return out
