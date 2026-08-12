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

Two tiers:
  - "unsupported": a module was imported that the engine has no cost
    entries for at all. Every call from it will default to O(1)/O(n)
    guesses that are little better than a coin flip.
  - "partial": a module IS in scope, but the specific name used is a
    known gap within it (e.g. `random.shuffle`, which the engine treats
    as O(1) but is actually O(n)).

Both tiers also cover the "name collision" case flagged separately:
a name from an out-of-scope module happening to match a builtin_complexities
key (e.g. Queue.get() colliding with dict.get()) and getting silently
costed under the wrong rule. Those are folded into the "unsupported"
warning for the owning module rather than enumerated individually, since
the risk is the same: don't trust the badge for this code without checking.
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
        "gaps": {"log", "log2", "log10", "factorial", "floor", "ceil"},
        "note": "sqrt/gcd/pow are costed; log, factorial, floor, and ceil default to O(1) (correct by coincidence for these, not by design).",
    },
    "functools": {
        "gaps": {"reduce"},
        "note": "lru_cache/cache are recognized as memoization; reduce() is not costed and defaults to O(1) regardless of iterable size.",
    },
    "itertools": {
        "gaps": {"product", "chain", "groupby", "islice"},
        "note": "permutations/combinations are only costed when used directly as a for-loop's iterable; product, chain, groupby, and islice default to O(1), and permutations/combinations used outside a loop header also default to O(1).",
    },
    "random": {
        "gaps": {"randint", "choice", "shuffle", "sample", "randrange"},
        "note": "Nothing in this module is costed. shuffle() in particular defaults to O(1) when it is actually O(n).",
    },
    "statistics": {
        "gaps": {"mean", "median", "median_low", "median_high", "stdev", "pstdev", "variance", "pvariance"},
        "note": "Nothing in this module is costed; every function here defaults to O(1) regardless of input size.",
    },
}

# Modules whose usage is essentially constant-time / metadata-only in
# typical student code (attribute lookups like string.ascii_letters), so
# flagging them as "unsupported" would be a false alarm more often than not.
KNOWN_SAFE_MODULES = {"string", "typing", "__future__", "dataclasses", "enum", "abc"}

_ALL_IN_SCOPE_MODULES = FULLY_SUPPORTED_MODULES | set(PARTIAL_SUPPORT.keys())


def _imported_modules(tree):
    """Returns {top_level_module_name: set_of_imported_names_or_None}."""
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


def detect_scope_issues(source_code, tree=None):
    """
    Returns a list of warning dicts:
      {"severity": "unsupported" | "partial", "module": str, "message": str}

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
            # (or, worse, silently borrows an unrelated rule if a method
            # name happens to collide with one in builtin_complexities).
            warnings.append({
                "severity": "unsupported",
                "module": module,
                "message": (
                    f"'{module}' is not recognized by the complexity analyzer. "
                    f"Calls into it will default to O(1) (or, if a method name happens to "
                    f"match a different built-in operation, may be costed under the wrong rule "
                    f"entirely) rather than being flagged as unknown."
                ),
            })
    except Exception:
        return []

    return warnings
