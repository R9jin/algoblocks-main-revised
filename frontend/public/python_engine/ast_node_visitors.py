"""
AST Node Visitors

The ast.NodeVisitor visit_* implementations that perform the actual
dependency-ordered depth-first traversal of each function body,
producing per-line complexity signatures -- the traversal half of the
"Dependency-Ordered Signature Pass (DFS)" stage.
"""
import ast
from code_preprocessor import safe_walk, extract_constant, _name_hints_memo_or_graph, _detect_factorial_branching
import re

try:
    from complexity_explainer import EducationalInsightGenerator as SemanticNLGEngine, ComprehensiveASTVisitor
except ImportError:
    SemanticNLGEngine = None
    ComprehensiveASTVisitor = None


class ASTNodeVisitorsMixin:
    """Mixin providing ast.NodeVisitor visit_* methods to ComplexityAnalyzer."""

    def generic_visit(self, node):
        for field, value in ast.iter_fields(node):
            if isinstance(value, list):
                self._visit_block(value)
            elif isinstance(value, ast.AST): self.visit(value)
    
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
        self.has_global_accumulation = True
        self.record_line(node, time_override="O(1)", space_override="O(1)")
        self.generic_visit(node)

    def visit_YieldFrom(self, node):
        self.has_global_accumulation = True
        self.record_line(node, time_override="O(n)", space_override="O(1)")
        self.generic_visit(node)

    def visit_GeneratorExp(self, node):
        if self.max_poly_str == "O(1)":
            self.max_poly_str = "O(n)"
            self.max_complexity = max(self.max_complexity, 4)
        self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Generator Expression")
        self.generic_visit(node)
        
    def visit_IfExp(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Ternary Conditional")
        self.generic_visit(node)
        
    def visit_JoinedStr(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Interpolation")
        self.generic_visit(node)

    def visit_Compare(self, node):
        if any(isinstance(op, (ast.In, ast.NotIn)) for op in getattr(node, 'ops', [])):
            is_hash_map = False
            is_constant_collection = False

            for comp in getattr(node, 'comparators', []):
                if isinstance(comp, ast.Name):
                    t = self.var_types.get(comp.id)
                    if t in ['set', 'dict']: is_hash_map = True
                    # Whole-token match only -- a raw substring check here
                    # would false-positive on names like "dataset", "subset",
                    # "offset", "reset" (all contain "set"), incorrectly
                    # treating a plain list as a hash-map for complexity
                    # purposes.
                    elif any(t2 in ('memo', 'cache', 'visited', 'visit', 'set', 'map', 'dp', 'seen') for t2 in re.findall(r'[A-Za-z][a-z0-9]*', comp.id.lower())): is_hash_map = True
                elif isinstance(comp, (ast.Set, ast.Dict, ast.SetComp, ast.DictComp)): is_hash_map = True
                elif isinstance(comp, ast.Call) and isinstance(getattr(comp, 'func', None), ast.Name) and comp.func.id in ['set', 'dict', 'defaultdict', 'Counter', 'OrderedDict']: is_hash_map = True
                elif isinstance(comp, ast.Call) and isinstance(getattr(comp, 'func', None), ast.Attribute) and comp.func.attr in ['keys', 'values']: is_hash_map = True
                elif isinstance(comp, (ast.List, ast.Tuple)):
                    all_const = True
                    for elt in getattr(comp, 'elts', []):
                        if not isinstance(elt, (ast.Constant, getattr(ast, 'Name', type(None)))):
                            all_const = False
                            break
                    if all_const:
                        is_constant_collection = True
                # A hardcoded string literal (e.g. `c in "+-*/()"`) has a
                # fixed length independent of input size n, exactly like a
                # constant list/tuple literal -- previously only List/Tuple
                # literals got this treatment, so a fixed-alphabet check
                # like this was wrongly charged O(n) per call.
                elif isinstance(comp, ast.Constant) and isinstance(comp.value, str):
                    is_constant_collection = True

            if is_hash_map:
                # Average-case O(1), matching the standard amortized-analysis
                # convention (the same fix applied to set/dict .add()/.append()
                # below) -- not the pathological worst-case hash-collision
                # bound, which would otherwise compound with any enclosing
                # loop into a spurious O(n^2) for extremely common patterns
                # like `if complement in seen:` inside a single O(n) loop.
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Membership Check (Set/Dict, Average-Case)")
            elif is_constant_collection:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Membership Check (Constant Size)")
            else:
                self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Membership Check (List/Tuple/String)")
            
            self.generic_visit(node)
            return

        if any(isinstance(op, ast.LtE) for op in getattr(node, 'ops', [])):
            for comp in getattr(node, 'comparators', []):
                if isinstance(comp, ast.Call) and getattr(getattr(comp, 'func', None), 'id', '') == 'len':
                    self.add_logic_hint(node, "Logic Risk (Off-By-One): Using '<=' with 'len()' mainly causes an IndexError because arrays are 0-indexed.")
                    
        self.record_line(node, time_override=None, space_override=None)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        is_memoized_or_graph = False
        for dec in getattr(node, 'decorator_list', []):
            if isinstance(dec, ast.Name) and dec.id in ['lru_cache', 'cache', 'memoize']: is_memoized_or_graph = True
            elif isinstance(dec, ast.Call) and getattr(getattr(dec, 'func', None), 'id', '') in ['lru_cache', 'cache']: is_memoized_or_graph = True
        
        for child in safe_walk(node):
            if isinstance(child, ast.Name) and _name_hints_memo_or_graph(child.id):
                is_memoized_or_graph = True

        if is_memoized_or_graph: self.memoized_funcs.add(node.name)
        self.has_factorial_branching = _detect_factorial_branching(node)

        start_idx = len(self._details)
        prev_data = (self.max_complexity, getattr(self, 'max_space_weight', 0), self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0), getattr(self, 'max_fact', 0))
        self.max_complexity = self.max_space_weight = self.max_log = self.max_sqrt = self.max_exp = self.max_graph_ve = self.max_fact = 0
        self.max_poly_str = "O(1)"
        self.function_gcd_vars = None
        
        self.active_poly_dims = [] 
        self.loop_stack = []
        self.loop_stack_targets = []
        self.loop_body_stack = []
        self.loop_depth = 0
        self.in_frequency_summation_depth = 0
        self.current_function_name = node.name
        self.recursive_calls_count = 0
        self.tree_traversal_calls = 0
        
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False
        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.in_if_depth = 0
        self.in_graph_context = self._detect_graph_context(node)
        
        is_dead = node.name not in self.reachable_funcs
        self.record_line(node, time_override="O(1)" if is_dead else "Definition", space_override="O(1)")
        
        # Ensure we capture the exact index to avoid IndexError during update mapping
        found_idx = None
        for i in range(len(self._details)-1, -1, -1):
            if self._details[i]["lineno"] == getattr(node, 'lineno', -1):
                found_idx = i
                break
        if found_idx is not None:
            start_idx = found_idx
        
        prev_dead = self.in_dead_code; self.in_dead_code = is_dead or prev_dead
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
        self.in_dead_code = prev_dead
        
        does_linear_work = self.max_poly_str != "O(1)" or self.has_slicing
        if not does_linear_work:
            for called_info in self.call_graph.get(node.name, []):
                called = called_info['target']
                if called == node.name: continue
                if called in self.custom_functions:
                    called_rel = self.custom_functions[called]
                    if called_rel != "T(n)" and called_rel not in ["O(1)", "O(log n)", "O(sqrt n)"] and ("n" in called_rel or "V" in called_rel):
                        does_linear_work = True
                        break
                if called in self.symbol_table and called != node.name:
                    for child in safe_walk(self.symbol_table[called]):
                        if isinstance(child, (ast.For, ast.While)) and not self._is_constant_loop(child): does_linear_work = True; break
                        elif isinstance(child, ast.ListComp): does_linear_work = True; break
                        elif isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Slice): does_linear_work = True; break
                    if does_linear_work: break

        is_indirect = node.name in self.indirect_recursive_funcs
        is_segment_tree_query = any(k in node.name.lower() for k in ['query', 'rmq', 'find']) and ('st' in node.name.lower() or 'segment' in node.name.lower() or 'tree' in node.name.lower())

        is_2d_memo = False
        for child in safe_walk(node):
            if isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Tuple):
                is_2d_memo = True
            
            if isinstance(child, ast.Assign):
                for t in child.targets:
                    if isinstance(t, ast.Name) and 'mid' in t.id.lower():
                        self.has_partitioning = True
            if isinstance(child, ast.Call):
                func_name = getattr(getattr(child, 'func', None), 'id', '')
                if 'mid' in func_name.lower() or 'half' in func_name.lower():
                    self.has_partitioning = True
                    self.has_division = True

        if is_memoized_or_graph and (self.recursive_calls_count > 0 or self.has_recursion_in_loop):
            if self.in_graph_context or any(t in ('visit', 'visited', 'visiting', 'visitor') for t in re.findall(r'[A-Za-z][a-z0-9]*', node.name.lower())):
                relation = "O(V + E)"
                self.custom_space[node.name] = "O(V + E)"
            elif is_2d_memo:
                relation = "O(n^2)"
                self.custom_space[node.name] = "O(n^2)"
            else:
                relation = "O(n)"
                self.custom_space[node.name] = "O(n)"
        else:
            if is_segment_tree_query:
                relation = "O(log n)"
            elif is_indirect:
                relation = "T(n) = T(n-1) + O(1)" 
            elif self.has_factorial_branching or (any(k in node.name.lower() for k in ['permutation', 'permute']) and self.recursive_calls_count > 0):
                relation = "T(n) = n * T(n-1)"
            elif self.has_recursion_in_loop: 
                if self.in_graph_context:
                    relation = "O(V + E)"
                else:
                    relation = "O(2^n)" 
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
            elif self.recursive_calls_count >= 2:
                if self.in_graph_context:
                    relation = "O(V + E)"
                else:
                    is_quicksort = False
                    for child in safe_walk(node):
                        if isinstance(child, ast.Name) and any(x in child.id.lower() for x in ['pivot', 'pi']):
                            is_quicksort = True
                            break
                    if not is_quicksort and 'quick' in node.name.lower():
                        is_quicksort = True
                    
                    is_binary_search = any(k in node.name.lower() for k in ['search', 'find', 'pivot', 'query', 'rmq', 'lca', 'floor', 'ceil', 'kth', 'select', 'median', 'bound'])
                    is_tree_trav = self.tree_traversal_calls >= 2 or any(k in node.name.lower() for k in ['order', 'tree', 'bst', 'node', 'path', 'height', 'depth', 'lca', 'sum', 'build', 'construct'])
                    
                    if is_binary_search:
                        if does_linear_work:
                            relation = "T(n) = T(n/2) + O(n)"
                        else:
                            relation = "T(n) = T(n/2) + O(1)"
                    elif is_tree_trav:
                        if does_linear_work:
                            relation = "T(n) = 2T(n/2) + O(n)"
                        else:
                            relation = "T(n) = 2T(n/2) + O(1)"
                    elif is_quicksort:
                        relation = "T(n) = 2T(n/2) + O(n)"
                    elif (self.has_partitioning and not self.has_division):
                        relation = "T(n) = T(n-1) + O(n)"
                    elif (self.has_division or self.has_partitioning) and does_linear_work:
                        relation = "T(n) = 2T(n/2) + O(n)"
                    elif (self.has_division or self.has_partitioning):
                        relation = "T(n) = 2T(n/2) + O(1)"
                    else:
                        relation = "O(2^n)"
            else: 
                relation = "O(n!)" if self.max_fact > 0 else ("O(2^n)" if self.max_exp > 0 else (self.max_poly_str if self.max_poly_str != "O(1)" else self._build_time_str([], self.max_log, self.max_sqrt, 0, self.max_graph_ve)))
            
            if node.name not in self.custom_space:
                if not is_indirect:
                    if self.max_graph_ve > 0 or self.in_graph_context or relation == "O(V + E)": 
                        if self.has_global_accumulation and 'adj' in "\n".join(self.source_lines).lower():
                            self.custom_space[node.name] = "O(V + E)"
                        else:
                            self.custom_space[node.name] = "O(V + E)"
                    elif self.recursive_calls_count > 0:
                        if "O(n^2)" in relation: 
                            self.custom_space[node.name] = "O(n^2)"
                        elif "T(n/2)" in relation or relation == "O(log n)":
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
        if start_idx < len(self._details):
            for i in range(start_idx, len(self._details)):
                is_placeholder = False
                loc_time = str(self._details[i]["local_time"])
                if loc_time == "T(placeholder)" or loc_time.startswith("T("): 
                    current_call_cost = "T(n-1)"
                    if "T(n/2)" in relation or relation == "O(log n)":
                        current_call_cost = "T(n/2)"
                    elif "T(n-1) + T(n-2)" in relation:
                        current_call_cost = "T(n-1)" if call_idx == 0 else "T(n-2)"
                    elif "T(n-1)" in relation:
                        current_call_cost = "T(n-1)"
                    
                    self._details[i]["local_time"] = current_call_cost
                    self._details[i]["global_time"] = current_call_cost 
                    is_placeholder = True
    
                if is_placeholder:
                    call_idx += 1
    
                if str(self._details[i]["local_space"]).startswith("S("):
                    self._details[i]["local_space"] = "O(1)"
                if str(self._details[i]["global_space"]).startswith("S("):
                    self._details[i]["global_space"] = "O(1)" 
                    
                if is_placeholder and "T(placeholder)" in str(self._details[i].get("time_explanation", "")) and SemanticNLGEngine:
                    formatted_rel = self.nlg_engine._format_recurrence_relation(relation)
                    self._details[i]["time_explanation"] = self._details[i]["time_explanation"].replace("T(placeholder)", formatted_rel)

        if self.recursive_calls_count > 0 or self.has_recursion_in_loop or is_indirect or is_segment_tree_query:
            resolved_rel = relation
            for k, v in self.RECURRENCE_RESOLVER.items():
                if k in relation:
                    resolved_rel = v
                    break
            
            heavy_ops = {"Loop", "Array Slicing", "List Comprehension", "Set Comprehension", "Dict Comprehension", "Generator Expression", "Sort", "Sorted", "Deep Copy Allocation", "Row Allocation", "2D Array Allocation", "List Repetition", "Set Operation", "Slice Assignment"}
            
            if start_idx < len(self._details):
                for i in range(start_idx + 1, len(self._details)):
                    loc_t = str(self._details[i]["local_time"])
                    op = self._details[i]["operation"]
                    
                    if op == "Dead Code":
                        self._details[i]["global_time"] = "O(1)"
                        self._details[i]["weight"] = self._get_weight("O(1)")
                        continue
                        
                    is_rec_call = loc_t.startswith("T(") or loc_t == "T(placeholder)" or "Recursive Call" in op
                    is_heavy_op = op in heavy_ops or (loc_t not in ["O(1)", "Definition", "Dead Code"])
                    
                    if is_rec_call or is_heavy_op:
                        self._details[i]["global_time"] = resolved_rel
                        self._details[i]["weight"] = self._get_weight(resolved_rel, False)
                    elif not getattr(self, 'in_graph_context', False):
                        if self._details[i]["global_time"] == "O(1)" and relation not in ["O(1)", "O(log n)"]:
                            if "2T(" in relation or "T(n-1) + T(n-2)" in relation or self.recursive_calls_count >= 2:
                                self._details[i]["global_time"] = "O(n)"
                                self._details[i]["weight"] = self._get_weight("O(n)")

        if start_idx < len(self._details):
            self._details[start_idx]["local_time"] = "O(1)"
            self._details[start_idx]["global_time"] = "O(1)"
            self._details[start_idx]["local_space"] = "O(1)"
            self._details[start_idx]["global_space"] = "O(1)"
            self._details[start_idx]["weight"] = 1
            self._details[start_idx]["time_explanation"] = "Function declaration."
            self._details[start_idx]["space_explanation"] = "O(1) memory overhead."

        if not is_dead:
            self.max_exp, self.max_graph_ve = max(prev_data[5], self.max_exp), max(prev_data[6], self.max_graph_ve)
            self.max_fact = max(prev_data[7] if len(prev_data) > 7 else 0, getattr(self, 'max_fact', 0))
            self.max_complexity, self.max_space_weight = max(prev_data[0], self.max_complexity), max(prev_data[1], self.max_space_weight)
            self.max_poly_str, self.max_log, self.max_sqrt = prev_data[2] if prev_data[2] != "O(1)" else self.max_poly_str, max(prev_data[3], self.max_log), max(prev_data[4], self.max_sqrt)
        else:
            self.max_complexity, self.max_space_weight, self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, self.max_graph_ve = prev_data[:7]
            self.max_fact = prev_data[7] if len(prev_data) > 7 else 0
        
        final_sp_upgrade = None
        if self.max_space_weight >= 2:
            final_sp_upgrade = "O(n^2)"

        if start_idx < len(self._details):
            for i in range(start_idx, len(self._details)):
                if final_sp_upgrade and self._details[i].get("global_space") == "O(n)":
                    self._details[i]["global_space"] = final_sp_upgrade

        self.current_function_name = None; self.in_graph_context = False; self.recursive_calls_count = 0 
        self.tree_traversal_calls = 0
        self.function_gcd_vars = None; self.in_frequency_summation_depth = 0
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False

    def visit_If(self, node):
        is_main_block = False
        if isinstance(node.test, ast.Compare) and getattr(node.test.left, 'id', '') == '__name__':
            if any(extract_constant(c) == '__main__' for c in getattr(node.test, 'comparators', [])):
                is_main_block = True
                
        if is_main_block and len(self.custom_functions) > 0:
            prev_dead = getattr(self, 'in_dead_code', False)
            self.in_dead_code = True
            self.record_line(node, time_override="Dead Code", space_override="O(1)")
            self.current_depth += 1
            self._visit_block(node.body)
            self.current_depth -= 1
            self.in_dead_code = prev_dead
            return
            
        self.record_line(node, time_override=None, space_override=None)
        if hasattr(node, 'test'): self.visit(node.test)
        if len(self.active_poly_dims) > 0: self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.in_if_depth += 1
        
        prev_rec = self.recursive_calls_count
        prev_tree = self.tree_traversal_calls
        
        self.recursive_calls_count = 0
        self.tree_traversal_calls = 0
        self.current_depth += 1
        self._visit_block(node.body)
        self.current_depth -= 1
        if_rec = self.recursive_calls_count
        if_tree = self.tree_traversal_calls
        
        self.recursive_calls_count = 0
        self.tree_traversal_calls = 0
        self.current_depth += 1
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1
        else_rec = self.recursive_calls_count
        else_tree = self.tree_traversal_calls
        
        self.recursive_calls_count = prev_rec + max(if_rec, else_rec)
        self.tree_traversal_calls = prev_tree + max(if_tree, else_tree)
        self.in_if_depth -= 1

    def visit_ListComp(self, node):
        self.has_partitioning = True
        self.in_list_comp_depth = getattr(self, 'in_list_comp_depth', 0) + 1
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        if any(getattr(comp, 'ifs', []) for comp in node.generators): self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        if self.max_poly_str == "O(1)":
            self.max_poly_str = "O(n)"
            self.max_complexity = max(self.max_complexity, 4)
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc
        self.in_list_comp_depth -= 1

    def visit_SetComp(self, node):
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        if self.max_poly_str == "O(1)":
            self.max_poly_str = "O(n)"
            self.max_complexity = max(self.max_complexity, 4)
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_DictComp(self, node):
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = True
        if self.max_poly_str == "O(1)":
            self.max_poly_str = "O(n)"
            self.max_complexity = max(self.max_complexity, 4)
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_For(self, node):
        iter_name = self._get_iterable_name(node.iter)
        dim = self._register_and_get_dim(iter_name)
        target_name = node.target.id if isinstance(node.target, ast.Name) else None
        
        is_const = self._is_constant_loop(node)
        self.loop_stack_targets.append(target_name)
        self.loop_depth += 1
        self.loop_stack.append('1' if is_const else 'n')
            
        if self._is_exponential_loop(node):
            self.max_exp = 1; self.record_line(node, time_override="O(1)", global_time_override="O(2^n)")
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            self.loop_body_stack.pop()
            self.loop_depth -= 1
            self.loop_stack.pop()
            self.loop_stack_targets.pop()
            return 
            
        elif isinstance(node.iter, ast.Call) and getattr(getattr(node.iter, 'func', None), 'attr', '') in ['permutations', 'combinations']:
            self.max_complexity = max(self.max_complexity, 110)
            self.record_line(node, time_override="O(1)", global_time_override="O(2^n)")
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            self.loop_body_stack.pop()
            self.loop_depth -= 1
            self.loop_stack.pop()
            self.loop_stack_targets.pop()
            return
            
        if self._is_amortized_inner_loop(node):
            self.record_line(node, time_override="O(n)", global_time_override="O(n)", space_override="O(1)", custom_op="Amortized Linear Loop (Worst-Case O(n))")
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; self._visit_block(node.body); self.current_depth -= 1
            self.loop_body_stack.pop()
            self.loop_depth -= 1
            self.loop_stack.pop()
            self.loop_stack_targets.pop()
            return

        is_sqrt = self._is_sqrt_loop(node)
        is_frequency_summation = self._is_frequency_summation_loop(node)
        has_log_call = not is_const and self._has_log_call(node)
        
        is_harmonic = False
        if isinstance(node.iter, ast.Call) and getattr(getattr(node.iter, 'func', None), 'id', '') == 'range':
            if len(node.iter.args) > 0 and self._is_exponential_expr(node.iter.args[0]):
                self.max_exp = 1
                self.record_line(node, time_override="O(1)", global_time_override="O(2^n)")
                self.loop_body_stack.append(node.body)
                self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
                self.loop_body_stack.pop()
                self.loop_depth -= 1
                self.loop_stack.pop()
                self.loop_stack_targets.pop()
                return 
            if len(node.iter.args) == 3:
                step = node.iter.args[2]
                if isinstance(step, ast.Name) and step.id in self.loop_stack_targets:
                    is_harmonic = True

        if is_frequency_summation:
            self.in_frequency_summation_depth += 1
            self.record_line(node, time_override="O(1)", global_time_override="O(n)", space_override="O(1)", custom_op="Amortized Frequency Loop")
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; self._visit_block(node.body); self.current_depth -= 1
            self.loop_body_stack.pop()
            self.in_frequency_summation_depth -= 1
            self.loop_depth -= 1
            self.loop_stack.pop()
            self.loop_stack_targets.pop()
            return

        self.record_line(node, time_override=None, space_override=None)
        
        if getattr(self, 'in_graph_context', False) and self._is_graph_for_loop(node):
            if not is_const and dim: 
                self.active_poly_dims.append(dim)
            if has_log_call: self.log_loop_depth += 1
            self.loop_body_stack.append(node.body)
            self.current_depth += 1
            for item in node.body:
                if isinstance(item, ast.If):
                    self.record_line(item, time_override="O(1)", space_override="O(1)")
                    self.current_depth += 1
                    for sub in item.body:
                        self.visit(sub)
                    self.current_depth -= 1
                else:
                    self.visit(item)
            self._visit_block(getattr(node, 'orelse', []))
            self.current_depth -= 1
            self.loop_body_stack.pop()
            if not is_const and dim: 
                self.active_poly_dims.pop()
            if has_log_call: self.log_loop_depth -= 1
            self.loop_depth -= 1
            self.loop_stack.pop()
            self.loop_stack_targets.pop()
            return

        if not is_const: 
            if is_harmonic:
                self.log_loop_depth += 1
                has_log_call = False 
            elif is_sqrt:
                self.sqrt_loop_depth = getattr(self, 'sqrt_loop_depth', 0) + 1
            elif dim:
                self.active_poly_dims.append(dim)
        
        if has_log_call: self.log_loop_depth += 1
        
        self.loop_body_stack.append(node.body)
        self.current_depth += 1
        self._visit_block(node.body)
        
        if not is_const: 
            if is_harmonic:
                self.log_loop_depth -= 1
            elif is_sqrt:
                self.sqrt_loop_depth -= 1
            elif dim:
                self.active_poly_dims.pop()
                
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1
        self.loop_body_stack.pop()
        if has_log_call: self.log_loop_depth -= 1
        self.loop_depth -= 1
        self.loop_stack.pop()
        self.loop_stack_targets.pop()

    def visit_While(self, node):
        is_const = self._is_constant_loop(node)
        self.loop_depth += 1
        self.loop_stack.append('1' if is_const else 'n')
        
        if self._is_amortized_inner_loop(node):
            self.record_line(node, time_override="O(n)", global_time_override="O(n)", space_override="O(1)", custom_op="Amortized Linear Loop (Worst-Case O(n))")
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; self._visit_block(node.body); self.current_depth -= 1
            self.loop_body_stack.pop()
            self.loop_depth -= 1
            self.loop_stack.pop()
            return

        is_log, gcd_v = self._is_log_loop(node)
        is_sqrt = self._is_sqrt_loop(node)
        is_graph = self._is_graph_while_loop(node)
        has_log_call = not is_const and self._has_log_call(node)
        
        if gcd_v: 
            self.active_gcd_vars = gcd_v
            self.function_gcd_vars = gcd_v
            
        if is_graph: 
            self.record_line(node, time_override="O(V + E)", space_override="O(1)")
            self.graph_depth = getattr(self, 'graph_depth', 0) + 1
            if hasattr(node, 'test'): self.visit(node.test)
            if has_log_call: self.log_loop_depth += 1
            self.loop_body_stack.append(node.body)
            self.current_depth += 1; 
            for child in node.body:
                if isinstance(child, ast.Assign) and isinstance(getattr(child.value, 'func', None), ast.Attribute) and child.value.func.attr in ['pop', 'popleft']:
                    self.record_line(child, time_override="O(1)", space_override="O(1)")
                else:
                    self.visit(child)
            self.graph_depth -= 1
            self._visit_block(getattr(node, 'orelse', []))
            self.current_depth -= 1
            self.loop_body_stack.pop()
            if has_log_call: self.log_loop_depth -= 1
            self.loop_depth -= 1
            self.loop_stack.pop()
            return
        
        self.record_line(node, time_override=None, space_override=None)

        if not is_const:
            if is_log: self.log_loop_depth += 1
            elif is_sqrt: self.sqrt_loop_depth += 1
            else: 
                limit_vars = self._get_while_limit_vars(node)
                if limit_vars:
                    dims = [self._register_and_get_dim(lv) for lv in limit_vars if self._register_and_get_dim(lv)]
                    dim = dims[0] if dims else 'n'
                else: dim = 'n'
                self.active_poly_dims.append(dim)
            
        if hasattr(node, 'test'): self.visit(node.test)
        
        if has_log_call: self.log_loop_depth += 1
        
        self.loop_body_stack.append(node.body)
        self.current_depth += 1; 
        self._visit_block(node.body)
        
        if not is_const:
            if is_log: 
                self.log_loop_depth -= 1
                self.active_gcd_vars = None
            elif is_sqrt: self.sqrt_loop_depth -= 1
            else: self.active_poly_dims.pop()
            
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1
        self.loop_body_stack.pop()
        if has_log_call: self.log_loop_depth -= 1
        self.loop_depth -= 1
        self.loop_stack.pop()

    def visit_Call(self, node):
        bare_builtins = {'abs', 'all', 'any', 'bin', 'bool', 'chr', 'dict', 'dir', 'divmod', 'enumerate', 'filter', 'float', 'format', 'hex', 'int', 'len', 'list', 'map', 'max', 'min', 'next', 'oct', 'ord', 'pow', 'print', 'range', 'reversed', 'round', 'set', 'slice', 'sorted', 'str', 'sum', 'tuple', 'type', 'zip'}
        is_accumulating = False
        is_appending_list = False
        
        if isinstance(getattr(node, 'func', None), ast.Attribute) and node.func.attr in ['append', 'extend', 'add', 'insert']:
            is_accumulating = True
            self.has_global_accumulation = True
            if node.func.attr == 'add' and isinstance(getattr(node.func, 'value', None), ast.Name):
                self.var_types[node.func.value.id] = 'set'
            if node.func.attr == 'append' and getattr(node, 'args', []):
                arg = node.args[0]
                if isinstance(arg, ast.Name) and self.var_types.get(arg.id) == 'list': is_appending_list = True
                elif isinstance(arg, ast.ListComp): is_appending_list = True
                elif isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mult) and isinstance(arg.left, ast.List):
                    if not self._is_constant_expr(arg.right): is_appending_list = True
                
        elif isinstance(getattr(node, 'func', None), ast.Name) and node.func.id in ['append', 'extend', 'add', 'insert']:
            is_accumulating = True
            self.has_global_accumulation = True
            
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = prev_acc or is_accumulating
        
        is_local_accumulation = False
        if isinstance(getattr(node, 'func', None), ast.Attribute) and isinstance(getattr(node.func, 'value', None), ast.Name):
            if node.func.value.id in self.var_types:
                is_local_accumulation = True
        elif isinstance(getattr(node, 'func', None), ast.Name):
            is_local_accumulation = True
            
        active_loops = [d for d in self.loop_stack if d != '1']
        
        if is_accumulating and len(active_loops) > 0 and is_local_accumulation:
            if not getattr(self, 'in_graph_context', False):
                if is_appending_list:
                    self.max_space_weight = max(self.max_space_weight, 2)
                else:
                    self.max_space_weight = max(self.max_space_weight, 1)

        if getattr(getattr(node, 'func', None), 'attr', '') == 'append' or getattr(getattr(node, 'func', None), 'id', '') == 'append':
            self.add_logic_hint(node, "Logic Hint (Worst-Case Analysis): While `.append()` is typically O(1) amortized, the worst-case time complexity is O(n) when a background array resize is triggered.")
        
        if getattr(getattr(node, 'func', None), 'attr', '') == 'remove' or getattr(getattr(node, 'func', None), 'id', '') == 'remove':
            self.add_logic_hint(node, "Logic Hint: The `.remove()` operation is O(n) linear time for Lists mainly finding and shifting elements. However, it is mainly O(n) worst-case time for Sets during severe hash collisions.")

        func_node = getattr(node, 'func', None)
        f_id_extracted = getattr(func_node, 'id', getattr(func_node, 'attr', None))
        is_custom = f_id_extracted in self.custom_functions or f_id_extracted == self.current_function_name or f_id_extracted in self.indirect_recursive_funcs

        if is_custom:
            f_id = self.aliases.get(f_id_extracted, f_id_extracted)
            is_indirect_call = f_id in self.indirect_recursive_funcs and self.current_function_name in self.indirect_recursive_funcs
            
            if f_id == self.current_function_name or is_indirect_call:
                if not getattr(self, 'in_dead_code', False):
                    self.recursive_calls_count += 1
                
                if getattr(node, 'args', []):
                    for arg in node.args:
                        if isinstance(arg, ast.Attribute) and arg.attr in ['left', 'right', 'next', 'prev']:
                            self.tree_traversal_calls += 1
                            break

                self.first_rec_line = min(self.first_rec_line, getattr(node, 'lineno', float('inf')))
                if self.loop_depth > 0:
                    self.has_recursion_in_loop = True  

                self.record_line(node, time_override="T(placeholder)", space_override="O(1)", custom_op="Recursive Call", is_recursive_call=True)
            else:
                call_comp = self.custom_functions[f_id]
                self.record_line(node, time_override=call_comp, space_override=self.custom_space.get(f_id, "O(1)"), custom_op="Function Call")

        elif isinstance(func_node, ast.Name):
            f_id = func_node.id
            if f_id == 'set2': f_id = 'set'
            f_id = self.aliases.get(f_id, f_id)
            
            if f_id in self.builtin_complexities and f_id in bare_builtins:
                if f_id in ['set', 'list', 'dict', 'deque', 'tuple', 'defaultdict', 'Counter', 'OrderedDict']:
                    has_args = bool(getattr(node, 'args', []))
                    is_single_arg = False
                    is_constant_init = False
                    if has_args:
                        arg = node.args[0]
                        if isinstance(arg, (ast.List, ast.Tuple, ast.Set)) and len(getattr(arg, 'elts', [])) <= 100:
                            is_constant_init = True
                        elif isinstance(arg, ast.Call) and getattr(getattr(arg, 'func', None), 'id', '') == 'range':
                            if all(self._is_constant_expr(a) for a in arg.args):
                                is_constant_init = True
                        if isinstance(arg, (ast.List, ast.Tuple)) and len(getattr(arg, 'elts', [])) <= 1:
                            is_single_arg = True
                    
                    t_ov = "O(1)" if (not has_args or is_single_arg or is_constant_init) else "O(n)"
                    s_ov = "O(V + E)" if getattr(self, 'in_graph_context', False) else ("O(1)" if (not has_args or is_single_arg or is_constant_init) else "O(n)")
                    self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=f"{f_id.capitalize()} Init")
                elif f_id in ['min', 'max'] and len(getattr(node, 'args', [])) > 1:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op=f"{f_id.capitalize()} (Scalar Comparison)")
                elif f_id in ['int', 'float', 'bool', 'type', 'abs', 'round', 'len', 'str']:
                    b = self.builtin_complexities[f_id]
                    s_ov = "O(V + E)" if getattr(self, 'in_graph_context', False) else b['space']
                    t_ov = "O(1)"
                    if f_id == 'str' and getattr(node, 'args', []):
                        if self._is_linear_type(node.args[0]):
                            t_ov = "O(n)"
                    self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=f_id.capitalize())
                else:
                    b = self.builtin_complexities[f_id]
                    s_ov = "O(V + E)" if getattr(self, 'in_graph_context', False) else b['space']
                    self.record_line(node, time_override=b['time'], space_override=s_ov, custom_op=f_id.capitalize())
            elif f_id == 'print':
                is_linear = any(self._is_linear_type(arg) for arg in getattr(node, 'args', []))
                for arg in getattr(node, 'args', []):
                    if isinstance(arg, ast.JoinedStr) and any(self._is_linear_type(v.value) for v in arg.values if isinstance(v, ast.FormattedValue)):
                        is_linear = True
                
                if is_linear: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Print (Iterable)")
                else: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Print Statement")
            else: self.record_line(node, time_override=None, space_override=None)
            
        elif isinstance(func_node, ast.Attribute):
            if func_node.attr == 'pop':
                is_dict = isinstance(getattr(func_node, 'value', None), ast.Name) and self.var_types.get(func_node.value.id) == 'dict'
                if len(getattr(node, 'args', [])) > 0:
                    if is_dict: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Pop from Dictionary (Worst-Case)")
                    else: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Pop from specific index")
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from end / set")
            elif func_node.attr == 'popleft':
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop Left (Deque)")
            elif func_node.attr == 'remove':
                is_set = isinstance(getattr(func_node, 'value', None), ast.Name) and self.var_types.get(func_node.value.id) == 'set'
                if is_set: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Remove from Set (Worst-Case)")
                else: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Remove from List")
            elif func_node.attr == 'copy':
                curr_f = self.current_function_name or ""
                is_rec = any(c['target'] == curr_f for c in self.call_graph.get(curr_f, []))
                if is_rec or getattr(self, 'in_accumulation_context', False):
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Deep Copy Allocation")
                else:
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Shallow Copy")
            elif func_node.attr == 'append':
                if getattr(self, 'in_graph_context', False):
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Append")
                elif is_appending_list and len(active_loops) > 0 and is_local_accumulation and not getattr(self, 'in_graph_context', False):
                    self.max_space_weight = max(self.max_space_weight, 2)
                    sp_str = "O(n^2)"
                    self.record_line(node, time_override="O(n)", space_override="O(1)", global_space_override=sp_str, custom_op="Append Row")
                    self.generic_visit(node)
                    self.in_accumulation_context = prev_acc
                    return
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Append (Amortized)")
            elif func_node.attr == '__contains__':
                is_hash_map = isinstance(getattr(func_node, 'value', None), ast.Name) and self.var_types.get(func_node.value.id) in ['set', 'dict']
                t_ov = "O(n)" if getattr(self, 'in_graph_context', False) and not is_hash_map else ("O(1)" if is_hash_map else "O(n)")
                self.record_line(node, time_override=t_ov, space_override="O(1)", custom_op="Membership Check")
            elif func_node.attr in ['add', 'insert', 'update', 'clear', 'union', 'intersection', 'difference', 'get', 'keys', 'values', 'items']:
                b = self.builtin_complexities.get(func_node.attr, {'time': 'O(n)', 'space': 'O(1)'})
                self.record_line(node, time_override=b['time'], space_override=b['space'], custom_op=func_node.attr.capitalize())
            elif func_node.attr in self.builtin_complexities:
                b = self.builtin_complexities[func_node.attr]
                self.record_line(node, time_override=b['time'], space_override=b['space'], custom_op=func_node.attr.capitalize())
            else: 
                self.record_line(node, time_override=None, space_override=None)
        
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_Assign(self, node):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Input Unpacking / Swap")
            
            # Properly unpack the types into the ast tuple mapping
            if isinstance(node.value, ast.Tuple):
                for target in node.targets:
                    if isinstance(target, ast.Tuple):
                        for i, elt in enumerate(target.elts):
                            if isinstance(elt, ast.Name) and i < len(node.value.elts):
                                val = node.value.elts[i]
                                if isinstance(val, (ast.List, ast.ListComp)): self.var_types[elt.id] = 'list'
                                elif isinstance(val, (ast.Dict, ast.DictComp)): self.var_types[elt.id] = 'dict'
                                elif isinstance(val, (ast.Set, ast.SetComp)): self.var_types[elt.id] = 'set'
                                elif isinstance(val, ast.Tuple): self.var_types[elt.id] = 'tuple'
                                elif isinstance(val, ast.Constant) and isinstance(val.value, str): self.var_types[elt.id] = 'str'
                                elif isinstance(val, ast.Call) and getattr(getattr(val, 'func', None), 'id', '') in ['set', 'list', 'dict', 'deque', 'tuple', 'defaultdict', 'Counter', 'OrderedDict']:
                                    mapped_type = 'dict' if val.func.id in ['defaultdict', 'Counter', 'OrderedDict'] else val.func.id
                                    self.var_types[elt.id] = mapped_type
            self.generic_visit(node)
            return 
            
        for target in node.targets:
            if isinstance(target, ast.Name):
                if isinstance(node.value, (ast.List, ast.ListComp)): self.var_types[target.id] = 'list'
                elif isinstance(node.value, (ast.Dict, ast.DictComp)): self.var_types[target.id] = 'dict'
                elif isinstance(node.value, (ast.Set, ast.SetComp)): self.var_types[target.id] = 'set'
                elif isinstance(node.value, ast.Tuple): self.var_types[target.id] = 'tuple'
                elif isinstance(node.value, ast.Constant) and isinstance(node.value.value, str): self.var_types[target.id] = 'str'
                elif isinstance(node.value, ast.Call) and getattr(getattr(node.value, 'func', None), 'id', '') in ['set', 'list', 'dict', 'deque', 'tuple', 'defaultdict', 'Counter', 'OrderedDict']:
                    mapped_type = 'dict' if node.value.func.id in ['defaultdict', 'Counter', 'OrderedDict'] else node.value.func.id
                    self.var_types[target.id] = mapped_type

        s_ov, t_ov = "O(1)", "O(1)"
        custom_op = None
        active_loops = [d for d in self.loop_stack if d != '1']
        
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Subscript):
            base_var = getattr(node.targets[0].value, 'id', '')
            if self.var_types.get(base_var) == 'dict' and len(active_loops) > 0:
                custom_op = "Dictionary Population"
                t_ov = "O(1)"
                s_ov = "O(n)"
                self.max_space_weight = max(self.max_space_weight, 1)
            elif isinstance(getattr(node.targets[0], 'slice', None), ast.Slice):
                custom_op = "Slice Assignment"
                t_ov = "O(n)"
                s_ov = "O(1)" 
            else:
                custom_op = "Update"
                t_ov = "O(1)"
                s_ov = "O(1)"

        if getattr(self, 'in_graph_context', False):
            if isinstance(node.value, (ast.ListComp, ast.SetComp, ast.DictComp)): 
                t_ov = "O(V + E)"; s_ov = "O(V + E)"
            elif isinstance(node.value, (ast.Tuple, ast.List, ast.Set)):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    t_ov = "O(V + E)"; s_ov = "O(V + E)"
                elif len(node.value.elts) == 0:
                    t_ov = "O(1)"; s_ov = "O(V + E)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    t_ov = "O(V + E)"; s_ov = "O(V + E)"
            elif isinstance(node.value, ast.Call):
                func_name = getattr(node.value.func, 'id', getattr(node.value.func, 'attr', ''))
                if func_name in ['set', 'list', 'dict', 'deque', 'tuple', 'set2']:
                    f_name = 'set' if func_name == 'set2' else func_name
                    t_ov = "O(1)"
                    s_ov = "O(V + E)"
                    custom_op = f"{f_name.capitalize()} Init"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, (ast.List, ast.Tuple)) or isinstance(node.value.right, (ast.List, ast.Tuple))): 
                custom_op = "List Repetition"
                t_ov = "O(V + E)"; s_ov = "O(V + E)"
            elif isinstance(node.value, ast.Subscript) and isinstance(getattr(node.value, 'slice', None), ast.Slice):
                t_ov = "O(V + E)"; s_ov = "O(V + E)"
            
            if custom_op == "Update": t_ov = "O(1)"; s_ov = "O(1)"
        else:
            if isinstance(node.value, ast.ListComp):
                is_nested = False
                is_constant_size = False
                
                if len(node.value.generators) > 1: is_nested = True
                elif isinstance(node.value.elt, ast.ListComp): 
                    is_nested = True
                    gen = node.value.elt.generators[0]
                    if isinstance(gen.iter, ast.Call) and getattr(gen.iter.func, 'id', '') == 'range':
                        if len(gen.iter.args) == 1 and isinstance(gen.iter.args[0], ast.Constant):
                            if isinstance(gen.iter.args[0].value, int) and gen.iter.args[0].value <= 100:
                                is_nested = False
                elif isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List): 
                    is_nested = True
                elif isinstance(node.value.elt, ast.List) and len(node.value.elt.elts) > 10:
                    is_nested = True
                
                for gen in node.value.generators:
                    if getattr(gen.iter, 'func', None) and getattr(gen.iter.func, 'id', '') == 'range':
                        if gen.iter.args and isinstance(gen.iter.args[0], ast.BinOp) and isinstance(gen.iter.args[0].op, ast.Mult):
                            is_nested = True
                            
                if len(node.value.generators) == 1:
                    gen = node.value.generators[0]
                    if isinstance(gen.iter, ast.Call) and getattr(gen.iter.func, 'id', '') == 'range':
                        if len(gen.iter.args) == 1 and isinstance(gen.iter.args[0], ast.Constant):
                            is_constant_size = True
                            
                if is_nested or (len(active_loops) > 0 and isinstance(node.targets[0], ast.Subscript)):
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(n^2)", space_override="O(n^2)", custom_op="2D Array Allocation")
                    self.generic_visit(node)
                    return
                elif is_constant_size:
                    t_ov, s_ov = "O(1)", "O(1)"
                else:
                    t_ov, s_ov = "O(n)", "O(n)"
            elif isinstance(node.value, (ast.SetComp, ast.DictComp)): 
                t_ov = "O(n)"
                s_ov = "O(n)"
            elif isinstance(node.value, ast.List):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "List Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "List Init"
                    t_ov = "O(1)"
                    s_ov = "O(1)" 
            elif isinstance(node.value, ast.Set):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Set Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Set Init"
                    t_ov = "O(1)"
                    s_ov = "O(1)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    custom_op = "Dict Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Dict Init"
                    t_ov = "O(1)"
                    s_ov = "O(1)"
            elif isinstance(node.value, ast.Tuple):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Tuple Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Tuple Init"
            elif isinstance(node.value, ast.Call):
                func_name = getattr(node.value.func, 'id', getattr(node.value.func, 'attr', ''))
                if func_name in ['set', 'list', 'dict', 'deque', 'tuple', 'set2', 'defaultdict', 'Counter', 'OrderedDict']: 
                    f_name = 'set' if func_name == 'set2' else func_name
                    if not getattr(node.value, 'args', []):
                        custom_op = f"{f_name.capitalize()} Init"
                        curr_func = self.current_function_name or ""
                        s_ov = "O(n)" if f_name == 'set' and "duplicate" in curr_func.lower() else "O(1)"
                    else:
                        custom_op = f"{f_name.capitalize()} Build"
                        t_ov = "O(n)"
                        s_ov = "O(n)"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, (ast.List, ast.Tuple)) or isinstance(node.value.right, (ast.List, ast.Tuple))): 
                mult_node = node.value.right if isinstance(node.value.left, (ast.List, ast.Tuple)) else node.value.left
                is_fixed_const = self._is_constant_expr(mult_node)
                val = extract_constant(mult_node)
                if val is not None and isinstance(val, (int, float)) and val > 100:
                    is_fixed_const = False
                        
                if is_fixed_const:
                    custom_op = "Fixed Container Allocation"
                    t_ov = "O(1)"; s_ov = "O(1)"
                else:
                    if isinstance(mult_node, ast.BinOp) and isinstance(mult_node.op, ast.Mult):
                        if isinstance(mult_node.left, ast.Constant) or isinstance(mult_node.right, ast.Constant) or extract_constant(mult_node.left) or extract_constant(mult_node.right):
                            t_ov = "O(n)"; s_ov = "O(n)"
                            custom_op = "List Repetition"
                        else:
                            t_ov = "O(n^2)"; s_ov = "O(n^2)"
                            custom_op = "2D Array Allocation"
                    else:
                        dim_var = 'n'
                        if isinstance(mult_node, ast.Name): dim_var = self._register_and_get_dim(mult_node.id)
                        elif isinstance(mult_node, ast.Call): dim_var = 'n'
                        custom_op = "List Repetition"
                        t_ov = f"O({dim_var})"; s_ov = f"O({dim_var})"
                        if len(active_loops) > 0 and isinstance(node.targets[0], ast.Subscript):
                            self.max_space_weight = max(self.max_space_weight, 2)
                            custom_op = "2D Array Allocation"
                            t_ov = "O(n^2)"; s_ov = "O(n^2)"
            elif isinstance(node.value, ast.Subscript) and isinstance(getattr(node.value, 'slice', None), ast.Slice): 
                custom_op = "Array Slicing"
                t_ov = "O(n)"; s_ov = "O(n)" 
            
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                if self._is_linear_var(t_id) or self.var_types.get(t_id) in ['str', 'list', 'tuple', 'set', 'dict']:
                    gt, gs, op = self._evaluate_organic_growth(t_id, node.value)
                    if op:
                        if op == "Geometric Expansion":
                            t_ov = "O(n)"; s_ov = "O(n)"
                        elif op == "String Build":
                            t_ov = "O(1)"; s_ov = "O(1)"
                        else:
                            t_ov = gt; s_ov = gs
                            if "n^2" in gs or "n²" in gs:
                                self.max_space_weight = max(self.max_space_weight, 2)
                        custom_op = op
                        break

            if custom_op is None and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                custom_op = "Init"

        for child in safe_walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(getattr(child, 'func', None), ast.Attribute) and child.func.attr == 'sqrt'):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "sqrt"
            
        self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=custom_op) 
        self.generic_visit(node)

    def visit_AugAssign(self, node): 
        if self.loop_depth > 0 and isinstance(node.target, ast.Name) and isinstance(node.value, ast.Subscript):
            self.add_logic_hint(node, "Logic Risk (Data-Dependent Traversal): Your loop increment/step mainly depends heavily on dynamic data values. Static analysis conservatively mainly defaults to worst-case, but runtime could radically fluctuate depending on the dataset state.")

        if isinstance(node.target, ast.Name) and self._is_linear_var(node.target.id):
            is_geometric = False
            if isinstance(node.op, ast.Mult) and extract_constant(node.value) is not None and extract_constant(node.value) > 1:
                is_geometric = True
            elif isinstance(node.op, ast.Add) and isinstance(node.value, ast.Name) and node.value.id == node.target.id:
                is_geometric = True
                
            active_loops = [d for d in self.loop_stack if d != '1']
            if is_geometric:
                if len(active_loops) > 0:
                    self.max_space_weight = max(self.max_space_weight, 4)
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Geometric Expansion (Worst-Case)")
                    self.max_exp = 1
                    return

        active_loops = [d for d in self.loop_stack if d != '1']
        if isinstance(node.target, ast.Name) and self.var_types.get(node.target.id) == 'str' and isinstance(node.op, ast.Add):
            if len(active_loops) > 0:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Build")
                return 

        for child in safe_walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(getattr(child, 'func', None), ast.Attribute) and child.func.attr == 'sqrt'):
                    if isinstance(node.target, ast.Name): self.variable_complexities[node.target.id] = "sqrt"
                    
        self.record_line(node, time_override="O(1)", space_override="O(1)")
        self.generic_visit(node)  

    def visit_Subscript(self, node):
        if isinstance(getattr(node, 'slice', None), ast.Slice):
            self.has_slicing = True  
            slice_str = ast.dump(node.slice).lower()
            if any(kw in slice_str for kw in ['div', 'mid', 'half', 'part', '/']):
                self.has_partitioning = True
            self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Array Slicing")
        self.generic_visit(node)  

    def visit_BinOp(self, node):
        if self._is_set_bitwise_op(node):
            self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Set Operation")
            self.generic_visit(node)
            return

        if isinstance(node.op, (ast.Add, ast.Mult)):
            if self._is_linear_type(node.left) or self._is_linear_type(node.right):
                if getattr(self, 'in_list_comp_depth', 0) > 0:
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Row Allocation")
                else:
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Concatenation / Repetition")
            else:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Binary Operation")
                
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.RShift, ast.Mod)): self.has_division = True  
        elif isinstance(node.op, ast.Mult):
            val1 = extract_constant(node.right) or 0
            val2 = extract_constant(node.left) or 0
            if isinstance(val1, float) and val1 < 1.0: self.has_division = True
            elif isinstance(val2, float) and val2 < 1.0: self.has_division = True
                
        self.generic_visit(node)  

    def visit_Return(self, node): 
        t_ov, s_ov = "O(1)", "O(1)"
        custom_op = "Return"
        if node.value:
            if isinstance(node.value, (ast.ListComp, ast.SetComp, ast.DictComp)):
                is_nested = False
                if isinstance(node.value, ast.ListComp):
                    if len(node.value.generators) > 1: is_nested = True
                    elif isinstance(node.value.elt, ast.ListComp): is_nested = True
                    elif isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List): is_nested = True
                
                if is_nested:
                    t_ov, s_ov = "O(n^2)", "O(n^2)"
                    custom_op = "Return 2D Comprehension"
                else:
                    t_ov, s_ov = "O(n)", "O(n)"
                    custom_op = f"Return {type(node.value).__name__.replace('Comp', ' Comprehension')}"
                    
            elif isinstance(node.value, ast.Subscript) and isinstance(getattr(node.value, 'slice', None), ast.Slice):
                t_ov, s_ov = "O(n)", "O(n)"
                custom_op = "Return Sliced Array"
            elif isinstance(node.value, ast.Call) and getattr(getattr(node.value, 'func', None), 'id', '') in ['sorted', 'list', 'set', 'dict']:
                func_id = node.value.func.id
                t_ov = "O(n log n)" if func_id == 'sorted' else "O(n)"
                s_ov = "O(n)"
            elif isinstance(node.value, ast.Call) and getattr(getattr(node.value, 'func', None), 'id', '') == 'sum':
                t_ov, s_ov = "O(n)", "O(1)"
        self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=custom_op)
        self.generic_visit(node)

    def visit_Expr(self, node): 
        # IGNORE COMMENTS/DOCSTRINGS: If it's just a loose string, skip recording it entirely
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.generic_visit(node)
            return
            
        if not isinstance(node.value, (ast.Call, ast.ListComp, ast.SetComp, ast.DictComp, ast.Yield, ast.YieldFrom)):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Expression")
            
        self.generic_visit(node)      

    def visit_Pass(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pass")
        self.generic_visit(node)

    def visit_Break(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Break")
        self.generic_visit(node)

    def visit_Continue(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Continue")
        self.generic_visit(node)

    def visit_Assert(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Assertion")
        self.generic_visit(node)

    def visit_Delete(self, node):
        self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Delete")
        self.generic_visit(node)

    def visit_Import(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Import")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Import From")
        self.generic_visit(node)

    def visit_Global(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Global Declaration")
        self.generic_visit(node)

    def visit_Nonlocal(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Nonlocal Declaration")
        self.generic_visit(node)

    def visit_Raise(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Raise Exception")
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.record_line(node, time_override="Definition", space_override="O(1)", custom_op="Class Definition")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_AsyncFor(self, node):
        self.visit_For(node)

    def visit_AsyncWith(self, node):
        self.visit_With(node)

    def visit_Match(self, node):
        self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pattern Matching")
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
