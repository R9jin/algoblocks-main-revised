"""
scope_detector.py -- Out-of-scope / partial-scope library detector.

The complexity engine (complexity_analyzer/analyzer.py) is NOT module-aware.
It pattern-matches bare function/attribute names against a single
`builtin_complexities` dict plus a handful of structural heuristics. Any
name that isn't in that dict and doesn't trigger a structural rule silently
falls through to a default O(1) cost -- it is never flagged as "unknown".

This module gives the engine (and the Python->Blocks converter) a way to
say "here's what I can't confidently reason about" *before* the user reads
the badge, instead of quietly mislabeling things. It is intentionally
conservative and additive: it never changes a time/space classification,
it only reports what it noticed, so it's safe to call from both
`analyze_source_code` and `BlocklyASTConverter.convert` without touching
the 266-case ground-truth benchmark.

Three tiers, in increasing order of "you should actually go check this":
  - "unsupported": a module was imported that the engine has no cost
    entries for at all. Every call from it defaults to O(1), which is
    frequently wrong but at least uniformly so.
  - "partial": a module IS in scope, but the specific name used is a
    known gap within it. (As of this writing PARTIAL_SUPPORT is empty --
    math/random/collections/itertools/statistics/heapq/bisect/functools
    are all fully covered -- but the machinery stays in place for future
    modules that only get partial coverage.)
  - "collision": the engine didn't just default -- it confidently
    borrowed an unrelated cost rule because a method name happens to
    match a key in builtin_complexities (e.g. Queue.get() costed as a
    dict lookup, or copy.deepcopy() costed as a shallow copy). This is
    the most misleading case, since the badge looks deliberate rather
    than defaulted.
"""
import ast

# Modules whose in-scope operations are (close to) fully and correctly
# mapped in ComplexityAnalyzer.builtin_complexities: every function and
# method the standard library exposes on these 8 modules has a cost entry
# (see the "Standard library module coverage" block in analyzer.py's
# builtin_complexities, plus library_function_names for the bare
# `from module import func; func(...)` call form).
FULLY_SUPPORTED_MODULES = {
    "math", "random", "collections", "itertools", "statistics", "heapq", "bisect", "functools",
}

# Modules that ARE in scope, but only partially: some of their names are
# costed correctly, and some silently default to O(1) or borrow the wrong
# rule. `gaps` lists the attribute/function names known to be uncovered.
# (Currently empty -- math, random, collections, itertools, statistics,
# heapq, bisect, and functools used to be listed here with known gaps;
# those gaps were closed and the modules promoted to
# FULLY_SUPPORTED_MODULES above. Left in place, still empty, as the home
# for any *future* module that's in scope but only partially covered.)
PARTIAL_SUPPORT = {}

