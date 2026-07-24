"""
Code Preprocessor

Source sanitization and lightweight AST-walking utilities used before
and during static analysis (Py2->Py3 patching, safe iterative AST walk,
constant/name-pattern extraction).
Part of the AST-Based Static Complexity Engine (see analyzer.py for the
composed ComplexityAnalyzer entry point). Split out of the former
monolithic analyzer.py for maintainability.
"""
import ast
import re
from collections import deque, Counter

def extract_constant(node):
    if isinstance(node, ast.Constant): return node.value
    if getattr(ast, 'Num', None) and isinstance(node, ast.Num): return node.n
    if getattr(ast, 'Str', None) and isinstance(node, ast.Str): return node.s
    return None

# Whole-token identifier vocabulary used to detect memoization/DP/graph
# "visited" naming conventions. IMPORTANT: this must be matched against
# tokenized identifier PARTS (see _name_hints_memo_or_graph), never as a raw
# substring -- a bare `in` check would false-positive on any identifier that
# merely happens to contain these letters in sequence, e.g. "findPeakUtil"
# contains "dp", "endpoint" contains "dp", "revisited"/"provision" style
# words contain "visit"-adjacent runs, etc.
_MEMO_GRAPH_NAME_TOKENS = {
    "dp", "memo", "memoize", "memoized", "memoization",
    "cache", "cached", "caching",
    "visit", "visited", "visiting", "visitor",
}


def _name_hints_memo_or_graph(identifier):
    """
    True if `identifier`, split into its snake_case/camelCase word tokens,
    contains a whole token that's a memoization/DP/graph-visited naming
    convention (e.g. `dp`, `memo_table` -> "memo", `visited` -> "visited").
    Deliberately requires a full-token match rather than a substring match,
    so names like `findPeakUtil` (contains "dp" mid-word) or `endpoint`
    (also contains "dp") are correctly NOT treated as memoized/DP functions.
    """
    tokens = re.findall(r'[A-Za-z][a-z0-9]*', identifier)
    return any(t.lower() in _MEMO_GRAPH_NAME_TOKENS for t in tokens)


def _detect_factorial_branching(func_node):
    """
    Structural detector for "T(n) = n * T(n-1)"-style branching recursion
    (permutation/subsequence-style enumeration), which is asymptotically
    O(n!) -- as distinct from a recursive call sitting inside a loop with a
    fixed/constant branching factor, which multiplies out to a constant-base
    exponential O(b^n) (bucketed as O(2^n) by this engine's taxonomy).

    Previously this distinction was made purely by checking whether the
    function's own NAME contained "permutation"/"permute", which misses any
    equivalently-shaped recursion that isn't literally named that way (e.g.
    a helper called `generate`). Here we instead look for the actual
    structural signature: a `for` loop bounded by `range(len(X))` (X being
    one of the function's own parameters, or a local derived from one),
    whose body both (a) recursively calls this same function and (b)
    visibly removes/excludes one element from X (via `.remove(`, `.pop(`,
    or a slice-and-recombine like `x[:i] + x[i+1:]`) before passing it
    down. That shrink-by-one-per-branch pattern is what makes the branching
    factor equal to the (shrinking) remaining input size at every
    recursion depth -- the defining trait of factorial growth -- rather
    than a fixed constant multiplied out at every depth.
    """
    func_name = func_node.name
    param_names = {a.arg for a in func_node.args.args}

    def loop_bound_name(for_node):
        it = for_node.iter
        if isinstance(it, ast.Call) and getattr(getattr(it, 'func', None), 'id', '') == 'range' and it.args:
            last_arg = it.args[-1]
            if isinstance(last_arg, ast.Call) and getattr(getattr(last_arg, 'func', None), 'id', '') == 'len' and last_arg.args:
                base = last_arg.args[0]
                if isinstance(base, ast.Name):
                    return base.id
        return None

    def scan(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.For):
                bound_name = loop_bound_name(child)
                if bound_name:
                    derived_names = {bound_name} | param_names

                    # First pass: find any local variables that are just a
                    # copy of the base collection (e.g. `t = list(s).copy()`,
                    # `t = s[:]`), since the "remove one element" mutation
                    # typically happens on a fresh copy, not the original.
                    for sub in ast.walk(child):
                        if isinstance(sub, ast.Assign) and len(sub.targets) == 1 and isinstance(sub.targets[0], ast.Name):
                            tgt_name = sub.targets[0].id
                            val = sub.value
                            if isinstance(val, ast.Call) and getattr(getattr(val, 'func', None), 'attr', '') == 'copy':
                                val = getattr(val.func, 'value', val)
                            if isinstance(val, ast.Call) and getattr(getattr(val, 'func', None), 'id', '') in ('list', 'set', 'sorted') and val.args:
                                arg0 = val.args[0]
                                if isinstance(arg0, ast.Name) and arg0.id in derived_names:
                                    derived_names.add(tgt_name)
                            elif isinstance(val, ast.Name) and val.id in derived_names:
                                derived_names.add(tgt_name)
                            elif isinstance(val, ast.Subscript) and isinstance(getattr(val, 'value', None), ast.Name) and val.value.id in derived_names:
                                derived_names.add(tgt_name)

                    has_recursive_call = False
                    has_shrink_op = False
                    for sub in ast.walk(child):
                        if isinstance(sub, ast.Call):
                            fid = getattr(getattr(sub, 'func', None), 'id', None)
                            fattr = getattr(getattr(sub, 'func', None), 'attr', None)
                            fval = getattr(getattr(sub, 'func', None), 'value', None)
                            if fid == func_name:
                                has_recursive_call = True
                            if fattr in ('remove', 'pop') and isinstance(fval, ast.Name) and fval.id in derived_names:
                                has_shrink_op = True
                        if isinstance(sub, ast.BinOp) and isinstance(sub.op, ast.Add):
                            bin_names = {n.id for n in ast.walk(sub) if isinstance(n, ast.Name)}
                            if bin_names & derived_names:
                                has_shrink_op = True
                    if has_recursive_call and has_shrink_op:
                        return True
                if scan(child):
                    return True
            else:
                if scan(child):
                    return True
        return False

    try:
        return scan(func_node)
    except Exception:
        return False

