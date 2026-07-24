"""
Pattern Evaluators

Post-traversal evaluators that turn the raw signals gathered by
PatternVisitor into higher-level booleans/classifications (recursion
shape, graph context, memoization, backtracking). Composed by
PatternVisitor as `self.evaluator`; reads/writes the visitor's
signals via `self.visitor`.
"""


class PatternEvaluator:
    """Post-traversal signal evaluator, composed into PatternVisitor as `self.evaluator`."""

    def __init__(self, visitor):
        self.visitor = visitor

    def evaluate_recursion(self):
        signals = self.visitor.signals
        ctx = self.visitor.ctx
        if signals.has_recursion:
            if getattr(ctx, "recursive_calls_count", 0) > 1:
                signals.recursion_branching = "multi"
            else:
                signals.recursion_branching = "linear_or_unknown"

            if getattr(ctx, "has_recursion_in_loop", False) or signals.loop_depth > 0:
                signals.has_backtracking_risk = True
                signals.recursion_in_loop = True

    def evaluate_graph_context(self):
        signals = self.visitor.signals
        ctx = self.visitor.ctx
        if getattr(ctx, "in_graph_context", False):
            signals.graph_traversal = True
            signals.visited_tracking = True
            signals.memory_signals.tracks_visited_nodes = True

    def evaluate_memoization(self):
        signals = self.visitor.signals
        ctx = self.visitor.ctx
        if getattr(ctx, "current_function_name", None) in getattr(ctx, "memoized_funcs", set()) or signals.has_memoization:
            signals.has_memoization = True
            signals.memory_signals.caches_results = True

    def evaluate_backtracking(self):
        signals = self.visitor.signals
        if signals.has_recursion and 'append' in self.visitor._function_calls and 'pop' in self.visitor._function_calls:
            signals.has_backtracking_risk = True
