# api/analyzer.py
import ast
import re
from collections import deque
from semantic_nlg import SemanticNLGEngine  # <-- NEW IMPORT

class ComplexityAnalyzer(ast.NodeVisitor):
    """
    A Context-Aware Rule-Based Traversal Algorithm.
    Evaluates time and space complexity line-by-line with deep-dive 
    asymptotic reasoning for educational feedback.
    """

    def __init__(self, source_code):
        self.source_lines = source_code.splitlines()
        self.details = []                
        
        # Structural trackers
        self.current_depth = 0           
        self.loop_depth = 0              
        self.log_loop_depth = 0          
        self.sqrt_loop_depth = 0
        self.graph_depth = 0             
        self.in_if_depth = 0
        
        # Peak complexity trackers
        self.max_complexity = 0          
        self.max_poly = 0                
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
        self.in_dead_code = False
        self.in_graph_context = False        
        
        self.has_recursion_in_loop = False  
        self.has_slicing = False            
        self.has_division = False           

        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []

        self.builtin_complexities = {
            'sort': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'uses the Timsort algorithm which involves multiple passes and auxiliary storage'},
            'sorted': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'creates a completely new sorted list while iterating through the original input'},
            'join': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'iterates through every element in the collection to concatenate them into a single string'},
            'split': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'scans the entire string to identify delimiters and allocate new substrings'},
            'list': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'iterates through the iterable to copy elements into a new list structure'},
            'append': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'performs a constant-time operation by adding an element to the end of a pre-allocated array'},
            'insert': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'must shift all subsequent elements in the array to make room for the new entry'},
            'max': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'must perform a linear scan across every element to identify the largest value'},
            'len': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'accesses a pre-stored attribute of the object, requiring no iteration'}
        }
        self.aliases = {}
        
        # Initialize the Dynamic NLG Component
        self.nlg_engine = SemanticNLGEngine(self)

    # --- PASS 1: CALL GRAPH & BFS ---
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
        for func in self.call_graph:
            visited, rec_stack = set(), set()
            if self._has_cycle(func, visited, rec_stack):
                self.custom_functions[func] = "O(2^n)"

    def _has_cycle(self, node, visited, rec_stack):
        if node in rec_stack: return True
        if node in visited: return False
        visited.add(node); rec_stack.add(node)
        for neighbor in self.call_graph.get(node, []):
            if self._has_cycle(neighbor, visited, rec_stack): return True
        rec_stack.remove(node); return False

    # --- UTILITIES ---
    def get_code_snippet(self, node):
        if hasattr(node, 'lineno'):
            return self.source_lines[node.lineno - 1].strip()  
        return "Code Block"  

    def get_color(self, complexity_str):
        if complexity_str == "-": return "#7f8c8d"  
        if "Dead Code" in complexity_str: return "#7f8c8d"  
        if "T(n) =" in complexity_str or "n!" in complexity_str: return "#8e44ad"  
        if "2^n" in complexity_str or "2T(" in complexity_str: return "#9b59b6"  
        if "n^2" in complexity_str or "n^3" in complexity_str: return "#e74c3c"  
        if "V + E" in complexity_str: return "#d35400"
        if "log" in complexity_str: return "#2980b9"  
        if "√n" in complexity_str: return "#16a085"  
        if "O(n)" in complexity_str: return "#e67e22"  
        return "#27ae60"

    def _build_time_str(self, poly, log, sqrt=0, exp=0, graph=0):
        if exp > 0: return "O(2^n)"  
        if graph > 0: return "O(V + E)"
        if poly <= 0 and log <= 0 and sqrt <= 0: return "O(1)"  
        parts = []
        if poly == 1: parts.append("n")
        elif poly > 1: parts.append(f"n^{poly}")  
        if sqrt == 1: parts.append("√n")
        elif sqrt > 1: parts.append(f"(√n)^{sqrt}")  
        if log == 1: parts.append("log n")
        elif log > 1: parts.append(f"log^{log} n")  
        return f"O({' '.join(parts)})" if parts else "O(1)"

    # --- HEURISTICS ---
    def _detect_graph_context(self, node):
        """Heuristic to check if the current function operates within a Graph Traversal domain."""
        graph_keywords = {'visited', 'graph', 'adj', 'adj_list', 'bfs', 'dfs', 'vertex', 'vertices', 'edges', 'queue', 'stack', 'neighbor'}
        if isinstance(node, ast.FunctionDef):
            if any(k in node.name.lower() for k in graph_keywords):
                return True
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id.lower() in graph_keywords:
                return True
        return False

    def _is_graph_while_loop(self, node):
        """Detects iterative Graph Traversal patterns (Queue Pop + Edge Iteration)."""
        if not getattr(self, 'in_graph_context', False): return False
        if not isinstance(node, ast.While): return False
        
        # Checking for common queue/stack operations to identify main traversal loop
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(getattr(child.func, 'attr', ''), str):
                if child.func.attr in ['pop', 'popleft', 'append', 'add', 'remove', 'extend']:
                    return True
        return False

    def _is_constant_loop(self, node):
        if isinstance(node, ast.While):
            if isinstance(node.test, ast.Compare):
                if isinstance(node.test.left, ast.Constant) or any(isinstance(c, ast.Constant) for c in node.test.comparators):
                    return True
        elif isinstance(node, ast.For):
            if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                if all(isinstance(arg, ast.Constant) for arg in node.iter.args): return True
            elif isinstance(node.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant)): return True
        return False

    def _is_log_loop(self, node):
        if not isinstance(node, ast.While): return False
        for child in ast.walk(node):  
            if isinstance(child, (ast.BinOp, ast.AugAssign)):
                op = child.op
                val = child.right if isinstance(child, ast.BinOp) else child.value
                if isinstance(op, (ast.Div, ast.FloorDiv, ast.RShift, ast.Mult, ast.LShift)) and isinstance(val, ast.Constant) and val.value in [1, 2]: return True
        return False  
        
    def _is_sqrt_loop(self, node):
        if not isinstance(node, (ast.While, ast.For)): return False  
        
        # 1. Structural check for standard prime testing (i * i < n)
        if isinstance(node, ast.While):
            test = node.test  
            if isinstance(test, ast.Compare) and isinstance(test.left, ast.BinOp):  
                if isinstance(test.left.op, ast.Mult) and isinstance(test.left.left, ast.Name) and isinstance(test.left.right, ast.Name):
                    if test.left.left.id == test.left.right.id: return True
                elif isinstance(test.left.op, ast.Pow) and isinstance(test.left.right, ast.Constant) and getattr(test.left.right, 'value', 0) == 2: return True
                
        # 2. Variable Dependency check for Block Jump patterns (Jump Search)
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                func_id = getattr(child.func, 'id', '')
                if func_id == 'sqrt': return True
                if isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt': return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "sqrt":
                return True
                
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

    # --- RECORDING ENGINE ---
    def record_line(self, node, time_override=None, space_override=None):
        line_text = self.get_code_snippet(node)
        current_poly, current_log, current_sqrt, current_graph = self.loop_depth, self.log_loop_depth, getattr(self, 'sqrt_loop_depth', 0), getattr(self, 'graph_depth', 0)
        override_poly = override_log = override_sqrt = override_graph = 0
        is_recurrence = False
        
        # 1. ADD THIS: Map the AST node type to a readable operation name
        node_type = type(node).__name__
        op_map = {
            "Assign": "Assignment",
            "AugAssign": "Assignment",
            "For": "For Loop",
            "While": "While Loop",
            "If": "Condition",
            "Return": "Return",
            "FunctionDef": "Definition",
            "Expr": "Expression",
            "Call": "Function Call",
            "ListComp": "List Comprehension"
        }
        operation_name = op_map.get(node_type, node_type)

        if time_override:
            if time_override.startswith("T(") or any(x in time_override for x in ["T(n) =", "n!", "2^n", "2T("]): is_recurrence = True
            else:
                if "n log n" in time_override: override_poly = 1; override_log = 1
                elif "O(V + E)" in time_override: override_graph = 1
                elif "O(log n)" in time_override: override_log = 1
                elif "O(√n)" in time_override: override_sqrt = 1
                elif "O(n)" in time_override: override_poly = 1

        total_poly, total_log, total_sqrt, total_graph = current_poly + override_poly, current_log + override_log, current_sqrt + override_sqrt, current_graph + override_graph
        is_dead = getattr(self, 'in_dead_code', False) or time_override == "Dead Code"
        display_poly, display_log, display_sqrt, display_graph = override_poly, override_log, override_sqrt, override_graph
        
        if not time_override:
            if self._is_exponential_loop(node):
                time_override, is_recurrence, self.max_exp = "O(2^n)", True, 1
            elif isinstance(node, ast.For): display_poly = 0 if self._is_constant_loop(node) else 1
            elif isinstance(node, ast.While):
                if self._is_constant_loop(node): display_poly = 0
                elif getattr(self, 'in_graph_context', False) and self._is_graph_while_loop(node): display_graph = 1
                elif self._is_log_loop(node): display_log = 1
                elif self._is_sqrt_loop(node): display_sqrt = 1
                else: display_poly = 1

        if time_override == "Definition":
            local_t = global_t = local_s = global_s = "-"
            t_w = 0
        elif is_dead:
            local_t = global_t = local_s = global_s = "Dead Code"
            t_w = -1
        else:
            local_t = self._build_time_str(display_poly, display_log, display_sqrt, 0, display_graph)
            if time_override and is_recurrence:
                local_t = global_t = time_override
                t_w = 1000 
            else:
                if time_override: local_t = time_override
                global_t = self._build_time_str(total_poly, total_log, total_sqrt, self.max_exp, total_graph)
                t_w = total_poly * 10 + total_sqrt * 7 + total_log * 5 + total_graph * 12 + (100 if self.max_exp > 0 else 0)
            
            local_s = space_override if space_override else "O(1)"
            
            if getattr(self, 'in_graph_context', False) or "V" in local_s or total_graph > 0:
                global_s = "O(V)"
            elif "n" in local_s or self.recursive_calls_count > 0 or getattr(self, 'max_space_weight', 0) > 0:
                global_s = "O(n)"
            else:
                global_s = local_s

        # DYNAMIC NLG DELEGATION
        time_exp, space_exp = self.nlg_engine.generate_explanations(
            node, local_t, global_t, local_s, global_s, is_dead, line_text
        )

        entry = {
            "lineOfCode": line_text, 
            "operation": operation_name,  # 2. ADD THIS KEY
            "local_time": local_t, 
            "global_time": global_t,
            "local_space": local_s, 
            "global_space": global_s, 
            "indent": self.current_depth,
            "color": self.get_color(global_t), 
            "weight": t_w, 
            "time_explanation": time_exp,
            "space_explanation": space_exp
        }
        
        if self.details and self.details[-1]["lineOfCode"] == line_text:
            if t_w > self.details[-1].get("weight", -1): self.details[-1].update(entry)
        else: self.details.append(entry)

        if not is_dead and time_override != "Definition":
            if t_w > self.max_complexity:
                self.max_complexity = t_w
                if t_w < 998: self.max_poly, self.max_log, self.max_sqrt, self.max_graph_ve = total_poly, total_log, total_sqrt, total_graph
                
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

    # --- NODE HANDLERS ---
    def visit_FunctionDef(self, node):
        start_idx = len(self.details)
        
        prev_data = (self.max_complexity, getattr(self, 'max_space_weight', 0), self.max_poly, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0))
        self.max_complexity = self.max_space_weight = self.max_poly = self.max_log = self.max_sqrt = self.max_exp = self.max_graph_ve = 0
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
        
        # Determine Recurrence Relation Edge Cases
        does_linear_work = self.max_poly > 0 or self.has_slicing
        if not does_linear_work:
            for called in self.call_graph.get(node.name, set()):
                if called in self.symbol_table and called != node.name:
                    for child in ast.walk(self.symbol_table[called]):
                        if isinstance(child, (ast.For, ast.While)):
                            if not self._is_constant_loop(child):
                                does_linear_work = True
                                break
                        elif isinstance(child, ast.ListComp):
                            does_linear_work = True
                            break
                        elif isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Slice):
                            does_linear_work = True
                            break
                    if does_linear_work:
                        break

        # Assign Recurrence Matrix
        if self.has_recursion_in_loop: 
            if self.in_graph_context: relation = "O(V + E)"
            else: relation = "T(n) = n * T(n-1) + O(1)" # O(n!)
        elif self.recursive_calls_count >= 2: 
            if self.has_division:
                if does_linear_work: relation = "T(n) = 2T(n/2) + O(n)"
                else: relation = "T(n) = 2T(n/2) + O(1)"
            else:
                if does_linear_work: relation = "T(n) = T(n-1) + O(n)"
                else: relation = "T(n) = T(n-1) + T(n-2) + O(1)" # O(2^n)
        elif self.recursive_calls_count == 1:
            if self.has_division: 
                if does_linear_work: relation = "T(n) = T(n/2) + O(n)"
                else: relation = "T(n) = T(n/2) + O(1)"
            else: 
                if does_linear_work: relation = "T(n) = T(n-1) + O(n)"
                elif self.max_log > 0: relation = "T(n) = T(n-1) + O(log n)"
                else: relation = "T(n) = T(n-1) + O(1)"
        else: 
            relation = "O(2^n)" if self.max_exp > 0 else self._build_time_str(self.max_poly, self.max_log, self.max_sqrt, 0, self.max_graph_ve)
            
        self.custom_functions[node.name] = relation
        
        for i in range(start_idx, len(self.details)):
            if str(self.details[i]["local_time"]).startswith("T("):
                self.details[i]["local_time"] = relation
            if str(self.details[i]["global_time"]).startswith("T("):
                self.details[i]["global_time"] = relation

        self.custom_space[node.name] = "O(V)" if self.max_graph_ve > 0 else ("O(log n)" if (self.recursive_calls_count == 1 and self.has_division) else ("O(n)" if (self.recursive_calls_count > 0 or self.max_space_weight > 0) else "O(1)"))
        
        if not is_dead:
            self.max_exp = max(prev_data[5], self.max_exp)
            self.max_graph_ve = max(prev_data[6], self.max_graph_ve)
            self.max_complexity, self.max_space_weight = max(prev_data[0], self.max_complexity), max(prev_data[1], self.max_space_weight)
            self.max_poly, self.max_log, self.max_sqrt = max(prev_data[2], self.max_poly), max(prev_data[3], self.max_log), max(prev_data[4], self.max_sqrt)
        else: self.max_complexity, self.max_space_weight, self.max_poly, self.max_log, self.max_sqrt, self.max_exp, self.max_graph_ve = prev_data
        
        # --- FIX: Purge Context Trackers to Prevent Global Scope Leakage ---
        self.current_function_name = None
        self.in_graph_context = False
        self.recursive_calls_count = 0 
        self.has_recursion_in_loop = False
        self.has_slicing = False
        self.has_division = False

    def visit_If(self, node):
        self.record_line(node)
        
        # If an IF statement executes inside a loop, it indicates a data-dependent filter (Partition)
        if self.loop_depth > 0:
            self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
            
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
        # Catch standard Quick Sort logic relying on array comprehensions with conditional filtering
        if any(getattr(comp, 'ifs', []) for comp in node.generators):
            self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.generic_visit(node)

    def visit_For(self, node):
        if self._is_exponential_loop(node):
            self.max_exp = 1
            self.record_line(node, time_override="O(2^n)")
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            return 
        is_const = self._is_constant_loop(node)
        if not is_const: self.loop_depth += 1
        self.record_line(node); self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1  
        if not is_const: self.loop_depth -= 1

    def visit_While(self, node):
        is_log, is_sqrt, is_const = self._is_log_loop(node), self._is_sqrt_loop(node), self._is_constant_loop(node)
        is_graph = self._is_graph_while_loop(node)
        
        if is_graph: self.graph_depth = getattr(self, 'graph_depth', 0) + 1
        elif not is_const:
            if is_log: self.log_loop_depth += 1
            elif is_sqrt: self.sqrt_loop_depth += 1
            else: self.loop_depth += 1
            
        self.record_line(node)
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1  
        
        if is_graph: self.graph_depth -= 1
        elif not is_const:
            if is_log: self.log_loop_depth -= 1
            elif is_sqrt: self.sqrt_loop_depth -= 1
            else: self.loop_depth -= 1

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name):
            f_id = self.aliases.get(node.func.id, node.func.id)
            if f_id == self.current_function_name:
                self.recursive_calls_count += 1
                self.first_rec_line = min(self.first_rec_line, getattr(node, 'lineno', float('inf')))
                
                if self.loop_depth > 0 or self.log_loop_depth > 0: self.has_recursion_in_loop = True  
                
                if getattr(self, 'in_graph_context', False):
                    self.record_line(node, time_override="O(V + E)", space_override="O(V)")
                else:
                    self.record_line(node, time_override=self.custom_functions.get(f_id, "T(n-1)"), space_override="O(n)")
            elif f_id in self.builtin_complexities:
                b = self.builtin_complexities[f_id]
                self.record_line(node, time_override=b['time'], space_override=b['space'])
            elif f_id in self.custom_functions:
                call_comp = self.custom_functions[f_id]
                lookup = {
                    "T(n) = n * T(n-1)": "O(n!)", 
                    "T(n) = 2T(n/2) + O(n)": "O(n log n)",
                    "T(n) = 2T(n/2) + O(1)": "O(n)",
                    "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
                    "T(n) = T(n/2) + O(n)": "O(n)",
                    "T(n) = T(n/2) + O(1)": "O(log n)",
                    "T(n) = T(n-1) + O(n)": "O(n^2)",
                    "T(n) = T(n-1) + O(log n)": "O(n log n)",
                    "T(n) = T(n-1) + O(1)": "O(n)",
                    "2T(n/2)": "O(n log n)",
                    "T(n-1) + T(n-2)": "O(2^n)", 
                    "T(n/2) + O(1)": "O(log n)", 
                    "T(n-1) + O(n)": "O(n^2)",
                    "O(n log n)": "O(n log n)",
                    "O(n^2)": "O(n^2)",
                    "O(V + E)": "O(V + E)",
                    "O(2^n)": "O(2^n)",
                    "O(n!)": "O(n!)",
                    "O(n)": "O(n)",
                    "O(log n)": "O(log n)",
                    "O(1)": "O(1)"
                }
                for k, v in lookup.items():
                    if k in call_comp: call_comp = v; break
                self.record_line(node, time_override=call_comp, space_override=self.custom_space.get(f_id, "O(1)"))
            else: self.record_line(node)
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr in self.builtin_complexities:
                b = self.builtin_complexities[node.func.attr]
                self.record_line(node, time_override=b['time'], space_override=b['space'])
            else: self.record_line(node)
        self.generic_visit(node)

    def visit_Assign(self, node):
        s_ov, t_ov = "O(1)", None
        
        # Detect initialization of graph auxiliary structures
        if getattr(self, 'in_graph_context', False):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    if any(k in target.id.lower() for k in ['queue', 'stack', 'visited', 'adj', 'path']):
                        s_ov = "O(V)"

        for child in ast.walk(node.value):
            if isinstance(child, (ast.BinOp, ast.Call)):
                if (isinstance(child, ast.BinOp) and (isinstance(child.op, ast.LShift) or (isinstance(child.op, ast.Pow) and getattr(child.left, 'value', 0) == 2))) or (isinstance(child, ast.Call) and getattr(child.func, 'id', '') == 'pow' and getattr(child.args[0], 'value', 0) == 2):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "exponential"
                        
            # Sqrt variable dependency tracking
            if isinstance(child, ast.Call):
                func_id = getattr(child.func, 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    for target in node.targets:
                        if isinstance(target, ast.Name): 
                            self.variable_complexities[target.id] = "sqrt"

        if isinstance(node.value, ast.Subscript) and isinstance(node.value.slice, ast.Slice): self.has_slicing = True
        self.record_line(node, time_override=t_ov, space_override=s_ov); self.generic_visit(node)

    def visit_AugAssign(self, node): 
        # Sqrt tracking for aug updates (e.g. step += math.sqrt(n))
        for child in ast.walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(child.func, 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    if isinstance(node.target, ast.Name): 
                        self.variable_complexities[node.target.id] = "sqrt"
        
        self.record_line(node); self.generic_visit(node)  

    def visit_Subscript(self, node):
        if isinstance(node.slice, ast.Slice): self.has_slicing = True  
        self.generic_visit(node)  

    def visit_BinOp(self, node):
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.RShift)): 
            self.has_division = True  
        elif isinstance(node.op, ast.Mult):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, float) and node.right.value < 1.0:
                self.has_division = True
            elif isinstance(node.left, ast.Constant) and isinstance(node.left.value, float) and node.left.value < 1.0:
                self.has_division = True
        self.generic_visit(node)  

    def visit_Return(self, node): self.record_line(node); self.generic_visit(node)  
    def visit_Expr(self, node): self.record_line(node); self.generic_visit(node)      

    # --- MAXIMUM RANK EVALUATION BADGES ---
    def get_final_badge(self):
        # Scan entire tree for mathematically heaviest operation (Prevents trailing O(1) overrides)
        best_comp = "O(1)"
        best_rank = 1
        
        rankings = {
            "O(n!)": 9, "T(n) = n * T(n-1)": 9,
            "O(2^n)": 8, "T(n) = T(n-1) + T(n-2) + O(1)": 8,
            "O(n^3)": 7,
            "O(n^2)": 6, "T(n) = T(n-1) + O(n)": 6,
            "O(n log n)": 5, "T(n) = 2T(n/2) + O(n)": 5, "T(n) = T(n-1) + O(log n)": 5,
            "O(V + E)": 4.5,
            "O(n)": 4, "T(n) = 2T(n/2) + O(1)": 4, "T(n) = T(n/2) + O(n)": 4, "T(n) = T(n-1) + O(1)": 4,
            "O(√n)": 3,
            "O(log n)": 2, "T(n) = T(n/2) + O(1)": 2,
            "O(1)": 1
        }
        
        for line in self.details:
            comp = str(line.get('global_time', ''))
            for key, rank in rankings.items():
                if key in comp and rank > best_rank:
                    best_rank = rank
                    best_comp = comp 
                    
        return best_comp

    def get_final_asymptotic_badge(self):
        lookup = {
            "T(n) = n * T(n-1)": ("O(n!)", 9),
            "O(n!)": ("O(n!)", 9),
            "T(n) = T(n-1) + T(n-2) + O(1)": ("O(2^n)", 8),
            "O(2^n)": ("O(2^n)", 8),
            "O(n^3)": ("O(n^3)", 7),
            "T(n) = T(n-1) + O(n)": ("O(n^2)", 6),
            "O(n^2)": ("O(n^2)", 6),
            "T(n) = 2T(n/2) + O(n)": ("O(n log n)", 5),
            "T(n) = T(n-1) + O(log n)": ("O(n log n)", 5),
            "O(n log n)": ("O(n log n)", 5),
            "O(V + E)": ("O(V + E)", 4.5),
            "T(n) = 2T(n/2) + O(1)": ("O(n)", 4),
            "T(n) = T(n/2) + O(n)": ("O(n)", 4),
            "T(n) = T(n-1) + O(1)": ("O(n)", 4),
            "O(n)": ("O(n)", 4),
            "O(√n)": ("O(√n)", 3),
            "T(n) = T(n/2) + O(1)": ("O(log n)", 2),
            "O(log n)": ("O(log n)", 2),
            "O(1)": ("O(1)", 1)
        }
        best_comp = "O(1)"
        best_rank = 1
        
        for line in self.details:
            for c in [str(line.get('global_time', '')), str(line.get('local_time', ''))]:
                for key, (mapped, rank) in lookup.items():
                    if key in c and rank > best_rank:
                        best_rank = rank
                        best_comp = mapped

        built_fallback = self._build_time_str(self.max_poly, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0))
        for key, (mapped, rank) in lookup.items():
            if key in built_fallback and rank > best_rank:
                best_rank = rank
                best_comp = mapped
                
        return best_comp

    def get_final_space_badge(self):
        # FIX: Elevated O(V + E) and O(V) to outrank standard O(n) explicitly
        rankings = {
            "O(n!)": 7, 
            "O(2^n)": 6, 
            "O(n^2)": 5, 
            "O(n log n)": 4, 
            "O(V + E)": 3.5, 
            "O(V)": 3.2,
            "O(n)": 3, 
            "O(log n)": 2, 
            "O(1)": 1
        }
        
        best_space = "O(1)"
        best_rank = 1
        
        for line in self.details:
            s = str(line.get('global_space', 'O(1)'))
            for key, rank in rankings.items():
                if key in s and rank > best_rank:
                    best_rank = rank
                    best_space = key
                    
        return best_space