def preprocess_source(source_code):
    """
    Sanitizes raw algorithms by seamlessly patching Python 2 legacy syntax 
    and common syntactical typos into valid Python 3 before AST parsing.
    """
    try:
        # Fix unescaped newlines in string literals that crash the AST
        source_code = re.sub(r"'\s*\n\s*'", r"'\\n'", source_code)
        source_code = re.sub(r'"\s*\n\s*"', r'"\\n"', source_code)
        
        source_code = re.sub(r'\bxrange\(', 'range(', source_code)
        
        def fix_print_comma(m):
            indent = m.group(1)
            content = m.group(2)
            end_arg = ", end=' '" if m.group(3) else ""
            return f"{indent}print({content}{end_arg})"

        source_code = re.sub(r'(?m)^(\s*)print\s+(?![\(\'\"])(.*?)(,?)\s*$', fix_print_comma, source_code)
        source_code = re.sub(r'(?m)^(\s*)print\s+("[^"]*"|\'[^\']*\')\s*,\s*(.*?)$', r'\1print(\2, \3)', source_code)
        
        def fix_generic_print(m):
            indent = m.group(1)
            content = m.group(2)
            if not content.startswith('('):
                return f"{indent}print({content})"
            return m.group(0)
            
        source_code = re.sub(r'(?m)^(\s*)print\s+([^\n]+?)\s*$', fix_generic_print, source_code)
        source_code = re.sub(r'(?m)^(\s*)print\s*$', r'\1print()', source_code)
        source_code = re.sub(r'(?m)^(\s*except\s+[a-zA-Z0-9_.]+)\s*,\s*([a-zA-Z0-9_]+)\s*:', r'\1 as \2:', source_code)
        source_code = re.sub(r'(?m)^(\s*)else\s+if\s+', r'\1elif ', source_code)
        source_code = source_code.replace('<>', '!=')
    except Exception:
        pass
    return source_code

def safe_walk(node):
    if isinstance(node, list):
        todo = deque(node)
    elif isinstance(node, ast.AST):
        todo = deque([node])
    else:
        return
    while todo:
        curr = todo.popleft()
        if isinstance(curr, ast.AST):
            yield curr
            for _, value in ast.iter_fields(curr):
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, ast.AST):
                            todo.append(item)
                elif isinstance(value, ast.AST):
                    todo.append(value)
