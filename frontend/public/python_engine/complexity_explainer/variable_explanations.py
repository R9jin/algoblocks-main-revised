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

from complexity_explainer.explanation_signals import BigOInfo, MemorySignals, ComplexitySignals, AlgorithmicParadigms, PatternSignals
from complexity_explainer.statement_narrator import StatementNarrator
from complexity_explainer.growth_insight import (
    parse_complexity, is_constant, scaling_line, doubling_effect, context_factor, growth_word,
)

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
        elif "n^" in c or "n²" in c or "n³" in c or "n * m" in c or "n^d" in c:
            # polynomial first: "n^2 log n" contains "log" but is NOT logarithmic
            family = "polynomial"
        elif "n log n" in c or "n * log n" in c:
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
    # one short plain-words hint per recognised technique, appended after the
    # line-specific sentence (so the sentence itself always comes from the code)
    _PARADIGM_HINTS = (
        ("is_halving", "Cutting the problem in half like this is what makes a search O(log n)."),
        ("is_two_pointer", "Two positions closing in on each other is the two-pointer technique."),
        ("is_kadane", "Keeping a running best value like this is the idea behind Kadane's algorithm."),
        ("is_priority_queue", "A heap always keeps the smallest (or largest) item ready to take."),
        ("is_tabulation_setup", "Building the table first is dynamic-programming tabulation."),
        ("is_fibonacci_sequence", "Sliding two values forward together is the Fibonacci pattern."),
        ("is_brian_kernighan", "Clearing the lowest set bit each time is Brian Kernighan's bit trick."),
        ("is_combinatorics", "Counts like this (factorials, permutations) grow extremely fast."),
        ("is_euclidean_distance", "A straight-line distance needs a square root."),
        ("is_union_find", "This is a Union-Find (disjoint set) step: it checks whether two items share a group."),
    )

    def _narrate_line(self, node: ast.AST) -> Optional[str]:
        """The syntax-reading sentence for this line, or None if there is nothing specific to say."""
        gen = self.generator
        line_no = getattr(node, "lineno", -1)
        try:
            stmt, _extra = gen.line_insights._resolve_stmt(node, line_no)
        except Exception:
            stmt = node
        shape = gen.shape
        fname = shape.enclosing_function(line_no)
        try:
            recursive = list(shape.recursion_facts()["recursive"].keys())
        except Exception:
            recursive = []
        params = []
        for f in shape._func_nodes:
            if f.name == fname:
                params = [a.arg for a in f.args.args + f.args.kwonlyargs]
                break
        narrator = StatementNarrator(pick=gen._v, function_name=fname, recursive_funcs=recursive, params=params)
        return narrator.narrate(stmt)

    def _key_line_note(self, line_no: int) -> str:
        """If this line is one of the lines that made the whole program look like a
        known approach (brute force, DP, backtracking...), say so, in plain words."""
        gen = self.generator
        try:
            from complexity_explainer import paradigm_detector
            shape = gen.shape
            cache = gen.__dict__.setdefault("_paradigm_cache", {})
            key = (id(shape), id(shape.tree))
            if key not in cache:
                cache.clear()
                cache[key] = paradigm_detector.detect(shape.tree)
            top = cache[key][:1]
            if top and line_no in top[0].lines:
                return f"This is a key line of the {top[0].name.split(' (')[0].lower()} approach used in this code."
        except Exception:
            pass
        return ""

    def _build_action_intro(self, node: ast.AST, code_snippet: str, sig: PatternSignals) -> str:
        ref = f"`{code_snippet}`" if code_snippet else "this line"

        # 1) read the line's own syntax and say what it does, in plain words
        narrated = self._narrate_line(node)
        if narrated and not (sig.has_docstring or sig.has_comment_block):
            hint = next((txt for attr, txt in self._PARADIGM_HINTS if getattr(sig.paradigms, attr, False)), "")
            key = self._key_line_note(getattr(node, "lineno", -1))
            return " ".join(x for x in (narrated, hint, key) if x).strip()

        # 2) otherwise fall back to the older construct-level wording
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
    # Helpers shared by the local/global builders below
    # -------------------------------------------------------------------
    _COMPOUND = (ast.For, ast.AsyncFor, ast.While, ast.If, ast.With, ast.AsyncWith, ast.Try, ast.FunctionDef, ast.AsyncFunctionDef)

    def _is_compound(self, node) -> bool:
        return isinstance(node, self._COMPOUND)

    def _own_loop(self, node, line_no):
        """LoopInfo for the loop that starts on this very line, if any."""
        if not isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            return None
        for lp in self.generator.shape.enclosing_loops(line_no, include_self=True):
            if lp.lineno == line_no:
                return lp
        return None

    @staticmethod
    def _loop_word(n: int) -> str:
        return {1: "one loop", 2: "two nested loops", 3: "three nested loops"}.get(n, f"{n} nested loops")

    @staticmethod
    def _repeat_verb(n: int) -> str:
        return "repeats" if n == 1 else "repeat"

    def _tracer_ran(self) -> bool:
        """True only when the test run actually executed *body* lines. If the
        learner's functions were never called, per-line 'did not run' notes would
        just be noise on every line, so they are skipped."""
        td = getattr(self.generator.ctx, "trace_data", None) or {}
        hits = td.get("line_hits") or {}
        def_lines = {f.lineno for f in self.generator.shape._func_nodes}
        return any(h > 0 and ln not in def_lines for ln, h in hits.items())

    def _build_observed_note(self, node, hits: int, is_dead: bool) -> str:
        """Ties the static result to what actually happened in the learner's
        last test run (the manuscript's frequency-count feature)."""
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) or is_dead:
            return ""
        if hits > 0:
            return self.generator._v(
                f"\n\n*Profiler verified* this line ran {hits} time(s) in your last test run. "
                f"That count is real data behind the Big-O: run it again with a bigger input and watch how quickly the number grows.",
                f"\n\n*Profiler verified* this line executed {hits} time(s) during your last test run -- its frequency count. "
                f"Try a larger input: how this number grows is exactly what the Big-O describes.",
            )
        if self._tracer_ran():
            return (
                "\n\n*Profiler verified* this line did not run in your last test (the function may never be called, or its branch wasn't taken). "
                "The analysis is static -- it never executes your code -- so the worst-case cost still counts."
            )
        return ""

    def _recursive_calls_on_line(self, node, line_no):
        """[(call_text, how_it_shrinks)] for calls to the enclosing function on this line."""
        fn = self.generator.shape.enclosing_function(line_no)
        if not fn or node is None:
            return []
        out = []
        for n in ast.walk(node):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == fn:
                try:
                    txt = ast.unparse(n)
                except Exception:
                    txt = f"{fn}(...)"
                shrink = ""
                for a in n.args[:1]:
                    try:
                        a_txt = ast.unparse(a).replace(" ", "")
                    except Exception:
                        a_txt = ""
                    if re.fullmatch(r"\w+-\d+", a_txt):
                        shrink = f"the problem shrinks by {a_txt.split('-')[1]}"
                    elif re.fullmatch(r"\w+(//|/)2", a_txt):
                        shrink = "the problem is cut in half"
                    elif "[" in a_txt and ":" in a_txt:
                        shrink = "it works on a slice, a smaller piece of the data"
                out.append((txt, shrink))
        return out

    # -------------------------------------------------------------------
    # Local time / space: "what does this line cost on its own?"
    # -------------------------------------------------------------------
    def _build_local_time_explanation(self, local_info: BigOInfo, sig: PatternSignals, node=None, line_no: int = -1) -> str:
        family = local_info.family
        compound = self._is_compound(node)

        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v(
                "It's just documentation, so it costs nothing when the program actually runs -- that's O(1).",
                "Comments and docstrings never execute as code, so there's zero runtime cost here.",
            )

        # A loop line: say how often *this* loop repeats, using the learner's own bound.
        own = self._own_loop(node, line_no)
        if own is not None:
            if own.scales:
                return (f"This loop {own.bound}. The loop header is cheap on its own; what matters is that it makes "
                        f"everything indented under it run that many times.")
            return (f"This loop {own.bound}. Because that count doesn't grow with the input the way a full scan does, "
                    f"the loop repeats its body far fewer times than n.")

        # amortized wording only makes sense for the operation itself, not for a
        # compound statement that merely *contains* an amortized call.
        if sig.complexity_signals.amortized_operation and not compound:
            return self.generator._v(
                "On its own, this line is O(1) on average: usually instant, with an occasional slower call that evens out over many calls.",
            )

        if isinstance(node, ast.If):
            base = f"This is the *test* of the `if`: evaluating it costs {local_info.raw}."
            if family == "linear":
                base += " That means the test itself has to look through the data, not just compare two values."
            elif family == "constant":
                base += " Comparing a couple of values takes the same time no matter how much data there is."
            return base + " The code inside each branch is costed on its own lines."

        if family == "constant":
            return self.generator._v(
                "On its own, this line is O(1): one quick step, no matter how big the input is.",
                "On its own, this line is O(1): it does the same small amount of work every time.",
            )
        elif family == "linear":
            return self.generator._v(
                f"On its own, this line is {local_info.raw}: it looks at every item once.",
                f"On its own, this line is {local_info.raw}: twice as much data means about twice the work.",
            )
        elif family == "logarithmic":
            return self.generator._v(
                f"On its own, this line is {local_info.raw}: each step throws away part of the work, so it stays fast on big inputs.",
                f"On its own, this line is {local_info.raw}: it keeps shrinking the problem instead of checking everything.",
            )
        elif family == "linearithmic":
            return f"On its own, this line is {local_info.raw}: a full pass over the data, repeated about log n times (the cost of an efficient sort)."
        elif family == "polynomial":
            return self.generator._v(
                f"On its own, this line is {local_info.raw}: it repeats work inside work, so the cost grows faster than linear.",
                f"On its own, this line is {local_info.raw}: usually one loop running fully for every step of another loop.",
            )
        elif "placeholder" in local_info.raw or local_info.raw.startswith("T("):
            calls = self._recursive_calls_on_line(node, line_no)
            head = ""
            if calls:
                listing = "; ".join(f"`{c}`" + (f" ({sh})" if sh else "") for c, sh in calls)
                head = (f"This line makes a recursive call, {listing}. " if len(calls) == 1
                        else f"This line calls the function itself {len(calls)} times: {listing}. ")
            return head + "Its exact cost depends on how deep and how wide the recursion tree ends up being -- the recurrence relation for the whole function settles it, and that is worked out in the overall analysis."

        return f"On its own, this line costs {local_info.raw}."

    def _build_local_space_explanation(self, local_info: BigOInfo, sig: PatternSignals, node=None) -> str:
        family = local_info.family

        if sig.has_docstring or sig.has_comment_block:
            return self.generator._v(
                "Comments don't use memory while the program runs, so this is O(1).",
            )

        if sig.memory_signals.inplace_swap and not self._is_compound(node):
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
    def _loop_bullets(self, loops) -> str:
        rows = []
        for lp in loops:
            rows.append(f"- line {lp.lineno}, `{lp.header}` -- it {lp.bound}")
        return "\n".join(rows)

    def _build_global_time_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals, node=None, line_no: int = -1) -> str:
        gen = self.generator
        if sig.has_docstring or sig.has_comment_block:
            return gen._v("It doesn't affect the algorithm's overall speed at all -- documentation never runs.")

        loc, glo = local_info.raw, global_info.raw
        enclosing = gen.shape.enclosing_loops(line_no)
        scaling = [lp for lp in enclosing if lp.scales]
        halving = [lp for lp in enclosing if (not lp.scales) and "log n" in lp.bound]
        parts = []

        # ---- 1. how the surrounding structure turns "local" into "global" ----
        factor = context_factor(loc, glo)
        same = loc.replace(" ", "") == glo.replace(" ", "")

        if global_info.family in ("exponential", "recursive_branching", "super_exponential", "factorial") and sig.has_recursion:
            fn_name = gen.shape.enclosing_function(line_no)
            k = gen.shape.recursion_facts()["recursive"].get(fn_name, 0)
            k_txt = f"{k} more calls" if k >= 2 else "several more calls"
            if sig.has_memoization:
                parts.append(
                    f"Without a cache this recursion would branch into {k_txt.replace(' more', '')} at every level. Because results are saved and reused, "
                    f"each distinct subproblem is only solved once, so the work is (number of distinct subproblems) x (work per subproblem) = `{glo}`."
                )
            else:
                parts.append(gen._v(
                    f"Each call here spawns {k_txt}, and none of them remember earlier answers, so the same subproblems are solved again and again. "
                    f"The number of calls multiplies at every level of the recursion -- that's how the total reaches `{glo}`.",
                    f"The recursion splits into {k_txt} per call without saving results, so the call tree keeps widening at every level, "
                    f"which is what pushes the total up to `{glo}`.",
                ))
        elif same and not enclosing:
            own = self._own_loop(node, line_no)
            if own is not None and own.scales:
                parts.append(f"Nothing repeats this loop, so it contributes `{glo}`. Any loop nested inside it will multiply on top of that.")
            elif loc in ("O(1)",):
                parts.append("This step costs the same no matter what surrounds it: it isn't repeated by any loop, so it stays `O(1)`.")
            else:
                parts.append(f"Nothing around this line repeats it, so its total cost is its own cost: `{glo}`.")
        elif factor and factor["text"] != "1" and (scaling or halving):
            n_loops = len(scaling) + len(halving)
            times = factor["text"]
            parts.append(gen._v(
                f"On its own this step costs `{loc}`, but it sits inside {self._loop_word(n_loops)} that {self._repeat_verb(n_loops)} it about `{times}` times. "
                f"So the total is `{loc}` x `{times}` = `{glo}`.",
                f"A `{loc}` step that runs inside {self._loop_word(n_loops)} gets repeated about `{times}` times -- "
                f"`{loc}` x `{times}` = `{glo}` in total.",
            ))
            parts.append("The loops around it:\n" + self._loop_bullets(scaling + halving))
        elif factor and factor["text"] != "1":
            parts.append(
                f"The cost grows from `{loc}` to `{glo}` because of the surrounding structure: what happens around this line repeats it about `{factor['text']}` times."
            )
        elif same and enclosing and scaling:
            refs = ", ".join(f"`{lp.header}` (line {lp.lineno})" for lp in scaling[:3])
            ms = sig.memory_signals
            has_trap = ms.string_concatenation_in_loop or ms.geometric_capacity_growth or ms.creates_new_list_from_concat or ms.performs_slicing
            if is_constant(parse_complexity(loc)) and has_trap:
                parts.append(f"This line runs once per pass of {refs}. The engine charges each pass `{glo}`, but read the note below: this kind of line can cost more than it looks.")
            elif is_constant(parse_complexity(loc)):
                parts.append(f"This line runs once per pass of {refs}. Each pass costs only `{glo}`, so it stays cheap.")
            else:
                parts.append(
                    f"This line runs once per pass of {refs}, and every pass pays its `{glo}` cost again. "
                    f"A step that looks like a single line can hide a whole loop's worth of work -- this is exactly the kind of line to watch."
                )
        elif same and enclosing:
            # loops enclose it but none scale with the input
            parts.append(
                f"It does sit inside a loop, but that loop repeats a fixed number of times (or halves the work), so the total stays `{glo}`."
            )
        else:
            # the two strings can't be compared safely (e.g. recurrences); be honest about it
            if enclosing:
                parts.append(
                    f"This line runs inside {self._loop_word(len(enclosing))} that {self._repeat_verb(len(enclosing))} it. Taking all of that into account, the engine reports `{glo}` for this line."
                )
                parts.append("The loops around it:\n" + self._loop_bullets(enclosing))
            else:
                parts.append(f"Once you account for everything happening around it, this line's contribution to the overall time complexity is `{glo}`.")

        # ---- 2. what that means in practice ----
        sc = scaling_line(glo)
        if sc:
            parts.append(sc + " " + doubling_effect(glo))
        return "\n\n".join(parts)

    def _build_global_space_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals, node=None, line_no: int = -1, global_raw: str = "") -> str:
        gen = self.generator
        if sig.has_docstring or sig.has_comment_block:
            return gen._v("Comments don't take up any runtime memory, so they don't affect the overall space complexity at all.")

        loc, glo = local_info.raw, global_info.raw
        same = loc.replace(" ", "") == glo.replace(" ", "")
        fn = gen.shape.enclosing_function(line_no)
        parts = []

        if same:
            if loc == "O(1)":
                parts.append("Only a fixed number of variables are involved here, so this line never adds memory that grows with the input.")
            else:
                parts.append(f"This is where the memory grows: nothing around it multiplies it further, so its total is `{glo}`.")
        elif global_info.family == "linear" and local_info.family == "constant":
            if sig.has_recursion:
                who = f"`{fn}()`" if fn else "this function"
                parts.append(gen._v(
                    f"Every call to {who} that is still waiting keeps its own small frame on the call stack. If the recursion goes n levels deep, "
                    f"that's n frames x O(1) each = `{glo}`.",
                    f"Each unfinished recursive call keeps its frame in memory until it returns -- n levels deep means `{glo}` of stack.",
                ))
            else:
                parts.append(f"This line adds only O(1) by itself, but the structure it feeds keeps growing as the loop runs, reaching `{glo}` overall.")
        elif global_info.family == "polynomial" and local_info.family in ("linear", "constant"):
            parts.append(f"Repeated across the surrounding loops, this builds a dense multi-layered structure -- peak memory reaches `{glo}`.")
        else:
            parts.append(f"Counting the peak memory held at once across the whole run, this line's space contribution is `{glo}`.")

        sc = scaling_line(glo, unit="memory cells")
        if sc:
            parts.append(sc + " " + doubling_effect(glo).replace("work", "memory"))
        return "\n\n".join(parts)
