# semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Dynamic Natural Language Generation Engine for AlgoBlocks.
    Tailored for 2nd to 4th-year CS students, translating dry AST analysis 
    into relatable, educational, and highly varied explanations.
    """
    
    def __init__(self, analyzer_context):
        self.ctx = analyzer_context

    # ==========================================
    # AST INTROSPECTION & TRANSLATION HELPERS
    # ==========================================
    def _extract_name(self, node):
        """Translates AST nodes into readable variable/function names."""
        if isinstance(node, ast.Name): return f"'{node.id}'"
        if isinstance(node, ast.Constant): 
            if isinstance(node.value, str): return f'"{node.value}"'
            return str(node.value)
        if isinstance(node, ast.Attribute): return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return f"{self._extract_name(node.func)}()"
        if isinstance(node, ast.Subscript): return f"{self._extract_name(node.value)}[...]"
        if isinstance(node, ast.List): return "a new list"
        if isinstance(node, ast.Dict): return "a new dictionary"
        if isinstance(node, ast.Set): return "a new set"
        if isinstance(node, ast.Tuple): return "a new tuple"
        return "the target"

    def _get_op_name(self, op):
        """Translates math/logic AST operations into plain English."""
        if isinstance(op, ast.Add): return "addition"
        if isinstance(op, ast.Sub): return "subtraction"
        if isinstance(op, ast.Mult): return "multiplication"
        if isinstance(op, ast.Div): return "floating-point division"
        if isinstance(op, ast.FloorDiv): return "integer (floor) division"
        if isinstance(op, ast.Mod): return "modulo (remainder) operation"
        if isinstance(op, ast.Pow): return "exponentiation"
        if isinstance(op, ast.LShift): return "bitwise left shift"
        if isinstance(op, ast.RShift): return "bitwise right shift"
        if isinstance(op, ast.BitAnd): return "bitwise AND"
        if isinstance(op, ast.BitOr): return "bitwise OR"
        if isinstance(op, ast.BitXor): return "bitwise XOR"
        return "mathematical operation"

    # ==========================================
    # MAIN GENERATION DELEGATOR
    # ==========================================
    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        """Main entry point: delegates AST nodes to specific linguistic generators."""
        if is_dead:
            return (
                f"The statement `{code_snippet}` is flagged as Unreachable (Dead Code). "
                "Because it comes after a flow interruption like a `return` or `break`, "
                "the Python interpreter will never actually execute this line. It contributes O(1) to your runtime.",
                "Since this code is skipped by the interpreter, it doesn't allocate any physical memory or call stack frames."
            )

        time_desc = self._route_time_semantics(node, local_t, global_t, code_snippet)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet)
        return time_desc, space_desc

    # ==========================================
    # TIME COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_time_semantics(self, node, local_t, global_t, code_snippet):
        """Routes the node to the appropriate time complexity explanation generator."""
        
        # Conversational prefixes to make it sound like a mentor reviewing the code
        prefix = random.choice([
            f"Looking at `{code_snippet}`: ",
            f"Analyzing the line `{code_snippet}`: ",
            f"For `{code_snippet}`: ",
            f"Here, ",
            ""
        ])

        # 1. HEAVY COMPLEXITY OVERRIDES (Exponential, Factorial, Graph)
        if "2^n" in local_t or self.ctx._is_exponential_loop(node):
            return prefix + random.choice([
                "This triggers an exponential O(2^n) cascade. Every time you add one more item to the input, the amount of work doubles! Think of a branching tree where every node creates two more paths. This gets dangerously slow very quickly.",
                "We're hitting an O(2^n) exponential runtime here. This usually happens in naive recursion (like calculating Fibonacci without memoization) where the algorithm blindly recalculates the same overlapping subproblems.",
                "This operation blows up exponentially (O(2^n)). For anything beyond a small dataset, this will likely freeze your program."
            ])
            
        if "n!" in local_t:
            return prefix + random.choice([
                "This line is part of a factorial O(n!) generation. It's computing every possible permutation or combination. To put that in perspective, an input of just 15 would take a modern computer years to finish!",
                "We are dealing with O(n!) factorial time. This is the classic 'Traveling Salesperson' brute-force runtime. It's extremely heavy and should only be used on tiny inputs."
            ])

        if "V + E" in local_t:
            return prefix + random.choice([
                "This logic is part of a graph traversal. Because it uses a 'visited' check to ensure we only process each Vertex (V) and Edge (E) exactly once, it runs in an optimal O(V + E) time.",
                "This is a classic Breadth-First or Depth-First operation. By not revisiting nodes we've already seen, we keep the time complexity tightly bounded to O(V + E)."
            ])

        # 2. STANDARD AST TYPE ROUTING
        if isinstance(node, (ast.For, ast.While)):
            return prefix + self._time_for_loops(node, local_t, global_t)
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            return prefix + self._time_for_assignments(node, local_t, global_t)
        elif isinstance(node, ast.Call):
            return prefix + self._time_for_calls(node, local_t, global_t)
        elif isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp)):
            return prefix + self._time_for_comprehensions(node, local_t, global_t)
        elif isinstance(node, ast.If):
            return prefix + self._time_for_conditionals(node, local_t, global_t)
        elif isinstance(node, ast.Return):
            return prefix + random.choice([
                f"Passing the final result back to the caller is a simple O(1) operation.",
                f"The `return` statement resolves instantly in {local_t} time, popping the current frame off the call stack."
            ])
        elif isinstance(node, ast.Expr):
            # Might be a standalone math operation or docstring
            return prefix + f"This standalone expression is evaluated in {local_t} time."
        
        # 3. GENERIC FALLBACK WITH NESTING AWARENESS
        if self.ctx.loop_depth > 0:
            return prefix + random.choice([
                f"On its own, this takes {local_t} time. However, because it's trapped inside a loop, it gets executed repeatedly, dragging its total global contribution to {global_t}.",
                f"This is a fast {local_t} operation, but the surrounding loop acts as a multiplier. Over the lifecycle of the algorithm, this line contributes {global_t} to the total runtime."
            ])
        
        return prefix + f"This basic operation resolves cleanly in {local_t} time."

    def _time_for_loops(self, node, local_t, global_t):
        """Generates detailed explanations for looping structures."""
        is_for = isinstance(node, ast.For)
        loop_type = "The `for` loop" if is_for else "The `while` loop"
        
        # Determine the local behavior of the loop
        base = ""
        if "O(1)" in local_t:
            base = random.choice([
                f"{loop_type} runs for a hardcoded number of iterations. Since it doesn't grow when the input data grows, it's classified as an O(1) constant time loop.",
                f"Because the iteration count here is strictly bounded (it doesn't scale with 'n'), {loop_type.lower()} executes in O(1) time."
            ])
        elif "log n" in local_t:
            base = random.choice([
                f"{loop_type} acts like a binary search. By cutting the remaining workload in half (or by a fraction) on every cycle, it achieves a blazing fast O(log n) runtime.",
                f"Notice how the step size jumps multiplicatively or divides the problem space? That 'divide and conquer' approach gives {loop_type.lower()} a logarithmic O(log n) efficiency."
            ])
        elif "√n" in local_t:
            base = random.choice([
                f"{loop_type} relies on a square root boundary. This is common in prime number checking or jump searches, effectively running in O(√n) time.",
                f"By limiting iterations to the square root of the input size, {loop_type.lower()} skips massive amounts of redundant work, landing at O(√n)."
            ])
        else:
            base = random.choice([
                f"{loop_type} performs a linear scan. It forces the CPU to process each element one by one, resulting in an O(n) traversal.",
                f"We see a direct 1:1 relationship here. As the data grows, the number of iterations grows proportionally, giving {loop_type.lower()} an O(n) linear complexity."
            ])

        # Integrate Nested Loop Knowledge (Crucial for CS Students)
        if self.ctx.loop_depth > 1:
            nesting_context = random.choice([
                f" However, this is an inner loop. In Big O analysis, inner loops multiply with their outer loops. This pushes the actual global runtime for this section to a polynomial {global_t}.",
                f" But here's the catch: because it's nested, this loop resets and runs fully for *every* step of the outer loop. This compounding effect creates a {global_t} bottleneck.",
                f" Since it sits inside another loop, you have to multiply their complexities together (e.g., O(n) * O(n) = O(n²)). The global cost here balloons to {global_t}."
            ])
            return base + nesting_context
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        """Explains that comprehensions are just hidden loops in C."""
        comp_type = "list comprehension"
        if isinstance(node, ast.DictComp): comp_type = "dictionary comprehension"
        if isinstance(node, ast.SetComp): comp_type = "set comprehension"
        
        return random.choice([
            f"Under the hood, a {comp_type} is just a highly optimized C-level loop. It still has to iterate through every element to build the structure, meaning it runs in {local_t} time.",
            f"While {comp_type}s look like a clean one-liner, they don't cheat physics. The interpreter still performs a linear O(n) scan to evaluate and insert each item."
        ])

    def _time_for_assignments(self, node, local_t, global_t):
        """Generates explanations for variable assignments and mutations."""
        # Get variable name
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign):
            targets = [self._extract_name(node.target)]
        else:
            targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable"
        rhs = node.value if hasattr(node, 'value') else None
        
        # 1. Slicing logic
        if self.ctx.has_slicing:
            return random.choice([
                f"Assigning this slice to {t_name} is an O(n) operation. Slicing doesn't just pass a reference; Python physically iterates over the array to copy the requested elements into a new list.",
                f"Array slicing in Python requires the interpreter to traverse the sequence and allocate a new copy for {t_name}. This bulk operation takes O(n) linear time."
            ])
            
        # 2. Linear Assignments (e.g., assigning a whole list copy)
        if "O(n)" in local_t:
            return random.choice([
                f"Evaluating the right side and binding it to {t_name} requires a full O(n) traversal to construct the data.",
                f"This isn't just pointing a reference. Updating {t_name} here forces a linear O(n) scan across the underlying structure."
            ])
            
        # 3. O(1) Quick Assignments (Math, lookups, primitive binding)
        if isinstance(rhs, ast.BinOp):
            op_str = self._get_op_name(rhs.op)
            return random.choice([
                f"The CPU's Arithmetic Logic Unit (ALU) performs the {op_str} and Python points {t_name} to the result. This is a lightning-fast O(1) operation.",
                f"Evaluating this math expression ({op_str}) and updating {t_name} resolves instantly in constant O(1) time."
            ])
        if isinstance(rhs, ast.Subscript):
            return random.choice([
                f"Direct index lookups (like grabbing an array element or dictionary key) rely on memory offsets or hashing. Assigning that to {t_name} takes only O(1) time.",
                f"Fetching a specific element from an indexed structure is an O(1) constant time action before it gets bound to {t_name}."
            ])
        if isinstance(rhs, ast.Call):
            return f"Once the function finishes, grabbing its return value and linking it to {t_name} takes O(1) time."
            
        # Generic O(1)
        return random.choice([
            f"Python creates a pointer mapping {t_name} to its value in memory. This primitive binding is always O(1).",
            f"Mutating the state of {t_name} here evaluates instantly in constant O(1) time."
        ])

    def _time_for_calls(self, node, local_t, global_t):
        """Generates explanations for recursive, built-in, and custom function calls."""
        f_name = self._extract_name(node.func).replace("()", "")
        
        # 1. Recursion Handling
        if f_name == self.ctx.current_function_name:
            if getattr(self.ctx, 'has_division', False):
                return random.choice([
                    f"This is a recursive call to '{f_name}' that divides the input space (e.g., n/2). This divide-and-conquer strategy is what shapes the algorithm's global {global_t} efficiency.",
                    f"By recursively invoking '{f_name}' on a fraction of the data, the algorithm aggressively avoids doing extra work, landing at a {global_t} master recurrence."
                ])
            return random.choice([
                f"This line invokes '{f_name}' recursively. Every time it calls itself, it spawns a new branch in the execution tree. This stacking pushes the global complexity to {global_t}.",
                f"A recursive jump back into '{f_name}'. Without memoization to cache results, these overlapping calls build up the mathematical recurrence to {global_t}."
            ])
            
        # 2. Built-in Python Functions
        if f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return random.choice([
                f"This triggers Python's built-in `{f_name}()` function. Behind the scenes in CPython, this function {b_info['desc']}. Knowing this is critical—it implicitly costs {local_t} time.",
                f"Don't let the one-liner fool you! Calling the native `{f_name}()` {b_info['desc']}, which injects a hidden {local_t} operation into your runtime."
            ])
            
        # 3. Standard Custom Call
        return random.choice([
            f"Executing the external function '{f_name}()' pauses this scope until the function resolves. We estimate its internal logic takes {local_t} time.",
            f"Control is passed to '{f_name}()'. Based on its contents, the engine evaluates this call to take {local_t} time."
        ])

    def _time_for_conditionals(self, node, local_t, global_t):
        """Explains if/elif/else statements."""
        # Check if this 'if' is inside a loop, often acting as a filter or partition (like QuickSort)
        if getattr(self.ctx, 'loop_depth', 0) > 0 and getattr(node, 'lineno', 0) in self.ctx.conditional_partition_lines:
            return random.choice([
                f"This `if` acts as a partition or filter mechanism inside the loop. The boolean comparison itself is O(1), but it directly dictates the data-dependent flow of this {global_t} block.",
                f"Checking this condition is a fast O(1) CPU instruction, but since it gates the logic inside the loop, it heavily influences the algorithm's worst-case {global_t} runtime."
            ])
            
        return random.choice([
            f"Evaluating this boolean condition (checking if it's True or False) is a basic O(1) instruction. It instantly determines which logical branch to take next.",
            f"Comparing values or checking truthiness resolves immediately in O(1) constant time."
        ])

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        """Routes the node to the appropriate space complexity explanation."""
        prefix = random.choice([
            "Regarding memory: ",
            "From a space perspective: ",
            "Looking at RAM usage: ",
            "Memory-wise: ",
            ""
        ])

        # 1. GRAPH AUXILIARY STRUCTURES (O(V))
        if "V" in local_s:
            return prefix + random.choice([
                "This step allocates O(V) extra memory. Graph algorithms need structures like a 'visited' Hash Set or a Queue to safely map out vertices without getting stuck in infinite loops.",
                "To explore the graph, we must cache the spatial states of nodes we've seen. This requires O(V) auxiliary memory."
            ])

        # 2. RECURSIVE CALL STACKS (O(n) or O(log n))
        if "log n" in local_s and getattr(self.ctx, 'has_division', False):
            return prefix + random.choice([
                "Because the recursion uses a divide-and-conquer approach, the maximum depth of the call stack is heavily compressed. The OS only needs O(log n) memory for the execution frames.",
                "The recursion tree is shallow! It only stacks O(log n) frames in memory before hitting a base case and collapsing."
            ])
        
        if "n" in local_s:
            # Check if O(n) space is from Recursion Stack or Data Allocation
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == self.ctx.current_function_name:
                    return prefix + random.choice([
                        f"Every time '{f_name}' calls itself, the Operating System must pause the current function and push a new 'frame' onto the call stack to store local variables. If it recurses 'n' times, that's O(n) extra space!",
                        f"Recursion isn't free! Each jump into '{f_name}' stacks up in system memory until a base case is hit. This sequential layering consumes O(n) space."
                    ])
                if f_name in self.ctx.builtin_complexities:
                    return prefix + f"The built-in `{f_name}()` function dynamically provisions {local_s} extra memory internally to sort or organize data before returning it."
            
            if isinstance(node, (ast.Assign, ast.AugAssign)):
                rhs = getattr(node, 'value', None)
                if self.ctx.has_slicing:
                    return prefix + "Slicing an array forces Python to request a completely new block of memory from the OS to store the duplicate values, costing O(n) extra space."
                if isinstance(rhs, (ast.ListComp, ast.List)):
                    return prefix + "Initializing this list requires the system to request a contiguous block of O(n) memory to store the elements."
                if isinstance(rhs, (ast.DictComp, ast.Dict)):
                    return prefix + "Creating this dictionary sets up an O(n) Hash Map in RAM, allocating buckets to prevent key collisions."

            return prefix + random.choice([
                f"The algorithm generates a new data structure here. As the input grows, the auxiliary memory needed scales directly with it, landing at {local_s}.",
                f"We see an O(n) memory spike here because the system must reserve new heap space to accommodate the collection of data."
            ])

        # 3. O(1) IN-PLACE MUTATION
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            return prefix + random.choice([
                f"This mutation is handled in-place. By pointing a reference to a new primitive value, it only needs a tiny O(1) sliver of memory. No massive arrays are duplicated.",
                f"Variables are overwritten cleanly in-place. This lean operation keeps the memory footprint tightly bounded at {local_s}."
            ])

        # 4. DEFAULT O(1) FALLBACK
        return prefix + random.choice([
            f"This computational step operates purely on existing data references. Because it doesn't create new scaling arrays, it demands only {local_s} constant space.",
            f"No auxiliary data structures are initialized here, ensuring the RAM footprint remains stable at {local_s}."
        ])