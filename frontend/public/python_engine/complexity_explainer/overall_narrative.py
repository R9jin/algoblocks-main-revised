"""
Overall Narrative

Builds the final whole-algorithm narrative -- the NLG counterpart of the
Master Theorem Assigner and Efficiency Evaluator stages of the manuscript's
Complexity Analysis Model:

  * WHY the algorithm costs what it costs, naming the learner's own loops,
    recursion and data structures (not a generic family blurb),
  * the worst-case construct (the single line that sets the growth rate),
  * a worked derivation ("Working Through the Math"): the loop-product view,
    the recurrence + Master Theorem, or the line-by-line sum,
  * what the numbers mean in practice (scaling at n = 10 / 100 / 1000),
  * concrete, signal-driven suggestions for improving it.
"""
import re
from typing import Any, Dict, List, Optional

from complexity_explainer.explanation_signals import BigOInfo, PatternSignals
from complexity_explainer.growth_insight import (
    parse_complexity, is_constant, scaling_line, doubling_effect, growth_word,
)
from complexity_explainer.notation_insight import notation_card, reduce_tip, classify_notation
from complexity_explainer import paradigm_detector
from complexity_explainer.statement_narrator import walkthrough

_HIERARCHY = ["1", "log min", "log", "sqrt", "n", "m", "V", "V + E", "n log n", "n^2", "n * m", "n^3", "2^n", "3^n", "n!", "n * n!"]


