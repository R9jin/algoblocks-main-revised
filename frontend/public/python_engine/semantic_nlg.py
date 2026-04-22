# semantic_nlg.py
import ast
import random

class SemanticNLGEngine:
    """
    Advanced Dynamic Natural Language Generation (NLG) Engine for AlgoBlocks.
    
    Target Audience: 2nd to 4th-Year Computer Science Students, Algorithm Analysts.
    Purpose: To translate abstract AST nodes, Big O complexities, and raw mathematical 
    equations into highly varied, deeply educational explanations. Now fully supports
    advanced structural edge cases like Lambdas, Generators, Context Managers, and 
    Multiple Dataset Dimensions (O(n * m)).
    """
    
    def __init__(self, analyzer_context):
        self.ctx = analyzer_context

    def get_time_bottleneck_warning(self, operation, big_o):
        """Generates highly dynamic bottleneck warnings using code context."""
        op_str = operation.lower() if operation else "step"
        return random.choice([
            f" \n\n⚠️ **CRITICAL TIME BOTTLENECK:** Out of all operations in the program, this {op_str} scales the worst asymptotically. In rigorous Big O analysis, lower-order terms are actively dropped, meaning its dominant {big_o} combined growth factor dictates the final mathematical runtime of your entire algorithm.",
            f" \n\n⚠️ **DOMINANT TIME FACTOR:** This {op_str} acts as the primary computational bottleneck. Because it contributes the highest un-dropped time complexity across the script, its {big_o} scaling securely sets the final execution limit of the program.",
            f" \n\n⚠️ **ALGORITHMIC BOTTLENECK:** This specific {op_str} holds the highest runtime multiplier in the script. Because asymptotic notation exclusively focuses on the fastest-growing term as data approaches infinity, this {big_o} segment defines your total overall execution speed."
        ])

    def get_space_bottleneck_warning(self, operation, big_o):
        """Generates advanced space warnings using structural context."""
        op_str = operation.lower() if operation else "step"
        return random.choice([
            f" \n\n⚠️ **PRIMARY MEMORY DRIVER:** This {op_str} represents the absolute highest space complexity contribution in the script. Yielding a strict {big_o} allocation footprint, it acts as the defining bottleneck for your overall memory consumption.",
            f" \n\n⚠️ **DOMINANT SPACE FACTOR:** Because this {op_str} consumes the most auxiliary memory (either via dynamic structures or active call stack frames), it mathematically defines the final {big_o} space complexity of the overall algorithm.",
            f" \n\n⚠️ **MEMORY BOTTLENECK:** Out of all the active operations, this {op_str} scales the worst proportionally with dataset size, effectively establishing the {big_o} upper ceiling of your program's RAM constraints."
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
            if rel in comp_str: return f"{comp_str} — which mathematically resolves via the Master Theorem (or recurrence tree analysis) to a final asymptotic Big O limit of {big_o}"
        return comp_str

    def _extract_name(self, node):
        if isinstance(node, ast.Name): return f"'{node.id}'"
        if isinstance(node, ast.Constant): return f'"{node.value}"' if isinstance(node.value, str) else str(node.value)
        if isinstance(node, ast.Attribute): return f"{self._extract_name(node.value)}.{node.attr}"
        if isinstance(node, ast.Call): return f"{self._extract_name(node.func)}()"
        if isinstance(node, ast.Subscript): return f"{self._extract_name(node.value)}[...]"
        if isinstance(node, ast.List): return "a new dynamic array"
        if isinstance(node, ast.Dict): return "a new hash map"
        if isinstance(node, ast.Set): return "a new hash set"
        if isinstance(node, ast.Tuple): return "a new immutable tuple"
        if isinstance(node, ast.Starred): return f" unpacked elements of {self._extract_name(node.value)}"
        return "the target structure"

    def _get_op_name(self, op):
        op_map = {
            ast.Add: "addition", ast.Sub: "subtraction", ast.Mult: "multiplication", 
            ast.Div: "division", ast.FloorDiv: "integer (floor) division", 
            ast.Mod: "modulo (remainder) operation", ast.Pow: "exponentiation", 
            ast.LShift: "bitwise left shift", ast.RShift: "bitwise right shift"
        }
        return op_map.get(type(op), "mathematical operation")

    def _get_cmp_name(self, op):
        cmp_map = {
            ast.Eq: "strict equality check", ast.NotEq: "inequality check",
            ast.Lt: "strict less-than bounding comparison", ast.LtE: "less-than-or-equal boundary check",
            ast.Gt: "strict greater-than bounding comparison", ast.GtE: "greater-than-or-equal boundary check",
            ast.In: "membership scan", ast.NotIn: "non-membership scan"
        }
        return cmp_map.get(type(op), "boolean comparison")

    def _build_math_sentence(self, node, depth=0):
        if isinstance(node, ast.Name): return node.id
        elif isinstance(node, ast.Constant): return str(node.value)
        elif isinstance(node, ast.BinOp):
            left = self._build_math_sentence(node.left, depth + 1)
            right = self._build_math_sentence(node.right, depth + 1)
            if isinstance(node.op, ast.Add): return f"the sum of {left} and {right}" if depth < 2 else f"({left} plus {right})"
            elif isinstance(node.op, ast.Sub): return f"the difference between {left} and {right}" if depth < 2 else f"({left} minus {right})"
            elif isinstance(node.op, ast.Mult): return f"the product of {left} and {right}" if depth < 2 else f"({left} multiplied by {right})"
            elif isinstance(node.op, ast.FloorDiv): return f"the mathematical midpoint of {left}" if right == "2" else f"the integer floor division of {left} by {right}"
            elif isinstance(node.op, ast.Mod): return f"the remainder of {left} modulo {right}"
            elif isinstance(node.op, ast.Pow): return f"the square of {left}" if right == "2" else f"{left} raised to the power of {right}"
            else: return f"the result of a {self._get_op_name(node.op)} between {left} and {right}"
        
        elif isinstance(node, ast.UnaryOp):
            operand = self._build_math_sentence(node.operand, depth + 1)
            if isinstance(node.op, ast.USub): return f"the negative value of {operand}"
            if isinstance(node.op, ast.Not): return f"the logical boolean negation of {operand}"
            return f"a unary operation on {operand}"
            
        elif isinstance(node, ast.Call):
            func_name = self._extract_name(node.func)
            args = [self._build_math_sentence(a, depth + 1) for a in node.args]
            if not args: return f"the payload from the {func_name} function call"
            elif len(args) == 1: return f"the result of applying {func_name} algorithmically to {args[0]}"
            else: return f"the evaluation of {func_name} utilizing parameters {', '.join(args[:-1]) + f', and {args[-1]}'}"
        
        elif isinstance(node, ast.Subscript): return f"the explicit element retrieved from {self._extract_name(node.value)}"
        return "the calculated algorithmic expression"

    def _build_boolean_sentence(self, node):
        if isinstance(node, ast.Compare):
            left = self._build_math_sentence(node.left)
            comparisons = [f"a {self._get_cmp_name(op)} against {self._build_math_sentence(comp)}" for op, comp in zip(node.ops, node.comparators)]
            return f"evaluating {left} by performing " + " and ".join(comparisons)
        if isinstance(node, ast.BoolOp):
            values = [self._build_math_sentence(v) for v in node.values]
            if isinstance(node.op, ast.And): return f"a highly restrictive logical AND gate requiring both {values[0]} and {values[1]} to be strictly true"
            elif isinstance(node.op, ast.Or): return f"a logical OR gate allowing successful routing if at least one condition between {values[0]} and {values[1]} evaluates to true"
        return "a dynamic boolean truthiness evaluation"

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet):
        if is_dead: return self._generate_dead_code_explanation(code_snippet)

        fmt_local_t = self._format_recurrence_relation(str(local_t))
        fmt_global_t = self._format_recurrence_relation(str(global_t))

        time_desc = self._route_time_semantics(node, fmt_local_t, fmt_global_t, code_snippet)
        space_desc = self._route_space_semantics(node, local_s, global_s, code_snippet)
        
        return time_desc, space_desc

    def _generate_dead_code_explanation(self, code_snippet):
        t_desc = random.choice([
            f"The statement `{code_snippet}` is analytically flagged as Unreachable (Dead Code). Because it aggressively follows a flow interruption like a `return`, `break`, or `continue`, the execution environment physically skips it entirely. It inherently contributes an explicit 0-operation overhead, mapping to O(1).",
            f"Notice how `{code_snippet}` is sequentially placed after a terminal execution statement? The control flow guarantees this path is completely un-navigable during runtime. Therefore, it mathematically costs 0 operations to evaluate."
        ])
        s_desc = "Since this code block is completely circumvented by the interpreter, it physically cannot request memory allocation or arbitrarily provision any new structural data collections."
        return t_desc, s_desc

    def _route_time_semantics(self, node, local_t, global_t, code_snippet):
        prefix = random.choice([
            f"Looking at the execution of `{code_snippet}`: ", f"Evaluating the instruction `{code_snippet}`: ",
            f"Focusing analytically on `{code_snippet}`: ", f"During this operational step, ", ""
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
                f"On its own isolated axis, this evaluation resolves in {local_t} time. However, because it securely resides inside a continuous loop, the parent iterations act as a rigorous mathematical multiplier, causing its total combined growth factor to aggressively scale to {global_t}.",
                f"This inherently demands {local_t} operational effort. Yet, the surrounding loop architecture forces sequential, repeated executions. Over the complete lifecycle of the algorithm, rigorous asymptotic rules calculate that this line globally demands {global_t} runtime."
            ])
        else: base_desc = f"This foundational procedural step evaluates instantly and scales consistently at {local_t}."

        return prefix + base_desc

    def _time_for_function_def(self, node, local_t):
        f_name = getattr(node, 'name', 'this function')
        return random.choice([
            f"Defining the function `{f_name}` structurally avoids executing its internal algorithmic logic immediately. The interpreter purely parses the syntax rules and maps the function pointer in highly optimized O(1) constant time. True algorithmic scaling remains strictly deferred until explicit invocation.",
            f"Notice that this is a function definition boundary (`def {f_name}`). The underlying computational routines inside are completely dormant right now. Binding this signature and reserving its namespace fundamentally evaluates in O(1) time."
        ])

    def _time_for_lambda(self):
        return "This constructs an anonymous lambda closure. Instead of evaluating the nested expression immediately, it simply compiles a callable function pointer in O(1) constant time. The inner execution cost is heavily deferred until this lambda is formally invoked."

    def _time_for_try_catch(self):
        return "Setting up a `try` block dynamically attaches an exception handler to the current active call stack frame. In modern Python architectures, establishing this boundary is highly optimized and practically zero-cost during successful execution, securely evaluating in O(1) constant time."

    def _time_for_context_manager(self):
        return "Initiating a context manager (`with`) inherently schedules automated resource provisioning (__enter__) and strict eventual teardown (__exit__). Establishing these boundary protocols maps logically to O(1) constant time initialization, bypassing heavy iteration."

    def _time_for_exponential(self):
        return "This logical structure inherently triggers a cascading O(2^n) exponential blowout. Every time you append one singular item to the underlying input constraint, the amount of required mathematical work violently doubles, indicating massive sub-problem recalculation overlap."

    def _time_for_factorial(self):
        return "This is categorized mathematically as O(n!) factorial time. This is analytically the heaviest and most computationally expensive bound possible in basic algorithmics. Because operations explode proportionally by n * (n-1) * (n-2)..., executing this logic becomes strictly impossible for even moderately sized datasets."

    def _time_for_graph(self):
        return "This routine initiates a classic non-linear traversal (like BFS or DFS). By rigorously utilizing 'visited' state markers to aggressively prevent revisiting the same data points cyclically, the cumulative runtime gracefully scales directly with the graph topology: O(V + E)."

    def _time_for_loops(self, node, local_t, global_t):
        is_for = isinstance(node, ast.For)
        loop_type = "The `for` loop" if is_for else "The `while` loop"
        base = ""

        if "O(1)" in local_t: base = f"{loop_type} establishes a structurally hardcoded, static iteration limit. Since its execution boundary is mathematically insulated from primary input expansions, it strictly guarantees an O(1) constant runtime overhead."
        elif "log n" in local_t: base = f"{loop_type} behaves mathematically like a binary search partition. By consistently fractioning the remaining operational workload heavily in half on every single cycle, its iteration count scales logarithmically, securing a tremendously efficient O(log n) barrier."
        elif "√n" in local_t: base = f"{loop_type} is constrained by a strict square root bound. By intelligently limiting traversals to the mathematical square root of the primary integer space, it intentionally circumvents massive amounts of redundant linear verification, finalizing at an optimal O(√n)."
        else: base = f"We observe a direct proportional mapping here. As the underlying collection grows, the iteration counts directly mimic that expansion symmetrically, assigning {loop_type.lower()} a foundational O(n) linear complexity marker."

        if "* m" in global_t:
            return base + f" Critically, this structure indicates multidimensional traversal across totally independent collections. Instead of naively collapsing the combined growth into O(n²), rigorous asymptotic theory identifies the exact cross-product penalty as {global_t}, acknowledging the distinct N and M limits."
        
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 1:
            return base + f" However, this resides deep inside a nested hierarchy. In robust Big O calculus, we strictly multiply combined growth factors: inner looping cycles balloon drastically against outer loops, skyrocketing the total programmatic payload runtime to {global_t}."
            
        return base

    def _time_for_comprehensions(self, node, local_t, global_t):
        comp_type = "list comprehension"
        if isinstance(node, ast.DictComp): comp_type = "dictionary comprehension"
        if isinstance(node, ast.SetComp): comp_type = "set comprehension"
        if isinstance(node, ast.GeneratorExp):
            comp_type = "generator expression"
            base = f"A {comp_type} behaves similarly to a list comprehension, but heavily delays calculation. Constructing the initial generator simply spins up the internal state machine in O(1) time. However, eventually exhausting it still demands a linear {local_t} sequence."
        else:
            base = f"Analytically, a {comp_type} translates functionally to an optimized loop sequence. The engine physically iterates systematically across every item inside the iterable target to continuously append data, intrinsically bounding it to {local_t} time."
            
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0:
            return base + f" Because this continuous sequence acts inside a broader, active iteration boundary, the linear scan dynamically multiplies out, driving your holistic runtime cost mathematically to {global_t}."
        return base

    def _time_for_assignments(self, node, local_t, global_t):
        if isinstance(node, ast.Assign): targets = [self._extract_name(t) for t in node.targets]
        elif isinstance(node, ast.AugAssign): targets = [self._extract_name(node.target)]
        else: targets = [self._extract_name(node.target)]
            
        t_name = ", ".join(targets) if targets else "the variable binding"
        rhs = getattr(node, 'value', None)
        
        if isinstance(rhs, (ast.BinOp, ast.UnaryOp)): return f"The internal logic sequentially computes a formal mathematical expression: {self._build_math_sentence(rhs)}. Because intrinsic algebraic and boolean operators scale flawlessly regardless of large scalar weights, calculating the result and officially mapping it to {t_name} requires an optimal, flat O(1) runtime allocation."
        if getattr(self.ctx, 'has_slicing', False): return f"Extracting a sub-array slice dynamically and assigning it directly to {t_name} carries an O(n) algorithmic penalty. Slicing physically iterates strictly through the array indices in C under the hood, duplicating contiguous sequence addresses into an independent structure."
        if "O(n)" in local_t: return f"Mutating or creating {t_name} here forces a cascading linear O(n) transversal scan across the entire dynamic dataset before the pointer assignment can mathematically finalize. Execution scaling is tied securely 1:1 with data size."
        if isinstance(rhs, ast.Subscript): return f"Direct index extraction via exact memory offsets structurally bypasses linear search overheads completely. Pulling that value instantly and binding it heavily to {t_name} consumes purely O(1) constant time."
        if isinstance(rhs, ast.Call): return f"Once the isolated sub-routine completes execution, capturing its returned memory payload and mapping that reference to {t_name} demands an instant O(1) operational assignment."
            
        return f"Updating or officially generating the reference boundary {t_name} locally forces zero continuous looping or deep pointer chasing. It is parsed smoothly and successfully registered in O(1) time independently of input metrics."

    def _time_for_calls(self, node, local_t, global_t):
        f_name = self._extract_name(node.func).replace("()", "")
        if f_name in ["sort", "sorted"]: return f"Triggering the standard `{f_name}()` protocol systematically initiates Python's highly optimized Timsort. Sorting mathematically mandates a baseline O(n log n) execution cost as the engine partitions, heavily compares, and actively merges dynamic segments back together."

        if f_name == getattr(self.ctx, 'current_function_name', None):
            if getattr(self.ctx, 'has_division', False): return f"This active recursive instruction deliberately fragments the data partition bounds in half (or dynamically smaller fractions). Following the Master Theorem's divide-and-conquer principles, this drastically eliminates broad sub-problem checks, strictly shaping an overarching recurrence string of {global_t}."
            return f"This explicit code recursively delegates control flow back into `{f_name}`. Each sequential call violently spawns an independent namespace and execution branch in the overarching recursion tree. This progressive stacking acts as the key multiplier driving the total recurrence model identically to {global_t}."
            
        if hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities:
            b_info = self.ctx.builtin_complexities[f_name]
            return f"This invocation actively redirects execution to a core, native `{f_name}()` method. Internally, this protocol inherently {b_info['desc']}. Analytically, invoking it incurs a firm baseline {local_t} sequence per iteration."
            
        return f"Procedural routing is strictly forwarded to `{f_name}()`. Deriving from its previously evaluated structural AST, the engine concludes this specific independent call systematically consumes {local_t} baseline time."

    def _time_for_conditionals(self, node, local_t, global_t):
        if len(getattr(self.ctx, 'active_poly_dims', [])) > 0 and getattr(node, 'lineno', 0) in getattr(self.ctx, 'conditional_partition_lines', []):
            return f"This conditional acts mathematically as an embedded data-dependent partition inside an active looping cycle. The literal boolean constraint comparison resolves functionally in O(1), yet it completely dictates the routing of the subsequent heavy {global_t} procedural block."
        if hasattr(node, 'test'):
            return f"The script triggers an analytical state verification: {self._build_boolean_sentence(node.test)}. Parsing this conditional constraint acts purely as a swift O(1) computational barrier, immediately determining the program's resulting branch trajectory without heavy traversal."
        return f"Assessing this fallback branch logic behaves effectively as a generic O(1) constant routing jump."

    def _time_for_returns(self, local_t):
        return f"Executing a deliberate `return` securely resolves the function state instantly in {local_t} time, signaling the internal stack to purge cleanly and eagerly forward the calculated payload back to its parent caller scope."

    def _time_for_yields(self, local_t):
        return f"Rather than aggressively generating the entire collection dataset simultaneously into heavy memory, `yield` intelligently emits purely the next required sequential value and deliberately suspends execution in strict {local_t} constant time. This defines a highly efficient, lazy-evaluation pipeline."

    def _time_for_standalone_expr(self, node, local_t, global_t):
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str): return "This is interpreted functionally as an independent string literal (or passive docstring). Because it commands zero explicit state mutation or assignments, it generates exactly 0 active overhead, evaluating to purely O(1)."
        if isinstance(node.value, ast.Call): return self._time_for_calls(node.value, local_t, global_t)
        return f"This standalone syntactic expression is strictly analyzed, temporarily computed, and immediately garbage-collected dynamically in steady {local_t} time."

    # ==========================================
    # SPACE COMPLEXITY ROUTING & GENERATORS
    # ==========================================
    def _route_space_semantics(self, node, local_s, global_s, code_snippet):
        prefix = random.choice([
            "Regarding physical memory allocation: ", "Viewing this purely through a strict space perspective: ",
            "Looking deeply at the resulting heap footprint: ", "Evaluating RAM constraints here: ", ""
        ])

        base_desc = ""

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): base_desc = self._space_for_function_def(node, local_s)
        elif isinstance(node, (ast.Yield, ast.YieldFrom, ast.GeneratorExp)): base_desc = self._space_for_generators()
        elif "V" in local_s: base_desc = self._space_for_graphs()
        elif "log n" in local_s and getattr(self.ctx, 'has_division', False): base_desc = self._space_for_log_recursion()
        elif "n" in local_s:
            if isinstance(node, ast.Call):
                f_name = self._extract_name(node.func).replace("()", "")
                if f_name == getattr(self.ctx, 'current_function_name', None): base_desc = self._space_for_linear_recursion(f_name)
                elif hasattr(self.ctx, 'builtin_complexities') and f_name in self.ctx.builtin_complexities: base_desc = f"Executing the built-in `{f_name}()` algorithm heavily provisions an extra boundary of {local_s} dynamic auxiliary memory, intelligently tracking elements simultaneously before eventually concluding."
                else: base_desc = f"The underlying computational steps mathematically produce a newly allocated dataset. The active storage reserved dynamically scales entirely proportional to its content density, accurately settling at {local_s}."
            elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)): base_desc = self._space_for_allocations(node, local_s)
            else: base_desc = f"We systematically observe an extensive {local_s} memory expansion spike here because the interpreter engine is actively reserving dynamic new sequence capacity across the heap bounds to securely harbor the ballooning collection structure."
        elif isinstance(node, (ast.Assign, ast.AugAssign)): base_desc = self._space_for_inplace(local_s)
        else:
            base_desc = random.choice([
                f"This targeted calculation utilizes strictly pre-mapped variable spaces. Because it actively avoids spinning up entirely new scaling data buffers, its functional operation strictly requires purely {local_s} flat memory allocation overhead.",
                f"This isolated architectural segment executes completely in-place. The inherent space complexity tracking remains perfectly optimized, locked indefinitely at a highly stable {local_s} limit without expanding."
            ])

        return prefix + base_desc

    def _space_for_function_def(self, node, local_s):
        f_name = getattr(node, 'name', 'this block')
        return f"Declaring `{f_name}` initializes practically zero massive storage sequences. The Python interpreter allocates an incredibly tiny, static O(1) pointer slot purely for the active function object representation. Dense internal memory bounds remain deferred indefinitely until active runtime invocation."

    def _space_for_graphs(self):
        return "This phase formally maps an explicit O(V) sector of auxiliary tracking memory. Heavy graph structures mathematically demand external associative state collections (like a localized Hash Set 'visited' log or a continuous queue sequence) to rigorously track distinct vertices properly without crashing into massive cyclic infinite loops."

    def _space_for_log_recursion(self):
        return "Because this active recursive logic deliberately enforces an intelligent divide-and-conquer tree behavior, the structural depth limit of the call stack becomes enormously compressed. The active environment only needs to spin up O(log n) concurrent execution frames to simultaneously juggle the bifurcated operations."

    def _space_for_linear_recursion(self, f_name):
        return f"Each consecutive moment '{f_name}' delegates logic to itself, the underlying environment forcefully pushes a totally independent operational context frame cleanly onto the call stack. This dangerous straight-line linear framing relentlessly consumes heavy O(n) sequence space and risks triggering a severe Stack Overflow crash if 'n' dynamically inflates too widely."

    def _space_for_allocations(self, node, local_s):
        rhs = getattr(node, 'value', None)
        if getattr(self.ctx, 'has_slicing', False): return "The array slice operator strictly bypasses passing purely shallow aliases. Instead, it literally provisions completely detached sequential array objects over in memory, physically cloning boundary values. Analytically, this forces a severe O(n) structural storage requirement."
        if isinstance(rhs, (ast.ListComp, ast.List)): return "Organizing a fresh sequential list generates dynamically contiguous array buffers. Because the underlying C boundaries are repeatedly padded to perfectly secure 'n' elements concurrently, it incurs a substantial, scalable O(n) mathematical allocation footprint."
        if isinstance(rhs, (ast.DictComp, ast.Dict)): return "Configuring this active dictionary rigorously assigns complex associative hashing buckets directly to the system heap. This dense hash map topology structurally requires scaling overhead exactly proportional to an O(n) density marker."
        if isinstance(rhs, (ast.SetComp, ast.Set)): return "Hash Sets mathematically rely heavily on sparse array buckets directly mapping integer keys under the hood. Constructing this topology strictly demands reserving an active O(n) memory span to definitively preserve uncollided elements effectively."

        return f"Binding and generating this newly defined variable state completely forces the interpreter to rigorously provision contiguous {local_s} physical memory spaces proportional systematically to the current input bounds."

    def _space_for_inplace(self, local_s):
        return f"This active transformation explicitly avoids cloning giant arrays sequentially. By deliberately operating directly on active existing variable addresses mathematically, space limits are perfectly contained and optimized indefinitely down to {local_s}."

    def _space_for_generators(self):
        return "Selecting to use a generator completely eliminates ballooning arrays, heavily optimizing Space Complexity directly to O(1). Instead of computing thousands of sequences and locking them inside massive contiguous RAM structures simultaneously, the state machine merely suspends securely, lazily yielding precisely one localized value at an instant."