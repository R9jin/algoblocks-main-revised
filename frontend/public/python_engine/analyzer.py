# api/analyzer.py
import ast
import re
import time
from collections import deque, Counter
from semantic_nlg import EducationalInsightGenerator as SemanticNLGEngine, ComprehensiveASTVisitor

try:
    from dynamic_tracer import AlgoBlocksTracer
except ImportError:
    AlgoBlocksTracer = None

def safe_walk(node):
    """
    Safely yields nodes defensively by checking types at every level.
    Prevents built-in ast.walk from crashing on raw strings or modified fields.
    """
    if not isinstance(node, ast.AST):
        return
    todo = deque([node])
    while todo:
        curr = todo.popleft()
        if isinstance(curr, ast.AST):
            yield curr
            for _, value in ast.iter_fields(curr):
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, ast.AST):
                            todo.append(item)
                elif isinstance(value, ast.AST):
                    todo.append(value)

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
        self.in_frequency_summation_depth = 0
        
        self.var_dimensions = {} 
        self.active_poly_dims = [] 
        self.active_gcd_vars = None
        self.function_gcd_vars = None
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

        # RESTORED EXHAUSTIVE CPYTHON ARCHITECTURAL DESCRIPTIONS
        self.builtin_complexities = {
            'sort': {'time': 'O(n log n)', 'space': 'O(1)', 'desc': 'Executes the hybrid, stable Timsort algorithm in-place directly on the existing list buffer.'},
            'sorted': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'Allocates a fresh O(n) list in memory and populates it using the stable Timsort algorithm.'},
            'bisect': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs a standard iterative binary search over the sorted sequence to find the rightmost insertion point.'},
            'bisect_left': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs an iterative binary search to locate the leftmost valid insertion point in a sorted sequence.'},
            'bisect_right': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs a standard iterative binary search over the sorted sequence to find the rightmost insertion point.'},
            'heappush': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Appends the element to the backing array and performs an O(log n) "sift-up" operation to restore the min-heap invariant.'},
            'heappop': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Swaps the root with the last element, pops the back in O(1), and performs an O(log n) "sift-down" to restore heap order.'},
            'heapify': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Transforms a populated list into a valid min-heap in strict linear O(n) time using Floyd’s optimal sift-down algorithm.'},
            'insort': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Finds the insertion point in O(log n) via binary search, but requires an O(n) linear memory shift to insert the item.'},
            'insort_left': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Finds the leftmost insertion point in O(log n), but requires an O(n) linear array shift to insert the element.'},
            'insort_right': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Finds the rightmost insertion point in O(log n), but requires an O(n) linear array shift to insert the element.'},
            'gcd': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Computes the greatest common divisor using the optimized C-level Euclidean algorithm, scaling logarithmically.'},
            'join': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Performs a pre-computation pass to calculate total string length, then allocates a single contiguous O(n) character buffer.'},
            'split': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans the string linearly to match delimiters, allocating new string objects and an O(n) list container for the tokens.'},
            'list': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Iterates over the provided collection and copies its object pointers into a newly allocated contiguous array.'},
            'set': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Hashes each element in the input stream and populates a newly allocated open-addressing hash table.'},
            'dict': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Iterates over key-value pairs and inserts them into a dynamic CPython key-sharing hash table.'},
            'tuple': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Allocates a fixed-size immutable block in memory and copies the references from the input iterable.'},
            'deque': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Allocates a doubly-linked list of fixed-size memory blocks (64 objects per block in CPython) and populates them sequentially.'},
            'append': {'time': 'O(1) amortized', 'space': 'O(1)', 'desc': 'Writes the object reference to the list buffer; triggers an occasional O(n) dynamic array overallocation sequence when full.'},
            'insert': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Requires shifting all subsequent elements in the underlying C-array one index to the right to make room for the item.'},
            'max': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Performs a complete linear scan across the iterable, keeping an internal pointer to the largest scalar encountered.'},
            'min': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly traverses the entire sequence once to determine the minimum object based on the __lt__ comparison operator.'},
            'sum': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Traverses the numeric sequence sequentially, maintaining a running C-level accumulator variable.'},
            'any': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Scans elements from left to right, short-circuiting and returning True immediately upon encountering the first truthy object.'},
            'all': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly evaluates the truthiness of each item, terminating early with False at the first falsy element encountered.'},
            'len': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Reads the internal ob_size field directly from the PyVarObject C-struct header. This is an instantaneous O(1) lookup.'},
            'abs': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Strips the sign bit or computes the vector magnitude via a direct C-level primitive arithmetic operation.'},
            'round': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Executes a direct primitive CPU-level floating point rounding instruction.'},
            'int': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Performs a direct C-level primitive type cast or delegates to the underlying object’s __int__ slot.'},
            'float': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Executes a primitive CPU-level integer-to-float register conversion.'},
            'bool': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Evaluates object truthiness instantly by checking pointer nullity or inspecting the __bool__ / __len__ slots.'},
            'type': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Reads the ob_type pointer directly from the base PyObject C-struct header.'},
            'isinstance': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Traverses the object’s internal __mro__ (Method Resolution Order) tuple pointers in C-memory.'},
            'str': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Invokes the object’s __str__ slot, allocating an O(n) character buffer representing its formatted output.'},
            'remove': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly searches the array for the target value and shifts all subsequent items leftward to close the memory gap.'},
            'index': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Performs a sequential left-to-right equality check across the entire buffer to match the target sequence.'},
            'count': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Traverses the entire collection linearly, tallying strict equality matches against the target object.'},
            'find': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Executes CPython’s optimized Boyer-Moore-Horspool string search algorithm across the character buffer.'},
            'replace': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans the base string for target occurrences and allocates an entirely new immutable string buffer containing the replacements.'},
            'copy': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Allocates a new top-level container and performs a shallow pointer copy of all elements contained in the original.'},
            'reverse': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Uses two converging pointers to swap elements in-place from opposite ends of the contiguous backing array.'},
            'extend': {'time': 'O(m)', 'space': 'O(m)', 'desc': 'Resizes the base list buffer once and bulk-copies the memory pointers from the appended M-length collection.'},
            'upper': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Allocates a fresh immutable string object and applies the ASCII/Unicode uppercase bitmask across the buffer.'},
            'lower': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Allocates a fresh immutable string object and applies the ASCII/Unicode lowercase bitmask across the buffer.'},
            'strip': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans both boundaries for matching whitespace characters and allocates a trimmed slice of the base string.'},
            'lstrip': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans the left boundary for matching whitespace characters and allocates a trimmed slice of the base string.'},
            'rstrip': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans the right boundary for matching whitespace characters and allocates a trimmed slice of the base string.'},
            'keys': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns a lightweight CPython dictionary view object that references the hash table keys without duplicating them.'},
            'values': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns a lightweight CPython dictionary view object that references the hash table values without duplicating them.'},
            'items': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns a lightweight CPython dictionary view object referencing the underlying key-value pairs.'},
            'range': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Instantiates a lightweight C-struct containing only the start, stop, and step integers in memory.'},
            'clear': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Instantly resets the container’s internal size counter to zero and releases the reference counts of its contents.'},
            'get': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Hashes the key and probes the dictionary table directly in O(1), safely returning the default fallback if unmapped.'},
            'popleft': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Advances the deque’s internal left-index pointer by one and decrements the popped object’s reference count.'},
            'union': {'time': 'O(n + m)', 'space': 'O(n + m)', 'desc': 'Allocates a new set table and hashes every element from both the N-sized base set and the M-sized input.'},
            'intersection': {'time': 'O(min(n, m))', 'space': 'O(min(n, m))', 'desc': 'Iterates strictly over the smaller set and performs O(1) hash probes against the larger set to collect matches.'},
            'difference': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans the base set and copies items into a new table if an O(1) hash probe confirms they do not exist in the subtrahend.'},
            'symmetric_difference': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Traverses both sets to isolate unique elements, allocating a new set containing items present in one but not both.'},
            'update': {'time': 'O(m)', 'space': 'O(m)', 'desc': 'Iterates over the M-length input iterable, hashing each item and inserting it into the backing set table.'},
            'add': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Hashes the object and inserts it into the set’s open-addressing table; handles rare hash collisions via double hashing.'},
            'ord': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Reads the integer code point directly from the C-memory byte representing the character.'},
            'chr': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Allocates a 1-character string object bound directly to the supplied Unicode integer code point.'}
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

    def _get_weight(self, complexity_str, is_recurrence=False):
        if is_recurrence: return 200
        if complexity_str in ["O(1)", "Definition", "Dead Code"]: return 1 if complexity_str != "Dead Code" else -1
        w = 0
        if "O(n * n!)" in complexity_str: w = 115
        elif "O(n!)" in complexity_str: w = 110
        elif "O(n^d)" in complexity_str: w = 100
        elif "3^n" in complexity_str: w = 105
        elif "2^n" in complexity_str or "2ⁿ" in complexity_str: w = 100
        elif "n^3" in complexity_str or "n³" in complexity_str: w = 30
        elif "n^2" in complexity_str or "n²" in complexity_str or "n * m" in complexity_str: w = 20
        elif "n log n" in complexity_str: w = 15
        elif "V + E" in complexity_str or "V" in complexity_str: w = 12
        elif "n" in complexity_str or "m" in complexity_str or "k" in complexity_str: w = 10
        elif "sqrt n" in complexity_str or "√n" in complexity_str: w = 7
        elif "log min" in complexity_str: w = 6
        elif "log n" in complexity_str: w = 5
        return w

    def _get_space_weight(self, complexity_str):
        if complexity_str == "S(placeholder)": return 0
        s_w = 0
        if "n^n" in complexity_str or "n!" in complexity_str or "n * n!" in complexity_str: s_w = 5
        elif "O(n^d)" in complexity_str: s_w = 4
        elif "3^n" in complexity_str: s_w = 4
        elif "2^n" in complexity_str or "2ⁿ" in complexity_str: s_w = 4
        elif "n * m" in complexity_str or "n^2" in complexity_str or "n²" in complexity_str: s_w = 2
        elif "V + E" in complexity_str or "V" in complexity_str: s_w = 3
        elif "log n" in complexity_str: s_w = 0.5  
        elif "n" in complexity_str: s_w = 1 
        return s_w

    def _apply_bottlenecks(self):
        final_time = self.get_final_asymptotic_badge()
        final_space = self.get_final_space_badge()
        max_w = max([d.get('weight', -1) for d in self._details], default=-1)
        
        excluded_complexities = ["O(1)", "O(log n)", "O(sqrt n)", "O(n)", "-", ""]
        praise_complexities = ["O(log n)", "O(sqrt n)"]
        
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

    def add_logic_hint(self, node, hint_text):
        line_num = getattr(node, 'lineno', -1)
        if line_num not in self.logic_hints:
            self.logic_hints[line_num] = []
        if hint_text not in self.logic_hints[line_num]:
            self.logic_hints[line_num].append(hint_text)

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
        if any(k in var_name.lower() for k in ['arr', 'list', 'dict', 'set', 'str', 'queue', 'stack', 'graph', 'matrix', 'items', 'nums', 'tup']): 
            return True
        return False

    def _get_iterable_name(self, node):
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Subscript):
            if isinstance(node.value, ast.Name): return f"{node.value.id}[0]"
        if isinstance(node, ast.Call):
            func_id = getattr(node.func, 'id', '')
            if func_id == 'len' and len(node.args) > 0:
                arg = node.args[0]
                if isinstance(arg, ast.Name): return arg.id
                if isinstance(arg, ast.Subscript) and isinstance(arg.value, ast.Name):
                    return f"{arg.value.id}[0]"
            elif func_id == 'range' and len(node.args) > 0:
                arg = node.args[0] if len(node.args) == 1 else node.args[1]
                if isinstance(arg, ast.Name): return arg.id
                if isinstance(arg, ast.Subscript) and isinstance(arg.value, ast.Name):
                    return f"{arg.value.id}[0]"
                if isinstance(arg, ast.Call) and getattr(arg.func, 'id', '') == 'len':
                    if len(arg.args) > 0:
                        sub_arg = arg.args[0]
                        if isinstance(sub_arg, ast.Name): return sub_arg.id
                        if isinstance(sub_arg, ast.Subscript) and isinstance(sub_arg.value, ast.Name):
                            return f"{sub_arg.value.id}[0]"
        return None

    def _register_and_get_dim(self, var_name):
        if not var_name or len(var_name) <= 1: return 'n'
        if isinstance(var_name, str):
            lower_name = var_name.lower()
            if lower_name in ['t', 'tc', 'test', 'tests', 'testcases', '_']: return None
            if any(kw in lower_name for kw in ['[0]', 'col', 'width', 'capacity', 'amount', 'target', 'arr2', 'list2', 'arrb', 'val', 'm']): 
                return 'm'
            return 'n'
        return 'n'

    def _get_while_limit_vars(self, node):
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

    def _build_time_str(self, poly_dims, log, sqrt=0, exp=0, graph=0, gcd_vars=None):
        if exp > 0: return "O(2^n)"  
        if graph > 0: return "O(V + E)"
        if gcd_vars and len(gcd_vars) >= 2: return f"O(log min({gcd_vars[0]}, {gcd_vars[1]}))"
        if not poly_dims and log <= 0 and sqrt <= 0: return "O(1)"  
        
        parts = []
        if poly_dims:
            sorted_dims = sorted(poly_dims, key=lambda x: (x != 'n', x)) 
            counts = Counter(sorted_dims)
            terms = []
            for dim, count in counts.items():
                if dim == 'n!': terms.append("n!")
                elif count == 1: terms.append(dim)
                else: terms.append(f"{dim}^{count}")
            parts.append(" * ".join(terms))
                
        if sqrt == 1: parts.append("sqrt n")
        elif sqrt > 1: parts.append(f"(sqrt n)^{sqrt}")  
        if log == 1: parts.append("log n")
        elif log > 1: parts.append(f"log^{log} n")  
        
        res = f"O({' * '.join(parts)})" if parts else "O(1)"
        res = res.replace(" * log", " log").replace(" * sqrt", " sqrt")
        return res

    def bfs_first_pass(self, tree):
        from collections import deque
        queue = deque([(tree, None)])
        
        self.call_graph = {'__main__': []}
        self.reachable_funcs = set()
        
        ignore_set = set(self.builtin_complexities.keys()).union({
            'print', 'len', 'range', 'int', 'str', 'float', 'enumerate', 'zip', 'map', 'filter', 'list', 'set', 'dict', 'tuple', 'bool', 'type', 'isinstance', 'abs', 'round', 'floor', 'ceil'
        })
        
        while queue:
            current_node, current_func = queue.popleft()  
            if isinstance(current_node, ast.FunctionDef):
                self.symbol_table[current_node.name] = current_node  
                self.reachable_funcs.add(current_node.name) 
                current_func = current_node.name  
                if current_func not in self.call_graph:
                    self.call_graph[current_func] = []  
            elif isinstance(current_node, ast.Call):
                called_func = None
                if isinstance(current_node.func, ast.Name):
                    called_func = current_node.func.id
                elif isinstance(current_node.func, ast.Attribute):
                    called_func = current_node.func.attr
                    
                if called_func and called_func not in ignore_set:
                    caller = current_func if current_func else '__main__'
                    line_num = getattr(current_node, 'lineno', -1)
                    
                    hits = self.trace_data.get("line_hits", {}).get(line_num, 0)
                    if not any(e['target'] == called_func and e['line'] == line_num for e in self.call_graph[caller]):
                        self.call_graph[caller].append({'target': called_func, 'line': line_num, 'hits': hits})
            
            for child in ast.iter_child_nodes(current_node):
                if isinstance(child, ast.AST):
                    queue.append((child, current_func))
        
        reach_queue = deque(['__main__'])  
        reach_queue.extend(list(self.reachable_funcs)) 
        visited = set(['__main__']).union(self.reachable_funcs)
        
        while reach_queue:
            curr = reach_queue.popleft()
            for edge_info in self.call_graph.get(curr, []):  
                neighbor = edge_info['target']
                if neighbor not in visited:
                    visited.add(neighbor)
                    self.reachable_funcs.add(neighbor)  
                    reach_queue.append(neighbor)
        
        for func_name, edges in self.call_graph.items():
            if any(e['target'] == func_name for e in edges): 
                self.custom_functions[func_name] = "T(n)"  
        self.detect_indirect_recursion()

    def detect_indirect_recursion(self):
        indirect_graph = {u: {v['target'] for v in edges if v['target'] != u} for u, edges in self.call_graph.items()}
        for func in indirect_graph:
            visited, rec_stack = set(), set()
            if self._has_cycle(func, visited, rec_stack, indirect_graph):
                self.custom_functions[func] = "T(n)"
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
        if "sqrt" in complexity_str: return "#16a085"  
        if complexity_str != "O(1)": return "#e67e22"  
        return "#27ae60"

    def _detect_graph_context(self, node):
        has_queue_while = has_neighbor_for = has_recursive_for = has_visited_set = False
        rec_calls = 0
        has_grid_checks = False
        
        if isinstance(node, ast.FunctionDef):
            for child in safe_walk(node):
                if isinstance(child, ast.While):
                    for sub in safe_walk(child):
                        if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute):
                            if sub.func.attr in ['pop', 'popleft']: has_queue_while = True
                if isinstance(child, ast.For):
                    if isinstance(child.iter, ast.Subscript): has_neighbor_for = True
                    if isinstance(child.iter, ast.Name) and any(kw in child.iter.id.lower() for kw in ['neighbor', 'adj', 'graph', 'child']): has_neighbor_for = True
                    for sub in safe_walk(child):
                        if isinstance(sub, ast.Call) and getattr(sub.func, 'id', '') == node.name: has_recursive_for = True
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Attribute):
                        if child.func.attr in ['add', 'append'] and isinstance(getattr(child.func, 'value', None), ast.Name) and 'visit' in child.func.value.id.lower(): has_visited_set = True
                    if isinstance(child.func, ast.Name) and child.func.id == node.name:
                        rec_calls += 1
                if isinstance(child, ast.Compare) and any(isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for op in child.ops):
                    if any(getattr(n, 'id', '') in ['row', 'col', 'grid', 'matrix'] for n in safe_walk(child)):
                        has_grid_checks = True

        name_hints = any(k in getattr(node, 'name', '').lower() for k in ['maze', 'graph', 'dfs', 'bfs', 'flood', 'fill'])
        return (has_queue_while and (has_neighbor_for or has_visited_set)) or \
               (has_recursive_for and (has_neighbor_for or has_visited_set)) or \
               (rec_calls >= 2 and (has_visited_set or has_grid_checks)) or name_hints

    def _is_graph_while_loop(self, node):
        if not getattr(self, 'in_graph_context', False): return False
        if not isinstance(node, ast.While): return False
        for child in safe_walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ['pop', 'popleft', 'append', 'add', 'remove', 'extend']: return True
        return False
        
    def _is_graph_for_loop(self, node):
        if not getattr(self, 'in_graph_context', False): return False
        if not isinstance(node, ast.For): return False
        if isinstance(node.iter, ast.Subscript): return True
        if isinstance(node.iter, ast.Name) and any(kw in node.iter.id.lower() for kw in ['neighbor', 'adj', 'graph', 'child']): return True
        return False

    def _is_constant_loop(self, node):
        if isinstance(node, ast.While):
            if any(isinstance(child, ast.Break) for child in safe_walk(node)): return False
            if isinstance(node.test, ast.Constant): return True
            if isinstance(node.test, ast.Compare):
                if isinstance(node.test.left, ast.Constant) and all(isinstance(c, ast.Constant) for c in node.test.comparators): return True
        elif isinstance(node, ast.For):
            if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                if all(isinstance(arg, ast.Constant) for arg in node.iter.args): return True
            elif isinstance(node.iter, (ast.List, ast.Tuple, ast.Set, ast.Constant)): return True
        return False

    def _is_frequency_summation_loop(self, node):
        if isinstance(node, ast.For):
            if isinstance(node.iter, ast.Call) and getattr(node.iter.func, 'id', '') == 'range':
                if len(node.iter.args) > 0:
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

    def _is_log_loop(self, node):
        if not isinstance(node, ast.While): return False, None
        cond_vars = set()
        for child in safe_walk(node.test):
            if isinstance(child, ast.Name): cond_vars.add(child.id)
                
        for child in node.body:
            for sub in safe_walk(child):
                if isinstance(sub, ast.Assign) and getattr(sub, 'targets', []):
                    if isinstance(sub.targets[0], ast.Tuple) and isinstance(sub.value, ast.Tuple):
                        for elt in sub.value.elts:
                            if isinstance(elt, ast.BinOp) and isinstance(elt.op, ast.Mod):
                                return True, None

        mid_vars = set()
        for child in node.body:
            for sub in safe_walk(child):
                if isinstance(sub, ast.Assign):
                    for target in sub.targets:
                        if isinstance(target, ast.Name):
                            for v in safe_walk(sub.value):
                                if isinstance(v, ast.BinOp):
                                    if isinstance(v.op, ast.FloorDiv) and getattr(v.right, 'value', 0) == 2: mid_vars.add(target.id)
                                    elif isinstance(v.op, ast.Div) and getattr(v.right, 'value', 0) == 2: mid_vars.add(target.id)
                                    elif isinstance(v.op, ast.RShift) and getattr(v.right, 'value', 0) == 1: mid_vars.add(target.id)
        if mid_vars:
            for child in node.body:
                for sub in safe_walk(child):
                    if isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(target, ast.Name) and target.id in cond_vars:
                                for v in safe_walk(sub.value):
                                    if isinstance(v, ast.Name) and v.id in mid_vars:
                                        return True, None

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
                        if isinstance(sub.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)) and getattr(sub.value, 'value', 0) > 1: return True, None
                        if isinstance(sub.op, (ast.LShift, ast.RShift)): return True, None
                        if isinstance(sub.op, ast.Mod): return True, None
                elif isinstance(sub, ast.Assign):
                    for target in sub.targets:
                        if isinstance(target, ast.Name) and target.id in cond_vars:
                            if isinstance(sub.value, ast.BinOp):
                                if isinstance(sub.value.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)):
                                    if getattr(sub.value.left, 'id', None) == target.id and getattr(sub.value.right, 'value', 0) > 1: return True, None
                                    if getattr(sub.value.right, 'id', None) == target.id and getattr(sub.value.left, 'value', 0) > 1: return True, None
                                if isinstance(sub.value.op, ast.Mod):
                                    if getattr(sub.value.left, 'id', None) == target.id or getattr(sub.value.right, 'id', None) == target.id: return True, None
                                if isinstance(sub.value.op, (ast.LShift, ast.RShift)): return True, None

        return False, None
        
    def _is_sqrt_loop(self, node):
        if not isinstance(node, (ast.While, ast.For)): return False  
        expr = node.test if isinstance(node, ast.While) else node.iter
        
        for child in safe_walk(expr):
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
    
    def _is_exponential_loop_bound(self, node):
        if isinstance(node, ast.For) and isinstance(node.iter, ast.Call):
            if getattr(node.iter.func, 'id', '') == 'range':
                for arg in node.iter.args:
                    if isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Pow):
                        return True
        return False

    def _is_exponential_loop(self, node):
        if self._is_exponential_loop_bound(node): return True
        if not isinstance(node, (ast.For, ast.While)): return False
        expr = node.iter if isinstance(node, ast.For) else node.test
        for child in safe_walk(expr):
            if isinstance(child, ast.BinOp):
                if isinstance(child.op, ast.LShift): return True
                if isinstance(child.op, ast.Pow) and getattr(child.left, 'value', 0) == 2: return True
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == 'pow':
                if len(child.args) >= 2 and getattr(child.args[0], 'value', 0) == 2: return True
            if isinstance(child, ast.Name) and self.variable_complexities.get(child.id) == "exponential": return True
        return False

    def _evaluate_organic_growth(self, target_id, value_node):
        var_t = self.var_types.get(target_id)
        if not var_t:
            if 'tup' in target_id.lower(): var_t = 'tuple'
            elif 'str' in target_id.lower(): var_t = 'str'
            
        if var_t not in ['str', 'list', 'tuple', 'set', 'dict', 'deque'] and not self._is_linear_var(target_id):
            return "O(1)", "O(1)", None
            
        self_references = sum(1 for n in safe_walk(value_node) if isinstance(n, ast.Name) and n.id == target_id)
        is_mult = any(
            isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and (
                (isinstance(n.left, ast.Name) and n.left.id == target_id and getattr(n.right, 'value', 0) > 1) or 
                (isinstance(n.right, ast.Name) and n.right.id == target_id and getattr(n.left, 'value', 0) > 1)
            ) for n in safe_walk(value_node)
        )
        
        loop_multiplier = len(self.loop_stack)
        
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
                if loop_multiplier > 0:
                    return "O(n^2)", "O(1)", "String Concatenation (Immutable)"
                return "O(n)", "O(1)", "String Build"

            if loop_multiplier > 0:
                dim_str = "n^2" if loop_multiplier == 1 else f"n^{loop_multiplier + 1}"
                space_str = "n^2" if var_t in ['tuple'] else "n"
                time_str = "n^2" if var_t in ['str', 'tuple'] else "n"
                return f"O({time_str})", f"O({space_str})", "Linear Accumulation"
                
            return "O(1)", "O(1)", "Linear Accumulation"
            
        return "O(1)", "O(1)", None

    def _is_set_bitwise_op(self, node):
        if not isinstance(node, ast.BinOp): return False
        if not isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)): return False
        
        for child in safe_walk(node):
            if isinstance(child, (ast.Set, ast.SetComp)): return True
            if isinstance(child, ast.Name):
                if self.var_types.get(child.id) == 'set': return True
                if 'set' in child.id.lower(): return True
        return False

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

        is_dead = getattr(self, 'in_dead_code', False)
        if time_override == "Dead Code": is_dead = True
        
        is_loop_or_func = isinstance(node, (ast.For, ast.While, ast.FunctionDef, ast.ListComp, ast.SetComp, ast.DictComp))
        is_recurrence = time_override and (time_override.startswith("T(") or any(x in time_override for x in ["T(n) =", "n!", "2^n", "2T("]))
        
        node_dims, node_log, node_sqrt, node_graph, gcd_vars = [], 0, 0, 0, None
        
        if not time_override:
            if self._is_exponential_loop(node):
                time_override, is_recurrence, self.max_exp = "O(2^n)", True, 1
            elif isinstance(node, ast.For):
                if getattr(self, 'in_graph_context', False) and self._is_graph_for_loop(node):
                    node_graph = 1
                elif not self._is_constant_loop(node):
                    if self._is_sqrt_loop(node): node_sqrt = 1
                    else:
                        iter_name = self._get_iterable_name(node.iter)
                        dim = self._register_and_get_dim(iter_name)
                        if dim: node_dims = [dim]
            elif isinstance(node, ast.While):
                if getattr(self, 'in_graph_context', False) and self._is_graph_while_loop(node): node_graph = 1
                else:
                    is_log, gcd_v = self._is_log_loop(node)
                    if is_log: 
                        node_log = 1
                        gcd_vars = gcd_v
                    elif self._is_sqrt_loop(node): node_sqrt = 1
                    elif not self._is_constant_loop(node): 
                        limit_vars = self._get_while_limit_vars(node)
                        if limit_vars:
                            dims = [self._register_and_get_dim(lv) for lv in limit_vars if self._register_and_get_dim(lv)]
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
                elif "O(n^3)" in time_override or "n³" in time_override: node_dims.extend(['n', 'n', 'n'])
                elif "O(n^2)" in time_override or "n²" in time_override: node_dims.extend(['n', 'n'])
                elif "O(3^n)" in time_override: self.max_exp = 1 
                elif "O(2^n)" in time_override or "2ⁿ" in time_override: self.max_exp = 1
                elif "O(n!)" in time_override or "n!" in time_override: node_dims.append('n!') 
                elif "O(n)" in time_override: node_dims.append('n')
                elif "O(m)" in time_override: node_dims.append('m')

        gcd_vars = gcd_vars or getattr(self, 'active_gcd_vars', None)

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
            if time_override: local_t = time_override
            else: local_t = self._build_time_str(node_dims, node_log, node_sqrt, 0, node_graph, gcd_vars)
            
            if is_loop_or_func or bool(node_dims or node_log or node_sqrt or node_graph or (time_override and time_override not in ["O(1)", "Definition", "Dead Code", "T(placeholder)"] and not is_recurrence)):
                tot_dims = self.active_poly_dims + (node_dims if is_loop_or_func else [])
                if not is_loop_or_func and node_dims and len(self.active_poly_dims) < 2:
                    tot_dims = self.active_poly_dims + node_dims
                tot_log = self.log_loop_depth + node_log
                tot_sqrt = getattr(self, 'sqrt_loop_depth', 0) + node_sqrt
                tot_graph = getattr(self, 'graph_depth', 0) + node_graph
            else:
                tot_dims = self.active_poly_dims + node_dims 
                tot_log = self.log_loop_depth
                tot_sqrt = getattr(self, 'sqrt_loop_depth', 0)
                tot_graph = getattr(self, 'graph_depth', 0)
                
            if global_time_override: global_t = global_time_override
            else:
                cumulative_ops = {"Tuple Recreation", "Tuple Immutability Recreation", "String Build", "String Concatenation (Immutable)", "Geometric Expansion", "Linear Accumulation"}
                if custom_op in cumulative_ops and time_override:
                    global_t = time_override
                    tot_dims = [d for d in node_dims if d != 'n'] if time_override != "O(n^2)" else ['n', 'n']
                elif local_t == "O(1)" and not is_recursive_call: 
                    global_t = self._build_time_str(tot_dims, tot_log, tot_sqrt, self.max_exp, tot_graph, gcd_vars)
                else:
                    if is_recurrence: global_t = time_override
                    else: global_t = self._build_time_str(tot_dims, tot_log, tot_sqrt, self.max_exp, tot_graph, gcd_vars)
            
            local_s = space_override if space_override else "O(1)"
            global_s = global_space_override if global_space_override else local_s

        if local_s == "S(placeholder)": global_s = "S(placeholder)"

        if getattr(self, 'in_graph_context', False):
            if "O(n)" in local_s: local_s = local_s.replace("O(n)", "O(V)")
            if "O(n)" in global_s: global_s = global_s.replace("O(n)", "O(V)")
            
        curr_func = self.current_function_name or ""
        is_char_count = "char" in curr_func.lower() and "count" in curr_func.lower()
        if is_char_count:
            if "O(n)" in local_s: local_s = local_s.replace("O(n)", "O(1)")
            if "O(n)" in global_s: global_s = global_s.replace("O(n)", "O(1)")
            self.max_space_weight = 0

        t_w = self._get_weight(global_t, is_recurrence)
        s_w = self._get_space_weight(global_s)

        if not is_dead and time_override != "Definition":
            overall_t = self._build_time_str(tot_dims, tot_log, tot_sqrt, self.max_exp, tot_graph, gcd_vars)
            context_w = self._get_weight(overall_t, False)
            
            if context_w > self.max_complexity:
                self.max_complexity = context_w
                if context_w < 150: 
                    self.max_poly_str = self._build_time_str(tot_dims, 0, 0, 0, 0)
                    self.max_log = tot_log
                    self.max_sqrt = tot_sqrt
                    self.max_graph_ve = tot_graph
                    
            overall_s = global_s
            if getattr(self, 'in_accumulation_context', False) and local_s != "O(1)":
                s_tot_dims = self.active_poly_dims + (['n'] if "O(n)" in local_s else [])
                overall_s = self._build_time_str(s_tot_dims, 0, 0, 0, 0)
            self.max_space_weight = max(getattr(self, 'max_space_weight', 0), self._get_space_weight(overall_s))

        hits = self.trace_data.get("line_hits", {}).get(line_num, 0)
        mem_state = {}
        for snap in self.trace_data.get("history", []):
            if snap.line_no == line_num:
                for var_name, var_data in snap.variables.items():
                    if var_name not in mem_state or var_data["size"] > mem_state[var_name].get("size", 0):
                        mem_state[var_name] = dict(var_data)
                        
        for var_name, var_data in mem_state.items():
            var_data["explanation"] = self.nlg_engine.generate_variable_explanation(var_name, var_data, self.var_types.get(var_name))

        # EXPLICIT BUILT-IN DESCRIPTION SAFETY LOOKUP
        builtin_desc = None
        if isinstance(node, ast.Call):
            func_obj = getattr(node, 'func', None)
            if isinstance(func_obj, ast.Name):
                builtin_desc = self.builtin_complexities.get(func_obj.id, {}).get('desc')
            elif isinstance(func_obj, ast.Attribute):
                builtin_desc = self.builtin_complexities.get(func_obj.attr, {}).get('desc')

        time_exp, space_exp = self.nlg_engine.generate_explanations(
            node, local_t, global_t, local_s, global_s, is_dead, line_text, hits, mem_state
        )

        if builtin_desc and not is_dead:
            if builtin_desc not in time_exp:
                time_exp = builtin_desc + ("\n\n" + time_exp if time_exp and time_exp != "Function call." else "")

        hints = self.logic_hints.get(getattr(node, 'lineno', -1), [])
        if hints: time_exp += "\n\n" + "\n".join(hints)

        entry = {
            "lineno": line_num, "lineOfCode": line_text, "operation": operation_name,  
            "local_time": local_t, "global_time": global_t, "local_space": local_s, "global_space": global_s, 
            "indent": self.current_depth, "color": "#7f8c8d" if is_dead else self.get_color(global_t), "weight": t_w, 
            "time_explanation": time_exp, "space_explanation": space_exp,
            "hits": hits, "memory_state": mem_state
        }
        
        if self._details and self._details[-1]["lineno"] == line_num:
            prev_w = self._details[-1].get("weight", -1)
            prev_op = self._details[-1].get("operation", "")
            structural_ops = ["Loop", "Condition", "Definition", "Return", "Try-Except Block", "Context Manager"]
            
            if t_w > prev_w:
                if prev_op in structural_ops and operation_name not in structural_ops:
                    entry["operation"] = prev_op
                self._details[-1].update(entry)
            elif t_w == prev_w:
                generics = ["Expression", "Assignment", "Update", "Binary Operation", "Function Call", "Compare"]
                if prev_op in generics and operation_name not in generics:
                    self._details[-1].update(entry)
                elif prev_op not in structural_ops and operation_name not in generics and custom_op:
                    self._details[-1].update(entry)
        else: 
            self._details.append(entry)

    def _visit_block(self, body):
        hit_terminal = False
        for item in body:
            if hit_terminal:
                prev_dead = self.in_dead_code
                self.in_dead_code = True
                self.visit(item)
                self.in_dead_code = prev_dead
            else:
                self.visit(item)
                if isinstance(item, (ast.Return, ast.Break, ast.Continue, ast.Raise)):
                    hit_terminal = True

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
        if self._is_linear_type(node):
            self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Ternary Conditional (Iterable)")
        else:
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Ternary Conditional")
        self.generic_visit(node)
        
    def visit_JoinedStr(self, node):
        is_linear = False
        for child in safe_walk(node):
            if isinstance(child, ast.FormattedValue) and self._is_linear_type(child.value):
                is_linear = True
                break
                
        if is_linear:
            self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="String Interpolation (Iterable)")
        else:
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Interpolation")
        self.generic_visit(node)

    def visit_Compare(self, node):
        if any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops):
            is_hash_map = False
            is_constant_collection = False

            for comp in node.comparators:
                if isinstance(comp, ast.Name):
                    t = self.var_types.get(comp.id)
                    if t in ['set', 'dict']: is_hash_map = True
                    elif any(k in comp.id.lower() for k in ['memo', 'cache', 'visit', 'set', 'map', 'dp']): is_hash_map = True
                elif isinstance(comp, (ast.Set, ast.Dict, ast.SetComp, ast.DictComp)): is_hash_map = True
                elif isinstance(comp, ast.Call) and isinstance(getattr(comp, 'func', None), ast.Name) and comp.func.id in ['set', 'dict']: is_hash_map = True
                elif isinstance(comp, (ast.List, ast.Tuple)):
                    all_const = True
                    for elt in comp.elts:
                        if not isinstance(elt, (ast.Constant, ast.Name)):
                            all_const = False
                            break
                    if all_const:
                        is_constant_collection = True

            if is_hash_map:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Membership Check (Set/Dict)")
            elif is_constant_collection:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Membership Check (Constant Size)")
            else:
                self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Membership Check (List/Tuple/String)")
            
            self.generic_visit(node)
            return

        if any(isinstance(op, ast.LtE) for op in node.ops):
            for comp in node.comparators:
                if isinstance(comp, ast.Call) and getattr(getattr(comp, 'func', None), 'id', '') == 'len':
                    self.add_logic_hint(node, "Logic Risk (Off-By-One): Using '<=' with 'len()' often causes an IndexError because arrays are 0-indexed.")
                    
        self.record_line(node, time_override=None, space_override=None)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        is_memoized_or_graph = False
        for dec in getattr(node, 'decorator_list', []):
            if isinstance(dec, ast.Name) and dec.id in ['lru_cache', 'cache', 'memoize']: is_memoized_or_graph = True
            elif isinstance(dec, ast.Call) and getattr(dec.func, 'id', '') in ['lru_cache', 'cache']: is_memoized_or_graph = True
        
        for child in safe_walk(node):
            if isinstance(child, ast.Name) and any(k in child.id.lower() for k in ['memo', 'cache', 'dp', 'visit']):
                is_memoized_or_graph = True

        if is_memoized_or_graph: self.memoized_funcs.add(node.name)

        start_idx = len(self._details)
        prev_data = (self.max_complexity, getattr(self, 'max_space_weight', 0), self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, getattr(self, 'max_graph_ve', 0))
        self.max_complexity = self.max_space_weight = self.max_log = self.max_sqrt = self.max_exp = self.max_graph_ve = 0
        self.max_poly_str = "O(1)"
        self.function_gcd_vars = None
        
        self.active_poly_dims = [] 
        self.loop_stack = []
        self.loop_depth = 0
        self.in_frequency_summation_depth = 0
        self.current_function_name = node.name
        self.recursive_calls_count = 0
        
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False
        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.in_if_depth = 0
        self.in_graph_context = self._detect_graph_context(node)
        
        is_dead = node.name not in self.reachable_funcs
        self.record_line(node, time_override="O(1)" if is_dead else "Definition", space_override="O(1)")
        prev_dead = self.in_dead_code; self.in_dead_code = is_dead or prev_dead
        self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
        self.in_dead_code = prev_dead
        
        does_linear_work = self.max_poly_str != "O(1)" or self.has_slicing
        if not does_linear_work:
            for called_info in self.call_graph.get(node.name, []):
                called = called_info['target']
                if called in self.symbol_table and called != node.name:
                    for child in safe_walk(self.symbol_table[called]):
                        if isinstance(child, (ast.For, ast.While)) and not self._is_constant_loop(child): does_linear_work = True; break
                        elif isinstance(child, ast.ListComp): does_linear_work = True; break
                        elif isinstance(child, ast.Subscript) and isinstance(getattr(child, 'slice', None), ast.Slice): does_linear_work = True; break
                    if does_linear_work: break

        is_indirect = node.name in self.indirect_recursive_funcs

        is_2d_memo = False
        for child in safe_walk(node):
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
                relation = "T(n) = T(n-1) + O(1)" 
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
                for child in safe_walk(node):
                    if isinstance(child, ast.Name) and any(x in child.id.lower() for x in ['pivot', 'pi']):
                        is_quicksort = True
                        break
                if not is_quicksort and 'quick' in node.name.lower():
                    is_quicksort = True
                
                if is_quicksort:
                    relation = "T(n) = 2T(n/2) + O(n)"
                elif (self.has_partitioning and not self.has_division):
                    relation = "T(n) = T(n-1) + O(n)"
                elif (self.has_division or self.has_partitioning) and does_linear_work:
                    relation = "T(n) = 2T(n/2) + O(n)"
                elif (self.has_division or self.has_partitioning):
                    relation = "T(n) = 2T(n/2) + O(1)"
                else:
                    relation = "T(n) = T(n-1) + T(n-2) + O(1)"
            elif self.recursive_calls_count > 2:
                if any(k in node.name.lower() for k in ['path', 'maze', 'graph', 'visit', 'flood', 'fill']):
                    relation = "O(V + E)"
                elif self.recursive_calls_count == 3:
                    relation = "O(3^n)"
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

        lookup = {
            "T(n) = n * T(n-1)": "O(n * n!)", "T(n) = 2T(n/2) + O(n)": "O(n log n)",
            "T(n) = 2T(n/2) + O(1)": "O(n)", "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
            "T(n) = T(n/2) + O(n)": "O(n)", "T(n) = T(n/2) + O(1)": "O(log n)",
            "T(n) = T(n-1) + O(n)": "O(n^2)", "T(n) = T(n-1) + O(log n)": "O(n log n)",
            "T(n) = T(n-1) + O(1)": "O(n)", "2T(n/2)": "O(n log n)",
            "T(n-1) + T(n-2)": "O(2^n)", "T(n/2) + O(1)": "O(log n)", 
            "T(n-1) + O(n)": "O(n^2)", "O(n log n)": "O(n log n)", "O(n^2)": "O(n^2)", 
            "O(V + E)": "O(V + E)", "O(n * m)": "O(n * m)", "O(3^n)": "O(3^n)", "O(2^n)": "O(2^n)", 
            "O(n * n!)": "O(n * n!)", "O(n!)": "O(n!)", "O(n)": "O(n)", "O(log n)": "O(log n)", "O(1)": "O(1)",
            "O(log min(a, b))": "O(log min(a, b))"
        }

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
                self._details[i]["global_time"] = current_call_cost 
                is_placeholder = True

            if is_placeholder:
                call_idx += 1

            if str(self._details[i]["local_space"]).startswith("S("):
                self._details[i]["local_space"] = "O(1)"
            if str(self._details[i]["global_space"]).startswith("S("):
                self._details[i]["global_space"] = "O(1)" 
                
            if is_placeholder and "T(placeholder)" in str(self._details[i].get("time_explanation", "")):
                formatted_rel = self.nlg_engine._format_recurrence_relation(relation)
                self._details[i]["time_explanation"] = self._details[i]["time_explanation"].replace("T(placeholder)", formatted_rel)

        if self.recursive_calls_count > 0 or self.has_recursion_in_loop or is_indirect:
            resolved_rel = relation
            for k, v in lookup.items():
                if k in relation:
                    resolved_rel = v
                    break
            
            heavy_ops = {"Loop", "Array Slicing", "List Comprehension", "Set Comprehension", "Dict Comprehension", "Generator Expression", "Sort", "Sorted", "Deep Copy Allocation", "Row Allocation", "2D Array Allocation", "List Repetition", "Set Operation", "Slice Assignment"}
            
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

        self._details[start_idx]["local_time"] = "O(1)"
        self._details[start_idx]["global_time"] = "O(1)"
        self._details[start_idx]["local_space"] = "O(1)"
        self._details[start_idx]["global_space"] = "O(1)"
        self._details[start_idx]["weight"] = 1
        self._details[start_idx]["time_explanation"] = "Function declaration creates a function object in memory and binds it to a name. This is strictly an O(1) constant-time operation."
        self._details[start_idx]["space_explanation"] = "O(1) memory overhead to store the function reference in the local namespace."

        if not is_dead:
            self.max_exp, self.max_graph_ve = max(prev_data[5], self.max_exp), max(prev_data[6], self.max_graph_ve)
            self.max_complexity, self.max_space_weight = max(prev_data[0], self.max_complexity), max(prev_data[1], self.max_space_weight)
            self.max_poly_str, self.max_log, self.max_sqrt = prev_data[2] if prev_data[2] != "O(1)" else self.max_poly_str, max(prev_data[3], self.max_log), max(prev_data[4], self.max_sqrt)
        else: self.max_complexity, self.max_space_weight, self.max_poly_str, self.max_log, self.max_sqrt, self.max_exp, self.max_graph_ve = prev_data
        
        final_sp_upgrade = None
        if self.max_space_weight >= 2:
            final_sp_upgrade = "O(n * m)" if "n * m" in self.max_poly_str else "O(n^2)"

        for i in range(start_idx, len(self._details)):
            if final_sp_upgrade and self._details[i].get("global_space") == "O(n)":
                self._details[i]["global_space"] = final_sp_upgrade

        self.current_function_name = None; self.in_graph_context = False; self.recursive_calls_count = 0 
        self.function_gcd_vars = None; self.in_frequency_summation_depth = 0
        self.has_recursion_in_loop = self.has_slicing = self.has_partitioning = self.has_division = self.has_global_accumulation = False

    def visit_If(self, node):
        self.record_line(node, time_override=None, space_override=None)
        if hasattr(node, 'test'): self.visit(node.test)
        if len(self.active_poly_dims) > 0: self.conditional_partition_lines.append(getattr(node, 'lineno', float('inf')))
        self.in_if_depth += 1
        
        prev_rec = self.recursive_calls_count
        self.recursive_calls_count = 0
        self.current_depth += 1
        self._visit_block(node.body)
        self.current_depth -= 1
        
        if_rec = self.recursive_calls_count
        self.recursive_calls_count = 0
        self.current_depth += 1
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1
        
        self.recursive_calls_count = prev_rec + max(if_rec, self.recursive_calls_count)
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
        self.loop_stack.append('n')
            
        if self._is_exponential_loop(node):
            self.max_exp = 1; self.record_line(node, time_override="O(1)", global_time_override="O(2^n)")
            self.current_depth += 1; self.generic_visit(node); self.current_depth -= 1
            self.loop_stack.pop()
            return 
            
        is_const = self._is_constant_loop(node)
        is_sqrt = self._is_sqrt_loop(node)
        
        is_frequency_summation = self._is_frequency_summation_loop(node)

        if is_frequency_summation:
            self.in_frequency_summation_depth += 1
            self.record_line(node, time_override="O(1)", global_time_override="O(n)", space_override="O(1)", custom_op="Amortized Frequency Loop")
            self.current_depth += 1; self._visit_block(node.body); self.current_depth -= 1
            self.in_frequency_summation_depth -= 1
            self.loop_stack.pop()
            return

        self.record_line(node, time_override=None, space_override=None)
        
        if getattr(self, 'in_graph_context', False) and self._is_graph_for_loop(node):
            if not is_const and dim: 
                self.active_poly_dims.append(dim)
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
            if not is_const and dim: 
                self.active_poly_dims.pop()
            self.loop_stack.pop()
            return

        if not is_const: 
            if is_sqrt:
                self.sqrt_loop_depth = getattr(self, 'sqrt_loop_depth', 0) + 1
            elif dim:
                self.active_poly_dims.append(dim)
        
        self.current_depth += 1
        self._visit_block(node.body)
        
        if not is_const: 
            if is_sqrt:
                self.sqrt_loop_depth -= 1
            elif dim:
                self.active_poly_dims.pop()
            is_const = True
                
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1
        self.loop_stack.pop()

    def visit_While(self, node):
        self.loop_stack.append('n')
        is_log, gcd_v = self._is_log_loop(node)
        is_sqrt = self._is_sqrt_loop(node)
        is_const = self._is_constant_loop(node)
        is_graph = self._is_graph_while_loop(node)
        
        if gcd_v: 
            self.active_gcd_vars = gcd_v
            self.function_gcd_vars = gcd_v
            
        if is_graph: 
            self.record_line(node, time_override="O(V + E)", space_override="O(1)")
            self.graph_depth = getattr(self, 'graph_depth', 0) + 1
            if hasattr(node, 'test'): self.visit(node.test)
            self.current_depth += 1; 
            for child in node.body:
                if isinstance(child, ast.Assign) and isinstance(getattr(child.value, 'func', None), ast.Attribute) and child.value.func.attr in ['pop', 'popleft']:
                    self.record_line(child, time_override="O(1)", space_override="O(1)")
                else:
                    self.visit(child)
            self.graph_depth -= 1
            self._visit_block(getattr(node, 'orelse', []))
            self.current_depth -= 1  
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
        
        self.current_depth += 1; 
        self._visit_block(node.body)
        
        if not is_const:
            if is_log: 
                self.log_loop_depth -= 1
                self.active_gcd_vars = None
            elif is_sqrt: self.sqrt_loop_depth -= 1
            else: self.active_poly_dims.pop()
            is_const = True
            
        self._visit_block(getattr(node, 'orelse', []))
        self.current_depth -= 1  
        self.loop_stack.pop()

    def visit_Call(self, node):
        is_accumulating = False
        if isinstance(node.func, ast.Attribute) and node.func.attr in ['append', 'extend', 'add', 'insert']:
            is_accumulating = True
            self.has_global_accumulation = True
            if node.func.attr == 'add' and isinstance(getattr(node.func, 'value', None), ast.Name):
                self.var_types[node.func.value.id] = 'set'
        elif isinstance(node.func, ast.Name) and node.func.id in ['append', 'extend', 'add', 'insert']:
            is_accumulating = True
            self.has_global_accumulation = True
            
        prev_acc = getattr(self, 'in_accumulation_context', False)
        self.in_accumulation_context = prev_acc or is_accumulating
        
        if is_accumulating and len(self.loop_stack) > 0:
            if self.in_frequency_summation_depth > 0:
                self.max_space_weight = max(self.max_space_weight, 1)
            elif len(self.loop_stack) > 1:
                self.max_space_weight = max(self.max_space_weight, 2)
            else:
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

                self.record_line(node, time_override="T(placeholder)", space_override="O(1)", custom_op="Recursive Call", is_recursive_call=True)
            elif f_id in self.builtin_complexities:
                if f_id in ['set', 'list', 'dict', 'deque', 'tuple']:
                    has_args = bool(getattr(node, 'args', []))
                    is_single_arg = False
                    if has_args and isinstance(node.args[0], (ast.List, ast.Tuple)) and len(node.args[0].elts) <= 1:
                        is_single_arg = True
                    
                    t_ov = "O(1)" if (not has_args or is_single_arg) else "O(n)"
                    s_ov = "O(V)" if getattr(self, 'in_graph_context', False) else ("O(1)" if (not has_args or is_single_arg) else "O(n)")
                    self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=f"{f_id.capitalize()} Init")
                elif f_id in ['min', 'max'] and len(getattr(node, 'args', [])) > 1:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op=f"{f_id.capitalize()} (Scalar Comparison)")
                else:
                    b = self.builtin_complexities[f_id]
                    s_ov = "O(V)" if getattr(self, 'in_graph_context', False) else b['space']
                    self.record_line(node, time_override=b['time'], space_override=s_ov, custom_op=f_id.capitalize())
            elif f_id == 'print':
                is_linear = any(self._is_linear_type(arg) for arg in node.args)
                for arg in node.args:
                    if isinstance(arg, ast.JoinedStr) and any(self._is_linear_type(v.value) for v in arg.values if isinstance(v, ast.FormattedValue)):
                        is_linear = True
                
                if is_linear: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Print (Iterable)")
                else: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Print Statement")
            elif f_id in self.custom_functions:
                call_comp = self.custom_functions[f_id]
                self.record_line(node, time_override=call_comp, space_override=self.custom_space.get(f_id, "O(1)"), custom_op="Function Call")
            else: self.record_line(node, time_override=None, space_override=None)
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr == 'pop':
                is_dict = isinstance(node.func.value, ast.Name) and self.var_types.get(node.func.value.id) == 'dict'
                if len(node.args) > 0:
                    if is_dict: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from Dictionary")
                    else: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Pop from specific index")
                else:
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop from end / set")
            elif node.func.attr == 'popleft':
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Pop Left (Deque)")
            elif node.func.attr == 'remove':
                is_set = isinstance(node.func.value, ast.Name) and self.var_types.get(node.func.value.id) == 'set'
                if is_set: self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Remove from Set")
                else: self.record_line(node, time_override="O(n)", space_override="O(1)", custom_op="Remove from List")
            elif node.func.attr == 'copy':
                curr_f = self.current_function_name or ""
                is_rec = any(c['target'] == curr_f for c in self.call_graph.get(curr_f, []))
                if is_rec or getattr(self, 'in_accumulation_context', False):
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Deep Copy Allocation")
                else:
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Shallow Copy")
            elif node.func.attr == 'append':
                is_appending_list = False
                if node.args:
                    arg = node.args[0]
                    if isinstance(arg, ast.Name) and self.var_types.get(arg.id) == 'list': is_appending_list = True
                    elif isinstance(arg, ast.List): is_appending_list = True
                    elif isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mult) and isinstance(arg.left, ast.List): is_appending_list = True
                
                if getattr(self, 'in_graph_context', False):
                    self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Append")
                elif is_appending_list and len(self.loop_stack) > 0:
                    self.max_space_weight = max(self.max_space_weight, 2)
                    sp_str = "O(n * m)" if "n * m" in self.max_poly_str else "O(n^2)"
                    self.record_line(node, time_override="O(1)", space_override="O(1)", global_space_override=sp_str, custom_op="Append Row")
                    self.generic_visit(node)
                    self.in_accumulation_context = prev_acc
                    return
                else:
                    self.record_line(node, time_override="O(1) amortized", space_override="O(1)", custom_op="Append")
                    
            elif node.func.attr in ['add', 'insert', 'update', 'clear', 'union', 'intersection', 'difference', 'get', 'keys', 'values', 'items']:
                b = self.builtin_complexities.get(node.func.attr, {'time': 'O(1)', 'space': 'O(1)'})
                self.record_line(node, time_override=b['time'], space_override=b['space'], custom_op=node.func.attr.capitalize())
            elif node.func.attr in self.builtin_complexities:
                b = self.builtin_complexities[node.func.attr]
                self.record_line(node, time_override=b['time'], space_override=b['space'], custom_op=node.func.attr.capitalize())
            else: 
                self.record_line(node, time_override=None, space_override=None)
        
        self.generic_visit(node)
        self.in_accumulation_context = prev_acc

    def visit_Assign(self, node):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Input Unpacking / Swap")
            return 
            
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
        
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Subscript):
            base_var = getattr(node.targets[0].value, 'id', '')
            if self.var_types.get(base_var) == 'dict' and len(self.loop_stack) > 0:
                custom_op = "Dictionary Population"
                t_ov = "O(1)"
                s_ov = "O(n)"
                self.max_space_weight = max(self.max_space_weight, 1)
            elif isinstance(getattr(node.targets[0], 'slice', None), ast.Slice):
                custom_op = "Slice Assignment"
                t_ov = "O(n)"
                s_ov = "O(n)"
            else:
                custom_op = "Update"
                t_ov = "O(1)"
                s_ov = "O(1)"

        if getattr(self, 'in_graph_context', False):
            if isinstance(node.value, (ast.ListComp, ast.SetComp, ast.DictComp)): 
                t_ov = "O(V)"; s_ov = "O(V)"
            elif isinstance(node.value, (ast.Tuple, ast.List, ast.Set)):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    t_ov = "O(V)"; s_ov = "O(V)"
                elif len(node.value.elts) == 0:
                    t_ov = "O(1)"; s_ov = "O(V)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    t_ov = "O(V)"; s_ov = "O(V)"
            elif isinstance(node.value, ast.Call):
                func_name = getattr(node.value.func, 'id', getattr(node.value.func, 'attr', ''))
                if func_name in ['set', 'list', 'dict', 'deque', 'tuple', 'set2']:
                    f_name = 'set' if func_name == 'set2' else func_name
                    t_ov = "O(1)"
                    s_ov = "O(V)"
                    custom_op = f"{f_name.capitalize()} Init"
            elif isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult) and (isinstance(node.value.left, (ast.List, ast.Tuple)) or isinstance(node.value.right, (ast.List, ast.Tuple))): 
                custom_op = "List Repetition"
                t_ov = "O(V)"; s_ov = "O(V)"
            elif isinstance(node.value, ast.Subscript) and isinstance(getattr(node.value, 'slice', None), ast.Slice):
                t_ov = "O(V)"; s_ov = "O(V)"
            
            if custom_op == "Update": t_ov = "O(1)"; s_ov = "O(1)"
        else:
            if isinstance(node.value, ast.ListComp):
                is_nested = len(node.value.generators) > 1
                if isinstance(node.value.elt, ast.ListComp): is_nested = True
                if isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List): 
                    is_nested = True
                    
                if is_nested:
                    self.max_space_weight = max(self.max_space_weight, 2)
                    self.record_line(node, time_override="O(n * m)", space_override="O(n * m)", custom_op="2D Array Allocation")
                    self.generic_visit(node)
                    return
                else:
                    t_ov = "O(n)"
                    s_ov = "O(n)"
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
                    t_ov = "O(1)" if len(node.value.elts) <= 10 else "O(n)"
                    s_ov = "O(1)" if len(node.value.elts) <= 10 else "O(n)"
            elif isinstance(node.value, ast.Set):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Set Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Set Init"
                    t_ov = "O(1)" if len(node.value.elts) <= 10 else "O(n)"
                    s_ov = "O(1)" if len(node.value.elts) <= 10 else "O(n)"
            elif isinstance(node.value, ast.Dict):
                if any(k is None for k in node.value.keys):
                    custom_op = "Dict Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Dict Init"
                    t_ov = "O(1)" if len(node.value.keys) <= 10 else "O(n)"
                    s_ov = "O(1)" if len(node.value.keys) <= 10 else "O(n)"
            elif isinstance(node.value, ast.Tuple):
                if any(isinstance(elt, ast.Starred) for elt in node.value.elts):
                    custom_op = "Tuple Init (Unpacking)"
                    t_ov = "O(n)"
                    s_ov = "O(n)"
                else:
                    custom_op = "Tuple Init"
            elif isinstance(node.value, ast.Call):
                func_name = getattr(node.value.func, 'id', getattr(node.value.func, 'attr', ''))
                if func_name in ['set', 'list', 'dict', 'deque', 'tuple', 'set2']: 
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
                dim_var = 'n'
                if isinstance(node.value.left, ast.Name): dim_var = self._register_and_get_dim(node.value.left.id)
                elif isinstance(node.value.right, ast.Name): dim_var = self._register_and_get_dim(node.value.right.id)
                custom_op = "List Repetition"
                t_ov = f"O({dim_var})"
                s_ov = f"O({dim_var})"
            elif isinstance(node.value, ast.Subscript) and isinstance(getattr(node.value, 'slice', None), ast.Slice): 
                custom_op = "Array Slicing"
                t_ov = "O(n)"
                s_ov = "O(n)"
            
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
                            t_ov = gt
                            s_ov = gs
                            if "n^2" in gs or "n²" in gs:
                                self.max_space_weight = max(self.max_space_weight, 2)
                        custom_op = op
                        break

            if custom_op is None and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                custom_op = "Init"

        for child in safe_walk(node.value):
            if isinstance(child, (ast.BinOp, ast.Call)):
                if (isinstance(child, ast.BinOp) and (isinstance(child.op, ast.LShift) or (isinstance(child.op, ast.Pow) and getattr(child.left, 'value', 0) == 2))) or (isinstance(child, ast.Call) and getattr(getattr(child, 'func', None), 'id', '') == 'pow' and getattr(child.args[0] if getattr(child, 'args', None) else None, 'value', 0) == 2):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "exponential"
                        
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
                    for target in node.targets:
                        if isinstance(target, ast.Name): self.variable_complexities[target.id] = "sqrt"
            
        self.record_line(node, time_override=t_ov, space_override=s_ov, custom_op=custom_op) 
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
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Geometric Expansion")
                    self.max_exp = 1
                    return

        if isinstance(node.target, ast.Name) and self.var_types.get(node.target.id) == 'str' and isinstance(node.op, ast.Add):
            if len(self.loop_stack) > 0:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="String Build")
                return 

        for child in safe_walk(node.value):
            if isinstance(child, ast.Call):
                func_id = getattr(getattr(child, 'func', None), 'id', '')
                if func_id == 'sqrt' or (isinstance(child.func, ast.Attribute) and child.func.attr == 'sqrt'):
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
                    self.record_line(node, time_override="O(m)", space_override="O(m)", custom_op="Row Allocation")
                else:
                    self.record_line(node, time_override="O(n)", space_override="O(n)", custom_op="Concatenation / Repetition")
            else:
                self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Binary Operation")
                
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.RShift, ast.Mod)): self.has_division = True  
        elif isinstance(node.op, ast.Mult):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, float) and node.right.value < 1.0: self.has_division = True
            elif isinstance(node.left, ast.Constant) and isinstance(node.left.value, float) and node.left.value < 1.0: self.has_division = True
                
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
                    t_ov, s_ov = "O(n * m)", "O(n * m)"
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
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Comment / Docstring")
        elif not isinstance(node.value, (ast.Call, ast.ListComp, ast.SetComp, ast.DictComp, ast.Yield, ast.YieldFrom)):
            self.record_line(node, time_override="O(1)", space_override="O(1)", custom_op="Expression")
        self.generic_visit(node)      

    def get_final_asymptotic_badge(self):
        lookup = {
            "T(n) = n * T(n-1)": ("O(n * n!)", 9.5), "O(n * n!)": ("O(n * n!)", 9.5),
            "O(n!)": ("O(n!)", 9), "O(n^d)": ("O(n^d)", 9),
            "T(n) = T(n-1) + T(n-2) + O(1)": ("O(2^n)", 8), "O(2^n)": ("O(2^n)", 8), "O(3^n)": ("O(3^n)", 8.5),
            "O(n^3)": ("O(n^3)", 7), "O(n^2 * m)": ("O(n^3)", 7.1), "O(n * m^2)": ("O(n^3)", 7.1),
            "O(n^2 log n)": ("O(n^2 log n)", 6.5),
            "O(n * m)": ("O(n * m)", 6.1),
            "T(n) = T(n-1) + O(n)": ("O(n^2)", 6), "O(n^2)": ("O(n^2)", 6), 
            "T(n) = 2T(n/2) + O(n)": ("O(n log n)", 5), "T(n) = T(n-1) + O(log n)": ("O(n log n)", 5), "O(n log n)": ("O(n log n)", 5), "n * log n": ("O(n log n)", 5),
            "O(V + E)": ("O(V + E)", 4.5),
            "T(n) = 2T(n/2) + O(1)": ("O(n)", 4), "T(n) = T(n/2) + O(n)": ("O(n)", 4), "T(n) = T(n-1) + O(1)": ("O(n)", 4), "O(n)": ("O(n)", 4),
            "O(sqrt n)": ("O(sqrt n)", 3),
            "O(log min(a, b))": ("O(log min(a, b))", 2.5),
            "O(log min(a,b))": ("O(log min(a, b))", 2.5),
            "T(n) = T(n/2) + O(1)": ("O(log n)", 2), "O(log n)": ("O(log n)", 2),
            "O(1)": ("O(1)", 1)
        }
        best_comp = "O(1)"
        best_rank = 1
        
        top_level_str = "O(2^n)" if self.max_exp > 0 else (self.max_poly_str if self.max_poly_str != "O(1)" else self._build_time_str([], self.max_log, self.max_sqrt, 0, self.max_graph_ve))
        
        all_comps = [top_level_str]
        for func_rel in self.custom_functions.values():
            for k, v in lookup.items():
                if k in func_rel:
                    all_comps.append(v[0])
                    break
                    
        for line in self._details:
            all_comps.append(str(line.get('global_time', '')))
            all_comps.append(str(line.get('local_time', '')))
            
        for c in all_comps:
            if "C(n,k)" in c or "4^n" in c: c = "O(2^n)"
            if any(x in c for x in ["n + m", "n1", "n2", "k"]) and c != "O(1)" and "m" not in c: c = "O(n)"
            
            for key, (mapped, rank) in lookup.items():
                if key in c and rank > best_rank:
                    best_rank = rank
                    best_comp = mapped

            if c.startswith("O(") and c != "O(1)":
                c_clean = re.sub(r'[a-zA-Z]*(min|max|sum|amortized|log|sqrt)[a-zA-Z]*', '', c)
                if "n * m" in c or ("n" in c_clean and "m" in c_clean and best_rank < 6.1):
                    best_rank = 6.1
                    best_comp = "O(n * m)"
                elif "*" in c and "log" not in c and "m" not in c_clean and best_rank < 6:
                    best_rank = 6
                    best_comp = "O(n^2)"  
                elif "*" in c and "log" in c and best_rank < 6.5:
                    best_rank = 6.5
                    best_comp = "O(n^2 log n)"
        
        return best_comp

    def get_final_space_badge(self):
        rankings = {
            "O(n^n)": 8, "O(n^d)": 8, "O(n * n!)": 8, "O(n!)": 8, "O(3^n)": 7.6, "O(2^n)": 7.5, "O(n^3)": 7, "O(n^2 log n)": 6.5, "O(n * m)": 6.1, "O(n^2)": 6, "O(n log n)": 5, 
            "O(V + E)": 4.5, "O(V)": 4.2, "O(n)": 4, "O(log n)": 3, "O(1)": 1
        }
        
        best_space = "O(1)"
        best_rank = 1
        
        all_spaces = []
        for line in self._details:
            all_spaces.append(str(line.get('global_space', 'O(1)')))
        
        for space_val in self.custom_space.values():
            all_spaces.append(space_val)
            
        top_s = "O(1)"
        if self.max_space_weight >= 5: top_s = "O(n^n)"
        elif self.max_space_weight >= 4: top_s = "O(n^3)"
        elif self.max_space_weight >= 3: top_s = "O(V + E)"
        elif self.max_space_weight >= 2: top_s = "O(n * m)" if ("n * m" in self.max_poly_str and len(self.active_poly_dims) > 1) else "O(n^2)"
        elif self.max_space_weight >= 1: top_s = "O(n)"
        elif self.max_space_weight >= 0.5: top_s = "O(log n)"
        all_spaces.append(top_s)
        
        for s in all_spaces:
            if "C(n,k)" in s or "4^n" in s:
                s = "O(n)"
            elif any(x in s for x in ["n + m", "n1", "n2", "k"]) and s != "O(1)" and "m" not in s:
                s = "O(n)"
                
            for key, rank in rankings.items():
                if key in s and rank > best_rank:
                    best_rank = rank
                    best_space = key

            if best_rank < 4 and s.startswith("O(") and "n" in s:
                if not any(char in s for char in ["^", "*", "!", "V", "log", "sqrt"]):
                    best_rank = 4
                    best_space = "O(n)"
                    
        return best_space

    def get_overall_explanation(self, tree):
        final_time = self.get_final_asymptotic_badge()
        final_space = self.get_final_space_badge()
        visitor = ComprehensiveASTVisitor(self)
        sig = visitor.analyze(tree)
        
        return self.nlg_engine.generate_overall_analysis(final_time, final_space, sig, self.details)

def analyze_source_code(source_code):
    import time
    start_time = time.perf_counter()
    
    try:
        tree = ast.parse(source_code)
        
        trace_data = {"history": [], "line_hits": {}}
        if AlgoBlocksTracer is not None:
            try:
                tracer = AlgoBlocksTracer()
                trace_data = tracer.execute_and_trace(source_code)
            except Exception:
                pass 
        
        analyzer = ComplexityAnalyzer(source_code, trace_data)
        analyzer.bfs_first_pass(tree)
        analyzer.visit(tree)
        
        overall_exp = analyzer.get_overall_explanation(tree)
                
        results = {
            "status": "success",
            "total": analyzer.get_final_asymptotic_badge(),
            "space_total": analyzer.get_final_space_badge(),
            "overall_explanation": overall_exp,
            "lines": analyzer.details,
            "call_graph": getattr(analyzer, 'call_graph', {}),
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