"""
Pattern Visitor (composed)

Composes PatternVisitMixin + PatternEvaluatorMixin into the public
ComprehensiveASTVisitor used by the analyzer to gather PatternSignals
for a function body.
"""
import ast
from typing import Set

from explanation_signals import PatternSignals
from pattern_ast_visitor import PatternVisitMixin
from pattern_evaluators import PatternEvaluatorMixin


class ComprehensiveASTVisitor(PatternVisitMixin, PatternEvaluatorMixin, ast.NodeVisitor):
    def __init__(self, ctx):
        self.ctx = ctx
        self.signals = PatternSignals()

        self._current_loop_depth = getattr(ctx, "active_poly_dims", [])
        self.signals.loop_depth = len(self._current_loop_depth)
        self.signals.nested_loops = self.signals.loop_depth > 1

        self._in_loop = self.signals.loop_depth > 0
        self._function_calls: Set[str] = set()
        self._modified_structures: Set[str] = set()
        self._assigned_vars: Set[str] = set()

    def analyze(self, node: ast.AST) -> PatternSignals:
        if node:
            self.visit(node)

        self._evaluate_recursion()
        self._evaluate_graph_context()
        self._evaluate_memoization()
        self._evaluate_backtracking()

        return self.signals
