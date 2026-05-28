import ast
import random
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

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
    tracks_visited_nodes: bool = False
    recursive_stack_risk: bool = False
    efficient_deque_pop: bool = False
    set_and_dict_updates: bool = False
    caches_results: bool = False


@dataclass
class ComplexitySignals:
    inefficient_list_pop: bool = False      
    inefficient_list_insert: bool = False   
    repeated_sort: bool = False             
    membership_in_list: bool = False        
    heavy_math_operations: bool = False     
    set_mathematical_ops: bool = False
    dict_lookup_constant: bool = False


@dataclass
class PatternSignals:
    loop_depth: int = 0
    nested_loops: bool = False
    
    has_recursion: bool = False
    recursion_branching: Optional[str] = None  
    has_backtracking_risk: bool = False
    has_memoization: bool = False
    
    membership_in_loop: bool = False
    comprehension_expansion: bool = False
    
    graph_traversal: bool = False
    visited_tracking: bool = False
    
    repeated_calls_in_loop: bool = False
    has_early_exits: bool = False  

    inline_ternary: bool = False
    string_interpolation: bool = False
    variable_swapping: bool = False
    has_comment_block: bool = False

    memory_signals: MemorySignals = field(default_factory=MemorySignals)
    complexity_signals: ComplexitySignals = field(default_factory=ComplexitySignals)
    
    extra_notes: List[str] = field(default_factory=list)


class ComprehensiveASTVisitor(ast.NodeVisitor):
    def __init__(self, ctx):
        self.ctx = ctx
        self.signals = PatternSignals()
        
        self._current_loop_depth = getattr(ctx, "active_poly_dims", [])
        self.signals.loop_depth = len(self._current_loop_depth)
        self.signals.nested_loops = self.signals.loop_depth > 1
        
        self._in_loop = self.signals.loop_depth > 0
        self._function_calls: Set[str] = set()
        self._modified_structures: Set[str] = set()

    def analyze(self, node: ast.AST) -> PatternSignals:
        if node:
            self.visit(node)
            
        self._evaluate_recursion()
        self._evaluate_graph_context()
        self._evaluate_memoization()
        self._evaluate_backtracking()
        
        return self.signals

    def visit_Call(self, node: ast.Call):
        if self._in_loop:
            self.signals.repeated_calls_in_loop = True

        if isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            self._function_calls.add(method_name)
            
            if isinstance(node.func.value, ast.Name):
                self._modified_structures.add(f"{node.func.value.id}.{method_name}")
            
            if method_name == 'pop':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_pop = True
            
            elif method_name == 'insert':
                if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 0:
                    self.signals.complexity_signals.inefficient_list_insert = True
                    
            elif method_name == 'sort':
                if self._in_loop:
                    self.signals.complexity_signals.repeated_sort = True

            elif method_name == 'popleft':
                self.signals.memory_signals.efficient_deque_pop = True

            elif method_name in ['union', 'intersection', 'difference']:
                self.signals.complexity_signals.set_mathematical_ops = True

            elif method_name == 'get':
                self.signals.complexity_signals.dict_lookup_constant = True

            elif method_name in ['update', 'add']:
                self.signals.memory_signals.set_and_dict_updates = True

        elif isinstance(node.func, ast.Name):
            func_name = node.func.id
            self._function_calls.add(func_name)
            
            current_fn = getattr(self.ctx, "current_function_name", None)
            indirect_fns = getattr(self.ctx, "indirect_recursive_funcs", set())
            
            if func_name == current_fn or func_name in indirect_fns:
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True

        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare):
        for op in node.ops:
            if isinstance(op, (ast.In, ast.NotIn)):
                if self._in_loop:
                    self.signals.membership_in_loop = True
                    self.signals.complexity_signals.membership_in_list = True
                
                # Check for memoization lookup pattern
                if isinstance(node.comparators[0], ast.Name) and any(k in node.comparators[0].id.lower() for k in ['memo', 'cache', 'dp']):
                    self.signals.has_memoization = True
                    self.signals.memory_signals.caches_results = True
                    
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp):
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)):
            self.signals.complexity_signals.set_mathematical_ops = True
        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.signals.has_comment_block = True
        self.generic_visit(node)

    def visit_ListComp(self, node: ast.ListComp):
        is_nested = len(node.generators) > 1
        if isinstance(node.elt, ast.ListComp) or (isinstance(node.elt, ast.BinOp) and isinstance(node.elt.op, ast.Mult) and isinstance(node.elt.left, ast.List)):
            is_nested = True
            
        if is_nested:
            self.signals.memory_signals.allocates_2d_lists = True
            
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
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript):
        if isinstance(node.slice, ast.Slice):
            self.signals.memory_signals.performs_slicing = True
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign):
        if self._in_loop and isinstance(node.op, ast.Add):
            if isinstance(node.target, ast.Name) and getattr(self.ctx, "var_types", {}).get(node.target.id) == 'str':
                self.signals.memory_signals.string_concatenation_in_loop = True
        self.generic_visit(node)
        
    def visit_Assign(self, node: ast.Assign):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
            self.signals.variable_swapping = True
            
        # Check for 2D array allocation via multiplication e.g., `[[0] * m for _ in range(n)]`
        if isinstance(node.value, ast.ListComp):
            if isinstance(node.value.elt, ast.ListComp) or (isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List)):
                self.signals.memory_signals.allocates_2d_lists = True
                
        self.generic_visit(node)

    def visit_Break(self, node: ast.Break):
        self.signals.has_early_exits = True
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
        self.generic_visit(node)

    def _evaluate_recursion(self):
        if self.signals.has_recursion:
            if getattr(self.ctx, "recursive_calls_count", 0) > 1:
                self.signals.recursion_branching = "multi"
            else:
                self.signals.recursion_branching = "linear_or_unknown"
                
            if getattr(self.ctx, "has_recursion_in_loop", False) or self.signals.loop_depth > 0:
                self.signals.has_backtracking_risk = True

    def _evaluate_graph_context(self):
        if getattr(self.ctx, "in_graph_context", False):
            self.signals.graph_traversal = True
            self.signals.visited_tracking = True
            self.signals.memory_signals.tracks_visited_nodes = True
        
        if 'popleft' in self._function_calls or 'pop' in self._function_calls:
            if self.signals.graph_traversal:
                pass # Already marked

    def _evaluate_memoization(self):
        if getattr(self.ctx, "current_function_name", None) in getattr(self.ctx, "memoized_funcs", set()):
            self.signals.has_memoization = True
            self.signals.memory_signals.caches_results = True

    def _evaluate_backtracking(self):
        # Infer backtracking if we have list mutation (append, pop) combined with recursion
        if self.signals.has_recursion and 'append' in self._function_calls and 'pop' in self._function_calls:
            self.signals.has_backtracking_risk = True


class EducationalInsightGenerator:
    
    @staticmethod
    def explain_time_growth(info: BigOInfo) -> str:
        family = info.family
        
        if family == "constant":
            return (
                "This operation runs in Constant Time. This means no matter how massive "
                "the input data gets, the time it takes "
                "to execute stays exactly the same. It is the gold standard for algorithmic efficiency, "
                "acting like an instant lookup."
            )
        elif family == "linear":
            return (
                "This operation scales Linearly. If you double the amount of data, the execution "
                "time roughly doubles. You can think of it like reading a book: reading a book with "
                "twice as many pages takes twice as long. It indicates that the algorithm needs to "
                "examine or process each item at least once."
            )
        elif family == "root":
            return (
                "This operation scales with a Square Root curve. It is much faster than checking every item. "
                "As your input grows larger, the required work grows, but at a steadily decreasing rate. "
                "This is commonly seen when an algorithm only needs to check factors up to the square root "
                "of a number, allowing it to skip a massive amount of unnecessary work."
            )
        elif family == "logarithmic":
            return (
                "This operation runs in Logarithmic Time, which is incredibly fast for large datasets. "
                "Instead of looking at every item, the algorithm repeatedly halves the problem space—just "
                "like searching for a word in a physical dictionary by splitting the book in half repeatedly. "
                "Even if you have billions of items, it might only take a few dozen steps to find the answer."
            )
        elif family == "linearithmic":
            return (
                "This operation runs in Linearithmic Time (n log n). This is slightly slower than linear time, "
                "but much faster than polynomial time. It usually happens when an algorithm breaks a problem "
                "down into smaller halves (the log n part) and then merges or processes all the pieces (the n part). "
                "This is the typical speed limit for the most efficient general sorting algorithms like Merge Sort."
            )
        elif family == "polynomial":
            return (
                "This operation exhibits Polynomial Growth (like n squared or n cubed). For small inputs, this is fine, "
                "but it becomes dangerously slow as the data grows. If you double the input, the time taken doesn't just double; "
                "it multiplies by four, nine, or more. This usually occurs when you have nested loops or worst-case naive sorting."
            )
        elif family == "exponential":
            return (
                "This operation exhibits Exponential Growth, which is highly dangerous for performance. "
                "Adding just one single item to the input can cause the required work to double. "
                "This typically happens in naive recursive algorithms (like calculating Fibonacci without a cache) that solve the same sub-problems over and over again."
            )
        elif family == "factorial":
            return (
                "This operation runs in Factorial Time, which is the most extreme form of complexity explosion. "
                "It represents generating every possible permutation or combination of the input. "
                "An algorithm with factorial growth will quickly bring any modern computer to a halt even with "
                "inputs as small as 15 or 20 items."
            )
        elif family == "graph":
            return (
                "This operation's growth is tied to the structure of a Graph. The time it takes depends on two factors: "
                "the total number of entities (Vertices) and the number of connections between them (Edges). "
                "The algorithm systematically explores these connections, so denser networks will naturally take longer to process."
            )
        else:
            return (
                "The exact mathematical scaling for this pattern is complex, but the core takeaway is that "
                "the workload scales dynamically with the size of the input. Larger datasets will proportionally "
                "increase the execution time as the algorithm processes the expanding data structures."
            )

    @staticmethod
    def explain_space_growth(global_s: str, info: BigOInfo, ctx: Any) -> str:
        family = info.family
        lower_s = global_s.lower()
        
        if "placeholder" in lower_s or family == "unknown":
            return (
                "The exact memory usage could not be statically determined by the analyzer for this specific block. "
                "The algorithm dynamically allocates space depending on runtime conditions, but a strict mathematical bound was not resolved."
            )
        elif "o(1)" in lower_s or family == "constant":
            return (
                "The memory footprint is Constant. The algorithm modifies data 'in-place' or only "
                "requires a few fixed variables. It does not hoard additional memory as the input grows, "
                "making it highly efficient and safe for systems with limited RAM."
            )
        elif "log" in lower_s:
            return (
                "The memory usage scales Logarithmically. This is typically driven by the 'call stack' during efficient recursion. "
                "Because the problem is halved at each step, the maximum depth of the stack stays remarkably small (e.g., about 20 frames for a million items), "
                "making it highly memory-efficient compared to a linear stack."
            )
        elif family == "linear" or "o(n)" in lower_s:
            if "in-place" in (getattr(ctx, "hint_text", "") or ""):
                return (
                    "While theoretically scaling with the input, the practical memory overhead is kept low "
                    "because the algorithm manipulates data in-place without creating massive duplicate copies."
                )
            return (
                "The memory usage scales Linearly. For every new piece of input data, the algorithm allocates "
                "a proportional amount of extra memory. This typically happens when constructing new lists, "
                "dictionaries, or keeping track of an expanding recursive call stack where depth equals 'n'."
            )
        elif re.search(r'\b[ve]\b', lower_s) or family == "graph":
            return (
                "The memory footprint depends on the Graph's architecture. The algorithm must remember which nodes "
                "it has already visited (to prevent infinite loops) and maintain a queue/stack of nodes waiting to be explored. "
                "Therefore, memory grows alongside the number of vertices and edges."
            )
        elif family == "polynomial" or "n^2" in lower_s or "n * m" in lower_s:
            return (
                "The memory usage exhibits Polynomial Growth. The algorithm is constructing multi-dimensional "
                "structures, like matrices or 2D Dynamic Programming grids. This means memory consumption "
                "will grow exponentially faster than the input, requiring careful monitoring for large datasets."
            )
        else:
            return (
                "The memory usage requires dynamic allocation. As the algorithm executes, it actively reserves "
                "more space in the computer's memory to track intermediate states, variables, or recursive calls. "
                "This means larger inputs will directly translate to a larger RAM footprint."
            )


