"""
Complexity Synthesizer

Final Synthesis Pass: resolves per-function recurrence relations via
the Master Theorem lookup table and rolls per-line signatures up into
the definitive overall time/space asymptotic ratings -- the
"Master Theorem Assigner" + "Efficiency Evaluator" stages of the
complexity analysis model.
"""


import re
try:
    from complexity_explainer.complexity_explainer import EducationalInsightGenerator as SemanticNLGEngine, ComprehensiveASTVisitor
except ImportError:
    SemanticNLGEngine = None
    ComprehensiveASTVisitor = None


class ComplexitySynthesizer:
    """Master Theorem Assigner + Efficiency Evaluator. Composed into
    ComplexityAnalyzer as `self.complexity_synthesizer`; reads shared state
    via `self.analyzer`.
    """

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def get_final_asymptotic_badge(self):
        res = self._with_independent_sum(self._base_final_asymptotic_badge())
        # BFS driven by a plain list: pop(0) is O(V) per removal -> O(V^2 + E) for the traversal.
        if getattr(self.analyzer, 'graph_list_pop0', False) and res == "O(V+E)":
            res = "O(V^2+E)"
        # `neighbor in visited` on a plain list: O(V) per check x O(E) adjacency entries = O(V*E).
        # With a list queue (pop(0)) the V^2 term is kept too; otherwise V*E dominates V+E.
        if getattr(self.analyzer, 'graph_list_member', False) and res in ("O(V+E)", "O(V^2+E)"):
            res = "O(V^2+V*E)" if res == "O(V^2+E)" else "O(V*E)"
        # A traversal next to genuinely polynomial loops (degree >= 2 over n / m): V and E are separate
        # quantities from n and m, so the badge keeps both instead of letting the graph term hide them.
        if res in ("O(V+E)", "O(V^2+E)", "O(V*E)", "O(V^2+V*E)"):
            terms = {t for t in getattr(self.analyzer, 'poly_terms', set()) if t and len(t) >= 2}
            if terms:
                from collections import Counter as _C
                from complexity_analyzer.size_symbols import letter_rank as _lr
                cs = [_C(t) for t in terms]
                def inside(a, b): return a != b and all(b[v] >= k for v, k in a.items())
                top = [c for c in cs if not any(inside(c, o) for o in cs)]
                def fmt(c): return " * ".join((f"{v}^{k}" if k > 1 else v) for v, k in sorted(c.items(), key=lambda kv: _lr(kv[0])))
                top.sort(key=lambda c: (-sum(c.values()), fmt(c)))
                return "O(" + " + ".join(fmt(c) for c in top) + " + " + res[2:-1] + ")"
        return res

    def _with_independent_sum(self, res):
        """
        Sequential loops over DIFFERENT sizes add: a loop over n followed by a loop over m is
        O(n + m), not O(n). Only applied to pure polynomial results; a term contained in a bigger
        one (n inside n * m) is dominated and dropped.
        """
        try:
            from complexity_analyzer import code_preprocessor as _cp
            if not (_cp.MULTI_VARIABLE_NOTATION and _cp.SUM_OF_INDEPENDENT_TERMS): return res
            terms = {t for t in getattr(self.analyzer, 'poly_terms', set()) if t}
            # A polynomial in a size other than n (a function that only loops over m) is invisible to the
            # n-keyed rules in _base_final_asymptotic_badge, which would call it O(1) / O(log n).
            # A polynomial term always outgrows log / sqrt / constant, so it replaces them.
            if res in ("O(1)", "O(log n)", "O(sqrt n)") and terms and not (getattr(self.analyzer, 'max_exp', 0) or getattr(self.analyzer, 'max_fact', 0)):
                if any(set(t) - {'n'} for t in terms):
                    from collections import Counter as _C0
                    _cs0 = [_C0(t) for t in terms]
                    def _in0(a, b): return a != b and all(b[v] >= k for v, k in a.items())
                    _top0 = [c for c in _cs0 if not any(_in0(c, o) for o in _cs0)]
                    from complexity_analyzer.size_symbols import letter_rank as _lr0
                    def _fmt0(c): return " * ".join((f"{v}^{k}" if k > 1 else v) for v, k in sorted(c.items(), key=lambda kv: _lr0(kv[0])))
                    res = "O(" + " + ".join(_fmt0(c) for c in sorted(_top0, key=lambda c: (-sum(c.values()), min(_lr0(v) for v in c), _fmt0(c)))) + ")"
                    return res
            if not re.fullmatch(r"O\([a-zA-Z](?:\^\d+)?(?: \* [a-zA-Z](?:\^\d+)?)*\)", res): return res
            if len({v for t in terms for v in t}) < 2: return res
            # only add terms that each involve ONE size (n, m, n^2, ...): a mixed product next to
            # another term (n * m + n^2) comes from loops whose bounds move, and is not trustworthy
            if any(len(set(t)) > 1 for t in terms): return res
            from collections import Counter
            cs = [Counter(t) for t in terms]
            def inside(a, b): return a != b and all(b[v] >= k for v, k in a.items())
            top = [c for c in cs if not any(inside(c, o) for o in cs)]
            if len(top) < 2: return res
            def fmt(c): return " * ".join((f"{v}^{k}" if k > 1 else v) for v, k in sorted(c.items(), key=lambda kv: __import__('complexity_analyzer.size_symbols', fromlist=['letter_rank']).letter_rank(kv[0])))
            return "O(" + " + ".join(fmt(c) for c in sorted(top, key=lambda c: (-sum(c.values()), min(__import__('complexity_analyzer.size_symbols', fromlist=['letter_rank']).letter_rank(v) for v in c), fmt(c)))) + ")"
        except Exception:
            return res

    def _base_final_asymptotic_badge(self):
        _live = [d for d in self.analyzer._details if not d.get('uncalled_function')]   # entry-point scope only
        all_comps = " ".join([str(d.get('global_time', '')) for d in _live] + [str(d.get('local_time', '')) for d in _live])
        
        resolved_custom = []
        _dead = getattr(self.analyzer, 'dead_funcs', set()) or set()
        for _fname, rel in self.analyzer.custom_functions.items():
            if _fname in _dead: continue   # never runs: its recurrence is not part of the program's cost
            resolved = rel
            for k, v in self.analyzer.RECURRENCE_RESOLVER.items():
                if k in rel:
                    resolved = v
                    break
            resolved_custom.append(resolved)
        all_comps += " " + " ".join(resolved_custom)

        raw_code = re.sub(r'//.*|#.*|/\*[\s\S]*?\*/', '', "\n".join(self.analyzer.source_lines)).lower()

        if "n!" in all_comps: return "O(n!)"
        if "2^n" in all_comps or "2ⁿ" in all_comps: return "O(2^n)"
        if "V+E" in all_comps or "o(v+e)" in all_comps: return "O(V+E)"
        # polynomial degree 3 and up (n^3, n^4, ... optionally times log n): highest degree wins
        _poly = re.findall(r"n\^(\d+)( log n)?", all_comps)
        _poly = [(int(k), bool(lg)) for k, lg in _poly if int(k) >= 3]
        if _poly:
            _k, _lg = max(_poly)
            return f"O(n^{_k} log n)" if _lg else f"O(n^{_k})"
        # products of independent sizes, e.g. O(n * m) or O(n^2 * m) (only when no plain n^k beats them)
        _prod = []
        for _mt in re.finditer(r"O\(([a-zA-Z](?:\^\d+)?(?: \* [a-zA-Z](?:\^\d+)?)+)( log n)?\)", all_comps):
            _deg = sum(int(x) if x else 1 for x in re.findall(r"[a-zA-Z](?:\^(\d+))?", _mt.group(1)))
            _prod.append((_deg, bool(_mt.group(2)), _mt.group(0)))
        if _prod:
            _d, _l, _txt = max(_prod)
            _plain2 = ("n^2" in all_comps or "n²" in all_comps)
            if _d >= 3 or not _plain2:
                return _txt
        if "n^2 log n" in all_comps or "n² log n" in all_comps: return "O(n^2 log n)"
        if "n^2" in all_comps or "n²" in all_comps: return "O(n^2)"
        if "n log n" in all_comps or (re.search(r'\b(sorted|sort|qsort)\s*\(', raw_code) and not (getattr(self.analyzer, 'sqrt_bounded_sort_call', False) and not getattr(self.analyzer, 'has_unbounded_sort_call', False))) or 'heappush' in raw_code: return "O(n log n)"
        # NOTE: O(n) must be checked before O(sqrt n) / O(log n). A function
        # can contain a small logarithmic sub-expression (e.g. one helper
        # call, or one line's local annotation) alongside a separately
        # dominant O(n) loop; since `all_comps` is just a concatenated bag
        # of every line's per-line badges, checking "log n"/"sqrt n" first
        # would let that minor log/sqrt substring win over a genuinely
        # bigger-O(n) (or O(n^2), already handled above) component elsewhere
        # in the same function -- picking the wrong (smaller) overall class.
        # Asymptotic dominance requires O(n) to outrank O(sqrt n)/O(log n),
        # matching the ordering already used in get_final_space_badge below.
        if "O(n)" in all_comps: return "O(n)"
        if "sqrt n" in all_comps: return "O(sqrt n)"
        if "log n" in all_comps: return "O(log n)"
        
        return "O(1)"

    def get_final_space_badge(self):
        _live = [d for d in self.analyzer._details if not d.get('uncalled_function')]   # entry-point scope only
        all_spaces = " ".join([str(d.get('global_space', '')) for d in _live] + [str(d.get('local_space', '')) for d in _live])
        _explicit = all_spaces   # what the lines themselves reported, before function summaries and the weight top-up
        _dead = getattr(self.analyzer, 'dead_funcs', set()) or set()
        for _fname, space_val in self.analyzer.custom_space.items():
            if _fname in _dead: continue
            all_spaces += " " + space_val
        raw_code = re.sub(r'//.*|#.*|/\*[\s\S]*?\*/', '', "\n".join(self.analyzer.source_lines)).lower()
            
        if self.analyzer.max_space_weight >= 5: all_spaces += " O(n!)"
        elif self.analyzer.max_space_weight >= 4: all_spaces += " O(2^n)"
        elif self.analyzer.max_space_weight >= 3: all_spaces += " O(V+E)"
        elif self.analyzer.max_space_weight >= 2: all_spaces += " O(n^2)"
        elif self.analyzer.max_space_weight >= 1: all_spaces += " O(n)"
        elif self.analyzer.max_space_weight >= 0.5: all_spaces += " O(1)"
        
        if "n!" in all_spaces: return "O(n!)"
        if "2^n" in all_spaces or "2ⁿ" in all_spaces: return "O(2^n)"
        # a table whose sides are different sizes (len(a) x len(b)) is O(n * m), not O(n^2)
        _prods = re.findall(r"O\(([a-z](?:\^\d+)?(?: \* [a-z](?:\^\d+)?)+)\)", _explicit)
        if _prods and not re.search(r"n\^[3-9]", " ".join(self.analyzer.custom_space.values())) and not re.search(r"n\^\d|n²", re.sub(r"O\([a-z](?:\^\d+)?(?: \* [a-z](?:\^\d+)?)+\)", "", _explicit)):
            return "O(" + max(_prods, key=lambda t: sum(int(x) if x else 1 for x in re.findall(r"[a-z](?:\^(\d+))?", t))) + ")"
        _sp = [int(k) for k in re.findall(r"n\^(\d+)", all_spaces) if int(k) >= 3]
        if _sp: return f"O(n^{max(_sp)})"
        if "n^2" in all_spaces or "n²" in all_spaces: return "O(n^2)"
        if "V+E" in all_spaces or "O(V)" in all_spaces:
            # traversal bookkeeping alone is O(V); pushes that aren't marked, or building the
            # adjacency lists, can reach O(V+E) (see graph_aux_space)
            # Rule 9 of the benchmark conventions: work/space that is once-per-vertex is O(n) with n = V;
            # only edge-proportional storage (building adjacency, push-without-mark) is O(V+E).
            if getattr(self.analyzer, 'graph_aux_space', "V+E") == "V":
                # Single-structure programs keep the benchmark convention (n = V). When the program ALSO has
                # independent size symbols (loops over n, m, ...), collapsing V into 'n' would merge two
                # different input sizes, so the graph bookkeeping keeps its own symbol.
                # "independent size symbols" = the program iterates over the scalar size parameters n / m
                # themselves; benchmark-style `range(vertices)` loops are just the vertex count (n = V).
                _indep = re.search(r"range\(\s*[nm]\s*\)", raw_code) is not None
                if _indep and getattr(self.analyzer, 'poly_terms', None) and "O(n)" not in _explicit:
                    return "O(V)"
                return "O(n)"
            return "O(V+E)"
        if "O(n)" in all_spaces: return "O(n)"
        if "sqrt n" in all_spaces: return "O(sqrt n)"
        if "log n" in all_spaces: return "O(log n)"
        return "O(1)"

    def get_overall_explanation(self, tree):
        final_time = self.get_final_asymptotic_badge()
        final_space = self.get_final_space_badge()
        if SemanticNLGEngine:
            visitor = ComprehensiveASTVisitor(self)
            sig = visitor.analyze(tree)
            return self.analyzer.nlg_engine.generate_overall_analysis(final_time, final_space, sig, self.analyzer.details)
        return f"Evaluated time as {final_time} and space as {final_space}."
