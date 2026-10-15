"""
Explanation Warnings

Short-form bottleneck warnings and optimization praise shown alongside a
line's explanation, plus recurrence-relation display formatting.

Each message answers the manuscript's three questions for a learner:
  1. WHERE does the cost come from?  (this line is the worst-case construct)
  2. WHY does it grow that way?      (the growth component behind it)
  3. WHAT could I try?               (a concrete, family-specific next step)

Headers match the ones the UI already styles: "Bottleneck Warning",
"Space Bottleneck" and "Algorithmic Mastery".
"""
from complexity_explainer.growth_insight import parse_complexity, growth_word


def _fix_for(final: str, operation: str, is_time: bool) -> str:
    """One concrete thing to try, chosen from the growth class."""
    t = parse_complexity(final)
    op = operation.lower()
    if t is None:
        return ""
    # Only the construct that *does* the repeating gets a suggestion; repeating the
    # same tip under every condition/assignment inside it would just be noise.
    if not any(k in op for k in ("loop", "sort", "recur", "call", "comprehension", "allocation", "list", "expansion")):
        return ""
    if is_time:
        if t.kind == "exp":
            return "**Try this:** if the same subproblems repeat, save their answers (a dictionary or `functools.lru_cache`) -- memoization typically turns this into a polynomial or even linear cost."
        if t.kind == "fact":
            return "**Try this:** n! means trying every ordering. Prune impossible branches early (backtracking) or look for a greedy / dynamic-programming formulation."
        if t.kind == "poly" and t.poly >= 2 and not t.log:
            if "sort" in op:
                return "**Try this:** sort once, outside the loop."
            return "**Try this:** ask what the repeated work is *doing*. If it searches or matches, a `set`/`dict` lookup (O(1)) or sorting + two pointers can bring O(n^2) down to O(n) or O(n log n). If every cell or pair genuinely has to be visited (like adding two matrices), O(n^2) is already the best possible."
        if t.kind == "poly" and t.poly >= 2 and t.log:
            return "**Try this:** move the O(n log n) work (usually a sort) outside the loop that repeats it, so it's paid once instead of n times."
        if t.kind == "poly" and t.poly == 1 and t.log:
            return "**Try this:** O(n log n) is already the best a comparison sort can do -- the win is usually in *not sorting more than once*."
        return ""
    if t.kind == "exp" or t.kind == "fact":
        return "**Try this:** reduce how many things are stored at once -- generate items one at a time (`yield`) instead of building all of them."
    if t.kind == "poly" and t.poly >= 2:
        return "**Try this:** check whether you need the whole table. Many DP tables only need the previous row, which cuts O(n^2) space to O(n)."
    if t.kind == "poly" and t.poly == 1:
        return "**Try this:** if you only need each item once, process it as a stream (`yield`, or a running total) instead of storing everything."
    return ""


class ExplanationWarnings:
    """Short-form bottleneck warnings/praise. Composed into
    EducationalInsightGenerator as `self.explanation_warnings`; reads shared
    state via `self.generator`."""

    def __init__(self, generator):
        self.generator = generator

    def get_time_bottleneck_warning(self, operation: str, final_time: str) -> str:
        op_lower = operation.lower()
        v = self.generator._v
        head = "\n\n**Bottleneck Warning:** "
        tail = _fix_for(final_time, operation, True)
        tail = ("\n\n" + tail) if tail else ""

        if "loop" in op_lower:
            body = v(
                f"This {op_lower} is the worst-case construct: how many times it repeats (and what it repeats) is what sets the whole algorithm's `{final_time}`. Everything else is small next to it.",
                f"Most of the running time is spent here. The repetition in this {op_lower} is the growth component that decides the overall `{final_time}`.",
            )
        elif "recur" in op_lower or "call" in op_lower:
            body = f"This {op_lower} is the worst-case construct: it re-solves overlapping subproblems from scratch instead of reusing earlier answers, which is what pushes the time up to `{final_time}`."
        elif "comprehension" in op_lower:
            body = f"This {op_lower} looks short, but it is a loop in disguise -- that hidden iteration is what sets the `{final_time}` cost."
        elif "sort" in op_lower:
            body = f"Sorting is O(n log n) work by itself. This {op_lower} is the worst-case construct, and where it sits (inside a loop or not) decides whether the total is `{final_time}`."
        else:
            body = f"This {op_lower} is the worst-case construct -- the growth of this one step is what decides the overall `{final_time}` time complexity."
        return head + body + tail

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()
        head = "\n\n**Space Bottleneck:** "
        tail = _fix_for(final_space, operation, False)
        tail = ("\n\n" + tail) if tail else ""

        if "recur" in op_lower or "call" in op_lower:
            body = f"Each unfinished call in this {op_lower} keeps its own frame on the stack, so peak memory grows with the recursion depth -- that's the `{final_space}`."
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower or "expansion" in op_lower:
            body = f"Instead of reusing memory, this {op_lower} builds a brand-new structure sized by the input -- the source of the `{final_space}`."
        elif "slice" in op_lower or "string" in op_lower or "concat" in op_lower:
            body = f"Slicing and string-building copy data into new memory rather than reusing what's there, so this {op_lower} drives peak memory to `{final_space}`."
        else:
            body = f"The data this {op_lower} has to keep around at once is what sets total memory use to `{final_space}`."
        return head + body + tail

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()
        op = operation.lower()
        head = "\n\n**Algorithmic Mastery:** "

        if "log" in time_lower:
            return head + f"Cutting the problem down at every step is one of the best optimizations there is. This {op} scales beautifully: `{global_time}` means even a billion items need only about 30 steps."
        if "√" in time_lower or "sqrt" in time_lower:
            return head + f"Only checking up to the square root avoids a huge number of pointless checks -- this {op} runs in `{global_time}`, far better than scanning everything."
        if "1" in time_lower:
            return head + f"Direct access by key or index means this {op} takes the same time whether the data has 10 items or 10 million: `{global_time}`."
        return head + f"This {op} is well structured and avoids repeated work, keeping the cost at `{global_time}`."

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation
