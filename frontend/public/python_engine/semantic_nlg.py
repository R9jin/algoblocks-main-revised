# semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Advanced Dynamic Natural Language Generation (NLG) Engine for AlgoBlocks.
    
    Target Audience: 2nd to 4th-Year Computer Science Students, Algorithm Analysts.
    Purpose: To translate abstract AST nodes, Big O complexities, and raw 
    mathematical equations into highly varied, deeply educational explanations.
    
    This engine specifically avoids low-level system or CPython internals. 
    Instead, it focuses strictly on Big O Theory, explaining *why* an algorithmic 
    step incurs a specific Time or Space cost based on mathematical scaling, 
    iteration boundaries, auxiliary data structure provisioning, and the 
    call stack implications of recursive recurrence relations.
    
    New Feature: Automatically intercepts T(n) Recurrence Relations and resolves 
    them into their standard asymptotic Big O equivalents using the Master Theorem 
    and recursive tree derivations.
    """
    
    def __init__(self, analyzer_context):
        """
        Initializes the NLG Engine with the current context of the AST analysis.
        The context contains global and local complexities, loop depths, and
        detected algorithmic patterns.
        """
        self.ctx = analyzer_context

    # ==========================================
    # RECURRENCE RELATION RESOLUTION ENGINE
    # ==========================================
    def _format_recurrence_relation(self, comp_str):
        """
        Intercepts raw T(n) complexity strings and parses them into educational 
        equivalents. When an algorithm yields a recurrence, it is vital to show
        the student both the structural recurrence (e.g., 2T(n/2) + O(n)) AND the
        final resolved asymptotic Big O limit (e.g., O(n log n)).
        """
        if not comp_str or "T(" not in comp_str:
            return comp_str
            
        # Strict mapping table derived from Master Theorem and standard tree analysis
        lookup = {
            "T(n) = n * T(n-1) + O(1)": "O(n!)",
            "T(n) = n * T(n-1)": "O(n!)",
            "T(n) = 2T(n/2) + O(n)": "O(n log n)",
            "T(n) = 2T(n/2) + O(1)": "O(n)",
            "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)",
            "T(n) = T(n/2) + O(n)": "O(n)",
            "T(n) = T(n/2) + O(1)": "O(log n)",
            "T(n) = T(n-1) + O(n)": "O(n²)",
            "T(n) = T(n-1) + O(log n)": "O(n log n)",
            "T(n) = T(n-1) + O(1)": "O(n)",
            "2T(n/2)": "O(n log n)",
            "T(n-1) + T(n-2)": "O(2^n)",
            "T(n/2) + O(1)": "O(log n)",
            "T(n-1) + O(n)": "O(n²)"
        }
        
        for rel, big_o in lookup.items():
            if rel in comp_str:
                # Appends the resolved notation cleanly to the T(n) string
                return f"{comp_str} — which mathematically resolves to an equivalent Big O notation of {big_o}"
        
        return comp_str

    # ==========================================
    # AST INTROSPECTION & TRANSLATION HELPERS
    # ==========================================
    def _extract_name(self, node):
        """
        Translates AST nodes into readable variable/function names.
        This provides context-aware English translations for abstract syntax.
        """
        if isinstance(node, ast.Name): 
            return f"'{node.id}'"
        if isinstance(node, ast.Constant): 
            if isinstance(node.value, str): return f'"{node.value}"'
            return str(node.value)
        if isinstance(node, ast.Attribute): 
            return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): 
            func_name = self._extract_name(node.func)
            return f"{func_name}()"
        if isinstance(node, ast.Subscript): 
            return f"{self._extract_name(node.value)}[...]"
        if isinstance(node, ast.List): 
            return "a new dynamic array"
        if isinstance(node, ast.Dict): 
            return "a new hash map"
        if isinstance(node, ast.Set): 
            return "a new hash set"
        if isinstance(node, ast.Tuple): 
            return "a new immutable array"
        if isinstance(node, ast.Starred): 
            return f" unpacked elements of {self._extract_name(node.value)}"
        return "the target structure"

    def _get_op_name(self, op):
        """
        Translates mathematical and bitwise operations into plain English.
        Crucial for explaining O(1) arithmetic scaling.
        """
        op_map = {
            ast.Add: "addition", 
            ast.Sub: "subtraction", 
            ast.Mult: "multiplication", 
            ast.Div: "division",
            ast.FloorDiv: "integer (floor) division", 
            ast.Mod: "modulo (remainder) operation",
            ast.Pow: "exponentiation", 
            ast.LShift: "bitwise left shift",
            ast.RShift: "bitwise right shift", 
            ast.BitAnd: "bitwise AND",
            ast.BitOr: "bitwise OR", 
            ast.BitXor: "bitwise XOR"
        }
        return op_map.get(type(op), "mathematical operation")

    def _get_cmp_name(self, op):
        """
        Translates comparison operations for logic gating explanations.
        """
        cmp_map = {
            ast.Eq: "equality check", 
            ast.NotEq: "inequality check",
            ast.Lt: "strict less-than comparison", 
            ast.LtE: "less-than-or-equal comparison",
            ast.Gt: "strict greater-than comparison", 
            ast.GtE: "greater-than-or-equal comparison",
            ast.Is: "identity check", 
            ast.IsNot: "non-identity check",
            ast.In: "membership check", 
            ast.NotIn: "non-membership check"
        }
        return cmp_map.get(type(op), "boolean comparison")

    # ==========================================
    # EQUATION & FORMULA NATURAL LANGUAGE PARSERS
    # ==========================================
    def _build_math_sentence(self, node, depth=0):
        """
        Dynamically forms natural English sentences based on mathematical formulas
        extracted directly from the AST. 
        
        Educational Value: Allows the engine to specifically reference the math 
        the student wrote, explaining that simple algebraic operations do not 
        scale with 'n' and therefore run in constant O(1) time.
        """
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Constant):
            return str(node.value)
        elif isinstance(node, ast.BinOp):
            left = self._build_math_sentence(node.left, depth + 1)
            right = self._build_math_sentence(node.right, depth + 1)
            
            # Formatting based on depth to prevent run-on sentences in massive formulas
            if isinstance(node.op, ast.Add):
                return f"the sum of {left} and {right}" if depth < 2 else f"({left} plus {right})"
            elif isinstance(node.op, ast.Sub):
                return f"the difference between {left} and {right}" if depth < 2 else f"({left} minus {right})"
            elif isinstance(node.op, ast.Mult):
                return f"the product of {left} and {right}" if depth < 2 else f"({left} multiplied by {right})"
            elif isinstance(node.op, ast.Div):
                return f"the quotient of {left} divided by {right}"
            elif isinstance(node.op, ast.FloorDiv):
                # Check for classic binary search midpoint formula
                if right == "2":
                    return f"the mathematical midpoint of {left}"
                return f"the integer floor division of {left} by {right}"
            elif isinstance(node.op, ast.Mod):
                return f"the remainder of {left} modulo {right}"
            elif isinstance(node.op, ast.Pow):
                if right == "2":
                    return f"the square of {left}"
                elif right == "3":
                    return f"the cube of {left}"
                return f"{left} raised to the power of {right}"
            else:
                op_str = self._get_op_name(node.op)
                return f"the result of a {op_str} between {left} and {right}"
        
        elif isinstance(node, ast.UnaryOp):
            operand = self._build_math_sentence(node.operand, depth + 1)
            if isinstance(node.op, ast.USub): return f"the negative value of {operand}"
            if isinstance(node.op, ast.Not): return f"the logical negation of {operand}"
            if isinstance(node.op, ast.Invert): return f"the bitwise inversion of {operand}"
            return f"a unary operation on {operand}"
            
        elif isinstance(node, ast.Call):
            func_name = self._extract_name(node.func)
            args = [self._build_math_sentence(a, depth + 1) for a in node.args]
            if not args:
                return f"the result of the {func_name} function call"
            elif len(args) == 1:
                return f"the result of applying {func_name} to {args[0]}"
            else:
                args_str = ", ".join(args[:-1]) + f", and {args[-1]}"
                return f"the evaluation of {func_name} using parameters {args_str}"
        
        elif isinstance(node, ast.Subscript):
            return f"the element retrieved from {self._extract_name(node.value)}"

        return "the calculated expression"

    def _build_boolean_sentence(self, node):
        """
        Constructs an English explanation of a boolean logic gate or comparison.
        Used to explain logic gating in conditionals (If/While statements).
        """
        if isinstance(node, ast.Compare):
            left = self._build_math_sentence(node.left)
            comparisons = []
            for op, comp in zip(node.ops, node.comparators):
                cmp_str = self._get_cmp_name(op)
                right = self._build_math_sentence(comp)
                comparisons.append(f"a {cmp_str} against {right}")
            return f"evaluating {left} by performing " + " and ".join(comparisons)
        
        if isinstance(node, ast.BoolOp):
            values = [self._build_math_sentence(v) for v in node.values]
            if isinstance(node.op, ast.And):
                return f"a logical AND gate requiring both {values[0]} and {values[1]} to be strictly true"
            elif isinstance(node.op, ast.Or):
                return f"a logical OR gate requiring at least one condition between {values[0]} and {values[1]} to evaluate to true"
                
        return "a boolean truthiness evaluation"

    # ==========================================
    # MAIN GENERATION DELEGATOR
    # ==========================================
    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        """
        Main entry point for the engine.
        Delegates AST nodes to specific linguistic generators based on their
        assigned local and global Time (T) and Space (S) complexities.
        """
        if is_dead:
            return self._generate_dead_code_explanation(code_snippet)

        # 1. Intercept and mathematically resolve any T(n) relations in the complexities
        fmt_local_t = self._format_recurrence_relation(str(local_t))
        fmt_global_t = self._format_recurrence_relation(str(global_t))

        # 2. Route the formatted complexities to the semantic generators
        time_desc = self._route_time_semantics(node, fmt_local_t, fmt_global_t, code_snippet)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet)
        
        return time_desc, space_desc

    def _generate_dead_code_explanation(self, code_snippet):
        """
        Highly varied explanations for unreachable code, explaining why it
        does not factor into Big O analysis.
        """
        t_desc = random.choice([
            f"The statement `{code_snippet}` is flagged as Unreachable (Dead Code). Because it comes after a flow interruption like a `return`, `break`, or `continue`, the program's control flow will never actually reach this line. It contributes a strict O(1) to your runtime since it is never evaluated.",
            f"Notice how `{code_snippet}` is placed after a terminal statement? The execution logic guarantees this path is completely skipped. Therefore, it costs 0 operations during execution and has no impact on time complexity.",
            f"This is Dead Code. It has absolutely zero impact on your global time complexity because the algorithmic flow logically cannot reach this instruction."
        ])
        s_desc = random.choice([
            "Since this code is skipped entirely, it does not allocate any memory or provision any new data structures.",
            "No memory is provisioned here because the execution flow physically cannot reach this instruction.",
            "Variables and data structures defined in dead code are never initialized, leaving the space complexity entirely unaffected."
        ])
        return t_desc, s_desc

    # ==========================================
    # TIME COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_time_semantics(self, node, local_t, global_t, code_snippet):
        """
        Routes the specific AST node to the appropriate time complexity explainer.
        Prioritizes heavy bottlenecks (Exponential/Factorial) before dropping into
        standard AST types like Loops, Assignments, and Conditionals.
        """
        prefix = random.choice([
            f"Looking at the execution of `{code_snippet}`: ", 
            f"Analyzing the instruction `{code_snippet}`: ",
            f"Focusing on `{code_snippet}`: ", 
            f"For this step, ", 
            f"In this exact line, ", 
            ""
        ])

        # 1. HEAVY COMPLEXITY OVERRIDES (Exponential, Factorial, Graph)
        if "2^n" in local_t or getattr(self.ctx, '_is_exponential_loop', lambda x: False)(node):
            return prefix + self._time_for_exponential()
            
        if "n!" in local_t:
            return prefix + self._time_for_factorial()

        if "V + E" in local_t:
            return prefix + self._time_for_graph()

        # 2. STANDARD AST TYPE ROUTING
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return prefix + self._time_for_function_def(node, local_t)
        elif isinstance(node, (ast.For, ast.While)):
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
        elif isinstance(node, (ast.Yield, ast.YieldFrom)):
            return prefix + self._time_for_yields(local_t)
        elif isinstance(node, ast.Expr):
            return prefix + self._time_for_standalone_expr(node, local_t, global_t)
        
        # 3. GENERIC FALLBACK WITH NESTING AWARENESS
        if getattr(self.ctx, 'loop_depth', 0) > 0:
            return prefix + random.choice([
                f"On its own, this takes {local_t} time. However, because it is trapped inside a loop, it gets executed repeatedly. The parent loops act as a mathematical multiplier, causing its total global contribution to scale to {global_t}.",
                f"This is an inherent {local_t} operation, but the surrounding loop structure forces repeated executions. Over the lifecycle of the algorithm, this line contributes {global_t} to the total runtime."
            ])
        
        return prefix + f"This fundamental operation resolves in {local_t} time."

    # --- SPECIFIC TIME GENERATORS ---

    def _time_for_function_def(self, node, local_t):
        """Generates explanations explicitly for function definitions, clarifying deferred execution."""
        f_name = getattr(node, 'name', 'this function')
        return random.choice([
            f"Defining the function `{f_name}` does not actually execute its internal algorithmic logic yet. The Python interpreter simply parses the syntax and registers the function name in O(1) constant time. The true algorithmic time complexity is strictly deferred until this function is explicitly called.",
            f"Notice that this is a function definition (`def {f_name}`). The algorithmic logic inside is completely dormant right now. Binding this function signature takes a flat O(1) time. We only evaluate its scaling cost when it is invoked elsewhere in the program.",
            f"Function definitions are evaluated instantly. Registering `{f_name}` into memory requires only an O(1) time cost. The encapsulated Big O complexity of its internal code is completely ignored until execution control is actively passed to it via a function call."
        ])
    
    def _time_for_exponential(self):
        """Generates explanations for O(2^n) time complexity."""
        return random.choice([
            "This logic triggers an exponential O(2^n) cascade. Every time you add one more item to the input dataset, the amount of required computational work effectively doubles. Think of a branching tree where every node creates two more paths—this gets computationally dangerous very quickly.",
            "We are hitting an O(2^n) exponential runtime bottleneck here. This typically happens in naive recursion (like calculating Fibonacci sequence numbers without memoization) where the algorithm blindly recalculates the exact same overlapping subproblems multiple times, causing a massive explosion in execution steps.",
            "This operation blows up exponentially to O(2^n). The algorithm must process a rapidly doubling combinatorial space. As the input 'n' increases linearly, the time required scales exponentially."
        ])

    def _time_for_factorial(self):
        """Generates explanations for O(n!) time complexity."""
        return random.choice([
            "This line is part of a factorial O(n!) generation algorithm. It is likely computing every possible permutation or arrangement of the data. To put that in perspective, an input array of just 15 items would require trillions of operations to process!",
            "We are dealing with O(n!) factorial time here, often seen in the classic brute-force solutions to problems like the 'Traveling Salesperson Problem'. It is mathematically the heaviest and most expensive common time complexity. Because the work required scales by n * (n-1) * (n-2)..., it is entirely infeasible for large inputs."
        ])

    def _time_for_graph(self):
        """Generates explanations for O(V+E) graph time complexity."""
        return random.choice([
            "This logic acts as a classic graph traversal step. By using a 'visited' tracking mechanism to ensure we only process each Vertex (V) and its corresponding connected Edges (E) exactly once, it runs in a highly optimal O(V + E) time.",
            "This block implements a classic Breadth-First Search (BFS) or Depth-First Search (DFS) operation. By strictly not revisiting nodes we've already evaluated, we keep the time complexity tightly bounded. The work scales linearly with the total size of the graph: O(V + E)."
        ])

    def _time_for_loops(self, node, local_t, global_t):
        """
        Deeply explains loop Big O.
        This is a critical educational component. It explains WHY a loop is O(n),
        O(log n), or O(1) based on its iteration boundaries, and then applies
        the multiplication rule if the loop is nested.
        """
        is_for = isinstance(node, ast.For)
        loop_type = "The `for` loop" if is_for else "The `while` loop"
        
        base = ""
        # Handle Constant Loop
        if "O(1)" in local_t:
            base = random.choice([
                f"{loop_type} runs for a hardcoded, static number of iterations. Since its execution count is completely unaffected by the primary input data scaling, it evaluates strictly in O(1) constant time.",
                f"Because the iteration boundaries here are strictly bounded to a constant number (it doesn't scale infinitely to 'n'), {loop_type.lower()} is classified algorithmically as a rapid O(1) operation."
            ])
        # Handle Logarithmic Loop (e.g. Binary Search)
        elif "log n" in local_t:
            base = random.choice([
                f"{loop_type} acts similarly to a binary search. By cutting the remaining workload in half (or by a distinct fraction) on every single computational cycle, the number of iterations scales logarithmically, achieving a blazing fast O(log n) runtime.",
                f"Notice how the iterative step jumps multiplicatively (e.g., i = i * 2) or divides the problem space? That explicit 'divide and conquer' progression allows the algorithm to skip checking every element, giving {loop_type.lower()} a logarithmic O(log n) efficiency.",
                f"Instead of checking every individual item linearly, {loop_type.lower()} slashes the search space exponentially per iteration. Because it rapidly hones in on the target, the time it takes scales at a very slow O(log n) rate."
            ])
        # Handle Square Root Loop
        elif "√n" in local_t:
            base = random.choice([
                f"{loop_type} relies on a square root boundary. This is highly common in prime number checking or jump searches. By not traversing all 'n' elements, it effectively runs in an optimized O(√n) time.",
                f"By strategically limiting iterations to the mathematical square root of the input size, {loop_type.lower()} skips massive amounts of redundant linear work, landing at O(√n)."
            ])
        # Handle Linear Loop (O(n))
        else:
            base = random.choice([
                f"{loop_type} performs a sequential scan. It must process elements one by one, meaning if the input size doubles, the time taken also doubles. This direct relationship results in an O(n) traversal.",
                f"We see a direct 1:1 scaling relationship here. As the underlying input data grows, the number of iterations grows strictly proportionally, giving {loop_type.lower()} an O(n) linear complexity.",
                f"Iterating through a standard collection requires the algorithm to visit every single index. Thus, as the collection gets larger, the time required scales linearly at O(n)."
            ])

        # Nested Loop Context (Critical Educational Feature for O(n^2), O(n^3))
        if getattr(self.ctx, 'loop_depth', 0) > 1:
            nesting_context = random.choice([
                f" However, it is vital to note this is an inner nested loop. In Big O Analysis, inner loop complexities multiply with their outer parent loops. Because this inner loop resets and runs fully for *every single step* of the parent loop, the total number of operations balloons, bringing the global algorithm runtime to {global_t}.",
                f" But here is the critical catch for algorithm optimization: because this loop is nested, we cannot view it in isolation. The combination of the outer loop cycles multiplying heavily against these inner loop cycles creates a compounding {global_t} bottleneck.",
                f" Since it sits deeply inside another loop, Big O theory dictates you must multiply their respective complexities together (e.g., an O(n) loop inside an O(n) loop equals O(n²)). Therefore, the true total global cost for this specific code block escalates massively to {global_t}."
            ])
            return base + nesting_context
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        """Explains that comprehensions are just syntactic sugar for linear loops."""
        comp_type = "list comprehension"
        if isinstance(node, ast.DictComp): comp_type = "dictionary comprehension"
        if isinstance(node, ast.SetComp): comp_type = "set comprehension"
        
        base = random.choice([
            f"Under the hood, a {comp_type} is still a loop. It has to iterate sequentially through every element of the iterable to build the new data structure, meaning it inherently runs in {local_t} time.",
            f"While {comp_type}s look like a clean, instant one-liner, they do not cheat computational scaling. The engine still performs a hidden {local_t} linear scan to evaluate and process each individual item.",
            f"Comprehensions are essentially syntactical sugar. To fully populate the new collection, the algorithm must iterate across the entire provided iterable object, which incurs a mandatory {local_t} time cost."
        ])
        
        if getattr(self.ctx, 'loop_depth', 0) > 0:
            return base + f" Because you placed this specific comprehension inside another loop structure, this {local_t} linear scan is executed repeatedly upon every outer iteration, pushing your overall global time complexity to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        """
        Breaks down assignment complexity.
        Crucially differentiates between O(1) mathematical evaluations,
        O(1) lookups, and O(n) copying/slicing operations.
        """
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign):
            targets = [self._extract_name(node.target)]
        else:
            targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable"
        rhs = getattr(node, 'value', None)
        
        # 1. Advanced Math Equation parsing
        if isinstance(rhs, (ast.BinOp, ast.UnaryOp)):
            equation_english = self._build_math_sentence(rhs)
            return random.choice([
                f"The algorithm calculates a mathematical formula: {equation_english}. Because algebraic operations scale constantly regardless of the size of the numbers involved, computing the equation and binding it to {t_name} is a lightning-fast O(1) constant time operation.",
                f"This assignment evaluates a specific algebraic expression: {equation_english}. Performing these arithmetic instructions and pointing the {t_name} reference to the result takes strictly O(1) time.",
                f"By computing {equation_english}, the program generates a single new numerical value. Assigning {t_name} to this new value does not scale with 'n', making it an O(1) process."
            ])

        # 2. Slicing logic (Array copying)
        if getattr(self.ctx, 'has_slicing', False):
            return random.choice([
                f"Assigning this slice to {t_name} is an O(n) operation. Slicing doesn't just pass a shallow reference; the algorithm physically iterates over the array to copy the requested contiguous elements into a brand new sequence.",
                f"Array slicing requires traversing the sequence and allocating a new chunk of memory for {t_name}. This bulk copy operation inherently takes O(n) linear time because the work scales with the size of the slice.",
                f"Beware of performing array slicing inside loops! It forces a hidden O(n) iteration to duplicate the list data into {t_name}, which can easily cause polynomial O(n²) scaling bottlenecks."
            ])
            
        # 3. Linear Assignments (e.g., assigning a whole deep-copy)
        if "O(n)" in local_t:
            return random.choice([
                f"Evaluating the complex right-hand side and binding it to {t_name} requires a full O(n) traversal to properly construct or copy the data sequence.",
                f"Updating {t_name} here forces a linear O(n) scan across the underlying dynamic structure before the assignment can finalize. The time it takes is directly proportional to the size of the data."
            ])
            
        # 4. Dictionary/Array Lookups
        if isinstance(rhs, ast.Subscript):
            return random.choice([
                f"Direct index lookups (like grabbing an array element via offset or hashing a dictionary key) are designed to bypass linear searching. Assigning that instantly fetched value to {t_name} takes only O(1) time.",
                f"Fetching a specific element from an indexed or hashed structure is an O(1) constant time action before it gets safely bound to the {t_name} variable. The lookup speed does not degrade as the collection grows."
            ])
            
        # 5. Function Call assignment
        if isinstance(rhs, ast.Call):
            return random.choice([
                f"Once the external function finishes executing its encapsulated logic, grabbing its payload return value and linking it to the reference {t_name} takes O(1) time.",
                f"The function's final computed payload is captured and bound to the variable {t_name} in constant O(1) time. (Note: The time it takes to actually run the function's internal logic is calculated separately)."
            ])
            
        # 6. Generic O(1) Primitive binding
        return random.choice([
            f"The program creates a mapping from {t_name} to its value. This primitive variable binding does not require iterating over any collections, so it is always an O(1) constant time operation.",
            f"Mutating the state of {t_name} here evaluates instantly. Updating the reference pointer in memory requires a flat, non-scaling O(1) amount of time.",
            f"Updating the variable {t_name} in-place requires no iteration or memory traversal. It resolves smoothly in O(1) time regardless of input size."
        ])

    def _time_for_calls(self, node, local_t, global_t):
        """
        Explains function calls.
        Highly detailed for recursion. Note that `global_t` has already been passed 
        through `_format_recurrence_relation`, meaning it explicitly states the Master 
        Theorem evaluation natively inside the injected string.
        """
        f_name = self._extract_name(node.func).replace("()", "")
        
        # Sort checks
        if f_name in ["sort", "sorted"]:
            return random.choice([
                f"Calling the built-in `{f_name}()` function universally demands an O(n log n) algorithmic cost. Highly optimized sorting engines must recursively divide, compare, and merge the elements to achieve total order.",
                f"Sorting a collection using `{f_name}()` is generally an O(n log n) operation. The algorithm cannot simply do a single linear pass; it must compare elements across subsets, creating a logarithmic multiplier on the linear work."
            ])

        # Recursion Handling
        if f_name == getattr(self.ctx, 'current_function_name', None):
            # Master Theorem / Divide and Conquer (Logarithmic reductions)
            if getattr(self.ctx, 'has_division', False):
                return random.choice([
                    f"This is a recursive call to '{f_name}' that fractionally divides the input problem space (e.g., cutting the array in half). According to the Master Theorem, this 'divide-and-conquer' strategy drastically reduces the amount of required work, establishing the overarching recurrence relation of {global_t}.",
                    f"By recursively invoking '{f_name}' on a divided, smaller subset of the data rather than the whole, the algorithm aggressively avoids doing extra work. This structural reduction yields an optimized recurrence relation of {global_t}."
                ])
            # Standard/Linear/Exponential Recursion (Addition/Subtraction steps)
            return random.choice([
                f"This line invokes '{f_name}' recursively. Every single time it calls itself, it spawns a completely new branch in the execution tree. This continuous stacking is what ultimately pushes the global algorithm complexity to build a recurrence relation of {global_t}.",
                f"A recursive jump back into the '{f_name}' function. Without an optimization like Dynamic Programming (memoization) to cache previously calculated results, these overlapping functional calls build up the mathematical recurrence relation to {global_t}.",
                f"Recursion dynamically triggers here! The function calls itself, adding a new execution step to the recurrence tree and driving the global system runtime scaling up to {global_t}."
            ])
            
        # Built-in Functions
        if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return random.choice([
                f"This line directly triggers a built-in `{f_name}()` function. Under the hood, this algorithm natively {b_info['desc']}. Knowing this behavior is critical—it implicitly costs {local_t} time every time it runs.",
                f"Do not let the clean one-liner fool you! Calling `{f_name}()` strictly {b_info['desc']}. This injects a hidden {local_t} operation directly into the heart of your algorithm's scaling runtime.",
                f"The built-in `{f_name}()` algorithmically {b_info['desc']}, inherently demanding {local_t} execution time proportional to the inputs provided."
            ])
            
        # Standard Custom Call (local_t has also been formatted just in case it yields a T(n))
        return random.choice([
            f"Executing the external function '{f_name}()' completely pauses this local scope until the sub-function resolves. We estimate its internal encapsulated logic requires {local_t} time.",
            f"Execution control is passed over to '{f_name}()'. Based on its structural contents, the engine evaluates this specific function call to inherently cost {local_t} time.",
            f"Invoking '{f_name}()' temporarily halts the current algorithmic step. The logic encapsulated inside it will require {local_t} time to complete before yielding back."
        ])

    def _time_for_conditionals(self, node, local_t, global_t):
        """Explains condition checking and filtering logic."""
        if getattr(self.ctx, 'loop_depth', 0) > 0 and getattr(node, 'lineno', 0) in getattr(self.ctx, 'conditional_partition_lines', []):
            return random.choice([
                f"This `if` statement acts as a partition or dynamic filter mechanism inside the loop. The boolean comparison itself is O(1), but it directly dictates the data-dependent execution flow of this {global_t} block.",
                f"Checking this condition is a fast O(1) logic instruction, but since it gates the heavy logic inside the loop, it heavily influences the algorithm's worst-case {global_t} runtime (a concept highly common in partitioning algorithms like QuickSort).",
                f"This conditional heavily filters the loop's execution pathways. While evaluating the True/False state takes O(1) time, its true structural impact is controlling the {global_t} global complexity."
            ])
            
        # Inspect the complex boolean logic if possible
        if hasattr(node, 'test'):
            bool_sentence = self._build_boolean_sentence(node.test)
            return random.choice([
                f"The program performs a logic check: {bool_sentence}. Processing this boolean constraint is a basic O(1) operation that instantly determines which logical branch the algorithm should route to next.",
                f"The algorithm evaluates the logic ({bool_sentence}) and resolves the boolean truthiness immediately in O(1) constant time, shifting the execution path appropriately."
            ])

        return random.choice([
            f"Evaluating this boolean conditional (checking if the state is computationally True or False) is a fundamental O(1) instruction that does not scale with data size.",
            f"Comparing variable values or checking state truthiness resolves immediately in O(1) constant time."
        ])

    def _time_for_returns(self, local_t):
        """Return statements are O(1) state terminations."""
        return random.choice([
            f"Passing the final computed payload back to the calling function is a simple {local_t} operation.",
            f"The `return` statement resolves instantly in {local_t} time, signaling the algorithm to conclude and pass the result back to the parent scope.",
            f"Execution concludes cleanly here. Returning the calculated value takes {local_t} constant time."
        ])

    def _time_for_yields(self, local_t):
        """Yield statements pause state (Generators)."""
        return random.choice([
            f"The `yield` keyword pauses the function and saves its local state. Returning the generated value to the consumer takes {local_t} time. This is a hallmark of lazy evaluation.",
            f"Instead of computing everything at once, `yield` emits a single value and suspends execution in {local_t} time, allowing for highly efficient data pipelines."
        ])

    def _time_for_standalone_expr(self, node, local_t, global_t):
        """Handles standalone expressions like docstrings or function calls."""
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return "This is a string literal or docstring. It is ignored during runtime execution, resulting in 0 processing cost (O(1))."
        if isinstance(node.value, ast.Call):
            return self._time_for_calls(node.value, local_t, global_t)
        return f"This standalone expression is evaluated and immediately discarded in {local_t} time."

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        """
        Routes the AST node to the appropriate Space complexity explainer.
        Heavily differentiates between in-place mutations (O(1)), 
        auxiliary allocations (O(n)), and call stack depth limits.
        """
        prefix = random.choice([
            "Regarding memory allocation: ", 
            "From a strict space perspective: ",
            "Looking deeply at RAM usage: ", 
            "Memory-wise: ", 
            "In terms of system memory: ", 
            ""
        ])

        # Function Definitions
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return prefix + self._space_for_function_def(node, local_s)

        # Generators check
        if isinstance(node, (ast.Yield, ast.YieldFrom)):
            return prefix + self._space_for_generators()

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
                if f_name == getattr(self.ctx, 'current_function_name', None):
                    return prefix + self._space_for_linear_recursion(f_name)
                if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
                    return prefix + f"The built-in `{f_name}()` function dynamically provisions {local_s} extra internal memory to safely organize or cache the data before returning it."
            
            if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                return prefix + self._space_for_allocations(node, local_s)

            return prefix + random.choice([
                f"The algorithm generates a new data structure here. As the input data scales, the auxiliary memory needed scales directly proportionally with it, landing at {local_s}.",
                f"We see a direct {local_s} memory spike here because the system must reserve new heap space to accommodate the dynamically expanding collection of data."
            ])

        # 3. O(1) IN-PLACE MUTATION
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            return prefix + self._space_for_inplace(local_s)

        # 4. DEFAULT O(1) FALLBACK
        return prefix + random.choice([
            f"This computational step operates purely on pre-existing data variables. Because it does not create any new scaling arrays or structures, it demands only {local_s} constant space.",
            f"No massive auxiliary data structures are initialized in this step, ensuring the algorithm's memory footprint remains perfectly stable at {local_s}.",
            f"This algorithmic logic executes strictly in-place. The space complexity overhead remains a flat, highly optimized {local_s}."
        ])

    # --- SPECIFIC SPACE GENERATORS ---

    def _space_for_function_def(self, node, local_s):
        """Explains that defining a function uses strictly O(1) baseline space."""
        f_name = getattr(node, 'name', 'this function')
        return random.choice([
            f"Defining `{f_name}` merely allocates a tiny O(1) footprint for the function object itself. The actual auxiliary data structures and arrays inside will not consume system memory until the function is formally executed.",
            f"Registering a new function signature like `{f_name}` requires a strictly bounded O(1) constant space to store the memory reference. The internal memory scaling (such as instantiating dynamic arrays or lists) remains dormant until invoked.",
            f"This function definition block inherently takes up a flat O(1) space footprint. Absolutely none of its internal variables are physically instantiated onto the heap or the call stack until the function is actively called in your code."
        ])

    def _space_for_graphs(self):
        """Explains O(V) or O(V+E) space for graph tracking."""
        return random.choice([
            "This step allocates an O(V) block of extra memory. Graph algorithms absolutely require tracking structures—like a 'visited' Hash Set or a Breadth-First Queue—to safely map out vertices without getting trapped in infinite circular loops.",
            "To accurately and safely explore the graph structure, the algorithm must cache the states of nodes it has already seen. This auxiliary data structure specifically requires O(V) memory scaling strictly relative to the number of vertices.",
            "Maintaining the traversal queue or a visited hash set requires memory directly proportional to the total vertices, yielding an O(V) space footprint."
        ])

    def _space_for_log_recursion(self):
        """Explains O(log n) call stack limit for divide and conquer."""
        return random.choice([
            "Because the recursion utilizes a highly efficient divide-and-conquer approach, the maximum depth of the active call stack is heavily compressed. The system only needs O(log n) memory to juggle the concurrent execution frames.",
            "The recursion tree created here is incredibly shallow! It only stacks up to O(log n) functional frames in memory before hitting a base case and rapidly collapsing back down to the root.",
            "By systematically halving the data problem space, the recursion strictly limits its maximum maximum depth. It dynamically allocates a highly efficient O(log n) extra memory on the call stack."
        ])

    def _space_for_linear_recursion(self, f_name):
        """Explains O(n) call stack limit for linear recursion."""
        return random.choice([
            f"Every time the '{f_name}' function calls itself, the system must immediately pause the current function and push a brand new 'frame' onto the call stack to store local variables and return pointers. If it recurses 'n' times, that creates a massive tower of frames costing O(n) extra space!",
            f"Recursion is never entirely free! Each execution jump into '{f_name}' stacks up sequentially in system memory until a base condition is finally hit. This linear layering consumes a heavy O(n) space.",
            f"Each recursive step actively adds a new execution frame to the call stack, forcing the space complexity to grow linearly at O(n). If 'n' is too large, this will trigger a Stack Overflow."
        ])

    def _space_for_allocations(self, node, local_s):
        """Explains O(n) heap memory allocation for data structures."""
        rhs = getattr(node, 'value', None)
        
        # Array Slicing Space
        if getattr(self.ctx, 'has_slicing', False):
            return random.choice([
                "Slicing an array forces the algorithm to request a completely new contiguous block of memory to store the duplicate values, intrinsically costing O(n) extra space.",
                "Slicing doesn't just pass references. It physically clones the array data, which means it must allocate an entirely new array object in memory. This structurally demands O(n) space."
            ])
            
        # Lists / Arrays
        if isinstance(rhs, (ast.ListComp, ast.List)):
            return "Building a new list creates a dynamic array in memory. Because it must hold 'n' elements, this structural allocation scales directly, costing O(n) space."
            
        # Dictionaries / Hash Maps
        if isinstance(rhs, (ast.DictComp, ast.Dict)):
            return "Creating this dictionary allocates memory for a Hash Table. The algorithm provisions memory buckets to store the key-value pairs, which structurally requires an O(n) space complexity."
            
        # Sets / Hash Sets
        if isinstance(rhs, (ast.SetComp, ast.Set)):
            return "Sets are backed entirely by Hash Maps. The algorithm allocates an O(n) memory block containing sparse arrays to store the unique element hashes securely."

        # Generic Variable Allocation
        return random.choice([
            f"Allocating this completely new variable requires the system to provision {local_s} memory dynamically based on the current input dataset size.",
            f"This assignment requires building a brand new data structure dynamically in memory, yielding a strict {local_s} space complexity."
        ])

    def _space_for_inplace(self, local_s):
        """Explains O(1) constant space for in-place modifications."""
        return random.choice([
            f"This state mutation is handled highly efficiently. By utilizing only {local_s} space to store tiny scalar references, the primary data structure is modified cleanly in-place without copying.",
            f"Variables are overwritten strictly in-place here. This lean operation keeps the memory footprint tightly bounded at exactly {local_s} without needlessly cloning massive datasets.",
            f"The algorithm simply updates the variable identifier to a new value. This swift state update does not scale with data size, costing only {local_s} space.",
            f"Because this only requires altering a pre-existing memory state, the overall auxiliary space complexity remains a strict {local_s}."
        ])

    def _space_for_generators(self):
        """Explains O(1) space efficiency of Python Generators."""
        return random.choice([
            "Using a generator significantly optimizes Space Complexity to O(1). Instead of computing and storing a massive array of values in memory all at once, it lazily yields one value at a time.",
            "Generators are incredibly memory efficient. By maintaining only the current state of computation and yielding values on-demand, the space complexity drops to a flat O(1) regardless of the data scale."
        ])