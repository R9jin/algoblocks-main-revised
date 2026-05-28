# analyzer.py
import ast
import time
from collections import deque, Counter
from semantic_nlg import SemanticNLGEngine

try:
    from dynamic_tracer import AlgoBlocksTracer
except ImportError:
    AlgoBlocksTracer = None

class ComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self, source_code, trace_data=None):
        self.source_lines = source_code.splitlines()
        self.trace_data = trace_data or {"history": [], "line_hits": {}}
        self._details = []                
        self._bottlenecks_applied = False
        
        self.current_depth = 0           
        self.loop_depth = 0
        self.log_loop_depth = 0          
        self.sqrt_loop_depth = 0
        self.graph_depth = 0             
        self.in_if_depth = 0
        self.loop_stack = []
        self.in_list_comp_depth = 0
        
        self.var_dimensions = {} 
        self.active_poly_dims = [] 
        self.var_types = {} 
        
        self.max_complexity = 0          
        self.max_poly_str = "O(1)"
        self.max_log = 0                 
        self.max_sqrt = 0                
        self.max_exp = 0
        self.max_graph_ve = 0                 
        self.max_space_weight = 0        
        
        self.variable_complexities = {}  
        self.custom_functions = {}       
        self.custom_space = {}           
        self.current_function_name = None
        self.recursive_calls_count = 0   
        self.symbol_table = {}           
        self.reachable_funcs = set()     
        self.memoized_funcs = set() 
        self.indirect_recursive_funcs = set() 
        
        self.in_dead_code = False
        self.in_graph_context = False        
        self.has_recursion_in_loop = False  
        self.has_slicing = False            
        self.has_partitioning = False
        self.has_division = False           
        self.in_accumulation_context = False
        self.has_global_accumulation = False

        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.logic_hints = {} 

        self.builtin_complexities = {
            'sort': {'time': 'O(n log n)', 'space': 'O(1)', 'desc': 'uses the in-place Timsort algorithm'},
            'sorted': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'creates a completely new sorted list'},
            'join': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'concatenates collection into a string'},
            'split': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'scans string to allocate new substrings'},
            'list': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'copies elements into a new list'},
            'set': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'builds a new hash set'},
            'dict': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'builds a new dictionary'},
            'tuple': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'copies elements into a new tuple'},
            'append': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time sequence append'},
            'insert': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'shifts array elements'},
            'max': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan for largest value'},
            'min': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan for smallest value'},
            'sum': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan to accumulate total'},
            'any': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan to check for truthy'},
            'all': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan to check for falsy'},
            'len': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'accesses a pre-stored attribute'},
            'abs': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time mathematical absolute value'},
            'round': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time rounding'},
            'int': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time type cast'},
            'float': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time type cast'},
            'bool': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time type cast'},
            'type': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time type inspection'},
            'isinstance': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'constant-time type validation'},
            'str': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'allocates new string representation'},
            'remove': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'scans and shifts elements'},
            'index': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear search for index'},
            'count': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear scan to count occurrences'},
            'find': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'linear string search'},
            'replace': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'traverses string and allocates replacements'},
            'copy': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'shallow copy allocating new memory'},
            'reverse': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'reverses collection in-place'},
            'extend': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'iterates to append to existing list'},
            'upper': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'constructs uppercase copy'},
            'lower': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'constructs lowercase copy'},
            'keys': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'lightweight dict view'},
            'values': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'lightweight dict view'},
            'items': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'lightweight dict view'},
            'range': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'returns range object'},
            'clear': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'clears collection'},
            'get': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'retrieves dictionary value by key'},
            'popleft': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'removes from left of a deque'},
            'union': {'time': 'O(n + m)', 'space': 'O(n + m)', 'desc': 'creates new set from both sets'},
            'intersection': {'time': 'O(min(n, m))', 'space': 'O(min(n, m))', 'desc': 'creates new set with common elements'},
            'difference': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'creates new set with difference'},
            'update': {'time': 'O(m)', 'space': 'O(m)', 'desc': 'updates collection with elements'},
            'add': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'adds element to hash set'},
        }
        self.aliases = {}
        self.nlg_engine = SemanticNLGEngine(self)

    @property
    def details(self):
        if not getattr(self, '_bottlenecks_applied', False) and len(self._details) > 0:
            self._apply_bottlenecks()
            self._bottlenecks_applied = True
        return self._details

    @details.setter
    def details(self, value):
        self._details = value
        self._bottlenecks_applied = False

    def _apply_bottlenecks(self):
        final_time = self.get_final_asymptotic_badge()
        final_space = self.get_final_space_badge()
        max_w = max([d.get('weight', -1) for d in self._details], default=-1)
        
        excluded_complexities = ["O(1)", "O(log n)", "O(√n)", "O(n)", "-", ""]
        praise_complexities = ["O(log n)", "O(√n)"]
        
        for d in self._details:
            if d.get('weight', -1) == max_w and max_w > 0 and final_time not in excluded_complexities:
                warning = self.nlg_engine.get_time_bottleneck_warning(d.get('operation', ''), final_time)
                if warning not in d.get('time_explanation', ''):
                    d['time_explanation'] = str(d.get('time_explanation', '')) + warning
                
            if d.get('global_space', '') == final_space and final_space not in excluded_complexities:
                warning = self.nlg_engine.get_space_bottleneck_warning(d.get('operation', ''), final_space)
                if warning not in d.get('space_explanation', ''):
                    d['space_explanation'] = str(d.get('space_explanation', '')) + warning

            if d.get('global_time', '') in praise_complexities:
                praise = self.nlg_engine.get_time_optimization_praise(d.get('operation', ''), d.get('global_time', ''))
                if "ALGORITHM MASTERY:" not in d.get('time_explanation', ''):
                    d['time_explanation'] = str(d.get('time_explanation', '')) + praise

    def _is_linear_type(self, expr_node):
        if isinstance(expr_node, (ast.List, ast.Tuple, ast.Set, ast.Dict, ast.ListComp, ast.SetComp, ast.DictComp)):
            return True
        if isinstance(expr_node, ast.Name):
            t = self.var_types.get(expr_node.id, '')
            if t in ['list', 'set', 'dict', 'tuple', 'str', 'deque']: return True
            if any(k in expr_node.id.lower() for k in ['arr', 'list', 'dict', 'set', 'str', 'queue', 'stack', 'graph', 'matrix', 'items', 'nums']): 
                return True
        return False

    def _is_linear_var(self, var_name):
        t = self.var_types.get(var_name, '')
        if t in ['list', 'set', 'dict', 'tuple', 'str', 'deque']: return True
        if any(k in var_name.lower() for k in ['arr', 'list', 'dict', 'set', 'str', 'queue', 'stack', 'graph', 'matrix', 'items', 'nums']): 
            return True
        return False

    def _get_iterable_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'range':
            args_len = len(node.args)
            if args_len == 1: arg = node.args[0]
            elif args_len >= 2: arg = node.args[1]
            else: return None
            if isinstance(arg, ast.Name): return arg.id
            if isinstance(arg, ast.BinOp):
                if isinstance(arg.left, ast.Name): return arg.left.id
                if isinstance(arg.right, ast.Name): return arg.right.id
            if isinstance(arg, ast.Call) and getattr(arg.func, 'id', '') == 'len' and len(arg.args) > 0 and isinstance(arg.args[0], ast.Name):
                return arg.args[0].id
        return None

    def _register_and_get_dim(self, var_name):
        if not var_name: return 'n'
        if isinstance(var_name, str):
            lower_name = var_name.lower()
            if lower_name in ['n1', 'n2', 'n3', 'length', 'size', 'count']: return 'n'
            if lower_name in ['m1', 'm2', 'm3']: return 'm'
            if lower_name in ['n', 'm', 'k', 'p', 'q']: return lower_name
            if any(kw in lower_name for kw in ['len', 'size', 'count']): return 'n'
            
        if var_name not in self.var_dimensions:
            available = [d for d in ['n', 'm', 'k', 'p', 'q'] if d not in self.var_dimensions.values() and d != var_name]
            self.var_dimensions[var_name] = available[0] if available else 'n'
        return self.var_dimensions[var_name]

    def _get_while_limit_vars(self, node):
        updated_vars = set()
        for child in node.body:
            for sub in ast.walk(child):
                if isinstance(sub, ast.Assign):
                    for target in sub.targets:
                        if isinstance(target, ast.Name): updated_vars.add(target.id)
                elif isinstance(sub, ast.AugAssign):
                    if isinstance(sub.target, ast.Name): updated_vars.add(sub.target.id)

        limit_vars = []
        ignore_set = {'len', 'range', 'min', 'max', 'True', 'False', 'None'}
        for child in ast.walk(node.test):
            if isinstance(child, ast.Name) and child.id not in updated_vars and child.id not in ignore_set:
                if child.id not in limit_vars:
                    limit_vars.append(child.id)
                
        return limit_vars

    def _build_time_str(self, poly_dims, log, sqrt=0, exp=0, graph=0):
        if exp > 0: return "O(2^n)"  
        if graph > 0: return "O(V + E)"
        if not poly_dims and log <= 0 and sqrt <= 0: return "O(1)"  
        
        parts = []
        if poly_dims:
            counts = Counter(poly_dims)
            terms = []
            for dim, count in counts.items():
                if count == 1: terms.append(dim)
                else: terms.append(f"{dim}^{count}")
            parts.append(" * ".join(terms))
                
        if sqrt == 1: parts.append("√n")
        elif sqrt > 1: parts.append(f"(√n)^{sqrt}")  
        if log == 1: parts.append("log n")
        elif log > 1: parts.append(f"log^{log} n")  
        
        res = f"O({' * '.join(parts)})" if parts else "O(1)"
        res = res.replace(" * log", " log").replace(" * √", " √")
        return res

    def _get_weight(self, poly_dims, log, sqrt, exp, graph):
        w = 0
        if exp > 0: w += 100
        w += graph * 12
        w += len(poly_dims) * 10
        w += sqrt * 7
        w += log * 5
        return w

    def bfs_first_pass(self, tree):
        queue = deque([(tree, None)])
        self.call_graph = {'__main__': set()}
        self.reachable_funcs = set()
        
        while queue:
            current_node, current_func = queue.popleft()  
            if isinstance(current_node, ast.FunctionDef):
                self.symbol_table[current_node.name] = current_node  
                self.reachable_funcs.add(current_node.name) 
                current_func = current_node.name  
                if current_func not in self.call_graph:
                    self.call_graph[current_func] = set()  
            elif isinstance(current_node, ast.Call) and isinstance(current_node.func, ast.Name):
                called_func = current_node.func.id  
                if current_func: self.call_graph[current_func].add(called_func)  
                else: self.call_graph['__main__'].add(called_func)  
            
            for child in ast.iter_child_nodes(current_node):
                queue.append((child, current_func))
        
        reach_queue = deque(['__main__'])  
        reach_queue.extend(list(self.reachable_funcs)) 
        visited = set(['__main__']).union(self.reachable_funcs)
        
        while reach_queue:
            curr = reach_queue.popleft()
            for neighbor in self.call_graph.get(curr, []):  
                if neighbor not in visited:
                    visited.add(neighbor)
                    self.reachable_funcs.add(neighbor)  
                    reach_queue.append(neighbor)
        
        for func_name, called_funcs in self.call_graph.items():
            if func_name in called_funcs: self.custom_functions[func_name] = "T(n)"  
        self.detect_indirect_recursion()

    def detect_indirect_recursion(self):
        indirect_graph = {u: {v for v in neighbors if v != u} for u, neighbors in self.call_graph.items()}
        for func in indirect_graph:
            visited, rec_stack = set(), set()
            if self._has_cycle(func, visited, rec_stack, indirect_graph):
                self.custom_functions[func] = "O(2^n)"
                self.indirect_recursive_funcs.add(func)

    def _has_cycle(self, node, visited, rec_stack, graph):
        if node in rec_stack: return True
        if node in visited: return False
        visited.add(node); rec_stack.add(node)
        for neighbor in graph.get(node, []):
            if self._has_cycle(neighbor, visited, rec_stack, graph): return True
        rec_stack.remove(node); return False

    def get_code_snippet(self, node):
        if hasattr(node, 'lineno'): return self.source_lines[node.lineno - 1].strip()  
        return "Code Block"  

    def get_color(self, complexity_str):
        if complexity_str == "-" or "Dead Code" in complexity_str: return "#7f8c8d"  
        if "T(" in complexity_str or "!" in complexity_str: return "#8e44ad"  
        if "^n" in complexity_str or "C(" in complexity_str: return "#9b59b6"  
        if "^2" in complexity_str or "^3" in complexity_str or "*" in complexity_str: return "#e74c3c"  
        if "V + E" in complexity_str or "V" in complexity_str: return "#d35400"
        if "log" in complexity_str: return "#2980b9"  
        if "√" in complexity_str: return "#16a085"  
        if complexity_str != "O(1)": return "#e67e22"  
        return "#27ae60"

    def _detect_graph_context(self, node):
        has_queue_while = has_neighbor_for = has_recursive_for = has_visited_set = False
        rec_calls = 0
        has_grid_checks = False
        
        if isinstance(node, ast.FunctionDef):
            for child in ast.walk(node):
                if isinstance(child, ast.While):
                    for sub in ast.walk(child):
                        if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute):
                            if sub.func.attr in ['pop', 'popleft']: has_queue_while = True
                if isinstance(child, ast.For):
                    if isinstance(child.iter, ast.Subscript): has_neighbor_for = True
                    if isinstance(child.iter, ast.Name) and any(kw in child.iter.id.lower() for kw in ['neighbor', 'adj', 'graph', 'child']): has_neighbor_for = True
                    for sub in ast.walk(child):
                        if isinstance(sub, ast.Call) and getattr(sub.func, 'id', '') == node.name: has_recursive_for = True
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Attribute):
                        if child.func.attr in ['add', 'append'] and isinstance(getattr(child.func, 'value', None), ast.Name) and 'visit' in child.func.value.id.lower(): has_visited_set = True
                    if isinstance(child.func, ast.Name) and child.func.id == node.name:
                        rec_calls += 1
                if isinstance(child, ast.Compare) and any(isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for op in child.ops):
                    if any(getattr(n, 'id', '') in ['r', 'c', 'row', 'col'] for n in ast.walk(child)):
                        has_grid_checks = True

        name_hints = any(k in getattr(node, 'name', '').lower() for k in ['maze', 'graph', 'dfs', 'bfs'])
        return (has_queue_while and (has_neighbor_for or has_visited_set)) or \
               (has_recursive_for and (has_neighbor_for or has_visited_set)) or \
               (rec_calls >= 2 and (has_visited_set or has_grid_checks)) or name_hints

    def _is_graph_while_loop(self, node):
        if not getattr(self, 'in_graph_context', False): return False
        if not isinstance(node, ast.While): return False
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ['pop', 'popleft', 'append', 'add', 'remove', 'extend']: return True
        return False

    def _is_constant_loop(self, node):
        if isinstance(node, ast.While):
            if isinstance(node.test, ast.Constant): return True
            if isinstance(node.test, ast.Compare):
                if isinstance(node.test.left, ast.Constant) and all(isinstance(c, ast.Constant) for c in node.test.comparators): return True
        elif isinstance(node, ast.For):
            if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                if all(isinstance(arg, ast.Constant) for arg in node.iter.args): return True
            elif isinstance(node.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant)): return True
        return False

    def _is_log_loop(self, node):
        if not isinstance(node, ast.While): return False
        cond_vars = set()
        for child in ast.walk(node.test):
            if isinstance(child, ast.Name): cond_vars.add(child.id)
                
        for child in node.body:
            for sub in ast.walk(child):
                if isinstance(sub, ast.AugAssign):
                    if isinstance(sub.target, ast.Name) and sub.target.id in cond_vars:
                        if isinstance(sub.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)) and getattr(sub.value, 'value', 0) > 1: return True
                        if isinstance(sub.op, (ast.LShift, ast.RShift)): return True
                        if isinstance(sub.op, ast.Mod): return True
                elif isinstance(sub, ast.Assign):
                    for target in sub.targets:
                        if isinstance(target, ast.Name) and target.id in cond_vars:
                            if isinstance(sub.value, ast.BinOp):
                                if isinstance(sub.value.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)):
                                    if getattr(sub.value.left, 'id', None) == target.id and getattr(sub.value.right, 'value', 0) > 1: return True
                                    if getattr(sub.value.right, 'id', None) == target.id and getattr(sub.value.left, 'value', 0) > 1: return True
                                if isinstance(sub.value.op, ast.Mod):
                                    if getattr(sub.value.left, 'id', None) == target.id or getattr(sub.value.right, 'id', None) == target.id: return True
                                if isinstance(sub.value.op, (ast.LShift, ast.RShift)): return True

        if len(cond_vars) >= 2:
            mid_var = None
            for child in node.body:
                for sub in ast.walk(child):
                    if isinstance(sub, ast.Assign):
                        is_mid_calc = False
                        for v in ast.walk(sub.value):
                            if isinstance(v, ast.BinOp) and isinstance(v.op, (ast.FloorDiv, ast.Div)):
                                if getattr(v.right, 'value', None) == 2: is_mid_calc = True
                        if is_mid_calc:
                            for target in sub.targets:
                                if isinstance(target, ast.Name): mid_var = target.id
            if mid_var:
                for child in node.body:
                    for sub in ast.walk(child):
                        if isinstance(sub, ast.Assign):
                            for target in sub.targets:
                                if getattr(target, 'id', None) in cond_vars:
                                    for v in ast.walk(sub.value):
                                        if isinstance(v, ast.Name) and v.id == mid_var: return True
        return False
        
    def _is_sqrt_loop(self, node):
        if not isinstance(node, (ast.While, ast.For)): return False  
        expr = node.test if isinstance(node, ast.While) else node.iter
        
        for child in ast.walk(expr):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'): return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "sqrt": return True

        if isinstance(node, ast.While) and isinstance(node.test, ast.Compare):
            left = node.test.left
            for right in node.test.comparators:
                if isinstance(left, ast.BinOp) and isinstance(left.op, ast.Mult):
                    if isinstance(left.left, ast.Name) and isinstance(left.right, ast.Name) and left.left.id == left.right.id: return True
                if isinstance(right, ast.BinOp) and isinstance(right.op, ast.Mult):
                    if isinstance(right.left, ast.Name) and isinstance(right.right, ast.Name) and right.left.id == right.right.id: return True
                if isinstance(left, ast.BinOp) and isinstance(left.op, ast.Pow) and getattr(left.right, 'value', 0) == 2: return True
                if isinstance(right, ast.BinOp) and isinstance(right.op, ast.Pow) and getattr(right.right, 'value', 0) == 2: return True
        return False
    
    def _is_exponential_loop(self, node):
        if not isinstance(node, (ast.For, ast.While)): return False
        expr = node.iter if isinstance(node, ast.For) else node.test
        for child in ast.walk(expr):
            if isinstance(child, ast.BinOp):
                if isinstance(child.op, ast.LShift): return True
                if isinstance(child.op, ast.Pow) and getattr(child.left, 'value', 0) == 2: return True
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == 'pow':
                if len(child.args) >= 2 and getattr(child.args[0], 'value', 0) == 2: return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "exponential": return True
        return False

    def _evaluate_organic_growth(self, target_id, value_node):
        var_t = self.var_types.get(target_id)
        if var_t not in ['str', 'list', 'tuple', 'set', 'dict', 'deque'] and not self._is_linear_var(target_id):
            return "O(1)", "O(1)", None
            
        self_references = sum(1 for n in ast.walk(value_node) if isinstance(n, ast.Name) and n.id == target_id)
        is_mult = any(
            isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and (
                (isinstance(n.left, ast.Name) and n.left.id == target_id and getattr(n.right, 'value', 0) > 1) or 
                (isinstance(n.right, ast.Name) and n.right.id == target_id and getattr(n.left, 'value', 0) > 1)
            ) for n in ast.walk(value_node)
        )
        
        loop_multiplier = len(self.loop_stack)
        
        if self_references >= 2 or is_mult:
            if loop_multiplier > 0:
                self.max_exp = 1
                return "O(2^n)", "O(2^n)", "Geometric Expansion"
            return "O(n)", "O(n)", "Geometric Expansion"
                
        elif self_references == 1:
            if loop_multiplier > 0:
                dim_str = "n^2" if loop_multiplier == 1 else f"n^{loop_multiplier + 1}"
                space_str = "n^2" if var_t in ['str', 'tuple'] else "n"
                time_str = "n^2" if var_t in ['str', 'tuple'] else "n"
                op_name = "String Build" if var_t == 'str' else "Linear Accumulation"
                return f"O({time_str})", f"O({space_str})", op_name
            return "O(1)", "O(1)", "String Build" if var_t == 'str' else "Linear Accumulation"
            
        return "O(1)", "O(1)", None

    def record_line(self, node, time_override=None, space_override=None, custom_op=None, global_time_override=None, global_space_override=None):
        line_text = self.get_code_snippet(node)
        line_num = getattr(node, 'lineno', -1) 
        current_log, current_sqrt, current_graph = self.log_loop_depth, getattr(self, 'sqrt_loop_depth', 0), getattr(self, 'graph_depth', 0)
        
        override_dims, override_log, override_sqrt, override_graph = [], 0, 0, 0
        is_recurrence = False
        
        node_type = type(node).__name__
        op_map = {
            "Assign": "Assignment", "AugAssign": "Update", "For": "Loop", 
            "While": "Loop", "If": "Condition", "Return": "Return", 
            "FunctionDef": "Definition", "Expr": "Expression", "Call": "Function Call", 
            "ListComp": "List Comprehension", "DictComp": "Dict Comprehension", "SetComp": "Set Comprehension",
            "Lambda": "Lambda Function", "Yield": "Generator Yield", "YieldFrom": "Generator Yield",
            "Try": "Try-Except Block", "With": "Context Manager", "IfExp": "Ternary Conditional",
            "JoinedStr": "String Interpolation"
        }
        operation_name = custom_op or op_map.get(node_type, node_type)

        if time_override:
            if time_override.startswith("T(") or any(x in time_override for x in ["T(n) =", "n!", "2^n", "2T("]): is_recurrence = True
            else:
                if "n log n" in time_override: override_dims.append('n'); override_log = 1
                elif "O(V + E)" in time_override: override_graph = 1
                elif "O(log n)" in time_override: override_log = 1
                elif "O(√n)" in time_override: override_sqrt = 1
                elif "O(n * m)" in time_override: override_dims.extend(['n', 'm'])
                elif "O(n)" in time_override: override_dims.append('n')

        total_poly_dims = self.active_poly_dims + override_dims
        total_log, total_sqrt, total_graph = current_log + override_log, current_sqrt + override_sqrt, current_graph + override_graph
        is_dead = getattr(self, 'in_dead_code', False) or time_override == "Dead Code"
        
        display_dims, display_log, display_sqrt, display_graph = override_dims, override_log, override_sqrt, override_graph
        is_loop_or_func = isinstance(node, (ast.For, ast.While, ast.FunctionDef, ast.ListComp, ast.SetComp, ast.DictComp))
        
        if not time_override:
            if self._is_exponential_loop(node):
                time_override, is_recurrence, self.max_exp = "O(2^n)", True, 1
            elif isinstance(node, ast.For):
                if not self._is_constant_loop(node):
                    iter_name = self._get_iterable_name(node.iter)
                    dim = self._register_and_get_dim(iter_name)
                    display_dims = [dim]
            elif isinstance(node, ast.While):
                if getattr(self, 'in_graph_context', False) and self._is_graph_while_loop(node): display_graph = 1
                elif self._is_log_loop(node): display_log = 1
                elif self._is_sqrt_loop(node): display_sqrt = 1
                elif not self._is_constant_loop(node): 
                    limit_vars = self._get_while_limit_vars(node)
                    if limit_vars:
                        dims = [self._register_and_get_dim(lv) for lv in limit_vars]
                        dim = dims[0] if dims else 'n'
                    else:
                        dim = 'n'
                    display_dims = [dim]
            if not is_loop_or_func:
                display_dims = []

        if time_override == "Definition":
            local_t = global_t = local_s = global_s = "O(1)"
            t_w = 0
        elif is_dead:
            local_t = global_t = local_s = global_s = "Dead Code"
            t_w = -1
        else:
            local_t = self._build_time_str(display_dims, display_log, display_sqrt, 0, display_graph)
            if time_override and is_recurrence:
                local_t = time_override
            elif time_override:
                local_t = time_override
                
            local_s = space_override if space_override else "O(1)"
            
            if local_s == "S(placeholder)":
                global_s = "S(placeholder)"
            elif global_space_override:
                global_s = global_space_override
            else:
                global_s = local_s
                
            s_w = 0
            if global_s != "S(placeholder)":
                if "n^n" in global_s or "n!" in global_s: s_w = 5
                elif "O(n^d)" in global_s: s_w = 4
                elif "2^n" in global_s or "2ⁿ" in global_s: s_w = 4
                elif "n * m" in global_s or "n^2" in global_s or "n²" in global_s: s_w = 2
                elif "V + E" in global_s or "V" in global_s: s_w = 3
                elif "log n" in global_s: s_w = 0.5  
                elif "n" in global_s: s_w = 1        
            
            self.max_space_weight = max(getattr(self, 'max_space_weight', 0), s_w)
            
            if global_time_override:
                global_t = global_time_override
                t_w = self._get_weight(total_poly_dims, total_log, total_sqrt, self.max_exp, total_graph)
                if "O(n^d)" in global_t: t_w = max(t_w, 100)
                elif "2^n" in global_t: t_w = max(t_w, 100)
                elif "n^3" in global_t or "n³" in global_t: t_w = max(t_w, 30)
                elif "n^2" in global_t or "n²" in global_t: t_w = max(t_w, 20)
            elif (local_t == "O(1)" or "amortized" in local_t) and not is_loop_or_func:
                global_t = local_t
                t_w = 0 
            else:
                global_t = self._build_time_str(total_poly_dims, total_log, total_sqrt, self.max_exp, total_graph) if not (time_override and is_recurrence) else time_override
                t_w = self._get_weight(total_poly_dims, total_log, total_sqrt, self.max_exp, total_graph)

        hits = self.trace_data.get("line_hits", {}).get(line_num, 0)
        mem_state = {}
        for snap in self.trace_data.get("history", []):
            if snap.line_no == line_num:
                for var_name, var_data in snap.variables.items():
                    if var_name not in mem_state or var_data["size"] > mem_state[var_name]["size"]:
                        mem_state[var_name] = var_data

        time_exp, space_exp = self.nlg_engine.generate_explanations(
            node, local_t, global_t, local_s, global_s, is_dead, line_text, hits, mem_state
        )

        hints = self.logic_hints.get(getattr(node, 'lineno', -1), [])
        if hints: time_exp += "\n\n" + "\n".join(hints)

        entry = {
            "lineno": line_num, "lineOfCode": line_text, "operation": operation_name,  
            "local_time": local_t, "global_time": global_t, "local_space": local_s, "global_space": global_s, 
            "indent": self.current_depth, "color": self.get_color(global_t), "weight": t_w, 
            "time_explanation": time_exp, "space_explanation": space_exp,
            "hits": hits, "memory_state": mem_state
        }
        
        if self._details and self._details[-1]["lineOfCode"] == line_text:
            prev_w = self._details[-1].get("weight", -1)
            prev_op = self._details[-1].get("operation", "")
            
            if t_w > prev_w:
                self._details[-1].update(entry)
            elif t_w == prev_w:
                generics = ["Expression", "Assignment", "Update", "Binary Operation", "Function Call"]
                if prev_op in generics and operation_name not in generics:
                    self._details[-1].update(entry)
                elif operation_name not in generics and custom_op:
                    self._details[-1].update(entry)
        else: 
            self._details.append(entry)

        if not is_dead and time_override != "Definition":
            if t_w > self.max_complexity:
                self.max_complexity = t_w
                if t_w < 998:
                    self.max_poly_str = self._build_time_str(total_poly_dims, 0, 0, 0, 0)
                    self.max_log, self.max_sqrt, self.max_graph_ve = total_log, total_sqrt, total_graph
                
    def generic_visit(self, node):
        for field, value in ast.iter_fields(node):
            if isinstance(value, list):
                hit_terminal = False  
                for item in value:
                    if isinstance(item, ast.AST):
                        if hit_terminal:
                            prev_dead = self.in_dead_code; self.in_dead_code = True  
                            self.visit(item); self.in_dead_code = prev_dead  
                        else:
                            self.visit(item)  
                            if isinstance(item, (ast.Return, ast.Break, ast.Continue)): hit_terminal = True
            elif isinstance(value, ast.AST): self.visit(value)
    
    def visit_Try(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1

    def visit_With(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1

    def visit_Lambda(self, node):
        self.record_line(node, time_override="Definition", space_override="O(1)", global_space_override="O(1)")
        self.generic_visit(node)

    def visit_Yield(self, node):
        self.has_global_accumulation = True
        self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)")
        self.generic_visit(node)

    def visit_YieldFrom(self, node):
        self.has_global_accumulation = True
        self.record_line(node, time_override="O(n)", space_override="O(1)", global_space_override="O(1)")
        self.generic_visit(node)

    def visit_GeneratorExp(self, node):
        self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Generator Expression", global_space_override="O(1)")
        self.generic_visit(node)
        
    def visit_IfExp(self, node):
        if self._is_linear_type(node):
            self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Ternary Conditional (Iterable)", global_space_override="O(n)")
        else:
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Ternary Conditional", global_space_override="O(1)")
        self.generic_visit(node)
        
    def visit_JoinedStr(self, node):
        if self._is_linear_type(node):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Interpolation (Iterable)", global_space_override="O(n)")
        else:
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Interpolation", global_space_override="O(1)")
        self.generic_visit(node)

    def visit_Compare(self, node):
        if any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops):
            is_hash_map = False
            for comp in node.comparators:
                if isinstance(comp, ast.Name):
                    t = self.var_types.get(comp.id)
                    if t in ['set', 'dict']: is_hash_map = True
                    elif any(k in comp.id.lower() for k in ['memo', 'cache', 'visit', 'set', 'map', 'dp']): is_hash_map = True
                elif isinstance(comp, (ast.Set, ast.Dict, ast.SetComp, ast.DictComp)): is_hash_map = True
                elif isinstance(comp, ast.Call) and isinstance(getattr(comp, 'func', None), ast.Name) and comp.func.id in ['set', 'dict']: is_hash_map = True
            
            if is_hash_map:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Membership Check (Set/Dict)", global_space_override="O(1)")
            else:
                self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Membership Check (List/Tuple/String)", global_space_override="O(1)")
            
            self.generic_visit(node)
            return

        if any(isinstance(op, ast.LtE) for op in node.ops):
            for comp in node.comparators:
                if isinstance(comp, ast.Call) and getattr(getattr(comp, 'func', None), 'id', '') == 'len':
                    self.add_logic_hint(node, "Logic Risk (Off-By-One): Using '<=' with 'len()' often causes an IndexError because arrays are 0-indexed.")
                    
        self.record_line(node, global_space_override="O(1)")
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        is_memoized_or_graph = False
        for dec in getattr(node, 'decorator_list', []):
            if isinstance(dec, ast.Name) and dec.id in ['lru_cache', 'cache', 'memoize']: is_memoized_or_graph = True
            elif isinstance(dec, ast.Call) and getattr(dec.func, 'id', '') in ['lru_cache', 'cache']: is_memoized_or_graph = True
        
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and any(k in child.id.lower() for k in ['memo', 'cache', 'dp', 'visit']):
                is_memoized_or_graph = True

        if is_memoized_or_graph: self.memoized_funcs.add(node.name)

        start_idx = len(self._details)
        prev_data = (self.max_complexity, getattr(self, 'max_space_weight', 0), self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0))
        self.max_complexity = self.max_space_weight = self.max_log = self.max_sqrt = self.max_exp = self.max_graph_ve = 0
        self.max_poly_str = "O(1)"
        
        self.current_function_name = node.name
        self.recursive_calls_count = 0
        
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False
        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.in_if_depth = 0
        self.in_graph_context = self._detect_graph_context(node)
        
        is_dead = node.name not in self.reachable_funcs
        self.record_line(node, time_override="Dead Code" if is_dead else "Definition", space_override="O(1)", global_space_override="O(1)")
        prev_dead = self.in_dead_code; self.in_dead_code = is_dead or prev_dead
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
        self.in_dead_code = prev_dead
        
        does_linear_work = self.max_poly_str != "O(1)" or self.has_slicing
        if not does_linear_work:
            for called in self.call_graph.get(node.name, set()):
                if called in self.symbol_table and called != node.name:
                    for child in ast.walk(self.symbol_table[called]):
                        if isinstance(child, (ast.For, ast.While)) and not self._is_constant_loop(child): does_linear_work = True; break
                        elif isinstance(child, ast.ListComp): does_linear_work = True; break
                        elif isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Slice): does_linear_work = True; break
                    if does_linear_work: break

        is_indirect = node.name in self.indirect_recursive_funcs

        is_2d_memo = False
        for child in ast.walk(node):
            if isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Tuple):
                is_2d_memo = True

        if is_memoized_or_graph and (self.recursive_calls_count > 0 or self.has_recursion_in_loop):
            if self.in_graph_context or 'visit' in node.name.lower():
                relation = "O(V + E)"
                self.custom_space[node.name] = "O(V)"
            elif is_2d_memo:
                relation = "O(n * m)"
                self.custom_space[node.name] = "O(n * m)"
            else:
                relation = "O(n)"
                self.custom_space[node.name] = "O(n)"
        else:
            if is_indirect:
                relation = "T(n) = T(n-1) + T(n-2) + O(1)" 
            elif self.has_recursion_in_loop: 
                if self.in_graph_context:
                    relation = "O(V + E)"
                elif any(k in node.name.lower() for k in ['combination', 'subset', 'permutation', 'knapsack']):
                    relation = "O(2^n)"
                else:
                    relation = "T(n) = n * T(n-1)" 
            elif self.recursive_calls_count == 1:
                if (self.has_division or self.has_partitioning) and does_linear_work:
                    relation = "T(n) = T(n/2) + O(n)"
                elif (self.has_division or self.has_partitioning):
                    relation = "T(n) = T(n/2) + O(1)"
                elif does_linear_work:
                    relation = "T(n) = T(n-1) + O(n)"
                elif self.max_log > 0:
                    relation = "T(n) = T(n-1) + O(log n)"
                else:
                    relation = "T(n) = T(n-1) + O(1)"
            elif self.recursive_calls_count == 2:
                is_quicksort = False
                for child in ast.walk(node):
                    if isinstance(child, ast.Name) and 'pivot' in child.id.lower():
                        is_quicksort = True
                        break
                
                if is_quicksort:
                    if self.has_division:
                        relation = "T(n) = 2T(n/2) + O(n)"
                    else:
                        relation = "T(n) = T(n-1) + O(n)"
                elif (self.has_partitioning and not self.has_division):
                    relation = "T(n) = T(n-1) + O(n)"
                elif (self.has_division or self.has_partitioning) and does_linear_work:
                    relation = "T(n) = 2T(n/2) + O(n)"
                elif (self.has_division or self.has_partitioning):
                    relation = "T(n) = 2T(n/2) + O(1)"
                else:
                    relation = "T(n) = T(n-1) + T(n-2) + O(1)"
            elif self.recursive_calls_count > 2:
                if any(k in node.name.lower() for k in ['path', 'maze', 'graph', 'visit']):
                    relation = "O(V + E)"
                else:
                    relation = f"O({self.recursive_calls_count}^n)"
            else: 
                relation = "O(2^n)" if self.max_exp > 0 else (self.max_poly_str if self.max_poly_str != "O(1)" else self._build_time_str([], self.max_log, self.max_sqrt, 0, self.max_graph_ve))
            
            if node.name not in self.custom_space:
                if not is_indirect:
                    if self.max_graph_ve > 0 or self.in_graph_context or relation == "O(V + E)": self.custom_space[node.name] = "O(V)"
                    elif self.recursive_calls_count > 0:
                        if "O(n * m)" in relation: 
                            self.custom_space[node.name] = "O(n * m)"
                        elif "T(n/2)" in relation:
                            if self.max_space_weight >= 1:
                                self.custom_space[node.name] = "O(n)"
                            else:
                                self.custom_space[node.name] = "O(log n)"
                        else: 
                            self.custom_space[node.name] = "O(n)"
                    elif self.max_space_weight >= 2: self.custom_space[node.name] = "O(n^2)"
                    elif self.max_space_weight >= 1: self.custom_space[node.name] = "O(n)"
                    elif self.max_space_weight >= 0.5: self.custom_space[node.name] = "O(log n)"
                    else: self.custom_space[node.name] = "O(1)"
                else:
                    self.custom_space[node.name] = "O(n)"
            
        self.custom_functions[node.name] = relation

        call_idx = 0
        for i in range(start_idx, len(self._details)):
            is_placeholder = False
            loc_time = str(self._details[i]["local_time"])
            if loc_time == "T(placeholder)" or loc_time.startswith("T("): 
                current_call_cost = "T(n-1)"
                if "T(n/2)" in relation:
                    current_call_cost = "T(n/2)"
                elif "T(n-1) + T(n-2)" in relation:
                    current_call_cost = "T(n-1)" if call_idx == 0 else "T(n-2)"
                elif "T(n-1)" in relation:
                    current_call_cost = "T(n-1)"
                
                self._details[i]["local_time"] = current_call_cost
                is_placeholder = True
                
            if str(self._details[i]["global_time"]).startswith("T("): 
                self._details[i]["global_time"] = self._details[i]["local_time"]
                is_placeholder = True

            if is_placeholder:
                call_idx += 1
                
            if self._details[i]["operation"] == "Recursive Call":
                self._details[i]["global_time"] = relation

            if str(self._details[i]["local_space"]).startswith("S("):
                self._details[i]["local_space"] = "O(1)"
            if str(self._details[i]["global_space"]).startswith("S("):
                self._details[i]["global_space"] = self.custom_space[node.name]
                
            if is_placeholder and "T(placeholder)" in str(self._details[i].get("time_explanation", "")):
                formatted_rel = self.nlg_engine._format_recurrence_relation(relation)
                self._details[i]["time_explanation"] = self._details[i]["time_explanation"].replace("T(placeholder)", formatted_rel)
        
        if not is_dead:
            self.max_exp, self.max_graph_ve = max(prev_data[5], self.max_exp), max(prev_data[6], self.max_graph_ve)
            self.max_complexity, self.max_space_weight = max(prev_data[0], self.max_complexity), max(prev_data[1], self.max_space_weight)
            self.max_poly_str, self.max_log, self.max_sqrt = prev_data[2] if prev_data[2] != "O(1)" else self.max_poly_str, max(prev_data[3], self.max_log), max(prev_data[4], self.max_sqrt)
        else: self.max_complexity, self.max_space_weight, self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, self.max_graph_ve = prev_data
        
        self.current_function_name = None; self.in_graph_context = False; self.recursive_calls_count = 0 
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False

    def visit_If(self, node):
        self.record_line(node, global_space_override="O(1)")
        if hasattr(node, 'test'): self.visit(node.test)
        if len(self.active_poly_dims) > 0: self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.in_if_depth += 1
        prev_rec = self.recursive_calls_count; self.recursive_calls_count = 0
        self.current_depth += 1; 
        for c in node.body: self.visit(c)
        self.current_depth -= 1
        if_rec = self.recursive_calls_count; self.recursive_calls_count = 0
        self.current_depth += 1; 
        for c in node.orelse: self.visit(c)
        self.current_depth -= 1
        self.recursive_calls_count = prev_rec + max(if_rec, self.recursive_calls_count)
        self.in_if_depth -= 1

    def visit_ListComp(self, node):
        self.has_partitioning = True
        self.in_list_comp_depth = getattr(self, 'in_list_comp_depth', 0) + 1
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        if any(getattr(comp, 'ifs', []) for comp in node.generators): self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc
        self.in_list_comp_depth -= 1

    def visit_SetComp(self, node):
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_DictComp(self, node):
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_For(self, node):
        iter_name = self._get_iterable_name(node.iter)
        dim = self._register_and_get_dim(iter_name)
        self.loop_stack.append('n')
            
        if self._is_exponential_loop(node):
            self.max_exp = 1; self.record_line(node, time_override="O(1)", global_time_override="O(2^n)", global_space_override="O(1)")
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            self.loop_stack.pop()
            return 
            
        is_const = self._is_constant_loop(node)
        if not is_const: self.active_poly_dims.append(dim)
            
        self.record_line(node, global_space_override="O(1)"); self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1  
        
        if not is_const: self.active_poly_dims.pop()
        self.loop_stack.pop()

    def visit_While(self, node):
        self.loop_stack.append('n')
        is_log, is_sqrt, is_const = self._is_log_loop(node), self._is_sqrt_loop(node), self._is_constant_loop(node)
        is_graph = self._is_graph_while_loop(node)
        
        limit_vars = self._get_while_limit_vars(node)
        if limit_vars:
            dims = [self._register_and_get_dim(lv) for lv in limit_vars]
            dim = dims[0] if dims else 'n'
        else:
            dim = 'n'

        if is_graph: self.graph_depth = getattr(self, 'graph_depth', 0) + 1
        elif not is_const:
            if is_log: self.log_loop_depth += 1
            elif is_sqrt: self.sqrt_loop_depth += 1
            else: self.active_poly_dims.append(dim)
            
        self.record_line(node, global_space_override="O(1)")
        if hasattr(node, 'test'): self.visit(node.test)
        self.current_depth += 1; 
        for child in node.body: self.visit(child)
        self.current_depth -= 1  
        
        if is_graph: self.graph_depth -= 1
        elif not is_const:
            if is_log: self.log_loop_depth -= 1
            elif is_sqrt: self.sqrt_loop_depth -= 1
            else: self.active_poly_dims.pop()
            
        self.loop_stack.pop()

    def visit_Call(self, node):
        is_accumulating = False
        if isinstance(node.func, ast.Attribute) and node.func.attr in ['append', 'extend', 'add']:
            is_accumulating = True
            self.has_global_accumulation = True
            if node.func.attr == 'add' and isinstance(getattr(node.func, 'value', None), ast.Name):
                self.var_types[node.func.value.id] = 'set'
        elif isinstance(node.func, ast.Name) and node.func.id in ['append', 'extend', 'add']:
            is_accumulating = True
            self.has_global_accumulation = True
            
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = prev_acc or is_accumulating
        
        if is_accumulating and len(self.loop_stack) > 0:
            self.max_space_weight = max(self.max_space_weight, 1)

        if getattr(getattr(node, 'func', None), 'attr', '') == 'append' or getattr(node.func, 'id', '') == 'append':
            self.add_logic_hint(node, "Logic Hint (Amortized Analysis): The `.append()` operation is generally O(1) constant time, but occasionally triggers an O(n) background array resize sequence when memory capacity is breached.")
        
        if getattr(getattr(node, 'func', None), 'attr', '') == 'remove' or getattr(node.func, 'id', '') == 'remove':
            self.add_logic_hint(node, "Logic Hint: The `.remove()` operation is O(n) linear time for Lists as it requires finding and shifting elements. However, it is O(1) constant time for Sets.")

        if isinstance(node.func, ast.Name):
            f_id = node.func.id
            if f_id == 'set2': f_id = 'set'
            f_id = self.aliases.get(f_id, f_id)
            is_indirect_call = f_id in self.indirect_recursive_funcs and self.current_function_name in self.indirect_recursive_funcs
            
            if f_id == self.current_function_name or is_indirect_call:
                self.recursive_calls_count += 1
                self.first_rec_line = min(self.first_rec_line, getattr(node, 'lineno', float('inf')))
                if len(self.active_poly_dims) > 0 or self.log_loop_depth > 0: 
                    self.has_recursion_in_loop = True  

                if getattr(self, 'in_graph_context', False): 
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Recursive Call", global_space_override="O(V)")
                else: 
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Recursive Call", global_space_override="S(placeholder)")
            elif f_id in self.builtin_complexities:
                if f_id in ['min', 'max'] and len(getattr(node, 'args', [])) > 1:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op=f"{f_id.capitalize()} (Scalar Comparison)", global_space_override="O(1)")
                else:
                    b = self.builtin_complexities[f_id]
                    self.record_line(node, time_override=b['time'], space_override="O(1)", global_space_override=b['space'])
            elif f_id == 'print':
                is_linear = any(self._is_linear_type(arg) for arg in node.args)
                if is_linear: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Print (Iterable)", global_time_override="O(n)", global_space_override="O(1)")
                else: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Print Statement", global_space_override="O(1)")
            elif f_id in self.custom_functions:
                call_comp = self.custom_functions[f_id]
                lookup = {
                    "T(n) = n * T(n-1)": "O(n^d)", "T(n) = 2T(n/2) + O(n)": "O(n log n)",
                    "T(n) = 2T(n/2) + O(1)": "O(n)", "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
                    "T(n) = T(n/2) + O(n)": "O(n)", "T(n) = T(n/2) + O(1)": "O(log n)",
                    "T(n) = T(n-1) + O(n)": "O(n^2)", "T(n) = T(n-1) + O(log n)": "O(n log n)",
                    "T(n) = T(n-1) + O(1)": "O(n)", "2T(n/2)": "O(n log n)",
                    "T(n-1) + T(n-2)": "O(2^n)", "T(n/2) + O(1)": "O(log n)", 
                    "T(n-1) + O(n)": "O(n^2)", "O(n log n)": "O(n log n)", "O(n^2)": "O(n^2)", 
                    "O(V + E)": "O(V + E)", "O(n * m)": "O(n * m)", "O(2^n)": "O(2^n)", 
                    "O(n!)": "O(n!)", "O(n)": "O(n)", "O(log n)": "O(log n)", "O(1)": "O(1)"
                }
                for k, v in lookup.items():
                    if k in call_comp: call_comp = v; break
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Function Call", global_time_override=call_comp, global_space_override=self.custom_space.get(f_id, "O(1)"))
            else: self.record_line(node, global_space_override="O(1)")
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr == 'pop':
                is_dict = isinstance(node.func.value, ast.Name) and self.var_types.get(node.func.value.id) == 'dict'
                if len(node.args) > 0:
                    if is_dict: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from Dictionary", global_space_override="O(1)")
                    else: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from specific index", global_time_override="O(n)", global_space_override="O(1)")
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from end / set", global_space_override="O(1)")
            elif node.func.attr == 'remove':
                is_set = isinstance(node.func.value, ast.Name) and self.var_types.get(node.func.value.id) == 'set'
                if is_set: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Remove from Set", global_space_override="O(1)")
                else: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Remove from List", global_time_override="O(n)", global_space_override="O(1)")
            elif node.func.attr == 'copy':
                is_rec = self.current_function_name in self.call_graph.get(self.current_function_name, set())
                if is_rec or getattr(self, 'in_accumulation_context', False):
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Deep Copy Allocation", global_time_override="O(n)", global_space_override="O(n^2)")
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Shallow Copy", global_time_override="O(n)", global_space_override="O(n)")
            elif node.func.attr == 'append':
                is_appending_list = False
                if node.args:
                    arg = node.args[0]
                    if isinstance(arg, ast.Name) and self.var_types.get(arg.id) == 'list': is_appending_list = True
                    elif isinstance(arg, ast.List): is_appending_list = True
                    elif isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mult) and isinstance(arg.left, ast.List): is_appending_list = True
                
                if is_appending_list and len(self.loop_stack) > 0:
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Append Row", global_time_override="O(1)", global_space_override="O(n^2)")
                    self.generic_visit(node)
                    self.in_accumulation_context = prev_acc
                    return
                
                b = self.builtin_complexities.get(node.func.attr, {'time': 'O(1)', 'space': 'O(1)'})
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Append", global_time_override="O(1) amortized", global_space_override="O(1)")
                    
            elif node.func.attr in ['add', 'insert', 'update', 'clear', 'union', 'intersection', 'difference', 'get', 'keys', 'values', 'items']:
                b = self.builtin_complexities.get(node.func.attr, {'time': 'O(1)', 'space': 'O(1)'})
                self.record_line(node, time_override=b['time'], space_override=b['space'], custom_op=node.func.attr.capitalize(), global_time_override=b['time'], global_space_override=b['space'])
            elif node.func.attr in self.builtin_complexities:
                b = self.builtin_complexities[node.func.attr]
                self.record_line(node, time_override=b['time'], space_override=b['space'], global_time_override=b['time'], global_space_override=b['space'])
            else: 
                self.record_line(node, global_space_override="O(1)")
        
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                if isinstance(node.value, (ast.List, ast.ListComp)): self.var_types[target.id] = 'list'
                elif isinstance(node.value, (ast.Dict, ast.DictComp)): self.var_types[target.id] = 'dict'
                elif isinstance(node.value, (ast.Set, ast.SetComp)): self.var_types[target.id] = 'set'
                elif isinstance(node.value, ast.Tuple): self.var_types[target.id] = 'tuple'
                elif isinstance(node.value, ast.Constant) and isinstance(node.value.value, str): self.var_types[target.id] = 'str'
                elif isinstance(node.value, ast.Call) and getattr(getattr(node.value, 'func', None), 'id', '') in ['set', 'list', 'dict', 'deque', 'tuple']:
                    self.var_types[target.id] = node.value.func.id

        s_ov, t_ov = "O(1)", "O(1)"
        custom_op = None
        g_space = None
        g_time = None
        
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Subscript):
            custom_op = "Update"
            g_space = "O(1)"
            g_time = "O(1)"
        
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Variable Unpacking/Swap", global_space_override="O(1)")
            self.generic_visit(node)
            return

        if getattr(self, 'in_graph_context', False):
            if isinstance(node.value, (ast.ListComp, ast.SetComp, ast.DictComp)): 
                g_time = "O(V)"
                g_space = "O(V)"
            elif isinstance(node.value, (ast.Tuple, ast.List, ast.Set)):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    g_time = "O(V)"
                    g_space = "O(V)"
                else:
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    g_time = "O(V)"
                    g_space = "O(V)"
                else:
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Call) and isinstance(getattr(node.value.func, 'id', ''), str) and getattr(node.value.func, 'id', '') in ['set', 'list', 'dict', 'deque', 'tuple']: 
                g_time = "O(V)"
                g_space = "O(V)"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, (ast.List, ast.Tuple)) or isinstance(node.value.right, (ast.List, ast.Tuple))): 
                g_time = "O(V)"
                custom_op = "List Repetition"
                g_space = "O(V)"
        else:
            if isinstance(node.value, ast.ListComp):
                is_nested = len(node.value.generators) > 1
                if isinstance(node.value.elt, ast.ListComp): is_nested = True
                
                if isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List): 
                    is_nested = True
                    
                if is_nested:
                    g_time = "O(n * m)"
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="2D Array Allocation", global_time_override=g_time, global_space_override="O(n * m)")
                    self.generic_visit(node)
                    return
                else:
                    g_time = "O(n)"
                    g_space = "O(n)"
            elif isinstance(node.value, (ast.SetComp, ast.DictComp)): 
                g_time = "O(n)"
                g_space = "O(n)"
            elif isinstance(node.value, ast.List):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                elif len(node.value.elts) > 0:
                    custom_op = "Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                else:
                    custom_op = "List Init"
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Set):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Set Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                elif len(node.value.elts) > 0:
                    custom_op = "Set Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                else:
                    custom_op = "Set Init"
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    custom_op = "Dict Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                elif len(node.value.keys) > 0:
                    custom_op = "Dict Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                else:
                    custom_op = "Dict Init"
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Tuple):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Tuple Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                elif len(node.value.elts) > 0:
                    custom_op = "Tuple Init"
                    g_time = "O(n)"
                    g_space = "O(n)"
                else:
                    custom_op = "Tuple Init"
                    g_time = "O(1)"
                    g_space = "O(1)"
            elif isinstance(node.value, ast.Call) and getattr(getattr(node.value, 'func', None), 'id', '') in ['set', 'list', 'dict', 'deque', 'tuple', 'set2']: 
                f_name = node.value.func.id
                f_name = 'set' if f_name == 'set2' else f_name
                custom_op = f"{f_name.capitalize()} Build"
                g_time = "O(n)"
                g_space = "O(n)"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, (ast.List, ast.Tuple)) or isinstance(node.value.right, (ast.List, ast.Tuple))): 
                dim_var = 'n'
                if isinstance(node.value.left, ast.Name): dim_var = self._register_and_get_dim(node.value.left.id)
                elif isinstance(node.value.right, ast.Name): dim_var = self._register_and_get_dim(node.value.right.id)
                custom_op = "List Repetition"
                g_time = f"O({dim_var})"
                g_space = f"O({dim_var})"
            elif isinstance(node.value, ast.Subscript) and isinstance(node.value.slice, ast.Slice): 
                custom_op = "Array Slicing"
                g_time = "O(n)"
                g_space = "O(n)"
            
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                if self._is_linear_var(t_id) or self.var_types.get(t_id) in ['str', 'list', 'tuple', 'set', 'dict']:
                    gt, gs, op = self._evaluate_organic_growth(t_id, node.value)
                    if op:
                        if op == "Geometric Expansion":
                            t_ov = "O(n)"
                            s_ov = "O(n)"
                        elif op == "String Build":
                            t_ov = "O(1)"
                            s_ov = "O(1)"
                        else:
                            t_ov = "O(n)" if gt != "O(1)" else "O(1)"
                            s_ov = "O(n)" if gs != "O(1)" else "O(1)"
                        g_time = gt
                        g_space = gs
                        custom_op = op
                        break

            if custom_op is None and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                custom_op = "Init"
                g_space = "O(1)"
                
            if custom_op is None and g_space is None:
                g_space = "O(1)"

        for child in ast.walk(node.value):
            if isinstance(child, (ast.BinOp, ast.Call)):
                if (isinstance(child, ast.BinOp) and (isinstance(child.op, ast.LShift) or (isinstance(child.op, ast.Pow) and getattr(child.left, 'value', 0) == 2))) or (isinstance(child, ast.Call) and getattr(getattr(child, 'func', None), 'id', '') == 'pow' and getattr(child.args[0] if getattr(child, 'args', None) else None, 'value', 0) == 2):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "exponential"
                        
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "sqrt"
            
        self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=custom_op, global_time_override=g_time, global_space_override=g_space) 
        self.generic_visit(node)

    def visit_AugAssign(self, node): 
        if self.loop_depth > 0 and isinstance(node.target, ast.Name) and isinstance(node.value, ast.Subscript):
            self.add_logic_hint(node, "Logic Risk (Data-Dependent Traversal): Your loop increment/step depends heavily on dynamic data values. Static analysis conservatively defaults to worst-case, but this runtime could radically fluctuate depending on the dataset state.")

        if isinstance(node.target, ast.Name) and self._is_linear_var(node.target.id):
            is_geometric = False
            if isinstance(node.op, ast.Mult) and isinstance(node.value, ast.Constant) and getattr(node.value, 'value', 0) > 1:
                is_geometric = True
            elif isinstance(node.op, ast.Add) and isinstance(node.value, ast.Name) and node.value.id == node.target.id:
                is_geometric = True
                
            if is_geometric:
                if len(self.loop_stack) > 0:
                    self.max_space_weight = max(self.max_space_weight, 4)
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Geometric Expansion", global_time_override="O(2^n)", global_space_override="O(2^n)")
                    self.max_exp = 1
                    return

        if isinstance(node.target, ast.Name) and self.var_types.get(node.target.id) == 'str' and isinstance(node.op, ast.Add):
            if len(self.loop_stack) > 0:
                loop_dims = len(self.active_poly_dims)
                if loop_dims >= 2:
                    self.max_space_weight = max(self.max_space_weight, 2)
                    g_space = "O(n^2)"
                    g_time = "O(n^3)"
                else:
                    self.max_space_weight = max(self.max_space_weight, 1)
                    g_space = "O(n)"
                    g_time = "O(n^2)"
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Build", global_time_override=g_time, global_space_override=g_space)
                return 

        for child in ast.walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    if isinstance(node.target, ast.Name): self.variable_complexities[node.target.id] = "sqrt"
        self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)")
        self.generic_visit(node)  

    def visit_Subscript(self, node):
        if isinstance(node.slice, ast.Slice):
            self.has_slicing = True  
            slice_str = ast.dump(node.slice).lower()
            if any(kw in slice_str for kw in ['div', 'mid', 'half', 'part', '/']):
                self.has_partitioning = True
                
            g_space = "O(n^2)" if getattr(self, 'in_accumulation_context', False) and len(self.active_poly_dims) > 0 else "O(n)"
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Array Slicing", global_time_override="O(n)", global_space_override=g_space)
        self.generic_visit(node)  

    def visit_BinOp(self, node):
        if isinstance(node.op, (ast.Add, ast.Mult)):
            if self._is_linear_type(node.left) or self._is_linear_type(node.right):
                if getattr(self, 'in_list_comp_depth', 0) > 0:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Row Allocation", global_time_override="O(m)", global_space_override="O(m)")
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Concatenation / Repetition", global_time_override="O(n)", global_space_override="O(n)")
            else:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Binary Operation", global_space_override="O(1)")
                
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.RShift, ast.Mod)): self.has_division = True  
        elif isinstance(node.op, ast.Mult):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, float) and node.right.value < 1.0: self.has_division = True
            elif isinstance(node.left, ast.Constant) and isinstance(node.left.value, float) and node.left.value < 1.0: self.has_division = True
            
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)):
            is_set_op = False
            for child in ast.walk(node):
                if isinstance(child, (ast.Set, ast.SetComp)): is_set_op = True; break
            if is_set_op:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Set Operation", global_time_override="O(n)", global_space_override="O(n)")
            else:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Binary Operation", global_space_override="O(1)")
                
        self.generic_visit(node)  

    def visit_Return(self, node): self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)"); self.generic_visit(node)  

    def visit_Expr(self, node): 
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Comment / Docstring", global_space_override="O(1)")
        else:
            self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override="O(1)")
        self.generic_visit(node)      

    def get_final_asymptotic_badge(self):
        lookup = {
            "T(n) = n * T(n-1)": ("O(n^d)", 9), "O(n!)": ("O(n!)", 9), "O(n^d)": ("O(n^d)", 9),
            "T(n) = T(n-1) + T(n-2) + O(1)": ("O(2^n)", 8), "O(2^n)": ("O(2^n)", 8),
            "O(n^3)": ("O(n^3)", 7),
            "O(n^2 log n)": ("O(n^2 log n)", 6.5),
            "T(n) = T(n-1) + O(n)": ("O(n^2)", 6), "O(n^2)": ("O(n^2)", 6), 
            "T(n) = 2T(n/2) + O(n)": ("O(n log n)", 5), "T(n) = T(n-1) + O(log n)": ("O(n log n)", 5), "O(n log n)": ("O(n log n)", 5), "n * log n": ("O(n log n)", 5),
            "O(V + E)": ("O(V + E)", 4.5),
            "T(n) = 2T(n/2) + O(1)": ("O(n)", 4), "T(n) = T(n/2) + O(n)": ("O(n)", 4), "T(n) = T(n-1) + O(1)": ("O(n)", 4), "O(n)": ("O(n)", 4),
            "O(√n)": ("O(√n)", 3),
            "T(n) = T(n/2) + O(1)": ("O(log n)", 2), "O(log n)": ("O(log n)", 2),
            "O(1)": ("O(1)", 1)
        }
        best_comp = "O(1)"
        best_rank = 1
        
        for line in self._details:
            for c in [str(line.get('global_time', '')), str(line.get('local_time', ''))]:
                
                if "C(n,k)" in c or "4^n" in c: c = "O(2^n)"
                if "n * m" in c: c = "O(n^2)"
                if any(x in c for x in ["n + m", "n1", "n2", "k"]) and c != "O(1)": c = "O(n)"
                
                for key, (mapped, rank) in lookup.items():
                    if key in c and rank > best_rank:
                        best_rank = rank
                        best_comp = mapped

                if c.startswith("O(") and c != "O(1)":
                    if "*" in c and "log" not in c and best_rank < 6:
                        best_rank = 6
                        best_comp = "O(n^2)"  
                    elif "*" in c and "log" in c and best_rank < 6.5:
                        best_rank = 6.5
                        best_comp = "O(n^2 log n)"
        
        for key, (mapped, rank) in lookup.items():
            if key in self.max_poly_str and rank > best_rank:
                best_rank = rank
                best_comp = mapped
                
        if self.max_poly_str.startswith("O(") and self.max_poly_str != "O(1)":
            if "*" in self.max_poly_str and "log" not in self.max_poly_str and best_rank < 6:
                best_rank = 6
                best_comp = "O(n^2)"
            elif "*" in self.max_poly_str and "log" in self.max_poly_str and best_rank < 6.5:
                best_rank = 6.5
                best_comp = "O(n^2 log n)"
                
        return best_comp

    def get_final_space_badge(self):
        rankings = {
            "O(n^d)": 8, "O(n!)": 8, "O(2^n)": 7.5, "O(n^3)": 7, "O(n^2 log n)": 6.5, "O(n^2)": 6, "O(n log n)": 5, 
            "O(V + E)": 4.5, "O(V)": 4.2, "O(n)": 4, "O(log n)": 3, "O(1)": 1
        }
        
        best_space = "O(1)"
        best_rank = 1
        
        for line in self._details:
            s = str(line.get('global_space', 'O(1)'))
            
            if "C(n,k)" in s or "4^n" in s:
                s = "O(n)"
            elif "n * m" in s:
                s = "O(n^2)"
            elif any(x in s for x in ["n + m", "n1", "n2", "k"]) and s != "O(1)":
                s = "O(n)"
                
            for key, rank in rankings.items():
                if key in s and rank > best_rank:
                    best_rank = rank
                    best_space = key

            if best_rank < 4 and s.startswith("O(") and "n" in s:
                if not any(char in s for char in ["^", "*", "!", "V", "log", "√"]):
                    best_rank = 4
                    best_space = "O(n)"
                    
        return best_space
        
    def get_final_badge(self):
        return self.get_final_asymptotic_badge()


def analyze_source_code(source_code):
    start_time = time.perf_counter()
    
    try:
        tree = ast.parse(source_code)
        
        trace_data = {"history": [], "line_hits": {}}
        if AlgoBlocksTracer is not None:
            try:
                tracer = AlgoBlocksTracer()
                trace_data = tracer.execute_and_trace(source_code)
            except Exception as dyn_error:
                pass 
        
        analyzer = ComplexityAnalyzer(source_code, trace_data)
        analyzer.bfs_first_pass(tree)
        analyzer.visit(tree)
        
        results = {
            "status": "success",
            "total": analyzer.get_final_asymptotic_badge(),
            "space_total": analyzer.get_final_space_badge(),
            "lines": analyzer.details,
            "error": None
        }
    except SyntaxError as e:
        results = {
            "status": "error",
            "message": f"SyntaxError: {str(e)}",
            "line": getattr(e, 'lineno', -1)
        }
    except Exception as e:
        results = {
            "status": "error",
            "message": str(e),
            "line": -1
        }
        
    end_time = time.perf_counter()
    results["analysis_time_ms"] = (end_time - start_time) * 1000
    
    return results