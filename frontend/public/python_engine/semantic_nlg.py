# api/semantic_nlg.py
import ast
import random
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class BigOInfo:
    """Semantic Big-O classification.

    We deliberately treat Big-O as a semantic label, not something that must
    be perfectly parsed mathematically. The goal is:
      - never crash
      - never fail parsing
      - always produce a human-readable explanation of growth
    """

    raw: str
    normalized: str
    family: str  # linear/log/poly/exponential/factorial/graph/unknown/root/etc
    factors: Dict[str, Any]


@dataclass
class PatternSignals:
    """Structured signals derived from AST.

    Detectors return small signals only; renderers decide wording.
    """

    loop_depth: int = 0
    nested_loops: bool = False

    has_recursion: bool = False
    recursion_branching: Optional[str] = None  # binary/multi/linear_or_unknown

    has_backtracking_risk: bool = False

    membership_in_loop: bool = False
    comprehension_expansion: bool = False

    graph_traversal: bool = False
    visited_tracking: bool = False

    repeated_calls_in_loop: bool = False

    extra_notes: List[str] = None

    def __post_init__(self):
        if self.extra_notes is None:
            self.extra_notes = []


class SemanticNLGEngine:
    """
    Universal semantic NLG engine for complexity analysis explanations.

    External API is unchanged:
      generate_explanations(node, local_t, global_t, local_s, global_s, is_dead, code_snippet)
    """

    def __init__(self, analyzer_context):
        self.ctx = analyzer_context

    # =========================================================
    # Big-O semantic normalization + classification
    # =========================================================
    def _safe_str(self, x: Any) -> str:
        try:
            return str(x) if x is not None else ""
        except Exception:
            return ""

    def _normalize_big_o(self, s: str) -> str:
        if not s:
            return "O(1)"
        s = s.strip()
        if s in {"-", "Dead Code", "Undefined", "undefined"}:
            return s
        s = re.sub(r"\s+", " ", s)

        # Normalize common symbols/variants
        s = s.replace("√", "sqrt")
        # analyzer currently emits "log n", "log² n" occasionally; normalize lightly
        s = s.replace("log²", "log^2")
        return s

    def _classify_big_o(self, raw: str) -> BigOInfo:
        original = raw
        raw = self._normalize_big_o(raw)
        s = raw
        lower = s.lower()

        # undefined/infinite
        if not s or s in {"-", "Undefined", "undefined"}:
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={})
        if "∞" in original or "infinite" in lower or "undefined" in lower:
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={})

        # recursion-style strings (T(n) = ...)
        if "t(" in lower or lower.startswith("t(") or "t(n)" in lower:
            # Treat as unknown growth unless we can recognize a known pattern.
            # We still never crash and always provide a growth description.
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={"recurrence": True})

        # graph
        if ("v + e" in lower) or ("v+e" in lower) or ("e log v" in lower) or ("v" in lower and "e" in lower):
            return BigOInfo(raw=original, normalized=s, family="graph", factors={"V": "v" in lower, "E": "e" in lower})

        # factorial
        if "n!" in lower or "n^!" in lower or "factorial" in lower:
            return BigOInfo(raw=original, normalized=s, family="factorial", factors={})

        # exponential
        if "2^n" in lower or "2^" in lower and "n" in lower or "2n" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={"base": 2})
        if "2**n" in lower or "exp" in lower and "n" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={})
        if re.search(r"[a-z]\s*\^\s*n", lower) or re.search(r"\w\^n", lower):
            # k^n form
            if "o(" in lower or lower.startswith("o("):
                return BigOInfo(raw=original, normalized=s, family="exponential", factors={})

        # root
        if "sqrt" in lower:
            return BigOInfo(raw=original, normalized=s, family="root", factors={})

        # log^2
        if "log^2" in lower or "log 2" in lower or "log²" in original:
            return BigOInfo(raw=original, normalized=s, family="logarithmic", factors={"variant": "log^2"})

        # n log n
        if "n log" in lower or "n*log" in lower or "n log n" in lower:
            return BigOInfo(raw=original, normalized=s, family="linearithmic", factors={})

        # pure log
        if re.search(r"\blog\b", lower) and "n" in lower:
            return BigOInfo(raw=original, normalized=s, family="logarithmic", factors={})

        # n+m
        if ("n + m" in lower) or ("n+m" in lower) or ("min(n, m)" in lower) or ("min(n,m)" in lower):
            return BigOInfo(raw=original, normalized=s, family="linear", factors={"two_vars": True})

        # n*m
        if "n*m" in lower or "n * m" in lower:
            return BigOInfo(raw=original, normalized=s, family="polynomial", factors={"product": True})

        # powers n^k
        if "n^" in lower or "^2" in lower or "^3" in lower:
            return BigOInfo(raw=original, normalized=s, family="polynomial", factors={})

        # O(n) exact-ish
        if re.fullmatch(r"o\(\s*n\s*\)", lower) or re.fullmatch(r"o\(\s*n\s*\)", s.lower().replace(" ", "")):
            return BigOInfo(raw=original, normalized=s, family="linear", factors={})

        # O(1)
        if lower == "o(1)" or "o(1)" in lower:
            return BigOInfo(raw=original, normalized=s, family="constant", factors={})

        # generic O(...)
        if lower.startswith("o("):
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={"contains": s})

        return BigOInfo(raw=original, normalized=s, family="unknown", factors={})

    def _growth_explanation(self, info: BigOInfo, audience: str) -> str:
        # Always beginner-friendly, but can include extra CS terms for students.
        if info.family == "constant":
            return "It stays basically the same even when the input gets bigger."
        if info.family == "linear":
            if audience == "beginner":
                return "It grows in direct proportion to the input size—double the input, and you do about double the work."
            return "Direct 1-to-1 growth: O(n) style scaling."
        if info.family == "root":
            return "It grows much slower than linear because it only increases with about the square root of the input."
        if info.family == "logarithmic":
            return "It grows very slowly—typical of repeated halving like binary search."
        if info.family == "linearithmic":
            return "It has a two-part effect: it scales with n, plus an extra log n factor (common in sorting-like divide-and-conquer)."
        if info.family == "polynomial":
            return "The growth rate accelerates with larger powers of n (e.g., n², n³), so bigger inputs become much more expensive quickly."
        if info.family == "exponential":
            return "The work multiplies rapidly as the input grows—small increases can cause huge jumps."
        if info.family == "factorial":
            return "This is an extreme blow-up: the number of possibilities explodes faster than exponential."
        if info.family == "graph":
            return "It depends on the graph’s structure—how many nodes exist and how many connections they have."
        return "The exact math form is unclear here, but it still grows based on input size, so larger inputs require more work."

    # =========================================================
    # AST detectors -> structured signals
    # =========================================================
    def _extract_loop_depth(self) -> int:
        try:
            return len(getattr(self.ctx, "active_poly_dims", []))
        except Exception:
            return 0

    def _detect_membership_in_loop(self, node: ast.AST) -> bool:
        try:
            # Heuristic: compare with ast.In / ast.NotIn inside a compare
            for child in ast.walk(node):
                if isinstance(child, ast.Compare):
                    if any(isinstance(op, ast.In) for op in child.ops) or any(isinstance(op, ast.NotIn) for op in child.ops):
                        # If analyzer suggests we're in loop work, treat as membership-in-loop risk.
                        # Even if local, it usually means scanning checks.
                        return True
        except Exception:
            pass
        return False

    def _detect_comprehension_expansion(self, node: ast.AST) -> bool:
        return isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp))

    def _detect_graph_traversal(self, node: ast.AST) -> bool:
        if getattr(self.ctx, "in_graph_context", False):
            return True
        try:
            # Heuristic: look for queue/stack operations and visited tracking calls.
            has_pop_frontier = False
            has_visit_like = False
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr in {"popleft", "pop"}:
                        has_pop_frontier = True
                    if child.func.attr in {"add", "append", "extend"}:
                        # if extending/adding neighbors often appears alongside traversal
                        pass
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr in {"add", "append", "extend"}:
                        # could be either visited or queue
                        pass
            # Keep it conservative
            return has_pop_frontier and (getattr(self.ctx, "has_graph_traversal", False) or True)
        except Exception:
            return False

    def _detect_recursion(self, node: ast.AST) -> bool:
        # Use analyzer-provided info if available.
        try:
            current_fn = getattr(self.ctx, "current_function_name", None)
            indirect = getattr(self.ctx, "indirect_recursive_funcs", set())
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                    if child.func.id == current_fn:
                        return True
                    if child.func.id in indirect:
                        return True
        except Exception:
            pass
        return False

    def _detect_backtracking_risk(self, node: ast.AST) -> bool:
        # Conservative heuristic: recursion + loops/conditionals indicates branching search/backtracking.
        try:
            has_branch = any(isinstance(c, ast.If) for c in ast.walk(node))
            has_loop = any(isinstance(c, (ast.For, ast.While)) for c in ast.walk(node))
            return self._detect_recursion(node) and has_branch and has_loop
        except Exception:
            return False

    def _detect_repeated_calls_in_loop(self, node: ast.AST) -> bool:
        # Heuristic: any call in a loop scope.
        try:
            if self._extract_loop_depth() <= 0:
                return False
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    return True
        except Exception:
            pass
        return False

    def _get_pattern_signals(self, node: ast.AST, global_t: str) -> PatternSignals:
        loop_depth = self._extract_loop_depth()
        nested = loop_depth > 1

        has_rec = self._detect_recursion(node)
        raw = self._safe_str(global_t).lower()

        if has_rec:
            if "2^n" in raw or "2^" in raw or "exp" in raw:
                rec_branch = "binary_or_multi"
            elif "!" in raw:
                rec_branch = "multi"
            else:
                rec_branch = "linear_or_unknown"
        else:
            rec_branch = None

        membership = self._detect_membership_in_loop(node)
        comp = self._detect_comprehension_expansion(node)
        graph = self._detect_graph_traversal(node)

        visited_tracking = bool(getattr(self.ctx, "in_graph_context", False))

        backtrack = self._detect_backtracking_risk(node)
        repeated_calls = self._detect_repeated_calls_in_loop(node)

        return PatternSignals(
            loop_depth=loop_depth,
            nested_loops=nested,
            has_recursion=has_rec,
            recursion_branching=rec_branch,
            has_backtracking_risk=backtrack,
            membership_in_loop=membership,
            comprehension_expansion=comp,
            graph_traversal=graph,
            visited_tracking=visited_tracking,
            repeated_calls_in_loop=repeated_calls,
            extra_notes=[],
        )

    # =========================================================
    # Renderers: time / space / pattern
    # =========================================================
    def _audience_mode(self) -> str:
        # analyzer context doesn't carry audience; use beginner-safe phrasing.
        return "beginner"

    def _time_renderer(self, node: ast.AST, local_t: str, global_t: str, code_snippet: str) -> str:
        # Time explanation must always answer:
        #   - what runs repeatedly
        #   - what causes repetition
        #   - what grows when input increases
        ginfo = self._classify_big_o(global_t)
        sig = self._get_pattern_signals(node, global_t)

        snippet = f"`{code_snippet}`" if code_snippet else "this line"
        prefix = random.choice([
            f"When {snippet} runs, ",
            f"Looking at {snippet}, ",
            f"Considering {snippet}, ",
        ])

        if sig.nested_loops:
            repeat = "the inner work repeats for every outer-loop iteration"
            cause = "nested loops multiply how many times each inner step runs"
        elif sig.loop_depth >= 1:
            repeat = "this step repeats while the loop scans the input"
            cause = "the loop re-executes the same logic for each element"
        elif sig.membership_in_loop:
            repeat = "membership checks repeat while scanning collections"
            cause = "each `x in collection` can scan many items, and doing it repeatedly adds up"
        elif sig.comprehension_expansion:
            repeat = "the comprehension expands into repeated element-processing"
            cause = "building the output collection performs the element work many times"
        elif sig.has_recursion:
            repeat = "recursive calls repeatedly re-run similar work"
            cause = "recursion builds up a call chain/tree that grows with input size"
        elif sig.graph_traversal:
            repeat = "exploration work repeats while visiting nodes/edges"
            cause = "the algorithm keeps expanding to reachable neighbors"
        else:
            repeat = "this step runs for the analyzed execution"
            cause = "there is no detected repetition from nesting/control-flow"

        # Growth family + always-on fallback
        growth = self._growth_explanation(ginfo)

        # Small pattern fragments (renderer decides wording)
        frags: List[str] = []
        if sig.nested_loops:
            frags.append("Nested loops are a classic route to O(n²)/O(n³) style growth.")
        if sig.membership_in_loop:
            frags.append("If the membership check is inside a loop, it can hide an extra scan.")
        if sig.comprehension_expansion:
            frags.append("Comprehensions often look compact, but they still process many items.")
        if sig.repeated_calls_in_loop:
            frags.append("Repeated function calls inside the loop multiply total work.")
        if sig.has_backtracking_risk:
            frags.append("Branching/backtracking can try many possibilities, increasing growth quickly.")
        if sig.graph_traversal:
            frags.append("Graph traversals depend on how many nodes/edges exist (and whether visits are tracked).")

        frag_text = (" " + " ".join(frags)) if frags else ""
        return (
            prefix
            + f"{repeat}, because {cause}. "
            + f"Overall it behaves like **{ginfo.raw}**. "
            + growth
            + frag_text
        )

    def _space_renderer(self, node: ast.AST, local_s: str, global_s: str, code_snippet: str) -> str:
        snippet = f"`{code_snippet}`" if code_snippet else "this line"
        prefix = random.choice([
            f"For memory, {snippet} uses extra space because ",
            f"Space-wise, {snippet} impacts memory by ",
            f"Looking at memory for {snippet}, ",
        ])

        ls = self._classify_big_o(local_s)
        gs = self._classify_big_o(global_s)

        # Required anchors:
        #   - what is stored
        #   - whether memory accumulates or is reused
        if "O(V" in global_s or "V" in global_s or gs.family == "graph":
            stored = "the algorithm stores which vertices it has visited (or a frontier of nodes)"
            growth = "so memory grows with graph size (V and sometimes E)."
        elif "recursion" in (local_s + global_s).lower() or "log" in global_s and "n" in global_s and getattr(self.ctx, "has_division", False):
            stored = "the call stack stores active function states"
            growth = "so memory grows with recursion depth (often around log n for halving)."
        elif "O(n)" in global_s or gs.family in {"linear", "polynomial", "unknown"}:
            stored = "temporary data structures (lists/dicts/sets) may be allocated"
            growth = "and memory usually grows as input grows"
            if "in-place" in (getattr(self.ctx, "hint_text", "") or ""):
                growth = "but in-place updates can keep extra memory small"
        else:
            stored = "mostly just a fixed amount of working space"
            growth = "so memory stays near constant or grows very slowly"

        # Always-on growth hint fallback
        fallback = self._growth_explanation(gs) if gs.family == "unknown" else ""

        return (
            prefix
            + stored
            + ". "
            + f"Local space is **{local_s}**, and overall extra space behaves like **{global_s}**. "
            + growth + (" " + fallback if fallback else "")
        )

    def _pattern_renderer(self, node: ast.AST, global_t: str) -> str:
        sig = self._get_pattern_signals(node, global_t)
        parts: List[str] = []
        if sig.nested_loops:
            parts.append("Pattern: nested loops → multiplicative repetition.")
        if sig.membership_in_loop:
            parts.append("Pattern: membership checks inside loops → hidden extra scanning." )
        if sig.comprehension_expansion:
            parts.append("Pattern: comprehension expansion → repeated element-processing." )
        if sig.has_recursion:
            parts.append("Pattern: recursion → repeated work via a call chain/tree." )
        if sig.has_backtracking_risk:
            parts.append("Pattern: backtracking/branching risk → tries many possibilities." )
        if sig.graph_traversal:
            parts.append("Pattern: graph traversal → work depends on reachable nodes/edges." )
        if sig.repeated_calls_in_loop:
            parts.append("Pattern: repeated calls in a loop → total work multiplies." )
        return ("\n\n" + " ".join(parts)) if parts else ""

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        # Keep analyzer.py compatibility: signature and return type.
        if is_dead:
            t_desc = f"The statement `{code_snippet}` is dead code (unreachable), so it contributes 0 operations (O(1) time)."
            s_desc = "Since it never runs, it also doesn't consume extra memory."
            return t_desc, s_desc

        time_desc = self._time_renderer(node, str(local_t), str(global_t), code_snippet)
        space_desc = self._space_renderer(node, str(local_s), str(global_s), code_snippet)
        pattern_desc = self._pattern_renderer(node, str(global_t))
        if pattern_desc:
            time_desc = time_desc + pattern_desc

        return time_desc, space_desc
