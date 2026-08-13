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
    known gap within it (e.g. `random.shuffle`, which the engine treats
    as O(1) but is actually O(n)).
  - "collision": the engine didn't just default -- it confidently
    borrowed an unrelated cost rule because a method name happens to
    match a key in builtin_complexities (e.g. Queue.get() costed as a
    dict lookup, or copy.deepcopy() costed as a shallow copy). This is
    the most misleading case, since the badge looks deliberate rather
    than defaulted.
"""
import ast

# Modules whose in-scope operations are (close to) fully and correctly
# mapped in ComplexityAnalyzer.builtin_complexities.
FULLY_SUPPORTED_MODULES = {"heapq", "bisect"}

# Modules that ARE in scope, but only partially: some of their names are
# costed correctly, and some silently default to O(1) or borrow the wrong
# rule. `gaps` lists the attribute/function names known to be uncovered.
PARTIAL_SUPPORT = {
    "collections": {
        "gaps": {"most_common", "rotate", "maxlen"},
        "note": "deque/Counter/defaultdict/OrderedDict creation is costed, but methods like most_common() or rotate() default to O(1).",
    },
    "math": {
        "gaps": {"log", "log2", "log10", "factorial", "floor", "ceil", "isqrt", "comb", "perm"},
        "note": "sqrt/gcd/pow are costed; log, factorial, floor, ceil, comb, and perm default to O(1) (correct by coincidence for a couple of these, not by design).",
    },
    "functools": {
        "gaps": {"reduce", "partial", "cmp_to_key"},
        "note": "lru_cache/cache are recognized as memoization; reduce(), partial(), and cmp_to_key() are not costed and default to O(1) regardless of iterable size.",
    },
    "itertools": {
        "gaps": {"product", "chain", "groupby", "islice", "accumulate", "zip_longest", "count", "cycle"},
        "note": "permutations/combinations are only costed when used directly as a for-loop's iterable; everything else in this module defaults to O(1), and permutations/combinations used outside a loop header also default to O(1).",
    },
    "random": {
        "gaps": {"randint", "choice", "shuffle", "sample", "randrange", "uniform", "gauss"},
        "note": "Nothing in this module is costed. shuffle() and sample() in particular default to O(1) when they're actually O(n).",
    },
    "statistics": {
        "gaps": {"mean", "median", "median_low", "median_high", "stdev", "pstdev", "variance", "pvariance", "mode"},
        "note": "Nothing in this module is costed; every function here defaults to O(1) regardless of input size.",
    },
}

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
                ctor_name = None
                func = node.value.func
                if isinstance(func, ast.Name):
                    ctor_name = func.id
                elif isinstance(func, ast.Attribute):
                    ctor_name = func.attr
                if ctor_name in out_of_scope_ctors:
                    mod = origin_module.get(ctor_name, ctor_name)
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