# Modules the engine has no cost entries for at all, with a note on the
# specific operations most likely to matter in student code. This is not
# meant to be exhaustive -- any imported module not covered anywhere else
# in this file still gets flagged via the generic fallback message below,
# just without a tailored note.
KNOWN_UNSUPPORTED_MODULES = {
    "datetime": "Date/time arithmetic (addition, subtraction, comparisons, strftime/strptime) isn't costed; every operation defaults to O(1) regardless of what it's actually computing.",
    "re": "Regex compilation and matching (findall, match, search, sub, split) aren't costed; a regex scan over a long string reports O(1) instead of its real O(n)-or-worse cost.",
    "json": "dumps()/loads() walk the entire structure being (de)serialized, but default to O(1) here regardless of its size.",
    "os": "Filesystem calls like os.listdir(), os.walk(), and most os.path operations aren't costed; a scan over thousands of files still reports O(1).",
    "pathlib": "Path.iterdir(), Path.rglob(), and similar directory-walking calls aren't costed and default to O(1) no matter how many files they touch.",
    "queue": "Queue.put()/get() aren't costed with real FIFO semantics -- and get() in particular can be miscosted rather than defaulted (see below).",
    "operator": "Most operator.* functions (add, mul, etc.) happen to land on a reasonable O(1) by defaulting, but there's no verified cost model behind that for every function in this module.",
    "decimal": "Decimal arithmetic isn't costed; every operation defaults to O(1) regardless of precision or digit count.",
    "fractions": "Fraction arithmetic (which internally reduces via GCD on every operation) isn't costed and defaults to O(1).",
    "csv": "reader()/writer() iterate the whole file, but default to O(1) regardless of row count.",
    "copy": "deepcopy() can be far more expensive than a shallow copy for nested structures, but copy() in particular can be miscosted rather than defaulted (see below).",
    "sys": "Most sys.* calls used in student code (argv, exit, etc.) are genuinely O(1), so this is usually low-risk -- flagged only because nothing here is actually verified against a cost table.",
    "time": "time.sleep(), time.time(), etc. don't affect algorithmic complexity and default to O(1), which is typically correct -- flagged only so it's clear that isn't a verified rule.",
    "threading": "Thread creation, locks, and joins aren't costed at all; anything involving concurrency defaults to O(1).",
    "multiprocessing": "Process creation and inter-process communication aren't costed at all; defaults to O(1) regardless of workload.",
    "socket": "Network calls aren't costed; nothing about I/O latency or payload size is reflected in the complexity reported.",
    "urllib": "Network calls aren't costed; response size and I/O latency default to O(1).",
    "requests": "Network calls aren't costed; response size and I/O latency default to O(1).",
    "hashlib": "Hash computation is proportional to input size, but isn't costed here and defaults to O(1) regardless of how much data is hashed.",
    "array": "array module operations aren't costed the way list operations are; the underlying cost may not match what the list-based rules would imply.",
    "io": "File and stream I/O (read/write/readlines) isn't costed; operations over large files or streams still default to O(1).",
    "pickle": "dumps()/loads() walk the entire object graph being (de)serialized, but default to O(1) here regardless of its size.",
    "subprocess": "Process/I/O calls aren't costed at all; defaults to O(1) regardless of the subprocess's actual work.",
    "sqlite3": "Query execution isn't costed; a full-table scan and an indexed lookup both default to O(1) here.",
    "asyncio": "Coroutine scheduling and awaits aren't costed at all; defaults to O(1) regardless of what's being awaited.",
}

# Modules whose usage is essentially constant-time / metadata-only in
# typical student code (attribute lookups like string.ascii_letters), so
# flagging them as "unsupported" would be a false alarm more often than not.
KNOWN_SAFE_MODULES = {"string", "typing", "__future__", "dataclasses", "enum", "abc"}

# builtin_complexities keys most likely to collide with an out-of-scope
# module's method of the same name and get silently (and confidently)
# costed under the wrong rule, with a note on what's actually being
# miscosted for the common case.
NAME_COLLISION_NOTES = {
    "get": "costed as a dict lookup (worst-case O(n) from hash-collision handling), not this object's real get()/dequeue semantics.",
    "copy": "costed as a shallow copy (O(n)), which understates the real cost if this is copy.deepcopy() on a nested structure.",
    "join": "costed as a string join (O(n)); may not reflect what this particular join() is actually doing (e.g. os.path.join()).",
    "split": "costed as a string split (O(n)); may not reflect what this particular split() is actually doing.",
    "pop": "costed as a worst-case O(n) list/dict pop, which may not match this object's real removal cost.",
    "index": "costed as a linear O(n) search, which may not match what this index() call is actually doing.",
    "add": "costed as an O(1) set insertion; correct if this really is set.add(), coincidental otherwise.",
    "insert": "costed as an O(n) list insert; may not match this object's real insertion cost.",
    "clear": "costed as an O(1) container clear; usually fine, but not a verified match for every object with a clear() method.",
    "find": "costed as an O(n) string scan; may not match what this find() call is actually doing.",
    "count": "costed as an O(n) scan; may not match what this count() call is actually doing.",
}
NAME_COLLISION_KEYS = set(NAME_COLLISION_NOTES.keys())


def _imported_modules(tree):
    """Returns {top_level_module_name: set_of_imported_names}."""
    modules = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                modules.setdefault(top, set())
        elif isinstance(node, ast.ImportFrom):
            if not node.module:
                continue
            top = node.module.split(".")[0]
            names = modules.setdefault(top, set())
            for alias in node.names:
                names.add(alias.name)
    return modules