class OverallNarrative:
    """Whole-algorithm narrative + recurrence solving. Composed into
    EducationalInsightGenerator as `self.overall_narrative`; reads shared
    state and sibling components via `self.generator`."""

    def __init__(self, generator):
        self.generator = generator

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def generate_overall_analysis(self, final_time: str, final_space: str, sig: PatternSignals, details: List[Dict]) -> str:
        gen = self.generator
        gen._seed = f"overall:{final_time}:{final_space}"
        sig = self._augment_signals(sig)
        t_info = gen.variable_explanations._classify_big_o(final_time)
        s_info = gen.variable_explanations._classify_big_o(final_space)

        live = self._live_details(details)
        dominant = self._dominant_constructs(live)

        time_narrative = self._build_overall_time_narrative(t_info, sig, final_time, dominant)
        time_simp = self._build_real_simplification(details, "global_time", final_time, is_time=True, sig=sig, dominant=dominant)

        space_narrative = self._build_overall_space_narrative(s_info, sig, final_space, live)
        space_simp = self._build_real_simplification(details, "global_space", final_space, is_time=False, sig=sig, dominant=dominant)

        improve = self._build_improvement_section(t_info, s_info, sig)
        static_note = self._static_only_note()
        summary = self._build_complexity_summary(t_info, s_info, sig, final_time, final_space, dominant)

        try:
            approach = paradigm_detector.describe(paradigm_detector.detect(gen.shape.tree, final_time))
        except Exception:
            approach = ""
        approach_md = ("#### Type of Algorithm\n" + approach + "\n\n") if approach else ""
        try:
            steps_txt = walkthrough(gen.shape.tree, pick=gen._v)
        except Exception:
            steps_txt = ""
        approach_md += ("#### How the Code Works\n" + steps_txt + "\n\n") if steps_txt else ""

        md = (
            "### Overall Complexity Analysis\n\n"
            + approach_md +
            "#### Overall Time Complexity\n"
            f"{time_narrative}\n\n"
            "**Working Through the Math**\n"
            f"{time_simp}\n\n"
            "#### Overall Space Complexity\n"
            f"{space_narrative}\n\n"
            "**Working Through the Math**\n"
            f"{space_simp}\n\n"
        )
        if improve:
            md += "#### What You Could Improve\n" + improve + "\n\n"
        md += "#### In Short\n" + summary
        if static_note:
            md += "\n\n" + static_note
        return md

    def _static_only_note(self) -> str:
        """If the test run never got past the `def` lines, say once (here) that
        no execution counts exist, instead of on every single line."""
        ctx = self.generator.ctx
        td = getattr(ctx, "trace_data", None) or {}
        hits = td.get("line_hits") or {}
        if not hits:
            return ""
        if self.generator.variable_explanations._tracer_ran():
            return ""
        return ("*Profiler verified* your last test run never called your function(s), so there are no execution counts to show. "
                "That's fine: this analysis is static -- it reads the structure of your code and never needs to run it.")

    def _augment_signals(self, sig: PatternSignals) -> PatternSignals:
        """The whole-program visitor runs when no function is 'current', so it can't
        see recursion or caching. Read those two facts statically from the source."""
        import copy
        facts = self.generator.shape.recursion_facts()
        ctx_memo = set(getattr(self.generator.ctx, "memoized_funcs", set()) or set())
        sig = copy.copy(sig)
        rec = facts["recursive"]
        if rec:
            sig.has_recursion = True
            self._branching = max(rec.values())
            if (facts["memoized"] | (ctx_memo & set(rec))):
                sig.has_memoization = True
        else:
            self._branching = 0
        return sig

    # ------------------------------------------------------------------
    # Worst-case construct identification
    # ------------------------------------------------------------------
    @staticmethod
    def _live_details(details: List[Dict]) -> List[Dict]:
        skip = {"Definition", "Dead Code", "Comment / Docstring"}
        return [d for d in details if d.get("color") != "#7f8c8d" and d.get("operation", "") not in skip]

    def _dominant_constructs(self, live: List[Dict]) -> List[Dict]:
        """The line(s) with the highest growth weight -- what the manuscript calls
        the worst-case construct. Ties keep source order; at most 2 are named."""
        if not live:
            return []
        top = max(d.get("weight", -1) for d in live)
        if top <= 0:
            return []
        picks = [d for d in live if d.get("weight", -1) == top]
        rec_names = set(self.generator.shape.recursion_facts()["recursive"])

        def rank(d):
            code = str(d.get("lineOfCode", ""))
            calls_itself = any(f"{n}(" in code for n in rec_names)
            is_loop = d.get("operation") == "Loop"
            # a line that makes the recursive call, then a loop header, then the deepest line
            return (0 if calls_itself else 1, 0 if is_loop else 1, -int(d.get("indent", 0) or 0))

        picks.sort(key=rank)
        return picks[:2]

    @staticmethod
    def _dominant_local_constant(dominant: List[Dict]) -> bool:
        if not dominant or dominant[0].get("operation") == "Loop":
            return True
        t = parse_complexity(str(dominant[0].get("local_time", "O(1)")))
        return t is None or (t.kind == "poly" and t.poly == 0 and t.log == 0)

    @staticmethod
    def _cite(d: Dict) -> str:
        code = str(d.get("lineOfCode", "")).strip()
        if len(code) > 60:
            code = code[:57] + "..."
        return f"line {d.get('lineno')} (`{code}`)"

    # ------------------------------------------------------------------
    # Derivations
    # ------------------------------------------------------------------
    def _build_real_simplification(self, details, key, final_complexity, is_time, sig=None, dominant=None) -> str:
        valid_ops, recurrence = [], None
        for d in details:
            if d.get("color") != "#7f8c8d" and d.get("operation", "") not in ["Definition", "Dead Code", "Comment / Docstring"]:
                val = str(d.get(key, "O(1)"))
                valid_ops.append(val)
                if "T(n) =" in val or "T(n)=" in val:
                    recurrence = val

        prefix = "T(n)" if is_time else "S(n)"

        if sig is not None and is_time and sig.has_recursion and sig.has_memoization:
            return self._solve_memoized(final_complexity, prefix, recurrence)
        if recurrence and is_time:
            return self._solve_recurrence_manually(recurrence, final_complexity, prefix)
        if sig is not None and not is_time and sig.has_recursion and not is_constant(parse_complexity(final_complexity)):
            return self._solve_stack_space(final_complexity, prefix)
        return self._solve_iterative_manually(valid_ops, final_complexity, prefix, is_time, dominant or [])

    def _solve_memoized(self, final_complexity: str, prefix: str, recurrence: Optional[str]) -> str:
        steps = []
        if recurrence:
            steps.append(f"**Step 1: Start from the recurrence with no cache**\nThe raw recursive shape is:\n`{recurrence}`\n")
        else:
            steps.append("**Step 1: Look at the recursion without a cache**\nThe function calls itself more than once per call, so on its own the call tree would branch and grow exponentially.\n")
        steps.append("**Step 2: Notice the repeated subproblems**\nThe branches keep asking for the *same* inputs. The cache lets each distinct input be computed once; every later request is just a lookup.\n")
        steps.append("**Step 3: Count distinct subproblems**\nIf the input value is `n`, there are about `n` distinct subproblems (`0, 1, ..., n`).\n")
        steps.append("**Step 4: Multiply by the work per subproblem**\nEach subproblem does O(1) work of its own once its smaller answers are cached: `n x O(1)`.\n")
        steps.append(f"**Final answer:**\n`{prefix} = {final_complexity}`\n")
        return "\n".join(steps)

    def _solve_stack_space(self, final_complexity: str, prefix: str) -> str:
        return "\n".join([
            "**Step 1: Find the deepest chain of unfinished calls**\nMemory is held by every call that has started but not yet returned. The deepest such chain sets the peak.\n",
            "**Step 2: Multiply depth by frame size**\nEach frame stores a few variables -- O(1). With a chain about `n` calls deep, that's `n x O(1)`.\n",
            f"**Final answer:**\n`{prefix} = {final_complexity}`\n",
        ])

    def _solve_recurrence_manually(self, relation: str, final_complexity: str, prefix: str) -> str:
        steps = [f"**Step 1: Write down the recurrence**\nThe recursive calls in this code follow this pattern:\n`{relation}`\n"]

        if "T(n/2)" in relation:
            a = "2" if "2T" in relation else "1"
            b = "2"
            fn = "O(n)" if "+ O(n)" in relation else "O(1)"
            steps.append(f"**Step 2: Match it to the divide-and-conquer form**\nThis fits `{prefix} = a*{prefix}(n/b) + f(n)`, where:\n- `a` = {a} (how many subproblems each call makes)\n- `b` = {b} (how much smaller each subproblem is)\n- `f(n)` = {fn} (work done outside the recursive calls)\n")
            crit = "n" if a == "2" else "1"
            steps.append(f"**Step 3: Compare the growth rates**\nThe recursion alone contributes `n^(log_{b}({a}))` = `{crit}`. We compare that with `f(n)` = `{fn}`.\n")

            if a == "2" and fn == "O(n)":
                steps.append("**Step 4: Apply the Master Theorem**\nBoth grow at the same rate -- Case 2, so we gain a `log n` factor. Picture it as a tree: about `log n` levels, and every level does about `n` total work (n/2 + n/2, then n/4 x 4, ...). `log n` levels x `n` work per level.\n")
            elif a == "2" and fn == "O(1)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n)` grows slower than the recursion's `n` -- Case 1: the leaves of the call tree dominate. There are about `n` leaves, each doing O(1) work.\n")
            elif a == "1" and fn == "O(1)":
                steps.append("**Step 4: Apply the Master Theorem**\nThe two rates match -- Case 2, so we gain a `log n` factor. Picture a single chain of calls that halves the problem each time: about `log n` calls, each doing O(1) work.\n")
            elif a == "1" and fn == "O(n)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n)` grows faster than the recursion's `1` -- Case 3: the work outside the recursion dominates. The first call does `n`, the next `n/2`, then `n/4`... which adds up to about `2n`, i.e. `O(n)`.\n")

        elif "T(n-1)" in relation and "T(n-2)" in relation:
            steps.append("**Step 2: Unroll the recursion tree**\nEvery call spawns two more: `T(n) -> T(n-1) + T(n-2)`.\n")
            steps.append("**Step 3: Count how the tree grows**\nThe tree is about `n` levels deep and roughly doubles in width at each level.\n")
            steps.append("**Step 4: Add it up**\n`2^0 + 2^1 + ... + 2^n` is exponential. (The tightest bound is about 1.618^n; Big-O reports the simpler upper bound `2^n`.) This is why naive recursive Fibonacci is so slow -- and why caching results fixes it.\n")

        elif "T(n-1)" in relation:
            fn = "O(n)" if "+ O(n)" in relation else ("O(log n)" if "+ O(log n)" in relation else "O(1)")
            multiplier = "n *" if "n * T" in relation else ""
            steps.append("**Step 2: Unroll the chain**\nThis is a straight chain of recursive calls, one level for each unit of `n`, so the call stack ends up `n` levels deep.\n")
            if multiplier:
                steps.append("**Step 3: Multiply across levels**\nThe work multiplies at each level (`n * (n-1) * (n-2) * ...`) -- exactly the definition of a factorial.\n")
            elif fn == "O(n)":
                steps.append("**Step 3: Add up the work at each level**\nAt the first level `n` work happens, then `n-1`, then `n-2`... Adding them (`n + (n-1) + ... + 1`) is an arithmetic series.\n")
                steps.append("**Step 4: Simplify the series**\nThat series sums to `n(n+1)/2`, which simplifies to `O(n^2)`.\n")
            else:
                steps.append(f"**Step 3: Multiply levels by cost**\nEach of the `n` levels does `{fn}` of work, so the total is `n` x `{fn}`.\n")
        else:
            steps.append("**Step 2: Work it out**\nThis recursion doesn't match one of the standard textbook shapes, so the engine matches it against known growth patterns directly.\n")

        steps.append(f"**Final answer:**\n`{prefix} = {final_complexity}`\n")
        return "\n".join(steps)

    def _loop_product(self, dominant: List[Dict], final_complexity: str) -> Optional[str]:
        """'Loop-product view': the dominant line's enclosing loops, multiplied.
        Returned only when the product really equals the reported complexity."""
        if not dominant:
            return None
        d = dominant[0]
        shape = self.generator.shape
        loops = shape.enclosing_loops(int(d.get("lineno", -1)), include_self=(d.get("operation") == "Loop"))
        scaling = [lp for lp in loops if lp.scales]
        halving = [lp for lp in loops if (not lp.scales) and "log n" in lp.bound]
        if not scaling and not halving:
            return None
        # a loop header's own repetitions are already counted via include_self
        loc = parse_complexity("O(1)" if d.get("operation") == "Loop" else str(d.get("local_time", "O(1)")))
        if loc is None or loc.kind != "poly":
            return None
        poly, log = len(scaling) + loc.poly, len(halving) + loc.log
        fin = parse_complexity(final_complexity)
        if fin is None or fin.kind != "poly" or fin.poly != poly or fin.log != log:
            return None  # would contradict the reported answer -- say nothing rather than mislead
        pieces = ["n"] * len(scaling) + ["log n"] * len(halving)
        local_txt = "O(1)" if d.get("operation") == "Loop" else str(d.get("local_time", "O(1)"))
        rows = "\n".join(f"- `{lp.header}` (line {lp.lineno}) -- it {lp.bound}" for lp in scaling + halving)
        return (
            f"**Step 1: Find the loops that repeat the busiest line**\nThe costliest line is {self._cite(d)}. These loops all repeat it:\n{rows}\n\n"
            f"**Step 2: Multiply their repetitions**\nLoops multiply because each pass of an outer loop runs the whole inner loop again:\n`T(n) = {' x '.join(pieces)} x {local_txt}`\n"
        )

    def _solve_iterative_manually(self, valid_ops: List[str], final_complexity: str, prefix: str, is_time: bool = True, dominant: Optional[List[Dict]] = None) -> str:
        steps = []
        if not valid_ops:
            return f"**Step 1:**\nThere's no meaningful cost to add up here.\n\n**Final answer:**\n`{prefix} = O(1)`\n"

        if is_time:
            product = self._loop_product(dominant or [], final_complexity)
            if product:
                return product + f"\n**Final answer:**\n`{prefix} = {final_complexity}`\n"

        steps.append("**Step 1: List each line's cost**\nWe take the worst-case cost of every executed line:\n")
        raw_terms = [t if t.startswith("O(") else f"O({t})" for t in valid_ops]
        steps.append(f"`{prefix} = " + " + ".join(raw_terms) + "`\n")

        counts: Dict[str, int] = {}
        for op in valid_ops:
            val = op.replace("O(", "").replace(")", "").strip()
            if val == "1 amortized":
                val = "1"
            counts[val] = counts.get(val, 0) + 1

        grouped = []
        for term, count in counts.items():
            if "T(" in term:
                grouped.append(f"{count} * {term}" if count > 1 else term)
            else:
                grouped.append(f"{count} * O({term})")
        steps.append("**Step 2: Group matching terms**\nCombine the terms that are the same order of growth:\n" + f"`{prefix} = " + " + ".join(grouped) + "`\n")

        repeated = [f"{c} *" for t, c in counts.items() if c > 1 and "T(" not in t]
        example = repeated[0] if repeated else None
        dropped = [t if "T(" in t else f"O({t})" for t in counts]
        if example:
            steps.append(f"**Step 3: Drop the constant multipliers**\nIn Big-O, a fixed number of repeats (here `{example}`) doesn't change the growth rate, so it's dropped:\n" + f"`{prefix} = " + " + ".join(dropped) + "`\n")
        else:
            steps.append("**Step 3: Check for constant multipliers**\nEach term appears once, so there is nothing to drop:\n" + f"`{prefix} = " + " + ".join(dropped) + "`\n")

        def rank(v):
            for i, h in enumerate(reversed(_HIERARCHY)):
                if h in v:
                    return len(_HIERARCHY) - i
            return -1

        ordered = sorted(dropped, key=rank, reverse=True)
        dom = ordered[0]
        if len(ordered) > 1:
            expl = "Comparing how fast each term grows as the input gets large:\n" + "".join(f"- `{dom}` grows faster than `{lo}`, so `{lo}` is dropped.\n" for lo in ordered[1:])
            steps.append(f"**Step 4: Keep only the fastest-growing term**\n{expl}\n`{prefix} = {dom}`\n")
        else:
            steps.append(f"**Step 4: Only one term to begin with**\nThere's nothing else to compare it against.\n`{prefix} = {dom}`\n")

        if dom.replace(" ", "") != final_complexity.replace(" ", ""):
            why = ("The per-line costs above are each line's *own* cost. The loops around a line repeat it, so the reported total"
                   if is_time else
                   "The per-line figures above are each line's own allocation. A structure that keeps growing as the code runs adds up across passes, so the peak")
            steps.append(f"**Step 5: Account for the surrounding structure**\n{why} settles at:\n`{prefix} = {final_complexity}`\n")
        else:
            steps.append(f"**Final answer:**\n`{prefix} = {final_complexity}`\n")
        return "\n".join(steps)

    # ------------------------------------------------------------------
    # Time narrative: decide the *cause*, then describe it with the learner's own code
    # ------------------------------------------------------------------
    def _hidden_cost_phrase(self, sig: PatternSignals) -> Optional[str]:
        cs, ms = sig.complexity_signals, sig.memory_signals
        if sig.membership_in_loop or cs.membership_in_list:
            return "an `in` check on a list, which scans it item by item"
        if cs.inefficient_list_pop:
            return "`pop(0)`, which shifts every remaining item"
        if cs.inefficient_list_insert:
            return "an insert at the front of a list, which shifts everything"
        if cs.repeated_sort:
            return "a sort, which is O(n log n) each time it runs"
        if cs.aggregation_in_loop:
            return "`sum()`/`max()`/`min()`, which re-scan the whole collection each call"
        if ms.string_concatenation_in_loop:
            return "string `+=`, which copies the whole string each pass"
        if ms.performs_slicing:
            return "a slice, which copies part of the sequence each pass"
        if cs.list_count_op:
            return "`.count()`, which scans the whole list"
        return None

    def _build_overall_time_narrative(self, t_info: BigOInfo, sig: PatternSignals, final_time: str, dominant: List[Dict]) -> str:
        gen, v = self.generator, self.generator._v
        family, raw = t_info.family, t_info.raw
        shape = gen.shape
        loops = shape.all_loops()
        scaling = [lp for lp in loops if lp.scales]
        depth = shape.max_loop_depth
        fn_names = sorted({n.name for n in shape._func_nodes})
        out: List[str] = []

        worst = ""
        if dominant:
            d = dominant[0]
            worst = f"The worst-case construct -- the one that sets this growth rate -- is {self._cite(d)}."

        if sig.has_recursion and sig.has_memoization:
            out.append(f"This algorithm runs in `{raw}`. It is recursive, but it remembers answers it has already computed, so each distinct subproblem is solved only once instead of over and over.")
            out.append("Without the cache, the same call tree would branch and repeat work exponentially. Caching is what turns it into (number of distinct subproblems) x (work each). " + worst)
        elif sig.has_recursion and family in ("exponential", "super_exponential", "recursive_branching", "factorial"):
            k = getattr(self, "_branching", 0) or 2
            out.append(f"This algorithm runs in `{raw}`, which grows extremely fast. The recursion calls itself {k} times per call, so the number of calls multiplies at every level.")
            out.append("Because nothing is remembered between calls, the same subproblems are solved again and again -- adding memoization (a dictionary or `functools.lru_cache`) is the standard fix. " + worst)
        elif sig.has_recursion and (sig.paradigms.is_halving or family in ("logarithmic", "linearithmic")):
            out.append(f"This algorithm runs in `{raw}`. It is recursive and splits the problem into smaller pieces on every call, so the depth of recursion is only about log n.")
            if family == "linearithmic":
                out.append("Each level of splitting also does about n total work (combining or comparing), so `log n` levels x `n` work per level = `n log n`. " + worst)
            else:
                out.append("Each call does only a little work before handing a smaller problem down. " + worst)
        elif sig.has_recursion and family in ("linear", "polynomial"):
            out.append(f"This algorithm runs in `{raw}`. It is recursive: each call handles one piece and passes a slightly smaller problem to the next call, so the chain of calls is about n deep.")
            out.append("The total is the number of calls x the work each call does before recursing. " + worst)
        elif family == "logarithmic" or (sig.paradigms.is_halving and family not in ("linear", "polynomial", "linearithmic")):
            halving = [lp for lp in loops if not lp.scales and "log n" in lp.bound]
            where = f" (the loop on line {halving[0].lineno}: `{halving[0].header}`)" if halving else ""
            out.append(v(
                f"This algorithm runs in `{raw}`. It never has to look at every element: each step throws away a chunk of what's left{where}, so it homes in on the answer fast.",
                f"This algorithm runs in `{raw}`. Each pass discards a large part of the remaining problem{where}, so the number of steps grows very slowly.",
            ))
            out.append("The halving steps are the only thing that matters for speed; the assignments and comparisons around them are O(1). " + worst)
        elif family == "root":
            out.append(f"This algorithm runs in `{raw}`. It only needs to check candidates up to the square root of the input, because any factor bigger than that pairs up with one smaller than it.")
            out.append("That skips almost all of the work a full scan would do: for n = 1,000,000 it's about 1,000 checks instead of a million. " + worst)
        elif family == "graph":
            out.append(f"This algorithm runs in `{raw}` -- the standard cost of visiting every node (V) and checking every edge (E) once, as in BFS or DFS.")
            out.append("You can't do much better if the whole graph must be explored, because every node and edge has to be looked at at least once. " + worst)
        elif family == "polynomial" and (depth >= 2 or (sig.nested_loops)):
            nested = [lp for lp in scaling][:6]
            names = ", ".join(f"`{lp.header}` (line {lp.lineno})" for lp in nested)
            out.append(f"This algorithm runs in `{raw}`. The bottleneck is nested loops: {names}. For every pass of an outer loop, the inner loop runs completely, so the repetitions multiply.")
            out.append("Small extras outside the loops are tiny next to how often the innermost body repeats. " + worst)
        elif family in ("polynomial", "linearithmic") and self._hidden_cost_phrase(sig):
            hid = self._hidden_cost_phrase(sig)
            loop_txt = f" `{scaling[0].header}` (line {scaling[0].lineno})" if scaling else " the loop"
            out.append(f"This algorithm runs in `{raw}`, even though it may look like a single loop. Inside{loop_txt} there is {hid} -- a second loop hidden inside a single line.")
            out.append("That hidden loop runs on every pass of the visible one, so the costs multiply. Spotting cost that hides inside one innocent-looking line is exactly what this analyzer is for. " + worst)
        elif family == "linearithmic" or sig.complexity_signals.repeated_sort:
            out.append(f"This algorithm runs in `{raw}` -- the signature of sorting or divide-and-conquer: faster than nested loops, a bit more than a single pass.")
            out.append("Plain loops or lookups elsewhere are cheap by comparison; the sort (or recursive split-and-combine) drives the cost. " + worst)
        elif family == "polynomial":
            out.append(f"This algorithm runs in `{raw}`: the work grows with a power of the input size, faster than a single pass would.")
            out.append("The growth comes from repetition inside repetition -- a loop, recursion or built-in operation that itself has to go through the data. " + worst)
        elif family == "linear":
            if scaling:
                lp = scaling[0]
                out.append(f"This algorithm runs in `{raw}` -- the time grows directly with the input. The main driver is the loop on line {lp.lineno}, `{lp.header}`, which {lp.bound}.")
            else:
                out.append(f"This algorithm runs in `{raw}` -- the time grows directly with the input size, because it has to look at each element (directly or through a built-in) at least once.")
            if self._dominant_local_constant(dominant):
                out.append("Everything else (assignments, simple checks) is O(1) and doesn't change the overall picture. " + worst)
            else:
                out.append("Look closely at the worst-case construct: it is not a simple O(1) step, so what it does on each pass matters as much as the loop itself. " + worst)
        else:
            out.append(f"This algorithm runs in `{raw}`. Nothing in it repeats work in proportion to the input.")
            out.append("Every step is a fixed-cost operation -- assignments, lookups, simple math -- so it takes the same time for 10 items or 10 million.")

        # what the notation itself means (cubic and beyond, log factors, bases, n^n ...)
        card = notation_card(raw)
        if card:
            out.append(card)

        # worst-case caveat, tied to the learner's real early exits
        if (sig.has_early_exits or sig.has_continue) and not is_constant(parse_complexity(raw)):
            out.append("**Worst case, not typical case:** your `break`/`return` can stop early on lucky inputs, but Big-O reports the ceiling -- the input on which no early exit fires.")

        sc = scaling_line(raw)
        if sc:
            out.append(sc + " " + doubling_effect(raw))
        return "\n\n".join(p for p in out if p.strip())

    # ------------------------------------------------------------------
    # Space narrative
    # ------------------------------------------------------------------
    def _biggest_structure(self, live: List[Dict]):
        best = None
        for d in live:
            for name, data in (d.get("memory_state") or {}).items():
                size = data.get("size", 0) if isinstance(data, dict) else 0
                if size > 1 and (best is None or size > best[1]):
                    best = (name, size, d.get("lineno"))
        return best

    def _build_overall_space_narrative(self, s_info: BigOInfo, sig: PatternSignals, final_space: str, live: List[Dict]) -> str:
        v = self.generator._v
        family, raw = s_info.family, s_info.raw
        out: List[str] = []
        big = self._biggest_structure(live)
        observed = f" In your last test run, `{big[0]}` grew to {big[1]} element(s) (line {big[2]}) -- that growth is the memory cost Big-O describes." if big else ""

        if family == "constant":
            out.append(f"Memory use here is `{raw}`: only a handful of fixed variables are used, no matter the input size.")
            out.append("No list, dictionary or other structure grows with the input, so the footprint is identical for a dozen items or a million.")
        elif family == "linear":
            halving_rec = sig.has_recursion and bool(getattr(getattr(sig, "paradigms", None), "is_halving", False))
            if halving_rec:
                out.append(f"Memory use here is `{raw}`. The recursion itself is only about log n calls deep, so the call stack is small; the `{raw}` comes from the new lists the code builds along the way (slices, merged or copied results), which together hold about n items.")
            elif sig.has_recursion:
                out.append(f"Memory use here is `{raw}`, mainly from the recursive call stack: every call still waiting to finish keeps its own small frame in memory, and the chain is about n calls deep.")
            else:
                out.append(f"Memory use here is `{raw}`, growing directly with the input -- something (a list, dict, set or string) is being built with one entry per input item.")
            if halving_rec:
                out.append("Doubling the input adds only one more level of recursion, but it doubles the size of the temporary lists, so the memory doubles.")
            elif sig.has_recursion:
                out.append("Doubling the input doubles the deepest chain of calls, and so the stack memory. Python also caps recursion depth (about 1000 calls by default), so a large enough n raises `RecursionError` before memory runs out.")
            else:
                out.append("Single variables barely matter; the memory cost is the data structure holding the new information." + observed)
        elif family == "polynomial":
            import re as _re
            _m = _re.search(r"n\^(\d+)", raw)
            _k = int(_m.group(1)) if _m else 2
            if _k >= 3:
                out.append(f"Memory use jumps to `{raw}`. That usually means a {_k}-dimensional structure -- a 3D grid or a nested table -- with about {' x '.join(['n'] * _k)} cells, far more than a flat list or a 2D grid.")
                out.append(f"Doubling the input multiplies the memory by about {2 ** _k}, so large inputs can exhaust memory much sooner than they exhaust patience." + observed)
            else:
                out.append(f"Memory use jumps to `{raw}`. That usually means a 2D structure -- a grid, matrix or DP table -- with about n x n cells, far more than a flat list.")
                out.append("Doubling the input roughly quadruples the memory, so large inputs can exhaust memory much sooner than they exhaust patience." + observed)
        elif family == "graph":
            out.append(f"Memory use here is `{raw}` -- typically a visited set plus a queue/stack, or a structure storing distance or parent for every node.")
            out.append("That's normal for graph traversal: you must remember something about every node you've visited." + observed)
        elif family in ("exponential", "factorial", "super_exponential"):
            out.append(f"Memory use here is `{raw}`, which is very heavy: the program is holding on to a number of results that multiplies as the input grows.")
        else:
            out.append(f"Memory use here comes out to `{raw}`." + observed)

        sc = scaling_line(raw, unit="memory cells")
        if sc:
            out.append(sc + " " + doubling_effect(raw).replace("work", "memory"))
        return "\n\n".join(out)

    # ------------------------------------------------------------------
    # Actionable suggestions -- only what the code's own signals justify
    # ------------------------------------------------------------------
    def _build_improvement_section(self, t_info: BigOInfo, s_info: BigOInfo, sig: PatternSignals) -> str:
        cs, ms = sig.complexity_signals, sig.memory_signals
        tips: List[str] = []
        if sig.has_recursion and t_info.family in ("exponential", "recursive_branching", "super_exponential") and not sig.has_memoization:
            tips.append("**Cache repeated subproblems.** Store each answer in a dictionary (or add `@functools.lru_cache`) the first time you compute it. For overlapping subproblems like Fibonacci this typically drops the time from exponential to linear.")
        if sig.membership_in_loop or cs.membership_in_list:
            tips.append("**Swap the list for a set/dict.** `x in list` scans item by item; `x in set` is O(1) on average, so the hidden inner loop disappears.")
        if cs.repeated_sort:
            tips.append("**Sort once.** Move the sort outside the loop -- you pay O(n log n) once instead of n times.")
        if cs.inefficient_list_pop or cs.inefficient_list_insert:
            tips.append("**Use `collections.deque`** for removing/inserting at the front: O(1) instead of shifting the whole list.")
        if ms.string_concatenation_in_loop:
            tips.append("**Build strings with `''.join(pieces)`** instead of `+=` in a loop; it copies once, not every pass.")
        if cs.aggregation_in_loop:
            tips.append("**Keep a running total/max** in a variable instead of re-scanning with `sum()`/`max()` on every pass.")
        if ms.performs_slicing and (sig.has_recursion or sig.loop_depth > 0):
            tips.append("**Pass indices instead of slices** so you stop copying sub-lists.")
        _np = classify_notation(t_info.raw)
        if not tips and _np and (_np.kind in ("polylog", "loglog", "multi") or (_np.kind == "poly" and _np.degree >= 3)) and reduce_tip(t_info.raw):
            tips.append("**" + _np.name.capitalize() + ".** " + reduce_tip(t_info.raw))
        if not tips and t_info.family == "polynomial" and self.generator.shape.max_loop_depth >= 2:
            tips.append("**Ask what the inner loop is doing.** If it is searching or matching, a set/dict lookup, or sorting first and using two pointers, can often reduce O(n^2) to O(n) or O(n log n). If every cell or pair really must be visited (like adding two matrices), O(n^2) is already optimal -- not every quadratic algorithm can be improved.")
        if not tips and s_info.family == "polynomial":
            tips.append("**Check whether you need the whole table.** Many DP tables only look one row back, so keeping just the previous row cuts O(n^2) memory to O(n).")
        return "\n".join(f"- {t}" for t in tips[:3])

    def _build_complexity_summary(self, t_info: BigOInfo, s_info: BigOInfo, sig: PatternSignals, final_time: str, final_space: str, dominant: List[Dict]) -> str:
        tf, sf = t_info.family, s_info.family
        if tf in ("constant", "logarithmic", "linear", "graph", "root") and sf in ("constant", "logarithmic", "linear", "graph", "root"):
            verdict = "Overall, this algorithm scales well."
        elif tf in ("polynomial", "exponential", "factorial", "super_exponential", "recursive_branching") or sf in ("polynomial", "exponential", "factorial"):
            verdict = "Overall, this algorithm will struggle as inputs grow."
        else:
            verdict = "Overall, this algorithm is reasonably solid, but keep an eye on how large your input can get."

        where = f" The costliest construct is {self._cite(dominant[0])}." if dominant else ""
        if sf == "constant":
            mem = f"memory stays flat at `{s_info.raw}` because nothing grows with the input"
        else:
            mem = f"memory grows as `{s_info.raw}` because of the data structures involved"
        return f"{verdict} Time grows as `{t_info.raw}` ({growth_word(final_time)}), and {mem}.{where} **Bottom line: {t_info.raw} time, {s_info.raw} space -- worst case.**"
