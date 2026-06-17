# semantic_nlg.py
import ast
import random
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

# =========================================================================
# DATACLASSES & SIGNAL TRACKING
# =========================================================================

@dataclass
class BigOInfo:
    raw: str
    normalized: str
    family: str  
    factors: Dict[str, Any]

@dataclass
class MemorySignals:
    allocates_lists: bool = False
    allocates_2d_lists: bool = False
    allocates_dicts: bool = False
    allocates_sets: bool = False
    uses_list_comprehension: bool = False
    uses_dict_comprehension: bool = False
    uses_set_comprehension: bool = False
    uses_generator: bool = False
    performs_slicing: bool = False
    string_concatenation_in_loop: bool = False
    geometric_capacity_growth: bool = False
    tracks_visited_nodes: bool = False
    recursive_stack_risk: bool = False
    efficient_deque_pop: bool = False
    set_and_dict_updates: bool = False
    caches_results: bool = False
    dp_tabulation_array: bool = False
    array_preallocation: bool = False  # Agnostic detection of [val] * N
    inplace_swap: bool = False

@dataclass
class ComplexitySignals:
    inefficient_list_pop: bool = False      
    inefficient_list_insert: bool = False   
    repeated_sort: bool = False             
    membership_in_list: bool = False        
    heavy_math_operations: bool = False     
    quadratic_math: bool = False            # Agnostic detection of x ** 2
    set_mathematical_ops: bool = False
    dict_lookup_constant: bool = False
    amortized_operation: bool = False
    aggregation_in_loop: bool = False 
    bitwise_operations: bool = False
    boolean_short_circuit: bool = False
    f_string_usage: bool = False
    exception_control_flow: bool = False    # Using try/except in a loop

@dataclass
class AlgorithmicParadigms:
    is_halving: bool = False                     # Binary Search / Divide & Conquer
    is_doubling: bool = False                    # Exponential growth
    is_two_pointer: bool = False                 # Agnostic: while var1 < var2
    is_sliding_window: bool = False              # window_sum, left++, right++
    is_fast_slow_pointer: bool = False           # Floyd's Cycle finding
    is_grid_traversal: bool = False              # Nested loops or 2D array accessing
    is_memoization_check: bool = False           # Agnostic: if key in struct
    is_tabulation_setup: bool = False            # Agnostic: struct = [val] * n
    is_brian_kernighan: bool = False             # n & (n - 1)
    is_fibonacci_sequence: bool = False          # a, b = b, a + b
    is_bfs_queue: bool = False                   # queue.popleft()
    is_dfs_stack: bool = False                   # stack.pop()
    is_modulo_arithmetic: bool = False           # n % 2
    is_matrix_math: bool = False                 # nested array indexing
    is_combinatorics: bool = False               # math.comb, math.factorial
    is_euclidean_distance: bool = False          # math.sqrt((x2-x1)**2 + (y2-y1)**2)
    is_prefix_sum: bool = False                  # Agnostic: arr[i] = arr[i] + arr[i-1]
    is_bitmasking: bool = False                  # Advanced bitwise context (1 << n)

@dataclass
class PatternSignals:
    loop_depth: int = 0
    nested_loops: bool = False
    
    has_recursion: bool = False
    indirect_recursion: bool = False
    recursion_branching: Optional[str] = None  
    has_backtracking_risk: bool = False
    has_memoization: bool = False
    recursion_in_loop: bool = False
    
    membership_in_loop: bool = False
    comprehension_expansion: bool = False
    
    graph_traversal: bool = False
    visited_tracking: bool = False
    
    repeated_calls_in_loop: bool = False
    has_early_exits: bool = False  
    has_continue: bool = False

    inline_ternary: bool = False
    string_interpolation: bool = False
    variable_swapping: bool = False
    
    # Text and Structure Recognition
    has_comment_block: bool = False
    has_docstring: bool = False
    uses_try_except: bool = False
    uses_context_manager: bool = False
    uses_lambda: bool = False
    uses_yield: bool = False
    uses_raise: bool = False
    uses_assert: bool = False

    memory_signals: MemorySignals = field(default_factory=MemorySignals)
    complexity_signals: ComplexitySignals = field(default_factory=ComplexitySignals)
    paradigms: AlgorithmicParadigms = field(default_factory=AlgorithmicParadigms)
    
    extra_notes: List[str] = field(default_factory=list)


# =========================================================================
# COMPREHENSIVE AST VISITOR (Deep Structural Detection)
# =========================================================================