def _used_names(tree):
    """Bare names referenced anywhere in the tree, via `.attr` or a plain
    Name (covers both `module.func(...)` and `from module import func`)."""
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.Name):
            names.add(node.id)
    return names


def _out_of_scope_constructor_names(imported):
    """
    Names that, when called (e.g. `Queue()`, `queue.Queue()`), produce an
    object originating from a module the engine doesn't understand. Used
    to trace which local variables hold such an object, so a later
    `.get()`/`.copy()`/etc. call on that variable can be flagged as a
    likely collision rather than just a generic default.
    """
    out_of_scope = set()
    for module, names in imported.items():
        if module in FULLY_SUPPORTED_MODULES or module in PARTIAL_SUPPORT or module in KNOWN_SAFE_MODULES:
            continue
        out_of_scope.add(module)
        out_of_scope |= names
    return out_of_scope


def _find_collisions(tree, imported):
    """
    Best-effort trace: `var = SomeOutOfScopeThing(...)` followed later by
    `var.<collision-name>(...)`. Deliberately simple (no real type
    inference) -- it only catches the direct-assignment case, not
    aliasing, reassignment, or objects passed through function calls, so
    it will under-report rather than cry wolf.
    """
    collisions = {}  # module -> set of collision method names hit
    try:
        out_of_scope_ctors = _out_of_scope_constructor_names(imported)
        if not out_of_scope_ctors:
            return collisions

        origin_module = {}
        for module, names in imported.items():
            if module in out_of_scope_ctors:
                origin_module[module] = module
            for n in names:
                origin_module[n] = module

        var_origin = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                mod = None
                func = node.value.func
                if isinstance(func, ast.Name):
                    ctor_name = func.id
                    if ctor_name in out_of_scope_ctors:
                        mod = origin_module.get(ctor_name, ctor_name)
                elif isinstance(func, ast.Attribute):
                    # `module.Ctor(...)` (e.g. `queue.Queue()`) -- the
                    # object being constructed is whatever `func.value`
                    # resolves to, not the attribute name itself, so check
                    # the base name against out-of-scope modules directly
                    # rather than requiring `Ctor` to have been imported by
                    # name via `from module import Ctor`.
                    if isinstance(func.value, ast.Name) and func.value.id in out_of_scope_ctors:
                        mod = origin_module.get(func.value.id, func.value.id)
                    elif func.attr in out_of_scope_ctors:
                        mod = origin_module.get(func.attr, func.attr)
                if mod is not None:
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            var_origin[target.id] = mod

        if not var_origin:
            return collisions

        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                obj = node.func.value
                method = node.func.attr
                if isinstance(obj, ast.Name) and obj.id in var_origin and method in NAME_COLLISION_KEYS:
                    mod = var_origin[obj.id]
                    collisions.setdefault(mod, set()).add(method)
    except Exception:
        return {}
    return collisions


def detect_scope_issues(source_code, tree=None):
    """
    Returns a list of warning dicts:
      {"severity": "unsupported" | "partial" | "collision", "module": str, "message": str}

    Never raises -- any failure here just means no warnings are reported,
    it must not interfere with analysis or conversion.
    """
    warnings = []
    try:
        if tree is None:
            tree = ast.parse(source_code)

        imported = _imported_modules(tree)
        if not imported:
            return warnings

        used_names = None  # computed lazily, only if a partial-support module is imported
        collisions = _find_collisions(tree, imported)

        for module, imported_names in imported.items():
            if module in FULLY_SUPPORTED_MODULES or module in KNOWN_SAFE_MODULES:
                continue

            if module in PARTIAL_SUPPORT:
                if used_names is None:
                    used_names = _used_names(tree)
                gaps = PARTIAL_SUPPORT[module]["gaps"]
                hit = gaps & used_names
                if hit:
                    warnings.append({
                        "severity": "partial",
                        "module": module,
                        "message": (
                            f"'{module}' is partially supported. "
                            f"{PARTIAL_SUPPORT[module]['note']} "
                            f"This code uses: {', '.join(sorted(hit))}."
                        ),
                    })
                continue

            # Anything else imported is a module the engine has no cost
            # entries for at all -- every call from it defaults to O(1)
            # unless a name-collision hit below applies instead.
            tailored = KNOWN_UNSUPPORTED_MODULES.get(module)
            base_message = (
                f"'{module}' is not recognized by the complexity analyzer. "
                + (tailored if tailored else "Calls into it default to O(1) rather than being flagged as unknown.")
            )
            warnings.append({
                "severity": "unsupported",
                "module": module,
                "message": base_message,
            })

            hit_methods = collisions.get(module)
            if hit_methods:
                for method in sorted(hit_methods):
                    warnings.append({
                        "severity": "collision",
                        "module": module,
                        "message": (
                            f"'{module}' code calls .{method}(), which shares a name with a rule the "
                            f"analyzer already has for something else -- it's {NAME_COLLISION_NOTES[method]}"
                        ),
                    })
    except Exception:
        return []

    return warnings


