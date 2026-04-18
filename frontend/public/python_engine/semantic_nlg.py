# semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Advanced Dynamic Natural Language Generation (NLG) Engine for AlgoBlocks.
    
    Target Audience: 2nd to 4th-Year Computer Science Students.
    Purpose: To translate abstract AST nodes and Big O complexities into 
    highly varied, deeply educational explanations covering Data Structures, 
    Algorithms, and CPython internals.
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
        op_map = {
            ast.Add: "addition", ast.Sub: "subtraction", 
            ast.Mult: "multiplication", ast.Div: "floating-point division",
            ast.FloorDiv: "integer (floor) division", ast.Mod: "modulo (remainder) operation",
            ast.Pow: "exponentiation", ast.LShift: "bitwise left shift",
            ast.RShift: "bitwise right shift", ast.BitAnd: "bitwise AND",
            ast.BitOr: "bitwise OR", ast.BitXor: "bitwise XOR"
        }
        return op_map.get(type(op), "mathematical operation")

    def _get_cmp_name(self, op):
        """Translates comparison operations."""
        cmp_map = {
            ast.Eq: "equality check", ast.NotEq: "inequality check",
            ast.Lt: "less-than comparison", ast.LtE: "less-than-or-equal comparison",
            ast.Gt: "greater-than comparison", ast.GtE: "greater-than-or-equal comparison",
            ast.Is: "identity (memory address) check", ast.IsNot: "non-identity check",
            ast.In: "membership check", ast.NotIn: "non-membership check"
        }
        return cmp_map.get(type(op), "boolean comparison")

    # ==========================================
    # MAIN GENERATION DELEGATOR
    # ==========================================
    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        """Main entry point: delegates AST nodes to specific linguistic generators."""
        if is_dead:
            return self._generate_dead_code_explanation(code_snippet)

        time_desc = self._route_time_semantics(node, local_t, global_t, code_snippet)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet)
        return time_desc, space_desc

    def _generate_dead_code_explanation(self, code_snippet):
        """Highly varied explanations for unreachable code."""
        t_desc = random.choice([
            f"The statement `{code_snippet}` is flagged as Unreachable (Dead Code). Because it comes after a flow interruption like a `return`, `break`, or `continue`, the Python interpreter's control flow will never actually reach this line. It contributes a strict O(1) to your runtime.",
            f"Notice how `{code_snippet}` is placed after a terminal statement? The compiler guarantees this path is completely skipped. Therefore, it costs 0 clock cycles during execution.",
            f"This is Dead Code. Modern interpreters and compilers will often optimize this line entirely out of the bytecode. It has zero impact on your global time complexity."
        ])
        s_desc = random.choice([
            "Since this code is skipped by the interpreter, it doesn't allocate any physical memory or push any frames to the call stack.",
            "No memory is provisioned here because the execution flow physically cannot reach this instruction.",
            "Variables and data structures defined in dead code are never initialized, leaving the heap memory entirely untouched."
        ])
        return t_desc, s_desc

    # ==========================================
    # TIME COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_time_semantics(self, node, local_t, global_t, code_snippet):
        """Routes the node to the appropriate time complexity explanation generator."""
        
        prefix = random.choice([
            f"Looking at `{code_snippet}`: ", f"Analyzing `{code_snippet}`: ",
            f"For the execution of `{code_snippet}`: ", f"Here, ", f"In this line, ", ""
        ])

        # 1. HEAVY COMPLEXITY OVERRIDES (Exponential, Factorial, Graph)
        if "2^n" in local_t or self.ctx._is_exponential_loop(node):
            return prefix + self._time_for_exponential()
            
        if "n!" in local_t:
            return prefix + self._time_for_factorial()

        if "V + E" in local_t:
            return prefix + self._time_for_graph()

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
            return prefix + self._time_for_returns(local_t)
        elif isinstance(node, ast.Expr):
            return prefix + f"This standalone expression is evaluated in {local_t} time."
        
        # 3. GENERIC FALLBACK WITH NESTING AWARENESS
        if self.ctx.loop_depth > 0:
            return prefix + random.choice([
                f"On its own, this takes {local_t} time. However, because it's trapped inside a loop, it gets executed repeatedly. The parent loops act as a multiplier, dragging its total global contribution to {global_t}.",
                f"This is a fast {local_t} operation natively, but the surrounding loop structure forces repeated executions. Over the lifecycle of the algorithm, this line contributes {global_t} to the total runtime."
            ])
        
        return prefix + f"This basic operation resolves cleanly in {local_t} time."

    # --- SPECIFIC TIME GENERATORS ---
    
    def _time_for_exponential(self):
        return random.choice([
            "This triggers an exponential O(2^n) cascade. Every time you add one more item to the input, the amount of work effectively doubles. Think of a branching tree where every node creates two more paths—this gets dangerously slow very quickly.",
            "We're hitting an O(2^n) exponential runtime here. This usually happens in naive recursion (like calculating Fibonacci without memoization) where the algorithm blindly recalculates the exact same overlapping subproblems.",
            "This operation blows up exponentially (O(2^n)). The CPU must process a rapidly doubling combinatorial space. For anything beyond a tiny dataset, this will completely freeze your program."
        ])

    def _time_for_factorial(self):
        return random.choice([
            "This line is part of a factorial O(n!) generation. It's computing every possible permutation or arrangement. To put that in perspective, an input array of just 15 items would take a modern computer years to finish processing!",
            "We are dealing with O(n!) factorial time, often seen in the classic 'Traveling Salesperson' brute-force solutions. It is mathematically the heaviest common time complexity and is computationally infeasible for large inputs."
        ])

    def _time_for_graph(self):
        return random.choice([
            "This logic acts as a graph traversal step. By using a 'visited' check to ensure we only process each Vertex (V) and its corresponding Edges (E) exactly once, it runs in an optimal O(V + E) time.",
            "This implements a classic Breadth-First (BFS) or Depth-First (DFS) operation. By not revisiting nodes we've already seen, we keep the time complexity tightly bounded to a linear relationship with the graph size: O(V + E)."
        ])

    def _time_for_loops(self, node, local_t, global_t):
        is_for = isinstance(node, ast.For)
        loop_type = "The `for` loop" if is_for else "The `while` loop"
        
        base = ""
        if "O(1)" in local_t:
            base = random.choice([
                f"{loop_type} runs for a hardcoded, static number of iterations. Since its execution count doesn't grow when the primary input data grows, it evaluates strictly in O(1) constant time.",
                f"Because the iteration boundaries here are strictly bounded (it doesn't scale infinitely with 'n'), {loop_type.lower()} is classified as a rapid O(1) operation."
            ])
        elif "log n" in local_t:
            base = random.choice([
                f"{loop_type} acts similarly to a binary search. By cutting the remaining workload in half (or by a fraction) on every single cycle, it achieves a blazing fast O(log n) runtime.",
                f"Notice how the iterative step jumps multiplicatively or divides the problem space? That 'divide and conquer' loop progression gives {loop_type.lower()} a logarithmic O(log n) efficiency.",
                f"Instead of checking every item, {loop_type.lower()} slashes the search space exponentially per iteration, resulting in O(log n) time."
            ])
        elif "√n" in local_t:
            base = random.choice([
                f"{loop_type} relies on a square root boundary. This is common in prime number checking or jump searches, effectively running in O(√n) time.",
                f"By limiting iterations to the square root of the input size, {loop_type.lower()} skips massive amounts of redundant linear work, landing at O(√n)."
            ])
        else:
            base = random.choice([
                f"{loop_type} performs a linear scan. It forces the CPU to process each element in the sequence one by one, resulting in an O(n) traversal.",
                f"We see a direct 1:1 relationship here. As the input data grows, the number of iterations grows proportionally, giving {loop_type.lower()} an O(n) linear complexity.",
                f"Iterating through a collection requires the system to visit every single index. Thus, {loop_type.lower()} scales linearly at O(n)."
            ])

        # Nested Loop Context (Critical Educational Feature)
        if self.ctx.loop_depth > 1:
            nesting_context = random.choice([
                f" However, this is an inner loop. In Big O analysis, inner loops multiply with their outer loops. Because this loop resets and runs fully for *every* step of the parent loop, the global runtime balloons to a polynomial {global_t}.",
                f" But here is the catch: because it is nested, we cannot view it in isolation. The combination of the outer loop cycles multiplying against these inner loop cycles creates a compounding polynomial {global_t} bottleneck.",
                f" Since it sits inside another loop, you have to multiply their complexities together (e.g., O(n) * O(n) = O(n²)). Therefore, the total global cost for this code block escalates to {global_t}."
            ])
            return base + nesting_context
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        comp_type = "list comprehension"
        if isinstance(node, ast.DictComp): comp_type = "dictionary comprehension"
        if isinstance(node, ast.SetComp): comp_type = "set comprehension"
        
        base = random.choice([
            f"Under the hood, a {comp_type} is just a highly optimized C-level loop. It still has to iterate through every element to build the new data structure, meaning it inherently runs in {local_t} time.",
            f"While {comp_type}s look like a clean one-liner, they don't cheat physics. The Python interpreter still performs a hidden {local_t} linear scan to evaluate and insert each individual item.",
            f"Comprehensions are syntactical sugar. To populate the new collection, the system must iterate across the entire provided iterable, which incurs an {local_t} time cost."
        ])
        
        if self.ctx.loop_depth > 0:
            return base + f" Because you placed this comprehension inside another loop, this {local_t} cost is paid repeatedly, pushing the global time to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign):
            targets = [self._extract_name(node.target)]
        else:
            targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable"
        rhs = getattr(node, 'value', None)
        
        # 1. Slicing logic
        if self.ctx.has_slicing:
            return random.choice([
                f"Assigning this slice to {t_name} is an O(n) operation. Slicing doesn't just pass a reference; Python physically iterates over the array to copy the requested elements into a new sequence.",
                f"Array slicing in Python requires the interpreter to traverse the sequence and allocate a new copy for {t_name}. This bulk copy operation takes O(n) linear time.",
                f"Beware of slicing inside loops! It forces a hidden O(n) iteration to duplicate the list data into {t_name}."
            ])
            
        # 2. Linear Assignments (e.g., assigning a whole list copy)
        if "O(n)" in local_t:
            return random.choice([
                f"Evaluating the right-hand side and binding it to {t_name} requires a full O(n) traversal to construct or copy the data.",
                f"This isn't just pointing a reference. Updating {t_name} here forces a linear O(n) scan across the underlying structure before the assignment can finalize."
            ])
            
        # 3. O(1) Quick Assignments (Math, lookups, primitive binding)
        if isinstance(rhs, ast.BinOp):
            op_str = self._get_op_name(rhs.op)
            return random.choice([
                f"The CPU's Arithmetic Logic Unit (ALU) performs the {op_str}, and Python then points {t_name} to the result. This mathematical evaluation and binding is a lightning-fast O(1) operation.",
                f"Evaluating this math expression ({op_str}) and updating the state of {t_name} resolves instantly in constant O(1) time.",
                f"Arithmetic operations like {op_str} are executed natively by the processor. Binding the result to {t_name} takes O(1) time."
            ])
            
        if isinstance(rhs, ast.Subscript):
            return random.choice([
                f"Direct index lookups (like grabbing an array element or hashing a dictionary key) rely on instant memory offsets. Assigning that fetched value to {t_name} takes only O(1) time.",
                f"Fetching a specific element from an indexed structure is an O(1) constant time action before it gets bound to {t_name}."
            ])
            
        if isinstance(rhs, ast.Call):
            return random.choice([
                f"Once the function finishes executing its logic, grabbing its return value and linking it to the reference {t_name} takes O(1) time.",
                f"The function's payload is captured and bound to {t_name} in constant O(1) time."
            ])
            
        # 4. Generic O(1)
        return random.choice([
            f"Python creates a pointer mapping {t_name} to its value in memory. This primitive variable binding is always an O(1) constant time operation.",
            f"Mutating the state of {t_name} here evaluates instantly. CPython simply updates the underlying C-struct reference pointer in O(1) time.",
            f"Updating {t_name} in-place requires no iteration. It resolves in O(1) time."
        ])

    def _time_for_calls(self, node, local_t, global_t):
        f_name = self._extract_name(node.func).replace("()", "")
        
        # 1. Recursion Handling
        if f_name == self.ctx.current_function_name:
            if getattr(self.ctx, 'has_division', False):
                return random.choice([
                    f"This is a recursive call to '{f_name}' that fractionally divides the input space (e.g., n/2). This 'divide-and-conquer' strategy is exactly what shapes the algorithm's overarching {global_t} Master Theorem efficiency.",
                    f"By recursively invoking '{f_name}' on a divided subset of the data, the algorithm aggressively avoids doing extra work, landing at a {global_t} recurrence relation."
                ])
            return random.choice([
                f"This line invokes '{f_name}' recursively. Every single time it calls itself, it spawns a new branch in the execution tree. This linear stacking pushes the global complexity to {global_t}.",
                f"A recursive jump back into '{f_name}'. Without memoization to cache results, these overlapping functional calls build up the mathematical recurrence to {global_t}.",
                f"Recursion triggers here! The function calls itself, adding a new frame to the recurrence tree and driving the global runtime to {global_t}."
            ])
            
        # 2. Built-in Python Functions
        if f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return random.choice([
                f"This triggers Python's built-in `{f_name}()` function. Behind the scenes in CPython, this natively {b_info['desc']}. Knowing this is critical—it implicitly costs {local_t} time.",
                f"Don't let the clean one-liner fool you! Calling the native `{f_name}()` {b_info['desc']}. This injects a hidden {local_t} operation directly into your algorithm's runtime.",
                f"The built-in `{f_name}()` is written in C for speed, but architecturally it still {b_info['desc']}, demanding {local_t} execution time."
            ])
            
        # 3. Standard Custom Call
        return random.choice([
            f"Executing the external function '{f_name}()' pauses this local scope until the function resolves. We estimate its internal logic takes {local_t} time.",
            f"Control is passed over to '{f_name}()'. Based on its contents, the engine evaluates this function call to cost {local_t} time.",
            f"Invoking '{f_name}()' halts the current thread. The logic encapsulated inside it will require {local_t} time to complete."
        ])

    def _time_for_conditionals(self, node, local_t, global_t):
        if getattr(self.ctx, 'loop_depth', 0) > 0 and getattr(node, 'lineno', 0) in self.ctx.conditional_partition_lines:
            return random.choice([
                f"This `if` statement acts as a partition or filter mechanism inside the loop. The boolean comparison itself is O(1), but it directly dictates the data-dependent execution flow of this {global_t} block.",
                f"Checking this condition is a fast O(1) CPU instruction, but since it gates the logic inside the loop, it heavily influences the algorithm's worst-case {global_t} runtime (common in QuickSort implementations).",
                f"This conditional filters the loop's execution. While evaluating it takes O(1) time, its true impact is controlling the {global_t} global complexity."
            ])
            
        # Inspect the comparison type if possible
        if isinstance(node.test, ast.Compare) and len(node.test.ops) > 0:
            cmp_str = self._get_cmp_name(node.test.ops[0])
            return random.choice([
                f"Performing the {cmp_str} here is a basic O(1) instruction. It instantly determines which logical branch the interpreter should take next.",
                f"The CPU evaluates the {cmp_str} and resolves the boolean truthiness immediately in O(1) constant time."
            ])

        return random.choice([
            f"Evaluating this boolean condition (checking if it is True or False) is a basic O(1) instruction.",
            f"Comparing values or checking truthiness resolves immediately in O(1) constant time."
        ])

    def _time_for_returns(self, local_t):
        return random.choice([
            f"Passing the final computed payload back to the caller is a simple {local_t} operation.",
            f"The `return` statement resolves instantly in {local_t} time, destroying local variables and popping the current frame off the call stack.",
            f"Execution concludes here. Returning the value to the parent scope takes {local_t} constant time."
        ])

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        """Routes the node to the appropriate space complexity explanation."""
        prefix = random.choice([
            "Regarding memory: ", "From a space perspective: ",
            "Looking at RAM usage: ", "Memory-wise: ", "In terms of memory allocation: ", ""
        ])

        # 1. GRAPH AUXILIARY STRUCTURES (O(V))
        if "V" in local_s:
            return prefix + self._space_for_graphs()

        # 2. RECURSIVE CALL STACKS (O(n) or O(log n))
        if "log n" in local_s and getattr(self.ctx, 'has_division', False):
            return prefix + self._space_for_log_recursion()
        
        if "n" in local_s:
            # Check if O(n) space is from Recursion Stack or Data Allocation
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == self.ctx.current_function_name:
                    return prefix + self._space_for_linear_recursion(f_name)
                if f_name in self.ctx.builtin_complexities:
                    return prefix + f"The built-in `{f_name}()` function dynamically provisions {local_s} extra internal memory to organize or cache data before returning it."
            
            if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                return prefix + self._space_for_allocations(node, local_s)

            return prefix + random.choice([
                f"The algorithm generates a new data structure here. As the input grows, the auxiliary memory needed scales directly with it, landing at {local_s}.",
                f"We see an {local_s} memory spike here because the system must reserve new heap space to accommodate the collection of data."
            ])

        # 3. O(1) IN-PLACE MUTATION
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            return prefix + self._space_for_inplace(local_s)

        # 4. DEFAULT O(1) FALLBACK
        return prefix + random.choice([
            f"This computational step operates purely on existing data references. Because it doesn't create new scaling arrays, it demands only {local_s} constant space.",
            f"No auxiliary data structures are initialized here, ensuring the RAM footprint remains perfectly stable at {local_s}.",
            f"This logic executes strictly in-place. The space complexity overhead is a flat {local_s}."
        ])

    # --- SPECIFIC SPACE GENERATORS ---

    def _space_for_graphs(self):
        return random.choice([
            "This step allocates O(V) extra memory. Graph algorithms absolutely need tracking structures—like a 'visited' Hash Set or a BFS Queue—to safely map out vertices without getting trapped in infinite circular loops.",
            "To accurately explore the graph, we must cache the spatial states of nodes we've already seen. This auxiliary structure requires O(V) memory relative to the number of vertices.",
            "Maintaining the traversal queue or visited set requires memory proportional to the vertices, yielding an O(V) space footprint."
        ])

    def _space_for_log_recursion(self):
        return random.choice([
            "Because the recursion uses a divide-and-conquer approach, the maximum depth of the call stack is heavily compressed. The Operating System only needs O(log n) memory to juggle the concurrent execution frames.",
            "The recursion tree is incredibly shallow! It only stacks O(log n) frames in memory before hitting a base case and collapsing back down.",
            "By halving the data, the recursion limits its depth. It allocates a highly efficient O(log n) extra memory on the system call stack."
        ])

    def _space_for_linear_recursion(self, f_name):
        return random.choice([
            f"Every time '{f_name}' calls itself, the Operating System must pause the current function and push a new 'frame' onto the call stack to store local variables. If it recurses 'n' times, that creates a tower of frames costing O(n) extra space!",
            f"Recursion isn't free! Each jump into '{f_name}' stacks up in system memory until a base case is finally hit. This sequential layering consumes O(n) space.",
            f"Python does not optimize tail recursion. Therefore, each recursive step adds a new frame to the call stack, forcing the space complexity to grow linearly at O(n)."
        ])

    def _space_for_allocations(self, node, local_s):
        rhs = getattr(node, 'value', None)
        
        if self.ctx.has_slicing:
            return random.choice([
                "Slicing an array forces Python to request a completely new block of memory from the OS to store the duplicate values, costing O(n) extra space.",
                "Slicing doesn't just pass references. It physically clones the data, which means it allocates an entirely new array in memory. This demands O(n) space."
            ])
            
        if isinstance(rhs, (ast.ListComp, ast.List)):
            return random.choice([
                "Initializing this list requires the system to request a contiguous block of O(n) memory to store the array elements.",
                "Building a new list creates a dynamic array under the hood. As it fills up with elements, Python provisions O(n) memory to store them."
            ])
            
        if isinstance(rhs, (ast.DictComp, ast.Dict)):
            return random.choice([
                "Creating this dictionary sets up an O(n) Hash Map in RAM. Python allocates an array of 'buckets' to store the keys and prevent hash collisions.",
                "Dictionary initialization forces the system to provision an O(n) hash table in memory to securely accommodate the designated key-value pairs."
            ])
            
        if isinstance(rhs, (ast.SetComp, ast.Set)):
            return "Sets are backed by Hash Maps. Python allocates an O(n) memory block to store the unique hashes."

        return random.choice([
            f"Allocating this new variable requires provisioning {local_s} memory dynamically based on the input size.",
            f"This assignment requires building a new data structure in heap memory, yielding an {local_s} space complexity."
        ])

    def _space_for_inplace(self, local_s):
        return random.choice([
            f"This state mutation is handled highly efficiently. By utilizing only {local_s} space to store scalar references (pointers), the primary data structure is modified cleanly in-place.",
            f"Variables are overwritten strictly in-place here. This lean operation keeps the memory footprint tightly bounded at {local_s} without cloning massive datasets.",
            f"Python simply points the variable to a new memory address. The old primitive value is left for the Garbage Collector. This reference update costs only {local_s} space.",
            f"Because this only requires allocating a few bytes for a primitive pointer, the space complexity is a strict {local_s}."
        ])