"""
Insight Gatherers

Collects the list of human-readable time/space insights (bottlenecks,
notable operations) surfaced for a given set of pattern signals.
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

from complexity_explainer.explanation_signals import BigOInfo, MemorySignals, ComplexitySignals, AlgorithmicParadigms, PatternSignals

class InsightGatherers:
    """Bottleneck/insight collection. Composed into EducationalInsightGenerator
    as `self.insight_gatherers`; reads shared state via `self.generator`.
    """

    def __init__(self, generator):
        self.generator = generator

    def _gather_time_insights(self, sig: PatternSignals, local_t: str) -> List[str]:
        insights = []
        if sig.paradigms.is_halving:
            insights.append(self.generator._v(
                "Tip: cutting the input in half each time is what gives you O(log n). Even a billion items only takes about 30 steps to search this way.",
                "Why this is fast: every halving step throws away 50% of what's left, so the work needed barely grows even as the input gets huge.",
            ))
        if sig.paradigms.is_two_pointer:
            insights.append(self.generator._v(
                "Tip: the two-pointer pattern is a common way to turn a slow O(n^2) nested loop into a single O(n) pass -- worth remembering for array/string problems.",
            ))
        if sig.paradigms.is_kadane:
            insights.append(self.generator._v(
                "This is Kadane's algorithm territory: instead of checking every possible subarray (which would be O(n^2)), it keeps a running best and updates it in one O(n) pass.",
            ))
        if sig.paradigms.is_priority_queue:
            insights.append(self.generator._v(
                "Heaps (priority queues) keep the smallest/largest item within reach at all times. Pushing or popping costs O(log n) -- much better than sorting the whole thing every time you need the next best item.",
            ))
        if sig.paradigms.is_brian_kernighan:
            insights.append(self.generator._v(
                "Neat trick: `n & (n - 1)` clears the lowest set bit. Looping with this only takes as many steps as there are 1-bits, instead of checking every bit position.",
            ))
        if sig.paradigms.is_memoization_check:
            insights.append(self.generator._v(
                "This is memoization: before doing real work, the code checks \"have I already solved this exact subproblem?\" If yes, it just returns the saved answer instead of recomputing it -- this is what turns exponential recursion into something much more manageable.",
            ))
        if sig.paradigms.is_fibonacci_sequence:
            insights.append(self.generator._v(
                "Updating both values on one line means the right-hand side is fully computed first, then assigned -- a clean way to slide a two-value \"window\" forward without a temp variable.",
            ))
        if sig.paradigms.is_combinatorics:
            insights.append(self.generator._v(
                "Careful with factorials and permutations -- they grow faster than almost anything else (O(n!)). Even n=15 already means over a trillion possibilities.",
            ))
        if sig.paradigms.is_union_find:
            insights.append(self.generator._v(
                "Union-Find (Disjoint Set) answers \"are these two things connected?\" in close to O(1) time once you add path compression -- a big upgrade over checking connectivity by searching the whole structure.",
            ))
        if sig.complexity_signals.quadratic_math:
            insights.append(self.generator._v(
                "Squaring a number is simple arithmetic for the CPU, so don't worry about it being a bottleneck by itself.",
            ))

        if sig.memory_signals.geometric_capacity_growth:
            insights.append(self.generator._v(
                "Watch out: growing a list or string by combining it with itself inside a loop causes the memory needed to double repeatedly. That turns an innocent-looking loop into something surprisingly slow.",
            ))
        elif sig.memory_signals.string_concatenation_in_loop:
            insights.append(self.generator._v(
                "Common trap: strings can't be changed in place, so `+=` on a string inside a loop rebuilds the whole thing every time. A faster fix: collect the pieces in a list and call `''.join(...)` once at the end.",
            ))
        elif sig.memory_signals.uses_join_for_strings:
            insights.append(self.generator._v(
                "Good practice: `.join()` builds the final string in one efficient pass, which is exactly why it's preferred over repeatedly gluing strings together with `+=`.",
            ))
        elif sig.complexity_signals.f_string_usage:
            insights.append(self.generator._v(
                "f-strings are efficient -- Python builds the final string in one go, so this isn't something to worry about performance-wise.",
            ))

        if sig.complexity_signals.aggregation_in_loop:
            insights.append(self.generator._v(
                "Heads up: calling `sum()`, `max()`, or `min()` inside a loop re-scans everything each time it's called. If you just need a running total, track it in a plain variable instead.",
            ))

        if sig.complexity_signals.inefficient_list_pop:
            insights.append(self.generator._v(
                "Removing from the front of a list (`pop(0)`) is O(n), because every remaining item has to shift over by one. If you need to pop from the front often, `collections.deque` does it in O(1).",
            ))
        if sig.complexity_signals.inefficient_list_insert:
            insights.append(self.generator._v(
                "Inserting at the very start of a list is O(n) for the same reason -- everything already there has to shift over to make room.",
            ))
        if sig.complexity_signals.repeated_sort:
            insights.append(self.generator._v(
                "Sorting costs O(n log n) by itself, so doing it repeatedly inside a loop adds up fast. Try sorting once, outside the loop, whenever you can.",
            ))
        if sig.complexity_signals.set_mathematical_ops:
            insights.append(self.generator._v(
                "Using built-in set operations (union, intersection, etc.) is usually much faster and cleaner than writing your own nested loops to compare items.",
            ))
        if sig.complexity_signals.dict_lookup_constant:
            insights.append(self.generator._v(
                "Dictionary lookups are O(1) on average -- one of the best trade-offs in programming, since it's basically free compared to scanning a list.",
            ))
        if sig.complexity_signals.list_reverse_op:
            insights.append(self.generator._v(
                "Reversing a list is O(n) -- every element gets touched once, no matter how the list is organized.",
            ))
        if sig.complexity_signals.list_count_op:
            insights.append(self.generator._v(
                "`.count()` has to scan the whole list to tally matches, so it's O(n). If you're counting things repeatedly, a `Counter` (from `collections`) built once is usually a better fit.",
            ))
        if sig.memory_signals.sorted_makes_a_copy:
            insights.append(self.generator._v(
                "`sorted()` returns a brand-new list and leaves the original alone, while `.sort()` rearranges the list in place. Same time cost, but different memory trade-off -- worth knowing which one you actually need.",
            ))
        if sig.complexity_signals.iteration_helper_usage:
            insights.append(self.generator._v(
                "Helpers like `zip()`, `enumerate()`, `map()`, and `filter()` don't change the underlying cost of a loop -- they just make the code cleaner to read and write.",
            ))
        if sig.complexity_signals.type_conversion:
            insights.append(self.generator._v(
                "Converting between types (like `list()`, `str()`, `set()`) is usually O(1) for a single value, but O(n) if you're converting an entire collection, since every element has to be visited.",
            ))
        if sig.complexity_signals.binary_search_module:
            insights.append(self.generator._v(
                "The `bisect` module does binary search for you in O(log n) -- no need to write the halving logic by hand.",
            ))
        if sig.complexity_signals.itertools_usage:
            insights.append(self.generator._v(
                "`itertools` functions are written to be memory-efficient (often lazy), but the number of combinations/permutations they generate can still grow very fast, so the real cost depends on what you do with the output.",
            ))
        if sig.has_early_exits or sig.has_continue:
            insights.append(self.generator._v(
                "Using `break`, `continue`, or an early `return` here lets the algorithm skip unnecessary work the moment it knows the answer -- a simple, effective optimization.",
            ))

        if sig.uses_try_except:
            if sig.complexity_signals.exception_control_flow:
                insights.append(self.generator._v(
                    "A small catch: using `try/except` for everyday control flow inside a hot loop is slower than a plain `if` check, since building an exception object isn't free.",
                ))
            else:
                insights.append(self.generator._v(
                    "`try/except` here is good practice -- it catches unexpected problems gracefully instead of letting the whole program crash.",
                ))
        if sig.uses_context_manager:
            insights.append(self.generator._v(
                "The `with` block automatically cleans up (closing files, releasing locks, etc.) even if an error happens partway through -- safer than doing cleanup manually.",
            ))
        if sig.uses_walrus:
            insights.append(self.generator._v(
                "The walrus operator (`:=`) lets you assign and use a value in the same expression -- handy for avoiding a duplicate function call or an extra line.",
            ))

        return insights

    def _gather_space_insights(self, sig: PatternSignals, mem_state: dict) -> List[str]:
        insights = []
        if sig.paradigms.is_tabulation_setup or sig.memory_signals.array_preallocation:
            insights.append(self.generator._v(
                "Pre-allocating a list with `[value] * n` reserves exactly the memory you need up front, avoiding the small repeated costs of growing a list one `.append()` at a time.",
            ))
        if sig.memory_signals.inplace_swap:
            insights.append(self.generator._v(
                "Since this swaps values that already exist, no new memory is needed -- nice and lightweight.",
            ))

        if sig.memory_signals.allocates_2d_lists:
            insights.append(self.generator._v(
                "A 2D structure like a grid or matrix takes noticeably more memory than a flat list, since you're really storing n separate rows.",
            ))
        elif sig.memory_signals.allocates_lists or sig.memory_signals.uses_list_comprehension:
            insights.append(self.generator._v(
                "Building a new list means Python reserves a fresh block of memory to hold every element in it.",
            ))

        if sig.memory_signals.allocates_sets or sig.memory_signals.uses_set_comprehension:
            insights.append(self.generator._v(
                "Sets are fast for lookups, but that speed comes from a hash table that keeps some extra empty space to avoid collisions -- so a set typically uses more memory than a list with the same number of items.",
            ))
        if sig.memory_signals.performs_slicing:
            insights.append(self.generator._v(
                "Slicing a list or string copies those elements into a brand-new object. Doing this repeatedly inside a loop or recursive call can quietly use a lot of memory.",
            ))
        if sig.memory_signals.recursive_stack_risk:
            insights.append(self.generator._v(
                "Every recursive call keeps its own frame on the call stack until it returns. Very deep recursion can use a surprising amount of memory (and may even hit Python's recursion limit).",
            ))
        if sig.memory_signals.uses_heap:
            insights.append(self.generator._v(
                "A heap stores its elements in a single flat list internally, so it's about as memory-efficient as a regular list, just with a different internal order.",
            ))
        if sig.memory_signals.allocates_counter:
            insights.append(self.generator._v(
                "A `Counter` is just a dictionary under the hood, storing one entry per unique item -- so its size depends on how many *distinct* items there are, not the total count.",
            ))
        if sig.memory_signals.creates_new_list_from_concat:
            insights.append(self.generator._v(
                "Combining two lists with `+` builds an entirely new list. If this happens inside a loop, you're paying that copying cost every single time -- `.extend()` in place is usually cheaper.",
            ))
        if sig.memory_signals.uses_string_multiplication:
            insights.append(self.generator._v(
                "Repeating a string or list with `*` allocates enough memory for the whole repeated result immediately.",
            ))
        if sig.memory_signals.allocates_view_object:
            insights.append(self.generator._v(
                "`.keys()`, `.values()`, and `.items()` return lightweight views, not full copies -- they barely cost anything to create, though looping through one still takes one step per entry.",
            ))

        if sig.uses_yield:
            insights.append(self.generator._v(
                "`yield` is the memory-efficient choice here: instead of building the whole result list in memory, it hands back one item at a time, keeping space usage at O(1) regardless of how much data there is overall.",
            ))

        if mem_state:
            largest = max(mem_state.items(), key=lambda x: x[1]['size'], default=None)
            if largest and largest[1]['size'] > 1:
                insights.append(self.generator._v(
                    f"While actually running, `{largest[0]}` grew to hold {largest[1]['size']} element(s) -- the biggest structure observed during this run.",
                ))

        return insights

    # =========================================================================
    # OVERALL COMPLEXITY ANALYSIS GENERATOR (REAL MATH ENGINE)
    # =========================================================================
