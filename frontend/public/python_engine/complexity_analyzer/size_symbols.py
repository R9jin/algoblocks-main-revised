"""
Size Symbols

Symbolic input-size tracking for theoretical (asymptotic) analysis.

In conventional algorithm analysis a loop bound is a *symbolic size* that grows toward
infinity, and two bounds are the SAME symbol only when they are the same quantity:

    for i in range(x):          # x is a size
        for j in range(y):      # y is a different size       -> O(n * m)
            ...

    def f(arr):
        n = len(arr)            # n and arr are the same size
        for i in range(n):
            for j in range(len(arr)):                        -> O(n^2)

The previous engine guessed the letter from the variable's NAME (m, cols, arr2 ... else n), so any
two differently-named variables such as x and y both collapsed to n. This module replaces the
guess with real identity tracking:

  * every function (and the module) is a scope with its own parameters, assignments, loop targets
  * `a = len(b)`, `a = b + 1`, `a = [0] * b`, `for i in range(b)` make a the SAME size as b
  * a size that is independent (a parameter, `x = 10`, `x = int(input())`) is its own symbol
  * a counter / index (`lo = 0` that is later updated, `i += 1`) is not a size of its own
  * `len(grid[0])` is the row length of grid -- a separate size from the number of rows
  * symbols are named n, m, k, p, q, r, ... (a variable literally named n/m/k/p/q keeps its letter)

Nothing here looks at runtime values: only the structure of the source is used.
"""
import ast
from collections import Counter

# Letters a student's own variable keeps when it is literally named that way.
CONVENTIONAL = ('n', 'm', 'k', 'p', 'q')
# Pool used for every other independent size, in order.
POOL = ('n', 'm', 'k', 'p', 'q', 'r', 's', 't', 'u', 'w', 'x', 'y', 'z')
# Names that are never a problem size (number of test cases, throw-away targets).
NOT_A_SIZE = {'t', 'tc', 'test', 'tests', 'testcases', '_'}
# Graph sizes keep their own (lower-case) letter; graph analysis reports them separately.
GRAPH_LETTERS = {'v', 'e'}
# Wrappers that preserve the size of their first argument.
_PASS_THROUGH = {
    'int', 'float', 'abs', 'len', 'list', 'set', 'tuple', 'sorted', 'reversed', 'enumerate', 'zip',
    'range', 'min', 'max', 'sum', 'str', 'dict', 'frozenset', 'round', 'bytes', 'bytearray',
    'deque', 'iter', 'map', 'filter', 'ceil', 'floor', 'sqrt', 'isqrt', 'log2', 'log',
}
_MODULE = '<module>'
_ALPHABET_TOKENS = ('CHARS', 'MAX_CHAR', 'ALPHABET', 'ASCII')


def is_alphabet_name(name):
    """MAX_CHAR = 26, NO_OF_CHARS = 256 ...: a fixed property of the character set, not an input size."""
    up = name.upper()
    return any(t in up for t in _ALPHABET_TOKENS)
# Parameters that are positions inside a collection, not a size.
INDEX_LIKE = {'i', 'j', 'idx', 'index', 'pos', 'start', 'end', 'lo', 'hi', 'low', 'high', 'left', 'right',
              'mid', 'l', 'curr', 'cur', 'level', 'depth', 'ind', 'first', 'last', 'begin', 'stop'}
# Parameters that conventionally carry the LENGTH of a collection passed next to them: f(arr, n).
_COUNT_NAMES = {'n', 'm', 'size', 'sz', 'length', 'len', 'count', 'cnt', 'num', 'number', 'total'}


def _count_like(name):
    low = name.lower()
    return (low in _COUNT_NAMES or low.startswith(('n_', 'num_', 'len_', 'size_', 'count_'))
            or low.endswith(('_n', '_len', '_length', '_size', '_count', '_num')))


def letter_rank(L):
    """Display order of size letters: n, m, k, p, q, r ... (graph letters last)."""
    return (POOL.index(L) if L in POOL else 50, L)


def _const_index(sub):
    sl = getattr(sub, 'slice', None)
    if isinstance(sl, ast.Index):  # Python < 3.9
        sl = sl.value
    return isinstance(sl, ast.Constant) and isinstance(sl.value, int)


class _OrderedSet(dict):
    """Set that remembers first-appearance order (so symbol letters follow the order a student wrote them)."""
    def add(self, x): self.setdefault(x, True)
    def __iter__(self): return dict.__iter__(self)


