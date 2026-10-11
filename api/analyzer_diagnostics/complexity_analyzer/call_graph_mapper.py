"""
Call Graph Mapper

BFS-based call graph construction, reachability, and recursion/cycle
detection -- the "BFS Call Graph & Reachability Mapper" stage of the
complexity analysis model.
"""
import ast
from collections import deque
from complexity_analyzer.code_preprocessor import safe_walk, extract_constant
import re


class CallGraphMapper:
    """BFS Call Graph & Reachability Mapper. Composed into ComplexityAnalyzer
    as `self.call_graph_mapper`; reads/writes shared state via `self.analyzer`.
    """

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def bfs_first_pass(self, tree):
        from collections import deque
        queue = deque([(tree, None)])
        
        self.analyzer.call_graph = {'__main__': []}
        self.analyzer.reachable_funcs = set()
        # Every def seen in the module, reachable or not. Kept separate from
        # `reachable_funcs` on purpose: previously each def was added to the
        # reachable set the moment it was dequeued, so the sweep below was
        # seeded with *every* function and nothing could ever be flagged
        # dead -- an uncalled O(n^2) helper still inflated the overall badge.
        defined_funcs = set()
        # Names a scope merely *mentions* without calling (callbacks such as
        # `sorted(xs, key=helper)`, `map(helper, xs)`, `obj.method` handed
        # around). They keep a function alive but are not call-graph edges,
        # so recursion detection and the topological order stay unchanged.
        refs = {}
        # Functions the interpreter can reach without an explicit call site.
        implicit_roots = set()
        
        ignore_set = set(self.analyzer.builtin_complexities.keys()).union({
            'print', 'len', 'range', 'int', 'str', 'float', 'enumerate', 'zip', 'map', 'filter', 'list', 'set', 'dict', 'tuple', 'bool', 'type', 'isinstance', 'abs', 'round', 'floor', 'ceil'
        })
        
        # Optional observer for the "Pipeline" tab replay (see
        # pipeline_trace.py). None during normal analysis/benchmarks, so
        # these hooks are purely observational and never change results.
        rec = getattr(self.analyzer, 'pipeline_recorder', None)
        if rec: rec.emit('callgraph', 'start', msg="Queue seeded with the module root; walking the AST breadth-first.")
        while queue:
            current_node, current_func = queue.popleft()  
            if isinstance(current_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.analyzer.symbol_table[current_node.name] = current_node  
                defined_funcs.add(current_node.name)
                if self._is_implicitly_invoked(current_node):
                    implicit_roots.add(current_node.name)
                current_func = current_node.name  
                if current_func not in self.analyzer.call_graph:
                    self.analyzer.call_graph[current_func] = []  
                if rec: rec.emit('callgraph', 'func', name=current_func, line=getattr(current_node, 'lineno', -1), msg=f"Dequeued def {current_func}() -> added to the symbol table and call graph.")
            elif isinstance(current_node, ast.Name) and isinstance(current_node.ctx, ast.Load):
                refs.setdefault(current_func if current_func else '__main__', set()).add(current_node.id)
            elif isinstance(current_node, ast.Attribute) and isinstance(current_node.ctx, ast.Load):
                refs.setdefault(current_func if current_func else '__main__', set()).add(current_node.attr)
            elif isinstance(current_node, ast.Call):
                called_func = None
                if isinstance(current_node.func, ast.Name):
                    called_func = current_node.func.id
                elif isinstance(current_node.func, ast.Attribute):
                    called_func = current_node.func.attr
                    
                if called_func and called_func not in ignore_set:
                    caller = current_func if current_func else '__main__'
                    line_num = getattr(current_node, 'lineno', -1)
                    
                    hits = self.analyzer.trace_data.get("line_hits", {}).get(line_num, 0)
                    if not any(e['target'] == called_func and e['line'] == line_num for e in self.analyzer.call_graph[caller]):
                        self.analyzer.call_graph[caller].append({'target': called_func, 'line': line_num, 'hits': hits})
                        if rec: rec.emit('callgraph', 'edge', src=caller, dst=called_func, line=line_num, msg=f"Found call on line {line_num}: {caller} -> {called_func}.")
            
            for child in ast.iter_child_nodes(current_node):
                if isinstance(child, ast.AST):
                    queue.append((child, current_func))
        
        # Reachability sweep: start from the entry point (top-level script
        # code, i.e. `__main__`) plus anything the interpreter invokes
        # implicitly, and follow call edges and callback references. A def
        # that nothing live ever reaches is dead code and must not count
        # toward the program's complexity.
        def callees(node):
            out = {e['target'] for e in self.analyzer.call_graph.get(node, [])}
            out |= (refs.get(node, set()) & defined_funcs)
            return out

        entry_targets = callees('__main__') & defined_funcs
        # A snippet that is only definitions (no driver code calling anything
        # it defines) has no entry point to prune against: the learner wants
        # that function analysed, so keep every def live in that case instead
        # of reporting the whole program as dead.
        has_entry_point = bool(entry_targets)
        if has_entry_point:
            roots = set(entry_targets) | implicit_roots
        else:
            roots = set(defined_funcs)

        visited = set(roots)
        reach_queue = deque(roots)
        while reach_queue:
            curr = reach_queue.popleft()
            for neighbor in callees(curr):
                if neighbor not in visited:
                    visited.add(neighbor)
                    reach_queue.append(neighbor)
        self.analyzer.defined_funcs = set(defined_funcs)
        self.analyzer.reachable_funcs = visited & defined_funcs
        self.analyzer.dead_funcs = defined_funcs - self.analyzer.reachable_funcs
        self.analyzer.has_entry_point = has_entry_point
        reasons = {}
        for fn in self.analyzer.dead_funcs:
            callers = sorted({c for c, edges in self.analyzer.call_graph.items()
                              if c != fn and c != '__main__' and any(e['target'] == fn for e in edges)} & self.analyzer.dead_funcs)
            if callers:
                names = ", ".join(f"`{c}()`" for c in callers)
                reasons[fn] = {"kind": "uncalled_function",
                               "reason": f"`{fn}()` is only called from dead code ({names}), which never runs, so `{fn}()` never runs either and is left out of the total."}
            else:
                reasons[fn] = {"kind": "uncalled_function",
                               "reason": f"`{fn}()` is never called, so its body never runs and is left out of the complexity total."}
        self.analyzer.dead_func_reasons = reasons
        # Functions that are only called from a dead one never run either;
        # `visited` already excludes them because dead functions are never
        # roots, so nothing more to propagate here.
        
        for func_name, edges in self.analyzer.call_graph.items():
            if any(e['target'] == func_name for e in edges): 
                self.analyzer.custom_functions[func_name] = "T(n)"  
        self.detect_indirect_recursion()
        if rec:
            rec.emit('callgraph', 'flags',
                     reachable=sorted(self.analyzer.reachable_funcs),
                     dead=sorted(self.analyzer.dead_funcs),
                     entry=bool(self.analyzer.has_entry_point),
                     recursive=sorted(k for k in self.analyzer.custom_functions if k != '__main__'),
                     indirect=sorted(k for k in self.analyzer.indirect_recursive_funcs if k != '__main__'),
                     msg=(("Reachability swept from __main__; " + (f"{len(self.analyzer.dead_funcs)} uncalled function(s) flagged as dead code and excluded from the total; " if self.analyzer.dead_funcs else "every function is reachable; ") + "recursion/cycle flags set.")
                          if self.analyzer.has_entry_point else
                          "No driver code calls the defined functions, so every function is analysed as a library entry point; recursion/cycle flags set."))
        self.analyzer.topological_sequencer.compute_topological_order()

    @staticmethod
    def _is_implicitly_invoked(func_node):
        """Defs the runtime calls without an explicit call site: dunder
        methods (`__init__`, `__str__`, `__iter__`...) and property-style
        accessors. They count as live entry points, never as dead code."""
        name = func_node.name
        if name.startswith('__') and name.endswith('__'):
            return True
        for dec in getattr(func_node, 'decorator_list', []):
            target = dec.func if isinstance(dec, ast.Call) else dec
            dname = target.attr if isinstance(target, ast.Attribute) else getattr(target, 'id', '')
            if dname in ('property', 'cached_property', 'setter', 'getter', 'deleter'):
                return True
        return False

    def detect_indirect_recursion(self):
        indirect_graph = {u: {v['target'] for v in edges if v['target'] != u} for u, edges in self.analyzer.call_graph.items()}
        for func in indirect_graph:
            visited, rec_stack = set(), set()
            if self._has_cycle(func, visited, rec_stack, indirect_graph, 0):
                self.analyzer.custom_functions[func] = "T(n)"
                self.analyzer.indirect_recursive_funcs.add(func)

    def _has_cycle(self, node, visited, rec_stack, graph, depth):
        if depth > 100: return False
        if node in rec_stack: return True
        if node in visited: return False
        visited.add(node); rec_stack.add(node)
        for neighbor in graph.get(node, []):
            if self._has_cycle(neighbor, visited, rec_stack, graph, depth + 1): return True
        rec_stack.remove(node); return False

    def _detect_graph_context(self, node):
        has_queue_while = has_neighbor_for = has_recursive_for = has_visited_set = False
        rec_calls = 0
        has_grid_checks = False
        
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for child in safe_walk(node):
                if isinstance(child, ast.While):
                    for sub in safe_walk(child):
                        if isinstance(sub, ast.Call) and isinstance(getattr(sub, 'func', None), ast.Attribute):
                            if sub.func.attr in ['pop', 'popleft']: has_queue_while = True
                        if isinstance(sub, ast.Call) and getattr(getattr(sub, 'func', None), 'attr', '') == 'pop' and getattr(sub, 'args', []):
                            if extract_constant(sub.args[0]) == 0: has_queue_while = True
                if isinstance(child, ast.For):
                    if isinstance(child.iter, ast.Subscript): has_neighbor_for = True
                    if isinstance(child.iter, ast.Name) and any(kw in child.iter.id.lower() for kw in ['neighbor', 'adj', 'graph', 'child']): has_neighbor_for = True
                    if isinstance(child.iter, ast.Attribute) and child.iter.attr in ['graph', 'adj', 'adjList']: has_neighbor_for = True
                    for sub in safe_walk(child):
                        if isinstance(sub, ast.Call) and getattr(getattr(sub, 'func', None), 'id', '') == node.name: has_recursive_for = True
                if isinstance(child, ast.Call):
                    if isinstance(getattr(child, 'func', None), ast.Attribute):
                        if child.func.attr in ['add', 'append'] and isinstance(getattr(child.func, 'value', None), ast.Name) and any(kw in child.func.value.id.lower() for kw in ['visit', 'seen', 'explored', 'marked', 'color']): has_visited_set = True
                    if isinstance(getattr(child, 'func', None), ast.Name) and child.func.id == node.name:
                        rec_calls += 1
                # Also catch the equally-common "mark visited via assignment"
                # idiom -- visited[i][j] = True / seen[node] = 1 / marked[x]
                # = True -- not just the `.add()`/`.append()` call style above.
                # This is real evidence of a memoized/bounded traversal, and
                # broadening it here reduces the risk of regressions from
                # tightening the name-hint requirement below.
                if isinstance(child, ast.Assign):
                    for t in child.targets:
                        base = t.value if isinstance(t, ast.Subscript) else t
                        if isinstance(base, ast.Name) and any(kw in base.id.lower() for kw in ['visit', 'seen', 'explored', 'marked', 'color']):
                            has_visited_set = True
                if isinstance(child, ast.Compare) and any(isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for op in getattr(child, 'ops', [])):
                    if any(getattr(n, 'id', '') in ['row', 'col', 'grid', 'matrix'] for n in safe_walk(child)):
                        has_grid_checks = True

        func_name = getattr(node, 'name', '').lower()
        if re.search(r'\b(bst|binary_?tree|tree_?node)\b', func_name) and not ('graph' in func_name or 'maze' in func_name):
            return False 
            
        name_hints = any(re.search(rf'\b{k}\b', func_name) for k in ['maze', 'graph', 'dfs', 'bfs', 'flood', 'fill', 'island', 'rotten', 'grid', 'matrix', 'adj', 'mirror'])
        
        # A name like "DFS"/"BFS"/"grid"/"matrix" alone is NOT sufficient
        # evidence of a bounded O(V+E) traversal -- unbounded exponential
        # backtracking searches (e.g. word-search over a grid, N-Queens,
        # Sudoku solvers) are routinely named this way too, and without a
        # visited/seen marker (or a genuine neighbor-list style loop) to
        # prevent revisiting states, the real complexity is exponential, not
        # linear in V+E. Bare index-range checks (`0 <= row < ROWS`) are
        # NOT that evidence either -- they're just bounds validation and
        # appear in both bounded graph traversals and unbounded backtracking
        # alike, so they no longer count as corroboration on their own.
        return (has_queue_while and (has_neighbor_for or has_visited_set)) or \
               (has_recursive_for and (has_neighbor_for or has_visited_set)) or \
               (rec_calls >= 2 and has_visited_set) or \
               (name_hints and (has_visited_set or has_neighbor_for))

    def _is_graph_while_loop(self, node):
        try:
            if not getattr(self.analyzer, 'in_graph_context', False): return False
            if not isinstance(node, ast.While): return False
            for child in safe_walk(node):
                if isinstance(child, ast.Call) and isinstance(getattr(child, 'func', None), ast.Attribute):
                    if child.func.attr in ['pop', 'popleft', 'append', 'add', 'remove', 'extend']: return True
            return False
        except Exception:
            return False
        
    # PHASE 2b optimization: each of the four wrapped classifiers below is
    # confirmed (by call-site audit) to be invoked twice on the very same
    # loop node -- once directly by visit_For/visit_While to decide which
    # branch to take, and a second time internally by record_line's own
    # reclassification block (record_line is called with time_override=None
    # right after, and re-derives the same node/log/sqrt/graph/constant
    # flags from scratch). Both calls happen back-to-back with no relevant
    # self-state mutation in between, so caching by node identity is safe.
    # The cache is intentionally cleared in reset_state() (see below) since
    # some of these classifiers read traversal-position-dependent state
    # (self.analyzer.variable_complexities, self.analyzer.loop_depth) that is reset between
    # Phase 2a (topological signature pre-pass) and Phase 2b (final pass).
    def _is_graph_for_loop(self, node):
        key = ('_is_graph_for_loop', id(node))
        cache = self.analyzer._loop_classify_cache
        if key not in cache:
            cache[key] = self._is_graph_for_loop_uncached(node)
        return cache[key]

    def _is_graph_for_loop_uncached(self, node):
        try:
            if not getattr(self.analyzer, 'in_graph_context', False): return False
            if not isinstance(node, ast.For): return False
            if isinstance(node.iter, ast.Subscript): return True
            if isinstance(node.iter, ast.Name) and any(kw in node.iter.id.lower() for kw in ['neighbor', 'adj', 'graph', 'child']): return True
            if isinstance(node.iter, ast.Attribute) and node.iter.attr in ['graph', 'adj', 'adjList']: return True
            return False
        except Exception:
            return False
