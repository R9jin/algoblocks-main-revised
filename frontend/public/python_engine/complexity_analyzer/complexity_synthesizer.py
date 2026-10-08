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
        all_comps = " ".join([str(d.get('global_time', '')) for d in self.analyzer._details] + [str(d.get('local_time', '')) for d in self.analyzer._details])
        
        resolved_custom = []
        for rel in self.analyzer.custom_functions.values():
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
        all_spaces = " ".join([str(d.get('global_space', '')) for d in self.analyzer._details] + [str(d.get('local_space', '')) for d in self.analyzer._details])
        for space_val in self.analyzer.custom_space.values(): all_spaces += " " + space_val
        raw_code = re.sub(r'//.*|#.*|/\*[\s\S]*?\*/', '', "\n".join(self.analyzer.source_lines)).lower()
            
        if self.analyzer.max_space_weight >= 5: all_spaces += " O(n!)"
        elif self.analyzer.max_space_weight >= 4: all_spaces += " O(2^n)"
        elif self.analyzer.max_space_weight >= 3: all_spaces += " O(V+E)"
        elif self.analyzer.max_space_weight >= 2: all_spaces += " O(n^2)"
        elif self.analyzer.max_space_weight >= 1: all_spaces += " O(n)"
        elif self.analyzer.max_space_weight >= 0.5: all_spaces += " O(1)"
        
        if "n!" in all_spaces: return "O(n!)"
        if "2^n" in all_spaces or "2ⁿ" in all_spaces: return "O(2^n)"
        _sp = [int(k) for k in re.findall(r"n\^(\d+)", all_spaces) if int(k) >= 3]
        if _sp: return f"O(n^{max(_sp)})"
        if "n^2" in all_spaces or "n²" in all_spaces: return "O(n^2)"
        if "V+E" in all_spaces or "O(V)" in all_spaces:
            # traversal bookkeeping alone is O(V); pushes that aren't marked, or building the
            # adjacency lists, can reach O(V+E) (see graph_aux_space)
            return "O(V)" if getattr(self.analyzer, 'graph_aux_space', "V+E") == "V" else "O(V+E)"
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
