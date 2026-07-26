"""
analyzer.py -- AST-Based Static Complexity Engine (composed entry point)

This is the single public entry point for the complexity analysis
model: `analyze_source_code`. The engine's implementation is split
across sibling modules by pipeline stage (see the docstrings of each):
  - code_preprocessor.py      Initialization: code ingestion & parsing
  - call_graph_mapper.py      BFS Call Graph & Reachability Mapper
  - topological_sequencer.py  Topological Sequencer (Dependency Ordering)
  - complexity_heuristics.py  Shared structural complexity classifiers
  - signature_recorder.py     Dependency-Ordered Signature Pass (recording)
  - ast_node_visitors.py      Dependency-Ordered Signature Pass (traversal)
  - complexity_synthesizer.py Master Theorem Assigner + Efficiency Evaluator

ComplexityAnalyzer *composes* one instance of each pipeline-stage class
(plain has-a attributes, e.g. `self.call_graph_mapper`) rather than
inheriting from them. Each component holds a back-reference to the
analyzer (`self.analyzer`) to read/write the shared analysis state
(source lines, call graph, per-line results, etc). This keeps every
class in a single-inheritance relationship (the only inheritance left
is ASTNodeVisitor/PatternVisitor extending ast.NodeVisitor, which a
UML class diagram renders as a plain generalization arrow) with clean
composition/association arrows between ComplexityAnalyzer and each
pipeline-stage class.
"""
import ast
import re
import time
from collections import deque, Counter
import sys

# Increase recursion depth to handle very deep ASTs (e.g., deeply nested function calls)
sys.setrecursionlimit(2000)

from complexity_analyzer.code_preprocessor import (
    extract_constant,
    _name_hints_memo_or_graph,
    _detect_factorial_branching,
    preprocess_source,
    safe_walk,
)
from complexity_analyzer.call_graph_mapper import CallGraphMapper
from complexity_analyzer.topological_sequencer import TopologicalSequencer
from complexity_analyzer.complexity_heuristics import ComplexityHeuristics
from complexity_analyzer.signature_recorder import SignatureRecorder
from complexity_analyzer.ast_node_visitors import ASTNodeVisitor
from complexity_analyzer.complexity_synthesizer import ComplexitySynthesizer

try:
    from complexity_explainer.complexity_explainer import EducationalInsightGenerator as SemanticNLGEngine, ComprehensiveASTVisitor
except ImportError:
    SemanticNLGEngine = None

try:
    from dynamic_tracer import AlgoBlocksTracer
except ImportError:
    AlgoBlocksTracer = None