class SemanticNLGEngine:

    def __init__(self, analyzer_context):
        self.ctx = analyzer_context
        self.explainer = EducationalInsightGenerator()

    def _safe_str(self, x: Any) -> str:
        try:
            return str(x) if x is not None else ""
        except Exception:
            return ""

    def _normalize_big_o(self, s: str) -> str:
        if not s:
            return "O(1)"
        s = s.strip()
        if s in {"-", "Dead Code", "Undefined", "undefined"}:
            return s
        s = re.sub(r"\s+", " ", s)

        s = s.replace("√", "sqrt")
        s = s.replace("log²", "log^2")
        return s

    def _classify_big_o(self, raw: str) -> BigOInfo:
        original = raw
        raw = self._normalize_big_o(raw)
        s = raw
        lower = s.lower()

        if not s or s in {"-", "Undefined", "undefined"} or "placeholder" in lower:
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={})
        if "∞" in original or "infinite" in lower:
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={})

        # Process Specific Recurrence Relations before generalized T(n) check
        if "t(n) = n * t(n-1)" in lower:
            return BigOInfo(raw=original, normalized=s, family="factorial", factors={})
        if "t(n) = 2t(n/2) + o(n)" in lower:
            return BigOInfo(raw=original, normalized=s, family="linearithmic", factors={})
        if "t(n) = 2t(n/2) + o(1)" in lower:
            return BigOInfo(raw=original, normalized=s, family="linear", factors={})
        if "t(n) = t(n/2)" in lower or "t(n/2) + o(1)" in lower:
            return BigOInfo(raw=original, normalized=s, family="logarithmic", factors={})
        if "t(n) = t(n-1) + o(n)" in lower:
            return BigOInfo(raw=original, normalized=s, family="polynomial", factors={})
        if "t(n) = t(n-1) + t(n-2)" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={})

        if "t(" in lower or lower.startswith("t(") or "t(n)" in lower:
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={"recurrence": True})

        if any(g_pat in lower for g_pat in ["v + e", "v+e", "e log v", "v log", "e + v"]):
            return BigOInfo(raw=original, normalized=s, family="graph", factors={"V": "v" in lower, "E": "e" in lower})
        if re.search(r'\bv\b', lower) and re.search(r'\be\b', lower):
            return BigOInfo(raw=original, normalized=s, family="graph", factors={"V": True, "E": True})

        if "n!" in lower or "n^!" in lower or "factorial" in lower:
            return BigOInfo(raw=original, normalized=s, family="factorial", factors={})

        if "c(" in lower or "combination" in lower or "choose" in lower or "4^n" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={})

        if "2^n" in lower or ("2^" in lower and "n" in lower) or "2n" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={"base": 2})
        if "exp" in lower and "n" in lower:
            return BigOInfo(raw=original, normalized=s, family="exponential", factors={})
        if re.search(r"[a-z]\s*\^\s*n", lower) or re.search(r"\w\^n", lower):
            if "o(" in lower or lower.startswith("o("):
                return BigOInfo(raw=original, normalized=s, family="exponential", factors={})

        if "sqrt" in lower:
            return BigOInfo(raw=original, normalized=s, family="root", factors={})

        if "log^2" in lower or "log 2" in lower or "log²" in original:
            return BigOInfo(raw=original, normalized=s, family="logarithmic", factors={"variant": "log^2"})

        if "n log" in lower or "n*log" in lower or "n log n" in lower:
            return BigOInfo(raw=original, normalized=s, family="linearithmic", factors={})

        if re.search(r"\blog\b", lower) and "n" in lower:
            return BigOInfo(raw=original, normalized=s, family="logarithmic", factors={})

        if ("n + m" in lower) or ("n+m" in lower) or ("min(n, m)" in lower) or ("min(n,m)" in lower):
            return BigOInfo(raw=original, normalized=s, family="linear", factors={"two_vars": True})

        if "n*m" in lower or "n * m" in lower:
            return BigOInfo(raw=original, normalized=s, family="polynomial", factors={"product": True})

        if "n^" in lower or "^2" in lower or "^3" in lower:
            return BigOInfo(raw=original, normalized=s, family="polynomial", factors={})

        if re.fullmatch(r"o\(\s*n\s*\)", lower) or re.fullmatch(r"o\(\s*n\s*\)", s.lower().replace(" ", "")):
            return BigOInfo(raw=original, normalized=s, family="linear", factors={})

        if lower == "o(1)" or "o(1)" in lower:
            return BigOInfo(raw=original, normalized=s, family="constant", factors={})

        if lower.startswith("o("):
            return BigOInfo(raw=original, normalized=s, family="unknown", factors={"contains": s})

        return BigOInfo(raw=original, normalized=s, family="unknown", factors={})

    def _build_execution_context_phrase(self, sig: PatternSignals) -> str:
        if sig.nested_loops:
            return "the algorithm executes an inner operation exhaustively for every single step of the outer structure"
        elif sig.loop_depth >= 1:
            return "the algorithm systematically processes items in a repetitive sequence"
        elif sig.membership_in_loop:
            return "the loop actively scans collections over and over to verify if elements exist"
        elif sig.comprehension_expansion:
            return "the language dynamically unpacks and processes an entire collection behind the scenes"
        elif sig.has_recursion:
            if getattr(self.ctx, "has_memoization", False) or sig.has_memoization:
                return "the function checks a cache before jumping into self-referential execution to prevent duplicated work"
            if sig.recursion_branching == "multi":
                return "the function violently branches out, calling itself multiple times and creating a massive execution tree"
            return "the function relies on the call stack, diving deeper into self-referential execution until a base case is hit"
        elif sig.graph_traversal:
            return "the algorithm dynamically navigates outward, exploring complex network connections step-by-step"
        elif sig.has_comment_block:
            return "the interpreter encounters a descriptive code annotation or text block"
        else:
            return "the execution flows directly without repeating loops or self-reference"

    def _time_renderer(self, node: ast.AST, local_t: str, global_t: str, code_snippet: str, hits: int, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_t)
        
        snippet_ref = f"Looking at `{code_snippet}`" if code_snippet else "Analyzing this segment"
        context_phrase = self._build_execution_context_phrase(sig)
        
        educational_growth = self.explainer.explain_time_growth(ginfo)
        
        insights = []
        if sig.complexity_signals.inefficient_list_pop:
            insights.append("Notice that popping from the front of a list forces Python to shift all remaining elements in memory, causing severe hidden delays. Consider using a `collections.deque`.")
        if sig.complexity_signals.inefficient_list_insert:
            insights.append("Inserting elements at the front of a list is inefficient because it forces a complete memory realignment of all subsequent items.")
        if sig.complexity_signals.repeated_sort:
            insights.append("Sorting data inside a loop is highly destructive to performance, as sorting is already heavy, and repeating it multiplies the cost.")
        if sig.complexity_signals.set_mathematical_ops:
            insights.append("Performing mathematical set operations computes intersections or unions efficiently, scaling with the size of the participating collections.")
        if sig.complexity_signals.dict_lookup_constant:
            insights.append("Using a dictionary get lookup provides a safe, constant-time query that prevents fallback execution errors if keys are absent.")
        if sig.has_backtracking_risk:
            insights.append("Because this involves state modification combined with recursion, the code explores paths and backtracks. This acts like navigating a massive maze, leading to rapid performance drops on complex inputs.")
        if sig.has_early_exits:
            insights.append("However, the inclusion of early exit conditions (like breaks or returns) means that in practical best-case scenarios, the algorithm can bypass unnecessary work.")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if hits > 0:
            dynamic_note = f"\n\nRuntime Observation: During execution, this specific line was triggered exactly {hits} time(s), confirming its contribution to the overall workload."

        return (
            f"{snippet_ref}, we can observe that {context_phrase}. "
            f"Consequently, its overall behavior aligns with a time complexity of {ginfo.raw}.\n\n"
            f"What does this mean? {educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _space_renderer(self, node: ast.AST, local_s: str, global_s: str, code_snippet: str, mem_state: dict, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_s)
        linfo = self._classify_big_o(local_s)
        
        snippet_ref = f"From a memory perspective, `{code_snippet}`" if code_snippet else "From a memory allocation perspective, this section"
        
        educational_growth = self.explainer.explain_space_growth(global_s, ginfo, self.ctx)
        
        insights = []
        if sig.memory_signals.allocates_2d_lists:
            insights.append("Generating nested 2D Arrays or Matrices requires massive continuous blocks of memory, rapidly increasing the footprint beyond simple 1D structures.")
        elif sig.memory_signals.allocates_lists or sig.memory_signals.uses_list_comprehension:
            insights.append("Generating new lists dynamically requires allocating contiguous blocks of RAM, which increases memory pressure.")
        if sig.memory_signals.allocates_sets or sig.memory_signals.uses_set_comprehension:
            insights.append("Generating sets guarantees unique elements and fast lookups, but building the set structure consumes additional memory based on the number of unique items.")
        if sig.memory_signals.performs_slicing:
            insights.append("Be careful: slicing arrays generates complete distinct copies of the data in memory, rather than just referencing the original structure. In deep loops, this destroys spatial efficiency.")
        if sig.memory_signals.recursive_stack_risk:
            insights.append("Every recursive jump adds a new 'frame' to the system call stack. If the recursion goes too deep linearly, it risks a Stack Overflow.")
        if sig.memory_signals.string_concatenation_in_loop:
            insights.append("Because strings are immutable, adding to a string repeatedly inside a loop forces the system to constantly allocate brand new strings and destroy old ones, wasting memory.")
        if sig.memory_signals.efficient_deque_pop:
            insights.append("Utilizing popleft from a deque structure optimizes memory deallocation from the front of the sequence in constant space and time.")
        if sig.memory_signals.set_and_dict_updates:
            insights.append("Updating elements inside sets or dictionaries dynamically resizes hash tables depending on unique entry volume.")
        if sig.memory_signals.caches_results:
            insights.append("Caching results trades space for time: the dictionary stores previously computed values to prevent redundant execution, consuming memory to gain massive speed improvements.")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if mem_state:
            largest = max(mem_state.items(), key=lambda x: x[1]['size'], default=None)
            if largest and largest[1]['size'] > 1:
                dynamic_note = f"\n\nRuntime Observation: The profiler detected that the variable `{largest[0]}` swelled to hold {largest[1]['size']} elements in memory during execution."

        return (
            f"{snippet_ref} has a localized space impact of {linfo.raw}, while contributing to an overall algorithm footprint of {ginfo.raw}.\n\n"
            f"What does this mean? {educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _pattern_renderer(self, node: ast.AST, global_t: str, sig: PatternSignals) -> str:
        parts: List[str] = []
        
        if sig.nested_loops:
            parts.append("Pattern Detected: Multiplicative repetition via Nested Loops.")
        if sig.comprehension_expansion:
            parts.append("Pattern Detected: Implicit iteration via Data Comprehension.")
        if sig.has_recursion:
            if sig.recursion_branching == "multi":
                parts.append("Pattern Detected: Exponential branching via Multiple Recursive Calls.")
            else:
                parts.append("Pattern Detected: Self-referential logic via Deep Recursion.")
        if sig.has_memoization:
            parts.append("Pattern Detected: Dynamic Programming/Memoization via Cache Lookup.")
        if sig.has_backtracking_risk:
            parts.append("Pattern Detected: Backtracking logic via Recursion with State Mutation.")
        if sig.graph_traversal:
            parts.append("Pattern Detected: Structural navigation via Graph/Network Traversal.")
        if sig.complexity_signals.membership_in_list:
            parts.append("Pattern Detected: Linear scanning via Membership Checking (consider using Sets for O(1) lookups).")
        if sig.complexity_signals.set_mathematical_ops:
            parts.append("Pattern Detected: Collection manipulation via Set Theory Operations.")
        if sig.complexity_signals.dict_lookup_constant:
            parts.append("Pattern Detected: Defensive constant-time query via Dictionary Get Lookup.")
        if sig.memory_signals.performs_slicing:
            parts.append("Pattern Detected: Memory duplication via Array Slicing.")
        if sig.inline_ternary:
            parts.append("Pattern Detected: Inline conditional logic via Ternary Expression.")
        if sig.string_interpolation:
            parts.append("Pattern Detected: Dynamic text construction via String Interpolation (f-strings).")
        if sig.variable_swapping:
            parts.append("Pattern Detected: In-place Variable Swapping via Tuple Unpacking.")
        if sig.memory_signals.allocates_2d_lists:
            parts.append("Pattern Detected: Grid/Matrix Generation via Nested Allocations.")
        if sig.has_comment_block:
            parts.append("Pattern Detected: Documentation preservation via Inline Text Block.")
            
        if "n!" in global_t.lower():
            parts.append("Pattern Detected: Combinatorial explosion via Recursive Permutations.")

        if parts:
            return "\n\nArchitectural Insights:\n" + "\n".join(f"- {p}" for p in parts)
        return ""

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, hits=0, mem_state=None):
        if is_dead and hits == 0:
            t_desc = (
                f"The statement `{code_snippet}` is identified as Dead Code. Because the execution flow "
                f"logically can never reach this point, it contributes exactly 0 operations to the algorithm, "
                f"equating to a practical time complexity of O(1)."
            )
            s_desc = (
                "Since this section of code is unreachable and never executes, it requests absolutely no memory "
                "allocations, leaving the space complexity completely unaffected."
            )
            return t_desc, s_desc

        visitor = ComprehensiveASTVisitor(self.ctx)
        sig = visitor.analyze(node)

        time_desc = self._time_renderer(node, str(local_t), str(global_t), code_snippet, hits, sig)
        space_desc = self._space_renderer(node, str(local_s), str(global_s), code_snippet, mem_state, sig)
        pattern_desc = self._pattern_renderer(node, str(global_t), sig)
        
        if pattern_desc:
            time_desc = time_desc + pattern_desc

        return time_desc, space_desc


    def get_time_bottleneck_warning(self, operation: str, final_time: str) -> str:
        op_lower = operation.lower()
        prefix = "TIME BOTTLENECK:"
        
        if "loop" in op_lower:
            templates = [
                f"\n\n{prefix} The sheer volume of exhaustive iterations required by this {op_lower} completely throttles the algorithm, dragging performance down to {final_time}.",
                f"\n\n{prefix} Because computers process instructions sequentially, the looping overhead here acts as a massive execution multiplier, bottlenecking the system at {final_time}.",
                f"\n\n{prefix} This {op_lower} forces the algorithm to continually re-process data, creating a severe structural bottleneck resulting in {final_time} scaling."
            ]
        elif "recur" in op_lower:
            templates = [
                f"\n\n{prefix} The aggressive branching pattern generated by this {op_lower} dominates the CPU execution time, capping overall efficiency at {final_time}.",
                f"\n\n{prefix} The deep, expanding call tree produced by this {op_lower} is highly inefficient, establishing a massive {final_time} bottleneck.",
                f"\n\n{prefix} Because this {op_lower} creates overlapping sub-problems without memoization, it forces redundant calculations and scales dangerously at {final_time}."
            ]
        elif "comprehension" in op_lower:
            templates = [
                f"\n\n{prefix} Do not be fooled by its single-line elegance; expanding this {op_lower} requires significant hidden iteration, throttling speed to {final_time}.",
                f"\n\n{prefix} The behind-the-scenes data extraction inside this {op_lower} is computationally heavy, defining the {final_time} runtime ceiling."
            ]
        elif "sort" in op_lower:
            templates = [
                f"\n\n{prefix} Sorting data is fundamentally expensive. Relying on this {op_lower} operation acts as an absolute barrier, preventing the algorithm from running faster than {final_time}.",
                f"\n\n{prefix} The algorithmic heavy lifting is entirely centralized around this {op_lower}, dragging the performance metrics down to {final_time}."
            ]
        else:
            templates = [
                f"\n\n{prefix} The most intensive computational heavy lifting happens precisely during this {op_lower}, dictating the final {final_time} time complexity.",
                f"\n\n{prefix} This {op_lower} is the most expensive operation in the execution pathway, pushing the overall time complexity to {final_time}.",
                f"\n\n{prefix} The core computational burden lies with this {op_lower}, establishing the primary {final_time} boundary for performance."
            ]
        return random.choice(templates)

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()
        prefix = "SPACE BOTTLENECK:"
        
        if "recur" in op_lower:
            templates = [
                f"\n\n{prefix} Every single jump in this {op_lower} requires a new block of memory on the system call stack, driving the space complexity dangerously up to {final_space}.",
                f"\n\n{prefix} Building up cascading stack frames during this {op_lower} is the dominant factor causing RAM consumption to scale rapidly to {final_space}.",
                f"\n\n{prefix} This {op_lower} does not return memory until the deepest level is reached, causing temporary memory hoarding that results in {final_space} behavior."
            ]
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower:
            templates = [
                f"\n\n{prefix} Vigorously allocating memory for distinct collections during this {op_lower} is heavily memory-intensive, creating a {final_space} space profile.",
                f"\n\n{prefix} The massive new data structures dynamically generated by this {op_lower} completely dominate memory usage, pushing the upper bounds to {final_space}.",
                f"\n\n{prefix} Rather than working in-place, this {op_lower} duplicates structure contents, forcing the system memory requirements up to {final_space}."
            ]
        elif "slice" in op_lower or "string" in op_lower:
            templates = [
                f"\n\n{prefix} This {op_lower} operation actively constructs brand new instances of data in memory rather than referencing existing ones, escalating space complexity to {final_space}.",
                f"\n\n{prefix} The hidden copies generated by this {op_lower} severely bloat the memory footprint, ensuring space scaling hits {final_space}."
            ]
        else:
            templates = [
                f"\n\n{prefix} This {op_lower} inherently requires large blocks of extra working memory, pushing the algorithm's spatial footprint to {final_space}.",
                f"\n\n{prefix} The temporary data hoarded by this {op_lower} is the primary culprit causing overall memory utilization to scale at {final_space}."
            ]
        return random.choice(templates)

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()
        prefix = "ALGORITHM MASTERY:"
        
        if "log" in time_lower:
            templates = [
                f"\n\n{prefix} Utilizing a logarithmic approach here is mathematically elegant. By systematically discarding half the problem space at every step, this {operation.lower()} achieves lightning-fast {global_time} scaling.",
                f"\n\n{prefix} Outstanding design. The divide-and-conquer strategy utilized in this {operation.lower()} shrinks the required workload exponentially fast, yielding an incredibly scalable {global_time} runtime.",
                f"\n\n{prefix} By avoiding linear traversal and jumping straight to relevant data subsets, this {operation.lower()} ensures robust, highly-optimized {global_time} execution even on massive inputs."
            ]
        elif "√" in time_lower or "sqrt" in time_lower:
            templates = [
                f"\n\n{prefix} Brilliant boundary optimization. Recognizing that mathematical factors repeat and capping the search at the square root allows this {operation.lower()} to bypass immense amounts of work, achieving {global_time} speed.",
                f"\n\n{prefix} Excellent logical deduction. By leveraging the square root boundary in this {operation.lower()}, the algorithm avoids scanning unnecessary numbers, resulting in highly efficient {global_time} performance."
            ]
        elif "1" in time_lower:
            templates = [
                f"\n\n{prefix} Perfect algorithmic efficiency. By accessing data directly through mathematical mapping or hashing, this {operation.lower()} executes instantly at {global_time}, entirely bypassing the need to search.",
                f"\n\n{prefix} Masterful use of structure. This {operation.lower()} requires absolutely no repetitive scanning, maintaining a pristine, unshakeable {global_time} runtime footprint."
            ]
        else:
            templates = [
                f"\n\n{prefix} This {operation.lower()} is exceptionally well structured, gracefully sidestepping massive computational traps to maintain a remarkably lean {global_time} execution time.",
                f"\n\n{prefix} Excellent architectural choices. This {operation.lower()} rapidly completes its objective, cementing a highly tuned and stable {global_time} complexity profile.",
                f"\n\n{prefix} By organizing the logic intelligently, this {operation.lower()} minimizes friction and redundancy, resulting in a beautifully scalable {global_time} performance curve."
            ]
        return random.choice(templates)

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation.upper()