class _Scope:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.params = []
        self.alias = {}          # name -> source expression (first plain assignment)
        self.mutated = set()     # names updated with +=, -=, ... (counters)
        self.assigned = Counter()
        self.targets = {}        # loop target name -> [iter expressions]
        self.names = _OrderedSet()
        self.sources = set()     # names assigned once from a literal / input(): a sample size, not a built structure
        self.pair = {}           # length parameter -> the collection parameter it measures
        self.used = set()        # names read in this scope's own body


class SizeSymbols:
    def __init__(self, tree, is_constant_expr=None):
        self.scopes = {}
        self.loop_env = {}       # id(For node) -> (scope name, {target: iter expr of enclosing loops})
        self.is_constant_expr = is_constant_expr or (lambda e: isinstance(e, ast.Constant))
        self._letters = {}       # query scope -> {class key: letter}
        self._members = {}
        self.alt_terms = {}      # id(For node) -> extra additive terms of its bound: range(n + m)
        self._build(tree)

    # ------------------------------------------------------------------ prescan
    def _build(self, tree):
        mod = _Scope(_MODULE, None)
        self.scopes[_MODULE] = mod
        self._collect(tree, mod, {})
        for fn in ast.walk(tree):
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) and fn.name in self.scopes:
                self._pair_length_params(fn, self.scopes[fn.name])
                self._equal_length_guards(fn, self.scopes[fn.name])

    def _equal_length_guards(self, fn, sc):
        """`if len(a) != len(b): return ...` (or raise / exit) proves a and b have the same size."""
        def size_of(e):
            if isinstance(e, ast.Call) and getattr(e.func, 'id', '') == 'len' and e.args and isinstance(e.args[0], ast.Name):
                return e.args[0].id
            if isinstance(e, ast.Name) and e.id in sc.params:
                return e.id
            return None
        def leaves(body):
            return bool(body) and all(isinstance(x, (ast.Return, ast.Raise)) or (
                isinstance(x, ast.Expr) and isinstance(x.value, ast.Call) and getattr(x.value.func, 'id', '') in ('exit', 'quit', 'print'))
                for x in body)
        for st in fn.body:
            if isinstance(st, ast.If) and isinstance(st.test, ast.Compare) and len(st.test.ops) == 1 \
                    and isinstance(st.test.ops[0], ast.NotEq) and leaves(st.body) and not st.orelse:
                a, b = size_of(st.test.left), size_of(st.test.comparators[0])
                if a and b and a != b and b not in sc.alias:
                    sc.alias[b] = ast.Name(id=a, ctx=ast.Load())
                    sc.assigned[b] = max(sc.assigned[b], 1)

    def _pair_length_params(self, fn, sc):
        """f(arr, n): a length-like integer parameter measures the collection parameter next to it."""
        used_as_container = set()
        for node in ast.walk(fn):
            if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name): used_as_container.add(node.value.id)
            elif isinstance(node, (ast.For, ast.comprehension)) and isinstance(node.iter, ast.Name): used_as_container.add(node.iter.id)
            elif isinstance(node, ast.Call):
                if getattr(node.func, 'id', '') == 'len' and node.args and isinstance(node.args[0], ast.Name):
                    used_as_container.add(node.args[0].id)
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                    used_as_container.add(node.func.value.id)
        containers = [p for p in sc.params if p in used_as_container and p not in sc.alias]
        counts = [p for p in sc.params if p not in used_as_container and _count_like(p) and p not in sc.alias]
        for c, k in zip(containers, counts):
            sc.pair[k] = c

    def _collect(self, node, scope, env):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                sc = self.scopes.get(child.name)
                if sc is None:
                    sc = _Scope(child.name, scope)
                    self.scopes[child.name] = sc
                a = child.args
                for arg in list(a.posonlyargs) + list(a.args) + list(a.kwonlyargs):
                    sc.params.append(arg.arg)
                    sc.names.add(arg.arg)
                if a.vararg: sc.params.append(a.vararg.arg)
                self._collect(child, sc, {})
                continue
            if isinstance(child, ast.Lambda):
                continue
            if isinstance(child, ast.Name):
                scope.used.add(child.id)
            if isinstance(child, ast.Assign):
                self._note_assign(child, scope)
            elif isinstance(child, ast.AnnAssign) and child.value is not None and isinstance(child.target, ast.Name):
                self._set_alias(scope, child.target.id, child.value)
            elif isinstance(child, ast.AugAssign) and isinstance(child.target, ast.Name):
                scope.mutated.add(child.target.id)
                scope.names.add(child.target.id)
            if isinstance(child, (ast.For, ast.AsyncFor)):
                self.loop_env[id(child)] = (scope.name, dict(env))
                new_env = env
                for tgt in self._target_names(child.target):
                    scope.targets.setdefault(tgt, []).append(child.iter)
                    scope.names.add(tgt)
                    new_env = dict(new_env); new_env[tgt] = child.iter
                self._collect(child, scope, new_env)
                continue
            if isinstance(child, ast.While):
                self.loop_env[id(child)] = (scope.name, dict(env))
            self._collect(child, scope, env)

    @staticmethod
    def _target_names(t):
        if isinstance(t, ast.Name): return [t.id]
        if isinstance(t, (ast.Tuple, ast.List)):
            out = []
            for e in t.elts: out += SizeSymbols._target_names(e)
            return out
        return []

    def _note_assign(self, node, scope):
        for t in node.targets:
            if isinstance(t, ast.Name):
                self._set_alias(scope, t.id, node.value)
            elif isinstance(t, (ast.Tuple, ast.List)) and isinstance(node.value, (ast.Tuple, ast.List)) \
                    and len(t.elts) == len(node.value.elts):
                for a, b in zip(t.elts, node.value.elts):
                    if isinstance(a, ast.Name): self._set_alias(scope, a.id, b)

    def _set_alias(self, scope, name, value):
        scope.names.add(name)
        scope.assigned[name] += 1
        if self._is_sample_value(value):
            scope.sources.add(name)
        elif self._source_name(value, scope) and is_alphabet_name(self._source_name(value, scope)):
            scope.alias.setdefault(name, value)   # frequency = [0] * MAX_CHAR: same (fixed) alphabet size
            return
        if name in scope.alias or name in scope.params and scope.assigned[name] > 1:
            return
        if self._source_name(value, scope) is not None or self._is_input_call(value):
            scope.alias.setdefault(name, value)

    @staticmethod
    def _is_sample_value(e):
        """`n = 10`, `data = [3, 1, 2]`, `s = "abc"`, `n = int(input())`: a sample of the input."""
        if isinstance(e, ast.Constant): return not isinstance(e.value, bool) and e.value is not None
        if isinstance(e, (ast.List, ast.Tuple, ast.Set)): return len(e.elts) > 0
        if isinstance(e, ast.Dict): return len(e.keys) > 0
        if isinstance(e, ast.UnaryOp) and isinstance(e.operand, ast.Constant): return True
        return SizeSymbols._is_input_call(e)

    @staticmethod
    def _is_input_call(e):
        return isinstance(e, ast.Call) and getattr(e.func, 'id', '') in ('input',) or (
            isinstance(e, ast.Call) and e.args and SizeSymbols._is_input_call(e.args[0]))

    # ------------------------------------------------------------------ source of an expression
    def _source_name(self, e, scope, env=None):
        """Name (or 'x[0]' for the row length of x) whose size `e` is measured in, or None."""
        env = env or {}
        if isinstance(e, ast.Name):
            return e.id
        if isinstance(e, ast.Constant):
            return None
        if isinstance(e, ast.Subscript):
            return self._source_name(e.value, scope, env)
        if isinstance(e, ast.Attribute):
            return None
        if isinstance(e, ast.UnaryOp):
            return self._source_name(e.operand, scope, env)
        if isinstance(e, ast.BinOp):
            l = self._source_name(e.left, scope, env)
            r = self._source_name(e.right, scope, env)
            if isinstance(e.op, (ast.Mult, ast.Add, ast.Sub)) and isinstance(e.left, (ast.List, ast.Constant)):
                return r if r is not None else l
            return l if l is not None else r
        if isinstance(e, ast.Call):
            fid = getattr(e.func, 'id', getattr(e.func, 'attr', ''))
            if fid == 'len' and e.args:
                a = e.args[0]
                if isinstance(a, ast.Subscript) and _const_index(a):
                    b = self._source_name(a.value, scope, env)
                    return f"{b}[0]" if b else None
                return self._source_name(a, scope, env)
            if fid == 'input':
                return None
            if e.args:
                if fid in _PASS_THROUGH or True:
                    for a in e.args:
                        s = self._source_name(a, scope, env)
                        if s is not None: return s
            return None
        if isinstance(e, (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)):
            return self._source_name(e.generators[0].iter, scope, env)
        if isinstance(e, ast.IfExp):
            return self._source_name(e.body, scope, env)
        return None

    # ------------------------------------------------------------------ resolution
    def _lookup_scope(self, scope_name):
        return self.scopes.get(scope_name) or self.scopes[_MODULE]

    def _chain(self, sc):
        while sc is not None:
            yield sc
            sc = sc.parent

    def _root(self, name, scope_name, env=None, _seen=None):
        """Follow aliases to the name that actually carries the size; returns (root name, defining scope)."""
        sc0 = self._lookup_scope(scope_name)
        seen = _seen if _seen is not None else set()
        cur, cur_sc = name, sc0
        for _ in range(24):
            if (cur, cur_sc.name) in seen:
                break
            seen.add((cur, cur_sc.name))
            if '[' in cur:
                break
            if env and cur in env:
                nxt = self._source_name(env[cur], cur_sc, env)
                if nxt is not None and nxt != cur:
                    cur = nxt
                    continue
            owner = next((s for s in self._chain(cur_sc) if cur in s.names), cur_sc)
            if cur in owner.pair and cur not in owner.alias:
                cur, cur_sc = owner.pair[cur], owner
                continue
            if cur in owner.params:
                if cur in owner.alias and owner.assigned[cur] == 1 and cur not in owner.mutated:
                    pass  # n = len(arr) style re-binding of a parameter: follow it below
                else:
                    return cur, owner
            if cur in owner.alias and cur not in owner.mutated and owner.assigned[cur] == 1:
                src = self._source_name(owner.alias[cur], owner, env)
                if src is not None and src != cur:
                    cur, cur_sc = src, owner
                    continue
                return cur, owner
            if cur in owner.targets and cur not in owner.alias:
                srcs = {self._source_name(it, owner) for it in owner.targets[cur]}
                srcs.discard(None)
                if len(srcs) == 1:
                    src = next(iter(srcs))
                    if src != cur:
                        cur, cur_sc = src, owner
                        continue
                return cur, owner
            return cur, owner
        return cur, cur_sc

    def _is_counter(self, root, owner):
        """
        True when `root` is NOT an independent input size: an index/accumulator (`lo`, `i += 1`), a
        structure the algorithm builds itself (`result = []`, `count = [0] * 26`), or a loop variable.
        Such quantities are bounded by the input, so they count under the main size n.
        Independent sizes are: parameters, sample values (`n = 10`, `data = [3, 1, 2]`, `int(input())`)
        and names defined nowhere in the source (imported / global constants).
        """
        if root in owner.params:
            return root.lower() in INDEX_LIKE
        known = any(root in s.names for s in self._chain(owner))
        if not known:
            return False
        if root in owner.mutated or owner.assigned[root] > 1 or root in owner.targets:
            return True
        return root not in owner.sources

    def _members_of(self, qscope):
        if qscope in self._members: return self._members[qscope]
        sc = self._lookup_scope(qscope)
        groups = {}
        seen_names = set()
        chain = list(self._chain(sc))
        for depth, s in enumerate(chain):
            readers = chain[:depth]      # scopes nearer than s that could be reading s's names
            for nm in list(s.names):
                if nm in seen_names:
                    continue          # shadowed by a nearer scope (a parameter hides the driver code's n)
                if depth > 0 and not any(nm in r.used for r in readers):
                    continue          # an outer name this scope never reads (driver-code n, m) is not its size
                seen_names.add(nm)
                root, owner = self._root(nm, s.name)
                groups.setdefault((root, owner.name), set()).add(nm)
        self._members[qscope] = groups
        return groups

    def _eligible(self, root, owner):
        return ('[' not in root and not self._is_counter(root, owner) and root.lower() not in NOT_A_SIZE
                and not is_alphabet_name(root))

    def _global_letters(self):
        """Letters already given to module-owned symbols (shared by every scope that reads them)."""
        return self._letters.setdefault('__global__', {})

    def _letter_table(self, qscope):
        """
        Letters are handed out in the order a scope's loops first use a size, so the first size the code
        touches is n, the second m, then k, p, q ... A variable literally named n/N always keeps n, and
        m, k, p, q keep theirs only when the scope also has an n (so a lone matrix called M is still n).
        """
        if qscope in self._letters: return self._letters[qscope]
        glob = self._global_letters()
        table = {'__used__': set()}
        used = table['__used__']
        members_of = self._members_of(qscope)
        for key in members_of:                       # module symbols already lettered elsewhere
            if key[1] == _MODULE and key in glob:
                table[key] = glob[key]; used.add(glob[key])
        chain_names = [sc.name for sc in self._chain(self._lookup_scope(qscope))]
        rank = lambda key: (chain_names.index(key[1]) if key[1] in chain_names else 99, key[0])
        eligible = []
        for key, members in sorted(members_of.items(), key=lambda kv: rank(kv[0])):
            root, oname = key
            owner = self.scopes.get(oname) or self.scopes[_MODULE]
            if self._eligible(root, owner): eligible.append((key, members))
        n_keys = [k for k, m in eligible if any(x.lower() == 'n' for x in m)]
        for key, members in eligible:
            if key in table: continue
            names = {x.lower() for x in members}
            if 'n' in names and 'n' not in used:
                self._claim(table, key, 'n')
        if n_keys:
            for key, members in eligible:
                if key in table: continue
                for L in CONVENTIONAL[1:]:
                    if any(x.lower() == L for x in members) and L not in used:
                        self._claim(table, key, L); break
        self._letters[qscope] = table
        return table

    def _claim(self, table, key, letter):
        table[key] = letter
        table['__used__'].add(letter)
        if key[1] == _MODULE: self._global_letters()[key] = letter

    def _class_letter(self, root, owner, qscope):
        table = self._letter_table(qscope)
        key = (root, owner.name)
        if key in table: return table[key]
        used = table['__used__']
        glob = self._global_letters()
        avoid = used | (set(glob.values()) if owner.name == _MODULE else set())
        if owner.name == _MODULE and not any(x.lower() == 'n' for x in (self._members_of(qscope).get(key) or ())):
            # a program that has a variable literally named n keeps that letter for it
            if any(nm in ('n', 'N') for sc in self.scopes.values() for nm in sc.names): avoid.add('n')
        for L in POOL:
            if L not in avoid:
                self._claim(table, key, L)
                return L
        table[key] = 'n'
        return 'n'

    # ------------------------------------------------------------------ public API
    def letter_for(self, name, scope_name=None, env=None):
        """Symbol letter for a variable used as a size (None for names that are never a size)."""
        if not name: return 'n'
        scope_name = scope_name or _MODULE
        lower = name.lower()
        if lower in NOT_A_SIZE: return None
        if lower in GRAPH_LETTERS and len(name) == 1: return lower
        root, owner = self._root(name, scope_name, env)
        if is_alphabet_name(root): return None
        if '[' in root:
            return self._class_letter(root, owner if root.split('[')[0] in owner.names else self._lookup_scope(scope_name), scope_name)
        if root.lower() in NOT_A_SIZE: return None
        if self._is_counter(root, owner):
            return 'n'
        return self._class_letter(root, owner, scope_name)

    def loop_dims(self, node, scope_name=None):
        """
        Ordered size letters of a `for` loop's pass count, one per polynomial degree:
        range(n) -> ['n'];  range(n * m) -> ['n', 'm'];  range(x ** 2) -> ['n', 'n'];
        for v in arr -> ['n'].  Constant bounds give [].
        """
        sc_name, env = self.loop_env.get(id(node), (scope_name or _MODULE, {}))
        sc_name = scope_name or sc_name
        sc = self._lookup_scope(sc_name)
        it = node.iter
        if isinstance(it, ast.Call) and getattr(it.func, 'id', '') == 'range' and it.args:
            bound = it.args[0] if len(it.args) == 1 else it.args[1]
            mono = self._mono(bound, sc, sc_name, env)
            if isinstance(bound, ast.BinOp) and isinstance(bound.op, ast.Add):
                a = self._mono(bound.left, sc, sc_name, env); b = self._mono(bound.right, sc, sc_name, env)
                if a and b and a != b and sum(a.values()) == sum(b.values()):
                    other = b if mono == a else a
                    self.alt_terms[id(node)] = [L for L, k in sorted(other.items(), key=lambda kv: letter_rank(kv[0])) for _ in range(k)]
        else:
            nm = self._source_name(it, sc, env)
            L = self.letter_for(nm, sc_name, env) if nm else 'n'
            mono = Counter({L: 1}) if L else Counter()
        dims = []
        for L, k in sorted(mono.items(), key=lambda kv: letter_rank(kv[0])):
            dims += [L] * k
        return dims[:8]

    def bound_dims(self, expr, scope_name=None):
        sc = self._lookup_scope(scope_name or _MODULE)
        dims = []
        for L, k in sorted(self._mono(expr, sc, scope_name or _MODULE, {}).items(), key=lambda kv: letter_rank(kv[0])):
            dims += [L] * k
        return dims[:8]

    def _mono(self, e, sc, sname, env):
        """Dominant monomial (letter -> power) of a loop-bound expression."""
        if self.is_constant_expr(e): return Counter()
        if isinstance(e, ast.Name):
            L = self.letter_for(e.id, sname, env)
            return Counter({L: 1}) if L else Counter()
        if isinstance(e, ast.UnaryOp): return self._mono(e.operand, sc, sname, env)
        if isinstance(e, ast.BinOp):
            if isinstance(e.op, (ast.Add, ast.Sub)):
                a, b = self._mono(e.left, sc, sname, env), self._mono(e.right, sc, sname, env)
                return b if sum(b.values()) > sum(a.values()) else a
            if isinstance(e.op, ast.Mult):
                c = Counter(self._mono(e.left, sc, sname, env))
                for L, k in self._mono(e.right, sc, sname, env).items(): c[L] += k
                return c
            if isinstance(e.op, (ast.Div, ast.FloorDiv, ast.Mod)):
                return self._mono(e.left, sc, sname, env)
            if isinstance(e.op, ast.Pow):
                k = e.right.value if isinstance(e.right, ast.Constant) and isinstance(e.right.value, int) \
                    and not isinstance(e.right.value, bool) else None
                base = self._mono(e.left, sc, sname, env)
                if k is not None and 1 <= k <= 8:
                    if not base: base = Counter({'n': 1})
                    return Counter({L: p * k for L, p in base.items()})
            return Counter({'n': 1})
        if isinstance(e, ast.Call):
            fid = getattr(e.func, 'id', getattr(e.func, 'attr', ''))
            if fid == 'len' and e.args:
                nm = self._source_name(e, sc, env)
                L = self.letter_for(nm, sname, env) if nm else 'n'
                return Counter({L: 1}) if L else Counter()
            best = Counter()
            for a in e.args:
                m = self._mono(a, sc, sname, env)
                if sum(m.values()) > sum(best.values()): best = m
            return best
        nm = self._source_name(e, sc, env)
        if nm:
            L = self.letter_for(nm, sname, env)
            return Counter({L: 1}) if L else Counter()
        return Counter({'n': 1})

    def legend(self, scope_name=None):
        """{letter: [variable names]} for the scope -- shown to the student so n, m, k are not magic."""
        sname = scope_name or _MODULE
        out = {}
        for (root, oname), members in self._members_of(sname).items():
            owner = self.scopes.get(oname) or self.scopes[_MODULE]
            if self._is_counter(root, owner) or root.lower() in NOT_A_SIZE: continue
            table = self._letter_table(sname)
            L = table.get((root, oname))
            if L is None: continue
            names = sorted(m for m in members if m not in owner.targets or m in owner.params)
            out[L] = names or [root]
        return out

    def alloc_dims(self, value, scope_name=None):
        """Size letters of a table built by nested comprehensions / repetition: [[0] * m for _ in range(n)] -> ['n', 'm']."""
        sc_name = scope_name or _MODULE
        sc = self._lookup_scope(sc_name)
        bounds = []
        for node in ast.walk(value):
            if isinstance(node, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
                for g in node.generators:
                    it = g.iter
                    if isinstance(it, ast.Call) and getattr(it.func, 'id', '') == 'range' and it.args:
                        bounds.append(it.args[0] if len(it.args) == 1 else it.args[1])
            elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
                if isinstance(node.left, (ast.List, ast.Tuple)): bounds.append(node.right)
                elif isinstance(node.right, (ast.List, ast.Tuple)): bounds.append(node.left)
        dims = []
        for b in bounds:
            if self.is_constant_expr(b): continue
            d = self.bound_dims(b, sc_name)
            dims += d[:1] if d else []
        return dims
