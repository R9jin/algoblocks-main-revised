# semantic_nlg.py
import ast
import random
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

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
    geometric_capacity_growth: bool = False
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
    amortized_operation: bool = False
    aggregation_in_loop: bool = False 
    bitwise_operations: bool = False
    boolean_short_circuit: bool = False
    f_string_usage: bool = False

@dataclass
class PatternSignals:
    loop_depth: int = 0
    nested_loops: bool = False
    
    has_recursion: bool = False
    indirect_recursion: bool = False
    recursion_branching: Optional[str] = None  
    has_backtracking_risk: bool = False
    has_memoization: bool = False
    recursion_in_loop: bool = False
    
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
                
            elif method_name == 'append':
                self.signals.complexity_signals.amortized_operation = True
                
            elif method_name == 'extend':
                if self._in_loop and node.args and isinstance(node.args[0], ast.Name) and isinstance(node.func.value, ast.Name):
                    if node.func.value.id == node.args[0].id:
                        self.signals.memory_signals.geometric_capacity_growth = True

            elif method_name in ['union', 'intersection', 'difference']:
                self.signals.complexity_signals.set_mathematical_ops = True

            elif method_name == 'get':
                self.signals.complexity_signals.dict_lookup_constant = True

            elif method_name in ['update', 'add']:
                self.signals.memory_signals.set_and_dict_updates = True

        elif isinstance(node.func, ast.Name):
            func_name = node.func.id
            self._function_calls.add(func_name)
            
            if func_name in ['sum', 'max', 'min', 'all', 'any'] and self._in_loop:
                self.signals.complexity_signals.aggregation_in_loop = True

            current_fn = getattr(self.ctx, "current_function_name", None)
            indirect_fns = getattr(self.ctx, "indirect_recursive_funcs", set())
            
            if func_name == current_fn:
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True
                if self._in_loop:
                    self.signals.recursion_in_loop = True
            elif func_name in indirect_fns:
                self.signals.indirect_recursion = True
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True

        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare):
        for op in node.ops:
            if isinstance(op, (ast.In, ast.NotIn)):
                if self._in_loop:
                    self.signals.membership_in_loop = True
                    self.signals.complexity_signals.membership_in_list = True
                
                if isinstance(node.comparators[0], ast.Name) and any(k in node.comparators[0].id.lower() for k in ['memo', 'cache', 'dp']):
                    self.signals.has_memoization = True
                    self.signals.memory_signals.caches_results = True
                    
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp):
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.BitXor, ast.LShift, ast.RShift)):
            self.signals.complexity_signals.bitwise_operations = True
            
        if isinstance(node.op, (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor)):
            self.signals.complexity_signals.set_mathematical_ops = True
        self.generic_visit(node)
        
    def visit_BoolOp(self, node: ast.BoolOp):
        self.signals.complexity_signals.boolean_short_circuit = True
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
            elif isinstance(node.target, ast.Name) and isinstance(node.value, ast.Name) and node.value.id == node.target.id:
                self.signals.memory_signals.geometric_capacity_growth = True
        elif self._in_loop and isinstance(node.op, ast.Mult) and isinstance(node.target, ast.Name):
            self.signals.memory_signals.geometric_capacity_growth = True
            
        self.generic_visit(node)
        
    def visit_Assign(self, node: ast.Assign):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
            self.signals.variable_swapping = True
            
        if isinstance(node.value, ast.ListComp):
            if isinstance(node.value.elt, ast.ListComp) or (isinstance(node.value.elt, ast.BinOp) and isinstance(node.value.elt.op, ast.Mult) and isinstance(node.value.elt.left, ast.List)):
                self.signals.memory_signals.allocates_2d_lists = True
                
        if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Add):
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                if getattr(self.ctx, "var_types", {}).get(t_id) in ['str', 'list', 'tuple', 'deque']:
                    count = sum(1 for n in ast.walk(node.value) if isinstance(n, ast.Name) and n.id == t_id)
                    if count >= 2:
                        self.signals.memory_signals.geometric_capacity_growth = True
                        
        if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.Mult):
            target_ids = [t.id for t in node.targets if isinstance(t, ast.Name)]
            for t_id in target_ids:
                for child in ast.walk(node.value):
                    if isinstance(child, ast.Name) and child.id == t_id:
                        self.signals.memory_signals.geometric_capacity_growth = True
                        
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
        self.signals.complexity_signals.f_string_usage = True
        self.generic_visit(node)

    def _evaluate_recursion(self):
        if self.signals.has_recursion:
            if getattr(self.ctx, "recursive_calls_count", 0) > 1:
                self.signals.recursion_branching = "multi"
            else:
                self.signals.recursion_branching = "linear_or_unknown"
                
            if getattr(self.ctx, "has_recursion_in_loop", False) or self.signals.loop_depth > 0:
                self.signals.has_backtracking_risk = True
                self.signals.recursion_in_loop = True

    def _evaluate_graph_context(self):
        if getattr(self.ctx, "in_graph_context", False):
            self.signals.graph_traversal = True
            self.signals.visited_tracking = True
            self.signals.memory_signals.tracks_visited_nodes = True

    def _evaluate_memoization(self):
        if getattr(self.ctx, "current_function_name", None) in getattr(self.ctx, "memoized_funcs", set()):
            self.signals.has_memoization = True
            self.signals.memory_signals.caches_results = True

    def _evaluate_backtracking(self):
        if self.signals.has_recursion and 'append' in self._function_calls and 'pop' in self._function_calls:
            self.signals.has_backtracking_risk = True


