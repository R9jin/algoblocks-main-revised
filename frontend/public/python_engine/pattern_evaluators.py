"""
Pattern Evaluators

Post-traversal evaluators that turn the raw signals gathered by
PatternVisitMixin into higher-level booleans/classifications
(recursion shape, graph context, memoization, backtracking).
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

class PatternEvaluatorMixin:
    """Mixin providing post-traversal signal evaluation to ComprehensiveASTVisitor."""

    def _evaluate_recursion(self):
        if self.signals.has_recursion:
            if getattr(self.ctx, "recursive_calls_count", 0) > 1:
                self.signals.recursion_branching = "multi"
            else:
                self.signals.recursion_branching = "linear_or_unknown"

            if getattr(self.ctx, "has_recursion_in_loop", False) or self.signals.loop_depth > 0:
                self.signals.has_backtracking_risk = True
                self.signals.recursion_in_loop = True

    def _evaluate_graph_context(self):
        if getattr(self.ctx, "in_graph_context", False):
            self.signals.graph_traversal = True
            self.signals.visited_tracking = True
            self.signals.memory_signals.tracks_visited_nodes = True

    def _evaluate_memoization(self):
        if getattr(self.ctx, "current_function_name", None) in getattr(self.ctx, "memoized_funcs", set()) or self.signals.has_memoization:
            self.signals.has_memoization = True
            self.signals.memory_signals.caches_results = True

    def _evaluate_backtracking(self):
        if self.signals.has_recursion and 'append' in self._function_calls and 'pop' in self._function_calls:
            self.signals.has_backtracking_risk = True

# =========================================================================
# EDUCATIONAL INSIGHT GENERATOR (NLG Engine)
# =========================================================================