class ComprehensiveASTVisitor(ast.NodeVisitor):
    """
    Analyzes the AST to detect specific structural patterns, exact algorithmic
    paradigms, and behaviors that impact time and space complexity.
    It utilizes variable-name agnostic logic wherever possible to ensure robust
    detection across diverse coding styles.
    """
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

    def visit_FunctionDef(self, node: ast.FunctionDef):
        # Detect if a proper docstring is present at the function level
        if ast.get_docstring(node):
            self.signals.has_docstring = True
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
            
            if isinstance(node.func.value, ast.Name):
                self._modified_structures.add(f"{node.func.value.id}.{method_name}")
                
                # Math library agnostic detection
                if node.func.value.id == 'math':
                    self.signals.complexity_signals.heavy_math_operations = True
                    if method_name in ['comb', 'perm', 'factorial']:
                        self.signals.paradigms.is_combinatorics = True
                    elif method_name in ['sqrt', 'dist', 'hypot']:
                        self.signals.paradigms.is_euclidean_distance = True
            
            # Detect pop(0) vs pop()
            if method_name == 'pop':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_pop = True
                else:
                    self.signals.paradigms.is_dfs_stack = True # Standard pop acts as a stack
            
            elif method_name == 'insert':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_insert = True
                    
            elif method_name == 'sort':
                if self._in_loop:
                    self.signals.complexity_signals.repeated_sort = True

            elif method_name == 'popleft':
                self.signals.memory_signals.efficient_deque_pop = True
                self.signals.paradigms.is_bfs_queue = True
                
            elif method_name == 'append':
                self.signals.complexity_signals.amortized_operation = True
                # Agnostic visited tracking: adding items to a collection inside a loop or graph context
                if self._in_loop or getattr(self.ctx, "in_graph_context", False):
                    self.signals.visited_tracking = True
                
            elif method_name == 'extend':
                if self._in_loop and node.args and isinstance(node.args[0], ast.Name) and isinstance(node.func.value, ast.Name):
                    if node.func.value.id == node.args[0].id:
                        self.signals.memory_signals.geometric_capacity_growth = True

            elif method_name in ['union', 'intersection', 'difference']:
                self.signals.complexity_signals.set_mathematical_ops = True

            elif method_name == 'get':
                self.signals.complexity_signals.dict_lookup_constant = True

            elif method_name in ['update', 'add']:
                self.signals.memory_signals.set_and_dict_updates = True
                # Agnostic visited tracking
                if self._in_loop or getattr(self.ctx, "in_graph_context", False):
                    self.signals.visited_tracking = True

        elif isinstance(node.func, ast.Name):
            func_name = node.func.id
            self._function_calls.add(func_name)
            
            if func_name in ['sum', 'max', 'min', 'all', 'any'] and self._in_loop:
                self.signals.complexity_signals.aggregation_in_loop = True
                
            # Generic math functions without 'math.' prefix
            if func_name in ['sqrt', 'pow', 'abs']:
                self.signals.complexity_signals.heavy_math_operations = True

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
                
                # Agnostic Dynamic Programming / Memoization check
                # If we are checking membership inside a dictionary/set (represented by a variable)
                if isinstance(node.comparators[0], (ast.Name, ast.Attribute)):
                    self.signals.has_memoization = True
                    self.signals.paradigms.is_memoization_check = True
                    self.signals.memory_signals.caches_results = True

            # Two Pointer Paradigm Agnostic Detection (var1 < var2)
            if isinstance(op, (ast.Lt, ast.LtE)):
                if isinstance(node.left, ast.Name) and isinstance(node.comparators[0], ast.Name):
                    self.signals.paradigms.is_two_pointer = True

        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp):
        # Bitwise Ops
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.BitXor, ast.LShift, ast.RShift)):
            self.signals.complexity_signals.bitwise_operations = True
            
            if isinstance(node.op, ast.LShift):
                self.signals.paradigms.is_bitmasking = True
            
            # Brian Kernighan's Algorithm snippet: n & (n - 1)
            if isinstance(node.op, ast.BitAnd) and isinstance(node.right, ast.BinOp) and isinstance(node.right.op, ast.Sub):
                if getattr(node.right.right, 'value', None) == 1:
                    self.signals.paradigms.is_brian_kernighan = True
                    
        # Mathematical Sets
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)):
            self.signals.complexity_signals.set_mathematical_ops = True

        # Halving (Binary Search / Divide & Conquer)
        if isinstance(node.op, ast.FloorDiv) and getattr(node.right, 'value', None) == 2:
            self.signals.paradigms.is_halving = True
        elif isinstance(node.op, ast.Div) and getattr(node.right, 'value', None) == 2:
            self.signals.paradigms.is_halving = True

        # Modulo
        if isinstance(node.op, ast.Mod):
            self.signals.paradigms.is_modulo_arithmetic = True
            
        # Power / Quadratic / Euclidean
        if isinstance(node.op, ast.Pow):
            self.signals.complexity_signals.heavy_math_operations = True
            if getattr(node.right, 'value', None) == 2:
                self.signals.complexity_signals.quadratic_math = True

        self.generic_visit(node)
        
    def visit_BoolOp(self, node: ast.BoolOp):
        self.signals.complexity_signals.boolean_short_circuit = True
        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr):
        # Bare expressions are often string blocks or unassigned variable calls.
        # Check specifically for multi-line strings or block comments (""" comment """)
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            # If it's a bare string expression and wasn't picked up as a module/class/func docstring,
            # it's acting as an inline block comment.
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
        
        # Matrix Math Detection (e.g. arr[i][j])
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
        # Swap paradigm (e.g., a, b = b, a)
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
            self.signals.variable_swapping = True
            self.signals.memory_signals.inplace_swap = True
            
            # Fibonacci Paradigm: a, b = b, a + b
            if len(node.value.elts) == 2 and isinstance(node.value.elts[1], ast.BinOp) and isinstance(node.value.elts[1].op, ast.Add):
                self.signals.paradigms.is_fibonacci_sequence = True
                
        # Agnostic Tabulation Setup: array = [val] * N
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
        # We also check the agnostic signal captured in visit_Compare
        if getattr(self.ctx, "current_function_name", None) in getattr(self.ctx, "memoized_funcs", set()) or self.signals.has_memoization:
            self.signals.has_memoization = True
            self.signals.memory_signals.caches_results = True

    def _evaluate_backtracking(self):
        if self.signals.has_recursion and 'append' in self._function_calls and 'pop' in self._function_calls:
            self.signals.has_backtracking_risk = True


# =========================================================================
# EDUCATIONAL INSIGHT GENERATOR (NLG Engine)
# =========================================================================

