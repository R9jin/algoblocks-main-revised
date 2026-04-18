# frontend/public/python_engine/semantic_nlg.py
import ast

class SemanticNLGEngine:
    def __init__(self, analyzer_context):
        # We hold a reference to the main analyzer to access loop depth, recursion state, etc.
        self.ctx = analyzer_context

    def _extract_name(self, node):
        """Helper to extract a string representation of an AST node."""
        if isinstance(node, ast.Name): return node.id
        if isinstance(node, ast.Constant): return str(node.value)
        if isinstance(node, ast.Attribute): return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return f"{self._extract_name(node.func)}()"
        if isinstance(node, ast.Subscript): return f"{self._extract_name(node.value)}[...]"
        return "expression"

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        if is_dead:
            return (
                "This line is classified as Dead Code because it follows a terminal statement (like return or break). It will never be executed.",
                "Because this code is unreachable, it allocates no auxiliary memory."
            )

        time_desc = self._generate_time_semantics(node, local_t, global_t, code_snippet)
        space_desc = self._generate_space_semantics(node, local_s, global_s, code_snippet)
        return time_desc, space_desc

    def _generate_time_semantics(self, node, local_t, global_t, code_snippet):
        # 1. EXPONENTIAL OPERATIONS
        if "2^n" in local_t or self.ctx._is_exponential_loop(node):
            return "This operation exhibits exponential O(2^n) time growth. The number of execution steps doubles with every increment of the input size, which is highly inefficient for large datasets."
        
        # 2. GRAPH TRAVERSAL
        if "V + E" in local_t:
            return "This structural block maintains O(V + E) time complexity by systematically traversing each vertex (V) and exploring its corresponding edges (E) within the graph."

        # 3. LOOPS (Context-aware of nesting)
        if isinstance(node, (ast.For, ast.While)):
            target_name = "The loop"
            if isinstance(node, ast.For) and isinstance(node.target, ast.Name):
                target_name = f"The loop iterating with '{node.target.id}'"
            
            base_desc = ""
            if "O(1)" in local_t:
                base_desc = f"{target_name} executes in constant O(1) time because its boundaries are strictly fixed and do not scale dynamically with the input size."
            elif "log n" in local_t:
                base_desc = f"{target_name} achieves logarithmic O(log n) time by dividing the search space by a constant factor in each iteration (divide and conquer)."
            elif "√n" in local_t:
                base_desc = f"{target_name} limits its iterations to the square root of the input (O(√n)), effectively jumping through the problem space."
            else:
                base_desc = f"{target_name} performs a linear O(n) sequence of iterations proportional to the problem size."

            # Apply accurate nested loop context
            if self.ctx.loop_depth > 1:
                return f"{base_desc} However, because it is nested inside an outer loop, this inner work is multiplied by the outer loop's execution. It becomes {global_t} when combined with the parent scope."
            return base_desc

        # 4. ASSIGNMENTS & DATA MANIPULATION
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
            target_str = ", ".join(targets) if targets else "the variable"
            
            if self.ctx.has_slicing:
                return f"Assigning to '{target_str}' involves array slicing. The interpreter must iterate through the segment boundary to copy the elements, requiring linear O(n) time."
            if "O(n)" in local_t:
                val_name = self._extract_name(node.value)
                return f"Assigning '{val_name}' to '{target_str}' triggers a linear O(n) operation, requiring the interpreter to scan or evaluate the entire data structure."
            return f"The assignment to '{target_str}' is evaluated in standard O(1) constant time."

        # 5. FUNCTION CALLS
        if isinstance(node, ast.Call):
            f_name = self._extract_name(node.func).replace("()", "")
            if f_name == self.ctx.current_function_name:
                return f"This is a recursive call invoking '{f_name}' again. This spawns a new branch in the execution tree, contributing directly to the recurrence relation {global_t}."
            if f_name in self.ctx.builtin_complexities:
                action = self.ctx.builtin_complexities[f_name]['desc']
                return f"Invoking the built-in function '{f_name}' {action}. This natively costs {local_t} time."
            return f"Invoking the function '{f_name}' requires {local_t} time."

        # 6. RETURN STATEMENTS
        if isinstance(node, ast.Return):
            val_name = self._extract_name(node.value) if node.value else "execution"
            return f"Returning {val_name} halts the current frame in O(1) time."

        return f"This statement evaluates in {local_t} time."

    def _generate_space_semantics(self, node, local_s, global_s, code_snippet):
        # Space complexity strictly targets extra/auxiliary memory created inside the algorithm.
        
        # 1. GRAPH STRUCTURES
        if "V" in local_s:
            return "Allocates O(V) auxiliary memory to track graph traversal states (such as visited vertices or neighbor queues)."
        
        # 2. RECURSIVE CALL STACK
        if "log n" in local_s and getattr(self.ctx, 'has_division', False):
            return "The divide-and-conquer recursion allocates O(log n) extra memory on the call stack to maintain the nested execution frames."
        
        if "n" in local_s:
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == self.ctx.current_function_name:
                    return f"Each recursive invocation of '{f_name}' adds a new frame to the call stack, compounding to require O(n) auxiliary space."
                if f_name in self.ctx.builtin_complexities:
                    return f"The built-in '{f_name}' internally provisions {local_s} extra memory dynamically."
            
            if isinstance(node, ast.Assign) and self.ctx.has_slicing:
                targets = [self._extract_name(t) for t in node.targets]
                target_str = ", ".join(targets) if targets else "the variable"
                return f"Because array slicing physically copies data, it provisions a new data structure in memory for '{target_str}', consuming O(n) auxiliary space."
            
            return "This operation allocates new data structures, utilizing O(n) auxiliary memory proportional to the input size."

        # 3. IN-PLACE / CONSTANT
        if isinstance(node, ast.Assign):
            targets = [self._extract_name(t) for t in node.targets]
            target_str = ", ".join(targets) if targets else "the variable"
            return f"The variable '{target_str}' only requires O(1) auxiliary space for storing its reference/primitive value. It modifies state in-place without duplicating the input data."

        return "This step operates strictly in-place, requiring only O(1) constant auxiliary space."