class ComplexityAnalyzer:
    """
    Owns the shared analysis state (source, call graph, per-line results,
    running counters/flags) and composes the pipeline-stage classes that
    operate on it. See the module docstring for the composition diagram.
    """

    RECURRENCE_RESOLVER = {
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
        "O(n * m)": "O(n^2)",
        "O(3^n)": "O(2^n)", 
        "O(2^n)": "O(2^n)", 
        "O(n * n!)": "O(n!)", 
        "O(n!)": "O(n!)", 
        "O(n)": "O(n)", 
        "O(log n)": "O(log n)", 
        "O(1)": "O(1)",
        "O(log min(a, b))": "O(log n)"
    }

    def __init__(self, source_code, trace_data=None):
        self.source_lines = source_code.splitlines()
        self.trace_data = trace_data or {"history": [], "line_hits": {}}

        # Composition: one instance of each pipeline-stage class, each
        # holding a back-reference to this analyzer for shared state.
        self.call_graph_mapper = CallGraphMapper(self)
        self.topological_sequencer = TopologicalSequencer(self)
        self.complexity_heuristics = ComplexityHeuristics(self)
        self.signature_recorder = SignatureRecorder(self)
        self.ast_visitor = ASTNodeVisitor(self)
        self.complexity_synthesizer = ComplexitySynthesizer(self)

        self.reset_state()
        self.builtin_complexities = {
            'sort': {'time': 'O(n log n)', 'space': 'O(1)', 'desc': 'Sorts the list in-place using the stable Timsort algorithm.'},
            'sorted': {'time': 'O(n log n)', 'space': 'O(n)', 'desc': 'Creates and returns a completely new sorted list.'},
            'bisect': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs a binary search on a sorted sequence.'},
            'bisect_left': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs a binary search on a sorted sequence.'},
            'bisect_right': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Performs a binary search on a sorted sequence.'},
            'heappush': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Adds a new element to a heap queue.'},
            'heappop': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Removes and returns the smallest element.'},
            'heapify': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Rearranges a standard list into a min-heap in-place.'},
            'insort': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Finds insertion point O(log n) but shifts items O(n).'},
            'gcd': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Calculates the greatest common divisor using Euclidean.'},
            'pow': {'time': 'O(log n)', 'space': 'O(1)', 'desc': 'Calculates exponentiation efficiently.'},
            'join': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Concatenates an iterable of strings into a single string.'},
            'split': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Scans a string to divide it into substrings.'},
            'find': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly scans a string to find a substring.'},
            'count': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Scans a collection to count appearances.'},
            'replace': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Creates string replacing occurrences.'},
            'startswith': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Checks substring prefix.'},
            'endswith': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Checks substring suffix.'},
            'list': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Populates a new list containing all iterable elements.'},
            'set': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Populates a new set containing only unique elements.'},
            'dict': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Creates a new dictionary.'},
            'tuple': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Creates an immutable sequence.'},
            'deque': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Initializes a double-ended queue.'},
            'append': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Adds an element to the end of a list. Amortized O(1): occasional array resizes average out over a sequence of appends.'},
            'add': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Adds an element to a set. Average-case O(1); hash collisions are a rare worst case that amortized/average analysis does not charge per call.'},
            'insert': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Places an element at a specific index shifting others.'},
            'max': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly scans through a sequence for largest.'},
            'min': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Linearly scans through a sequence for smallest.'},
            'sum': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Adds up the numeric values of an iterable.'},
            'any': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Evaluates truthy sequentially.'},
            'all': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Evaluates falsy sequentially.'},
            'len': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns the number of items in a container.'},
            'abs': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns absolute value.'},
            'round': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Rounds a number.'},
            'int': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Converts to integer.'},
            'float': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Converts to float.'},
            'bool': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Evaluates truthiness.'},
            'type': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns class type.'},
            'str': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Converts object to string.'},
            'remove': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Searches and removes occurrence shifting elements. Evaluated as worst-case O(n).'},
            'pop': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Removes and returns element. Evaluated as worst-case O(n) for dictionaries/lists.'},
            'index': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Searches to find target index.'},
            'copy': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Creates a shallow copy.'},
            'reverse': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Reverses order of items.'},
            'extend': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Appends iterable items.'},
            'upper': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Generates uppercase string.'},
            'lower': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Generates lowercase string.'},
            'strip': {'time': 'O(n)', 'space': 'O(n)', 'desc': 'Strips whitespace characters.'},
            'keys': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns dict keys view.'},
            'values': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns dict values view.'},
            'items': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Returns dict items view.'},
            'range': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Creates mathematical range object.'},
            'clear': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Empties the container.'},
            'get': {'time': 'O(n)', 'space': 'O(1)', 'desc': 'Looks up dictionary key. Evaluated as worst-case O(n) due to hash collisions.'},
            'popleft': {'time': 'O(1)', 'space': 'O(1)', 'desc': 'Removes first element of deque.'}
        }
        self.aliases = {}
        if SemanticNLGEngine:
            self.nlg_engine = SemanticNLGEngine(self)
            
    def reset_state(self):
        # Cleared here (not just at __init__) because some cached
        # classifiers read self.variable_complexities / self.loop_depth,
        # which are also reset here -- a value cached before this point
        # could reflect a different traversal context than one cached after.
        self._loop_classify_cache = {}
        self._details = []                
        self._bottlenecks_applied = False
        self.current_depth = 0           
        self.loop_depth = 0
        self.log_loop_depth = 0          
        self.sqrt_loop_depth = 0
        self.graph_depth = 0             
        self.in_if_depth = 0
        self.loop_stack = []
        self.loop_stack_targets = []
        self.in_list_comp_depth = 0
        self.in_frequency_summation_depth = 0
        
        self.var_dimensions = {} 
        self.active_poly_dims = [] 
        self.active_gcd_vars = None
        self.function_gcd_vars = None
        self.var_types = {} 
        self.loop_body_stack = []
        
        self.max_complexity = 0          
        self.max_poly_str = "O(1)"
        self.max_log = 0                 
        self.max_sqrt = 0                
        self.max_exp = 0
        self.max_fact = 0
        self.max_graph_ve = 0                 
        self.max_space_weight = 0        
        
        self.variable_complexities = {}  
        self.custom_functions = getattr(self, 'custom_functions', {})       
        self.custom_space = getattr(self, 'custom_space', {})           
        self.current_function_name = None
        self.recursive_calls_count = 0 
        self.tree_traversal_calls = 0  
        self.symbol_table = getattr(self, 'symbol_table', {})           
        self.reachable_funcs = getattr(self, 'reachable_funcs', set())     
        self.memoized_funcs = getattr(self, 'memoized_funcs', set()) 
        self.indirect_recursive_funcs = getattr(self, 'indirect_recursive_funcs', set()) 
        
        self.in_dead_code = False
        self.in_graph_context = False        
        self.has_recursion_in_loop = False  
        self.has_factorial_branching = False
        self.has_slicing = False            
        self.has_partitioning = False
        self.has_division = False           
        self.in_accumulation_context = False
        self.has_global_accumulation = False

        self.first_rec_line = float('inf')
        self.conditional_partition_lines = []
        self.logic_hints = {} 

    @property
    def details(self):
        if not getattr(self, '_bottlenecks_applied', False) and len(self._details) > 0 and SemanticNLGEngine:
            self.signature_recorder._apply_bottlenecks()
            self._bottlenecks_applied = True
        return self._details

    @details.setter
    def details(self, value):
        self._details = value
        self._bottlenecks_applied = False


