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
            
            if func_name == current_fn or func_name in indirect_fns:
                self.signals.has_recursion = True
                self.signals.memory_signals.recursive_stack_risk = True
                if self._in_loop:
                    self.signals.recursion_in_loop = True

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
                    "This is Amortized Constant Time. Think of it like a monthly subscription: most days you use it for free, but once a month you pay a larger bill. In code, Python occasionally has to copy an array to a larger memory block when you append, but mostly it's instant.",
                    "This operates in Amortized O(1) Time. While adding an item is usually instant, Python arrays occasionally fill up and need to be resized behind the scenes. However, on average, the time it takes is extremely fast and flat."
                ])
            return EducationalInsightGenerator._random_choice([
                "This is Constant Time O(1). Think of this like looking up an address in a GPS—no matter how big the city is, you go straight to your destination instantly. The computer takes the exact same number of steps regardless of how much data you have.",
                "This runs in Constant Time. It means the speed doesn't change whether you have ten items or ten million items. It's an instant, direct operation like checking a specific key in a dictionary or grabbing the first item in a list."
            ])
        elif family == "linear":
            return EducationalInsightGenerator._random_choice([
                "This scales Linearly O(n). Imagine reading a book from cover to cover. If the book is twice as thick, it takes twice as long to read. The algorithm has to touch or check every single item in your data at least once.",
                "This exhibits Linear Time. The relationship is a straight line: as your data grows, the time it takes grows by the exact same amount. It usually happens when you loop through a list from start to finish."
            ])
        elif family == "root":
            return EducationalInsightGenerator._random_choice([
                "This runs in Square Root Time O(sqrt n). It's much faster than checking everything. Imagine if to find a word in a book, you only ever had to read up to the page number equal to the square root of the total pages. It saves the computer a massive amount of unnecessary checking.",
                "This uses a Square Root boundary. By recognizing mathematical patterns (like in prime number checking), the algorithm stops early. It grows slower than a standard loop, making it very efficient for math-heavy problems."
            ])
        elif family == "logarithmic":
            return EducationalInsightGenerator._random_choice([
                "This is Logarithmic Time O(log n), which is incredibly fast for large datasets. Imagine trying to find a word in a dictionary: you open it to the middle, check if your word is earlier or later, and throw half the book away. You repeat this until you find the word.",
                "This scales Logarithmically. Because the algorithm halves the remaining data at every single step, it can handle billions of items almost instantly. It's the hallmark of an efficient search."
            ])
        elif family == "linearithmic":
            return EducationalInsightGenerator._random_choice([
                "This is Linearithmic Time O(n log n). Think of it like sorting a messy deck of cards by splitting the deck into smaller piles (the 'log n' part), organizing them, and merging them back together (the 'n' part). It is the standard speed limit for the best general-purpose sorting algorithms.",
                "This operation runs in O(n log n) Time. It's slightly slower than linear time, but far faster than nested loops. It represents a highly optimized 'Divide and Conquer' strategy, commonly seen in Merge Sort or Quick Sort."
            ])
        elif family == "polynomial":
            return EducationalInsightGenerator._random_choice([
                "This exhibits Polynomial Growth, like O(n^2). Imagine a handshake puzzle: if 10 people are in a room and everyone must shake hands with everyone else, the number of handshakes explodes. In code, this usually means a loop running inside another loop.",
                "This scales Quadratically or Polynomially. While it works fine for small lists, doubling your data size will make the code four times slower. Nested loops or comparing every item to every other item causes this steep slowdown."
            ])
        elif family == "exponential":
            return EducationalInsightGenerator._random_choice([
                "This suffers from Exponential Growth O(2^n). Think of a rumor spreading where every person tells two new people. Adding just one single item to your input forces the computer to do double the work. It is very dangerous for large inputs.",
                "This is Exponential Time. The algorithm is likely calculating the same overlapping problems repeatedly without saving the answers (like a naive Fibonacci sequence). The processing time doubles constantly, eventually freezing the program."
            ])
        elif family == "recursive_branching":
            return EducationalInsightGenerator._random_choice([
                "This runs in Recursive Branching Time O(n^d). Because a recursive function is being called from inside a standard loop, it acts like a Russian Nesting Doll that branches out horizontally and vertically. It creates a massive, sprawling execution tree.",
                "This creates a complex Recursive Branching pattern. Instead of a single clean line of recursion, the loop forces the function to spawn multiple new paths at every single depth level, slowing down the system significantly."
            ])
        elif family == "super_exponential":
            return EducationalInsightGenerator._random_choice([
                "This exhibits Super Exponential Growth O(n^n). This is the absolute worst-case scenario. Imagine everyone in a massive stadium inviting a number of friends equal to the stadium's total capacity, and everyone doing this repeatedly. The system will crash on very small inputs.",
                "This scales Super-Exponentially. The algorithm is multiplying its workload to the power of its own input size. It is a sign of an unoptimized brute-force branching strategy that will freeze the computer almost immediately."
            ])
        elif family == "factorial":
            return EducationalInsightGenerator._random_choice([
                "This requires Factorial Time O(n!). Imagine trying to figure out the best seating arrangement for 15 friends by physically forcing them to sit in every single possible combination of chairs. A modern computer could take years to finish.",
                "This is Factorial Time, often caused by calculating every possible mathematical permutation of a dataset. It is an extreme brute-force method that will fail to complete on anything larger than a handful of items."
            ])
        elif family == "graph":
            return EducationalInsightGenerator._random_choice([
                "This scales based on Graph Topology O(V + E). Imagine visiting a new city: the time it takes to explore depends on how many specific places you want to visit (Vertices) and how many roads connect them (Edges).",
                "This operation navigates a Graph or Network. The speed depends directly on the density of the network—checking a highly interconnected grid will naturally take longer than checking a straight, simple path."
            ])
        else:
            return (
                "The mathematical scaling here is dynamic. The core takeaway is that the time it takes to finish will shift based on the specific shape and volume of the data you pass into it."
            )

    @staticmethod
    def explain_space_growth(global_s: str, info: BigOInfo, ctx: Any) -> str:
        family = info.family
        lower_s = global_s.lower()
        
        core_rule = "When checking Global Space, we don't just add up every line. We look at the 'high-water mark'—the absolute maximum amount of memory the algorithm needs to hold onto at its peak. "
        
        if "placeholder" in lower_s or family == "unknown":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The exact memory used here changes depending on what happens during runtime, so the analyzer cannot pin it to a strict mathematical formula.",
                core_rule + "Because this memory allocation shifts dynamically based on hidden conditions, the strict Big O space boundary cannot be guaranteed statically."
            ])
        elif "o(1)" in lower_s or family == "constant":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory usage here is Constant O(1). The algorithm cleverly reshuffles data 'in-place' or only creates a few small tracker variables. It does not hog extra RAM, making it very safe.",
                core_rule + "This operates with a Constant Space footprint. No matter how massive the input dataset gets, the algorithm won't ask the computer for larger chunks of memory."
            ])
        elif "log" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory scales Logarithmically. This usually happens during efficient recursion. Because the algorithm splits the problem in half, the 'call stack' of saved states never gets very deep, saving a lot of RAM.",
                core_rule + "This uses Logarithmic Space. The system only has to remember a very small, highly compressed trace of its steps, making it incredibly space-efficient even for huge datasets."
            ])
        elif family == "linear" or "o(n)" in lower_s:
            if "in-place" in (getattr(ctx, "hint_text", "") or ""):
                return (
                    core_rule + "While it technically scales linearly, the practical memory used is quite low because the algorithm prefers to modify the existing data rather than creating a massive duplicate copy."
                )
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory grows Linearly O(n). For every piece of data you add to the input, the algorithm has to build a matching slot in memory to store a copy, a dictionary, or a sequence.",
                core_rule + "This requires Linear Space. If your input size doubles, the algorithm will ask the computer for double the RAM to store its final output list or recursive tracking path."
            ])
        elif re.search(r'\b[ve]\b', lower_s) or family == "graph":
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory relies on the Graph's layout. To avoid walking in circles infinitely, the code has to keep a notebook (memory) of every specific node it has already visited.",
                core_rule + "This scales based on Network density. The algorithm actively maintains a queue of locations waiting to be explored, requiring space proportional to the graph."
            ])
        elif family in ["exponential", "super_exponential", "recursive_branching"] or "2^n" in lower_s or "n^n" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The memory usage is actively exploding. The algorithm is generating rapidly doubling copies of itself or its data, threatening to crash the system by running out of RAM.",
                core_rule + "This forces an Exponential memory footprint. Maintaining this rapidly expanding state is highly dangerous and will exhaust available system memory extremely quickly."
            ])
        elif family == "polynomial" or "n^2" in lower_s or "n * m" in lower_s or "n²" in lower_s:
            return EducationalInsightGenerator._random_choice([
                core_rule + "The space required scales Polynomially. The algorithm is building large, multi-dimensional structures like a 2D matrix or a dynamically expanding grid. This eats up RAM much faster than a simple list.",
                core_rule + "This exhibits Quadratic or Polynomial space growth. By nesting data inside other data, the memory consumed outpaces the base input size, placing heavy stress on the computer."
            ])
        else:
            return (
                core_rule + "The peak memory signature is dynamic. The system will have to constantly ask for fresh blocks of RAM to track its progress as it runs."
            )

    def _build_execution_context_phrase(self, sig: PatternSignals) -> str:
        options = []
        if getattr(self.ctx, "has_recursion_in_loop", False) or sig.recursion_in_loop:
            options = [
                "the function triggers a recursive call from inside a standard loop, resulting in an explosive, multi-branching tree",
                "a loop actively forces the program to dive into self-referential recursion repeatedly, multiplying the workload"
            ]
        elif sig.nested_loops:
            options = [
                "the algorithm forces an inner loop to run completely from start to finish for every single step of the outer loop",
                "the code relies on nested iteration, multiplying the operations together rather than adding them"
            ]
        elif sig.loop_depth >= 1:
            options = [
                "the logic relies on a loop to process elements in a linear, step-by-step sequence",
                "the algorithm systematically walks through the collection one item at a time"
            ]
        elif sig.membership_in_loop:
            options = [
                "the loop is forced to actively scan through a collection over and over to check if specific items exist",
                "the code repeatedly searches a list for a value while already inside a repetitive loop"
            ]
        elif sig.comprehension_expansion:
            options = [
                "Python uses a comprehension to dynamically unpack and build an entire collection behind the scenes",
                "a single line of code is actually hiding a full loop that generates a new list or dictionary"
            ]
        elif sig.has_recursion:
            if getattr(self.ctx, "has_memoization", False) or sig.has_memoization:
                options = [
                    "the recursive function checks a saved cache first, preventing it from wasting time calculating the same answers twice",
                    "the algorithm uses memoization to remember past work, cutting off massive branches of the recursive tree"
                ]
            elif sig.recursion_branching == "multi":
                options = [
                    "the function calls itself multiple times per step, causing the execution path to violently branch out like a tree",
                    "multiple recursive calls force the program to split its attention, rapidly multiplying the total amount of work"
                ]
            else:
                options = [
                    "the function relies on a single path of self-reference, diving deeper into the call stack until it hits a base case",
                    "the code calls itself sequentially, drilling down to the bottom of the problem before bubbling back up"
                ]
        elif sig.graph_traversal:
            options = [
                "the algorithm navigates outward like a spiderweb, exploring connected nodes and tracking its path",
                "the code uses a traversal technique to hop between linked data points in a network"
            ]
        elif sig.has_comment_block:
            options = [
                "the interpreter briefly processes a block of documentation text",
                "the execution passes over a static string annotation"
            ]
        else:
            options = [
                "the execution flows straight down through standard instructions without triggering any loops or recursion",
                "the code operates directly on the data without repeating itself"
            ]
        return random.choice(options)

    def _time_renderer(self, node: ast.AST, local_t: str, global_t: str, code_snippet: str, hits: int, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_t)
        
        snippet_refs = [
            f"Looking at `{code_snippet}`", 
            f"Breaking down this block", 
            f"Analyzing `{code_snippet}`"
        ]
        snippet_ref = random.choice(snippet_refs) if code_snippet else "Reviewing this segment"
        
        context_phrase = self._build_execution_context_phrase(sig)
        educational_growth = self.explainer.explain_time_growth(ginfo, is_amortized=sig.complexity_signals.amortized_operation)
        
        insights = []
        if sig.memory_signals.geometric_capacity_growth:
            insights.append("Notice that the variable is being multiplied or added to itself repeatedly inside a loop. This forces the computer to continuously reallocate massive chunks of memory, turning a simple loop into an incredibly slow exponential operation.")
        elif sig.memory_signals.string_concatenation_in_loop:
            insights.append("A common trap: appending to a string inside a loop with `+` forces Python to create a brand new string from scratch every time. This degrades speed dramatically, making it O(n^2) overall.")
        elif sig.complexity_signals.f_string_usage:
            insights.append("Using modern f-strings or `.join()` is a great practice. It builds the string efficiently in one go, rather than creating multiple slow, temporary copies in memory.")

        if sig.complexity_signals.aggregation_in_loop:
            insights.append("Be careful: using functions like `sum()`, `max()`, or `min()` inside a loop means Python has to invisibly scan the entire list over and over again, easily causing O(n^2) slowdowns.")
        if sig.complexity_signals.bitwise_operations:
            insights.append("Bitwise operators are incredibly fast. Because they manipulate binary numbers directly at the CPU hardware level, they bypass almost all high-level language overhead.")
        if sig.complexity_signals.boolean_short_circuit:
            insights.append("This logic benefits from 'short-circuiting'. If the first part of an `and` / `or` check provides the definitive answer, Python completely skips evaluating the rest of the line, saving time.")

        if sig.recursion_in_loop:
            insights.append("Warning: Combining loops and recursion creates a complex branching tree that slows down drastically as numbers get larger. Standard iteration is almost always safer.")
        if sig.complexity_signals.inefficient_list_pop:
            insights.append("Using `.pop(0)` on a standard list is surprisingly slow. Python has to manually shift every other item in the list one space to the left. Consider importing `collections.deque` instead.")
        if sig.complexity_signals.inefficient_list_insert:
            insights.append("Inserting an item at the start of a list forces Python to push all existing items back to make room. This is a heavy, slow operation for large lists.")
        if sig.complexity_signals.repeated_sort:
            insights.append("Sorting a list is a heavy operation (usually O(n log n)). Placing a sort function inside a loop forces the computer to do that heavy lifting repeatedly, causing severe lag.")
        if sig.complexity_signals.set_mathematical_ops:
            insights.append("Set math (like unions or intersections) is highly optimized in Python. It compares collections much faster than trying to write manual loops to check for duplicates.")
        if sig.complexity_signals.dict_lookup_constant:
            insights.append("Using `.get()` on a dictionary is excellent practice. It provides a safe, instant O(1) lookup without risking a program crash if the key doesn't exist.")
        if sig.has_backtracking_risk:
            insights.append("By mutating state and making recursive calls, this algorithm behaves like it is exploring a maze and 'backtracking' when it hits a dead end. This is powerful, but scales poorly on large boards.")
        if sig.has_early_exits:
            insights.append("The use of `break` or `return` here is a great optimization. It allows the algorithm to stop working the exact second it finds the answer, rather than blindly finishing the loop.")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if hits > 0:
            dynamic_note = f"\n\n*Runtime Check:* When we ran this code, the profiler noted this specific line executed {hits} times."

        return (
            f"{snippet_ref}, we can observe that {context_phrase}. "
            f"Because of this, the total time complexity evaluates to {ginfo.raw}.\n\n"
            f"{educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _space_renderer(self, node: ast.AST, local_s: str, global_s: str, code_snippet: str, mem_state: dict, sig: PatternSignals) -> str:
        ginfo = self._classify_big_o(global_s)
        linfo = self._classify_big_o(local_s)
        
        snippet_refs = [
            f"From a memory perspective, looking at `{code_snippet}`", 
            f"Evaluating the RAM usage here",
            f"Looking at how `{code_snippet}` handles memory"
        ]
        snippet_ref = random.choice(snippet_refs) if code_snippet else "Reviewing the allocation strategies,"
        
        educational_growth = self.explainer.explain_space_growth(global_s, ginfo, self.ctx)
        
        insights = []
        if sig.complexity_signals.amortized_operation:
            insights.append(f"Locally, appending a single item only takes {local_s} space. But Globally, as the loop runs, the list grows into a much larger {global_s} structure.")
        elif local_s != global_s and local_s == "O(1)":
            insights.append(f"This specific line only needs {local_s} space to do its job. However, the overarching algorithm's peak memory usage is {global_s}.")

        if sig.memory_signals.geometric_capacity_growth:
            insights.append("Doubling a string or list inside a loop doesn't just waste time—it aggressively eats up RAM. The memory required doubles every loop, quickly approaching a dangerous O(2^n) capacity limit.")
        if sig.memory_signals.allocates_2d_lists:
            insights.append("Creating nested arrays (like a grid or a matrix) requires significantly more contiguous memory blocks than a standard flat list.")
        elif sig.memory_signals.allocates_lists or sig.memory_signals.uses_list_comprehension:
            insights.append("Generating new lists means the computer has to reserve fresh blocks of memory to store the incoming data elements.")
        if sig.memory_signals.allocates_sets or sig.memory_signals.uses_set_comprehension:
            insights.append("Sets are amazing for fast lookups, but they achieve this by building a 'hash table' under the hood. This table intentionally leaves empty memory gaps, meaning a Set takes up more RAM than a List of the same size.")
        if sig.memory_signals.performs_slicing:
            insights.append("A common Python trap: slicing a list (like `arr[:]`) doesn't just point to the original list—it creates a complete, separate duplicate in memory. Be careful doing this inside loops.")
        if sig.memory_signals.recursive_stack_risk:
            insights.append("Every time a recursive function calls itself, Python saves a 'frame' of the current state to memory. If the recursion goes thousands of levels deep, Python will crash with a 'RecursionError' to protect system RAM.")
        if sig.memory_signals.efficient_deque_pop:
            insights.append("Using a `deque` is a fantastic memory optimization for queues. It allows the system to clean up memory from the front of the line instantly without shifting data around.")
        if sig.memory_signals.set_and_dict_updates:
            insights.append("As you add more items to a Set or Dictionary, Python occasionally has to pause, grab a larger block of memory, and completely rebuild the hash table to keep lookups fast.")
        if sig.memory_signals.caches_results:
            insights.append("Caching is a classic trade-off: you are intentionally sacrificing space (saving answers to a dictionary) to buy massive improvements in time (skipping redundant math).")

        insight_text = "\n\n" + " ".join(insights) if insights else ""
        
        dynamic_note = ""
        if mem_state:
            largest = max(mem_state.items(), key=lambda x: x[1]['size'], default=None)
            if largest and largest[1]['size'] > 1:
                dynamic_note = f"\n\n*Runtime Diagnostic:* The profiler confirmed that the variable `{largest[0]}` grew to hold {largest[1]['size']} elements during execution."

        return (
            f"{snippet_ref}, this specific operation takes up an instantaneous footprint of {linfo.raw}. "
            f"Ultimately, it contributes to an algorithm peak memory bound of {ginfo.raw}.\n\n"
            f"{educational_growth}"
            f"{insight_text}"
            f"{dynamic_note}"
        )

    def _pattern_renderer(self, node: ast.AST, global_t: str, sig: PatternSignals) -> str:
        parts: List[str] = []
        
        if getattr(self.ctx, "has_recursion_in_loop", False) or sig.recursion_in_loop:
            parts.append("Super-Exponential Iteration via Loop-Driven Recursive Branching.")
        elif sig.nested_loops:
            parts.append("Multiplicative Repetition Scaling via Nested Loops.")
            
        if getattr(self.ctx, "has_global_accumulation", False):
            parts.append("Persistent Data Accumulation via Iteration.")

        if sig.complexity_signals.aggregation_in_loop:
            parts.append("Hidden Multiplicative Strain via Loop-Embedded Aggregations (`sum`, `max`).")
        if sig.complexity_signals.bitwise_operations:
            parts.append("Hyper-Optimized Constant Processing via Bitwise Math.")
        if sig.complexity_signals.boolean_short_circuit:
            parts.append("Evaluation Bypass Optimization via Boolean Short-Circuiting.")
            
        if sig.comprehension_expansion:
            parts.append("Implicit Data Traversal via Syntactical Comprehension.")
        if sig.has_recursion and not sig.recursion_in_loop:
            if sig.recursion_branching == "multi":
                parts.append("Exponential Capacity Generation via Multi-Branch Recursion.")
            else:
                parts.append("Self-Referential Stack Utilization via Deep Recursion.")
        if sig.has_memoization:
            parts.append("Dynamic Programming Acceleration via Dictionary Caching.")
        if sig.has_backtracking_risk:
            parts.append("Algorithmic State Backtracking via Recursive Mutation.")
        if sig.graph_traversal:
            parts.append("Structural Network Navigation via Graph Traversal.")
        if sig.complexity_signals.membership_in_list:
            parts.append("Suboptimal Sequential Scanning via List Membership Checks.")
        if sig.complexity_signals.set_mathematical_ops:
            parts.append("Optimized Collection Transformation via Set Theory.")
        if sig.complexity_signals.dict_lookup_constant:
            parts.append("Defensive Algorithmic Structuring via Dictionary `.get()`.")
        if sig.memory_signals.performs_slicing:
            parts.append("Volatile Spatial Exhaustion via Array Duplication Slicing.")
        if sig.inline_ternary:
            parts.append("Syntactic Execution Simplification via Inline Conditionals.")
        if sig.memory_signals.allocates_2d_lists:
            parts.append("Heavy Matrix Spatial Construction via Multi-Dimensional Allocation.")
            
        if "n!" in global_t.lower() or "n^n" in global_t.lower() or "n^d" in global_t.lower():
            parts.append("Combinatorial Mathematical Explosion via Hostile Systemic Expansion.")

        if parts:
            return "\n\nArchitectural Patterns Detected:\n" + "\n".join(f"- {p}" for p in parts)
        return ""

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, hits=0, mem_state=None):
        if is_dead and hits == 0:
            t_desc = (
                f"The target sequence `{code_snippet}` is classified as Dead Code. Because the logic "
                f"mechanically forbids execution flow from traversing this block, it contributes zero actionable overhead, "
                f"resolving effectively to an O(1) runtime penalty."
            )
            s_desc = (
                "Due to the structural impossibility of triggering this block, the engine never requests memory allocations "
                "for it. The spatial footprint remains completely unaltered."
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
                f"\n\nBottleneck Warning: The primary reason this algorithm evaluates to {final_time} is the massive volume of repetitions forced by this {op_lower}.",
                f"\n\nBottleneck Warning: This {op_lower} forces the computer to cycle over data repeatedly, creating the structural drag that pulls performance down to {final_time}."
            ]
        elif "recur" in op_lower or "call" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: The sheer amount of branching logic generated by this {op_lower} is the main culprit anchoring the algorithm's speed to {final_time}.",
                f"\n\nBottleneck Warning: Because this {op_lower} creates overlapping sub-problems without remembering past answers, it forces redundant math that causes a {final_time} delay."
            ]
        elif "comprehension" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: Do not be fooled by its one-line elegance. Expanding this {op_lower} requires hidden iteration, defining the {final_time} runtime ceiling."
            ]
        elif "sort" in op_lower:
            templates = [
                f"\n\nBottleneck Warning: Sorting data is a mathematically heavy task. Relying on this {op_lower} operation acts as a barrier, preventing the algorithm from running faster than {final_time}."
            ]
        else:
            templates = [
                f"\n\nBottleneck Warning: The most computationally intensive work happens entirely within this {op_lower}, dictating the final {final_time} time complexity."
            ]
        return random.choice(templates)

    def get_space_bottleneck_warning(self, operation: str, final_space: str) -> str:
        op_lower = operation.lower()
        
        if "recur" in op_lower or "call" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Every single jump in this {op_lower} adds a new required block of memory to the call stack, driving the peak memory up to {final_space}.",
                f"\n\nSpace Bottleneck Warning: The algorithm hoards memory until the deepest level of the {op_lower} is reached. This is what causes the {final_space} peak footprint."
            ]
        elif "comprehension" in op_lower or "list" in op_lower or "assignment" in op_lower or "expansion" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Actively forcing the computer to carve out fresh memory blocks for new arrays via this {op_lower} is what defines the {final_space} spatial constraints.",
                f"\n\nSpace Bottleneck Warning: Rather than shuffling data in-place, this {op_lower} physically clones structures, ensuring the overall memory requirements escalate to {final_space}."
            ]
        elif "slice" in op_lower or "string" in op_lower or "concat" in op_lower:
            templates = [
                f"\n\nSpace Bottleneck Warning: Because slicing and standard string building creates total duplicate clones rather than just simple pointers, this {op_lower} balloons the peak spatial limits to {final_space}."
            ]
        else:
            templates = [
                f"\n\nSpace Bottleneck Warning: The sheer density of intermediate data that must be held in RAM because of this {op_lower} is what causes the overall capacity values to reach {final_space}."
            ]
        return random.choice(templates)

    def get_time_optimization_praise(self, operation: str, global_time: str) -> str:
        time_lower = global_time.lower()
        
        if "log" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Splitting the problem space logarithmically is a brilliant optimization. By discarding half the unneeded data at every step, this {operation.lower()} boasts hyper-scalable {global_time} execution speeds.",
                f"\n\nAlgorithmic Mastery: Excellent 'Divide and Conquer' synthesis. Because this {operation.lower()} avoids checking every single item linearly, it guarantees a phenomenal {global_time} performance curve even on massive inputs."
            ]
        elif "√" in time_lower or "sqrt" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Phenomenal optimization. By successfully identifying that you only need to check factors up to the square root, this {operation.lower()} bypasses staggering amounts of useless iterations, locking in {global_time} speeds."
            ]
        elif "1" in time_lower:
            templates = [
                f"\n\nAlgorithmic Mastery: Pristine execution. By grabbing values instantly through hashed keys or direct index pointers, this {operation.lower()} completely avoids any repetitive scanning, executing at a perfect {global_time}."
            ]
        else:
            templates = [
                f"\n\nAlgorithmic Mastery: The logic inside this {operation.lower()} is exceptionally well-structured. By sidestepping redundant cycles, it maintains a lean and highly optimal {global_time} speed."
            ]
        return random.choice(templates)

    def _format_recurrence_relation(self, relation: str) -> str:
        return relation