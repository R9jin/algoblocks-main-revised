"""
Pattern Visitor

Collects raw structural signals (recursion calls, comparisons,
comprehensions, etc.) while walking a function body via the standard
ast.NodeVisitor dispatch, then hands off to PatternEvaluator to turn
those raw signals into higher-level classifications. This is the
public ComprehensiveASTVisitor used by the analyzer/explainer to
gather PatternSignals for a function body.
"""
import ast
from typing import Set

from explanation_signals import PatternSignals
from pattern_evaluators import PatternEvaluator


class ComprehensiveASTVisitor(ast.NodeVisitor):
    """
    Single-inheritance ast.NodeVisitor (visit_* dispatch requires the
    methods to live on the traversed object itself). Composes a
    PatternEvaluator (`self.evaluator`) for the post-traversal signal
    classification step, and takes the owning ComplexityAnalyzer as
    `ctx` for the handful of shared-state reads it needs.
    """

    def __init__(self, ctx):
        self.ctx = ctx
        self.signals = PatternSignals()
        self.evaluator = PatternEvaluator(self)

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

        self.evaluator.evaluate_recursion()
        self.evaluator.evaluate_graph_context()
        self.evaluator.evaluate_memoization()
        self.evaluator.evaluate_backtracking()

        return self.signals

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if ast.get_docstring(node):
            self.signals.has_docstring = True
        for dec in getattr(node, "decorator_list", []):
            dec_name = getattr(dec, "id", None) or getattr(getattr(dec, "func", None), "id", None) or getattr(dec, "attr", None)
            if dec_name == "lru_cache" or dec_name == "cache":
                self.signals.complexity_signals.lru_cache_decorator = True
                self.signals.has_memoization = True
                self.signals.memory_signals.caches_results = True
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        if ast.get_docstring(node):
            self.signals.has_docstring = True
        self.generic_visit(node)

    def visit_Module(self, node: ast.Module):
        if ast.get_docstring(node):
            self.signals.has_docstring = True
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        if self._in_loop:
            self.signals.repeated_calls_in_loop = True

        if isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            self._function_calls.add(method_name)

            owner_name = node.func.value.id if isinstance(node.func.value, ast.Name) else None
            if owner_name:
                self._modified_structures.add(f"{owner_name}.{method_name}")
                if owner_name == 'math':
                    self.signals.complexity_signals.heavy_math_operations = True
                    if method_name in ['comb', 'perm', 'factorial']:
                        self.signals.paradigms.is_combinatorics = True
                    elif method_name in ['sqrt', 'dist', 'hypot']:
                        self.signals.paradigms.is_euclidean_distance = True
                elif owner_name == 'heapq':
                    self.signals.memory_signals.uses_heap = True
                    self.signals.complexity_signals.heap_push_pop = True
                    self.signals.paradigms.is_priority_queue = True
                elif owner_name == 'bisect':
                    self.signals.complexity_signals.binary_search_module = True
                    self.signals.paradigms.is_halving = True
                elif owner_name == 'itertools':
                    self.signals.complexity_signals.itertools_usage = True
                elif owner_name == 'random':
                    pass  # negligible cost signal, kept for future extension

            if method_name == 'pop':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_pop = True
                else:
                    self.signals.paradigms.is_dfs_stack = True

            elif method_name == 'insert':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_insert = True

            elif method_name == 'sort':
                if self._in_loop:
                    self.signals.complexity_signals.repeated_sort = True

            elif method_name == 'popleft':
                self.signals.memory_signals.efficient_deque_pop = True
                self.signals.paradigms.is_bfs_queue = True

            elif method_name == 'heappush' or method_name == 'heappop' or method_name == 'heapify':
                self.signals.memory_signals.uses_heap = True
                self.signals.complexity_signals.heap_push_pop = True
                self.signals.paradigms.is_priority_queue = True

            elif method_name == 'append':
                self.signals.complexity_signals.amortized_operation = True
                if self._in_loop or getattr(self.ctx, "in_graph_context", False):
                    self.signals.visited_tracking = True

            elif method_name == 'extend':
                if self._in_loop and node.args and isinstance(node.args[0], ast.Name) and isinstance(node.func.value, ast.Name):
                    if node.func.value.id == node.args[0].id:
                        self.signals.memory_signals.geometric_capacity_growth = True

            elif method_name in ['union', 'intersection', 'difference', 'symmetric_difference']:
                self.signals.complexity_signals.set_mathematical_ops = True

            elif method_name == 'get':
                self.signals.complexity_signals.dict_lookup_constant = True

            elif method_name in ['update', 'add']:
                self.signals.memory_signals.set_and_dict_updates = True
                if self._in_loop or getattr(self.ctx, "in_graph_context", False):
                    self.signals.visited_tracking = True

            elif method_name == 'join':
                self.signals.memory_signals.uses_join_for_strings = True

            elif method_name == 'split' or method_name in ('upper', 'lower', 'strip', 'replace', 'title', 'capitalize'):
                self.signals.complexity_signals.linear_string_op = True

            elif method_name == 'reverse':
                self.signals.complexity_signals.list_reverse_op = True

            elif method_name == 'count':
                self.signals.complexity_signals.list_count_op = True

            elif method_name in ('keys', 'values', 'items'):
                self.signals.memory_signals.allocates_view_object = True
                self.signals.creates_view_object = True
                if self._in_loop:
                    self.signals.complexity_signals.dict_view_iteration = True

            elif method_name == 'find':
                if owner_name and getattr(self.ctx, "var_types", {}).get(owner_name) == 'dict':
                    pass  # find isn't a dict method; guard kept for clarity, no-op otherwise

        elif isinstance(node.func, ast.Name):
            func_name = node.func.id
            self._function_calls.add(func_name)

            if func_name in ['sum', 'max', 'min', 'all', 'any'] and self._in_loop:
                self.signals.complexity_signals.aggregation_in_loop = True

            if func_name in ['sqrt', 'pow', 'abs']:
                self.signals.complexity_signals.heavy_math_operations = True

            if func_name == 'sorted':
                self.signals.memory_signals.sorted_makes_a_copy = True

            if func_name in ('zip', 'enumerate', 'map', 'filter', 'reversed'):
                self.signals.complexity_signals.iteration_helper_usage = True

            if func_name == 'Counter':
                self.signals.memory_signals.allocates_counter = True
                self.signals.memory_signals.allocates_dicts = True

            if func_name in ('int', 'float', 'str', 'list', 'tuple', 'set', 'dict', 'bool'):
                self.signals.complexity_signals.type_conversion = True

            current_fn = getattr(self.ctx, "current_function_name", None)
            indirect_fns = getattr(self.ctx, "indirect_recursive_funcs", set())

            if func_name == current_fn:
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True
                if self._in_loop:
                    self.signals.recursion_in_loop = True
            elif func_name in indirect_fns:
                self.signals.indirect_recursion = True
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True

        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare):
        for op in node.ops:
            if isinstance(op, (ast.In, ast.NotIn)):
                if self._in_loop:
                    self.signals.membership_in_loop = True
                    self.signals.complexity_signals.membership_in_list = True
                if isinstance(node.comparators[0], (ast.Name, ast.Attribute)):
                    self.signals.has_memoization = True
                    self.signals.paradigms.is_memoization_check = True
                    self.signals.memory_signals.caches_results = True

            if isinstance(op, (ast.Lt, ast.LtE)):
                if isinstance(node.left, ast.Name) and isinstance(node.comparators[0], ast.Name):
                    self.signals.paradigms.is_two_pointer = True

        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp):
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.BitXor, ast.LShift, ast.RShift)):
            self.signals.complexity_signals.bitwise_operations = True
            if isinstance(node.op, ast.LShift):
                self.signals.paradigms.is_bitmasking = True
            if isinstance(node.op, ast.BitAnd) and isinstance(node.right, ast.BinOp) and isinstance(node.right.op, ast.Sub):
                if getattr(node.right.right, 'value', None) == 1:
                    self.signals.paradigms.is_brian_kernighan = True

        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.BitXor)):
            self.signals.complexity_signals.set_mathematical_ops = True
        elif isinstance(node.op, ast.Sub):
            l_is_set = isinstance(node.left, ast.Name) and getattr(self.ctx, "var_types", {}).get(node.left.id) == 'set'
            r_is_set = isinstance(node.right, ast.Name) and getattr(self.ctx, "var_types", {}).get(node.right.id) == 'set'
            if l_is_set or r_is_set:
                self.signals.complexity_signals.set_mathematical_ops = True

        if isinstance(node.op, ast.FloorDiv) and getattr(node.right, 'value', None) == 2:
            self.signals.paradigms.is_halving = True
        elif isinstance(node.op, ast.Div) and getattr(node.right, 'value', None) == 2:
            self.signals.paradigms.is_halving = True

        if isinstance(node.op, ast.Mod):
            self.signals.paradigms.is_modulo_arithmetic = True

        if isinstance(node.op, ast.Pow):
            self.signals.complexity_signals.heavy_math_operations = True
            if getattr(node.right, 'value', None) == 2:
                self.signals.complexity_signals.quadratic_math = True

        # list/string repetition via `*`, and list concatenation via `+`
        if isinstance(node.op, ast.Mult):
            left_is_container = isinstance(node.left, (ast.List, ast.Constant)) and isinstance(getattr(node.left, 'value', None), str) or isinstance(node.left, ast.List)
            right_is_container = isinstance(node.right, (ast.List, ast.Constant)) and isinstance(getattr(node.right, 'value', None), str) or isinstance(node.right, ast.List)
            if (left_is_container and isinstance(node.right, (ast.Name, ast.Constant))) or (right_is_container and isinstance(node.left, (ast.Name, ast.Constant))):
                self.signals.memory_signals.uses_string_multiplication = True

        if isinstance(node.op, ast.Add):
            if isinstance(node.left, ast.List) or isinstance(node.right, ast.List):
                self.signals.memory_signals.creates_new_list_from_concat = True
            elif isinstance(node.left, ast.Name) and isinstance(node.right, ast.Name):
                lt = getattr(self.ctx, "var_types", {}).get(node.left.id)
                rt = getattr(self.ctx, "var_types", {}).get(node.right.id)
                if lt == 'list' and rt == 'list':
                    self.signals.memory_signals.creates_new_list_from_concat = True

        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp):
        self.signals.complexity_signals.boolean_short_circuit = True
        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.signals.has_comment_block = True
        self.generic_visit(node)

    def visit_ListComp(self, node: ast.ListComp):
        is_nested = len(node.generators) > 1
        if isinstance(node.elt, ast.ListComp) or (isinstance(node.elt, ast.BinOp) and isinstance(node.elt.op, ast.Mult) and isinstance(node.elt.left, ast.List)):
            is_nested = True

        if is_nested:
            self.signals.memory_signals.allocates_2d_lists = True
            self.signals.paradigms.is_grid_traversal = True

        self.signals.comprehension_expansion = True
        self.signals.memory_signals.uses_list_comprehension = True
        self.signals.memory_signals.allocates_lists = True
        self.generic_visit(node)

    def visit_SetComp(self, node: ast.SetComp):
        self.signals.comprehension_expansion = True
        self.signals.memory_signals.uses_set_comprehension = True
        self.signals.memory_signals.allocates_sets = True
        self.generic_visit(node)

    def visit_DictComp(self, node: ast.DictComp):
        self.signals.comprehension_expansion = True
        self.signals.memory_signals.uses_dict_comprehension = True
        self.signals.memory_signals.allocates_dicts = True
        self.generic_visit(node)

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        self.signals.comprehension_expansion = True
        self.signals.memory_signals.uses_generator = True
        self.signals.uses_yield = True
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript):
        if isinstance(node.slice, ast.Slice):
            self.signals.memory_signals.performs_slicing = True

        if isinstance(node.slice, ast.Tuple) or (hasattr(node, 'value') and isinstance(node.value, ast.Subscript)):
            self.signals.paradigms.is_matrix_math = True

        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign):
        if self._in_loop and isinstance(node.op, ast.Add):
            if isinstance(node.target, ast.Name) and getattr(self.ctx, "var_types", {}).get(node.target.id) == 'str':
                self.signals.memory_signals.string_concatenation_in_loop = True
            elif isinstance(node.target, ast.Name) and isinstance(node.value, ast.Name) and node.value.id == node.target.id:
                self.signals.memory_signals.geometric_capacity_growth = True
                self.signals.paradigms.is_doubling = True
            elif isinstance(node.target, ast.Subscript):
                self.signals.paradigms.is_prefix_sum = True

        elif self._in_loop and isinstance(node.op, ast.Mult) and isinstance(node.target, ast.Name):
            self.signals.memory_signals.geometric_capacity_growth = True
            self.signals.paradigms.is_doubling = True

        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
            self.signals.variable_swapping = True
            self.signals.memory_signals.inplace_swap = True

            if len(node.value.elts) == 2 and isinstance(node.value.elts[1], ast.BinOp) and isinstance(node.value.elts[1].op, ast.Add):
                self.signals.paradigms.is_fibonacci_sequence = True

        if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and isinstance(node.value.left, ast.List):
            self.signals.paradigms.is_tabulation_setup = True
            self.signals.memory_signals.dp_tabulation_array = True
            self.signals.memory_signals.array_preallocation = True

        if isinstance(node.value, ast.ListComp):
            if isinstance(node.value.elt, ast.ListComp) or (isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List)):
                self.signals.memory_signals.allocates_2d_lists = True
                self.signals.paradigms.is_grid_traversal = True

        if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Add):
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                if getattr(self.ctx, "var_types", {}).get(t_id) in ['str', 'list', 'tuple', 'deque']:
                    count = sum(1 for n in ast.walk(node.value) if isinstance(n, ast.Name) and n.id == t_id)
                    if count >= 2:
                        self.signals.memory_signals.geometric_capacity_growth = True

        if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult):
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                for child in ast.walk(node.value):
                    if isinstance(child, ast.Name) and child.id == t_id:
                        self.signals.memory_signals.geometric_capacity_growth = True
                        self.signals.paradigms.is_doubling = True

        # Kadane-style running best: x = max(x, ...) or x = max(x + y, y) inside a loop
        if self._in_loop and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id in ('max', 'min'):
            target_ids = {t.id for t in node.targets if isinstance(t, ast.Name)}
            arg_names = {n.id for a in node.value.args for n in ast.walk(a) if isinstance(n, ast.Name)}
            if target_ids & arg_names:
                self.signals.paradigms.is_kadane = True

        # Union-Find style path compression: parent[x] = find(parent[x])
        if isinstance(node.targets[0], ast.Subscript) if node.targets else False:
            pass

        self.generic_visit(node)

    def visit_Delete(self, node: ast.Delete):
        self.signals.uses_delete = True
        self.generic_visit(node)

    def visit_Global(self, node: ast.Global):
        self.signals.uses_global_or_nonlocal = True
        self.generic_visit(node)

    def visit_Nonlocal(self, node: ast.Nonlocal):
        self.signals.uses_global_or_nonlocal = True
        self.generic_visit(node)

    def visit_Starred(self, node: ast.Starred):
        self.signals.uses_star_unpacking = True
        self.generic_visit(node)

    def visit_NamedExpr(self, node):  # walrus operator, Python 3.8+
        self.signals.uses_walrus = True
        self.generic_visit(node)

    def visit_Break(self, node: ast.Break):
        self.signals.has_early_exits = True
        self.generic_visit(node)

    def visit_Continue(self, node: ast.Continue):
        self.signals.has_continue = True
        self.generic_visit(node)

    def visit_Return(self, node: ast.Return):
        if self._in_loop:
            self.signals.has_early_exits = True
        self.generic_visit(node)

    def visit_IfExp(self, node: ast.IfExp):
        self.signals.inline_ternary = True
        self.generic_visit(node)

    def visit_JoinedStr(self, node: ast.JoinedStr):
        self.signals.string_interpolation = True
        self.signals.complexity_signals.f_string_usage = True
        self.generic_visit(node)

    def visit_Try(self, node: ast.Try):
        self.signals.uses_try_except = True
        if self._in_loop:
            self.signals.complexity_signals.exception_control_flow = True
        self.generic_visit(node)

    def visit_With(self, node: ast.With):
        self.signals.uses_context_manager = True
        self.generic_visit(node)

    def visit_AsyncWith(self, node: ast.AsyncWith):
        self.signals.uses_context_manager = True
        self.generic_visit(node)

    def visit_Lambda(self, node: ast.Lambda):
        self.signals.uses_lambda = True
        self.generic_visit(node)

    def visit_Yield(self, node: ast.Yield):
        self.signals.uses_yield = True
        self.signals.memory_signals.uses_generator = True
        self.generic_visit(node)

    def visit_YieldFrom(self, node: ast.YieldFrom):
        self.signals.uses_yield = True
        self.signals.memory_signals.uses_generator = True
        self.generic_visit(node)

    def visit_Raise(self, node: ast.Raise):
        self.signals.uses_raise = True
        self.generic_visit(node)

    def visit_Assert(self, node: ast.Assert):
        self.signals.uses_assert = True
        self.generic_visit(node)