# ---------------------------------------------------------------------------
# Undefined-name detection (NameError before the code is even run)
# ---------------------------------------------------------------------------
import builtins as _builtins

_ALWAYS_DEFINED = {
    "__name__", "__file__", "__doc__", "__builtins__", "__package__",
    "__spec__", "__loader__", "__debug__",
}


def detect_name_errors(source_code, tree=None, limit=10):
    """
    Names that are read but never bound anywhere in the program -- a typo, a
    forgotten variable, or a call to a function that doesn't exist. Python
    parses such code fine and only fails when it runs, so without this the
    analyzer happily reports a complexity for code that can't work.

    Deliberately conservative, because a hit hides the complexity result:
    scope-insensitive (a name counts as defined if it is bound *anywhere* in
    the file, in any scope), and it bows out entirely when the program uses
    `from x import *`, `exec`, `eval`, `globals()` or `locals()`, which can
    create names this check cannot see.

    Returns [{"line": int, "message": "NameError: ...", "blocking": True}].
    """
    try:
        if tree is None:
            tree = ast.parse(source_code)
    except Exception:
        return []

    bound = set(dir(_builtins)) | _ALWAYS_DEFINED
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bound.add(node.id)
        elif isinstance(node, ast.arg):
            bound.add(node.arg)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bound.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                if alias.name == "*":
                    return []
                bound.add((alias.asname or alias.name).split(".")[0])
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            bound.update(node.names)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bound.add(node.name)
        elif isinstance(node, ast.MatchAs) if hasattr(ast, "MatchAs") else False:
            if node.name:
                bound.add(node.name)
        elif hasattr(ast, "MatchStar") and isinstance(node, ast.MatchStar):
            if node.name:
                bound.add(node.name)
        elif hasattr(ast, "MatchMapping") and isinstance(node, ast.MatchMapping):
            if node.rest:
                bound.add(node.rest)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id in ("exec", "eval", "globals", "locals", "vars", "setattr"):
            return []

    errors, seen = [], set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id not in bound:
            key = (node.id, node.lineno)
            if key in seen:
                continue
            seen.add(key)
            errors.append({
                "line": node.lineno,
                "message": f"NameError: name '{node.id}' is not defined",
                "blocking": True,
            })
    errors.sort(key=lambda e: e["line"])
    return errors[:limit]


# ---------------------------------------------------------------------------
# Static "this will crash when run" detection
# ---------------------------------------------------------------------------
# Name the Blockly generators emit for a value socket that has nothing plugged
# into it. (See BlocklyWorkspace.jsx: emptySocket(). It used to be silently
# replaced by a literal 0, which made a missing/undeclared `n` look like
# `range(0)`.) Reading it raises NameError, so it is reported like any other
# undefined name, just with a clearer hint on the front end.
EMPTY_SOCKET_NAME = "__empty_socket__"

_EXIT_CALLS = {"exit", "quit", "_exit"}
_SAFE_SEQ_CONSUMERS = {
    "len", "print", "sum", "max", "min", "sorted", "list", "tuple", "str",
    "any", "all", "reversed", "enumerate", "set", "repr", "range",
}