class EducationalInsightGenerator:
    """
    Constructs highly modular, educational explanations for the user.
    It builds sentences like puzzle pieces:
    [Action] + [Local Reality] + [Global Reality] + [Educational Insight].
    """
    def __init__(self, ctx):
        self.ctx = ctx

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
            
        return BigOInfo(
            raw=complexity_str,
            normalized=complexity_str,
            family=family,
            factors={}
        )

    # -------------------------------------------------------------------------
    # PIECE 1: THE ACTION BUILDERS (What is the code doing?)
    # -------------------------------------------------------------------------
    def _build_action_intro(self, node: ast.AST, code_snippet: str, sig: PatternSignals) -> str:
        """Generates the opening sentence based on the AST node type and paradigms."""
        # High priority paradigms
        if sig.paradigms.is_halving:
            return f"Looking at `{code_snippet}`, the algorithm performs a crucial mathematical division, actively halving the problem space."
        if sig.paradigms.is_two_pointer:
            return f"In this line (`{code_snippet}`), we see a convergence check—a foundational signature of the 'Two-Pointer' or 'Sliding Window' technique."
        if sig.paradigms.is_tabulation_setup:
            return f"Looking at `{code_snippet}`, the code pre-allocates an entire memory block upfront, a classic setup for Tabulation."
        if sig.paradigms.is_fibonacci_sequence:
            return f"Here in `{code_snippet}`, we are performing a simultaneous tuple unpacking to cleanly shift variables forward—a staple of sequence progression."
        if sig.paradigms.is_brian_kernighan:
            return f"This specific line (`{code_snippet}`) utilizes a brilliant bitwise trick to drop the lowest set bit instantly."
        if sig.paradigms.is_combinatorics:
            return f"This step (`{code_snippet}`) executes a heavy combinatorial math equation (like permutations or factorials), which scales incredibly fast."
        if sig.paradigms.is_euclidean_distance:
            return f"Looking at `{code_snippet}`, the engine is calculating a spatial distance metric, applying quadratic squaring and rooting."

        snippet_ref = f"Looking at `{code_snippet}`" if code_snippet else "Reviewing this specific line"

        # Structural/AST node types
        if isinstance(node, ast.Assign):
            return f"{snippet_ref}, the code assigns a calculated value, capturing a specific state."
        elif isinstance(node, ast.AugAssign):
            return f"{snippet_ref}, we are directly updating or mutating an existing variable."
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return f"{snippet_ref}, a method (`.{node.func.attr}()`) is invoked to manipulate the targeted data structure."
            elif isinstance(node.func, ast.Name):
                return f"{snippet_ref}, the code triggers the core `{node.func.id}()` function."
            return f"{snippet_ref}, a complex function call is being executed."
        elif isinstance(node, ast.For):
            return f"{snippet_ref}, an iterative loop is established to sequentially process a collection."
        elif isinstance(node, ast.While):
            return f"{snippet_ref}, a dynamic `while` loop is engaged to continuously run based on an evolving condition."
        elif isinstance(node, ast.If):
            return f"{snippet_ref}, the execution flow hits a conditional branch, slicing the logic path."
        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp)):
            return f"{snippet_ref}, Python leverages a syntactic comprehension to construct a collection dynamically in one pass."
        elif isinstance(node, ast.Return):
            return f"{snippet_ref}, the function completes its mathematical evaluation and returns the final payload."
        elif isinstance(node, ast.Subscript):
            if isinstance(getattr(node, 'slice', None), ast.Slice):
                return f"{snippet_ref}, the array is being explicitly sliced to extract a localized segment."
            return f"{snippet_ref}, a specific precise element is accessed via index or dictionary key."
        elif isinstance(node, ast.Try):
            return f"{snippet_ref}, an exception handling block (`try/except`) is established to safely catch runtime errors."
        elif isinstance(node, ast.With):
            return f"{snippet_ref}, a context manager (`with` block) is opened to handle sensitive resources cleanly."
        elif isinstance(node, ast.Yield) or isinstance(node, ast.YieldFrom):
            return f"{snippet_ref}, execution halts momentarily to `yield` a value, turning this function into a powerful generator."
        elif isinstance(node, ast.Lambda):
            return f"{snippet_ref}, an anonymous, inline `lambda` function is declared for quick, on-the-fly execution."
        elif isinstance(node, ast.Raise):
            return f"{snippet_ref}, an error or exception is intentionally triggered, stopping normal execution."
        elif isinstance(node, ast.Assert):
            return f"{snippet_ref}, a strict assertion check is performed to guarantee program state integrity."
        elif sig.has_docstring:
            return f"{snippet_ref}, we observe a formal docstring, embedding vital documentation and metadata directly into the structure."
        elif sig.has_comment_block:
            return f"{snippet_ref}, a block string or comment is present to clarify logic or safely disable code."
        
        return f"{snippet_ref}, we observe a distinct operational step."

    # -------------------------------------------------------------------------
    # PIECE 2: LOCAL EXPLANATIONS
    # -------------------------------------------------------------------------
    def _build_local_time_explanation(self, local_info: BigOInfo, sig: PatternSignals) -> str:
        family = local_info.family
        
        # Meta/Text structures usually cost nothing
        if sig.has_docstring or sig.has_comment_block:
            return "This acts strictly as documentation or passive string data; it imposes absolutely zero computational penalty during live execution, resolving to a pure $O(1)$ footprint."

        if sig.complexity_signals.amortized_operation:
            return "In isolation, this evaluates to amortized constant time. Usually, it happens instantly, but occasionally it requires a heavier background operation (like resizing an array). On average, it remains a highly efficient $O(1)$ step."
        
        if family == "constant":
            return "Evaluated strictly on its own, this is an instant $O(1)$ operation. The CPU executes it directly without needing to iterate or scan through external data."
        elif family == "linear":
            return f"Locally, this step inherently takes linear time ({local_info.raw}). Under the hood, Python is forced to traverse the involved elements one by one."
        elif family == "logarithmic":
            return f"In a vacuum, this step executes logarithmically ({local_info.raw}), meaning it bypasses a massive amount of redundant checks by cutting the search space down."
        elif family == "polynomial":
            return f"By itself, this action triggers a nested evaluation ({local_info.raw}), structurally demanding a repetitive combination of work."
        elif "placeholder" in local_info.raw or local_info.raw.startswith("T("):
            return "Since this is a recursive invocation, its exact local execution time is deferred; it strictly depends on how the recursive tree branches out from this point."
            
        return f"Locally, this executes with a baseline operational cost of {local_info.raw}."

    def _build_local_space_explanation(self, local_info: BigOInfo, sig: PatternSignals) -> str:
        family = local_info.family
        
        if sig.has_docstring or sig.has_comment_block:
            return "Because this is static metadata parsed only during initial compilation, it consumes no dynamic runtime memory, preserving an immaculate $O(1)$ local environment."

        if sig.memory_signals.inplace_swap:
            return "Because this is an elegant in-place swap, it requires absolutely zero additional memory allocations, maintaining a pristine $O(1)$ local footprint."
        
        if family == "constant":
            return "Locally, this line operates with a highly efficient $O(1)$ memory footprint, meaning it either reuses existing space or only creates tiny scalar variables."
        elif family == "linear":
            return f"In isolation, this step explicitly demands new memory proportional to the data ({local_info.raw}), forcing the system to allocate fresh RAM for the resulting structure."
        elif family == "polynomial":
            return f"Locally, this generates a multi-dimensional array or dense matrix ({local_info.raw}), consuming significantly more contiguous memory blocks than standard flat lists."
        elif "placeholder" in local_info.raw:
            return "The immediate memory required here fluctuates fluidly based on the dynamically evaluated state."
            
        return f"This isolated instruction claims a localized memory footprint of {local_info.raw}."

    # -------------------------------------------------------------------------
    # PIECE 3: GLOBAL EXPLANATIONS
    # -------------------------------------------------------------------------
    def _build_global_time_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals) -> str:
        if sig.has_docstring or sig.has_comment_block:
            return "Its presence has no cascading effects on the global performance. The total systemic time complexity is fundamentally anchored by the actual operational logic of the block."

        if local_info.raw == global_info.raw:
            return f"Because this operation dictates the heaviest work done in this path, it establishes the function's overall algorithmic time complexity at {global_info.raw}."
        
        # Escalation Logic (Local is smaller than Global)
        if global_info.family == "polynomial" and local_info.family in ["linear", "constant"]:
            if sig.nested_loops:
                return f"However, because this step is trapped deep inside nested loops, its execution frequency multiplies dramatically, ballooning the overall time complexity to a quadratic {global_info.raw}."
            return f"However, because this step is repeated heavily, the sheer volume of iterations forces the total systemic time complexity to escalate to {global_info.raw}."
            
        if global_info.family in ["exponential", "recursive_branching", "super_exponential"]:
            if sig.has_recursion:
                return f"When factoring in the recursive tree this operation spawns, the workload effectively doubles (or worse) with each added depth, crashing the global efficiency to {global_info.raw}."
            return f"The algorithmic design surrounding this line causes explosive combinatorial growth, pushing the global processing time to a severe {global_info.raw}."
            
        if global_info.family == "linear" and local_info.family == "constant":
            if sig.loop_depth > 0:
                return f"Since this instantaneous $O(1)$ action cycles continuously inside a loop, the total time required to finish all passes accumulates to a linear {global_info.raw}."
                
        if global_info.family == "linearithmic" and local_info.family in ["constant", "linear"]:
            return f"Driven by the surrounding 'Divide and Conquer' logic (like sorting or halving trees), the aggregate execution scales out to an efficient {global_info.raw}."

        return f"When nested within the surrounding architectural structure, the total global time complexity evaluates to {global_info.raw}."

    def _build_global_space_explanation(self, local_info: BigOInfo, global_info: BigOInfo, sig: PatternSignals) -> str:
        if sig.has_docstring or sig.has_comment_block:
            return "Comments and docstrings do not compound globally. The actual global space complexity is entirely dependent on the variables and structures dynamically built within the execution path."

        if local_info.raw == global_info.raw:
            return f"As this is the peak structural allocation event in the entire algorithm, it cleanly defines the overarching global space complexity at {global_info.raw}."
        
        # Escalation Logic
        if global_info.family == "linear" and local_info.family == "constant":
            if sig.has_recursion:
                return f"However, because this function calls itself recursively, the interpreter stacks these $O(1)$ frames on top of each other, expanding the peak global memory usage to {global_info.raw}."
            return f"However, as the algorithm continuously cycles and accumulates data state, the total peak memory held by the system scales up to {global_info.raw}."
            
        if global_info.family == "polynomial" and local_info.family in ["linear", "constant"]:
            return f"While locally manageable, the surrounding logic forces the creation of a dense, multi-layered data landscape, driving the absolute peak memory consumption to {global_info.raw}."

        return f"Factoring in the peak high-water mark of the entire executing function, the global spatial footprint reaches {global_info.raw}."

    # -------------------------------------------------------------------------
    # PIECE 4: ALGORITHMIC INSIGHTS
    # -------------------------------------------------------------------------
    def _gather_time_insights(self, sig: PatternSignals, local_t: str) -> List[str]:
        insights = []
        
        # Paradigms
        if sig.paradigms.is_halving:
            insights.append("Mathematical Optimization: By explicitly halving the input (often via `// 2`), the algorithm safely discards 50% of the remaining search space. This is the cornerstone of Logarithmic ($O(\\log n)$) efficiency, making it blisteringly fast even for huge datasets.")
        if sig.paradigms.is_two_pointer:
            insights.append("Algorithmic Technique: Monitoring variables converging upon one another (like pointers approaching from opposite ends) frequently reduces what would be a slow nested $O(n^2)$ loop down to a clean, single-pass $O(n)$ scan.")
        if sig.paradigms.is_brian_kernighan:
            insights.append("Bitwise Mastery: The bitwise operation here elegantly drops the least significant set bit directly. This allows the algorithm to skip over zeroes completely, counting bits exponentially faster than an iterative scan.")
        if sig.paradigms.is_memoization_check:
            insights.append("Dynamic Programming: Intercepting execution to check if a state already exists inside a dictionary or hash map is the essence of Memoization. By instantly returning the saved answer, you drastically prune massive calculation branches off the execution tree.")
        if sig.paradigms.is_fibonacci_sequence:
            insights.append("State Advancement: Updating multiple variables on a single line evaluates the right side entirely before assigning to the left, seamlessly shifting the 'sliding window' of mathematical state forward without needing temporary variables.")
        if sig.paradigms.is_combinatorics:
            insights.append("Combinatorial Math: Operations dealing with permutations or factorials grow at an intensely aggressive rate ($O(n!)$ or worse). They mathematically force the CPU to account for every possible permutation, creating monumental workloads even for small inputs.")
        if sig.complexity_signals.quadratic_math:
            insights.append("Mathematical Overhead: Squaring numbers (`**2`) or dealing with quadratic distance equations introduces heavier arithmetic operations, though modern CPUs pipeline these specific instructions extremely efficiently.")

        # Complexity Traps & Patterns
        if sig.memory_signals.geometric_capacity_growth:
            insights.append("Architectural Warning: Continuously multiplying or adding a sequence to itself inside a loop forces the computer to reallocate exponentially doubling chunks of memory. This turns what appears to be a simple loop into an incredibly slow, volatile process.")
        elif sig.memory_signals.string_concatenation_in_loop:
            insights.append("Common Trap: Python strings are fully immutable. Appending to a string directly inside a loop forces Python to construct a brand new string from scratch every single cycle. For better performance, append to a list and use `.join()` at the end.")
        elif sig.complexity_signals.f_string_usage:
            insights.append("Best Practice: Utilizing modern interpolation techniques (like f-strings) is exceptionally efficient. It calculates and builds the full string natively in C in one pass, avoiding the creation of slow intermediate memory copies.")
        
        if sig.complexity_signals.aggregation_in_loop:
            insights.append("Bottleneck Risk: Placing aggregation functions like `sum()`, `max()`, or `min()` directly inside a loop causes Python to secretly scan the entire sub-array over and over. Maintaining a running total variable instead will drastically improve speed.")
        
        if sig.complexity_signals.inefficient_list_pop:
            insights.append("Data Structure Risk: Triggering a removal at the very start of a standard Python list is structurally slow. Because elements are packed tightly, Python must manually drag every remaining item one slot to the left. If you need a queue, `collections.deque` provides instant $O(1)$ pops.")
        if sig.complexity_signals.inefficient_list_insert:
            insights.append("Data Structure Risk: Mechanically inserting an item at the exact start of a populated list forces Python to push all existing elements backward to make room. This is a heavy $O(n)$ operation that stalls large arrays.")
        if sig.complexity_signals.repeated_sort:
            insights.append("Bottleneck Risk: Sorting is fundamentally heavy ($O(n \\log n)$). Placing a sorting mechanism directly inside a loop forces the CPU to repeat that intense mathematical lifting unnecessarily. Gather the data first, then sort exactly once outside the loop.")
        if sig.complexity_signals.set_mathematical_ops:
            insights.append("Best Practice: Native Set operations (like unions or intersections) are implemented at the lowest hardware levels in Python. Utilizing them is exponentially faster and cleaner than writing manual nested loops to check for duplication.")
        if sig.complexity_signals.dict_lookup_constant:
            insights.append("Best Practice: Leveraging specific dictionary getter methods or native hashed lookups yields an instant $O(1)$ data retrieval, bypassing the need to search linearly.")
        if sig.has_early_exits or sig.has_continue:
            insights.append("Optimization: Interacting with the loop flow (`break`, `continue`, or `return`) here acts as an excellent functional optimization. It grants the algorithm permission to completely bypass useless iterations the exact moment the logic resolves.")

        # New Text / Syntax recognition insights
        if sig.uses_try_except:
            if sig.complexity_signals.exception_control_flow:
                insights.append("Performance Trap: While `try/except` blocks are powerful, relying on exceptions for standard control flow *inside* a heavy loop is surprisingly slow. Generating a traceback object in Python carries a tangible processing penalty.")
            else:
                insights.append("Robust Engineering: Utilizing a `try/except` block ensures that unpredictable runtime anomalies are gracefully caught, preventing hard application crashes during execution.")
        if sig.uses_context_manager:
            insights.append("Resource Safety: The `with` statement elegantly guarantees that external connections (like files or database locks) are automatically and securely closed the moment execution leaves the block, even if an error violently halts the program.")

        return insights

    def _gather_space_insights(self, sig: PatternSignals, mem_state: dict) -> List[str]:
        insights = []
        
        if sig.paradigms.is_tabulation_setup or sig.memory_signals.array_preallocation:
            insights.append("Memory Optimization: Pre-allocating an array directly with a specific size (e.g., `[val] * n`) is a highly optimized way to reserve memory. It forces the system to grab exactly what it needs upfront, avoiding the constant reallocation penalties of `.append()`.")
        if sig.memory_signals.inplace_swap:
            insights.append("Memory Optimization: This operation modifies the data pointers strictly in-place. Because it doesn't require instantiating a completely new array, it is incredibly friendly to the computer's memory management system.")
            
        if sig.memory_signals.allocates_2d_lists:
            insights.append("Memory Footprint: Creating nested arrays, such as a grid or a matrix, commands a significantly denser memory reservation from the Operating System than generating a standard flat list.")
        elif sig.memory_signals.allocates_lists or sig.memory_signals.uses_list_comprehension:
            insights.append("Memory Footprint: When instantiating a new list or array, the computer actively searches for and reserves a fresh, contiguous block of RAM to permanently house the incoming data elements.")
            
        if sig.memory_signals.allocates_sets or sig.memory_signals.uses_set_comprehension:
            insights.append("Trade-off: Sets are astonishingly fast for lookups, but they achieve this by generating an invisible 'hash table'. This table intentionally leaves blank memory gaps to prevent data collisions, meaning a Set occupies substantially more raw RAM than a List of the exact same length.")
        if sig.memory_signals.performs_slicing:
            insights.append("Common Trap: Explicit array slicing physically cuts out and copies the targeted data, creating a complete duplicate array in memory. Executing slices inside recursive calls or loops will rapidly exhaust memory.")
        if sig.memory_signals.recursive_stack_risk:
            insights.append("System Risk: Every time a recursive function calls itself, Python saves a 'frame' of the current variable state directly to the call stack. If the sequence plunges thousands of levels deep, Python will intentionally crash with a `RecursionError` to protect system RAM.")

        if sig.uses_yield:
            insights.append("Memory Mastery: The `yield` generator paradigm is the pinnacle of space optimization. Instead of allocating massive chunks of RAM to hold an entire array of results, `yield` pauses execution and emits exactly one element at a time, sustaining an astonishing $O(1)$ memory footprint regardless of dataset size.")

        if mem_state:
            largest = max(mem_state.items(), key=lambda x: x[1]['size'], default=None)
            if largest and largest[1]['size'] > 1:
                insights.append(f"Runtime Diagnostic: The internal profiler directly observed that during live execution, the tracked variable `{largest[0]}` aggressively expanded to hold {largest[1]['size']} active elements in memory.")

        return insights

    # =========================================================================
    # OVERALL COMPLEXITY ANALYSIS GENERATOR
    # =========================================================================
    
    def generate_overall_analysis(self, final_time: str, final_space: str, sig: PatternSignals) -> str:
        """
        Synthesizes the complete final time and space complexity evaluations into
        a narrative, educational breakdown, accompanied by asymptotic simplifications.
        """
        t_info = self._classify_big_o(final_time)
        s_info = self._classify_big_o(final_space)
        
        # Build narrative pieces
        time_narrative = self._build_overall_time_narrative(t_info, sig)
        time_simp = self._build_time_simplification(t_info)
        
        space_narrative = self._build_overall_space_narrative(s_info, sig)
        space_simp = self._build_space_simplification(s_info)
        
        summary = self._build_complexity_summary(t_info, s_info, sig)
        
        final_md = (
            "### Overall Complexity Analysis\n\n"
            "#### Overall Time Complexity Analysis\n"
            f"{time_narrative}\n\n"
            "**Asymptotic Simplification**\n"
            "Suppose the runtime expression produced from analysis is:\n\n"
            f"{time_simp}\n\n"
            "#### Overall Space Complexity Analysis\n"
            f"{space_narrative}\n\n"
            "**Asymptotic Simplification**\n"
            "Suppose the algorithm creates the following memory allocations:\n\n"
            f"{space_simp}\n\n"
            "#### Complexity Summary\n"
            f"{summary}"
        )
        return final_md

    def _build_overall_time_narrative(self, t_info: BigOInfo, sig: PatternSignals) -> str:
        family = t_info.family
        narrative = []
        
        # 1. Dominant Operations & Bottleneck Analysis
        if family == "logarithmic" or sig.paradigms.is_halving:
            narrative.append(f"The overall runtime of this algorithm is {t_info.raw}. The primary reason is that the algorithm never examines every element individually. During its core execution phase, the search boundary is aggressively halved on each iteration, allowing the engine to rapidly zero in on the target region.")
            narrative.append("The most expensive operations are these logarithmic reduction steps. While the function contains several assignments, conditional comparisons, and return statements, those execute in pure constant time and contribute very little to the overall runtime. Because Big-O analysis strictly focuses on the fastest-growing dominant term, these scalar operations do not alter the final complexity.")
        elif family == "polynomial" and sig.nested_loops:
            narrative.append(f"The overall runtime evaluates to a heavy {t_info.raw}. The primary bottleneck here is the nested loop structure. Because the inner loop fires completely for every single pass of the outer loop, the workload multiplies quadratically.")
            narrative.append("While there are minor variable assignments happening outside or inside these loops, the massive repetition caused by the nested loops completely eclipses them. The dominant computational activity is entirely dictated by the deepest loop level.")
        elif family == "linearithmic" or sig.complexity_signals.repeated_sort:
            narrative.append(f"The overall execution speed settles at {t_info.raw}. The algorithm's performance is strictly anchored by heavy structural reorganizations—most notably, sorting operations or 'Divide and Conquer' recursion trees.")
            narrative.append("Operations like linear scans or direct assignments may exist alongside it, but the logarithmic branching attached to a linear sweep naturally dominates the execution cost, creating the primary bottleneck.")
        elif family in ["exponential", "super_exponential", "recursive_branching"] and sig.has_recursion:
            narrative.append(f"The runtime of this algorithm experiences explosive combinatorial growth, landing at a severe {t_info.raw}. The execution time is overwhelmingly dominated by the recursive branching pattern.")
            narrative.append("Because each function call blindly spawns multiple subsequent calls without safely caching prior results, it forces a massive cascade of redundant mathematical operations. This branching behavior completely defines the performance ceiling.")
        elif family == "linear" or sig.loop_depth == 1:
            narrative.append(f"The overall runtime of this algorithm scales exactly proportionally to the input, resulting in {t_info.raw}. The performance ceiling is explicitly governed by the primary loop that must touch every single element at least once.")
            narrative.append("The primary bottleneck is this sequential traversal. All associated flat assignments or boolean checks execute in constant time, meaning the dominant activity dictating the algorithmic limit is the loop's required linear sweep.")
        else:
            narrative.append(f"The total runtime complexity evaluates to a pristine {t_info.raw}. The engine successfully manages the data without invoking any dynamically scaling loops or exhaustive iteration structures.")
            narrative.append("Every calculation, variable assignment, and lookup resolves directly in constant time. Because there are no iterative bottlenecks dragging performance down, the algorithm functions at optimal execution speeds.")

        # 2. Efficiency & Scalability
        if family == "constant":
            narrative.append("From an efficiency perspective, the algorithm behaves perfectly. Because it completely ignores the size of the incoming dataset, it will process ten elements exactly as fast as it processes ten million elements, offering flawless scalability.")
        elif family == "logarithmic":
            narrative.append("From an efficiency perspective, the algorithm exhibits phenomenal scalability. As the dataset doubles in size, the algorithm requires merely one additional processing step. By strategically discarding large portions of the problem space, it safely sustains high speeds even under massive data loads.")
        elif family == "linear":
            narrative.append("As the input size grows, the required processing time increases at a stable, predictable 1:1 ratio. While it is highly efficient and avoids redundant comparisons, its performance is fundamentally tethered to the sheer volume of elements it must inspect.")
        elif family == "linearithmic":
            narrative.append("The algorithm handles scaling moderately well. While heavier than a standard linear pass, it gracefully avoids catastrophic quadratic collapse, allowing it to securely organize and process massive datasets efficiently.")
        else:
            narrative.append("Unfortunately, as the dataset expands, the required processing power violently spikes. This algorithmic behavior struggles to scale safely, meaning that while it solves small inputs easily, larger datasets will quickly force the system to stall or freeze entirely.")

        return "\n\n".join(narrative)

    def _build_time_simplification(self, t_info: BigOInfo) -> str:
        family = t_info.family
        if family == "constant":
            return "T(n) = 3\n\nBig-O removes constants:\n`T(n) = O(1)`"
        elif family == "logarithmic":
            return "T(n) = 3 + 2\\log n\n\nRemove constant term:\nT(n) = 2\\log n\n\nDrop constant multiplier:\n`T(n) = O(\\log n)`"
        elif family == "linear":
            return "T(n) = 3n + 5\n\nRemove constant term:\nT(n) = 3n\n\nDrop constant multiplier:\n`T(n) = O(n)`"
        elif family == "linearithmic":
            return "T(n) = 4n \\log n + 2n + 5\n\nRemove lower-order terms (2n + 5):\nT(n) = 4n \\log n\n\nDrop constant multiplier:\n`T(n) = O(n \\log n)`"
        elif family == "polynomial":
            return "T(n) = 2n² + 7n + 1\n\nRemove lower-order terms (7n + 1):\nT(n) = 2n²\n\nDrop constant multiplier:\n`T(n) = O(n²)`"
        elif family == "exponential":
            return "T(n) = 2^n + n²\n\nRemove lower-order terms (n²):\nT(n) = 2^n\n\nFinal:\n`T(n) = O(2^n)`"
        elif family == "factorial":
            return "T(n) = n! + 2^n\n\nRemove lower-order exponential terms:\nT(n) = n!\n\nFinal:\n`T(n) = O(n!)`"
        else:
            return f"T(n) = O({t_info.raw})\n\nFinal:\n`T(n) = O({t_info.raw})`"

    def _build_overall_space_narrative(self, s_info: BigOInfo, sig: PatternSignals) -> str:
        family = s_info.family
        narrative = []
        
        # 1. Memory Consumption & Bottlenecks
        if family == "constant":
            narrative.append(f"The overall memory consumption of the algorithm is highly optimized at {s_info.raw}. It only stores a fixed number of scalar variables throughout its entire execution lifecycle.")
            narrative.append("No additional arrays, large dictionaries, or dynamically growing structures are created. It safely reuses existing reference pointers and operates exactly within its initial bounds, guaranteeing that there is no memory bottleneck.")
        elif family == "linear":
            if sig.has_recursion:
                narrative.append(f"The algorithm hits an overall spatial footprint of {s_info.raw}. The primary memory bottleneck is heavily dictated by the recursive call stack. Every time the function calls itself, Python is strictly forced to preserve a suspended 'frame' of the variables in RAM.")
            else:
                narrative.append(f"The algorithm scales its memory usage directly proportional to the input size, landing at {s_info.raw}. The primary spatial bottleneck is the explicit allocation of new data structures—such as lists, dictionaries, or dynamic string arrays.")
            narrative.append("While basic pointer variables exist, they are functionally negligible. The dominant spatial factor is strictly the collection mapping required to hold the newly generated data payload.")
        elif family == "polynomial":
            narrative.append(f"The overall spatial requirement forcefully balloons to a dense {s_info.raw}. The core memory bottleneck here is the instantiation of multi-dimensional arrays, dense matrices, or 2D tabulation grids.")
            narrative.append("Because the data footprint is growing by a power of the input, the algorithm requests massive, contiguous blocks of RAM from the operating system, completely overshadowing any standard 1D list allocations.")
        else:
            narrative.append(f"The overall spatial limit is strictly evaluated at {s_info.raw}. Memory is aggressively claimed to support the algorithm's active operational state.")

        # 2. Space Efficiency & Scalability
        if family == "constant":
            narrative.append("Because the algorithm aggressively avoids cloning the input data, the footprint remains immaculately stable. Whether processing a dozen items or ten million, the auxiliary memory used remains virtually unchanged.")
        elif family == "linear":
            narrative.append("The memory consumption scales predictably. If the input data doubles, the required background memory doubles alongside it. While generally safe on modern systems, extremely large datasets could eventually trigger out-of-memory errors.")
        elif family == "polynomial":
            narrative.append("This spatial behavior is notoriously dangerous to scale. A simple doubling of the input size will violently quadruple the required RAM, meaning this algorithm will rapidly exhaust the computer's available memory limits on larger datasets.")
        else:
            narrative.append("The spatial logic deployed here creates an extremely heavy footprint, severely limiting its capability to handle larger system inputs without crashing.")

        return "\n\n".join(narrative)

    def _build_space_simplification(self, s_info: BigOInfo) -> str:
        family = s_info.family
        if family == "constant":
            return "S(n) = 5\n\nBig-O removes constants:\n`S(n) = O(1)`"
        elif family == "linear":
            return "S(n) = n + 4\n\nRemove constant term:\nS(n) = n\n\nFinal:\n`S(n) = O(n)`"
        elif family == "polynomial":
            return "S(n) = n² + n + 10\n\nRemove lower-order terms (n + 10):\nS(n) = n²\n\nFinal:\n`S(n) = O(n²)`"
        elif family == "logarithmic":
            return "S(n) = \\log n + 2\n\nRemove constant:\nS(n) = \\log n\n\nFinal:\n`S(n) = O(\\log n)`"
        else:
            return f"S(n) = O({s_info.raw})\n\nFinal:\n`S(n) = O({s_info.raw})`"

    def _build_complexity_summary(self, t_info: BigOInfo, s_info: BigOInfo, sig: PatternSignals) -> str:
        summary = ""
        
        # Determine scalability judgment
        if t_info.family in ["constant", "logarithmic", "linear"] and s_info.family in ["constant", "logarithmic", "linear"]:
            summary = "This algorithm achieves an excellent level of overall scalability. "
        elif t_info.family in ["polynomial", "exponential", "factorial"] or s_info.family in ["polynomial", "exponential"]:
            summary = "This algorithm faces severe limitations regarding large-scale operations. "
        else:
            summary = "This algorithm is functionally sound but requires careful attention to dataset constraints. "

        # Summarize factors
        summary += f"The final dominant factor influencing performance is the algorithmic structure driving its `{t_info.raw}` processing time, "
        
        if s_info.family == "constant":
            summary += f"while the dominant factor influencing memory is its highly optimized absence of expanding data structures, anchoring space at `{s_info.raw}`. "
        else:
            summary += f"alongside a spatial expansion constraint that drives its memory footprint directly to `{s_info.raw}`. "

        summary += f"Consequently, the final definitive asymptotic complexities are **{t_info.raw} Time** and **{s_info.raw} Space**."
        
        return summary

    # =========================================================================
    # CORE GENERATOR METHOD (Line by line)
    # =========================================================================
    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, hits=0, mem_state=None):
        """Builds the distinct Local Context, Global Impact, and Educational Insights."""
        if is_dead and hits == 0:
            t_desc = (
                f"**Local & Global Analysis:**\nThe targeted sequence `{code_snippet}` is classified strictly as Dead Code. Because the fundamental logic "
                f"mechanically forbids execution flow from ever traversing inside this block, it contributes absolute zero processing overhead, "
                f"resolving its impact to an immaculate $O(1)$ runtime penalty."
            )
            s_desc = (
                "**Local & Global Analysis:**\nDue to the structural impossibility of triggering this block, the engine never requests memory allocations "
                "for it. The spatial footprint remains completely unblemished at $O(1)$."
            )
            return t_desc, s_desc

        visitor = ComprehensiveASTVisitor(self.ctx)
        sig = visitor.analyze(node)

        # Classify the strings into structured data
        g_time_info = self._classify_big_o(str(global_t))
        l_time_info = self._classify_big_o(str(local_t))
        g_space_info = self._classify_big_o(str(global_s))
        l_space_info = self._classify_big_o(str(local_s))

        # --- ASSEMBLE TIME EXPLANATION ---
        time_intro = self._build_action_intro(node, code_snippet, sig)
        time_local = self._build_local_time_explanation(l_time_info, sig)
        time_global = self._build_global_time_explanation(l_time_info, g_time_info, sig)
        
        time_insights = self._gather_time_insights(sig, str(local_t))
        time_insight_text = "\n\n**Educational Insight:**\n" + "\n\n".join(time_insights) if time_insights else ""
        time_hits = f"\n\n*Profiler verified this line executed {hits} times during the last run.*" if hits > 0 else ""

        full_time_desc = (
            f"{time_intro}\n\n"
            f"**Local Analysis:**\n{time_local}\n\n"
            f"**Global Impact:**\n{time_global}"
            f"{time_insight_text}"
            f"{time_hits}"
        )

        # --- ASSEMBLE SPACE EXPLANATION ---
        space_local = self._build_local_space_explanation(l_space_info, sig)
        space_global = self._build_global_space_explanation(l_space_info, g_space_info, sig)
        
        space_insights = self._gather_space_insights(sig, mem_state)
        space_insight_text = "\n\n**Educational Insight:**\n" + "\n\n".join(space_insights) if space_insights else ""

        full_space_desc = (
            f"**Local Analysis:**\n{space_local}\n\n"
            f"**Global Impact:**\n{space_global}"
            f"{space_insight_text}"
        )

        return full_time_desc, full_space_desc

    # =========================================================================
    # BOTTLENECK & PRAISE GENERATORS
    # =========================================================================
    def get_time_bottleneck_warning(self, operation: str, final_time: str) -> str:
        op_lower = operation.lower()
        
        if "loop" in op_lower:
            return f"\n\n**Bottleneck Warning:** The primary reason this algorithm evaluates to {final_time} is the massive volume of repetitions mathematically forced by this {op_lower}. It acts as the anchor dragging performance down."
        elif "recur" in op_lower or "call" in op_lower:
            return f"\n\n**Bottleneck Warning:** Because this {op_lower} aggressively creates overlapping sub-problems without remembering past answers, it forces a massive cascade of redundant mathematical operations causing a severe {final_time} delay."
        elif "comprehension" in op_lower:
            return f"\n\n**Bottleneck Warning:** Do not be computationally fooled by its one-line elegance. Physically expanding this {op_lower} requires intense, hidden iteration under the hood, heavily defining the {final_time} runtime performance ceiling."
        elif "sort" in op_lower:
            return f"\n\n**Bottleneck Warning:** Sorting arrays is a fundamentally heavy mathematical task. Relying on this {op_lower} acts as a massive execution barrier, strictly preventing the algorithm from running any faster than {final_time}."
        else:
            return f"\n\n**Bottleneck Warning:** The most computationally intensive work happens entirely within this {op_lower}, ruthlessly dictating the final systemic {final_time} time complexity."

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()
        
        if "recur" in op_lower or "call" in op_lower:
            return f"\n\n**Space Bottleneck:** Every single functional jump deep inside this {op_lower} mandates a completely new required block of memory on the call stack, violently driving the peak system memory directly up to {final_space}."
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower or "expansion" in op_lower:
            return f"\n\n**Space Bottleneck:** Rather than intelligently shuffling data lightly in-place, this {op_lower} forcefully clones memory structures entirely, absolutely ensuring the systemic memory requirements escalate to {final_space}."
        elif "slice" in op_lower or "string" in op_lower or "concat" in op_lower:
            return f"\n\n**Space Bottleneck:** Because array slicing and string building forcefully creates duplicate memory clones rather than relying on simple reference pointers, this {op_lower} heavily balloons the peak spatial limits to {final_space}."
        else:
            return f"\n\n**Space Bottleneck:** The sheer volume of newly generated intermediate data that must strictly be held actively in RAM because of this {op_lower} brutally causes the overall capacity to reach {final_space}."

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()
        
        if "log" in time_lower:
            return f"\n\n**Algorithmic Mastery:** Systematically halving the problem space is a truly brilliant mathematical optimization. By proactively discarding half the unneeded data at every step, this deeply refined {operation.lower()} absolutely boasts hyper-scalable {global_time} pristine execution speeds."
        elif "√" in time_lower or "sqrt" in time_lower:
            return f"\n\n**Algorithmic Mastery:** Phenomenal logical optimization. By recognizing that you legitimately only need to verify factors up to the numeric square root, this {operation.lower()} intelligently bypasses staggering amounts of useless cyclic iterations, cleanly locking in a fast {global_time} boundary."
        elif "1" in time_lower:
            return f"\n\n**Algorithmic Mastery:** Pristine operational execution. By intelligently grabbing target values absolutely instantly through hashed memory keys or explicitly direct index pointers, this refined {operation.lower()} completely avoids redundant sequential scanning, elegantly executing at a mathematically perfect {global_time} rating."
        else:
            return f"\n\n**Algorithmic Mastery:** The internal processing logic embedded deeply inside this {operation.lower()} is exceptionally well-structured. By cleanly sidestepping bloated redundant execution cycles, it successfully maintains a highly optimal {global_time} processing speed."

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation