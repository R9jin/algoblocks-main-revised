"""
logic_lint.py -- Static "this will run, but it's wrong" bug detector.

Why this exists: `analyze_source_code`'s AST walk figures out complexity,
and the Pyodide-side `gather_custom_lint_errors` helper (see
analyzer.worker.js) catches things Python's own parser would reject
(unmatched brackets, a missing `:`). Neither of those layers -- nor
Pyodide's actual runtime traceback, once the code is run -- ever sees a
whole class of student bugs: code that is syntactically valid AND raises
no exception, but is semantically wrong.

The canonical example is `if len(arr) == []:` intended to mean "arr is
empty". It never raises, it never crashes -- `len(arr)` is always an int,
`[]` is a list, `int == list` is simply always False in Python -- so the
"is this empty?" check silently never fires and the bug ships. There is
no traceback to translate for this, because nothing ever goes wrong at
the interpreter level; the mistake only exists in the gap between what
the code says and what the student meant.

This module is a small, deliberately conservative set of AST pattern
checks for exactly that category: things that parse fine, run fine, and
are still almost certainly not what the author meant. It is intentionally
narrow (false positives are worse than missed detections for a learning
tool) and, like scope_detector.py, purely additive -- it never changes a
complexity classification, it only reports what it noticed.

Returned warnings share the same {line, message} shape scope_detector.py
and the Pyodide error-list glue already use, so callers can merge them
straight into an existing error/warning list. Each `message` is prefixed
with "LogicWarning: " so errorTranslator.js (frontend/src/utils/
errorTranslator.js) can recognize these as already-written, human-facing
explanations and pass them through as-is instead of trying to pattern-
match them as a raw Python exception string.
"""
import ast

_CONTAINER_TYPE_NAME = {
    ast.List: "list",
    ast.Dict: "dictionary",
    ast.Set: "set",
}

_EMPTY_HINT = {
    ast.List: "`== 0` or the truthy check `not arr`",
    ast.Dict: "`== 0` or the truthy check `not my_dict`",
    ast.Set: "`== 0` or the truthy check `not my_set`",
}


def _is_len_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and not node.keywords
    )


def _container_literal_kind(node):
    for node_type in (ast.List, ast.Dict, ast.Set):
        if isinstance(node, node_type):
            return node_type
    return None


def _is_empty_literal(node, node_type):
    if node_type is ast.List:
        return len(node.elts) == 0
    if node_type is ast.Dict:
        return len(node.keys) == 0
    if node_type is ast.Set:
        # ast.Set has no literal spelling for "empty" in real Python source
        # (`{}` parses as an empty dict), so this branch is unreachable in
        # practice; kept only so the type is handled explicitly rather than
        # falling through silently.
        return False
    return False


def _check_len_vs_container_literal(node, warnings):
    """`len(x) == []` (or `!=`, or dict/set literals): comparing a number
    to a container can never be True, so the check silently never does
    what it looks like it's meant to do."""
    if not isinstance(node, ast.Compare) or len(node.ops) != 1:
        return
    op = node.ops[0]
    if not isinstance(op, (ast.Eq, ast.NotEq)):
        return

    left, right = node.left, node.comparators[0]
    len_side = left if _is_len_call(left) else (right if _is_len_call(right) else None)
    other_side = right if len_side is left else left
    if len_side is None:
        return

    node_type = _container_literal_kind(other_side)
    if node_type is None:
        return

    kind = _CONTAINER_TYPE_NAME[node_type]
    empty = _is_empty_literal(other_side, node_type)
    if empty:
        hint = _EMPTY_HINT[node_type]
        message = (
            f"Comparing `len(...)` (always a number) to an empty {kind} literal "
            f"with `{'==' if isinstance(op, ast.Eq) else '!='}` will never do what it looks "
            f"like it's meant to -- a number can never equal a {kind}, so this condition is "
            f"always {'False' if isinstance(op, ast.Eq) else 'True'} no matter what the "
            f"argument actually contains. If the goal is to check for an empty container, "
            f"compare the length to {hint} instead."
        )
    else:
        message = (
            f"Comparing `len(...)` (always a number) to a {kind} literal with "
            f"`{'==' if isinstance(op, ast.Eq) else '!='}` can never be true -- a number can "
            f"never equal a {kind}. Double-check whether you meant to compare against a "
            f"number (like the {kind}'s length) instead of the {kind} itself."
        )
    warnings.append({"line": getattr(node, "lineno", 1), "message": f"LogicWarning: {message}"})


def _check_mutable_default_arg(node, warnings):
    """`def f(items=[])` -- the default is created ONCE, when the function
    is defined, and every call that doesn't pass `items` explicitly shares
    and mutates that same list/dict/set across calls."""
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return
    defaults = list(node.args.defaults) + list(node.args.kw_defaults)
    for default in defaults:
        if default is None:
            continue
        node_type = _container_literal_kind(default)
        if node_type is None:
            continue
        kind = _CONTAINER_TYPE_NAME[node_type]
        message = (
            f"Mutable default argument: this default {kind} is created once, when `{node.name}` "
            f"is defined, not fresh on every call. Any call that doesn't pass this argument "
            f"explicitly reuses -- and can silently mutate -- that same {kind} on every future "
            f"call, which usually shows up as leftover data from a previous call appearing out "
            f"of nowhere. Use `None` as the default and create a new {kind} inside the function "
            f"body instead (`if items is None: items = {'[]' if node_type is ast.List else ('{}' if node_type is ast.Dict else 'set()')}`)."
        )
        warnings.append({"line": getattr(default, "lineno", node.lineno), "message": f"LogicWarning: {message}"})


def _check_bare_except(node, warnings):
    """`except:` with no exception type -- catches everything, including
    typos (NameError) and Ctrl-C, and hides the real error instead of
    surfacing it."""
    if not isinstance(node, ast.ExceptHandler):
        return
    if node.type is not None:
        return
    message = (
        "Bare `except:` catches every possible error -- including ones you didn't anticipate, "
        "like a typo'd variable name -- and silently swallows them, which can hide a real bug "
        "behind seemingly-correct output. Name the specific exception you expect (e.g. "
        "`except ValueError:` or `except (KeyError, IndexError):`) so unrelated bugs still "
        "surface instead of disappearing."
    )
    warnings.append({"line": getattr(node, "lineno", 1), "message": f"LogicWarning: {message}"})


# One entry per top-level AST node type this module knows how to inspect.
# `detect_logic_issues` walks the tree once and dispatches each visited
# node through every checker below; each checker is responsible for
# filtering to the node type(s) it actually cares about.
_CHECKS = (
    _check_len_vs_container_literal,
    _check_mutable_default_arg,
    _check_bare_except,
)


def detect_logic_issues(source_code, tree=None):
    """Returns a list of {"line": int, "message": str} warnings for
    syntactically-valid, exception-free code that is still very likely
    wrong. Safe to call on any parseable source; returns [] on anything
    that fails to parse (that case is already reported elsewhere as a
    real syntax error) or if the caller passes source_code=None.
    """
    if tree is None:
        if not source_code:
            return []
        try:
            tree = ast.parse(source_code)
        except SyntaxError:
            return []

    warnings = []
    try:
        for node in ast.walk(tree):
            for check in _CHECKS:
                check(node, warnings)
    except Exception:
        # This module only ever adds extra, non-essential warnings on top
        # of the real analysis -- if a pattern check trips on some AST
        # shape it didn't anticipate, fail quietly rather than take the
        # whole analyzer down with it.
        return []

    warnings.sort(key=lambda w: w["line"])
    return warnings