def _is_exit_call(stmt):
    if not isinstance(stmt, ast.Expr) or not isinstance(stmt.value, ast.Call):
        return False
    f = stmt.value.func
    if isinstance(f, ast.Name):
        return f.id in _EXIT_CALLS
    return isinstance(f, ast.Attribute) and f.attr in _EXIT_CALLS


def _top_level_never_returns(stmt):
    """True when execution cannot continue past this top-level statement."""
    if isinstance(stmt, ast.Raise) or _is_exit_call(stmt):
        return True
    if isinstance(stmt, ast.While) and isinstance(stmt.test, ast.Constant) and stmt.test.value:
        # `while True:` with no break / return / raise / exit anywhere inside
        for n in ast.walk(stmt):
            if isinstance(n, (ast.Break, ast.Return, ast.Raise)):
                return False
            if isinstance(n, ast.Expr) and _is_exit_call(n):
                return False
        return True
    return False


def _build_parents(tree):
    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
    return parents


def _store_counts(tree):
    """How many times each name is bound anywhere in the file. A name bound
    exactly once to a literal always holds that literal when it is read."""
    counts = {}

    def bump(name, n=1):
        counts[name] = counts.get(name, 0) + n

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bump(node.id)
        elif isinstance(node, ast.arg):
            bump(node.arg, 2)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bump(node.name, 2)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bump((alias.asname or alias.name).split(".")[0], 2)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            for nm in node.names:
                bump(nm, 2)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bump(node.name, 2)
    return counts


def _literal_kind(node):
    """'int' | 'float' | 'str' | 'list' | 'tuple' for plain literals, else None."""
    if isinstance(node, ast.Constant):
        v = node.value
        if isinstance(v, bool) or isinstance(v, int):
            return "int"
        if isinstance(v, float):
            return "float"
        if isinstance(v, str):
            return "str"
        return None
    if isinstance(node, ast.JoinedStr):
        return "str"
    if isinstance(node, ast.List):
        return "list"
    if isinstance(node, ast.Tuple):
        return "tuple"
    return None


def detect_static_runtime_errors(source_code, tree=None):
    """
    Errors Python only raises when the code RUNS, found while the learner is
    still typing: `10 / 0`, `a[10]` on a 3-item list, `'a' + 1`, `int('abc')`.

    Deliberately very conservative, because a hit hides the complexity result
    (same contract as detect_name_errors):
      - only straight-line, top-level statements are inspected (nothing inside
        an if / loop / try / function, where a guard or handler may make the
        line unreachable or intentional);
      - sub-expressions that may not run (`and`/`or`, `x if c else y`,
        lambdas, comprehensions) are skipped;
      - a value is only trusted when it is a literal, or a name bound exactly
        once in the whole file to a literal;
      - sequence lengths are only trusted when the sequence is never mutated
        (no methods called on it, no item assignment, not handed to a user
        function);
      - scanning stops at `exit()` / `raise` / an endless `while True`;
      - only the FIRST problem is reported, because that is where the program
        would really stop.

    Returns [{"line", "message", "blocking": True}] (0 or 1 entries). Messages
    use Python's own wording so errorTranslator.js explains them.
    """
    try:
        if tree is None:
            tree = ast.parse(source_code)
    except Exception:
        return []
    try:
        return _detect_static_runtime_errors(tree)
    except Exception:
        return []   # additive check: never take the analyzer down