def fallback_analyzer(source_code):
    """
    Robust regex-based heuristic engine. 
    Guarantees analysis for C, C++, Java, and broken Python code where AST fails.
    """
    code_lower = source_code.lower()
    code_clean = re.sub(r'//.*|/\*[\s\S]*?\*/|".*?"|\'.*?\'|#.*', '', code_lower)
    
    max_loop_depth = 0
    if '{' in code_clean:
        curr_depth = 0
        loop_depths = []
        tokens = re.findall(r'(for\s*\(|while\s*\(|\{|\})', code_clean)
        for t in tokens:
            if t == '{': curr_depth += 1
            elif t == '}':
                curr_depth = max(0, curr_depth - 1)
                loop_depths = [d for d in loop_depths if d <= curr_depth]
            elif 'for' in t or 'while' in t:
                loop_depths.append(curr_depth + 1)
                max_loop_depth = max(max_loop_depth, len(loop_depths))
    else:
        loop_indents = []
        for line in source_code.split('\n'):
            line_clean = line.split('#')[0]
            if not line_clean.strip(): continue
            indent = len(line_clean) - len(line_clean.lstrip())
            while loop_indents and loop_indents[-1] >= indent:
                loop_indents.pop()
            if line_clean.lstrip().startswith('for ') or line_clean.lstrip().startswith('while '):
                loop_indents.append(indent)
                max_loop_depth = max(max_loop_depth, len(loop_indents))
                
    time_w = max(1, max_loop_depth)
    time_comp = "O(n)"
    
    if 'dfs' in code_clean or 'bfs' in code_clean or 'adj' in code_clean: time_comp = "O(V + E)"
    elif re.search(r'\b(sorted|sort|qsort)\s*\(', code_clean):
        time_comp = "O(n log n)" if time_w <= 1 else "O(n^2)"
    elif time_w == 1:
        if ('mid' in code_clean and ('/ 2' in code_clean or '>> 1' in code_clean)) or 'binary_search' in code_clean:
            time_comp = "O(log n)"
        else: time_comp = "O(n)"
    elif time_w >= 2: time_comp = "O(n^2)"
        
    if 'build(' in code_clean or 'update(' in code_clean or 'query(' in code_clean:
        if 'mid' in code_clean: time_comp = "O(n log n)"
    if 'subset' in code_clean or 'combination' in code_clean or 'permutation' in code_clean:
        time_comp = "O(2^n)"
        
    space_comp = "O(1)"
    if 'alloc' in code_clean or 'new ' in code_clean or 'vector<' in code_clean or '[' in code_clean or 'map<' in code_clean:
        space_comp = "O(n)"
    if '[[' in code_clean or 'vector<vector' in code_clean or 'mat[' in code_clean:
        space_comp = "O(n^2)"
    if 'dfs' in code_clean or 'bfs' in code_clean or 'graph' in code_clean:
        space_comp = "O(V + E)"

    return {
        "status": "success",
        "total": time_comp,
        "space_total": space_comp,
        "overall_explanation": "Evaluated using syntax heuristics (Fallback Mode).",
        "lines": [], "call_graph": {}, "error": None
    }

