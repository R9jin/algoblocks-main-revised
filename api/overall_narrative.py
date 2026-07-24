"""
Overall Narrative

Builds the final whole-algorithm narrative: recurrence-relation
solving (manual + iterative) and the overall time/space/complexity
summary text -- the NLG counterpart of the Master Theorem Assigner
and Efficiency Evaluator stages.
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

from explanation_signals import BigOInfo, MemorySignals, ComplexitySignals, AlgorithmicParadigms, PatternSignals

class OverallNarrative:
    """Whole-algorithm narrative + recurrence solving. Composed into
    EducationalInsightGenerator as `self.overall_narrative`; reads shared
    state and sibling components via `self.generator`.
    """

    def __init__(self, generator):
        self.generator = generator

    def generate_overall_analysis(self, final_time: str, final_space: str, sig: PatternSignals, details: List[Dict]) -> str:
        """
        Puts together the full time & space verdict for the whole algorithm,
        walking through the real math step by step (like working it out on a
        whiteboard) rather than just stating the final answer.
        """
        t_info = self.generator.variable_explanations._classify_big_o(final_time)
        s_info = self.generator.variable_explanations._classify_big_o(final_space)

        time_narrative = self._build_overall_time_narrative(t_info, sig)
        time_simp = self._build_real_simplification(details, "global_time", final_time, is_time=True)

        space_narrative = self._build_overall_space_narrative(s_info, sig)
        space_simp = self._build_real_simplification(details, "global_space", final_space, is_time=False)

        summary = self._build_complexity_summary(t_info, s_info, sig)

        final_md = (
            "### Overall Complexity Analysis\n\n"
            "#### Overall Time Complexity\n"
            f"{time_narrative}\n\n"
            "**Working Through the Math**\n"
            f"{time_simp}\n\n"
            "#### Overall Space Complexity\n"
            f"{space_narrative}\n\n"
            "**Working Through the Math**\n"
            f"{space_simp}\n\n"
            "#### In Short\n"
            f"{summary}"
        )
        return final_md

    def _build_real_simplification(self, details: List[Dict], key: str, final_complexity: str, is_time: bool) -> str:
        valid_ops = []
        recurrence_relation_str = None

        for d in details:
            op_name = d.get("operation", "")
            if d.get("color") != "#7f8c8d" and op_name not in ["Definition", "Dead Code", "Comment / Docstring"]:
                val = str(d.get(key, "O(1)"))
                valid_ops.append(val)
                if "T(n) =" in val or "T(n)=" in val:
                    recurrence_relation_str = val

        prefix = "T(n)" if is_time else "S(n)"

        if recurrence_relation_str and is_time:
            return self._solve_recurrence_manually(recurrence_relation_str, final_complexity, prefix)
        else:
            return self._solve_iterative_manually(valid_ops, final_complexity, prefix)

    def _solve_recurrence_manually(self, relation: str, final_complexity: str, prefix: str) -> str:
        steps = []
        steps.append(f"**Step 1: Write down the recurrence**\nThe recursive calls in this code follow this pattern:\n`{relation}`\n")

        if "T(n/2)" in relation:
            a = "2" if "2T" in relation else "1"
            b = "2"
            fn = "O(n)" if "+ O(n)" in relation else "O(1)"
            steps.append(f"**Step 2: Match it to the divide-and-conquer form**\nThis fits the pattern `{prefix} = a*{prefix}(n/b) + f(n)`, where:\n- `a` = {a} (how many subproblems each call makes)\n- `b` = {b} (how much smaller each subproblem is)\n- `f(n)` = {fn} (work done outside the recursive calls)\n")

            steps.append(f"**Step 3: Compare the growth rates**\nWe check `n^(log_b(a))` against `f(n)`:\n`n^(log_{b}({a}))` = `n^{1 if a=='2' else 0}`\n")

            if a == "2" and fn == "O(n)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n) = O(n)` grows at the same rate as `n^(log_b(a)) = O(n)`. That's Case 2 -- so we add a `log n` factor.\n")
            elif a == "2" and fn == "O(1)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n) = O(1)` grows slower than `n^(log_b(a)) = O(n)`. That's Case 1 -- the recursive calls themselves dominate the cost.\n")
            elif a == "1" and fn == "O(1)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n) = O(1)` matches `n^(log_b(a)) = O(1)`. That's Case 2 -- so we add a `log n` factor.\n")
            elif a == "1" and fn == "O(n)":
                steps.append("**Step 4: Apply the Master Theorem**\n`f(n) = O(n)` grows faster than `n^(log_b(a)) = O(1)`. That's Case 3 -- the work done outside the recursion dominates.\n")

        elif "T(n-1)" in relation and "T(n-2)" in relation:
            steps.append("**Step 2: Unroll the recursion tree**\nThis is the classic Fibonacci-style pattern: every call spawns two more calls, `T(n) → T(n-1) + T(n-2)`.\n")
            steps.append("**Step 3: Count how the tree grows**\nThe tree is about `n` levels deep, and roughly doubles in width at each level.\n")
            steps.append("**Step 4: Add it up**\nSumming `2^0 + 2^1 + 2^2 + ... + 2^n` gives an exponential total -- this is why naive recursive Fibonacci is so slow.\n")

        elif "T(n-1)" in relation:
            fn = "O(n)" if "+ O(n)" in relation else ("O(log n)" if "+ O(log n)" in relation else "O(1)")
            multiplier = "n *" if "n * T" in relation else ""
            steps.append("**Step 2: Unroll the chain**\nThis is a straight chain of recursive calls, one level deep for each unit of `n` -- so the call stack ends up `n` levels deep.\n")

            if multiplier:
                steps.append("**Step 3: Multiply across levels**\nSince the work multiplies at each level (`n * (n-1) * (n-2) * ...`), this is exactly the definition of a factorial.\n")
            elif fn == "O(n)":
                steps.append("**Step 3: Add up the work at each level**\nAt each of the `n` levels, `O(i)` work happens. Adding these up (`n + (n-1) + (n-2) + ... + 1`) is a classic arithmetic series.\n")
                steps.append("**Step 4: Simplify the series**\nThat series sums to `n * (n + 1) / 2`, which simplifies to `O(n^2)`.\n")
            else:
                steps.append(f"**Step 3: Multiply levels by cost**\nEach of the `n` levels does `{fn}` of work, so the total is `n` multiplied by `{fn}`.\n")

        else:
            steps.append("**Step 2: Work it out**\nThe recursion doesn't match one of the standard textbook shapes, so the engine evaluates it against known growth patterns directly.\n")

        steps.append(f"**Final answer:**\n`{prefix} = {final_complexity}`\n")
        return "\n".join(steps)

    def _solve_iterative_manually(self, valid_ops: List[str], final_complexity: str, prefix: str) -> str:
        steps = []

        if not valid_ops:
            return f"**Step 1:**\nThere's no meaningful cost to add up here.\n\n**Final answer:**\n`{prefix} = O(1)`\n"

        steps.append("**Step 1: List each line's cost**\nWe take the worst-case cost of every executed line:\n")
        raw_eq_terms = [t if t.startswith("O(") else f"O({t})" for t in valid_ops]
        steps.append(f"`{prefix} = " + " + ".join(raw_eq_terms) + "`\n")

        counts = {}
        for op in valid_ops:
            val = op.replace("O(", "").replace(")", "").strip()
            if val == "1 amortized":
                val = "1"
            counts[val] = counts.get(val, 0) + 1

        grouped_terms = []
        for term, count in counts.items():
            if "T(" in term:
                grouped_terms.append(f"{count} * {term}" if count > 1 else term)
            else:
                grouped_terms.append(f"{count} * O({term})")

        steps.append("**Step 2: Group matching terms**\nCombine the terms that are the same order of growth:\n" + f"`{prefix} = " + " + ".join(grouped_terms) + "`\n")

        dropped_consts = []
        for t, c in counts.items():
            if "T(" in t:
                dropped_consts.append(t)
            else:
                dropped_consts.append(f"O({t})")

        steps.append("**Step 3: Drop the constant multipliers**\nIn Big-O, a fixed number of repeats (like `3 *`) doesn't change the growth rate, so we drop it:\n" + f"`{prefix} = " + " + ".join(dropped_consts) + "`\n")

        hierarchy = ["1", "log min", "log", "sqrt", "n", "m", "V", "V + E", "n log n", "n^2", "n * m", "n^3", "2^n", "3^n", "n!", "n * n!"]
        def get_rank(v):
            for i, h in enumerate(reversed(hierarchy)):
                if h in v:
                    return len(hierarchy) - i
            return -1

        sorted_dropped = sorted(dropped_consts, key=lambda x: get_rank(x), reverse=True)
        dominant_term = sorted_dropped[0]

        if len(sorted_dropped) > 1:
            lower_terms = sorted_dropped[1:]
            explanation = "Comparing how fast each term grows as the input gets large:\n"
            for lower in lower_terms:
                explanation += f"- `{dominant_term}` grows faster than `{lower}`, so we drop `{lower}`.\n"
            steps.append(f"**Step 4: Keep only the fastest-growing term**\n{explanation}\n`{prefix} = {dominant_term}`\n")
        else:
            steps.append(f"**Step 4: Only one term to begin with**\nThere's nothing else to compare it against.\n`{prefix} = {dominant_term}`\n")

        if dominant_term.replace(" ", "") != final_complexity.replace(" ", ""):
            steps.append(f"**Step 5: Adjust for the surrounding structure**\nTaking the loop nesting and overall bounds into account, this settles at:\n`{prefix} = {final_complexity}`\n")
        else:
            steps.append(f"**Final answer:**\n`{prefix} = {final_complexity}`\n")

        return "\n".join(steps)

    def _build_overall_time_narrative(self, t_info: BigOInfo, sig: PatternSignals) -> str:
        family = t_info.family
        narrative = []

        if family == "logarithmic" or sig.paradigms.is_halving:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw}. The reason is simple: it never has to look at every element. Each step throws away a chunk of the remaining problem, so it homes in on the answer fast.",
            ))
            narrative.append(self.generator._v(
                "The halving steps are the only thing that really matters for speed here. There are a few assignments and comparisons along the way, but those are all O(1), so they don't change the big picture -- Big-O only cares about the fastest-growing part.",
            ))
        elif family == "polynomial" and sig.nested_loops:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw}. The bottleneck is the nested loops: for every single pass of the outer loop, the inner loop runs all the way through too, so the work multiplies.",
            ))
            narrative.append(self.generator._v(
                "There may be small extra steps outside the loops, but they're tiny compared to how much the nested loops repeat. The deepest loop is really what decides the final speed.",
            ))
        elif family == "linearithmic" or sig.complexity_signals.repeated_sort:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw}. That's the signature of sorting or a divide-and-conquer approach -- faster than nested loops, but a bit more than a single pass.",
            ))
            narrative.append(self.generator._v(
                "Any plain loops or lookups elsewhere are cheap by comparison. The sort (or recursive split-and-combine) is what really drives the cost here.",
            ))
        elif family in ["exponential", "super_exponential", "recursive_branching"] and sig.has_recursion:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw}, which grows extremely fast. That's because the recursion branches into multiple calls at every step.",
            ))
            narrative.append(self.generator._v(
                "Since each call doesn't remember answers from earlier calls, the same subproblems get solved again and again. That repeated, branching work is what defines the runtime here -- adding memoization would help a lot.",
            ))
        elif family == "linear" or sig.loop_depth == 1:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw} -- the time it takes grows directly with the size of the input.",
            ))
            narrative.append(self.generator._v(
                "The main loop, which touches every element once, is what sets this. Everything else (assignments, simple checks) is O(1) and doesn't change the overall picture.",
            ))
        elif family == "graph":
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw} -- that's the standard cost of visiting every node (V) and every edge (E) in a graph exactly once.",
                f"This algorithm runs in {t_info.raw}. That's what you get from a traversal like BFS or DFS: each node gets visited once, and each edge gets checked once.",
            ))
            narrative.append(self.generator._v(
                "This is considered efficient for graph problems -- you genuinely can't do much better than looking at every node and edge at least once if you need to explore the whole graph.",
            ))
        else:
            narrative.append(self.generator._v(
                f"This algorithm runs in {t_info.raw}. There's no loop or recursion scaling with the input here.",
            ))
            narrative.append(self.generator._v(
                "Every step is a fixed-cost operation -- assignments, lookups, simple math -- so the whole thing runs in constant time no matter how big the input gets.",
            ))

        if family == "constant":
            narrative.append(self.generator._v(
                "That's about as good as it gets: this algorithm takes exactly as long whether the input has 10 items or 10 million.",
            ))
        elif family == "logarithmic":
            narrative.append(self.generator._v(
                "This scales beautifully. Doubling the input only adds about one more step, so it stays fast even on huge datasets.",
            ))
        elif family == "linear":
            narrative.append(self.generator._v(
                "This scales predictably: double the input, double the time. It's efficient, but it will always depend directly on how much data there is.",
            ))
        elif family == "linearithmic":
            narrative.append(self.generator._v(
                "This scales well. It's a bit heavier than linear, but nowhere near as bad as quadratic, so it can comfortably handle large datasets.",
            ))
        elif family == "graph":
            narrative.append(self.generator._v(
                "This scales about as well as a linear algorithm does, as long as the graph doesn't have an extreme number of edges -- doubling the nodes and edges roughly doubles the work.",
            ))
        else:
            narrative.append(self.generator._v(
                "This one scales poorly. Small inputs run fine, but as the input grows, the running time increases much faster than the input does, so large inputs can get slow quickly.",
            ))

        return "\n\n".join(narrative)

    def _build_overall_space_narrative(self, s_info: BigOInfo, sig: PatternSignals) -> str:
        family = s_info.family
        narrative = []

        if family == "constant":
            narrative.append(self.generator._v(
                f"Memory use here is {s_info.raw} -- only a handful of fixed variables are used, no matter the input size.",
            ))
            narrative.append(self.generator._v(
                "No lists, dictionaries, or other growing structures are being built. The algorithm just reuses the same small amount of space the whole time.",
            ))
        elif family == "linear":
            if sig.has_recursion:
                narrative.append(self.generator._v(
                    f"Memory use here is {s_info.raw}, mainly because of the recursive call stack -- every call in progress keeps its own small frame in memory until it returns.",
                ))
            else:
                narrative.append(self.generator._v(
                    f"Memory use here is {s_info.raw}, growing directly with the input. That's from building a new list, dictionary, or similar structure sized to match the data.",
                ))
            narrative.append(self.generator._v(
                "Simple pointer variables barely matter here -- the real memory cost comes from whatever data structure is holding all the new information.",
            ))
        elif family == "polynomial":
            narrative.append(self.generator._v(
                f"Memory use jumps up to {s_info.raw}. That usually means a 2D structure -- a grid, matrix, or table -- is being built, which takes a lot more space than a flat list.",
            ))
            narrative.append(self.generator._v(
                "Because the space needed grows with the square (or more) of the input, this can use up memory fast on larger inputs.",
            ))
        elif family == "graph":
            narrative.append(self.generator._v(
                f"Memory use here is {s_info.raw} -- typically from a visited set and/or a structure tracking distances or parents for every node in the graph.",
            ))
            narrative.append(self.generator._v(
                "That's normal for graph traversal: you generally need to remember something about every node you've visited, so memory grows with the size of the graph.",
            ))
        else:
            narrative.append(self.generator._v(f"Memory use here comes out to {s_info.raw}."))

        if family == "constant":
            narrative.append(self.generator._v(
                "Because nothing here scales with the input, the memory footprint stays exactly the same whether you're processing a dozen items or a million.",
            ))
        elif family == "linear":
            narrative.append(self.generator._v(
                "Memory grows in step with the input -- double the data, double the memory needed. That's normal and usually fine, though very large inputs are worth keeping an eye on.",
            ))
        elif family == "polynomial":
            narrative.append(self.generator._v(
                "This is worth watching: doubling the input roughly quadruples the memory needed, so large inputs can use up available memory surprisingly fast.",
            ))
        else:
            narrative.append(self.generator._v(
                "This uses a fairly heavy amount of memory, which is worth keeping in mind for larger inputs.",
            ))

        return "\n\n".join(narrative)

    def _build_complexity_summary(self, t_info: BigOInfo, s_info: BigOInfo, sig: PatternSignals) -> str:
        if t_info.family in ["constant", "logarithmic", "linear"] and s_info.family in ["constant", "logarithmic", "linear"]:
            summary = "Overall, this algorithm scales well. "
        elif t_info.family in ["polynomial", "exponential", "factorial"] or s_info.family in ["polynomial", "exponential"]:
            summary = "Overall, this algorithm will struggle with large inputs. "
        else:
            summary = "Overall, this algorithm is reasonably solid, but keep an eye on how large your input can get. "

        summary += f"The main thing driving the runtime is `{t_info.raw}` time, "

        if s_info.family == "constant":
            summary += f"and memory use stays flat at `{s_info.raw}` since nothing grows with the input. "
        else:
            summary += f"paired with `{s_info.raw}` space as the data structures involved grow. "

        summary += f"**Bottom line: {t_info.raw} time, {s_info.raw} space.**"

        return summary

    # -------------------------------------------------------------------
    # Main entry point: builds the full per-line explanation pair
    # -------------------------------------------------------------------
