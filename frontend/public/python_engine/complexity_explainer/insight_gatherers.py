"""
Insight Gatherers

Collects the "Educational Insight" notes shown under a line's explanation.

Two sources feed each line:

  * line_insights.py   -- notes built from the line's OWN construct (a `for`
                          header, an `if` test, `s += x`, a `return`...), the
                          loops/functions around it and the profiler's counts.
                          Every line gets these, so no line is left unexplained.
  * the signal notes   -- below: named patterns and traps (halving, memoization,
                          `pop(0)`, string `+=` in a loop...).

Every candidate carries a priority so a busy line still leads with what matters:

    0  performance trap -- says what is slow AND what to do instead
    1  line-specific teaching / algorithmic pattern / evidence from the last run
    2  background fact, rule of thumb, scale intuition

Within a priority tier the line-specific notes come first, then the pattern
notes, in discovery order (stable), so the same code always reads the same way.
"""
import ast
import re
from typing import List, Tuple

from complexity_explainer.explanation_signals import PatternSignals

MAX_TIME_INSIGHTS = 6
MAX_SPACE_INSIGHTS = 5

# If a line-specific note already teaches a topic, the older generic signal note on
# the same topic is dropped instead of being said twice.
_TOPIC_PATTERNS = {
    "membership": re.compile(r"`in`|in some_list|`x in"),
    "pop0": re.compile(r"pop\(0\)"),
    "aggregation": re.compile(r"`sum\(|sum\(\.\.\.\)|`sum\(\)`"),
    "list_plus": re.compile(r"joining lists with `\+`|`\+` on lists|`\+` allocates|x = x \+ \["),
    "str_plus": re.compile(r"strings (can't|cannot|are immutable)|immutable"),
    "slicing": re.compile(r"slic"),
    "generator": re.compile(r"`yield`|generator"),
    "early_exit": re.compile(r"early return|`break`"),
    "swap": re.compile(r"swap"),
    "stack": re.compile(r"call stack|recursion limit|recursive call keeps"),
    "memo": re.compile(r"memoiz"),
    "halving": re.compile(r"halv|discards half|discard 50"),
    "sorted_copy": re.compile(r"`sorted\(\)`"),
    "join": re.compile(r"join\("),
    "new_list": re.compile(r"new list|fresh block|reserves a (fresh )?block"),
    "heap": re.compile(r"heap"),
    "fstring": re.compile(r"f-string"),
    "with_cleanup": re.compile(r"`with`"),
    "try": re.compile(r"`try`|try/except"),
    "walrus": re.compile(r"walrus"),
}


def _topics(text: str) -> set:
    low = text.lower()
    return {k for k, rx in _TOPIC_PATTERNS.items() if rx.search(low)}


