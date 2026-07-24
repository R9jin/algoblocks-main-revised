"""
Variable Explanations

Per-line, per-variable natural-language explanation builders (local
and global time/space narration for a single recorded line) -- the
NLG counterpart of the Dependency-Ordered Signature Pass.
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

from explanation_signals import BigOInfo, MemorySignals, ComplexitySignals, AlgorithmicParadigms, PatternSignals

class VariableExplanations:
    """Per-line, per-variable NLG. Composed into EducationalInsightGenerator
    as `self.variable_explanations`; reads shared state via `self.generator`.
    """

    def __init__(self, generator):
        self.generator = generator

    def generate_variable_explanation(self, var_name: str, var_data: dict, var_type: str = None) -> str:
        size = var_data.get("size", 1)
        v_lower = var_name.lower()

        eff_type = var_type
        if not eff_type:
            if isinstance(var_data.get("value"), list) or any(k in v_lower for k in ['arr', 'list', 'nums', 'stack', 'queue', 'dp']):
                eff_type = 'list'
            elif isinstance(var_data.get("value"), dict) or any(k in v_lower for k in ['map', 'dict', 'memo', 'cache']):
                eff_type = 'dict'
            elif isinstance(var_data.get("value"), set) or 'set' in v_lower or 'visit' in v_lower:
                eff_type = 'set'

        if eff_type == 'list':
            if 'stack' in v_lower:
                return self.generator._v(
                    f"This is being used as a stack: `{var_name}` currently holds {size} item(s). Stacks are Last-In-First-Out, so whatever gets added most recently is the first thing to come back out.",
                    f"`{var_name}` is playing the role of a stack here, holding {size} item(s) right now. New items get added and removed from the same end, like a stack of plates.",
                )
            if 'queue' in v_lower:
                return self.generator._v(
                    f"This is a queue: `{var_name}` holds {size} item(s) and follows First-In-First-Out order, just like a line of people waiting.",
                    f"`{var_name}` acts as a queue, currently holding {size} item(s). Whatever was added first gets processed first.",
                )
            if 'dp' in v_lower or 'memo' in v_lower:
                return self.generator._v(
                    f"This looks like a DP (dynamic programming) table: it's storing {size} already-solved subproblem answer(s), so the algorithm never has to redo that work.",
                    f"`{var_name}` is a memo/DP array holding {size} cached result(s). Instead of recomputing the same subproblem, the algorithm just looks it up here.",
                )
            return self.generator._v(
                f"`{var_name}` is a regular list currently holding {size} element(s), stored one after another in memory.",
                f"This is a list with {size} element(s) in it right now, laid out back-to-back so any index can be reached instantly.",
            )

        if eff_type == 'dict':
            if 'memo' in v_lower or 'cache' in v_lower or 'dp' in v_lower:
                return self.generator._v(
                    f"`{var_name}` is a memoization cache with {size} entr(y/ies) saved so far -- once a result is computed once, it's stored here so it never needs to be recalculated.",
                    f"This dictionary caches {size} previously-computed result(s), which is exactly how memoization turns a slow recursive tree into something much faster.",
                )
            if 'graph' in v_lower or 'adj' in v_lower:
                return self.generator._v(
                    f"`{var_name}` is an adjacency list -- it maps each of its {size} node(s) to the neighbors it connects to, which is how the graph's shape is stored.",
                    f"This dictionary represents the graph's structure: {size} node(s), each pointing to its neighbors.",
                )
            return self.generator._v(
                f"`{var_name}` is a dictionary (hash map) with {size} key-value pair(s). Looking something up here is normally O(1) -- basically instant, regardless of how big it gets.",
                f"This is a hash map holding {size} pair(s) right now. The whole point of a dictionary is that lookups stay fast even as it grows.",
            )

        if eff_type == 'set':
            if 'visit' in v_lower or 'seen' in v_lower:
                return self.generator._v(
                    f"`{var_name}` is a \"visited\" set tracking {size} item(s) so the algorithm never processes the same node twice.",
                    f"This set remembers {size} already-seen item(s), which is what stops the traversal from looping forever.",
                )
            return self.generator._v(
                f"`{var_name}` is a set holding {size} unique element(s). Sets automatically drop duplicates and give near-instant \"is this in here?\" checks.",
                f"This is a set with {size} distinct item(s) -- great for checking membership quickly without scanning everything.",
            )

        if eff_type == 'tuple' or 'tup' in v_lower:
            return self.generator._v(
                f"`{var_name}` is a tuple bundling {size} value(s) together. Tuples can't be changed after creation, so Python doesn't need any extra room to let them grow.",
                f"This is a fixed-size tuple with {size} value(s) -- immutable, so there's no resizing overhead to worry about.",
            )

        if eff_type == 'str' or 'str' in v_lower or 'char' in v_lower:
            if size > 1:
                return self.generator._v(
                    f"`{var_name}` is a string of about {size} character(s). Strings are immutable in Python, so any change actually builds a new string behind the scenes.",
                    f"This string holds roughly {size} character(s). Remember: editing a string doesn't modify it in place, it creates a new one.",
                )
            return "This is a single character or short string, taking up a tiny, fixed amount of memory."

        if any(k in v_lower for k in ['ptr', 'idx', 'left', 'right', 'low', 'high', 'mid', 'i', 'j', 'k']):
            return self.generator._v(
                "This is a pointer/index variable -- just a single number tracking a position. It costs O(1) memory no matter how big the data it points into is.",
                "Just a small index variable here, tracking one position. It takes up the same tiny amount of space regardless of input size.",
            )
        if any(k in v_lower for k in ['total', 'sum', 'count', 'res', 'ans']):
            return self.generator._v(
                "This is an accumulator -- a single running value being updated as the algorithm goes. One number, O(1) space, no matter how much data it's summarizing.",
                "This variable just keeps a running tally. It's one scalar value, so it stays at O(1) space the whole time.",
            )
        if any(k in v_lower for k in ['pivot', 'temp', 'curr', 'node', 'val', 'key', 'element']):
            return self.generator._v(
                "This is a temporary variable holding whatever value is currently being worked on -- a simple O(1) scalar.",
                "Just a short-lived variable holding the current value in progress. O(1) space.",
            )

        if size > 1:
            return f"`{var_name}` is currently holding {size} element(s) worth of data."

        return "This is a plain scalar variable -- a single value taking up a small, constant amount of memory."

    def _classify_big_o(self, complexity_str: str) -> BigOInfo:
        c = complexity_str.lower()
        family = "unknown"

        if c == "o(1)" or "amortized" in c:
            family = "constant"
        elif "n log n" in c:
            family = "linearithmic"
        elif "log" in c:
            family = "logarithmic"
        elif "√" in c or "sqrt" in c:
            family = "root"
        elif "n!" in c:
            family = "factorial"
        elif "n^n" in c:
            family = "super_exponential"
        elif "2^n" in c or "c(" in c or "2ⁿ" in c:
            family = "exponential"
        elif "n^2" in c or "n²" in c or "n^3" in c or "n³" in c or "n * m" in c or "n^d" in c:
            family = "polynomial"
        elif "v + e" in c or "v" in c:
            family = "graph"
        elif "n" in c:
            family = "linear"
        elif "t(" in c:
            family = "recursive_branching"

        return BigOInfo(raw=complexity_str, normalized=complexity_str, family=family, factors={})

    # -------------------------------------------------------------------
    # Line intro: "what is this line doing?"
    # -------------------------------------------------------------------
    def _build_action_intro(self, node: ast.AST, code_snippet: str, sig: PatternSignals) -> str:
        ref = f"`{code_snippet}`" if code_snippet else "this line"

        if sig.paradigms.is_halving:
            return self.generator._v(
                f"{ref} cuts the problem in half. That halving is the whole reason logarithmic algorithms are so fast.",
                f"Here, {ref} throws away half of what's left to search or process -- the classic move behind O(log n).",
            )
        if sig.paradigms.is_two_pointer:
            return self.generator._v(
                f"{ref} compares two positions moving toward each other -- a hallmark of the two-pointer technique.",
                f"You can spot the two-pointer pattern in {ref}: two indices closing in on each other instead of a nested loop.",
            )
        if sig.paradigms.is_kadane:
            return self.generator._v(
                f"{ref} keeps a running \"best so far\" value -- this is the core idea behind Kadane's algorithm for max subarray-style problems.",
                f"{ref} updates a running best/max as it goes, so the algorithm never has to look backward to recompute anything.",
            )
        if sig.paradigms.is_priority_queue:
            return self.generator._v(
                f"{ref} works with a heap (priority queue), which always keeps the smallest (or largest) item ready to grab in O(log n) time.",
                f"{ref} is a heap operation -- it keeps items loosely sorted so the next \"best\" one is always quick to reach.",
            )
        if sig.paradigms.is_tabulation_setup:
            return self.generator._v(
                f"{ref} sets up a table upfront -- classic dynamic-programming tabulation, building answers bottom-up instead of recursing.",
                f"{ref} pre-builds a results table before the real work starts, which is how tabulated DP avoids repeated recursive calls.",
            )
        if sig.paradigms.is_fibonacci_sequence:
            return self.generator._v(
                f"{ref} shifts a pair of running values forward in one step -- a pattern you'll recognize from Fibonacci-style sequences.",
                f"{ref} updates two values at once, sliding the \"window\" of state forward without needing a temporary variable.",
            )
        if sig.paradigms.is_brian_kernighan:
            return self.generator._v(
                f"{ref} uses a neat bit trick to clear the lowest set bit in one step, instead of checking every bit one by one.",
                f"{ref} is Brian Kernighan's bit trick -- it strips off one set bit at a time, so the loop only runs once per 1-bit in the number.",
            )
        if sig.paradigms.is_combinatorics:
            return self.generator._v(
                f"{ref} runs a combinatorics calculation (permutations, combinations, or factorials). These grow extremely fast, even for small inputs.",
                f"{ref} computes something like a factorial or permutation count -- numbers that blow up quickly as n grows.",
            )
        if sig.paradigms.is_euclidean_distance:
            return self.generator._v(
                f"{ref} computes a distance between two points, which means some squaring and a square root under the hood.",
                f"{ref} works out a straight-line distance -- simple math, but it does involve a square root.",
            )
        if sig.paradigms.is_union_find:
            return self.generator._v(
                f"{ref} looks like a Union-Find (Disjoint Set) operation, used to quickly check if two items belong to the same group.",
            )

        if isinstance(node, ast.Assign):
            return self.generator._v(
                f"{ref} stores a value in a variable.",
                f"{ref} assigns the result of an expression to a variable so it can be reused later.",
            )
        elif isinstance(node, ast.AugAssign):
            return self.generator._v(
                f"{ref} updates an existing variable in place (like `+=` or `*=`).",
                f"{ref} modifies a variable based on its current value.",
            )
        elif isinstance(node, ast.Delete):
            return self.generator._v(
                f"{ref} removes a variable or item, freeing up whatever it was pointing to.",
            )
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            return self.generator._v(
                f"{ref} tells Python to use a variable from an outer scope instead of creating a new local one.",
            )
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                method = node.func.attr
                if method == 'join':
                    return self.generator._v(f"{ref} joins a list of strings into one -- this is the efficient way to build a string, much better than gluing strings together in a loop.")
                if method == 'split':
                    return self.generator._v(f"{ref} breaks a string apart into a list of pieces.")
                if method in ('sort',):
                    return self.generator._v(f"{ref} sorts the list in place -- no new list is created, just the existing one gets rearranged.")
                if method in ('keys', 'values', 'items'):
                    return self.generator._v(f"{ref} grabs a view of the dictionary's {method} -- lightweight to create, but reading through it still costs one step per entry.")
                if method in ('heappush', 'heappop'):
                    return self.generator._v(f"{ref} pushes or pops from a heap, keeping the smallest item accessible in O(log n).")
                return self.generator._v(
                    f"{ref} calls the `.{method}()` method to do something to the data it belongs to.",
                    f"{ref} runs `.{method}()`, a built-in operation on this object.",
                )
            elif isinstance(node.func, ast.Name):
                fname = node.func.id
                if fname == 'sorted':
                    return self.generator._v(f"{ref} builds a brand-new sorted list, leaving the original untouched (unlike `.sort()`).")
                if fname in ('zip', 'enumerate', 'map', 'filter'):
                    return self.generator._v(f"{ref} uses `{fname}()` to loop over data more cleanly, without changing the underlying cost of the loop.")
                if fname == 'Counter':
                    return self.generator._v(f"{ref} tallies up how often each item appears, building a frequency map in one pass.")
                return self.generator._v(
                    f"{ref} calls the function `{fname}()`.",
                    f"{ref} triggers `{fname}()` to run.",
                )
            return self.generator._v(f"{ref} runs a function call.")
        elif isinstance(node, ast.For):
            return self.generator._v(
                f"{ref} starts a loop that walks through a collection, one item at a time.",
                f"{ref} is a `for` loop -- it repeats its body once per item in whatever it's iterating over.",
            )
        elif isinstance(node, ast.While):
            return self.generator._v(
                f"{ref} is a `while` loop -- it keeps repeating as long as its condition stays true.",
                f"{ref} loops for as long as the given condition holds, however many times that ends up being.",
            )
        elif isinstance(node, ast.If):
            return self.generator._v(
                f"{ref} branches the logic -- one path runs if the condition is true, a different path (or nothing) runs if it's false.",
                f"{ref} is a decision point: the condition determines which piece of code actually runs.",
            )
        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp)):
            return self.generator._v(
                f"{ref} is a comprehension -- a compact way to build a collection in one line. It still loops under the hood, just written more tersely.",
                f"{ref} builds a new collection in a single expression. It's shorter to write, but Python still processes each item, so the cost is the same as writing the loop out by hand.",
            )
        elif isinstance(node, ast.Return):
            return self.generator._v(
                f"{ref} sends a value back to whoever called this function.",
                f"{ref} ends the function here and hands back the result.",
            )
        elif isinstance(node, ast.Subscript):
            if isinstance(getattr(node, 'slice', None), ast.Slice):
                return self.generator._v(f"{ref} takes a slice -- a copy of part of the sequence.")
            return self.generator._v(f"{ref} reaches directly into a list or dictionary to grab one specific item.")
        elif isinstance(node, ast.Try):
            return self.generator._v(f"{ref} wraps some code in a `try/except` block, so if something goes wrong, the program can recover instead of crashing.")
        elif isinstance(node, ast.With):
            return self.generator._v(f"{ref} opens a `with` block, which takes care of cleanup automatically (closing a file, releasing a lock, etc.).")
        elif isinstance(node, (ast.Yield, ast.YieldFrom)):
            return self.generator._v(f"{ref} yields a value, pausing the function here -- this is what makes it a generator instead of a normal function.")
        elif isinstance(node, ast.Lambda):
            return self.generator._v(f"{ref} defines a small, unnamed function inline, meant for quick, throwaway use.")
        elif isinstance(node, ast.Raise):
            return self.generator._v(f"{ref} deliberately raises an error, stopping normal execution here.")
        elif isinstance(node, ast.Assert):
            return self.generator._v(f"{ref} checks that a condition holds, and stops the program if it doesn't.")
        elif sig.has_docstring:
            return self.generator._v(f"{ref} is a docstring -- documentation for humans, not something that runs.")
        elif sig.has_comment_block:
            return self.generator._v(f"{ref} is a comment or unused string -- it doesn't affect how the program runs.")

        return self.generator._v(f"{ref} performs a step in the algorithm.")

    # -------------------------------------------------------------------
    # Local time / space: "what does this line cost on its own?"
    # -------------------------------------------------------------------
    def _build_local_time_explanation(self, local_info: BigOInfo, sig: PatternSignals) -> str:
        family = local_info.family

        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v(
                "It's just documentation, so it costs nothing when the program actually runs -- that's O(1).",
                "Comments and docstrings never execute as code, so there's zero runtime cost here.",
            )

        if sig.complexity_signals.amortized_operation:
            return self.generator._v(
                "On its own, this is O(1) on average. Every once in a while it needs a little extra work behind the scenes (like resizing a list), but spread out over many calls, it still averages out to constant time.",
                "This is what's called \"amortized O(1)\": almost always instant, with the occasional slightly-more-expensive call balancing out over time.",
            )

        if family == "constant":
            return self.generator._v(
                "By itself, this line is O(1) -- it does a fixed amount of work no matter how big the input is.",
                "On its own, this is a constant-time step: one operation, done once.",
            )
        elif family == "linear":
            return self.generator._v(
                f"On its own, this line is {local_info.raw} -- it has to touch every item in whatever it's working with.",
                f"By itself, this step costs {local_info.raw}: the work grows one-to-one with the size of the data.",
            )
        elif family == "logarithmic":
            return self.generator._v(
                f"By itself, this step is {local_info.raw} -- it cuts down the amount of work it has left with each step, so it stays fast even on large inputs.",
                f"On its own, this runs in {local_info.raw}, since it keeps shrinking the problem instead of checking everything.",
            )
        elif family == "polynomial":
            return self.generator._v(
                f"On its own, this step is {local_info.raw} -- it repeats work in a nested way, so the cost grows faster than just linear.",
                f"By itself, this line costs {local_info.raw}. That usually means one loop is doing repeated work for every step of another loop.",
            )
        elif "placeholder" in local_info.raw or local_info.raw.startswith("T("):
            return self.generator._v(
                "This is a recursive call, so its exact cost depends on how deep and how wide the recursion tree ends up being -- we can't pin down a single number just from this line alone.",
            )

        return f"On its own, this line costs {local_info.raw}."

    def _build_local_space_explanation(self, local_info: BigOInfo, sig: PatternSignals) -> str:
        family = local_info.family

        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v(
                "Documentation doesn't use any memory while the program runs, so this is O(1).",
            )

        if sig.memory_signals.inplace_swap:
            return self.generator._v(
                "Since this just swaps values that already exist, it needs zero extra memory -- O(1).",
            )

        if family == "constant":
            return self.generator._v(
                "This line uses O(1) memory -- it's just working with a few small variables, not building anything new and sizeable.",
                "Locally, the memory cost here is constant: no new data structures are being created.",
            )
        elif family == "linear":
            return self.generator._v(
                f"On its own, this line needs {local_info.raw} of new memory, since it's building something whose size depends on the input.",
                f"By itself, this step allocates {local_info.raw} worth of space for a new structure.",
            )
        elif family == "polynomial":
            return self.generator._v(
                f"This line builds a multi-dimensional structure (like a grid or matrix), which costs {local_info.raw} -- noticeably more than a flat list.",
            )
        elif "placeholder" in local_info.raw:
            return self.generator._v("The memory this needs isn't fixed -- it depends on how the recursion unfolds at runtime.")

        return f"On its own, this line's memory cost is {local_info.raw}."

    # -------------------------------------------------------------------
    # Global time / space: "what does this line cost once you factor in
    # everything around it (loops, recursion)?"
    # -------------------------------------------------------------------
    def _build_global_time_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals) -> str:
        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v(
                "It doesn't affect the algorithm's overall speed at all -- documentation never runs.",
            )

        if local_info.raw == global_info.raw:
            return self.generator._v(
                f"This is the most expensive part of the whole algorithm, so it's actually what sets the overall time complexity: {global_info.raw}.",
                f"There's nothing more expensive happening elsewhere, so this line alone decides the total time complexity: {global_info.raw}.",
            )

        if global_info.family == "polynomial" and local_info.family in ["linear", "constant"]:
            if sig.nested_loops:
                return self.generator._v(
                    f"But since this sits inside nested loops, it doesn't just run once -- it runs once for every combination of outer and inner steps. That's what pushes the overall time up to {global_info.raw}.",
                    f"On its own it's cheap, but nested loops mean it fires over and over -- so the total cost climbs to {global_info.raw}.",
                )
            return self.generator._v(
                f"Because this gets repeated so many times overall, the total time adds up to {global_info.raw}.",
            )

        if global_info.family in ["exponential", "recursive_branching", "super_exponential"]:
            if sig.has_recursion:
                return self.generator._v(
                    f"Each recursive call here spawns more calls, and that branching multiplies fast -- the total blows up to {global_info.raw}.",
                    f"Because the recursion keeps splitting into more calls without saving previous answers, the work roughly doubles at each level, landing at {global_info.raw} overall.",
                )
            return self.generator._v(f"The way this is structured causes the number of operations to explode combinatorially, bringing the total up to {global_info.raw}.")

        if global_info.family == "linear" and local_info.family == "constant":
            if sig.loop_depth > 0:
                return self.generator._v(
                    f"This O(1) step runs once per loop iteration, so across the whole loop it adds up to {global_info.raw}.",
                    f"One cheap step, repeated for every item in the loop -- that's how you get {global_info.raw} overall.",
                )

        if global_info.family == "linearithmic" and local_info.family in ["constant", "linear"]:
            return self.generator._v(
                f"Combined with the sorting or divide-and-conquer logic around it, the total cost works out to {global_info.raw}.",
            )

        return self.generator._v(f"Once you account for everything happening around it, this line's contribution to the overall time complexity is {global_info.raw}.")

    def _build_global_space_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals) -> str:
        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v("Comments don't take up any runtime memory, so they don't affect the overall space complexity at all.")

        if local_info.raw == global_info.raw:
            return self.generator._v(
                f"This is the single biggest memory user in the whole algorithm, so it defines the overall space complexity: {global_info.raw}.",
            )

        if global_info.family == "linear" and local_info.family == "constant":
            if sig.has_recursion:
                return self.generator._v(
                    f"Because this function calls itself, each call adds another O(1) frame to the call stack. Stack them all up and you get {global_info.raw} overall.",
                    f"Every recursive call keeps its own small frame on the stack -- add them all together and the total memory reaches {global_info.raw}.",
                )
            return self.generator._v(
                f"On its own it's cheap, but the data being built up across the whole run adds up to {global_info.raw} overall.",
            )

        if global_info.family == "polynomial" and local_info.family in ["linear", "constant"]:
            return self.generator._v(
                f"The surrounding logic ends up building a dense, multi-layered structure, pushing peak memory use to {global_info.raw}.",
            )

        return self.generator._v(f"Once you factor in the peak memory used across the whole run, the overall space complexity comes out to {global_info.raw}.")

    # -------------------------------------------------------------------
    # Educational asides: extra tips, warnings, and "did you know" notes
    # -------------------------------------------------------------------