def analyze_source_code(source_code):
    import time
    start_time = time.perf_counter()
    
    source_code = preprocess_source(source_code)
    
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
        analyzer.call_graph_mapper.bfs_first_pass(tree)

        # Phase 2a: establish every function's complexity signature by
        # visiting function bodies in the topological order Phase 1 (the
        # modified BFS) computed from the call graph -- callees are
        # guaranteed to already be resolved before their callers are
        # visited, regardless of source-file order.
        analyzer.topological_sequencer.visit_functions_topologically()
        analyzer.reset_state()

        # Phase 2b: the one full traversal that produces the final
        # line-by-line complexity report. Every custom_functions /
        # custom_space lookup this pass performs is now guaranteed to
        # already be populated from Phase 2a, so -- unlike before -- this
        # pass does not need to be run twice to cope with forward
        # references.
        analyzer.ast_visitor.visit(tree)

        overall_exp = analyzer.complexity_synthesizer.get_overall_explanation(tree)

        results = {
            "status": "success",
            "total": analyzer.complexity_synthesizer.get_final_asymptotic_badge(),
            "space_total": analyzer.complexity_synthesizer.get_final_space_badge(),
            "overall_explanation": overall_exp,
            "lines": analyzer.details,
            "call_graph": getattr(analyzer, 'call_graph', {}),
            "error": None,
            "runtime_warning": trace_data.get("runtime_warning"),
            "runtime_warning_line": trace_data.get("runtime_warning_line")
        }
    except Exception as e:
        print(f"[AST CRASH FALLBACK TRIGGERED]: {e}")
        results = fallback_analyzer(source_code)
        # NOTE: fallback_analyzer() always reports status "success" (it still
        # provides a rough heuristic complexity guess), but a real failure
        # here (most commonly a SyntaxError) needs to be reported as an
        # actual error so it reaches the user - otherwise it's silently
        # swallowed and the editor just shows a stale/generic complexity
        # badge with no indication anything is wrong.
        results["status"] = "error"
        results["error"] = str(e)
        results["message"] = str(e)
        results["line"] = getattr(e, "lineno", 1) or 1
    end_time = time.perf_counter()
    results["analysis_time_ms"] = (end_time - start_time) * 1000
    
    return results
