# semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Dynamic Natural Language Generation (NLG) Engine for AlgoBlocks.
    
    Target Audience: Beginner to Intermediate Computer Science Students.
    Purpose: To translate code steps and Big O complexities into clear, 
    easy-to-understand explanations focusing on algorithmic theory and execution mechanics.
    Now includes specialized recognition for common algorithm practices!
    """
    
    def __init__(self, analyzer_context):
        self.ctx = analyzer_context

    def get_time_bottleneck_warning(self, operation, big_o):
        """Generates dynamic bottleneck warnings using code context."""
        op_str = operation.lower() if operation else "step"
        return random.choice([
            f" \n\n⚠️ **TIME BOTTLENECK:** Out of all the steps in this program, this {op_str} takes the longest as the input grows. Because Big O focuses on the slowest part of the code, this {big_o} operation sets the overall speed of your entire algorithm.",
            f" \n\n⚠️ **MAIN TIME FACTOR:** This {op_str} is the main reason the program might slow down. It has the highest time complexity in the code, meaning its {big_o} scaling determines the final execution time of the program.",
            f" \n\n⚠️ **SLOWEST STEP:** This specific {op_str} grows the fastest in terms of time. In Big O analysis, we look at what happens when the data gets really large, so this {big_o} step defines your total overall execution speed."
        ])

    def get_space_bottleneck_warning(self, operation, big_o):
        """Generates space warnings using structural context."""
        op_str = operation.lower() if operation else "step"
        return random.choice([
            f" \n\n⚠️ **MAIN MEMORY USER:** This {op_str} takes up the most memory in the script. With a {big_o} space requirement, it acts as the main bottleneck for your program's overall memory usage.",
            f" \n\n⚠️ **DOMINANT SPACE FACTOR:** Because this {op_str} uses the most extra memory (like creating new lists or adding function calls to the stack), it defines the final {big_o} space complexity of the overall algorithm.",
            f" \n\n⚠️ **MEMORY BOTTLENECK:** Out of all the operations, the memory used by this {op_str} grows the fastest as the data size increases, effectively setting the {big_o} limit for your program's active memory."
        ])

    def _format_recurrence_relation(self, comp_str):
        if not comp_str or "T(" not in comp_str: return comp_str
        lookup = {
            "T(n) = n * T(n-1) + O(1)": "O(n!)", "T(n) = n * T(n-1)": "O(n!)",
            "T(n) = 2T(n/2) + O(n)": "O(n log n)", "T(n) = 2T(n/2) + O(1)": "O(n)",
            "T(n) = T(n-1) + T(n-2) + O(1)": "O(2^n)", "T(n) = T(n/2) + O(n)": "O(n)",
            "T(n) = T(n/2) + O(1)": "O(log n)", "T(n) = T(n-1) + O(n)": "O(n²)",
            "T(n) = T(n-1) + O(log n)": "O(n log n)", "T(n) = T(n-1) + O(1)": "O(n)",
            "2T(n/2)": "O(n log n)", "T(n-1) + T(n-2)": "O(2^n)",
            "T(n/2) + O(1)": "O(log n)", "T(n-1) + O(n)": "O(n²)"
        }
        for rel, big_o in lookup.items():
            if rel in comp_str: return f"{comp_str} — which simplifies to a final Big O time complexity of {big_o}"
        return comp_str

    def _extract_name(self, node):
        if isinstance(node, ast.Name): return f"'{node.id}'"
        if isinstance(node, ast.Constant): return f'"{node.value}"' if isinstance(node.value, str) else str(node.value)
        if isinstance(node, ast.Attribute): return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return f"{self._extract_name(node.func)}()"
        if isinstance(node, ast.Subscript): return f"{self._extract_name(node.value)}[...]"
        if isinstance(node, ast.List): return "a new list"
        if isinstance(node, ast.Dict): return "a new dictionary"
        if isinstance(node, ast.Set): return "a new set"
        if isinstance(node, ast.Tuple): return "a new tuple"
        if isinstance(node, ast.Starred): return f" the unpacked elements of {self._extract_name(node.value)}"
        return "the target variable"

    def _get_op_name(self, op):
        op_map = {
            ast.Add: "addition", ast.Sub: "subtraction", ast.Mult: "multiplication", 
            ast.Div: "division", ast.FloorDiv: "integer division", 
            ast.Mod: "modulo (remainder) operation", ast.Pow: "exponentiation", 
            ast.LShift: "bitwise left shift", ast.RShift: "bitwise right shift"
        }
        return op_map.get(type(op), "operation")

    def _get_cmp_name(self, op):
        cmp_map = {
            ast.Eq: "equality check", ast.NotEq: "inequality check",
            ast.Lt: "less-than comparison", ast.LtE: "less-than-or-equal comparison",
            ast.Gt: "greater-than comparison", ast.GtE: "greater-than-or-equal comparison",
            ast.In: "membership check", ast.NotIn: "non-membership check"
        }
        return cmp_map.get(type(op), "comparison")

    def _build_math_sentence(self, node, depth=0):
        if isinstance(node, ast.Name): return node.id
        elif isinstance(node, ast.Constant): return str(node.value)
        elif isinstance(node, ast.BinOp):
            left = self._build_math_sentence(node.left, depth + 1)
            right = self._build_math_sentence(node.right, depth + 1)
            if isinstance(node.op, ast.Add): return f"the sum of {left} and {right}" if depth < 2 else f"({left} plus {right})"
            elif isinstance(node.op, ast.Sub): return f"the difference between {left} and {right}" if depth < 2 else f"({left} minus {right})"
            elif isinstance(node.op, ast.Mult): return f"the product of {left} and {right}" if depth < 2 else f"({left} multiplied by {right})"
            elif isinstance(node.op, ast.FloorDiv): return f"the integer division by 2 of {left}" if right == "2" else f"the integer division of {left} by {right}"
            elif isinstance(node.op, ast.Mod): return f"the remainder of {left} modulo {right}"
            elif isinstance(node.op, ast.Pow): return f"the square of {left}" if right == "2" else f"{left} raised to the power of {right}"
            else: return f"the result of a {self._get_op_name(node.op)} between {left} and {right}"
        
        elif isinstance(node, ast.UnaryOp):
            operand = self._build_math_sentence(node.operand, depth + 1)
            if isinstance(node.op, ast.USub): return f"the negative value of {operand}"
            if isinstance(node.op, ast.Not): return f"the logical NOT of {operand}"
            return f"a unary operation on {operand}"
            
        elif isinstance(node, ast.Call):
            func_name = self._extract_name(node.func)
            args = [self._build_math_sentence(a, depth + 1) for a in node.args]
            if not args: return f"the result from calling {func_name}"
            elif len(args) == 1: return f"the result of calling {func_name} with {args[0]}"
            else: return f"the result of calling {func_name} with parameters {', '.join(args[:-1]) + f', and {args[-1]}'}"
        
        elif isinstance(node, ast.Subscript): return f"the specific element retrieved from {self._extract_name(node.value)}"
        return "the calculated expression"

    def _build_boolean_sentence(self, node):
        if isinstance(node, ast.Compare):
            left = self._build_math_sentence(node.left)
            comparisons = [f"a {self._get_cmp_name(op)} against {self._build_math_sentence(comp)}" for op, comp in zip(node.ops, node.comparators)]
            return f"evaluating {left} by performing " + " and ".join(comparisons)
        if isinstance(node, ast.BoolOp):
            values = [self._build_math_sentence(v) for v in node.values]
            if isinstance(node.op, ast.And): return f"a logical AND requiring both {values[0]} and {values[1]} to be true"
            elif isinstance(node.op, ast.Or): return f"a logical OR that is true if at least one condition between {values[0]} and {values[1]} is true"
        return "a boolean truth check"

    def _get_algorithmic_pattern_addon(self, node):
        """Analyzes AST structures to identify and explain common algorithm patterns."""
        addon = ""
        try:
            # 1. Swap Operation Detection
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
                return "\n\n💡 **Algorithm Concept:** This looks like a 'swap' operation! Swapping elements is a classic move in sorting algorithms (like Bubble Sort or Quick Sort) to easily organize and shift items into their correct order."
            
            # 2. Midpoint / Pivot / Division Selection
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    t_name = self._extract_name(target).lower()
                    if "mid" in t_name:
                        return "\n\n💡 **Algorithm Concept:** Calculating a 'midpoint' is a key part of 'Divide and Conquer' algorithms like Binary Search or Merge Sort. It allows the program to split the remaining work exactly in half, which makes searching incredibly fast!"
                    if "pivot" in t_name:
                        return "\n\n💡 **Algorithm Concept:** Choosing a 'pivot' is the main trick used in Quick Sort. The algorithm uses this pivot as a reference point to quickly divide the data into smaller and larger halves."
                
                # Check for explicit division by 2
                if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.FloorDiv):
                    if isinstance(node.value.right, ast.Constant) and str(node.value.right.value) == "2":
                        return "\n\n💡 **Algorithm Concept:** Dividing by 2 like this usually means the algorithm is intentionally splitting the dataset in half. This 'halving' is the secret behind why algorithms like Binary Search scale so efficiently, hitting that optimal O(log n) speed."

            # 3. Pointer Movement Detection (e.g., left += 1, right -= 1)
            if isinstance(node, ast.AugAssign) and isinstance(node.op, (ast.Add, ast.Sub)) and isinstance(node.value, ast.Constant) and str(node.value.value) == "1":
                t_name = self._extract_name(node.target).lower()
                if any(p in t_name for p in ["left", "right", "low", "high", "start", "end", "i", "j", "ptr"]):
                    direction = "forward" if isinstance(node.op, ast.Add) else "backward"
                    return f"\n\n💡 **Algorithm Concept:** This step inches a 'pointer' or index {direction}. 'Two Pointer' strategies or simple linear scans frequently use this exact logic to walk through an array step-by-step without losing their place."

            # 4. Appending to a Result/Merge Array
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == "append":
                return "\n\n💡 **Algorithm Concept:** Appending to a list is a common way to build up a final 'result' or 'merged' collection. You'll often see this logic in algorithms like Merge Sort when combining sorted halves back together."

            # 5. Two Pointer / Binary Search Loop Pattern
            if isinstance(node, ast.While) and isinstance(node.test, ast.Compare) and len(node.test.ops) > 0 and isinstance(node.test.ops[0], (ast.LtE, ast.Lt)):
                left_str = self._build_math_sentence(node.test.left).lower()
                right_str = self._build_math_sentence(node.test.comparators[0]).lower()
                if any(k in left_str for k in ["left", "low", "start"]) or any(k in right_str for k in ["right", "high", "end"]):
                    return "\n\n💡 **Algorithm Concept:** A loop continuously checking if a 'left' boundary has crossed a 'right' boundary is the trademark of the 'Two Pointers' technique or 'Binary Search'. It systematically narrows down the active search space from both sides until they meet!"

            # 6. Sorting Comparisons (e.g., if arr[i] > arr[i+1])
            if isinstance(node, ast.If) and hasattr(node, 'test') and isinstance(node.test, ast.Compare):
                if isinstance(node.test.left, ast.Subscript) and isinstance(node.test.comparators[0], ast.Subscript):
                    return "\n\n💡 **Algorithm Concept:** Directly comparing two specific items inside a list is the foundation of comparison-based sorting algorithms (like Bubble, Insertion, or Selection Sort). The algorithm does this to check if elements are out of order so it can swap them."
        
        except Exception:
            pass # Fail silently if AST is wildly unparseable, relying on base generation
            
        return addon

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        if is_dead: return self._generate_dead_code_explanation(code_snippet)

        fmt_local_t = self._format_recurrence_relation(str(local_t))
        fmt_global_t = self._format_recurrence_relation(str(global_t))

        time_desc = self._route_time_semantics(node, fmt_local_t, fmt_global_t, code_snippet)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet)
        
        return time_desc, space_desc

    def _generate_dead_code_explanation(self, code_snippet):
        t_desc = random.choice([
            f"The statement `{code_snippet}` is Unreachable (Dead Code). Because it comes after a return or break statement, the program will never actually run it. This means it takes 0 operations to run, which is O(1) time.",
            f"Notice how `{code_snippet}` is placed after a return or break statement? The program guarantees this line will never run. Therefore, it takes 0 operations to evaluate."
        ])
        s_desc = "Since this code never actually runs, it doesn't take up any extra memory."
        return t_desc, s_desc

    def _route_time_semantics(self, node, local_t, global_t, code_snippet):
        prefix = random.choice([
            f"Looking at the execution of `{code_snippet}`: ", f"Evaluating the instruction `{code_snippet}`: ",
            f"Looking at `{code_snippet}`: ", f"In this step, ", ""
        ])

        base_desc = ""

        if "2^n" in local_t or getattr(self.ctx, '_is_exponential_loop', lambda x: False)(node): base_desc = self._time_for_exponential()
        elif "n!" in local_t: base_desc = self._time_for_factorial()
        elif "V + E" in local_t: base_desc = self._time_for_graph()
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): base_desc = self._time_for_function_def(node, local_t)
        elif isinstance(node, ast.Lambda): base_desc = self._time_for_lambda()
        elif isinstance(node, ast.Try): base_desc = self._time_for_try_catch()
        elif isinstance(node, (ast.With, ast.AsyncWith)): base_desc = self._time_for_context_manager()
        elif isinstance(node, (ast.For, ast.While)): base_desc = self._time_for_loops(node, local_t, global_t)
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)): base_desc = self._time_for_assignments(node, local_t, global_t)
        elif isinstance(node, ast.Call): base_desc = self._time_for_calls(node, local_t, global_t)
        elif isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)): base_desc = self._time_for_comprehensions(node, local_t, global_t)
        elif isinstance(node, ast.If): base_desc = self._time_for_conditionals(node, local_t, global_t)
        elif isinstance(node, ast.Return): base_desc = self._time_for_returns(local_t)
        elif isinstance(node, (ast.Yield, ast.YieldFrom)): base_desc = self._time_for_yields(local_t)
        elif isinstance(node, ast.Expr): base_desc = self._time_for_standalone_expr(node, local_t, global_t)
        elif len(getattr(self.ctx, 'active_poly_dims', [])) > 0:
            base_desc = random.choice([
                f"By itself, this line runs in {local_t} time. However, because it is inside a loop, it runs multiple times. This multiplies the time it takes, bringing the total time complexity for this section to {global_t}.",
                f"This line alone takes {local_t} time. But since it's placed inside a loop, it gets executed repeatedly. Over the entire run of the program, this causes the line's total running time to be {global_t}."
            ])
        else: base_desc = f"This basic step runs in {local_t} time, meaning its execution time is consistent and predictable."

        # Dynamically append targeted algorithmic pattern explanations
        pattern_addon = self._get_algorithmic_pattern_addon(node)
        if pattern_addon:
            base_desc += pattern_addon

        return prefix + base_desc

    def _time_for_function_def(self, node, local_t):
        f_name = getattr(node, 'name', 'this function')
        
        # DP EXPLANATION FOR FUNCTION DEF
        if f_name in getattr(self.ctx, 'memoized_funcs', set()):
            return f"Defining `{f_name}` takes O(1) time. The system also detects **Dynamic Programming (Memoization/Caching)** applied here. This is a great optimization! It saves previously computed results, bringing the runtime down to a linear time complexity instead of growing exponentially."

        # INDIRECT RECURSION EXPLANATION
        if f_name in getattr(self.ctx, 'indirect_recursive_funcs', set()):
            return f"Defining `{f_name}` takes O(1) time. ⚠️ **CRITICAL (Indirect Recursion Detected):** The analyzer noticed that this function is part of a mutually recursive loop (functions calling each other). This hidden loop causes the number of function calls to grow very quickly, leading to an exponential worst-case runtime."

        return random.choice([
            f"Defining a function doesn't run the code inside it yet. The system just reads the function name and saves it for later in O(1) constant time. The actual time complexity of the code inside won't matter until the function is called.",
            f"Since this is just a function definition, the code inside isn't running right now. Saving the function name and its parameters takes a fast, constant O(1) time."
        ])

    def _time_for_lambda(self):
        return "This creates an anonymous lambda function. Instead of running the code inside right away, it just sets up the function in O(1) constant time. The actual time it takes to run the code will only matter when the lambda is called later."

    def _time_for_try_catch(self):
        return "Setting up a try-catch block just tells the program how to handle errors. This setup is very fast and takes basically zero effort, running in O(1) constant time."

    def _time_for_context_manager(self):
        return "Starting a 'with' statement sets up resources (like opening a file) and makes sure they get cleaned up later. Setting this up takes a fast, constant O(1) time."

    def _time_for_exponential(self):
        return "This logic results in an O(2^n) exponential time complexity. This means every time you add just one more item to the input, the amount of work the program has to do doubles. This is usually very slow for large inputs."

    def _time_for_factorial(self):
        return "This runs in O(n!) factorial time, which is one of the slowest possible time complexities. The number of operations grows incredibly fast (like n * (n-1) * (n-2)...), making this code take a very long time to finish even for small inputs."

    def _time_for_graph(self):
        return "This starts a graph traversal (like BFS or DFS). By keeping track of which nodes have already been visited so it doesn't get stuck in a loop, the time it takes grows based on the number of vertices and edges in the graph, giving it an O(V + E) time complexity."

    def _time_for_loops(self, node, local_t, global_t):
        is_for = isinstance(node, ast.For)
        loop_type = "The iterative loop" if is_for else "The conditional loop"
        base = ""

        if "O(1)" in local_t: base = f"{loop_type} loops a fixed number of times. Since it doesn't depend on the size of the input data, it always takes the same amount of time, resulting in an O(1) constant runtime."
        elif "log n" in local_t: base = f"{loop_type} works similar to a binary search. By cutting the amount of work in half every time it loops, the number of loops grows very slowly, resulting in a very efficient O(log n) time complexity."
        elif "√n" in local_t: base = f"{loop_type} only loops up to the square root of the input. This is a smart way to skip unnecessary checks, making the loop run much faster and resulting in an O(√n) time complexity."
        else: base = f"As the size of the input grows, the number of times this loop runs grows at the exact same rate. This means the loop runs in O(n) linear time."

        if "* m" in global_t:
            return base + f" Notice that this loop goes through a second, independent collection. Instead of just calling it O(n²), we multiply the sizes of the two distinct collections, giving a total time complexity of {global_t}."
        
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 1:
            return base + f" However, this loop is nested inside another loop. In Big O analysis, we multiply the times of nested loops together. Because this inner loop runs fully for every single step of the outer loop, the total time complexity grows to {global_t}."
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        comp_type = "collection comprehension"
        if isinstance(node, ast.GeneratorExp):
            comp_type = "generator expression"
            base = f"A {comp_type} sets up the sequence but doesn't actually compute all the values yet. Creating it takes a fast O(1) time, but eventually going through all its items will still take {local_t} time."
        else:
            base = f"A {comp_type} works just like a fast loop. It goes through every item in the collection one by one to build the new sequence, which means it takes {local_t} time."
            
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0:
            return base + f" Because this comprehension is inside another loop, the time it takes multiplies with the outer loop, bringing the total time complexity to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        if isinstance(node, ast.Assign): targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign): targets = [self._extract_name(node.target)]
        else: targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable binding"
        rhs = getattr(node, 'value', None)
        
        if isinstance(rhs, (ast.BinOp, ast.UnaryOp)): return f"The code calculates a mathematical expression: {self._build_math_sentence(rhs)}. Basic math operations always take the same amount of time no matter how big the numbers are, so saving this result to {t_name} takes a fast O(1) time."
        if getattr(self.ctx, 'has_slicing', False): return f"Taking a slice of a list and assigning it to {t_name} takes O(n) time. Slicing actually creates a brand new copy of that section of the list, so it has to visit each element one by one."
        if "O(n)" in local_t: return f"Creating or updating {t_name} here requires scanning through the entire collection of data. Because the time it takes grows directly with the size of the data, this step takes O(n) linear time."
        if isinstance(rhs, ast.Subscript): return f"Looking up an item directly by its index or key skips having to search through the list. Getting that value and assigning it to {t_name} is very fast and takes O(1) constant time."
        if isinstance(rhs, ast.Call): return f"Once the function call finishes running, taking its result and saving it to {t_name} happens instantly in O(1) time."
            
        return f"Declaring or updating the variable {t_name} doesn't require any loops. The program just saves the value to memory, which takes a very fast, constant O(1) time."

    def _time_for_calls(self, node, local_t, global_t):
        f_name = self._extract_name(node.func).replace("()", "")
        if f_name in ["sort", "sorted"]: return f"Calling a built-in sorting function uses a highly optimized sorting algorithm. Sorting generally requires an O(n log n) time complexity because the program has to split, compare, and merge the data."
        if f_name == "input": return f"Calling the input function pauses the program to read what the user types. Because it has to read the text character by character, it runs in {local_t} linear time, where 'n' is the length of the inputted text."

        is_indirect = f_name in getattr(self.ctx, 'indirect_recursive_funcs', set()) and getattr(self.ctx, 'current_function_name', None) in getattr(self.ctx, 'indirect_recursive_funcs', set())
        
        if f_name == getattr(self.ctx, 'current_function_name', None) or is_indirect:
            # DP Explanation Trigger
            if f_name in getattr(self.ctx, 'memoized_funcs', set()):
                 return f"This is a recursive call to `{f_name}()`. However, because Dynamic Programming (Memoization) is being used to save previous results, the program avoids calculating the same thing twice. This speeds up the total runtime to just {global_t}."

            if is_indirect:
                 return f"This code calls `{f_name}()`, which leads to an **Indirect Recursion** loop (where functions end up calling each other in a cycle). This creates a massive branching tree of function calls, causing the overall time complexity to grow exponentially to {global_t}."

            if getattr(self.ctx, 'has_division', False): return f"This recursive call splits the data in half (or into smaller pieces). By dividing the problem into smaller chunks each time, it speeds up the algorithm, resulting in a total time complexity of {global_t}."
            return f"This code makes a recursive call back to `{f_name}`. Each time it calls itself, it branches out and adds more work for the program to do. This repeated calling builds up, making the total time complexity {global_t}."
            
        if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return f"This calls the built-in `{f_name}()` function. Under the hood, this function {b_info['desc']}. Because of how it's built, calling it takes {local_t} time."
            
        return f"This runs the `{f_name}()` function. Based on the code inside that function, this specific call takes {local_t} time to run."

    def _time_for_conditionals(self, node, local_t, global_t):
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0 and getattr(node, 'lineno', 0) in getattr(self.ctx, 'conditional_partition_lines', []):
            return f"This if-statement sits inside a loop. Checking the condition itself is very fast (O(1) time), but whether it's true or false decides if the program runs the heavier {global_t} block of code inside it."
        if hasattr(node, 'test'):
            return f"The program checks a condition: {self._build_boolean_sentence(node.test)}. Checking if something is true or false is a very fast operation, so it takes O(1) constant time."
        return f"Checking this 'else' or fallback branch is a simple jump in the code, which takes a fast O(1) constant time."

    def _time_for_returns(self, local_t):
        return f"The return statement finishes the function and sends the result back to where it was called. Returning a value takes {local_t} time."

    def _time_for_yields(self, local_t):
        return f"Instead of creating a massive list all at once, 'yield' produces just one value and pauses the function. Yielding a single value is very efficient and takes {local_t} constant time."

    def _time_for_standalone_expr(self, node, local_t, global_t):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str): return "This is just a standalone string or comment. It doesn't actually tell the computer to calculate or change anything, so it takes practically 0 time (O(1))."
        if isinstance(node.value, ast.Call): return self._time_for_calls(node.value, local_t, global_t)
        return f"This standalone expression is calculated and then immediately discarded. Running this specific line takes {local_t} time."

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        prefix = random.choice([
            "Looking at memory usage: ", "In terms of space complexity: ",
            "Looking at how much memory this uses: ", "When it comes to extra memory: ", ""
        ])

        base_desc = ""

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): base_desc = self._space_for_function_def(node, local_s)
        elif isinstance(node, (ast.Yield, ast.YieldFrom, ast.GeneratorExp)): base_desc = self._space_for_generators()
        elif "V" in local_s: base_desc = self._space_for_graphs()
        elif "log n" in local_s and getattr(self.ctx, 'has_division', False): base_desc = self._space_for_log_recursion()
        elif "n" in local_s:
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                is_indirect = f_name in getattr(self.ctx, 'indirect_recursive_funcs', set()) and getattr(self.ctx, 'current_function_name', None) in getattr(self.ctx, 'indirect_recursive_funcs', set())

                if f_name == getattr(self.ctx, 'current_function_name', None) or is_indirect: base_desc = self._space_for_recursion(f_name, is_indirect)
                elif f_name == "input": base_desc = f"Reading user input creates a new string in memory. The amount of memory it needs is directly tied to how long the typed string is, resulting in {local_s} space complexity."
                elif hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities: base_desc = f"Running the built-in `{f_name}()` function requires setting aside {local_s} extra memory to keep track of its internal operations."
                else: base_desc = f"This step creates a new set of data in memory. The memory it uses grows directly with the size of the data, so it takes {local_s} space."
            elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)): base_desc = self._space_for_allocations(node, local_s)
            else: base_desc = f"We see an {local_s} increase in memory here because the program is actively reserving new space to hold a growing collection of data."
        elif isinstance(node, (ast.Assign, ast.AugAssign)): base_desc = self._space_for_inplace(local_s)
        else:
            base_desc = random.choice([
                f"This calculation reuses variables that already exist instead of creating massive new data structures. Because of this, it only needs a flat {local_s} amount of extra memory.",
                f"This step executes 'in-place', meaning it modifies existing data rather than creating copies. This is very memory-efficient, keeping the space complexity at a stable {local_s}."
            ])

        return prefix + base_desc

    def _space_for_function_def(self, node, local_s):
        f_name = getattr(node, 'name', 'this block')
        if f_name in getattr(self.ctx, 'memoized_funcs', set()):
            return f"Defining `{f_name}` normally takes O(1) space. However, since Dynamic Programming (Memoization) is used, the program sets up an O(n) memory cache in the background to store calculated results so they don't have to be re-run."
        
        return f"Defining a function doesn't take up much memory. The system just sets aside a tiny, O(1) constant amount of space to remember the function's name. It won't use heavy memory until the function is actually called."

    def _space_for_graphs(self):
        return "This requires O(V) extra memory. When traversing graphs, the program needs to keep track of which vertices (nodes) it has already visited using a set or a queue so it doesn't get stuck in an infinite loop."

    def _space_for_log_recursion(self):
        return "Because this recursion cuts the problem in half every time, the call stack doesn't get very deep. The program only needs to remember O(log n) function calls in memory at once."

    def _space_for_recursion(self, f_name, is_indirect=False):
        if is_indirect:
            return f"Even though '{f_name}' doesn't call itself directly, entering this recursive loop forces the computer to save the state of every function call on the 'call stack'. This takes up O(n) memory and risks a stack overflow error if it runs too many times."
        return f"Every time '{f_name}' calls itself, the computer has to save the current state in memory on the 'call stack' before moving to the next call. This stacking behavior consumes O(n) memory and risks causing a stack overflow if the recursion goes too deep."

    def _space_for_allocations(self, node, local_s):
        rhs = getattr(node, 'value', None)
        if getattr(self.ctx, 'has_slicing', False): return "Slicing a list doesn't just create a reference; it actually makes a brand new copy of that section in memory. Creating this copy requires O(n) extra space."
        if isinstance(rhs, (ast.ListComp, ast.List)): return "Creating a new list takes up memory. Because it has to reserve enough space to hold all 'n' elements, it has an O(n) space complexity."
        if isinstance(rhs, (ast.DictComp, ast.Dict)): return "Creating a new dictionary requires setting up memory 'buckets' to store key-value pairs. The memory it needs grows proportionally with the number of items, taking O(n) space."
        if isinstance(rhs, (ast.SetComp, ast.Set)): return "Creating a new set requires reserving memory to store all unique elements. This takes up an active O(n) amount of space."

        return f"Creating and saving this new variable forces the computer to reserve {local_s} memory space based on the size of the data."

    def _space_for_inplace(self, local_s):
        return f"This modifies the data directly where it already lives instead of creating a massive new copy. This is very memory-friendly, keeping the extra space required strictly at {local_s}."

    def _space_for_generators(self):
        return "Using a generator is incredibly memory-efficient (O(1) space). Instead of computing a massive list of items and holding them all in memory at the same time, it just remembers its current position and generates one value at a time."