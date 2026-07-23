"""
Complexity Heuristics

Structural AST classifiers shared by the signature and synthesis
passes: loop-bound classification (constant/log/sqrt/exponential),
linear-variable tracking, and related pattern detectors.
"""
import ast
from code_preprocessor import safe_walk, extract_constant


class ComplexityHeuristicsMixin:
    """Mixin providing shared structural complexity-classification helpers."""

    def _is_linear_type(self, expr_node):
        try:
            if isinstance(expr_node, (ast.List, ast.Tuple, ast.Set, ast.Dict, ast.ListComp, ast.SetComp, ast.DictComp)):
                return True
            if isinstance(expr_node, ast.Name):
                t = self.var_types.get(expr_node.id, '')
                if t in ['list', 'set', 'dict', 'tuple', 'str', 'deque']: return True
                if any(k in expr_node.id.lower() for k in ['arr', 'list', 'dict', 'set', 'str', 'queue', 'stack', 'graph', 'matrix', 'items', 'nums']): 
                    return True
        except Exception:
            pass
        return False

    def _is_linear_var(self, var_name):
        try:
            t = self.var_types.get(var_name, '')
            if t in ['list', 'set', 'dict', 'tuple', 'str', 'deque']: return True
            for k in ['arr', 'array', 'list', 'dict', 'set', 'queue', 'stack', 'graph', 'matrix', 'items', 'nums']:
                if var_name.lower() == k or var_name.lower().endswith(f'_{k}'): return True
        except Exception:
            pass
        return False

    def _get_iterable_name(self, node):
        try:
            if isinstance(node, ast.Name): return node.id
            if isinstance(node, ast.Subscript):
                return self._get_iterable_name(node.value)
            if isinstance(node, ast.BinOp):
                left = self._get_iterable_name(node.left)
                if left: return left
                return self._get_iterable_name(node.right)
            if isinstance(node, ast.Call):
                func_id = getattr(node.func, 'id', '')
                if func_id == 'len' and len(node.args) > 0:
                    return self._get_iterable_name(node.args[0])
                elif func_id == 'range' and len(node.args) > 0:
                    arg = node.args[0] if len(node.args) == 1 else node.args[1]
                    return self._get_iterable_name(arg)
        except Exception:
            pass
        return None

    def _register_and_get_dim(self, var_name):
        try:
            if not var_name: return 'n'
            if isinstance(var_name, str):
                lower_name = var_name.lower()
                if lower_name in ['t', 'tc', 'test', 'tests', 'testcases', '_']: return None
                if lower_name in ['m', 'p', 'k', 'w', 'c', 'v', 'e', 'q', 'd']: return lower_name
                if lower_name in ['col', 'width', 'capacity', 'amount', 'target', 'arr2', 'list2', 'arrb', 'val', 'cols'] or '[0]' in lower_name or lower_name.endswith('_m') or lower_name.endswith('arr2') or lower_name.endswith('list2'): 
                    return 'm'
                return 'n'
        except Exception:
            pass
        return 'n'

    def _is_constant_expr(self, expr_node):
        try:
            if isinstance(expr_node, (ast.Constant, getattr(ast, 'Num', type(None)), getattr(ast, 'Str', type(None)))):
                return True
            if isinstance(expr_node, ast.Name):
                name_u = expr_node.id.upper()
                if name_u in ['N', 'M', 'V', 'E', 'K', 'T', 'L', 'R', 'C', 'W', 'H', 'ROW', 'COL', 'SIZE', 'LEN']: return False
                if any(k in name_u for k in ['MAX', 'CHARS', 'NO_OF_CHARS', 'ALPHABET']): return True
                if expr_node.id.isupper(): return True
                if any(k in expr_node.id.lower() for k in ['max', 'min', 'mod', 'inf', 'limit', 'cap']): return True
                return False
            if isinstance(expr_node, ast.BinOp):
                return self._is_constant_expr(expr_node.left) and self._is_constant_expr(expr_node.right)
            if isinstance(expr_node, ast.UnaryOp):
                return self._is_constant_expr(expr_node.operand)
            return False
        except Exception:
            return False
            
    def _is_exponential_expr(self, expr_node):
        try:
            if isinstance(expr_node, ast.BinOp):
                if isinstance(expr_node.op, ast.LShift): return True
                if isinstance(expr_node.op, ast.Pow) and isinstance(getattr(expr_node.left, 'value', getattr(expr_node.left, 'n', None)), (int, float)): return True
            elif isinstance(expr_node, ast.Call) and getattr(getattr(expr_node, 'func', None), 'id', '') == 'pow': return True
        except Exception:
            pass
        return False

    def _get_while_limit_vars(self, node):
        try:
            updated_vars = set()
            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(target, ast.Name): updated_vars.add(target.id)
                    elif isinstance(sub, ast.AugAssign):
                        if isinstance(sub.target, ast.Name): updated_vars.add(sub.target.id)

            limit_vars = []
            ignore_set = {'len', 'range', 'min', 'max', 'True', 'False', 'None'}
            scalar_hints = ['val', 'key', 'num', 'idx', 'pivot', 'temp', 'curr', 'node', 'element', 'target']
            for child in safe_walk(node.test):
                if isinstance(child, ast.Name) and child.id not in updated_vars and child.id not in ignore_set:
                    if any(kw in child.id.lower() for kw in scalar_hints) and not self._is_linear_var(child.id):
                        continue
                    if child.id not in limit_vars:
                        limit_vars.append(child.id)
                    
            return limit_vars
        except Exception:
            return []

    def _is_constant_loop(self, node):
        key = ('_is_constant_loop', id(node))
        cache = self._loop_classify_cache
        if key not in cache:
            cache[key] = self._is_constant_loop_uncached(node)
        return cache[key]

    def _is_sqrt_loop(self, node):
        key = ('_is_sqrt_loop', id(node))
        cache = self._loop_classify_cache
        if key not in cache:
            cache[key] = self._is_sqrt_loop_uncached(node)
        return cache[key]

    def _is_exponential_loop(self, node):
        key = ('_is_exponential_loop', id(node))
        cache = self._loop_classify_cache
        if key not in cache:
            cache[key] = self._is_exponential_loop_uncached(node)
        return cache[key]

    def _is_constant_loop_uncached(self, node):
        try:
            if isinstance(node, ast.While):
                if any(isinstance(child, ast.Break) for child in safe_walk(node)): return False
                if getattr(node, 'test', None):
                    if isinstance(node.test, ast.Constant): return True
                    if self._is_constant_expr(node.test): return True
                    if isinstance(node.test, ast.Compare):
                        if self._is_constant_expr(node.test.left) and all(self._is_constant_expr(c) for c in getattr(node.test, 'comparators', [])):
                            return True
            elif isinstance(node, ast.For):
                if getattr(node, 'iter', None):
                    if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                        if all(self._is_constant_expr(arg) for arg in node.iter.args): return True
                    elif isinstance(node.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant)): 
                        if len(getattr(node.iter, 'elts', [])) <= 100: return True
                    elif isinstance(node.iter, ast.Name):
                        if self._is_constant_expr(node.iter): return True
            return False
        except Exception:
            return False

    def _is_frequency_summation_loop(self, node):
        try:
            if isinstance(node, ast.For):
                if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                    if len(node.iter.args) > 0:
                        arg_str = ast.dump(node.iter.args[0]).lower()
                        if 'count' in arg_str or 'freq' in arg_str:
                            return True
                        arg = node.iter.args[0]
                        if isinstance(arg, ast.Subscript):
                            base_name = getattr(getattr(arg, 'value', None), 'id', '').lower()
                            if any(kw in base_name for kw in ['count', 'freq', 'bucket', 'dp']):
                                return True
                iter_name = getattr(getattr(node, 'target', None), 'id', '').lower()
                if 'bucket' in iter_name or 'adj' in iter_name or 'graph' in iter_name:
                    for child in safe_walk(node):
                        if isinstance(child, ast.Call) and getattr(getattr(child, 'func', None), 'attr', '') in ['extend', 'append']:
                            return True
            return False
        except Exception:
            return False

    def _pointer_reset_by_enclosing_loop(self, pointer_name, inner_loop_node):
        """
        True if `pointer_name` is directly (re-)assigned -- via a plain
        Assign, not an in-place update like `j -= 1` -- somewhere in the
        immediately enclosing loop's body (tracked via self.loop_body_stack),
        as opposed to only being initialized once before the outer loop ever
        started. A pointer that gets reset every outer iteration cannot be
        amortized across those iterations: each outer pass pays for a fresh
        inner scan, which is what actually makes patterns like insertion
        sort or a per-index two-pointer scan genuinely O(n^2), not O(n).

        Deliberately excludes `inner_loop_node`'s own body from the scan --
        an ordinary decrement inside the inner loop itself, e.g. `j = j - 1`,
        is written as a plain ast.Assign (not ast.AugAssign) in Python and
        would otherwise be misread as a "reset".
        """
        if not self.loop_body_stack:
            return False
        try:
            parent_body = self.loop_body_stack[-1]
            for stmt in parent_body:
                if stmt is inner_loop_node:
                    continue
                for sub in ast.walk(stmt):
                    if isinstance(sub, ast.Assign):
                        for t in sub.targets:
                            if isinstance(t, ast.Name) and t.id == pointer_name:
                                return True
            return False
        except Exception:
            return False

    def _is_amortized_inner_loop(self, node):
        try:
            # FIX: Only apply amortized logic to truly nested inner loops.
            # An outermost loop (depth 1) should be evaluated normally to prevent
            # overriding binary search or standard traversals.
            if self.loop_depth <= 1: return False
            if not isinstance(node, (ast.While, ast.For)): return False
            
            pops_container = False
            for child in safe_walk(node):
                if isinstance(child, ast.Call) and isinstance(getattr(child, 'func', None), ast.Attribute):
                    if child.func.attr in ['pop', 'popleft']:
                        pops_container = True
                        break
            if pops_container: return True
            
            if isinstance(node, ast.While):
                for child in safe_walk(node.test):
                    if isinstance(child, ast.Subscript) and isinstance(getattr(child.value, 'value', None), ast.Name):
                        if child.value.value.id.lower() in ['v', 'freq', 'count', 'map', 'visited', 'vis']:
                            return True
                    if isinstance(child, ast.Name):
                        if child.id.lower() in ['start', 'left', 'l', 'j']:
                            # Name alone isn't enough -- confirm the pointer
                            # actually persists across outer iterations
                            # rather than being reset by the enclosing loop.
                            if self._pointer_reset_by_enclosing_loop(child.id, node):
                                return False
                            return True
                                    
            return False
        except Exception:
            return False

    def _has_log_call(self, node):
        try:
            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.Call):
                        f_id = getattr(getattr(sub, 'func', None), 'id', getattr(getattr(sub, 'func', None), 'attr', ''))
                        if f_id in self.builtin_complexities and 'log' in self.builtin_complexities.get(f_id, {}).get('time', ''):
                            return True
                        if f_id in self.custom_functions and 'log' in self.custom_functions.get(f_id, ''):
                            return True
            return False
        except Exception:
            return False

    def _is_log_loop(self, node):
        try:
            if not isinstance(node, ast.While): return False, None
            cond_vars = set()
            for child in safe_walk(node.test):
                if isinstance(child, ast.Name): cond_vars.add(child.id)
                if isinstance(child, ast.BinOp) and isinstance(child.op, (ast.LShift, ast.RShift)):
                    return True, None
                    
            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.AugAssign) and isinstance(sub.op, (ast.Add, ast.Sub)):
                        if isinstance(sub.value, ast.BinOp) and isinstance(sub.value.op, ast.BitAnd):
                            return True, None
                    
                    if isinstance(sub, ast.Assign) and getattr(sub, 'targets', []):
                        if isinstance(sub.targets[0], ast.Tuple) and isinstance(sub.value, ast.Tuple):
                            for elt in sub.value.elts:
                                if isinstance(elt, ast.BinOp) and isinstance(elt.op, ast.Mod): return True, None
                                    
                    if isinstance(sub, ast.AugAssign):
                        if isinstance(sub.op, (ast.BitAnd, ast.BitOr, ast.BitXor, ast.RShift, ast.LShift, ast.FloorDiv)):
                            if isinstance(sub.target, ast.Name) and sub.target.id in cond_vars: return True, None
                        
                    if isinstance(sub, ast.Assign):
                        for t in sub.targets:
                            if isinstance(t, ast.Name) and t.id in cond_vars:
                                for v in safe_walk(sub.value):
                                    if isinstance(v, ast.BinOp) and isinstance(v.op, (ast.BitAnd, ast.RShift, ast.LShift, ast.FloorDiv)):
                                        return True, None
                            if isinstance(sub.value, ast.BinOp) and isinstance(sub.value.op, (ast.Add, ast.Sub)):
                                if isinstance(sub.value.right, ast.BinOp) and isinstance(sub.value.right.op, ast.BitAnd):
                                    return True, None

            mid_vars = set()
            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(target, ast.Name):
                                for v in safe_walk(sub.value):
                                    if isinstance(v, ast.BinOp):
                                        val = extract_constant(v.right) or 0
                                        if isinstance(v.op, ast.FloorDiv) and isinstance(val, (int, float)) and val == 2: mid_vars.add(target.id)
                                        elif isinstance(v.op, ast.Div) and isinstance(val, (int, float)) and val == 2: mid_vars.add(target.id)
                                        elif isinstance(v.op, ast.RShift) and isinstance(val, (int, float)) and val == 1: mid_vars.add(target.id)
                                    elif isinstance(v, ast.Call) and any(k in getattr(v.func, 'id', '').lower() for k in ['mid', 'half']):
                                        mid_vars.add(target.id)

            if mid_vars:
                for child in node.body:
                    for sub in safe_walk(child):
                        if isinstance(sub, ast.Assign):
                            for target in sub.targets:
                                if isinstance(target, ast.Name) and target.id in cond_vars:
                                    for v in safe_walk(sub.value):
                                        if isinstance(v, ast.Name) and v.id in mid_vars: return True, None
                                        if isinstance(v, ast.BinOp) and (getattr(v.left, 'id', '') in mid_vars or getattr(v.right, 'id', '') in mid_vars): return True, None

            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(sub.value, ast.BinOp) and isinstance(sub.value.op, ast.Mod):
                                if isinstance(sub.value.left, ast.Name) and isinstance(sub.value.right, ast.Name):
                                    if isinstance(target, ast.Name) and target.id == sub.value.right.id:
                                        return True, [sub.value.left.id, sub.value.right.id]
                            if isinstance(target, ast.Name) and target.id in cond_vars:
                                for v in safe_walk(sub.value):
                                    if isinstance(v, ast.Call) and getattr(getattr(v, 'func', None), 'attr', '') == 'sqrt':
                                        return True, None
                                        
                    if isinstance(sub, ast.AugAssign):
                        if isinstance(sub.target, ast.Name) and sub.target.id in cond_vars:
                            val = extract_constant(sub.value) or 0
                            if isinstance(sub.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)) and isinstance(val, (int, float)) and val > 1: return True, None
                            if isinstance(sub.op, (ast.LShift, ast.RShift)): return True, None
                            if isinstance(sub.op, ast.Mod): return True, None
                    elif isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(target, ast.Name) and target.id in cond_vars:
                                if isinstance(sub.value, ast.BinOp):
                                    left_val = extract_constant(sub.value.left) or 0
                                    right_val = extract_constant(sub.value.right) or 0
                                    if isinstance(sub.value.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)):
                                        if getattr(sub.value.left, 'id', None) == target.id and isinstance(right_val, (int, float)) and right_val > 1: return True, None
                                        if getattr(sub.value.right, 'id', None) == target.id and isinstance(left_val, (int, float)) and left_val > 1: return True, None
                                    if isinstance(sub.value.op, ast.Mod):
                                        if getattr(sub.value.left, 'id', None) == target.id or getattr(sub.value.right, 'id', None) == target.id: return True, None
                                    if isinstance(sub.value.op, (ast.LShift, ast.RShift)): return True, None

            return False, None
        except Exception:
            return False, None
            
    def _is_sqrt_loop_uncached(self, node):
        try:
            if not isinstance(node, (ast.While, ast.For)): return False  
            expr = node.test if isinstance(node, ast.While) else node.iter
            
            for child in safe_walk(expr):
                if isinstance(child, ast.Call):
                    func_id = getattr(getattr(child, 'func', None), 'id', '')
                    if func_id == 'sqrt' or (isinstance(getattr(child, 'func', None), ast.Attribute) and child.func.attr == 'sqrt'): return True
                    if func_id == 'pow' and getattr(child, 'args', None) and len(child.args) >= 2:
                        exp_val = extract_constant(child.args[1])
                        if isinstance(exp_val, (int, float)) and abs(exp_val - 0.5) < 1e-9: return True
                if isinstance(child, ast.BinOp) and isinstance(child.op, ast.Pow):
                    exp_val = extract_constant(child.right)
                    if isinstance(exp_val, (int, float)) and abs(exp_val - 0.5) < 1e-9: return True
                if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "sqrt": return True

            if isinstance(node, ast.While) and isinstance(node.test, ast.Compare):
                left = node.test.left
                for right in getattr(node.test, 'comparators', []):
                    if isinstance(left, ast.BinOp) and isinstance(left.op, ast.Mult):
                        if isinstance(left.left, ast.Name) and isinstance(left.right, ast.Name) and left.left.id == left.right.id: return True
                    if isinstance(right, ast.BinOp) and isinstance(right.op, ast.Mult):
                        if isinstance(right.left, ast.Name) and isinstance(right.right, ast.Name) and right.left.id == right.right.id: return True
                    if isinstance(left, ast.BinOp) and isinstance(left.op, ast.Pow) and extract_constant(left.right) == 2: return True
                    if isinstance(right, ast.BinOp) and isinstance(right.op, ast.Pow) and extract_constant(right.right) == 2: return True
            return False
        except Exception:
            return False
    
    def _is_exponential_loop_bound(self, node):
        try:
            if isinstance(node, ast.For) and isinstance(node.iter, ast.Call):
                if getattr(node.iter.func, 'id', '') == 'range':
                    for arg in node.iter.args:
                        if isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Pow): return True
            return False
        except Exception:
            return False

    def _is_exponential_loop_uncached(self, node):
        try:
            if self._is_exponential_loop_bound(node): return True
            if not isinstance(node, (ast.For, ast.While)): return False
            expr = node.iter if isinstance(node, ast.For) else node.test
            for child in safe_walk(expr):
                if isinstance(child, ast.BinOp):
                    val = extract_constant(child.left) or 0
                    if isinstance(child.op, ast.Pow) and isinstance(val, (int, float)) and val == 2: return True
                if isinstance(child, ast.Call) and isinstance(getattr(child, 'func', None), ast.Name) and child.func.id == 'pow':
                    val = extract_constant(child.args[0] if getattr(child, 'args', None) else None) or 0
                    if len(child.args) >= 2 and isinstance(val, (int, float)) and val == 2: return True
                if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "exponential": return True
            return False
        except Exception:
            return False

    def _evaluate_organic_growth(self, target_id, value_node):
        try:
            var_t = self.var_types.get(target_id)
            if not var_t:
                if 'tup' in target_id.lower(): var_t = 'tuple'
                elif 'str' in target_id.lower(): var_t = 'str'
                
            if var_t not in ['str', 'list', 'tuple', 'set', 'dict', 'deque'] and not self._is_linear_var(target_id):
                return "O(1)", "O(1)", None
                
            self_references = sum(1 for n in safe_walk(value_node) if isinstance(n, ast.Name) and n.id == target_id)
            
            is_mult = False
            for n in safe_walk(value_node):
                if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult):
                    val1 = extract_constant(n.right) or 0
                    val2 = extract_constant(n.left) or 0
                    if (isinstance(n.left, ast.Name) and n.left.id == target_id and isinstance(val1, (int, float)) and val1 > 1) or \
                       (isinstance(n.right, ast.Name) and n.right.id == target_id and isinstance(val2, (int, float)) and val2 > 1):
                        is_mult = True
                        break
            
            active_loops = [d for d in self.loop_stack if d != '1']
            loop_multiplier = len(active_loops)
            
            if self_references >= 2 or is_mult:
                if loop_multiplier > 0:
                    self.max_exp = 1
                    return "O(2^n)", "O(2^n)", "Geometric Expansion"
                return "O(n)", "O(n)", "Geometric Expansion"
                    
            elif self_references == 1:
                if var_t == 'tuple':
                    if loop_multiplier > 0:
                        return "O(n^2)", "O(n^2)", "Tuple Immutability Recreation"
                    return "O(n)", "O(n)", "Tuple Recreation"
                    
                if var_t == 'str':
                    if loop_multiplier > 1:
                        return "O(n^2)", "O(1)", "String Concatenation (Immutable)"
                    return "O(n)", "O(1)", "String Build"

                if loop_multiplier > 0:
                    space_str = "n^2" if var_t in ['tuple'] else "n"
                    time_str = "n^2"
                    return f"O({time_str})", f"O({space_str})", "Linear Accumulation"
                    
                return "O(1)", "O(1)", "Linear Accumulation"
                
            return "O(1)", "O(1)", None
        except Exception:
            return "O(1)", "O(1)", None

    def _is_set_bitwise_op(self, node):
        try:
            if not isinstance(node, ast.BinOp): return False
            if not isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)): return False
            
            for child in safe_walk(node):
                if isinstance(child, (ast.Set, ast.SetComp)): return True
                if isinstance(child, ast.Name):
                    if self.var_types.get(child.id) == 'set': return True
                    if 'set' in child.id.lower(): return True
            return False
        except Exception:
            return False
