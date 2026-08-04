"""
Signature Recorder

Per-line weight computation and bookkeeping used while the AST is
walked in dependency order -- the recording half of the
"Dependency-Ordered Signature Pass (DFS)" stage of the complexity
analysis model (local/global time+space weights, bottleneck
propagation, and per-line result recording).
"""
import ast

try:
    from complexity_explainer.complexity_explainer import EducationalInsightGenerator as SemanticNLGEngine, ComprehensiveASTVisitor
except ImportError:
    SemanticNLGEngine = None
    ComprehensiveASTVisitor = None


class SignatureRecorder:
    """Dependency-Ordered Signature Pass (recording half). Composed into
    ComplexityAnalyzer as `self.signature_recorder`; reads/writes shared state
    via `self.analyzer`.
    """

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def _get_weight(self, complexity_str, is_recurrence=False):
        if is_recurrence: return 200
        if complexity_str in ["O(1)", "Definition", "Dead Code"]: return 1 if complexity_str != "Dead Code" else -1
        w = 0
        if "n!" in complexity_str: w = 150
        elif "2^n" in complexity_str or "2ⁿ" in complexity_str: w = 100
        elif "n^2" in complexity_str or "n²" in complexity_str: w = 20
        elif "n log n" in complexity_str: w = 15
        elif "V + E" in complexity_str or "V" in complexity_str: w = 12
        # NOTE: "sqrt n" and "log n" both contain the plain substring "n", so
        # these two checks MUST come before the generic "n" check below --
        # otherwise every O(sqrt n)/O(log n) complexity silently falls into
        # the O(n) bucket and the two branches beneath become dead code.
        elif "sqrt n" in complexity_str or "√n" in complexity_str: w = 7
        elif "log n" in complexity_str: w = 5
        elif "n" in complexity_str: w = 10
        return w

    def _get_space_weight(self, complexity_str):
        if complexity_str == "S(placeholder)": return 0
        s_w = 0
        if "n!" in complexity_str: s_w = 5
        elif "2^n" in complexity_str or "2ⁿ" in complexity_str: s_w = 4
        elif "n^2" in complexity_str or "n²" in complexity_str: s_w = 2
        elif "V + E" in complexity_str or "V" in complexity_str: s_w = 3
        # Same substring-ordering fix as _get_weight above: "sqrt n" and
        # "log n" both contain "n", so they must be checked first or they're
        # unreachable and get silently upgraded to the O(n) weight (1).
        elif "sqrt n" in complexity_str or "√n" in complexity_str: s_w = 0.7
        elif "log n" in complexity_str: s_w = 0.5
        elif "n" in complexity_str: s_w = 1
        return s_w

    def _apply_bottlenecks(self):
        final_time = self.analyzer.complexity_synthesizer.get_final_asymptotic_badge()
        final_space = self.analyzer.complexity_synthesizer.get_final_space_badge()
        max_w = max([d.get('weight', -1) for d in self.analyzer._details], default=-1)
        
        excluded_complexities = ["O(1)", "O(log n)", "O(sqrt n)", "O(n)", "-", ""]
        praise_complexities = ["O(log n)", "O(sqrt n)"]
        
        for d in self.analyzer._details:
            if d.get('weight', -1) == max_w and max_w > 0 and final_time not in excluded_complexities:
                warning = self.analyzer.nlg_engine.get_time_bottleneck_warning(d.get('operation', ''), final_time)
                if warning not in d.get('time_explanation', ''):
                    d['time_explanation'] = str(d.get('time_explanation', '')) + warning
                
            if d.get('global_space', '') == final_space and final_space not in excluded_complexities:
                warning = self.analyzer.nlg_engine.get_space_bottleneck_warning(d.get('operation', ''), final_space)
                if warning not in d.get('space_explanation', ''):
                    d['space_explanation'] = str(d.get('space_explanation', '')) + warning

            if d.get('global_time', '') in praise_complexities:
                praise = self.analyzer.nlg_engine.get_time_optimization_praise(d.get('operation', ''), d.get('global_time', ''))
                if "ALGORITHM MASTERY:" not in d.get('time_explanation', ''):
                    d['time_explanation'] = str(d.get('time_explanation', '')) + praise

    def add_logic_hint(self, node, hint_text):
        line_num = getattr(node, 'lineno', -1)
        if line_num not in self.analyzer.logic_hints:
            self.analyzer.logic_hints[line_num] = []
        if hint_text not in self.analyzer.logic_hints[line_num]:
            self.analyzer.logic_hints[line_num].append(hint_text)

    def _build_time_str(self, poly_dims, log, sqrt=0, exp=0, graph=0, gcd_vars=None, fact=0):
        try:
            if fact > 0: return "O(n!)"
            if exp > 0: return "O(2^n)"
            if graph > 0: return "O(V + E)"

            n_count = len(poly_dims) if poly_dims else 0
            
            if n_count >= 2:
                return "O(n^2)"
            elif n_count == 1:
                if log > 0:
                    return "O(n log n)"
                return "O(n)"
            else:
                if log > 0:
                    return "O(log n)"
                if sqrt > 0:
                    return "O(sqrt n)"
                return "O(1)"
        except Exception:
            return "O(1)"

    def get_code_snippet(self, node):
        if hasattr(node, 'lineno') and node.lineno <= len(self.analyzer.source_lines): 
            return self.analyzer.source_lines[node.lineno - 1].strip()  
        return "Code Block"  

    def get_color(self, complexity_str):
        if complexity_str == "-" or "Dead Code" in complexity_str: return "#7f8c8d"  
        if "T(" in complexity_str or "!" in complexity_str: return "#8e44ad"  
        if "^n" in complexity_str or "C(" in complexity_str: return "#9b59b6"  
        if "^2" in complexity_str or "^3" in complexity_str or "*" in complexity_str: return "#e74c3c"  
        if "V + E" in complexity_str or "V" in complexity_str: return "#d35400"
        if "log" in complexity_str: return "#2980b9"  
        if "sqrt" in complexity_str: return "#16a085"  
        if complexity_str != "O(1)": return "#e67e22"  
        return "#27ae60"

    def record_line(self, node, time_override=None, space_override=None, custom_op=None, global_time_override=None, global_space_override=None, is_recursive_call=False):
        line_text = self.get_code_snippet(node)
        line_num = getattr(node, 'lineno', -1) 
        
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

        is_dead = getattr(self.analyzer, 'in_dead_code', False)
        if time_override == "Dead Code": is_dead = True
        
        is_loop_or_func = isinstance(node, (ast.For, ast.While, ast.FunctionDef, ast.ListComp, ast.SetComp, ast.DictComp))
        is_recurrence = time_override and (time_override.startswith("T(") or any(x in time_override for x in ["T(n) =", "n!", "2^n", "2T("]))
        
        node_dims, node_log, node_sqrt, node_graph, gcd_vars = [], 0, 0, 0, None
        
        if not time_override:
            if self.analyzer.complexity_heuristics._is_exponential_loop(node):
                time_override, is_recurrence, self.analyzer.max_exp = "O(2^n)", True, 1
            elif isinstance(node, ast.For):
                if getattr(self.analyzer, 'in_graph_context', False) and self.analyzer.call_graph_mapper._is_graph_for_loop(node):
                    node_graph = 1
                elif not self.analyzer.complexity_heuristics._is_constant_loop(node):
                    if self.analyzer.complexity_heuristics._is_sqrt_loop(node): node_sqrt = 1
                    else:
                        iter_name = self.analyzer.complexity_heuristics._get_iterable_name(node.iter)
                        dim = self.analyzer.complexity_heuristics._register_and_get_dim(iter_name)
                        if dim: node_dims = [dim]
            elif isinstance(node, ast.While):
                if getattr(self.analyzer, 'in_graph_context', False) and self.analyzer.call_graph_mapper._is_graph_while_loop(node): node_graph = 1
                else:
                    is_log, gcd_v = self.analyzer.complexity_heuristics._is_log_loop(node)
                    if is_log: 
                        node_log = 1
                        gcd_vars = gcd_v
                    elif self.analyzer.complexity_heuristics._is_sqrt_loop(node): node_sqrt = 1
                    elif not self.analyzer.complexity_heuristics._is_constant_loop(node): 
                        limit_vars = self.analyzer.complexity_heuristics._get_while_limit_vars(node)
                        if limit_vars:
                            dims = [self.analyzer.complexity_heuristics._register_and_get_dim(lv) for lv in limit_vars if self.analyzer.complexity_heuristics._register_and_get_dim(lv)]
                            if dims: node_dims = [dims[0]]
                        else:
                            node_dims = ['n']
        else:
            if not is_recurrence:
                if "n log n" in time_override: node_dims.append('n'); node_log = 1
                elif "O(V + E)" in time_override or "O(V)" in time_override: node_graph = 1
                elif "O(log n)" in time_override: node_log = 1
                elif "O(sqrt n)" in time_override: node_sqrt = 1
                elif "O(n * m)" in time_override: node_dims.extend(['n', 'm'])
                elif "O(n^5)" in time_override: node_dims.extend(['n', 'n'])
                elif "O(n^4)" in time_override: node_dims.extend(['n', 'n'])
                elif "O(n^3)" in time_override or "n³" in time_override: node_dims.extend(['n', 'n'])
                elif "O(n^2)" in time_override or "n²" in time_override: node_dims.extend(['n', 'n'])
                elif "O(3^n)" in time_override: self.analyzer.max_exp = 1 
                elif "O(2^n)" in time_override or "2ⁿ" in time_override: self.analyzer.max_exp = 1
                elif "O(n!)" in time_override or "n!" in time_override: self.analyzer.max_fact = 1
                elif "O(n)" in time_override: node_dims.append('n')
                elif "O(m)" in time_override: node_dims.append('m')

        gcd_vars = gcd_vars or getattr(self.analyzer, 'active_gcd_vars', None)

        is_terminal_stmt = isinstance(node, (ast.Return, ast.Break))

        if is_dead:
            local_t = "O(1)"
            global_t = "O(1)"
            operation_name = "Dead Code"
            local_s = "O(1)"
            global_s = "O(1)"
            tot_dims, tot_log, tot_sqrt, tot_graph = [], 0, 0, 0
        elif time_override == "Definition":
            local_t = "O(1)"
            global_t = "O(1)"
            local_s = "O(1)"
            global_s = "O(1)"
            tot_dims, tot_log, tot_sqrt, tot_graph = [], 0, 0, 0
        else:
            if time_override: local_t = str(time_override)
            else: local_t = str(self._build_time_str(node_dims, node_log, node_sqrt, 0, node_graph, gcd_vars))
            
            # These custom_ops represent the WHOLE loop's already-bounded total
            # cost (e.g. a two-pointer/sliding-window inner loop that's
            # amortized to O(n) across the entire outer loop's run), not a
            # per-iteration cost meant to multiply against the surrounding
            # loop nest. They must not be added on top of active_poly_dims,
            # or an amortized O(n) inner loop silently becomes O(n^2) when
            # nested inside another O(n) loop.
            is_whole_loop_total = custom_op in ("Amortized Linear Loop (Worst-Case O(n))", "Amortized Frequency Loop")

            if is_terminal_stmt or is_whole_loop_total:
                tot_dims = node_dims
                tot_log = node_log
                tot_sqrt = node_sqrt
                tot_graph = node_graph
            else:
                tot_dims = self.analyzer.active_poly_dims + node_dims
                tot_log = self.analyzer.log_loop_depth + node_log
                tot_sqrt = getattr(self.analyzer, 'sqrt_loop_depth', 0) + node_sqrt
                tot_graph = getattr(self.analyzer, 'graph_depth', 0) + node_graph
                
            if global_time_override: global_t = str(global_time_override)
            else:
                cumulative_ops = {"Tuple Recreation", "Tuple Immutability Recreation", "String Build", "String Concatenation (Immutable)", "Geometric Expansion", "Linear Accumulation"}
                if custom_op in cumulative_ops and time_override:
                    global_t = str(time_override)
                    tot_dims = [d for d in node_dims if d != 'n'] if time_override != "O(n^2)" else ['n', 'n']
                elif local_t == "O(1)" and not is_recursive_call: 
                    global_t = str(self._build_time_str(tot_dims, tot_log, tot_sqrt, self.analyzer.max_exp, tot_graph, gcd_vars, self.analyzer.max_fact))
                else:
                    if is_recurrence: global_t = str(time_override)
                    else: global_t = str(self._build_time_str(tot_dims, tot_log, tot_sqrt, self.analyzer.max_exp, tot_graph, gcd_vars, self.analyzer.max_fact))
            
            local_s = str(space_override) if space_override else "O(1)"
            
            if local_s == "O(1)" and isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                func_id = getattr(getattr(node.value, 'func', None), 'id', '')
                if func_id and func_id[0].isupper() and func_id not in ['print', 'range', 'len']:
                    local_s = "O(n)"
                    
            if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp)) or \
               (isinstance(node, ast.Assign) and isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and isinstance(node.value.left, ast.List)):
                if not space_override:
                    local_s = "O(n)"

            if global_space_override:
                global_s = str(global_space_override)
            else:
                if self.analyzer.loop_depth > 0 and local_s == "O(n)":
                    global_s = "O(n)"
                else:
                    global_s = local_s

        if local_s == "S(placeholder)": global_s = "S(placeholder)"

        if getattr(self.analyzer, 'in_graph_context', False):
            if "O(n)" in local_s: local_s = local_s.replace("O(n)", "O(V)")
            if "O(n)" in global_s: global_s = global_s.replace("O(n)", "O(V)")
            
        curr_func = self.analyzer.current_function_name or ""
        is_char_count = "char" in curr_func.lower() and "count" in curr_func.lower()
        if is_char_count:
            if "O(n)" in local_s: local_s = local_s.replace("O(n)", "O(1)")
            if "O(n)" in global_s: global_s = global_s.replace("O(n)", "O(1)")
            self.analyzer.max_space_weight = 0

        self.analyzer.max_space_weight = max(getattr(self.analyzer, 'max_space_weight', 0), self._get_space_weight(global_s))

        t_w = self._get_weight(global_t, is_recurrence)
        s_w = self._get_space_weight(global_s)

        if not is_dead and time_override != "Definition":
            overall_t = self._build_time_str(tot_dims, tot_log, tot_sqrt, self.analyzer.max_exp, tot_graph, gcd_vars, self.analyzer.max_fact)
            
            context_w = self._get_weight(overall_t, False)
            
            if context_w > self.analyzer.max_complexity:
                self.analyzer.max_complexity = context_w
                if context_w < 150: 
                    self.analyzer.max_poly_str = self._build_time_str(tot_dims, tot_log, 0, 0, 0)
                    self.analyzer.max_log = tot_log
                    self.analyzer.max_sqrt = tot_sqrt
                    self.analyzer.max_graph_ve = tot_graph
                    
            overall_s = global_s
            if getattr(self.analyzer, 'in_accumulation_context', False) and local_s != "O(1)":
                s_tot_dims = self.analyzer.active_poly_dims + (['n'] if "O(n)" in local_s else [])
                overall_s = self._build_time_str(s_tot_dims, 0, 0, 0, 0)
            self.analyzer.max_space_weight = max(getattr(self.analyzer, 'max_space_weight', 0), self._get_space_weight(overall_s))

        hits = self.analyzer.trace_data.get("line_hits", {}).get(line_num, 0)
        mem_state = {}
        for snap in self.analyzer.trace_data.get("history", []):
            if snap.line_no == line_num:
                for var_name, var_data in snap.variables.items():
                    if var_name not in mem_state or var_data["size"] > mem_state[var_name].get("size", 0):
                        mem_state[var_name] = dict(var_data)
        
        time_exp, space_exp = "", ""        
        if SemanticNLGEngine:
            for var_name, var_data in mem_state.items():
                var_data["explanation"] = self.analyzer.nlg_engine.generate_variable_explanation(var_name, var_data, self.analyzer.var_types.get(var_name))

            time_exp, space_exp = self.analyzer.nlg_engine.generate_explanations(
                node, local_t, global_t, local_s, global_s, is_dead, line_text, hits, mem_state
            )

        builtin_desc = None
        if isinstance(node, ast.Call):
            func_obj = getattr(node, 'func', None)
            if isinstance(func_obj, ast.Name):
                builtin_desc = self.analyzer.builtin_complexities.get(func_obj.id, {}).get('desc')
            elif isinstance(func_obj, ast.Attribute):
                builtin_desc = self.analyzer.builtin_complexities.get(func_obj.attr, {}).get('desc')

        if builtin_desc and not is_dead:
            if builtin_desc not in time_exp:
                time_exp = builtin_desc + ("\n\n" + time_exp if time_exp and time_exp != "Function call." else "")

        hints = self.analyzer.logic_hints.get(getattr(node, 'lineno', -1), [])
        if hints: time_exp += "\n\n" + "\n".join(hints)

        entry = {
            "lineno": line_num, "lineOfCode": line_text, "operation": operation_name,  
            "local_time": local_t, "global_time": global_t, "local_space": local_s, "global_space": global_s, 
            "indent": self.analyzer.current_depth, "color": "#7f8c8d" if is_dead else self.get_color(global_t), "weight": t_w, 
            "time_explanation": time_exp, "space_explanation": space_exp,
            "hits": hits, "memory_state": mem_state
        }
        
        if self.analyzer._details and self.analyzer._details[-1]["lineno"] == line_num:
            prev_w = self.analyzer._details[-1].get("weight", -1)
            prev_op = self.analyzer._details[-1].get("operation", "")
            structural_ops = ["Loop", "Condition", "Definition", "Return", "Try-Except Block", "Context Manager"]
            
            if t_w > prev_w:
                if prev_op in structural_ops and operation_name not in structural_ops:
                    entry["operation"] = prev_op
                self.analyzer._details[-1].update(entry)
            elif t_w == prev_w:
                generics = ["Expression", "Assignment", "Update", "Binary Operation", "Function Call", "Compare"]
                if prev_op in generics and operation_name not in generics:
                    self.analyzer._details[-1].update(entry)
                elif prev_op not in structural_ops and operation_name not in generics and custom_op:
                    self.analyzer._details[-1].update(entry)
        else: 
            self.analyzer._details.append(entry)
