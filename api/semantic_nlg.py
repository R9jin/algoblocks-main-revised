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
    them into their standard asymptotic Big O equivalents using the Master Theorem.
    New Feature: Highlights DOMINANT BOTTLENECKS if the node contributes the 
    highest time or space complexity to the overall program.
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
                return f"{comp_str} — which mathematically resolves to an equivalent Big O notation of {big_o}"
        
        return comp_str

    # ==========================================
    # AST INTROSPECTION & TRANSLATION HELPERS
    # ==========================================
    def _extract_name(self, node):
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
        op_map = {
            ast.Add: "addition", ast.Sub: "subtraction", ast.Mult: "multiplication", 
            ast.Div: "division", ast.FloorDiv: "integer (floor) division", 
            ast.Mod: "modulo (remainder) operation", ast.Pow: "exponentiation", 
            ast.LShift: "bitwise left shift", ast.RShift: "bitwise right shift", 
            ast.BitAnd: "bitwise AND", ast.BitOr: "bitwise OR", ast.BitXor: "bitwise XOR"
        }
        return op_map.get(type(op), "mathematical operation")

    def _get_cmp_name(self, op):
        cmp_map = {
            ast.Eq: "equality check", ast.NotEq: "inequality check",
            ast.Lt: "strict less-than comparison", ast.LtE: "less-than-or-equal comparison",
            ast.Gt: "strict greater-than comparison", ast.GtE: "greater-than-or-equal comparison",
            ast.Is: "identity check", ast.IsNot: "non-identity check",
            ast.In: "membership check", ast.NotIn: "non-membership check"
        }
        return cmp_map.get(type(op), "boolean comparison")

    # ==========================================
    # EQUATION & FORMULA NATURAL LANGUAGE PARSERS
    # ==========================================
    def _build_math_sentence(self, node, depth=0):
        if isinstance(node, ast.Name): return node.id
        elif isinstance(node, ast.Constant): return str(node.value)
        elif isinstance(node, ast.BinOp):
            left = self._build_math_sentence(node.left, depth + 1)
            right = self._build_math_sentence(node.right, depth + 1)
            if isinstance(node.op, ast.Add): return f"the sum of {left} and {right}" if depth < 2 else f"({left} plus {right})"
            elif isinstance(node.op, ast.Sub): return f"the difference between {left} and {right}" if depth < 2 else f"({left} minus {right})"
            elif isinstance(node.op, ast.Mult): return f"the product of {left} and {right}" if depth < 2 else f"({left} multiplied by {right})"
            elif isinstance(node.op, ast.Div): return f"the quotient of {left} divided by {right}"
            elif isinstance(node.op, ast.FloorDiv):
                if right == "2": return f"the mathematical midpoint of {left}"
                return f"the integer floor division of {left} by {right}"
            elif isinstance(node.op, ast.Mod): return f"the remainder of {left} modulo {right}"
            elif isinstance(node.op, ast.Pow):
                if right == "2": return f"the square of {left}"
                elif right == "3": return f"the cube of {left}"
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
            if not args: return f"the result of the {func_name} function call"
            elif len(args) == 1: return f"the result of applying {func_name} to {args[0]}"
            else: return f"the evaluation of {func_name} using parameters {', '.join(args[:-1]) + f', and {args[-1]}'}"
        
        elif isinstance(node, ast.Subscript):
            return f"the element retrieved from {self._extract_name(node.value)}"

        return "the calculated expression"

    def _build_boolean_sentence(self, node):
        if isinstance(node, ast.Compare):
            left = self._build_math_sentence(node.left)
            comparisons = [f"a {self._get_cmp_name(op)} against {self._build_math_sentence(comp)}" for op, comp in zip(node.ops, node.comparators)]
            return f"evaluating {left} by performing " + " and ".join(comparisons)
        
        if isinstance(node, ast.BoolOp):
            values = [self._build_math_sentence(v) for v in node.values]
            if isinstance(node.op, ast.And): return f"a logical AND gate requiring both {values[0]} and {values[1]} to be strictly true"
            elif isinstance(node.op, ast.Or): return f"a logical OR gate requiring at least one condition between {values[0]} and {values[1]} to evaluate to true"
                
        return "a boolean truthiness evaluation"

    # ==========================================
    # MAIN GENERATION DELEGATOR
    # ==========================================
    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, is_bottleneck_time=False, is_bottleneck_space=False):
        """
        Main entry point for the engine.
        Delegates AST nodes to specific linguistic generators based on their assigned complexities.
        Automatically flags DOMINANT BOTTLENECKS for the highest programmatic scaling factors.
        """
        if is_dead:
            return self._generate_dead_code_explanation(code_snippet)

        # Fallback to automatically detect bottlenecks if the context provides the overall programmatic limit
        if not is_bottleneck_time and hasattr(self.ctx, 'overall_time_complexity'):
            if global_t == self.ctx.overall_time_complexity and global_t not in ["O(1)", ""]:
                is_bottleneck_time = True
        
        if not is_bottleneck_space and hasattr(self.ctx, 'overall_space_complexity'):
            if global_s == self.ctx.overall_space_complexity and global_s not in ["O(1)", ""]:
                is_bottleneck_space = True

        # Intercept and mathematically resolve any T(n) relations
        fmt_local_t = self._format_recurrence_relation(str(local_t))
        fmt_global_t = self._format_recurrence_relation(str(global_t))

        time_desc = self._route_time_semantics(node, fmt_local_t, fmt_global_t, code_snippet, is_bottleneck_time)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet, is_bottleneck_space)
        
        return time_desc, space_desc

    def _generate_dead_code_explanation(self, code_snippet):
        t_desc = random.choice([
            f"The statement `{code_snippet}` is flagged as Unreachable (Dead Code). Because it comes after a flow interruption like a `return`, `break`, or `continue`, the program's control flow will never actually reach this line. It contributes a strict O(1) to your runtime since it is never evaluated.",
            f"Notice how `{code_snippet}` is placed after a terminal statement? The execution logic guarantees this path is completely skipped. Therefore, it costs 0 operations during execution and has no impact on time complexity."
        ])
        s_desc = random.choice([
            "Since this code is skipped entirely, it does not allocate any memory or provision any new data structures.",
            "No memory is provisioned here because the execution flow physically cannot reach this instruction."
        ])
        return t_desc, s_desc

    # ==========================================
    # TIME COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_time_semantics(self, node, local_t, global_t, code_snippet, is_bottleneck_time):
        prefix = random.choice([
            f"Looking at the execution of `{code_snippet}`: ", f"Analyzing the instruction `{code_snippet}`: ",
            f"Focusing on `{code_snippet}`: ", f"For this step, ", f"In this exact line, ", ""
        ])

        base_desc = ""

        if "2^n" in local_t or getattr(self.ctx, '_is_exponential_loop', lambda x: False)(node):
            base_desc = self._time_for_exponential()
        elif "n!" in local_t:
            base_desc = self._time_for_factorial()
        elif "V + E" in local_t:
            base_desc = self._time_for_graph()
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            base_desc = self._time_for_function_def(node, local_t)
        elif isinstance(node, (ast.For, ast.While)):
            base_desc = self._time_for_loops(node, local_t, global_t)
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            base_desc = self._time_for_assignments(node, local_t, global_t)
        elif isinstance(node, ast.Call):
            base_desc = self._time_for_calls(node, local_t, global_t)
        elif isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp)):
            base_desc = self._time_for_comprehensions(node, local_t, global_t)
        elif isinstance(node, ast.If):
            base_desc = self._time_for_conditionals(node, local_t, global_t)
        elif isinstance(node, ast.Return):
            base_desc = self._time_for_returns(local_t)
        elif isinstance(node, (ast.Yield, ast.YieldFrom)):
            base_desc = self._time_for_yields(local_t)
        elif isinstance(node, ast.Expr):
            base_desc = self._time_for_standalone_expr(node, local_t, global_t)
        elif getattr(self.ctx, 'loop_depth', 0) > 0:
            base_desc = random.choice([
                f"On its own, this takes {local_t} time. However, because it is trapped inside a loop, it gets executed repeatedly. The parent loops act as a rigorous mathematical multiplier, causing its total combined growth factor to scale to {global_t}.",
                f"This is an inherent {local_t} operation, but the surrounding loop structure forces repeated executions. Over the lifecycle of the algorithm, rigorous asymptotic analysis dictates this line contributes {global_t} to the total runtime."
            ])
        else:
            base_desc = f"This fundamental operation resolves in {local_t} time."

        # DOMINANT BOTTLENECK INJECTION
        bottleneck_warning = ""
        if is_bottleneck_time:
            bottleneck_warning = random.choice([
                " \n\n⚠️ **CRITICAL TIME BOTTLENECK:** Out of all operations in the program, this step scales the worst. In rigorous asymptotic analysis, lower-order terms are dropped, meaning this dominant combined growth factor dictates the final Big O runtime of your entire algorithm.",
                " \n\n⚠️ **DOMINANT TIME FACTOR:** This operation represents the primary computational bottleneck. Because it contributes the highest time complexity across the whole script, it is the defining factor that sets the final Big O limits of the program.",
                " \n\n⚠️ **ALGORITHMIC BOTTLENECK:** This exact segment holds the highest runtime scaling in the script. Because asymptotic notation focuses on the fastest-growing term, this specific code block defines the total overall execution speed of your program."
            ])

        return prefix + base_desc + bottleneck_warning

    # --- SPECIFIC TIME GENERATORS ---

    def _time_for_function_def(self, node, local_t):
        f_name = getattr(node, 'name', 'this function')
        return random.choice([
            f"Defining the function `{f_name}` does not execute its internal algorithmic logic yet. The Python interpreter parses the syntax and registers the function name in O(1) constant time. True algorithmic time complexity is strictly deferred until explicitly called.",
            f"Notice that this is a function definition (`def {f_name}`). The algorithmic logic inside is dormant right now. Binding this signature takes a flat O(1) time."
        ])
    
    def _time_for_exponential(self):
        return random.choice([
            "This logic triggers an exponential O(2^n) cascade. Every time you add one more item to the input dataset, the amount of required computational work effectively doubles.",
            "We are hitting an O(2^n) exponential runtime bottleneck here. This typically happens in naive recursion where the algorithm blindly recalculates overlapping subproblems."
        ])

    def _time_for_factorial(self):
        return "We are dealing with O(n!) factorial time here. It is mathematically the heaviest and most expensive common time complexity. Because the work required scales by n * (n-1) * (n-2)..., it is entirely infeasible for large inputs."

    def _time_for_graph(self):
        return "This block implements a classic graph search operation. By strictly not revisiting nodes we've already evaluated via a 'visited' check, the work scales linearly with the total size of the graph: O(V + E)."

    def _time_for_loops(self, node, local_t, global_t):
        is_for = isinstance(node, ast.For)
        loop_type = "The `for` loop" if is_for else "The `while` loop"
        base = ""

        if "O(1)" in local_t:
            base = f"{loop_type} runs for a hardcoded, static number of iterations. Since its execution count is completely unaffected by primary input scaling, it evaluates strictly in O(1) constant time."
        elif "log n" in local_t:
            base = f"{loop_type} acts similarly to a binary search. By cutting the remaining workload in half on every single computational cycle, the number of iterations scales logarithmically, achieving a blazing fast O(log n) runtime."
        elif "√n" in local_t:
            base = f"{loop_type} relies on a square root boundary. By strategically limiting iterations to the mathematical square root of the input size, it skips massive amounts of redundant linear work, landing at O(√n)."
        else:
            base = f"We see a direct 1:1 scaling relationship here. As the underlying input data grows, the number of iterations grows proportionally, giving {loop_type.lower()} an O(n) linear complexity."

        if getattr(self.ctx, 'loop_depth', 0) > 1:
            nesting_context = random.choice([
                f" However, this is an inner nested loop. In rigorous Big O Analysis, we must reflect combined growth factors: inner loop complexities multiply with their outer parent loops. The total number of operations balloons, bringing the global algorithm runtime to {global_t}.",
                f" Because this loop is nested, we cannot view it in isolation. The combination of the outer loop cycles multiplying heavily against these inner loop cycles creates a compounding {global_t} combined growth factor."
            ])
            return base + nesting_context
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        comp_type = "list comprehension"
        if isinstance(node, ast.DictComp): comp_type = "dictionary comprehension"
        if isinstance(node, ast.SetComp): comp_type = "set comprehension"
        
        base = f"Under the hood, a {comp_type} is still a loop. It has to iterate sequentially through every element of the iterable to build the new data structure, meaning it inherently runs in {local_t} time."
        if getattr(self.ctx, 'loop_depth', 0) > 0:
            return base + f" Because this sits inside another loop structure, this linear scan multiplies to push your overall combined growth factor to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        if isinstance(node, ast.Assign): targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign): targets = [self._extract_name(node.target)]
        else: targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable"
        rhs = getattr(node, 'value', None)
        
        if isinstance(rhs, (ast.BinOp, ast.UnaryOp)):
            return f"The algorithm calculates a mathematical formula: {self._build_math_sentence(rhs)}. Because algebraic operations scale constantly regardless of the size of the numbers involved, computing the equation and binding it to {t_name} is a lightning-fast O(1) constant time operation."
        if getattr(self.ctx, 'has_slicing', False):
            return f"Assigning this slice to {t_name} is an O(n) operation. Slicing doesn't just pass a shallow reference; the algorithm physically iterates over the array to copy the requested contiguous elements into a brand new sequence."
        if "O(n)" in local_t:
            return f"Updating {t_name} here forces a linear O(n) scan across the underlying dynamic structure before the assignment can finalize. The time taken is directly proportional to the size of the data."
        if isinstance(rhs, ast.Subscript):
            return f"Direct index lookups (like grabbing an array element via offset) bypass linear searching. Assigning that instantly fetched value to {t_name} takes only O(1) time."
        if isinstance(rhs, ast.Call):
            return f"Once the external function finishes executing, grabbing its payload return value and linking it to the reference {t_name} takes O(1) time."
            
        return f"Updating the variable {t_name} in-place requires no iteration or memory traversal. It resolves smoothly in O(1) time regardless of input size."

    def _time_for_calls(self, node, local_t, global_t):
        f_name = self._extract_name(node.func).replace("()", "")
        if f_name in ["sort", "sorted"]:
            return f"Calling the built-in `{f_name}()` function universally demands an O(n log n) algorithmic cost. The sorting engine must recursively divide, compare, and merge the elements."

        if f_name == getattr(self.ctx, 'current_function_name', None):
            if getattr(self.ctx, 'has_division', False):
                return f"This recursive call fractionally divides the input problem space. According to the Master Theorem, this 'divide-and-conquer' strategy drastically reduces the work, establishing the overarching recurrence relation of {global_t}."
            return f"This line invokes '{f_name}' recursively. Every single time it calls itself, it spawns a completely new branch in the execution tree. This continuous stacking is what ultimately pushes the global recurrence relation to {global_t}."
            
        if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return f"This line directly triggers a built-in `{f_name}()` function. Under the hood, this algorithm natively {b_info['desc']}. It implicitly costs {local_t} time every time it runs."
            
        return f"Execution control is passed over to '{f_name}()'. Based on its structural contents, the engine evaluates this specific function call to inherently cost {local_t} time."

    def _time_for_conditionals(self, node, local_t, global_t):
        if getattr(self.ctx, 'loop_depth', 0) > 0 and getattr(node, 'lineno', 0) in getattr(self.ctx, 'conditional_partition_lines', []):
            return f"This `if` statement acts as a dynamic partition inside the loop. The boolean comparison itself is O(1), but it directly dictates the data-dependent execution flow of this {global_t} block."
            
        if hasattr(node, 'test'):
            return f"The program performs a logic check: {self._build_boolean_sentence(node.test)}. Processing this boolean constraint is a basic O(1) operation that instantly determines which logical branch the algorithm routes to next."

        return f"Evaluating this boolean conditional is a fundamental O(1) instruction that does not scale with data size."

    def _time_for_returns(self, local_t):
        return f"The `return` statement resolves instantly in {local_t} time, signaling the algorithm to conclude and pass the payload back to the parent scope."

    def _time_for_yields(self, local_t):
        return f"Instead of computing everything at once, `yield` emits a single value and suspends execution in {local_t} time, allowing for highly efficient data pipelines."

    def _time_for_standalone_expr(self, node, local_t, global_t):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return "This is a string literal or docstring. It is ignored during runtime execution, resulting in 0 processing cost (O(1))."
        if isinstance(node.value, ast.Call):
            return self._time_for_calls(node.value, local_t, global_t)
        return f"This standalone expression is evaluated and immediately discarded in {local_t} time."

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet, is_bottleneck_space):
        prefix = random.choice([
            "Regarding memory allocation: ", "From a strict space perspective: ",
            "Looking deeply at RAM usage: ", "Memory-wise: ", ""
        ])

        base_desc = ""

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            base_desc = self._space_for_function_def(node, local_s)
        elif isinstance(node, (ast.Yield, ast.YieldFrom)):
            base_desc = self._space_for_generators()
        elif "V" in local_s:
            base_desc = self._space_for_graphs()
        elif "log n" in local_s and getattr(self.ctx, 'has_division', False):
            base_desc = self._space_for_log_recursion()
        elif "n" in local_s:
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == getattr(self.ctx, 'current_function_name', None):
                    base_desc = self._space_for_linear_recursion(f_name)
                elif hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
                    base_desc = f"The built-in `{f_name}()` function dynamically provisions {local_s} extra internal memory to safely organize the data before returning it."
                else:
                    base_desc = f"The algorithm generates a new data structure here. The auxiliary memory needed scales directly proportionally, landing at {local_s}."
            elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                base_desc = self._space_for_allocations(node, local_s)
            else:
                base_desc = f"We see a direct {local_s} memory spike here because the system must reserve new heap space to accommodate the dynamically expanding collection of data."
        elif isinstance(node, (ast.Assign, ast.AugAssign)):
            base_desc = self._space_for_inplace(local_s)
        else:
            base_desc = random.choice([
                f"This computational step operates purely on pre-existing data variables. Because it does not create any new scaling structures, it demands only {local_s} constant space.",
                f"This algorithmic logic executes strictly in-place. The space complexity overhead remains a flat, highly optimized {local_s}."
            ])

        # DOMINANT BOTTLENECK INJECTION
        bottleneck_warning = ""
        if is_bottleneck_space:
            bottleneck_warning = random.choice([
                " \n\n⚠️ **PRIMARY MEMORY DRIVER:** This specific allocation represents the highest space complexity contribution in the program, acting as the absolute bottleneck for your overall memory footprint.",
                " \n\n⚠️ **DOMINANT SPACE FACTOR:** Because this step consumes the most auxiliary memory out of the entire script, it defines the final Big O space complexity of the overall algorithm.",
                " \n\n⚠️ **MEMORY BOTTLENECK:** Out of all the operations, this structural allocation (or call stack layering) scales the worst with data size, establishing the upper limit of your program's memory constraints."
            ])

        return prefix + base_desc + bottleneck_warning

    # --- SPECIFIC SPACE GENERATORS ---

    def _space_for_function_def(self, node, local_s):
        f_name = getattr(node, 'name', 'this function')
        return f"Defining `{f_name}` merely allocates a tiny O(1) footprint for the function object itself. Internal memory scaling remains dormant until invoked."

    def _space_for_graphs(self):
        return "This step allocates an O(V) block of extra memory. Graph algorithms require tracking structures—like a 'visited' Hash Set or Queue—to map out vertices without getting trapped in circular loops."

    def _space_for_log_recursion(self):
        return "Because the recursion utilizes an efficient divide-and-conquer approach, the maximum depth of the call stack is heavily compressed. The system only needs O(log n) memory to juggle the concurrent execution frames."

    def _space_for_linear_recursion(self, f_name):
        return f"Every time '{f_name}' calls itself, the system must pause the current state and push a brand new 'frame' onto the call stack. This linear layering consumes a heavy O(n) space and risks a Stack Overflow if 'n' is too large."

    def _space_for_allocations(self, node, local_s):
        rhs = getattr(node, 'value', None)
        if getattr(self.ctx, 'has_slicing', False):
            return "Slicing doesn't just pass references. It physically clones the array data, allocating an entirely new array object in memory. This structurally demands O(n) space."
        if isinstance(rhs, (ast.ListComp, ast.List)):
            return "Building a new list creates a dynamic array in memory. Because it must hold 'n' elements, this structural allocation scales directly, costing O(n) space."
        if isinstance(rhs, (ast.DictComp, ast.Dict)):
            return "Creating this dictionary allocates memory buckets for a Hash Table, which structurally requires an O(n) space complexity."
        if isinstance(rhs, (ast.SetComp, ast.Set)):
            return "Sets are backed by Hash Maps. The algorithm allocates an O(n) memory block containing sparse arrays to securely store the unique element hashes."

        return f"Allocating this new variable requires the system to provision {local_s} memory dynamically based on the current input dataset size."

    def _space_for_inplace(self, local_s):
        return f"This state mutation is handled efficiently. By utilizing only {local_s} space, the primary data structure is modified cleanly in-place without needlessly cloning massive datasets."

    def _space_for_generators(self):
        return "Using a generator significantly optimizes Space Complexity to O(1). Instead of computing and storing a massive array in memory all at once, it lazily yields one value at a time."