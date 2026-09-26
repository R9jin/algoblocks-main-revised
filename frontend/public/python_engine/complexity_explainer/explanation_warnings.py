"""
Explanation Warnings

Short-form bottleneck warnings and optimization praise strings shown
alongside a line's badge, plus recurrence-relation display formatting.
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

class ExplanationWarnings:
    """Short-form bottleneck warnings/praise. Composed into
    EducationalInsightGenerator as `self.explanation_warnings`; reads shared
    state via `self.generator`.
    """

    def __init__(self, generator):
        self.generator = generator

    def get_time_bottleneck_warning(self, operation: str, final_time: str) -> str:
        op_lower = operation.lower()

        if "loop" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Time Goes:** The reason this ends up at {final_time} is simply how many times this {op_lower} repeats. That's the real bottleneck.",
            )
        elif "recur" in op_lower or "call" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Time Goes:** This {op_lower} keeps solving overlapping subproblems from scratch instead of reusing earlier answers, which is what pushes the time up to {final_time}.",
            )
        elif "comprehension" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Time Goes:** Even though this {op_lower} fits on one line, it's still doing real iteration underneath -- that hidden looping is what sets the {final_time} cost.",
            )
        elif "sort" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Time Goes:** Sorting is inherently O(n log n) work. This {op_lower} is the main reason the algorithm can't run faster than {final_time}.",
            )
        else:
            return self.generator._v(
                f"\n\n**Where the Time Goes:** Most of the actual work happens inside this {op_lower}, which is what decides the final {final_time} time complexity.",
            )

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()

        if "recur" in op_lower or "call" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Memory Goes:** Every call inside this {op_lower} keeps its own frame on the stack until it finishes, which drives peak memory use up to {final_space}.",
            )
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower or "expansion" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Memory Goes:** Rather than reusing existing memory, this {op_lower} builds a brand-new structure, which is what pushes memory use up to {final_space}.",
            )
        elif "slice" in op_lower or "string" in op_lower or "concat" in op_lower:
            return self.generator._v(
                f"\n\n**Where the Memory Goes:** Slicing and string-building both copy data into new memory rather than reusing what's there, so this {op_lower} is what drives peak memory use to {final_space}.",
            )
        else:
            return self.generator._v(
                f"\n\n**Where the Memory Goes:** The new data this {op_lower} has to hold onto is what pushes total memory use up to {final_space}.",
            )

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()

        if "log" in time_lower:
            return self.generator._v(
                f"\n\n**Nice Work Here:** Cutting the problem in half at each step is a genuinely great optimization. This {operation.lower()} scales impressively well, landing at {global_time}.",
            )
        elif "√" in time_lower or "sqrt" in time_lower:
            return self.generator._v(
                f"\n\n**Nice Work Here:** Smart move -- only checking up to the square root avoids a huge number of unnecessary checks. This {operation.lower()} runs in a solid {global_time}.",
            )
        elif "1" in time_lower:
            return self.generator._v(
                f"\n\n**Nice Work Here:** About as efficient as it gets -- grabbing values directly by key or index means this {operation.lower()} runs in constant time, {global_time}.",
            )
        else:
            return self.generator._v(
                f"\n\n**Nice Work Here:** This {operation.lower()} is well structured, avoiding unnecessary repeated work and keeping the cost down to {global_time}.",
            )

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation
