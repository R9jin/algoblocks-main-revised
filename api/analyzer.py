# frontend/public/python_engine/analyzer.py
import ast
import time
from collections import deque, Counter
from semantic_nlg import SemanticNLGEngine
from dynamic_tracer import AlgoBlocksTracer  

class ComplexityAnalyzer(ast.NodeVisitor):
    """
    A Context-Aware, Multi-Pass Rule-Based AST Traversal Algorithm.
    Evaluates time and space complexity line-by-line.
    Upgraded to ingest Dynamic Tracer telemetry to confirm real-time operations.
    """

    def __init__(self, source_code, trace_data=None):
        self.source_lines = source_code.splitlines()
        self.trace_data = trace_data or {"history": [], "line_hits": {}}
        self._details = []                
        self._bottlenecks_applied = False
        
        # Structural trackers
        self.current_depth = 0           
        self.loop_depth = 0
        self.log_loop_depth = 0          
        self.sqrt_loop_depth = 0
        self.graph_depth = 0             
        self.in_if_depth = 0
        
        # Advanced Symbolic Multiple Variable Tracking
        self.var_dimensions = {} 
        self.available_dims = ['n', 'm', 'k', 'p', 'q']
        self.active_poly_dims = [] 
        
        # Peak complexity trackers
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
        self.has_division = False           

        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.logic_hints = {} 

        self.builtin_complexities = {
            'sort': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'uses the Timsort algorithm which involves multiple passes and auxiliary storage'},
            'sorted': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'creates a completely new sorted list while iterating through the original input'},
            'join': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'iterates through every element in the collection to concatenate them into a single string'},
            'split': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'scans the entire string to identify delimiters and allocate new substrings'},
            'list': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'iterates through the iterable to copy elements into a new list structure'},
            'append': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'performs a constant-time operation by appending to a pre-allocated sequence'},
            'insert': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'must shift all subsequent elements in the array to make room for the new entry'},
            'max': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'must perform a linear scan across every element to identify the largest value'},
            'len': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'accesses a pre-stored attribute of the object, requiring no iteration'},
            'matmul': {'time': 'O(n^3)', 'space': 'O(n^2)', 'desc': 'performs matrix multiplication which mathematically scales cubically with dimensions'},
            'dot': {'time': 'O(n^3)', 'space': 'O(n^2)', 'desc': 'calculates the dot product of multi-dimensional arrays, dominating execution time'},
            'input': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'reads a sequence of characters from standard input sequentially and allocates a new string object'}
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
        
        excluded_complexities = ["O(1)", "O(log n)", "O(√n)", "O(n)", "O(n + m)", "O(m)", "-", ""]
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
                if "🌟 **HIGHLY OPTIMIZED:**" not in d.get('time_explanation', '') and "🌟 **EFFICIENT SCALING:**" not in d.get('time_explanation', '') and "🌟 **ALGORITHM MASTERY:**" not in d.get('time_explanation', ''):
                    d['time_explanation'] = str(d.get('time_explanation', '')) + praise
                    
    def add_logic_hint(self, node, hint):
        lineno = getattr(node, 'lineno', -1)
        if lineno != -1:
            if lineno not in self.logic_hints: self.logic_hints[lineno] = []
            if hint not in self.logic_hints[lineno]: self.logic_hints[lineno].append(hint)

    def _get_iterable_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'range':
            if len(node.args) > 0:
                arg = node.args[0]
                if isinstance(arg, ast.Name): return arg.id
                if isinstance(arg, ast.Call) and getattr(arg.func, 'id', '') == 'len' and len(arg.args) > 0 and isinstance(arg.args[0], ast.Name): return arg.args[0].id
        return None

    def _build_time_str(self, poly_dims, log, sqrt=0, exp=0, graph=0):
        if exp > 0: return "O(2^n)"  
        if graph > 0: return "O(V + E)"
        if not poly_dims and log <= 0 and sqrt <= 0: return "O(1)"  
        
        parts = []
        if poly_dims:
            counts = Counter(poly_dims)
            terms = []
            for dim, count in counts.items():
                display_dim = dim if len(dim) <= 2 and dim.isalpha() else 'n'
                if count == 1: terms.append(display_dim)
                else: terms.append(f"{display_dim}^{count}")
            parts.append(" * ".join(terms))
                
        if sqrt == 1: parts.append("√n")
        elif sqrt > 1: parts.append(f"(√n)^{sqrt}")  
        if log == 1: parts.append("log n")
        elif log > 1: parts.append(f"log^{log} n")  
        
        return f"O({' * '.join(parts)})" if parts else "O(1)"

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
        if "T(" in complexity_str or "n!" in complexity_str: return "#8e44ad"  
        if "2^n" in complexity_str: return "#9b59b6"  
        if "^2" in complexity_str or "^3" in complexity_str or "*" in complexity_str: return "#e74c3c"  
        if "V + E" in complexity_str or "V" in complexity_str: return "#d35400"
        if "log" in complexity_str: return "#2980b9"  
        if "√" in complexity_str: return "#16a085"  
        if complexity_str != "O(1)": return "#e67e22"  
        return "#27ae60"

    def _detect_graph_context(self, node):
        has_queue_while = has_neighbor_for = has_recursive_for = has_visited_set = False
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
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr in ['add', 'append'] and isinstance(getattr(child.func, 'value', None), ast.Name) and 'visit' in child.func.value.id.lower(): has_visited_set = True
        return (has_queue_while and (has_neighbor_for or has_visited_set)) or (has_recursive_for and (has_neighbor_for or has_visited_set))

    def _is_graph_while_loop(self, node):
        if not getattr(self, 'in_graph_context', False): return False
        if not isinstance(node, ast.While): return False
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ['pop', 'popleft', 'append', 'add', 'remove', 'extend']: return True
        return False

    def _is_constant_loop(self, node):
        if isinstance(node, ast.While) and isinstance(node.test, ast.Compare):
            if isinstance(node.test.left, ast.Constant) or any(isinstance(c, ast.Constant) for c in node.test.comparators): return True
        elif isinstance(node, ast.For):
            if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                if all(isinstance(arg, ast.Constant) for arg in node.iter.args): return True
            elif isinstance(node.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant)): return True
        return False

    def _is_log_loop(self, node):
        if not isinstance(node, ast.While): return False
        for child in ast.walk(node):  
            if isinstance(child, (ast.BinOp, ast.AugAssign)):
                op = child.op; val = child.right if isinstance(child, ast.BinOp) else child.value
                if isinstance(op, (ast.Div, ast.FloorDiv, ast.RShift, ast.Mult, ast.LShift)) and isinstance(val, ast.Constant) and val.value in [1, 2]: return True
        return False  
        
    def _is_sqrt_loop(self, node):
        if not isinstance(node, (ast.While, ast.For)): return False  
        if isinstance(node, ast.While):
            if isinstance(node.test, ast.Compare) and isinstance(node.test.left, ast.BinOp):  
                if isinstance(node.test.left.op, ast.Mult) and isinstance(node.test.left.left, ast.Name) and isinstance(node.test.left.right, ast.Name):
                    if node.test.left.left.id == node.test.left.right.id: return True
                elif isinstance(node.test.left.op, ast.Pow) and isinstance(node.test.left.right, ast.Constant) and getattr(node.test.left.right, 'value', 0) == 2: return True
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                if getattr(child.func, 'id', '') == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'): return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "sqrt": return True
        return False
    
    def _is_exponential_loop(self, node):
        if not isinstance(node, (ast.For, ast.While)): return False
        expr = node.iter if isinstance(node, ast.For) else node.test
        for child in ast.walk(expr):
            if isinstance(child, ast.BinOp):
                if isinstance(child.op, ast.LShift): return True
                if isinstance(child.op, ast.Pow) and isinstance(child.left, ast.Constant) and child.left.value == 2: return True
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == 'pow':
                if len(child.args) >= 2 and isinstance(child.args[0], ast.Constant) and child.args[0].value == 2: return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "exponential": return True
        return False

    def record_line(self, node, time_override=None, space_override=None, custom_op=None):
        line_text = self.get_code_snippet(node)
        line_num = getattr(node, 'lineno', -1) 
        current_log, current_sqrt, current_graph = self.log_loop_depth, getattr(self, 'sqrt_loop_depth', 0), getattr(self, 'graph_depth', 0)
        
        override_dims, override_log, override_sqrt, override_graph = [], 0, 0, 0
        is_recurrence = False
        
        node_type = type(node).__name__
        op_map = {
            "Assign": "Assignment", "AugAssign": "Assignment", "For": "For Loop", 
            "While": "While Loop", "If": "Condition", "Return": "Return", 
            "FunctionDef": "Definition", "Expr": "Expression", "Call": "Function Call", 
            "ListComp": "List Comprehension", "DictComp": "Dict Comprehension", "SetComp": "Set Comprehension",
            "Lambda": "Lambda Function", "Yield": "Generator Yield", "YieldFrom": "Generator Yield",
            "Try": "Try-Except Block", "With": "Context Manager"
        }
        operation_name = custom_op or op_map.get(node_type, node_type)

        if time_override:
            if time_override.startswith("T(") or any(x in time_override for x in ["T(n) =", "n!", "2^n", "2T("]): is_recurrence = True
            else:
                if "n log n" in time_override: override_dims.append('n'); override_log = 1
                elif "O(V + E)" in time_override: override_graph = 1
                elif "O(log n)" in time_override: override_log = 1
                elif "O(√n)" in time_override: override_sqrt = 1
                elif "O(n)" in time_override: override_dims.append('n')

        total_poly_dims = self.active_poly_dims + override_dims
        total_log, total_sqrt, total_graph = current_log + override_log, current_sqrt + override_sqrt, current_graph + override_graph
        is_dead = getattr(self, 'in_dead_code', False) or time_override == "Dead Code"
        
        display_dims, display_log, display_sqrt, display_graph = override_dims, override_log, override_sqrt, override_graph
        
        if not time_override:
            if self._is_exponential_loop(node):
                time_override, is_recurrence, self.max_exp = "O(2^n)", True, 1
            elif isinstance(node, ast.For):
                if not self._is_constant_loop(node):
                    iter_name = self._get_iterable_name(node.iter)
                    dim = iter_name if iter_name and len(iter_name) <= 2 and iter_name.isalpha() else 'n'
                    display_dims = [dim]
            elif isinstance(node, ast.While):
                if getattr(self, 'in_graph_context', False) and self._is_graph_while_loop(node): display_graph = 1
                elif self._is_log_loop(node): display_log = 1
                elif self._is_sqrt_loop(node): display_sqrt = 1
                elif not self._is_constant_loop(node): 
                    dim = 'n'
                    if isinstance(node.test, ast.Compare):
                        for comp in [node.test.left] + node.test.comparators:
                            if isinstance(comp, ast.Name) and len(comp.id) <= 2 and comp.id.isalpha() and comp.id not in ['i','j','k','x','y']:
                                dim = comp.id
                                break
                    elif isinstance(node.test, ast.BoolOp):
                        for val in node.test.values:
                            if isinstance(val, ast.Compare):
                                for comp in [val.left] + val.comparators:
                                    if isinstance(comp, ast.Name) and len(comp.id) <= 2 and comp.id.isalpha() and comp.id not in ['i','j','k','x','y']:
                                        dim = comp.id
                                        break
                    display_dims = [dim]

        if time_override == "Definition":
            local_t = global_t = local_s = global_s = "O(1)"
            t_w = 0
        elif is_dead:
            local_t = global_t = local_s = global_s = "Dead Code"
            t_w = -1
        else:
            local_t = self._build_time_str(display_dims, display_log, display_sqrt, 0, display_graph)
            if time_override and is_recurrence:
                local_t = global_t = time_override
                t_w = 1000 
            else:
                if time_override: local_t = time_override
                global_t = self._build_time_str(total_poly_dims, total_log, total_sqrt, self.max_exp, total_graph)
                t_w = self._get_weight(total_poly_dims, total_log, total_sqrt, self.max_exp, total_graph)
            
            local_s = space_override if space_override else "O(1)"
            
            if "V" in local_s or total_graph > 0: self.max_space_weight = max(getattr(self, 'max_space_weight', 0), 2)
            elif "n" in local_s or self.recursive_calls_count > 0: self.max_space_weight = max(getattr(self, 'max_space_weight', 0), 1)
                
            if getattr(self, 'in_graph_context', False) or self.max_space_weight >= 2: global_s = "O(V)"
            elif self.max_space_weight >= 1: global_s = "O(n)"
            else: global_s = local_s

        # DYNAMIC TELEMETRY FETCH
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
            if t_w > self._details[-1].get("weight", -1): self._details[-1].update(entry)
        else: self._details.append(entry)

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

    # --- ADVANCED NODE HANDLERS ---
    
    def visit_Try(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1

    def visit_With(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1

    def visit_Lambda(self, node):
        self.record_line(node, time_override="Definition", space_override="O(1)")
        self.generic_visit(node)

    def visit_Yield(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)")
        self.generic_visit(node)

    def visit_YieldFrom(self, node):
        self.record_line(node, time_override="O(n)", space_override="O(1)")
        self.generic_visit(node)

    def visit_GeneratorExp(self, node):
        self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Generator Expression")
        self.generic_visit(node)

    def visit_Compare(self, node):
        if any(isinstance(op, ast.LtE) for op in node.ops):
            for comp in node.comparators:
                if isinstance(comp, ast.Call) and getattr(getattr(comp, 'func', None), 'id', '') == 'len':
                    self.add_logic_hint(node, "⚠️ Logic Risk (Off-By-One): Using '<=' with 'len()' often causes an IndexError because arrays are 0-indexed. Consider using '<' instead.")
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        is_memoized = False
        for dec in getattr(node, 'decorator_list', []):
            if isinstance(dec, ast.Name) and dec.id in ['lru_cache', 'cache', 'memoize']: is_memoized = True
            elif isinstance(dec, ast.Call) and getattr(dec.func, 'id', '') in ['lru_cache', 'cache']: is_memoized = True
        
        for child in ast.walk(node):
            if isinstance(child, ast.Compare) and any(isinstance(op, ast.In) for op in child.ops):
                for comp in child.comparators:
                    if isinstance(comp, ast.Name) and any(kw in comp.id.lower() for kw in ['memo', 'cache', 'dp']):
                        is_memoized = True
                        break

        if is_memoized: self.memoized_funcs.add(node.name)

        start_idx = len(self._details)
        prev_data = (self.max_complexity, getattr(self, 'max_space_weight', 0), self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0))
        self.max_complexity = self.max_space_weight = self.max_log = self.max_sqrt = self.max_exp = self.max_graph_ve = 0
        self.max_poly_str = "O(1)"
        self.current_function_name, self.recursive_calls_count = node.name, 0
        self.has_recursion_in_loop = self.has_slicing = self.has_division = False
        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.in_if_depth = 0
        self.in_graph_context = self._detect_graph_context(node)
        
        is_dead = node.name not in self.reachable_funcs
        self.record_line(node, time_override="Dead Code" if is_dead else "Definition")
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

        if is_memoized and (self.recursive_calls_count > 0 or is_indirect):
            relation = "O(n)" 
            self.custom_space[node.name] = "O(n)" 
        else:
            if is_indirect:
                relation = "T(n) = T(n-1) + T(n-2) + O(1)" 
                self.custom_space[node.name] = "O(n)"
            elif self.has_recursion_in_loop: 
                relation = "O(V + E)" if self.in_graph_context else "T(n) = n * T(n-1) + O(1)" 
            elif self.recursive_calls_count >= 2: 
                relation = "T(n) = 2T(n/2) + O(n)" if self.has_division and does_linear_work else ("T(n) = 2T(n/2) + O(1)" if self.has_division else ("T(n) = T(n-1) + O(n)" if does_linear_work else "T(n) = T(n-1) + T(n-2) + O(1)"))
            elif self.recursive_calls_count == 1:
                relation = "T(n) = T(n/2) + O(n)" if self.has_division and does_linear_work else ("T(n) = T(n/2) + O(1)" if self.has_division else ("T(n) = T(n-1) + O(n)" if does_linear_work else ("T(n) = T(n-1) + O(log n)" if self.max_log > 0 else "T(n) = T(n-1) + O(1)")))
            else: 
                relation = "O(2^n)" if self.max_exp > 0 else (self.max_poly_str if self.max_poly_str != "O(1)" else self._build_time_str([], self.max_log, self.max_sqrt, 0, self.max_graph_ve))
            
            if not is_indirect:
                self.custom_space[node.name] = "O(V)" if self.max_graph_ve > 0 else ("O(log n)" if (self.recursive_calls_count == 1 and self.has_division) else ("O(n)" if (self.recursive_calls_count > 0 or self.max_space_weight > 0) else "O(1)"))
            
        self.custom_functions[node.name] = relation

        for i in range(start_idx, len(self._details)):
            is_placeholder = False
            if str(self._details[i]["local_time"]).startswith("T("): 
                self._details[i]["local_time"] = relation
                is_placeholder = True
            if str(self._details[i]["global_time"]).startswith("T("): 
                self._details[i]["global_time"] = relation
                is_placeholder = True
                
            if is_placeholder and "T(placeholder)" in str(self._details[i].get("time_explanation", "")):
                formatted_rel = self.nlg_engine._format_recurrence_relation(relation)
                self._details[i]["time_explanation"] = self._details[i]["time_explanation"].replace("T(placeholder)", formatted_rel)
        
        if not is_dead:
            self.max_exp, self.max_graph_ve = max(prev_data[5], self.max_exp), max(prev_data[6], self.max_graph_ve)
            self.max_complexity, self.max_space_weight = max(prev_data[0], self.max_complexity), max(prev_data[1], self.max_space_weight)
            self.max_poly_str, self.max_log, self.max_sqrt = prev_data[2] if prev_data[2] != "O(1)" else self.max_poly_str, max(prev_data[3], self.max_log), max(prev_data[4], self.max_sqrt)
        else: self.max_complexity, self.max_space_weight, self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, self.max_graph_ve = prev_data
        
        self.current_function_name = None; self.in_graph_context = False; self.recursive_calls_count = 0 
        self.has_recursion_in_loop = self.has_slicing = self.has_division = False

    def visit_If(self, node):
        self.record_line(node)
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
        if any(getattr(comp, 'ifs', []) for comp in node.generators): self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.generic_visit(node)

    def visit_For(self, node):
        iter_name = self._get_iterable_name(node.iter)
        dim = 'n'
        if iter_name:
            dim = iter_name
            if dim.lower() in ['arr', 'array', 'list', 'nums', 'items', 'string', 's', 'left', 'right', 'mid'] or len(dim) > 2 or not dim.isalpha(): 
                dim = 'n'
            
        if self._is_exponential_loop(node):
            self.max_exp = 1; self.record_line(node, time_override="O(2^n)")
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            return 
            
        is_const = self._is_constant_loop(node)
        if not is_const: 
            self.active_poly_dims.append(dim)
            
        self.record_line(node); self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1  
        
        if not is_const: self.active_poly_dims.pop()

    def visit_While(self, node):
        is_log, is_sqrt, is_const = self._is_log_loop(node), self._is_sqrt_loop(node), self._is_constant_loop(node)
        is_graph = self._is_graph_while_loop(node)
        
        dim = 'n'
        if isinstance(node.test, ast.Compare):
            for comp in [node.test.left] + node.test.comparators:
                if isinstance(comp, ast.Name) and len(comp.id) <= 2 and comp.id.isalpha() and comp.id not in ['i','j','k','x','y']:
                    dim = comp.id
                    break
        elif isinstance(node.test, ast.BoolOp):
            for val in node.test.values:
                if isinstance(val, ast.Compare):
                    for comp in [val.left] + val.comparators:
                        if isinstance(comp, ast.Name) and len(comp.id) <= 2 and comp.id.isalpha() and comp.id not in ['i','j','k','x','y']:
                            dim = comp.id
                            break

        if is_graph: self.graph_depth = getattr(self, 'graph_depth', 0) + 1
        elif not is_const:
            if is_log: self.log_loop_depth += 1
            elif is_sqrt: self.sqrt_loop_depth += 1
            else: 
                self.active_poly_dims.append(dim)
            
        self.record_line(node)
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1  
        
        if is_graph: self.graph_depth -= 1
        elif not is_const:
            if is_log: self.log_loop_depth -= 1
            elif is_sqrt: self.sqrt_loop_depth -= 1
            else: self.active_poly_dims.pop()

    def visit_Call(self, node):
        if getattr(getattr(node, 'func', None), 'attr', '') == 'append' or getattr(node.func, 'id', '') == 'append':
            self.add_logic_hint(node, "💡 Logic Hint (Amortized Analysis): The `.append()` operation is generally O(1) constant time, but occasionally triggers an O(n) background array resize sequence when memory capacity is breached.")

        if isinstance(node.func, ast.Name):
            f_id = self.aliases.get(node.func.id, node.func.id)
            is_indirect_call = f_id in self.indirect_recursive_funcs and self.current_function_name in self.indirect_recursive_funcs
            
            if f_id == self.current_function_name or is_indirect_call:
                self.recursive_calls_count += 1
                self.first_rec_line = min(self.first_rec_line, getattr(node, 'lineno', float('inf')))
                if len(self.active_poly_dims) > 0 or self.log_loop_depth > 0: self.has_recursion_in_loop = True  
                if getattr(self, 'in_graph_context', False): 
                    self.record_line(node, time_override="O(V + E)", space_override="O(V)", custom_op="Recursive Call")
                else: 
                    self.record_line(node, time_override="T(placeholder)", space_override="O(n)", custom_op="Recursive Call")
            elif f_id in self.builtin_complexities:
                b = self.builtin_complexities[f_id]; self.record_line(node, time_override=b['time'], space_override=b['space'])
            elif f_id in self.custom_functions:
                call_comp = self.custom_functions[f_id]
                lookup = {
                    "T(n) = n * T(n-1)": "O(n!)", "T(n) = 2T(n/2) + O(n)": "O(n log n)",
                    "T(n) = 2T(n/2) + O(1)": "O(n)", "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
                    "T(n) = T(n/2) + O(n)": "O(n)", "T(n) = T(n/2) + O(1)": "O(log n)",
                    "T(n) = T(n-1) + O(n)": "O(n^2)", "T(n) = T(n-1) + O(log n)": "O(n log n)",
                    "T(n) = T(n-1) + O(1)": "O(n)", "2T(n/2)": "O(n log n)",
                    "T(n-1) + T(n-2)": "O(2^n)", "T(n/2) + O(1)": "O(log n)", 
                    "T(n-1) + O(n)": "O(n^2)", "O(n log n)": "O(n log n)",
                    "O(n^2)": "O(n^2)", "O(V + E)": "O(V + E)",
                    "O(2^n)": "O(2^n)", "O(n!)": "O(n!)", "O(n)": "O(n)",
                    "O(log n)": "O(log n)", "O(1)": "O(1)"
                }
                for k, v in lookup.items():
                    if k in call_comp: call_comp = v; break
                self.record_line(node, time_override=call_comp, space_override=self.custom_space.get(f_id, "O(1)"))
            else: self.record_line(node)
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr in self.builtin_complexities:
                b = self.builtin_complexities[node.func.attr]; self.record_line(node, time_override=b['time'], space_override=b['space'])
            else: self.record_line(node)
        self.generic_visit(node)

    def visit_Assign(self, node):
        s_ov, t_ov = "O(1)", None
        
        if getattr(self, 'in_graph_context', False):
            if isinstance(node.value, (ast.List, ast.Set, ast.Dict, ast.ListComp, ast.SetComp, ast.DictComp)): s_ov = "O(V)"
            elif isinstance(node.value, ast.Call) and isinstance(getattr(node.value.func, 'id', ''), str) and getattr(node.value.func, 'id', '') in ['set', 'list', 'dict', 'deque']: s_ov = "O(V)"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, ast.List) or isinstance(node.value.right, ast.List)): s_ov = "O(V)"
        else:
            if isinstance(node.value, (ast.ListComp, ast.SetComp, ast.DictComp)): s_ov = "O(n)"
            elif isinstance(node.value, ast.Call) and isinstance(getattr(node.value.func, 'id', ''), str) and getattr(node.value.func, 'id', '') in ['set', 'list', 'dict', 'deque']: s_ov = "O(n)"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, ast.List) or isinstance(node.value.right, ast.List)): s_ov = "O(n)"
            elif isinstance(node.value, ast.Subscript) and isinstance(node.value.slice, ast.Slice): s_ov = "O(n)"

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

        if isinstance(node.value, ast.Subscript) and isinstance(node.value.slice, ast.Slice): self.has_slicing = True
        self.record_line(node, time_override=t_ov, space_override=s_ov); self.generic_visit(node)

    def visit_AugAssign(self, node): 
        if self.loop_depth > 0 and isinstance(node.target, ast.Name) and isinstance(node.value, ast.Subscript):
            self.add_logic_hint(node, "⚠️ Logic Risk (Data-Dependent Traversal): Your loop increment/step depends heavily on dynamic data values (e.g., array contents). Static analysis conservatively defaults to worst-case, but this runtime could radically fluctuate depending on the dataset state!")

        for child in ast.walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    if isinstance(node.target, ast.Name): self.variable_complexities[node.target.id] = "sqrt"
        self.record_line(node); self.generic_visit(node)  

    def visit_Subscript(self, node):
        if isinstance(node.slice, ast.Slice): self.has_slicing = True  
        self.generic_visit(node)  

    def visit_BinOp(self, node):
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.RShift)): self.has_division = True  
        elif isinstance(node.op, ast.Mult):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, float) and node.right.value < 1.0: self.has_division = True
            elif isinstance(node.left, ast.Constant) and isinstance(node.left.value, float) and node.left.value < 1.0: self.has_division = True
        self.generic_visit(node)  

    def visit_Return(self, node): self.record_line(node); self.generic_visit(node)  
    def visit_Expr(self, node): self.record_line(node); self.generic_visit(node)      

    def get_final_asymptotic_badge(self):
        lookup = {
            "T(n) = n * T(n-1)": ("O(n!)", 9), "O(n!)": ("O(n!)", 9),
            "T(n) = T(n-1) + T(n-2) + O(1)": ("O(2^n)", 8), "O(2^n)": ("O(2^n)", 8),
            "O(n^3)": ("O(n^3)", 7),
            "T(n) = T(n-1) + O(n)": ("O(n^2)", 6), "O(n^2)": ("O(n^2)", 6), "O(n * m)": ("O(n * m)", 6),
            "T(n) = 2T(n/2) + O(n)": ("O(n log n)", 5), "T(n) = T(n-1) + O(log n)": ("O(n log n)", 5), "O(n log n)": ("O(n log n)", 5), "n * log n": ("O(n log n)", 5),
            "O(V + E)": ("O(V + E)", 4.5),
            "T(n) = 2T(n/2) + O(1)": ("O(n)", 4), "T(n) = T(n/2) + O(n)": ("O(n)", 4), "T(n) = T(n-1) + O(1)": ("O(n)", 4), "O(n)": ("O(n)", 4), "O(n + m)": ("O(n + m)", 4), "O(m)": ("O(n)", 4),
            "O(√n)": ("O(√n)", 3),
            "T(n) = T(n/2) + O(1)": ("O(log n)", 2), "O(log n)": ("O(log n)", 2),
            "O(1)": ("O(1)", 1)
        }
        best_comp = "O(1)"
        best_rank = 1
        
        for line in self._details:
            for c in [str(line.get('global_time', '')), str(line.get('local_time', ''))]:
                for key, (mapped, rank) in lookup.items():
                    if key in c and rank > best_rank:
                        best_rank = rank
                        best_comp = mapped

                if c.startswith("O(") and c != "O(1)":
                    if "*" in c and "log" not in c and best_rank < 6:
                        best_rank = 6
                        best_comp = "O(n^2)"  
                    elif best_rank < 4 and not any(char in c for char in ["^", "*", "!", "V", "log", "√"]):
                        best_rank = 4
                        best_comp = "O(n)"  
        
        for key, (mapped, rank) in lookup.items():
            if key in self.max_poly_str and rank > best_rank:
                best_rank = rank
                best_comp = mapped
                
        if self.max_poly_str.startswith("O(") and self.max_poly_str != "O(1)":
            if "*" in self.max_poly_str and "log" not in self.max_poly_str and best_rank < 6:
                best_rank = 6
                best_comp = "O(n^2)"
            elif best_rank < 4 and not any(char in self.max_poly_str for char in ["^", "*", "!", "V", "log", "√"]):
                best_rank = 4
                best_comp = "O(n)"
                
        return best_comp

    def get_final_space_badge(self):
        rankings = {
            "O(n!)": 7, "O(2^n)": 6, "O(n^2)": 5, "O(n * m)": 5, "O(n log n)": 4, 
            "O(V + E)": 3.5, "O(V)": 3.2, "O(n)": 3, "O(n + m)": 3, "O(log n)": 2, "O(1)": 1
        }
        
        best_space = "O(1)"
        best_rank = 1
        
        for line in self._details:
            s = str(line.get('global_space', 'O(1)'))
            for key, rank in rankings.items():
                if key in s and rank > best_rank:
                    best_rank = rank
                    best_space = key

            if best_rank < 3 and s.startswith("O(") and s != "O(1)":
                if "*" in s and best_rank < 5:
                    best_rank = 5
                    best_space = "O(n^2)"
                elif not any(char in s for char in ["^", "*", "!", "V", "log", "√"]):
                    best_rank = 3
                    best_space = "O(n)"
                    
        return best_space
        
    def get_final_badge(self):
        return self.get_final_asymptotic_badge()


def analyze_source_code(source_code):
    """
    Wrapper to safely execute the Dynamic Tracer first,
    then feed the runtime telemetry directly into the static ComplexityAnalyzer.
    """
    start_time = time.perf_counter()
    
    try:
        # Parse the source code into an Abstract Syntax Tree (AST)
        tree = ast.parse(source_code)
        
        # 1. RUN DYNAMIC TRACER
        tracer = AlgoBlocksTracer()
        trace_data = tracer.execute_and_trace(source_code)
        
        # 2. RUN STATIC ANALYZER (WITH DYNAMIC CONTEXT INJECTED)
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
        
    # Capture final time and convert to milliseconds
    end_time = time.perf_counter()
    results["analysis_time_ms"] = (end_time - start_time) * 1000
    
    return results