class InsightGatherers:
    """Bottleneck/insight collection. Composed into EducationalInsightGenerator
    as `self.insight_gatherers`; reads shared state via `self.generator`."""

    def __init__(self, generator):
        self.generator = generator

    @staticmethod
    def _top(candidates: List[Tuple[int, str]], limit: int) -> List[str]:
        # stable sort: priority first, original discovery order preserved within a tier
        ordered = sorted(enumerate(candidates), key=lambda x: (x[1][0], x[0]))
        return [text for _, (_, text) in ordered][:limit]

    @staticmethod
    def _merge(line_notes: List[Tuple[int, str]], signal_notes: List[Tuple[int, str]]) -> List[Tuple[int, str]]:
        """Line-specific notes first; drop a signal note whose topic a line note already teaches."""
        covered = set()
        for _, text in line_notes:
            covered |= _topics(text)
        kept = [(pri, text) for pri, text in signal_notes if not (_topics(text) & covered)]
        return list(line_notes) + kept

    _FALLBACK_TIME = (2, "**The core idea:** a line's total cost is (work each time it runs) x (how many times it runs). The line itself decides the first factor; the loops and recursion around it decide the second.")
    _FALLBACK_SPACE = (2, "**The core idea:** space complexity is the *peak* extra memory alive at once -- what the algorithm builds and keeps, not the total it ever touches.")

    def _gather_time_insights(self, sig: PatternSignals, local_t: str, global_t: str = "",
                              node=None, hits: int = 0, code_snippet: str = "") -> List[str]:
        v = self.generator._v
        c: List[Tuple[int, str]] = []
        cs, ms, pd = sig.complexity_signals, sig.memory_signals, sig.paradigms

        # ---- 0: traps (what's slow + what to do instead) --------------------
        if ms.geometric_capacity_growth:
            c.append((0, "Watch out: combining a list or string with itself inside a loop doubles its size every pass, so the work explodes. Grow it by appending single items instead."))
        elif ms.string_concatenation_in_loop:
            c.append((0, "Common trap: strings can't be changed in place, so `+=` on a string inside a loop copies the whole string every pass -- n passes x up to n characters copied. Collect the pieces in a list and call `''.join(...)` once at the end."))
        if cs.inefficient_list_pop:
            c.append((0, "`pop(0)` is O(n): every remaining item has to shift one slot to the left. Inside a loop that's n x n work. `collections.deque.popleft()` does the same job in O(1)."))
        if cs.inefficient_list_insert:
            c.append((0, "Inserting at index 0 is O(n) because everything already in the list must shift right. Inside a loop, that's n x n work -- append and reverse once, or use a `deque`."))
        if cs.repeated_sort:
            c.append((0, "Sorting costs O(n log n). Doing it on every pass of a loop pays that cost again and again, and the loop multiplies it. Sort once, before the loop, whenever the order doesn't change."))
        if cs.aggregation_in_loop:
            c.append((0, "`sum()`, `max()` and `min()` re-scan the whole collection every time they're called. Inside a loop that hides a second loop (n x n). Keep a running total or running best in a plain variable instead."))
        if sig.membership_in_loop or cs.membership_in_list:
            c.append((0, "`x in some_list` scans the list one item at a time (O(n)). Inside a loop it quietly becomes n x n. Turn the list into a `set` (or `dict`) first and each membership check drops to O(1) on average."))
        if ms.performs_slicing and (sig.has_recursion or sig.memory_signals.recursive_stack_risk or sig.loop_depth > 0):
            c.append((0, "Slicing copies the elements it returns (O(k) for k items). In a loop or recursion those copies add up -- pass start/end indices instead of slicing."))
        if cs.list_count_op:
            c.append((0, "`.count()` scans the whole list (O(n)). If you need counts repeatedly, build a `Counter` once and look counts up in O(1)."))
        if sig.uses_try_except and cs.exception_control_flow:
            c.append((1, "Using `try/except` for everyday control flow inside a hot loop is slower than a plain `if` check, because building an exception object isn't free."))

        # ---- 1: algorithmic patterns ---------------------------------------
        if pd.is_halving:
            c.append((1, v(
                "Halving is what gives O(log n): a billion items take only about 30 steps, because every step throws away half of what's left.",
                "Why this is fast: every step discards 50% of the remaining problem, so even a huge input needs only a handful of steps (about 30 for a billion items).",
            )))
        if pd.is_two_pointer and not pd.is_halving:
            c.append((1, "Two pointers moving toward each other visit each element at most once, so this can replace a nested O(n^2) loop with a single O(n) pass."))
        if pd.is_kadane:
            c.append((1, "Kadane-style running best: instead of checking every possible subarray (O(n^2)), keep the best answer so far and update it in one O(n) pass."))
        if pd.is_priority_queue:
            c.append((1, "A heap keeps the smallest (or largest) item within reach: each push/pop costs O(log n), far cheaper than re-sorting every time you need the next best item."))
        if pd.is_brian_kernighan:
            c.append((1, "`n & (n - 1)` clears the lowest set bit, so the loop runs once per 1-bit rather than once per bit position."))
        if pd.is_memoization_check or sig.has_memoization:
            c.append((1, "This is memoization: the code checks \"have I already solved this exact subproblem?\" and returns the saved answer instead of recomputing it. That is what collapses exponential branching into (number of distinct subproblems) x (work each)."))
        if pd.is_combinatorics:
            c.append((1, "Factorials and permutations grow faster than almost anything else (O(n!)): n = 10 is already 3.6 million possibilities, n = 15 is over a trillion."))
        if pd.is_union_find:
            c.append((1, "Union-Find answers \"are these two connected?\" in nearly O(1) with path compression -- much cheaper than searching the structure each time."))
        if cs.binary_search_module:
            c.append((1, "`bisect` performs binary search for you in O(log n) -- but the list must already be sorted."))
        if cs.itertools_usage:
            c.append((1, "`itertools` generators are lazy and memory-friendly, but the *number* of combinations/permutations they produce can still explode -- the real cost depends on how much of the output you consume."))
        if ms.uses_join_for_strings:
            c.append((1, "`.join()` builds the final string in one pass -- exactly why it beats repeated `+=` inside a loop."))
        if cs.set_mathematical_ops:
            c.append((1, "Built-in set operations (union, intersection...) run in optimized code and beat hand-written nested loops for comparing collections."))

        # ---- 2: background facts -------------------------------------------
        if pd.is_fibonacci_sequence:
            c.append((2, "Updating both values on one line computes the right-hand side first, then assigns -- a tidy way to slide a two-value window forward without a temp variable."))
        if cs.quadratic_math:
            c.append((2, "Squaring a number is a single cheap CPU operation, so it won't be a bottleneck on its own."))
        if ms.geometric_capacity_growth is False and cs.f_string_usage:
            c.append((2, "f-strings build the final string in one go, so they aren't a performance concern."))
        if cs.dict_lookup_constant:
            c.append((2, "Dictionary lookups are O(1) on average because the key is hashed straight to its slot instead of being searched for."))
        if cs.list_reverse_op:
            c.append((2, "Reversing a list is O(n): every element is touched once."))
        if ms.sorted_makes_a_copy:
            c.append((2, "`sorted()` returns a new list (extra O(n) memory) while `.sort()` rearranges in place -- same time cost, different memory trade-off."))
        if cs.iteration_helper_usage:
            c.append((2, "`zip()`, `enumerate()`, `map()` and `filter()` make loops cleaner but don't change their cost."))
        if cs.type_conversion:
            c.append((2, "Converting one value is O(1), but converting a whole collection (`list(x)`, `set(x)`) visits every element: O(n)."))
        if sig.has_early_exits or sig.has_continue:
            c.append((2, "`break`, `continue` and early `return` let the code stop as soon as it knows the answer. Big-O still reports the *worst case* -- the input where no early exit ever fires."))
        if sig.uses_try_except and not cs.exception_control_flow:
            c.append((2, "`try/except` here handles unexpected problems gracefully instead of crashing the program."))
        if sig.uses_context_manager:
            c.append((2, "The `with` block cleans up automatically (closing files, releasing locks), even if an error happens partway through."))
        if sig.uses_walrus:
            c.append((2, "The walrus operator (`:=`) assigns and uses a value in one expression, avoiding a repeated call or extra line."))

        line_notes = []
        if node is not None:
            line_notes = self.generator.line_insights.time_notes(node, sig, local_t, global_t, hits, code_snippet)
        merged = self._merge(line_notes, c) or [self._FALLBACK_TIME]
        return self._top(merged, MAX_TIME_INSIGHTS)

    def _gather_space_insights(self, sig: PatternSignals, mem_state: dict,
                               node=None, local_s: str = "", global_s: str = "", hits: int = 0) -> List[str]:
        v = self.generator._v
        c: List[Tuple[int, str]] = []
        ms = sig.memory_signals

        # ---- 0: traps -------------------------------------------------------
        if ms.creates_new_list_from_concat:
            c.append((0, "Joining lists with `+` builds an entirely new list every time. Inside a loop you pay that copy (and that memory) on each pass -- `.extend()` grows the list in place."))
        if ms.performs_slicing:
            c.append((0, "Slicing copies the elements it returns into a brand-new object. Repeated in a loop or recursion, those copies quietly add up -- pass indices instead."))
        if ms.recursive_stack_risk:
            c.append((0, "Each recursive call keeps its frame on the call stack until it returns, so depth = memory. Very deep recursion can also hit Python's recursion limit (about 1000 calls by default)."))
        if ms.uses_string_multiplication:
            c.append((1, "Repeating a string or list with `*` allocates the whole repeated result immediately."))

        # ---- 1: patterns ----------------------------------------------------
        if ms.allocates_2d_lists:
            c.append((1, "A grid/matrix stores n separate rows, so memory grows with rows x columns -- doubling both dimensions quadruples the memory."))
        elif ms.allocates_lists or ms.uses_list_comprehension:
            c.append((1, "Building a new list reserves a fresh block of memory big enough for every element."))
        if ms.allocates_sets or ms.uses_set_comprehension:
            c.append((1, "Sets are fast for membership checks, but the hash table keeps spare empty slots, so a set usually uses more memory than a list of the same size."))
        if sig.uses_yield:
            c.append((1, "`yield` is the memory-efficient choice: it hands back one item at a time instead of building the whole result, keeping space at O(1) however much data flows through."))
        if ms.allocates_counter:
            c.append((1, "A `Counter` is a dictionary underneath: its size depends on how many *distinct* items there are, not how many items you counted."))
        if ms.uses_heap:
            c.append((1, "A heap stores its items in one flat list internally, so it's as memory-efficient as a plain list."))
        if ms.inplace_swap:
            c.append((1, "Swapping existing values needs no new memory -- that's what 'in place' means."))

        # ---- 2: facts -------------------------------------------------------
        if ms.array_preallocation or sig.paradigms.is_tabulation_setup:
            c.append((2, "Pre-allocating with `[value] * n` reserves exactly the memory you need up front instead of growing a list one `.append()` at a time."))
        if ms.allocates_view_object:
            c.append((2, "`.keys()`, `.values()` and `.items()` return lightweight views, not copies -- nearly free to create."))

        # ---- observed: what really happened in the learner's last run ------
        if mem_state:
            # Only report variables this line actually touches -- otherwise the same
            # "list grew to N" note would repeat on every line of the function.
            referenced = None
            if node is not None:
                # compound statements: only their header (loop iterable/target, if/while test)
                if isinstance(node, (ast.For, ast.AsyncFor)):
                    scope = [node.target, node.iter]
                elif isinstance(node, (ast.While, ast.If)):
                    scope = [node.test]
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    scope = []
                else:
                    scope = [node]
                referenced = {n.id for part in scope for n in ast.walk(part) if isinstance(n, ast.Name)}
            items = [(k, d) for k, d in mem_state.items() if referenced is None or k in referenced]
            largest = max(items, key=lambda x: x[1].get('size', 0), default=None)
            if largest and largest[1].get('size', 0) > 1:
                c.append((1, f"**From your last run:** `{largest[0]}` grew to hold {largest[1]['size']} element(s) at this line -- the biggest structure seen here. That growth is the memory Big-O is describing: run it again with a larger input and watch how this number grows."))

        line_notes = []
        if node is not None:
            line_notes = self.generator.line_insights.space_notes(node, sig, local_s, global_s, mem_state, hits)
        merged = self._merge(line_notes, c) or [self._FALLBACK_SPACE]
        return self._top(merged, MAX_SPACE_INSIGHTS)