def _detect_static_runtime_errors(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id in ("exec", "eval", "globals", "locals", "vars", "setattr"):
            return []
        if isinstance(node, ast.ImportFrom) and any(a.name == "*" for a in node.names):
            return []

    parents = _build_parents(tree)
    stores = _store_counts(tree)

    consts = {}   # name -> literal node (bound exactly once)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) \
                and stores.get(node.targets[0].id) == 1 \
                and _literal_kind(node.value) is not None:
            consts[node.targets[0].id] = node.value

    def resolve(node):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in consts:
            return consts[node.id]
        return node

    def kind_of(node):
        return _literal_kind(resolve(node))

    def seq_safe(name):
        """Every read of `name` is a plain, non-mutating use."""
        for n in ast.walk(tree):
            if isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, ast.Load):
                p = parents.get(n)
                if isinstance(p, ast.Subscript) and p.value is n and isinstance(p.ctx, ast.Load):
                    continue
                if isinstance(p, ast.Call) and n in p.args and isinstance(p.func, ast.Name) \
                        and p.func.id in _SAFE_SEQ_CONSUMERS:
                    continue
                if isinstance(p, (ast.For, ast.Compare)) and getattr(p, "iter", None) is n:
                    continue
                if isinstance(p, ast.Compare):
                    continue
                return False
        return True

    def seq_len(node):
        base = resolve(node)
        if isinstance(node, ast.Name) and node.id in consts and not seq_safe(node.id):
            return None, None
        k = _literal_kind(base)
        if k == "str":
            if isinstance(base, ast.Constant):
                return len(base.value), "string"
            return None, None
        if k in ("list", "tuple"):
            if any(isinstance(e, ast.Starred) for e in base.elts):
                return None, None
            return len(base.elts), k
        return None, None

    def is_zero(node):
        r = resolve(node)
        return isinstance(r, ast.Constant) and not isinstance(r.value, (str, bytes)) \
            and r.value is not None and r.value == 0

    _OPSYM = {ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/",
              ast.FloorDiv: "//", ast.Mod: "%", ast.Pow: "**"}

    def check(node):
        """Return a message if evaluating `node` itself is certain to raise."""
        if isinstance(node, ast.BinOp):
            lk, rk = kind_of(node.left), kind_of(node.right)
            op = type(node.op)
            if op in (ast.Div, ast.FloorDiv, ast.Mod) and is_zero(node.right) and lk != "str":
                return "ZeroDivisionError: division by zero"
            sym = _OPSYM.get(op)
            if sym and lk and rk:
                num = ("int", "float")
                if op is ast.Add:
                    if lk == "str" and rk in num:
                        return f"TypeError: can only concatenate str (not \"{rk}\") to str"
                    if lk in num and rk == "str":
                        return f"TypeError: unsupported operand type(s) for +: '{lk}' and 'str'"
                    if lk == "list" and rk in num + ("str",):
                        return f"TypeError: can only concatenate list (not \"{rk}\") to list"
                elif op is ast.Mult:
                    if lk == "str" and rk == "str":
                        return "TypeError: can't multiply sequence by non-int of type 'str'"
                elif op is ast.Mod:
                    pass   # str % x is string formatting
                elif "str" in (lk, rk):
                    return f"TypeError: unsupported operand type(s) for {sym}: '{lk}' and '{rk}'"
        elif isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Load):
            idx = node.slice
            if isinstance(idx, ast.UnaryOp) and isinstance(idx.op, ast.USub) \
                    and isinstance(idx.operand, ast.Constant) and isinstance(idx.operand.value, int):
                ival = -idx.operand.value
            elif isinstance(idx, ast.Constant) and type(idx.value) is int:
                ival = idx.value
            else:
                return None
            n, what = seq_len(node.value)
            if n is not None and not (-n <= ival < n):
                return f"IndexError: {what} index out of range"
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id == "int" and len(node.args) == 1 and not node.keywords:
            r = resolve(node.args[0])
            if isinstance(r, ast.Constant) and isinstance(r.value, str) and len(r.value) < 200:
                try:
                    int(r.value)
                except ValueError:
                    return f"ValueError: invalid literal for int() with base 10: {r.value!r}"
        return None

    def scan(node):
        """First certain error in evaluation order, skipping maybe-not-run code."""
        if isinstance(node, (ast.BoolOp, ast.IfExp, ast.Lambda, ast.ListComp, ast.SetComp,
                             ast.DictComp, ast.GeneratorExp)):
            return None
        for child in ast.iter_child_nodes(node):
            hit = scan(child)
            if hit:
                return hit
        msg = check(node)
        if msg:
            return {"line": getattr(node, "lineno", 1), "message": msg, "blocking": True}
        return None

    for stmt in tree.body:
        if isinstance(stmt, (ast.Expr, ast.Assign, ast.AugAssign, ast.AnnAssign)):
            hit = scan(stmt)
            if hit:
                return [hit]
        if _top_level_never_returns(stmt):
            break
    return []
