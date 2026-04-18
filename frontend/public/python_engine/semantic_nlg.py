# frontend/public/python_engine/semantic_nlg.py
import ast

class SemanticNLGEngine:
    def __init__(self, analyzer_context):
        # Reference to main analyzer to access loop depth, recursion state, etc.
        self.ctx = analyzer_context

    def _extract_name(self, node):
        """Helper to extract a string representation of an AST node."""
        if isinstance(node, ast.Name): return f"'{node.id}'"
        if isinstance(node, ast.Constant): return str(node.value)
        if isinstance(node, ast.Attribute): return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return f"{self._extract_name(node.func)}()"
        if isinstance(node, ast.Subscript): return f"{self._extract_name(node.value)}[...]"
        return "the expression"

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        if is_dead:
            return (
                "This statement is classified as Dead Code. Because it is positioned after a terminal statement (such as a return, break, or continue), the execution flow will never reach this point. Consequently, it contributes nothing to the program's overall time complexity.",
                "As this code is unreachable during execution, it does not allocate any auxiliary memory or affect the system's space complexity."
            )

        time_desc = self._generate_time_semantics(node, local_t, global_t, code_snippet)
        space_desc = self._generate_space_semantics(node, local_s, global_s, code_snippet)
        return time_desc, space_desc

    def _generate_time_semantics(self, node, local_t, global_t, code_snippet):
        # 1. EXPONENTIAL OPERATIONS
        if "2^n" in local_t or self.ctx._is_exponential_loop(node):
            return "This operation exhibits an exponential O(2^n) time growth trajectory. This means that for every single item added to the input, the execution time effectively doubles. This is a hallmark of unoptimized recursive branching or combinatorial generation, making it highly inefficient and prone to severe performance degradation on large datasets."
        
        # 2. GRAPH TRAVERSAL
        if "V + E" in local_t:
            return "This structural block maintains O(V + E) time complexity, indicating a standard graph traversal approach. The algorithm systematically visits each vertex (V) and explores its connected edges (E). This is the optimal baseline for algorithms like Breadth-First Search (BFS) or Depth-First Search (DFS)."

        # 3. LOOPS (Context-aware of nesting)
        if isinstance(node, (ast.For, ast.While)):
            target_name = "This loop"
            if isinstance(node, ast.For) and isinstance(node.target, ast.Name):
                target_name = f"The loop iterating with {self._extract_name(node.target)}"
            
            base_desc = ""
            if "O(1)" in local_t:
                base_desc = f"{target_name} is evaluated to execute in constant O(1) time. This is because its boundaries are strictly defined and do not scale dynamically based on the size of the provided input data."
            elif "log n" in local_t:
                base_desc = f"{target_name} achieves a highly efficient logarithmic O(log n) time complexity. By halving or consistently reducing the remaining search space in each iteration, it performs a 'divide and conquer' strategy."
            elif "√n" in local_t:
                base_desc = f"{target_name} limits its iterations to the square root of the input size (O(√n)). This 'jump' pattern allows the algorithm to bypass large portions of the data, offering a middle ground between linear and logarithmic performance."
            else:
                base_desc = f"{target_name} establishes a linear O(n) iteration path, meaning it will process elements in direct proportion to the size of the input dataset."

            # Apply accurate nested loop context
            if self.ctx.loop_depth > 1:
                return f"{base_desc} Crucially, because this inner loop is nested within an outer construct, its isolated complexity is multiplied by the outer loop's execution cycles. Therefore, its contribution to the global runtime expands to {global_t}."
            return base_desc

        # 4. ASSIGNMENTS & DATA MANIPULATION
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
            target_str = ", ".join(targets) if targets else "the variable"
            
            if self.ctx.has_slicing:
                return f"The assignment to {target_str} involves array slicing. Slicing requires the interpreter to iterate through the specified sequence boundaries to copy elements, which demands a linear O(n) traversal time."
            if "O(n)" in local_t:
                val_name = self._extract_name(node.value)
                return f"Assigning {val_name} to {target_str} triggers a linear O(n) operation. This indicates that the system must fully scan, construct, or evaluate the underlying data structure before the assignment can be finalized."
            return f"The assignment operation targeting {target_str} is evaluated instantly. Basic variable binding and primitive state updates resolve in standard O(1) constant time."

        # 5. FUNCTION CALLS
        if isinstance(node, ast.Call):
            f_name = self._extract_name(node.func).replace("()", "")
            if f_name == self.ctx.current_function_name:
                return f"This statement triggers a recursive invocation, calling '{f_name}' from within itself. This action spawns a new branch in the execution tree, contributing to the mathematical recurrence relation defining the algorithm's global runtime: {global_t}."
            if f_name in self.ctx.builtin_complexities:
                action = self.ctx.builtin_complexities[f_name]['desc']
                return f"This line invokes the built-in Python function '{f_name}', which natively {action}. Under the hood, this standard library call requires {local_t} time."
            return f"Invoking the external or custom function '{f_name}' requires an estimated {local_t} time to execute its encapsulated logic."

        # 6. RETURN STATEMENTS
        if isinstance(node, ast.Return):
            val_name = self._extract_name(node.value) if node.value else "execution"
            return f"Returning {val_name} concludes the current function frame, passing control back to the caller in standard O(1) constant time."

        if self.ctx.loop_depth > 0:
            return f"This basic statement executes in {local_t} time locally. However, because it resides within a loop structure, its execution is repeated, scaling its global impact to {global_t}."

        return f"This structural statement evaluates swiftly in {local_t} time."

    def _generate_space_semantics(self, node, local_s, global_s, code_snippet):
        # 1. GRAPH STRUCTURES
        if "V" in local_s:
            return "This block allocates O(V) auxiliary memory specifically to track state during graph traversal. This typically involves maintaining 'visited' sets or queuing structures to ensure vertices are not processed redundantly."
        
        # 2. RECURSIVE CALL STACK
        if "log n" in local_s and getattr(self.ctx, 'has_division', False):
            return "By employing a divide-and-conquer approach, the recursion limits its depth. It only allocates O(log n) extra memory on the system call stack to maintain the necessary execution frames."
        
        if "n" in local_s:
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == self.ctx.current_function_name:
                    return f"Each recursive call to '{f_name}' pushes a new frame onto the system call stack. This sequential stacking consumes auxiliary memory proportional to the recursion depth, equating to O(n) extra space."
                if f_name in self.ctx.builtin_complexities:
                    return f"While executing, the built-in function '{f_name}' must dynamically provision {local_s} extra memory internally to complete its operation."
            
            if isinstance(node, ast.Assign) and self.ctx.has_slicing:
                targets = [self._extract_name(t) for t in node.targets]
                target_str = ", ".join(targets) if targets else "the variable"
                return f"Array slicing physically copies elements rather than referencing them. This operation provisions entirely new data structures in memory for {target_str}, consuming O(n) auxiliary space."
            
            return "This line dynamically allocates new data structures or collections, utilizing O(n) auxiliary memory that scales directly with the input size."

        # 3. IN-PLACE / CONSTANT
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
            target_str = ", ".join(targets) if targets else "the variable"
            return f"The variable {target_str} requires only a marginal O(1) auxiliary space to store a reference or primitive value. The algorithm modifies the state directly in-place without duplicating the primary input data."

        return "This computational step operates strictly in-place. It relies on existing data references and demands only O(1) constant auxiliary space."