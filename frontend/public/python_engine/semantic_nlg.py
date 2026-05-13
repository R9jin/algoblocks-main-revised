# frontend/public/python_engine/semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Dynamic Natural Language Generation (NLG) Engine for AlgoBlocks.
    
    Target Audience: Beginner to Intermediate Computer Science Students.
    Purpose: To translate code steps and Big O complexities into clear, 
    easy-to-understand explanations focusing on algorithmic theory, mechanics, 
    and actionable optimization strategies.
    """
    
    def __init__(self, analyzer_context):
        self.ctx = analyzer_context

    def get_time_bottleneck_warning(self, operation, big_o):
        """Generates dynamic time bottleneck warnings with actionable improvement tips."""
        op_str = operation.lower() if operation else "step"
        
        # Targeted educational tips based on the specific complexity bottleneck
        tip = ""
        if any(x in big_o for x in ["2^n", "n!"]):
            tip = "💡 **Optimization Tip:** Exponential and Factorial times are extremely slow. If this function repeats calculations, try using **Memoization** (saving past results in a dictionary) to magically drop this to O(n) linear time!"
        elif any(x in big_o for x in ["n^2", "n^3", "*"]):
            tip = "💡 **Optimization Tip:** This usually happens because of nested loops (a loop inside a loop). Try to flatten them! Often, you can use a Hash Map (Dictionary) or a Set to look up items instantly in O(1) time instead of looping to find them."
        elif "n log n" in big_o:
            tip = "💡 **Optimization Tip:** O(n log n) is standard for efficient sorting. However, if you don't actually need the data fully sorted (e.g., you just want the maximum, minimum, or sum), you can do it in O(n) time with a single loop!"
        elif "n" in big_o and not any(x in big_o for x in ["log", "^", "*"]):
            tip = "💡 **Optimization Tip:** Linear time is usually great! But, if you are searching for an item in a list that is *already sorted*, try using **Binary Search** to shrink this down to O(log n). If you just need fast lookups, use a Dictionary or Set (O(1))."

        warnings = [
            f" \n\n⚠️ **TIME BOTTLENECK:** Out of all the steps in this program, this {op_str} scales the worst. Because Big O focuses on the slowest part of the code, this {big_o} operation sets the overall speed of your entire algorithm.",
            f" \n\n⚠️ **MAIN TIME FACTOR:** This {op_str} is the heaviest lifter in your code. It has the highest time complexity, meaning its {big_o} scaling determines how fast your program finishes when given huge amounts of data."
        ]
        
        return random.choice(warnings) + "\n\n" + tip if tip else random.choice(warnings)

    def get_space_bottleneck_warning(self, operation, big_o):
        """Generates dynamic space warnings with memory optimization tips."""
        op_str = operation.lower() if operation else "step"
        
        tip = ""
        if any(x in big_o for x in ["n^2", "n^3", "*"]):
            tip = "💡 **Memory Tip:** You are creating a massive 2D matrix or nested structure. Ask yourself: Do you really need to store *every* combination? Sometimes in algorithms, you only need to keep the previous row or column in memory to save space!"
        elif "V" in big_o or "E" in big_o:
            tip = "💡 **Memory Tip:** Graph algorithms often need extra space to track 'visited' nodes so they don't get stuck in a loop. Ensure you are using a Set for this, as it is highly efficient."
        elif "n" in big_o:
            tip = "💡 **Memory Tip:** Are you copying a whole list, slicing arrays, or using deep recursion? Try to modify the data **'in-place'** (e.g., swapping array elements directly) to drop this to O(1) space. If it's recursion, rewriting it as an iterative loop uses zero call-stack memory!"

        warnings = [
            f" \n\n⚠️ **MEMORY BOTTLENECK:** This {op_str} takes up the most extra memory in your script. With a {big_o} space requirement, it acts as the defining limit for your program's overall RAM usage.",
            f" \n\n⚠️ **DOMINANT SPACE FACTOR:** Because this {op_str} actively reserves the most memory (like creating new lists or deep recursive function calls), it sets the final {big_o} space complexity of the overall algorithm."
        ]
        
        return random.choice(warnings) + "\n\n" + tip if tip else random.choice(warnings)
    
    def get_time_optimization_praise(self, operation, big_o):
        """Generates positive reinforcement for optimized algorithms."""
        op_str = operation.lower() if operation else "step"
        return random.choice([
            f" \n\n🌟 **HIGHLY OPTIMIZED:** Excellent work! This {op_str} runs in a blazing fast {big_o} time. By actively skipping unnecessary data, this code will scale incredibly well even with massive datasets.",
            f" \n\n🌟 **EFFICIENT SCALING:** This {op_str} hits an optimal {big_o} runtime. Algorithms that successfully divide the workload (like this one) are exactly what tech companies look for in high-performance software.",
            f" \n\n🌟 **ALGORITHM MASTERY:** You achieved a {big_o} time complexity here! Instead of checking every single item, this {op_str} uses advanced logic to drastically reduce the amount of work the computer has to do."
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
            if rel in comp_str: return f"{comp_str} — which mathematically simplifies to a final Big O time complexity of **{big_o}**."
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
        """Analyzes AST structures to identify and explain common algorithm patterns to students."""
        addon = ""
        try:
            # 1. Swap Operation Detection
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
                return "\n\n💡 **Algorithm Insight:** This is a 'swap' operation! Swapping elements in-place is a classic technique used in sorting algorithms (like Bubble Sort or Quick Sort) to organize data without using extra memory."
            
            # 2. Midpoint / Pivot / Division Selection
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    t_name = self._extract_name(target).lower()
                    if "mid" in t_name:
                        return "\n\n💡 **Algorithm Insight:** Calculating a 'midpoint' is the core of 'Divide and Conquer' algorithms like Binary Search or Merge Sort. By splitting the work exactly in half, the algorithm becomes incredibly fast!"
                    if "pivot" in t_name:
                        return "\n\n💡 **Algorithm Insight:** Choosing a 'pivot' is the main trick used in Quick Sort. The algorithm uses this reference point to rapidly divide the data into 'smaller' and 'larger' halves."
                
                # Check for explicit division by 2
                if isinstance(node.value, ast.BinOp) and isinstance(node.value.op, ast.FloorDiv):
                    if isinstance(node.value.right, ast.Constant) and str(node.value.right.value) == "2":
                        return "\n\n💡 **Algorithm Insight:** Dividing a dataset in half like this is the secret behind why algorithms like Binary Search scale so efficiently. It guarantees an optimal O(log n) speed."

            # 3. Pointer Movement Detection (e.g., left += 1, right -= 1)
            if isinstance(node, ast.AugAssign) and isinstance(node.op, (ast.Add, ast.Sub)) and isinstance(node.value, ast.Constant) and str(node.value.value) == "1":
                t_name = self._extract_name(node.target).lower()
                if any(p in t_name for p in ["left", "right", "low", "high", "start", "end", "i", "j", "ptr"]):
                    direction = "forward" if isinstance(node.op, ast.Add) else "backward"
                    return f"\n\n💡 **Algorithm Insight:** This step inches an index 'pointer' {direction}. This is the foundation of the 'Two Pointers' technique, commonly used to walk through arrays efficiently."

            # 4. Appending to a Result/Merge Array
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == "append":
                return "\n\n💡 **Algorithm Insight:** Appending to a list is a common way to build up a final 'merged' collection. You'll often see this in Merge Sort when combining sorted halves back together."

            # 5. Two Pointer / Binary Search Loop Pattern
            if isinstance(node, ast.While) and isinstance(node.test, ast.Compare) and len(node.test.ops) > 0 and isinstance(node.test.ops[0], (ast.LtE, ast.Lt)):
                left_str = self._build_math_sentence(node.test.left).lower()
                right_str = self._build_math_sentence(node.test.comparators[0]).lower()
                if any(k in left_str for k in ["left", "low", "start"]) or any(k in right_str for k in ["right", "high", "end"]):
                    return "\n\n💡 **Algorithm Insight:** A loop checking if a 'left' boundary has crossed a 'right' boundary is the trademark of Binary Search. It systematically shrinks the active search window from both sides!"

            # 6. Sorting Comparisons (e.g., if arr[i] > arr[i+1])
            if isinstance(node, ast.If) and hasattr(node, 'test') and isinstance(node.test, ast.Compare):
                if isinstance(node.test.left, ast.Subscript) and isinstance(node.test.comparators[0], ast.Subscript):
                    return "\n\n💡 **Algorithm Insight:** Directly comparing two specific items inside a list is how 'comparison-based sorting' works. The algorithm checks if elements are out of order so it can decide whether to swap them."
        
        except Exception:
            pass # Fail silently if AST is unparseable
            
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
        
        if f_name in getattr(self.ctx, 'memoized_funcs', set()):
            return f"Defining `{f_name}` takes O(1) time. The system also detects **Dynamic Programming (Memoization/Caching)** applied here! This is a fantastic optimization. By saving previously computed results, it prevents the algorithm from recalculating the same branches over and over."

        if f_name in getattr(self.ctx, 'indirect_recursive_funcs', set()):
            return f"Defining `{f_name}` takes O(1) time. ⚠️ **CRITICAL WARNING:** The analyzer noticed that this function is part of a mutually recursive loop (functions calling each other). This hidden loop causes the number of function calls to multiply uncontrollably, leading to an exponential worst-case runtime."

        return random.choice([
            f"Defining a function doesn't run the code inside it yet. The computer just reads the function name and saves it for later in O(1) constant time. The actual time complexity of the code inside won't matter until the function is called.",
            f"Since this is just a function definition, the code inside isn't running right now. Saving the function name and its parameters to memory takes a fast, constant O(1) time."
        ])

    def _time_for_lambda(self):
        return "This creates an anonymous lambda function. Instead of running the code inside right away, it just sets up the function in O(1) constant time. The actual time it takes to run the code will only matter when the lambda is actively called."

    def _time_for_try_catch(self):
        return "Setting up a try-catch block just tells the program how to handle errors. This setup is very fast and takes basically zero computational effort, running in O(1) constant time."

    def _time_for_context_manager(self):
        return "Starting a 'with' statement sets up resources (like opening a file) and ensures they get cleaned up later. Setting this up takes a predictable, fast O(1) time."

    def _time_for_exponential(self):
        return "This logic results in an O(2^n) exponential time complexity. This means every time you add just one more item to the input, the amount of work the program has to do doubles! This scales terribly and is usually too slow for large datasets."

    def _time_for_factorial(self):
        return "This runs in O(n!) factorial time, which is practically the slowest possible time complexity. The number of operations grows insanely fast (n * (n-1) * (n-2)...), making this code freeze up or take hours to finish even for inputs as small as 15."

    def _time_for_graph(self):
        return "This starts a graph traversal (like BFS or DFS). By keeping track of which nodes have already been visited, the time it takes grows proportionally to the number of vertices and edges in the graph, giving it an O(V + E) time complexity."

    def _time_for_loops(self, node, local_t, global_t):
        is_for = isinstance(node, ast.For)
        loop_type = "The iterative loop" if is_for else "The conditional 'while' loop"
        base = ""

        if "O(1)" in local_t: base = f"{loop_type} loops a fixed number of times. Since it doesn't scale based on the size of the input data, it always takes the same amount of time, resulting in an O(1) constant runtime."
        elif "log n" in local_t: base = f"{loop_type} works systematically. By cutting the amount of remaining work in half every single time it loops, the number of operations grows extremely slowly, resulting in a highly efficient O(log n) time complexity."
        elif "√n" in local_t: base = f"{loop_type} cleverly only loops up to the square root of the input. This is a mathematical trick to skip unnecessary checks, making the loop run much faster and resulting in an O(√n) time complexity."
        else: base = f"As the size of your input data grows, the number of times this loop runs grows at the exact same rate. This 1-to-1 scaling means the loop runs in O(n) linear time."

        if "* m" in global_t:
            return base + f" Notice that this loop interacts with a second, independent dataset. Instead of just calling it O(n²), we multiply the sizes of the two distinct collections, giving a more accurate total time complexity of {global_t}."
        
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 1:
            return base + f" However, this loop is **nested** inside another loop. In Big O, we multiply the times of nested loops together. Because this inner loop runs fully for every single step of the outer loop, the total time complexity explodes to {global_t}."
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        comp_type = "collection comprehension"
        if isinstance(node, ast.GeneratorExp):
            comp_type = "generator expression"
            base = f"A {comp_type} prepares the sequence but doesn't actually compute all the values yet. Creating it takes a fast O(1) time, though eventually extracting all its items will still take {local_t} time."
        else:
            base = f"A {comp_type} works just like a fast `for` loop under the hood. It goes through every item in the collection one by one to build the new sequence, which means it scales in {local_t} time."
            
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0:
            return base + f" Because this comprehension sits inside another loop, the time it takes multiplies with the outer loop, bringing the total time complexity to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        if isinstance(node, ast.Assign): targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign): targets = [self._extract_name(node.target)]
        else: targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable binding"
        rhs = getattr(node, 'value', None)
        
        if isinstance(rhs, (ast.BinOp, ast.UnaryOp)): return f"The code calculates a mathematical expression: {self._build_math_sentence(rhs)}. Basic math operations always take the same amount of time regardless of how big the numbers are, so saving this result to {t_name} takes a fast O(1) time."
        if getattr(self.ctx, 'has_slicing', False): return f"Taking a slice of an array and assigning it to {t_name} takes O(n) time. Slicing in Python actually creates a brand new copy of that section of the array, so it has to visit and copy each element one by one."
        if "O(n)" in local_t: return f"Creating or updating {t_name} here requires scanning through an entire collection of data. Because the time it takes grows directly with the size of that data, this step takes O(n) linear time."
        if isinstance(rhs, ast.Subscript): return f"Looking up an item directly by its index (in an array) or key (in a dictionary) skips having to search through the collection. Getting that specific value and assigning it to {t_name} is instantaneous and takes O(1) constant time."
        if isinstance(rhs, ast.Call): return f"Once the function finishes running, taking its returned result and saving it to {t_name} happens instantly in O(1) time."
            
        return f"Declaring or updating the variable {t_name} doesn't require any loops. The program simply allocates the value directly to memory, which takes a highly efficient O(1) constant time."

    def _time_for_calls(self, node, local_t, global_t):
        f_name = self._extract_name(node.func).replace("()", "")
        if f_name in ["sort", "sorted"]: return f"Calling a built-in sorting function leverages a highly optimized algorithm (Timsort in Python). General-purpose sorting inherently requires an O(n log n) time complexity to safely split, compare, and merge the data into order."
        if f_name == "input": return f"Calling the input function pauses the program to read what the user types. Because it processes the text character by character, it runs in {local_t} linear time based on the length of the inputted string."

        is_indirect = f_name in getattr(self.ctx, 'indirect_recursive_funcs', set()) and getattr(self.ctx, 'current_function_name', None) in getattr(self.ctx, 'indirect_recursive_funcs', set())
        
        if f_name == getattr(self.ctx, 'current_function_name', None) or is_indirect:
            # DP Explanation Trigger
            if f_name in getattr(self.ctx, 'memoized_funcs', set()):
                 return f"This makes a recursive call to `{f_name}()`. However, because Dynamic Programming (Memoization) is caching the results, the program completely skips recalculating branches it has seen before. This drastically reduces the total recursive runtime down to just {global_t}."

            if is_indirect:
                 return f"This calls `{f_name}()`, triggering an **Indirect Recursion** loop (functions repeatedly calling each other). This generates a massive, branching tree of operations, causing the overall time complexity to degrade exponentially to {global_t}."

            if getattr(self.ctx, 'has_division', False): return f"This recursive call actively splits the dataset in half (or into smaller fragments). By 'Divide and Conquer', it dramatically reduces the amount of total work needed, bringing the total time complexity to {global_t}."
            return f"This code makes a recursive call back to `{f_name}`. Every single time it calls itself, it branches out and adds a new layer of work. This repeated stacking builds up the total time complexity to {global_t}."
            
        if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return f"This calls the built-in `{f_name}()` function. Under the hood, this function {b_info['desc']}. Due to how it operates internally, calling it scales at {local_t} time."
            
        return f"This runs the `{f_name}()` function. Based on the operations going on inside that specific function block, this call evaluates to {local_t} time."

    def _time_for_conditionals(self, node, local_t, global_t):
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0 and getattr(node, 'lineno', 0) in getattr(self.ctx, 'conditional_partition_lines', []):
            return f"This conditional sits inside a loop. The truth check itself is instantaneous (O(1) time), but whether it passes or fails controls if the program gets forced to run the heavier {global_t} block of code inside it."
        if hasattr(node, 'test'):
            return f"The program evaluates a condition: {self._build_boolean_sentence(node.test)}. Checking true/false boundaries is a core CPU operation and happens virtually instantly, taking O(1) constant time."
        return f"Dropping into this 'else' or fallback branch is a simple execution jump, taking O(1) constant time."

    def _time_for_returns(self, local_t):
        return f"The return statement terminates the function and passes the final computed result back to the caller. Executing the return takes {local_t} time."

    def _time_for_yields(self, local_t):
        return f"Instead of compiling a massive array in memory all at once, 'yield' pushes out a single value and then freezes the function's state. Yielding one step at a time is highly efficient, taking {local_t} constant time."

    def _time_for_standalone_expr(self, node, local_t, global_t):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str): return "This is a standalone string or docstring comment. It doesn't instruct the computer to compute anything, so it executes in 0 actual time (O(1))."
        if isinstance(node.value, ast.Call): return self._time_for_calls(node.value, local_t, global_t)
        return f"This standalone expression executes and its result is immediately discarded. Running this raw line evaluates to {local_t} time."

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        prefix = random.choice([
            "Looking at memory usage: ", "In terms of space complexity: ",
            "Analyzing the RAM impact: ", "When it comes to extra memory allocation: ", ""
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
                elif f_name == "input": base_desc = f"Capturing user input dynamically creates a new string in memory. The RAM needed is strictly tied to how long the typed string is, resulting in a {local_s} space complexity."
                elif hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities: base_desc = f"Executing the built-in `{f_name}()` function requires allocating {local_s} extra memory in the background to handle its internal structural changes."
                else: base_desc = f"This step spawns a new block of data in memory. Because the memory required grows proportionally with the size of the initial input, it claims {local_s} space."
            elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)): base_desc = self._space_for_allocations(node, local_s)
            else: base_desc = f"We note an {local_s} increase in memory footprint here because the application is actively claiming new RAM to house a growing collection of elements."
        elif isinstance(node, (ast.Assign, ast.AugAssign)): base_desc = self._space_for_inplace(local_s)
        else:
            base_desc = random.choice([
                f"This logic strictly reuses pre-existing variables instead of spinning up massive new copies of data structures. This optimization keeps the required extra memory at a flat, flat {local_s}.",
                f"This operation executes **'in-place'**, meaning it manipulates data exactly where it already lives without making duplicates. This is incredibly memory-efficient, stabilizing the space complexity at {local_s}."
            ])

        return prefix + base_desc

    def _space_for_function_def(self, node, local_s):
        f_name = getattr(node, 'name', 'this block')
        if f_name in getattr(self.ctx, 'memoized_funcs', set()):
            return f"Defining `{f_name}` normally takes O(1) space. However, because Dynamic Programming (Memoization) is active, the environment automatically allocates an O(n) memory cache to persist calculations across recursive boundaries."
        
        return f"Simply defining a function has almost no footprint. The system allocates a tiny, O(1) constant chunk of memory just to bind the function's name. It will not demand significant RAM until it is invoked."

    def _space_for_graphs(self):
        return "This demands O(V) extra memory. When navigating graphs, the algorithm must reliably store which vertices (nodes) have already been explored inside a Set or Queue to prevent infinitely looping over cycles."

    def _space_for_log_recursion(self):
        return "Because this recursion employs a 'Divide and Conquer' halving strategy, the call stack never gets incredibly deep. The system only needs to memorize O(log n) stacked function calls concurrently."

    def _space_for_recursion(self, f_name, is_indirect=False):
        if is_indirect:
            return f"Even though '{f_name}' avoids calling itself directly, dropping into an indirect recursive loop forces the computer to push the active state of *every* chained function onto the 'call stack'. This scaling consumes O(n) memory and risks a Stack Overflow."
        return f"Whenever '{f_name}' calls itself, the computer suspends the current function and pushes its entire state into memory onto the 'call stack'. This stacking effect aggressively consumes O(n) memory, which is why overly deep recursion crashes with a Stack Overflow."

    def _space_for_allocations(self, node, local_s):
        rhs = getattr(node, 'value', None)
        if getattr(self.ctx, 'has_slicing', False): return "Slicing an array does not just create a lightweight window; it actually commands the computer to allocate a brand new independent copy of that section in memory. Replicating this data claims O(n) extra space."
        if isinstance(rhs, (ast.ListComp, ast.List)): return "Initializing a new list commands the system to reserve continuous memory blocks. Because it must secure enough bytes to house all 'n' elements, it incurs an O(n) space complexity."
        if isinstance(rhs, (ast.DictComp, ast.Dict)): return "Spawning a new dictionary requires configuring memory 'hash buckets' to store incoming key-value mappings. The memory payload grows in direct proportion to the item count, claiming O(n) space."
        if isinstance(rhs, (ast.SetComp, ast.Set)): return "Generating a new set forces the allocation of unique hash buckets in memory. This natively consumes an active O(n) amount of space based on the dataset."

        return f"Constructing this variable forces the runtime environment to explicitly allocate {local_s} memory space to match the geometry of the data."

    def _space_for_inplace(self, local_s):
        return f"This alters the target data exactly where it resides in memory, bypassing the need to generate a bloated duplicate array. This 'in-place' mutation strategy is immensely memory-friendly, preserving the extra space requirement at {local_s}."

    def _space_for_generators(self):
        return "Deploying a generator is fundamentally brilliant for memory conservation (O(1) space). Instead of forcing the computer to compile a massive array and hoard it all in RAM concurrently, the generator simply remembers its index and lazily yields a single value on demand."