class EducationalInsightGenerator:
    
    def __init__(self, ctx):
        self.ctx = ctx
        self.explainer = self

    def _classify_big_o(self, complexity_str: str) -> BigOInfo:
        c = complexity_str.lower()
        family = "unknown"
        
        if c == "o(1)" or "amortized" in c:
            family = "constant"
        elif "n log n" in c:
            family = "linearithmic"
        elif "log" in c:
            family = "logarithmic"
        elif "√" in c or "sqrt" in c:
            family = "root"
        elif "n!" in c:
            family = "factorial"
        elif "n^n" in c:
            family = "super_exponential"
        elif "2^n" in c or "c(" in c or "2ⁿ" in c:
            family = "exponential"
        elif "n^2" in c or "n²" in c or "n^3" in c or "n³" in c or "n * m" in c or "n^d" in c:
            family = "polynomial"
        elif "v + e" in c or "v" in c:
            family = "graph"
        elif "n" in c:
            family = "linear"
        elif "t(" in c:
            family = "recursive_branching"
            
        return BigOInfo(
            raw=complexity_str,
            normalized=complexity_str,
            family=family,
            factors={}
        )

    @staticmethod
    def _random_choice(options: List[str]) -> str:
        return random.choice(options)
    
    @staticmethod
    def explain_time_growth(info: BigOInfo, is_amortized: bool = False) -> str:
        family = info.family
        
        if family == "constant":
            if is_amortized:
                return EducationalInsightGenerator._random_choice([
                    "This is Amortized Constant Time. Think of it like a monthly subscription: most days you use it for free, but once a month you pay a larger bill. In code, Python occasionally has to copy an array to a larger memory block when you append, but mostly it happens instantly.",
                    "This operates in Amortized O(1) Time. While adding an item is usually instant, Python arrays occasionally fill up and need to be resized behind the scenes. However, on average, the time it takes is extremely fast and flat."
                ])
            return EducationalInsightGenerator._random_choice([
                "This is Constant Time O(1). Think of this like looking up an address in a GPS. No matter how big the city is, you go straight to your destination instantly. The computer takes the exact same number of steps regardless of how much data you process.",
                "This runs in Constant Time. It means the speed remains perfectly flat whether you evaluate ten items or ten million items. It represents an instant, direct operation like checking a specific key in a dictionary or grabbing the first item in a list."
            ])
        elif family == "linear":
            return EducationalInsightGenerator._random_choice([
                "This scales Linearly O(n). Imagine reading a book from cover to cover. If the book is twice as thick, it takes twice as long to read. The algorithm is forced to systematically touch or check every single item in your data at least once.",
                "This exhibits Linear Time. The mathematical relationship is a straight line. As your data grows, the time it takes grows by the exact same proportional amount. This usually happens when you iterate through a collection from start to finish."
            ])
        elif family == "root":
            return EducationalInsightGenerator._random_choice([
                "This runs in Square Root Time O(sqrt n). It is significantly faster than checking everything. Imagine if, to find a word in a book, you only ever had to read up to the page number equal to the square root of the total pages. It saves the computer a massive amount of unnecessary iteration.",
                "This uses a Square Root boundary. By recognizing mathematical properties naturally capping the search space, the algorithm stops early. It grows much slower than a standard loop, making it highly efficient for numeric problems."
            ])
        elif family == "logarithmic":
            return EducationalInsightGenerator._random_choice([
                "This is Logarithmic Time O(log n), which is incredibly fast for large datasets. Imagine trying to find a specific page in a dictionary. You open it to the middle, check if your page is earlier or later, and completely discard half the book. You repeat this until you find the target.",
                "This scales Logarithmically. Because the algorithm systematically halves the remaining data at every single step, it can process billions of items almost instantly. This is the hallmark of an optimized search structure."
            ])
        elif family == "linearithmic":
            return EducationalInsightGenerator._random_choice([
                "This is Linearithmic Time O(n log n). Think of it like sorting a messy deck of cards by splitting the deck into smaller piles, organizing them, and merging them back together. It acts as the standard theoretical speed limit for general-purpose sorting algorithms.",
                "This operation runs in O(n log n) Time. It is slightly slower than pure linear time, but far superior to nested loops. It represents a highly optimized divide and conquer strategy."
            ])
        elif family == "polynomial":
            return EducationalInsightGenerator._random_choice([
                "This exhibits Polynomial Growth, such as O(n^2). Imagine a handshake puzzle where 100 people are in a room and everyone must shake hands with everyone else. The total number of handshakes explodes quickly. In code, this signifies a loop running continuously inside another loop.",
                "This scales Quadratically or Polynomially. While it functions fine for small lists, doubling your data size will force the computer to work four times as hard. Comparing every single item to every other item inevitably triggers this steep computational slowdown."
            ])
        elif family == "exponential":
            return EducationalInsightGenerator._random_choice([
                "This suffers from Exponential Growth O(2^n). Think of a rumor spreading where every person tells two new people. Adding just one single item to your input forces the computer to do double the total amount of work. It is extremely dangerous for large inputs.",
                "This is Exponential Time. The algorithm is calculating the exact same overlapping mathematical problems repeatedly without saving the answers. The processing time doubles constantly, eventually freezing the execution environment entirely."
            ])
        elif family == "recursive_branching":
            return EducationalInsightGenerator._random_choice([
                "This runs in Recursive Branching Time O(n^d). Because a recursive function is being called from inside a standard loop, it acts like a system that branches out both horizontally and vertically. It rapidly creates a massive, sprawling execution tree.",
                "This creates a complex Recursive Branching pattern. Instead of a single clean line of recursion, the iteration forces the function to spawn multiple complete new paths at every depth level, slowing down the processor significantly."
            ])
        elif family == "super_exponential":
            return EducationalInsightGenerator._random_choice([
                "This exhibits Super Exponential Growth O(n^n). This represents an absolute worst-case processing scenario. The algorithm is multiplying its workload to the power of its own input size, ensuring the system will stall on very small initial values.",
                "This scales Super-Exponentially. The mathematical branching occurring here is incredibly hostile to the CPU. It is a sign of an unoptimized brute-force strategy that will freeze the computer almost immediately."
            ])
        elif family == "factorial":
            return EducationalInsightGenerator._random_choice([
                "This requires Factorial Time O(n!). Imagine trying to figure out the absolute best seating arrangement for 15 friends by physically forcing them to sit in every single possible combination of chairs. A modern computer could take years to verify them all.",
                "This evaluates to Factorial Time. This is generally caused by calculating every possible mathematical permutation of a dataset. It is an extreme brute-force methodology that will fail to complete on anything larger than a handful of input elements."
            ])
        elif family == "graph":
            return EducationalInsightGenerator._random_choice([
                "This scales based on Graph Topology O(V + E). Imagine visiting a new city. The time it takes to explore depends strictly on how many specific places you want to visit and how many roads connect them.",
                "This operation navigates a Graph or Network structure. The operational speed depends directly on the structural density of the network. Exploring a highly interconnected web will naturally require more computational steps than walking a straight path."
            ])
        else:
            return (
                "The mathematical scaling observed here is dynamic. The core takeaway is that the execution timeline will shift heavily based on the specific shape, density, and volume of the initial data structure passed into it."
            )

    @staticmethod
    def explain_space_growth(global_s: str, info: BigOInfo, ctx: Any) -> str:
        family = info.family
        lower_s = global_s.lower()
        
        core_rule = "When checking Global Space, we do not just add up every single allocation line. We look at the 'high-water mark', representing the absolute maximum amount of memory the algorithm needs to hold onto at its peak depth. "
        
        if "placeholder" in lower_s or family == "unknown":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The exact memory required here fluctuates depending on dynamic runtime conditions, meaning the analyzer cannot reliably lock it to a static mathematical formula.",
                core_rule + "Because this memory allocation shifts fluidly based on data contents, the strict spatial boundary cannot be entirely guaranteed statically."
            ])
        elif "o(1)" in lower_s or family == "constant":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory usage here evaluates to Constant O(1). The algorithm cleverly reshuffles data in-place or only creates a few small tracker variables. It does not hoard extra system RAM, making it structurally very safe.",
                core_rule + "This operates with a Constant Space footprint. No matter how massive the input dataset grows, the algorithm will not demand continuously larger chunks of memory from the operating system."
            ])
        elif "log" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory scales Logarithmically. This pattern frequently occurs during highly efficient recursion. Because the algorithm halves the problem space continuously, the call stack of saved states never gets very deep, preserving vital RAM.",
                core_rule + "This leverages Logarithmic Space. The system only has to cache a very small, highly compressed trace of its progress, making it incredibly space-efficient even when processing massive data."
            ])
        elif family == "linear" or "o(n)" in lower_s:
            if "in-place" in (getattr(ctx, "hint_text", "") or ""):
                return (
                    core_rule + "While it technically scales linearly in theory, the practical memory used is exceptionally low because the algorithm prefers to directly modify the existing data rather than spawning massive separate duplicates."
                )
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory demands grow Linearly O(n). For every piece of data you append to the input, the algorithm is forced to build a matching slot in memory to house a list, a dictionary, or a sequential element.",
                core_rule + "This requires Linear Space. If your total input size doubles, the algorithm will automatically instruct the computer to reserve double the RAM in order to store its final structure or recursive tracking sequence."
            ])
        elif re.search(r'\b[ve]\b', lower_s) or family == "graph":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory directly mirrors the Graph layout. To safely avoid walking in infinite loops, the code maintains a registry of every single specific node it has already encountered.",
                core_rule + "This scales based on spatial Network density. The algorithm actively maintains an expanding queue of locations waiting to be explored, mandating space proportional to the graph breadth."
            ])
        elif family in ["exponential", "super_exponential", "recursive_branching"] or "2^n" in lower_s or "n^n" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory footprint is actively exploding. The algorithm is spawning rapidly doubling copies of itself or its data, gravely threatening to crash the execution context by running entirely out of RAM.",
                core_rule + "This commands an Exponential memory payload. Attempting to maintain this rapidly expanding state is highly dangerous and will exhaust available system memory incredibly fast."
            ])
        elif family == "polynomial" or "n^2" in lower_s or "n * m" in lower_s or "n²" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The spatial requirements scale Polynomially. The algorithm is actively constructing large, multi-dimensional structures like a 2D matrix or a dynamically expanding grid. This consumes available RAM significantly faster than a one-dimensional list.",
                core_rule + "This exhibits Quadratic or Polynomial space inflation. By nesting data deeply inside other data, the memory consumed heavily outpaces the base input size, placing substantial continuous stress on the computer."
            ])
        else:
            return (
                core_rule + "The peak memory signature is fully dynamic. The system will be forced to constantly ask the runtime environment for fresh blocks of RAM to accurately map its progress."
            )

    def _build_execution_context_phrase(self, sig: PatternSignals) -> str:
        options = []
        if getattr(self.ctx, "has_recursion_in_loop", False) or sig.recursion_in_loop:
            options = [
                "the function triggers a recursive call from inside a standard looping construct, generating an explosive and multi-branching tree",
                "an iterative loop actively forces the program to dive into self-referential recursion repeatedly, massively multiplying the workload"
            ]
        elif sig.nested_loops:
            options = [
                "the algorithm mandates that an inner loop runs completely from start to finish for every single step of the outer loop boundary",
                "the code fully relies on nested iteration, multiplying the internal operations together rather than evaluating them linearly"
            ]
        elif sig.loop_depth >= 1:
            options = [
                "the primary logic utilizes a loop to systematically process elements in a linear, step-by-step sequence",
                "the algorithm systematically traverses through the entire collection one item at a time"
            ]
        elif sig.membership_in_loop:
            options = [
                "the loop is mathematically forced to actively scan through a collection from the beginning repeatedly to check if specific items exist",
                "the code repeatedly searches a linear list for a value while it is already embedded inside a repetitive loop"
            ]
        elif sig.comprehension_expansion:
            options = [
                "Python leverages a syntactic comprehension to dynamically unpack and build an entire collection heavily behind the scenes",
                "a single line of execution is actually masking a full internal loop that is actively generating a new structural list or dictionary"
            ]
        elif sig.has_recursion:
            if getattr(self.ctx, "has_memoization", False) or sig.has_memoization:
                options = [
                    "the recursive function intelligently checks a saved cache first, completely preventing it from wasting time calculating the exact same numeric answers twice",
                    "the algorithm applies memoization to physically remember past work, effectively amputating massive redundant branches from the recursive tree"
                ]
            elif sig.indirect_recursion:
                options = [
                    "two or more distinct functions call each other in a cyclic pattern, bouncing control back and forth to simulate standard recursion",
                    "a cyclic indirect recursion chain occurs, driving the depth of the call stack downward through mutual function invocations"
                ]
            elif sig.recursion_branching == "multi":
                options = [
                    "the function invokes itself multiple times per single step, causing the core execution path to violently branch out identically to a tree",
                    "multiple recursive call paths force the running program to split its computational attention, rapidly multiplying the aggregate workload"
                ]
            else:
                options = [
                    "the function adheres to a singular line of self-reference, continuously diving deeper into the call stack until hitting a definitive base case",
                    "the code invokes itself cleanly and sequentially, drilling downwards to the absolute base of the problem before bubbling back to the surface"
                ]
        elif sig.graph_traversal:
            options = [
                "the algorithm navigates progressively outward like a spiderweb, exploring all connected sub-nodes while safely tracking its traversal path",
                "the code properly invokes a standard traversal technique to hop logically between specifically linked data points inside a complex network"
            ]
        elif sig.has_comment_block:
            options = [
                "the interpreter briefly processes a block of static documentation text with zero functional overhead",
                "the execution cleanly passes over a static string annotation without evaluating operational logic"
            ]
        else:
            options = [
                "the execution flow cascades completely straight down through standard instructions without triggering any loops or deep recursion",
                "the targeted code operates explicitly on the provided data without repeating itself cyclically"
            ]
        return random.choice(options)

    def _time_renderer(self, node: ast.AST, local_t: str, global_t: str, code_snippet: str, hits: int, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_t)
        
        snippet_refs = [
            f"Looking closely at `{code_snippet}`", 
            f"Breaking down this specific computational block", 
            f"When analyzing `{code_snippet}`"
        ]
        snippet_ref = random.choice(snippet_refs) if code_snippet else "Reviewing this exact segment"
        
        context_phrase = self._build_execution_context_phrase(sig)
        educational_growth = self.explainer.explain_time_growth(ginfo, is_amortized=sig.complexity_signals.amortized_operation)
        
        insights = []
        if sig.memory_signals.geometric_capacity_growth:
            insights.append("Notice carefully that the variable is being multiplied or added to itself repeatedly inside an active loop. This action commands the computer to continuously reallocate massive, doubling chunks of memory, turning what looks like a simple loop into an incredibly slow exponential operation.")
        elif sig.memory_signals.string_concatenation_in_loop:
            insights.append("A very common architectural trap: appending directly to a string inside a loop with the addition operator physically forces Python to create a brand new string from scratch on every single cycle. This degrades speed dramatically, frequently culminating in O(n^2) performance.")
        elif sig.complexity_signals.f_string_usage:
            insights.append("Implementing modern f-strings or `.join()` is an exceptionally great practice here. It effectively calculates and builds the full string efficiently in one final pass, rather than forcing the processor to create multiple slow, intermediate copies in system memory.")

        if sig.complexity_signals.aggregation_in_loop:
            insights.append("A note of caution: utilizing aggregation functions like `sum()`, `max()`, or `min()` directly inside a loop means Python must invisibly scan the entire sub-list over and over again from the beginning, easily causing severe quadratic O(n^2) slowdowns.")
        if sig.complexity_signals.bitwise_operations:
            insights.append("Bitwise operators are remarkably fast. Because they manipulate structural binary numbers directly at the absolute CPU hardware level, they effectively bypass almost all inherent high-level language translation overhead.")
        if sig.complexity_signals.boolean_short_circuit:
            insights.append("This conditional logic benefits strongly from short-circuiting. If the first leading segment of an `and` / `or` evaluation provides the definitive boolean answer, Python completely abandons evaluating the rest of the line, immediately saving precious execution time.")

        if sig.recursion_in_loop:
            insights.append("Architectural Warning: Combining dense loops and recursion naturally spawns a complex, mathematically branching tree that bogs down drastically as input numbers get even slightly larger. Replacing this with standard flat iteration or caching is almost always safer.")
        if sig.indirect_recursion:
            insights.append("Indirect recursion forces the system into a potentially unbounded cyclic dependency. Be highly cautious to ensure that a base case exists in at least one of the ping-ponging functions to prevent immediate stack overflow crashes.")
        if sig.complexity_signals.inefficient_list_pop:
            insights.append("Targeting `.pop(0)` on a standard Python list is surprisingly slow under the hood. Python is forced to manually drag and shift every other remaining item in the list one specific space to the left. Consider importing and utilizing `collections.deque` instead for instant execution.")
        if sig.complexity_signals.inefficient_list_insert:
            insights.append("Mechanically inserting an item at the exact start of a populated list commands Python to systematically push all existing elements back one slot to make the necessary room. This behaves as a very heavy, linear operation for massive arrays.")
        if sig.complexity_signals.repeated_sort:
            insights.append("Sorting a collection is an inherently heavy operation, frequently bottlenecking at O(n log n). Placing a sort algorithm loosely inside a loop forces the CPU to repeat that heavy lifting unnecessarily, inducing extreme runtime lag.")
        if sig.complexity_signals.set_mathematical_ops:
            insights.append("Native Set mathematics, such as unions or clean intersections, are highly optimized directly in Python's core layer. It processes and evaluates collections exponentially faster than attempting to write manual nested loops to check for duplication.")
        if sig.complexity_signals.dict_lookup_constant:
            insights.append("Utilizing the `.get()` syntax on a dictionary is universally excellent practice. It yields a fundamentally safe, instant O(1) mathematical lookup without risking a hard program crash if the specific key string does not happen to exist.")
        if sig.has_backtracking_risk:
            insights.append("By systematically mutating environmental state and making recursive jumps, this algorithm functions essentially like it is blindly exploring a maze and 'backtracking' whenever it strikes a logical dead end. While exceptionally powerful, this fundamentally scales very poorly on large systemic boards.")
        if sig.has_early_exits:
            insights.append("The presence of a `break` or `return` interrupt here stands as a fantastic functional optimization. It grants the running algorithm permission to completely halt working the exact millisecond it discovers the answer, rather than pointlessly finishing out the remainder of the iteration.")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if hits > 0:
            dynamic_note = f"\n\nRuntime Check: When the profiler ran this code natively, it confirmed that this exact line executed a total of {hits} times."

        return (
            f"{snippet_ref}, we can explicitly observe that {context_phrase}. "
            f"As a direct consequence of this structure, the total time complexity evaluates to {ginfo.raw}.\n\n"
            f"{educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _space_renderer(self, node: ast.AST, local_s: str, global_s: str, code_snippet: str, mem_state: dict, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_s)
        linfo = self._classify_big_o(local_s)
        
        snippet_refs = [
            f"Strictly from a memory perspective, looking at `{code_snippet}`", 
            f"Evaluating the specific RAM allocation protocols here",
            f"Analyzing precisely how `{code_snippet}` handles memory allocation"
        ]
        snippet_ref = random.choice(snippet_refs) if code_snippet else "Reviewing the overarching allocation strategies,"
        
        educational_growth = self.explainer.explain_space_growth(global_s, ginfo, self.ctx)
        
        insights = []
        if sig.complexity_signals.amortized_operation:
            insights.append(f"Locally, pushing a single solitary item only commands {local_s} physical space. However, on a Global scale, as the loop completes its iterations, the list swells linearly into a much more demanding {global_s} structural footprint.")
        elif local_s != global_s and local_s == "O(1)":
            insights.append(f"This highly localized action only truly requires {local_s} footprint to finalize its immediate job. Nevertheless, the overarching architectural algorithm's absolute peak memory dependency rests at {global_s}.")

        if sig.memory_signals.geometric_capacity_growth:
            insights.append("Attempting to double a string or a list inside a tight loop does not just waste processor time, it aggressively cannibalizes RAM. The exact physical memory required duplicates on every loop cycle, hurtling quickly toward a devastating O(2^n) capacity threshold.")
        if sig.memory_signals.allocates_2d_lists:
            insights.append("Instantiating nested array layouts like a mathematical grid or a matrix matrix mandates significantly denser contiguous memory block reservations than generating a standard flat, one-dimensional array.")
        elif sig.memory_signals.allocates_lists or sig.memory_signals.uses_list_comprehension:
            insights.append("Actively spawning brand new lists dictates that the operational computer must hunt for and deliberately reserve completely fresh blank blocks of internal memory to permanently house the newly incoming data elements.")
        if sig.memory_signals.allocates_sets or sig.memory_signals.uses_set_comprehension:
            insights.append("Sets are astonishingly capable tools for achieving instantaneous lookups, but they perform this magic by generating an invisible hash table directly under the hood. This table architecture intentionally leaves blank memory gaps to prevent collisions, meaning a Set definitively occupies more raw RAM than a standard List of the exact same elemental length.")
        if sig.memory_signals.performs_slicing:
            insights.append("A classically dangerous Python trap: slicing a full list syntactically using brackets does not simply establish a lightweight reference pointer to the original sequence, it forcibly instantiates a complete, separate duplicate array inside memory. It is highly advised to avoid executing this directly within loops.")
        if sig.memory_signals.recursive_stack_risk:
            insights.append("During every singular moment a recursive function calls itself, the core Python runtime engine saves an entire frame slice of the current internal state directly to active memory. If the sequence plunges thousands of levels deeply, Python will defensively crash with a RecursionError just to protect critical system RAM from fully exhausting.")
        if sig.memory_signals.efficient_deque_pop:
            insights.append("Importing and operating on a `deque` operates as a phenomenally effective memory optimization tactic for list-like queues. It gracefully permits the system to immediately clean and discard memory off the absolute front of the line instantaneously, fully devoid of demanding data shifting protocols.")
        if sig.memory_signals.set_and_dict_updates:
            insights.append("As you progressively populate more elements into a Set or Dictionary, Python must periodically pause execution, forcefully acquire a mathematically larger internal block of vacant memory, and meticulously rewrite the entire hash table from scratch to ensure future lookups remain blisteringly fast.")
        if sig.memory_signals.caches_results:
            insights.append("Caching is the fundamental definition of the classic computational trade-off. You are willfully choosing to strategically sacrifice raw spatial capacity by securely saving previously calculated answers to a dictionary to successfully purchase massive, systemic improvements in sheer processing time by entirely bypassing redundant mathematical executions.")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if mem_state:
            largest = max(mem_state.items(), key=lambda x: x[1]['size'], default=None)
            if largest and largest[1]['size'] > 1:
                dynamic_note = f"\n\nRuntime Diagnostic: The internal system profiler actively confirmed that the target variable `{largest[0]}` aggressively scaled up to physically hold {largest[1]['size']} elements during live code execution."

        return (
            f"{snippet_ref}, this extremely specific functional operation consumes an instantaneous localized footprint of {linfo.raw}. "
            f"Ultimately, it heavily contributes to driving the overarching algorithm's peak memory boundary to {ginfo.raw}.\n\n"
            f"{educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _pattern_renderer(self, node: ast.AST, global_t: str, sig: PatternSignals) -> str:
        parts: List[str] = []
        
        if getattr(self.ctx, "has_recursion_in_loop", False) or sig.recursion_in_loop:
            parts.append("Super-Exponential Computational Iteration initiated via Loop-Driven Recursive Branching.")
        elif sig.nested_loops:
            parts.append("Aggressive Multiplicative Repetition Scaling generated via Nested Logical Loops.")
            
        if getattr(self.ctx, "has_global_accumulation", False):
            parts.append("Persistent Linear Data Accumulation triggered via Standard Iteration.")

        if sig.complexity_signals.aggregation_in_loop:
            parts.append("Heavily Obscured Multiplicative Strain caused via Loop-Embedded Native Aggregations.")
        if sig.complexity_signals.bitwise_operations:
            parts.append("Hyper-Optimized Constant Hardware Processing executed via Raw Bitwise Mathematics.")
        if sig.complexity_signals.boolean_short_circuit:
            parts.append("Pristine Evaluation Bypass Optimization achieved via Logical Boolean Short-Circuiting.")
            
        if sig.comprehension_expansion:
            parts.append("Implicit Accelerated Data Traversal executed via Compact Syntactical Comprehension.")
        if sig.indirect_recursion:
            parts.append("Cyclic Computational Execution instantiated via Indirect Mutual Recursion Dependencies.")
        elif sig.has_recursion and not sig.recursion_in_loop:
            if sig.recursion_branching == "multi":
                parts.append("Hostile Exponential Capacity Generation triggered via Deep Multi-Branch Recursion.")
            else:
                parts.append("Extensive Self-Referential Stack Utilization occurring via Linear Depth Recursion.")
        if sig.has_memoization:
            parts.append("Premium Dynamic Programming Acceleration securely achieved via Dictionary Caching.")
        if sig.has_backtracking_risk:
            parts.append("Complex Algorithmic State Backtracking heavily reliant upon Systemic Recursive Mutation.")
        if sig.graph_traversal:
            parts.append("Highly Structural Network Navigation facilitated via Dedicated Graph Traversal.")
        if sig.complexity_signals.membership_in_list:
            parts.append("Markedly Suboptimal Sequential Scanning triggered via Linear List Membership Checks.")
        if sig.complexity_signals.set_mathematical_ops:
            parts.append("Exceptionally Optimized Collection Transformation executed via Applied Set Theory.")
        if sig.complexity_signals.dict_lookup_constant:
            parts.append("Highly Defensive Algorithmic Structuring natively secured via Dictionary Parsing.")
        if sig.memory_signals.performs_slicing:
            parts.append("Dangerously Volatile Spatial Exhaustion enacted via Array Duplication Slicing.")
        if sig.inline_ternary:
            parts.append("Rapid Syntactic Execution Simplification accomplished via Clean Inline Conditionals.")
        if sig.memory_signals.allocates_2d_lists:
            parts.append("Intensive Heavy Matrix Spatial Construction fueled via Multi-Dimensional Allocation.")
            
        if "n!" in global_t.lower() or "n^n" in global_t.lower() or "n^d" in global_t.lower():
            parts.append("Massive Combinatorial Mathematical Explosion forced via Hostile Systemic Expansion.")

        if parts:
            return "\n\nArchitectural Patterns Detected:\n" + "\n".join(f"- {p}" for p in parts)
        return ""

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, hits=0, mem_state=None):
        if is_dead and hits == 0:
            t_desc = (
                f"The targeted structural sequence `{code_snippet}` is strictly classified as unreachable Dead Code. Because the fundamental logic "
                f"mechanically explicitly forbids execution flow from traversing inside this specific block, it actively contributes zero actionable processing overhead, "
                f"resolving its impact effectively to an immaculate O(1) runtime penalty."
            )
            s_desc = (
                "Due cleanly to the rigid structural impossibility of ever triggering this block, the engine definitively never requests memory allocations "
                "for it. The spatial footprint remains completely unblemished and unaltered."
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
        
        if "loop" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: The definitive primary reason this algorithm evaluates so highly to {final_time} is the massive volume of repetitions explicitly forced by this {op_lower}.",
                f"\n\nBottleneck Warning: This specific {op_lower} forces the operating computer to systematically cycle over data repeatedly, actively creating the structural computational drag that pulls sheer performance down to {final_time}."
            ]
        elif "recur" in op_lower or "call" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: The sheer, unmitigated amount of branching logic actively generated by this {op_lower} acts as the main systemic culprit heavily anchoring the algorithm's absolute speed to {final_time}.",
                f"\n\nBottleneck Warning: Because this exactly constructed {op_lower} creates overlapping sub-problems without correctly remembering past answers, it forces a massive cascade of redundant mathematical operations causing a severe {final_time} delay."
            ]
        elif "comprehension" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: Do not be computationally fooled by its one-line elegance. Physically expanding this {op_lower} heavily requires hidden, intensive iteration, solidly defining the exact {final_time} runtime performance ceiling."
            ]
        elif "sort" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: Algorithmically sorting pure data is a fundamentally mathematical heavy task. Strictly relying on this {op_lower} operation acts as a massive execution barrier, fully preventing the algorithm from running any faster than {final_time}."
            ]
        else:
            templates = [
                f"\n\nBottleneck Warning: The absolute most computationally intensive, heaviest lifting work definitively happens entirely within this {op_lower}, ruthlessly dictating the final systemic {final_time} mathematical time complexity."
            ]
        return random.choice(templates)

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()
        
        if "recur" in op_lower or "call" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Every single isolated functional jump deep inside this {op_lower} mandatorily adds a completely new required block of memory explicitly to the call stack, violently driving the peak system memory directly up to {final_space}.",
                f"\n\nSpace Bottleneck Warning: The core algorithm greedily hoards physical memory until the deepest structural level of the {op_lower} is successfully reached. This exact behavior is precisely what systematically causes the massive {final_space} peak footprint."
            ]
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower or "expansion" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Actively mandating the local computer to brutally carve out fresh memory blocks for sprawling new arrays via this exact {op_lower} is what cleanly defines the {final_space} severe spatial constraints.",
                f"\n\nSpace Bottleneck Warning: Rather than intelligently shuffling data lightly in-place, this {op_lower} physically forcefully clones memory structures entirely, absolutely ensuring the overarching systemic memory requirements escalate to {final_space}."
            ]
        elif "slice" in op_lower or "string" in op_lower or "concat" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Because basic array slicing and standard string building forcefully creates total duplicate memory clones rather than relying on just simple, elegant reference pointers, this {op_lower} violently balloons the peak absolute spatial limits directly to {final_space}."
            ]
        else:
            templates = [
                f"\n\nSpace Bottleneck Warning: The sheer systemic density of newly generated intermediate data that must strictly be held actively in RAM exactly because of this {op_lower} is what brutally causes the overall capacity evaluation values to definitively reach {final_space}."
            ]
        return random.choice(templates)

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()
        
        if "log" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Systematically splitting the deep problem space logarithmically is a truly brilliant mathematical optimization. By proactively discarding half the unneeded data blindly at every step, this deeply refined {operation.lower()} absolutely boasts hyper-scalable {global_time} pristine execution speeds.",
                f"\n\nAlgorithmic Mastery: Excellent implementation of the classic Divide and Conquer synthesis. Because this precisely coded {operation.lower()} wonderfully avoids checking every single item linearly, it guarantees a phenomenal {global_time} performance curve even on truly massive, heavy inputs."
            ]
        elif "√" in time_lower or "sqrt" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Phenomenal logical optimization. By successfully recognizing the mathematical fact that you legitimately only need to verify factors actively up to the numeric square root, this {operation.lower()} intelligently bypasses staggering amounts of useless cyclic iterations, cleanly locking in blazing {global_time} speeds."
            ]
        elif "1" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Pristine operational execution. By intelligently grabbing target values absolutely instantly through hashed memory keys or explicitly direct index pointers, this refined {operation.lower()} completely avoids any form of repetitive sequential scanning, elegantly executing at a mathematically perfect {global_time} rating."
            ]
        else:
            templates = [
                f"\n\nAlgorithmic Mastery: The internal processing logic embedded deeply inside this {operation.lower()} is exceptionally well-structured mathematically. By cleanly sidestepping bloated redundant execution cycles, it successfully maintains an incredibly lean and highly optimal {global_time} processing speed."
            ]
        return random.choice(templates)

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation