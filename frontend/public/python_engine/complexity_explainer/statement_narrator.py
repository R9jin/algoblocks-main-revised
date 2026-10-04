"""
Statement Narrator

Reads the *syntax* of one statement (targets, operators, subscripts, calls,
comparisons...) and builds a plain-English sentence about what that line
actually does -- instead of a generic "stores a value in a variable".

    R[k] = arr[mid + (1 + k)]   ->  Copies the item at position `mid + (1 + k)`
                                    of `arr` into position `k` of `R`.
    mid = (lo + hi) // 2        ->  Finds the middle position between `lo` and
                                    `hi` and keeps it in `mid`.
    dp[i] = dp[i-1] + dp[i-2]   ->  Fills slot `i` of `dp` using answers that
                                    are already stored in `dp`.

Design rules
  * Words come from the code: variable names, operators and the shape of the
    expression pick the sentence. Nothing is hard-wired to one program.
  * Plain words for a 2nd/3rd-year student. One sentence, no jargon pile-ups.
  * Pure `ast` -- no extra libraries, no runtime details of the host Python.
  * Returns None when it has nothing better to say, so the caller can fall
    back to its older wording.
"""
import ast
from typing import Callable, List, Optional, Sequence


def _src(node, limit: int = 48) -> str:
    try:
        text = ast.unparse(node)
    except Exception:
        return "..."
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _code(node, limit: int = 48) -> str:
    return f"`{_src(node, limit)}`"


# What a variable name usually *means*. Only used as a short hint, and only
# when the name is a very common convention.
_ROLES = {
    "mid": "the middle position", "middle": "the middle position",
    "lo": "the low end of the search range", "low": "the low end of the search range",
    "left": "the left end", "l": "the left end",
    "hi": "the high end of the search range", "high": "the high end of the search range",
    "right": "the right end", "r": "the right end",
    "i": "a position counter", "j": "a position counter", "k": "a position counter",
    "idx": "a position", "index": "a position", "ptr": "a pointer", "pos": "a position",
    "total": "a running total", "sum": "a running total", "s": "a running total",
    "count": "a counter", "cnt": "a counter",
    "res": "the result so far", "result": "the result so far", "ans": "the answer so far",
    "best": "the best value seen so far", "mx": "the largest value seen so far",
    "mn": "the smallest value seen so far", "maximum": "the largest value seen so far",
    "minimum": "the smallest value seen so far",
    "pivot": "the pivot value", "temp": "a temporary holder", "tmp": "a temporary holder",
    "key": "the value being placed", "curr": "the current item", "cur": "the current item",
    "prev": "the previous item", "nxt": "the next item",
    "dp": "the table of solved sub-answers", "memo": "the saved answers",
    "cache": "the saved answers", "visited": "the set of places already seen",
    "seen": "the set of items already seen", "stack": "the stack", "queue": "the queue",
    "n": "the input size", "size": "the size",
    "window": "the current window", "start": "the start position", "end": "the end position",
    "prefix": "the running totals", "freq": "the frequency table", "counts": "the frequency table",
    "parent": "the group-leader links", "graph": "the graph", "adj": "the neighbour lists",
    "neighbor": "a neighbouring node", "node": "the current node", "u": "the current node", "v": "a neighbouring node",
    "path": "the choices made so far", "used": "which items are already used",
    "max_sum": "the best sum so far", "cur_sum": "the running sum", "curr_sum": "the running sum",
    "steps": "the step counter", "depth": "how deep we are",
}


def role_of(name: str) -> Optional[str]:
    return _ROLES.get(name.lower())


_CMP_WORDS = {
    ast.Eq: "equals", ast.NotEq: "is different from",
    ast.Lt: "is smaller than", ast.LtE: "is at most",
    ast.Gt: "is bigger than", ast.GtE: "is at least",
    ast.Is: "is", ast.IsNot: "is not",
    ast.In: "is found in", ast.NotIn: "is not found in",
}

def _is_const(node, *values) -> bool:
    return isinstance(node, ast.Constant) and (not values or node.value in values)


def _is_int_const(node, value=None) -> bool:
    return (isinstance(node, ast.Constant) and isinstance(node.value, int)
            and not isinstance(node.value, bool) and (value is None or node.value == value))


class StatementNarrator:
    """Turns one AST statement into one plain sentence.

    pick(a, b, ...)   -- chooses between equivalent wordings (stable, not random)
    function_name     -- enclosing function, if any
    recursive_funcs   -- names of functions that call themselves
    params            -- parameter names of the enclosing function
    """

    def __init__(self, pick: Optional[Callable[..., str]] = None, function_name: Optional[str] = None,
                 recursive_funcs: Sequence[str] = (), params: Sequence[str] = (),
                 source_lines: Sequence[str] = ()):
        self.source_lines = list(source_lines or [])
        self.pick = pick or (lambda *opts: opts[0])
        self.function_name = function_name
        self.recursive_funcs = set(recursive_funcs or ())
        self.params = list(params or ())

    # ==================================================================
    # expressions -> noun phrases
    # ==================================================================
    def phrase(self, e) -> str:
        """A short noun phrase for an expression."""
        if e is None:
            return "nothing"
        if isinstance(e, ast.Constant):
            return self._const_phrase(e)
        if isinstance(e, ast.Name):
            return f"`{e.id}`"
        if isinstance(e, ast.Subscript):
            return self._subscript_phrase(e)
        if isinstance(e, ast.Attribute):
            return f"the `{e.attr}` of {self.phrase(e.value)}"
        if isinstance(e, ast.Call):
            return self._call_phrase(e)
        if isinstance(e, ast.BinOp):
            return self._binop_phrase(e)
        if isinstance(e, ast.UnaryOp):
            if isinstance(e.op, ast.USub) and isinstance(e.operand, ast.Constant):
                return f"`-{e.operand.value}`"
            if isinstance(e.op, ast.Not):
                return f"the opposite of {self.phrase(e.operand)}"
            if isinstance(e.op, ast.USub):
                return f"minus {self.phrase(e.operand)}"
            return _code(e)
        if isinstance(e, ast.Compare):
            return f"whether {self.condition(e)}"
        if isinstance(e, ast.BoolOp):
            return f"whether {self.condition(e)}"
        if isinstance(e, ast.IfExp):
            return f"{self.phrase(e.body)} if {self.condition(e.test)}, otherwise {self.phrase(e.orelse)}"
        if isinstance(e, (ast.List, ast.Tuple, ast.Set)):
            return self._literal_phrase(e)
        if isinstance(e, ast.Dict):
            return "an empty dictionary" if not e.keys else "a new dictionary"
        if isinstance(e, (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)):
            return self._comp_phrase(e)
        if isinstance(e, ast.JoinedStr):
            return "a formatted piece of text"
        if isinstance(e, ast.Lambda):
            args = ", ".join(f"`{a.arg}`" for a in e.args.args) or "no inputs"
            return f"a tiny function of {args} that gives back {self.phrase(e.body)}"
        return _code(e)

    @staticmethod
    def _const_phrase(c: ast.Constant) -> str:
        v = c.value
        if v is None:
            return "`None` (nothing)"
        if v is True or v is False:
            return f"`{v}`"
        if isinstance(v, str):
            return "an empty string" if v == "" else f"the text `{v[:20]}`"
        return f"`{v}`"

    def _subscript_phrase(self, e: ast.Subscript) -> str:
        base = self.phrase(e.value)
        sl = e.slice
        if isinstance(sl, ast.Slice):
            lo = _src(sl.lower) if sl.lower is not None else None
            hi = _src(sl.upper) if sl.upper is not None else None
            if lo and hi:
                return f"the part of {base} from `{lo}` up to (not including) `{hi}`"
            if lo:
                return f"the part of {base} starting at `{lo}`"
            if hi:
                return f"the first `{hi}` items of {base}"
            return f"a copy of {base}"
        if isinstance(sl, ast.UnaryOp) and isinstance(sl.op, ast.USub) and _is_int_const(sl.operand, 1):
            return f"the last item of {base}"
        if _is_int_const(sl, 0):
            return f"the first item of {base}"
        if isinstance(e.value, ast.Subscript):  # grid[i][j]
            return f"the cell at row {_code(e.value.slice)}, column {_code(sl)} of {self.phrase(e.value.value)}"
        return f"the item at position {_code(sl)} of {base}"

    def _call_phrase(self, c: ast.Call) -> str:
        fn = c.func
        args = c.args
        if isinstance(fn, ast.Name):
            name = fn.id
            a0 = args[0] if args else None
            if name == "len" and a0 is not None:
                return f"the number of items in {self.phrase(a0)}"
            if name == "range":
                return _code(c)
            if name in ("min", "max") and len(args) >= 2:
                word = "smaller" if name == "min" else "larger"
                return f"the {word} of {self.phrase(args[0])} and {self.phrase(args[1])}"
            if name in ("min", "max") and a0 is not None:
                return f"the {'smallest' if name == 'min' else 'largest'} item of {self.phrase(a0)}"
            if name == "sum" and a0 is not None:
                return f"the total of all items in {self.phrase(a0)}"
            if name == "abs" and a0 is not None:
                return f"the size (ignoring the sign) of {self.phrase(a0)}"
            if name == "sorted" and a0 is not None:
                return f"a sorted copy of {self.phrase(a0)}"
            if name in ("list", "set", "dict", "tuple") and a0 is not None:
                return f"a new {name} made from {self.phrase(a0)}"
            if name in ("list", "set", "dict", "tuple"):
                return f"an empty {name}"
            if name in ("int", "float", "str") and a0 is not None:
                kind = {"int": "a whole number", "float": "a decimal number", "str": "text"}[name]
                return f"{self.phrase(a0)} turned into {kind}"
            if name == "pow" and len(args) >= 2:
                return f"{self.phrase(args[0])} raised to {self.phrase(args[1])}"
            if name in self.recursive_funcs and name == self.function_name:
                return f"the answer from the recursive call {_code(c)}"
            return f"the result of calling {_code(c)}"
        if isinstance(fn, ast.Attribute):
            m = fn.attr
            owner = self.phrase(fn.value)
            if m == "pop" and not args:
                return f"the last item removed from {owner}"
            if m == "pop" and _is_int_const(args[0], 0):
                return f"the first item removed from {owner}"
            if m == "popleft":
                return f"the first item removed from {owner}"
            if m == "copy":
                return f"a copy of {owner}"
            if m == "get" and args:
                return f"the value stored under {self.phrase(args[0])} in {owner}"
            if m in ("keys", "values", "items"):
                return f"the {m} of {owner}"
            if m == "join":
                return f"the items of {self.phrase(args[0]) if args else 'a list'} glued into one string"
            if m == "split":
                return f"{owner} broken into pieces"
            if m in ("upper", "lower", "strip", "title") and not args:
                word = {"upper": "in capitals", "lower": "in lower case", "strip": "without surrounding spaces", "title": "in title case"}[m]
                return f"{owner} {word}"
            if m == "replace" and len(args) >= 2:
                return f"{owner} with every {self.phrase(args[0])} replaced by {self.phrase(args[1])}"
            if m in ("startswith", "endswith") and args:
                return f"whether {owner} {'starts' if m == 'startswith' else 'ends'} with {self.phrase(args[0])}"
            if m == "isdigit" and not args:
                return f"whether {owner} is made only of digits"
            if m == "count" and args:
                return f"how many times {self.phrase(args[0])} appears in {owner}"
            if m == "index" and args:
                return f"the position of {self.phrase(args[0])} in {owner}"
            if m in ("heappop",):
                return f"the smallest item taken out of {self.phrase(args[0]) if args else 'the heap'}"
            return f"the result of `{_src(c, 40)}`"
        return _code(c)

    def _binop_phrase(self, e: ast.BinOp) -> str:
        l, r, op = e.left, e.right, e.op
        if isinstance(op, ast.FloorDiv) and _is_int_const(r, 2):
            return f"half of {self.phrase(l)} (rounded down)"
        if isinstance(op, ast.Div) and _is_int_const(r, 2):
            return f"half of {self.phrase(l)}"
        if isinstance(op, ast.Mult) and _is_int_const(r, 2):
            return f"double {self.phrase(l)}"
        if isinstance(op, ast.Sub) and _is_int_const(r, 1) and isinstance(l, ast.Call) and isinstance(l.func, ast.Name) \
                and l.func.id == "len" and len(l.args) == 1:
            return f"the last position of {self.phrase(l.args[0])}"
        if isinstance(op, ast.Mod):
            return f"the remainder when {self.phrase(l)} is divided by {self.phrase(r)}"
        if isinstance(op, ast.Pow):
            return f"{self.phrase(l)} raised to the power {self.phrase(r)}"
        if isinstance(op, ast.Mult) and isinstance(l, ast.List) and len(l.elts) == 1:
            return f"a list of {self.phrase(r)} copies of {self.phrase(l.elts[0])}"
        if isinstance(op, ast.Mult) and isinstance(r, ast.List) and len(r.elts) == 1:
            return f"a list of {self.phrase(l)} copies of {self.phrase(r.elts[0])}"
        if isinstance(op, ast.Add) and (isinstance(l, ast.List) or isinstance(r, ast.List)):
            return f"a new list joining {self.phrase(l)} and {self.phrase(r)}"
        # middle of a range: lo + (hi - lo) // 2
        if isinstance(op, ast.Add) and isinstance(r, ast.BinOp) and isinstance(r.op, ast.FloorDiv) and _is_int_const(r.right, 2):
            return f"the middle between {self.phrase(l)} and the other end"
        words = {ast.Add: "plus", ast.Sub: "minus", ast.Mult: "times", ast.Div: "divided by",
                 ast.FloorDiv: "divided by", ast.BitAnd: "bitwise-AND", ast.BitOr: "bitwise-OR",
                 ast.BitXor: "bitwise-XOR", ast.LShift: "shifted left by", ast.RShift: "shifted right by"}
        w = words.get(type(op))
        simple = lambda x: isinstance(x, (ast.Name, ast.Constant, ast.Attribute))
        if w and simple(l) and simple(r):
            if isinstance(op, (ast.Add, ast.Sub, ast.Mult)):
                return _code(e)          # `n - 1` reads better as code than "n minus 1"
            return f"{self.phrase(l)} {w} {self.phrase(r)}"
        return _code(e)

    def _literal_phrase(self, e) -> str:
        kind = {ast.List: "list", ast.Tuple: "tuple", ast.Set: "set"}[type(e)]
        if not e.elts:
            return f"an empty {kind}"
        if len(e.elts) <= 3:
            return f"a {kind} holding " + ", ".join(self.phrase(x) for x in e.elts)
        return f"a {kind} of {len(e.elts)} values"

    def _comp_phrase(self, e) -> str:
        kind = {ast.ListComp: "list", ast.SetComp: "set", ast.GeneratorExp: "stream of values",
                ast.DictComp: "dictionary"}[type(e)]
        gen = e.generators[0]
        src = self._iter_phrase(gen.iter, gen.target)
        if isinstance(e, ast.DictComp):
            item = f"{self.phrase(e.key)} -> {self.phrase(e.value)}"
        else:
            item = self.phrase(e.elt)
        keep = f", keeping only the ones where {self.condition(gen.ifs[0])}" if gen.ifs else ""
        more = " (with another loop inside it)" if len(e.generators) > 1 else ""
        return f"a new {kind} made by going through {src}{more}{keep}, collecting {item} for each"

    # ==================================================================
    # loops / iteration phrases
    # ==================================================================
    def _iter_phrase(self, it, target=None) -> str:
        t = _code(target) if target is not None else "the current item"
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name):
            name, args = it.func.id, it.args
            if name == "range":
                return self._range_phrase(args, target)
            if name == "enumerate" and args:
                return f"every item of {self.phrase(args[0])} together with its position"
            if name == "zip":
                return f"{' and '.join(self.phrase(a) for a in args)} side by side"
            if name == "reversed" and args:
                return f"{self.phrase(args[0])} from the end to the start"
            if name == "sorted" and args:
                return f"a sorted copy of {self.phrase(args[0])}"
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr == "items":
            return f"every key/value pair of {self.phrase(it.func.value)}"
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr == "values":
            return f"every value of {self.phrase(it.func.value)}"
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr == "keys":
            return f"every key of {self.phrase(it.func.value)}"
        if isinstance(it, ast.Subscript) and isinstance(it.value, ast.Name) \
                and it.value.id.lower() in ("graph", "adj", "g", "adjacency", "neighbors", "neighbours", "edges"):
            return f"every neighbour of {self.phrase(it.slice)} (each node it connects to in `{it.value.id}`)"
        if isinstance(it, ast.Subscript):
            return f"every item of {self.phrase(it)}"
        if isinstance(it, ast.Name):
            return f"every item of `{it.id}`"
        return f"every item of {self.phrase(it)}"

    def _range_phrase(self, args, target=None) -> str:
        v = _code(target) if target is not None else "the counter"
        if len(args) == 1:
            return f"every whole number from 0 up to (but not including) {self.phrase(args[0])}"
        if len(args) == 2:
            return f"every whole number from {self.phrase(args[0])} up to (but not including) {self.phrase(args[1])}"
        if len(args) == 3:
            step = args[2]
            neg = isinstance(step, ast.UnaryOp) and isinstance(step.op, ast.USub)
            if neg:
                return (f"the whole numbers counting down from {self.phrase(args[0])} "
                        f"to (but not including) {self.phrase(args[1])}, stepping by {_src(step.operand)}")
            return (f"the whole numbers from {self.phrase(args[0])} up to (but not including) "
                    f"{self.phrase(args[1])}, stepping by {self.phrase(step)}")
        return "a range of numbers"

    # ==================================================================
    # conditions
    # ==================================================================
    def condition(self, t) -> str:
        if isinstance(t, ast.Compare):
            parts: List[str] = []
            left = t.left
            for op, right in zip(t.ops, t.comparators):
                word = _CMP_WORDS.get(type(op), "is compared with")
                empty = self._emptiness(left, op, right)
                if empty:
                    parts.append(empty)
                elif isinstance(op, (ast.In, ast.NotIn)) and isinstance(right, ast.Name) \
                        and right.id.lower() in ("visited", "seen", "done", "explored"):
                    verb = "has already been" if isinstance(op, ast.In) else "has not been"
                    parts.append(f"{self.phrase(left)} {verb} visited (it {'is' if isinstance(op, ast.In) else 'is not'} in `{right.id}`)")
                elif isinstance(op, (ast.In, ast.NotIn)) and isinstance(right, ast.Name) \
                        and right.id.lower() in ("memo", "cache", "lookup", "saved", "computed"):
                    verb = "is already saved" if isinstance(op, ast.In) else "has not been saved yet"
                    parts.append(f"the answer for {self.phrase(left)} {verb} in `{right.id}`")
                elif isinstance(op, (ast.Is, ast.IsNot)) and _is_const(right, None):
                    parts.append(f"{self.phrase(left)} {'is' if isinstance(op, ast.Is) else 'is not'} `None`")
                elif isinstance(op, (ast.Eq, ast.NotEq)) and _is_int_const(right, 0) and isinstance(left, ast.BinOp) and isinstance(left.op, ast.Mod):
                    divisor = self.phrase(left.right)
                    parts.append(f"{self.phrase(left.left)} {'is' if isinstance(op, ast.Eq) else 'is not'} evenly divisible by {divisor}")
                else:
                    parts.append(f"{self.phrase(left)} {word} {self.phrase(right)}")
                left = right
            return " and ".join(parts)
        if isinstance(t, ast.BoolOp):
            joiner = " and " if isinstance(t.op, ast.And) else " or "
            return joiner.join(self.condition(v) for v in t.values)
        if isinstance(t, ast.UnaryOp) and isinstance(t.op, ast.Not):
            inner = t.operand
            if isinstance(inner, ast.Name):
                return f"`{inner.id}` is empty (or false)"
            return f"it is not true that {self.condition(inner)}"
        if isinstance(t, ast.Name):
            return f"`{t.id}` is not empty (or is true)"
        if isinstance(t, ast.Constant) and t.value is True:
            return "the loop is never stopped by a condition"
        if isinstance(t, ast.Call):
            return f"{self.phrase(t)} is true"
        return f"{_code(t)} is true"

    def _emptiness(self, left, op, right) -> Optional[str]:
        """`len(x) == 0`, `len(x) > 0`, `x == []` ... said as 'x is empty'."""
        if isinstance(left, ast.Call) and isinstance(left.func, ast.Name) and left.func.id == "len" and left.args \
                and _is_int_const(right):
            who = self.phrase(left.args[0])
            n = right.value
            if isinstance(op, ast.Eq) and n == 0:
                return f"{who} is empty"
            if (isinstance(op, ast.Gt) and n == 0) or (isinstance(op, ast.NotEq) and n == 0) or (isinstance(op, ast.GtE) and n == 1):
                return f"{who} is not empty"
            if (isinstance(op, ast.LtE) and n == 1) or (isinstance(op, ast.Lt) and n == 2):
                return f"{who} has at most one item"
            if isinstance(op, ast.Lt) and n == 1:
                return f"{who} is empty"
            return None
        if isinstance(op, (ast.Eq, ast.NotEq)) and isinstance(right, (ast.List, ast.Dict, ast.Tuple)) and not getattr(right, "elts", getattr(right, "keys", [1])):
            return f"{self.phrase(left)} {'is' if isinstance(op, ast.Eq) else 'is not'} empty"
        return None

    # ==================================================================
    # statements -> one sentence
    # ==================================================================
    def narrate(self, node) -> Optional[str]:
        try:
            return self._narrate(node)
        except Exception:
            return None

    def _narrate(self, node) -> Optional[str]:
        if isinstance(node, ast.Assign):
            return self._assign(node.targets, node.value)
        if isinstance(node, ast.AnnAssign) and node.value is not None:
            return self._assign([node.target], node.value)
        if isinstance(node, ast.AugAssign):
            return self._augassign(node)
        if isinstance(node, ast.Expr):
            return self._expr(node.value)
        if isinstance(node, ast.Return):
            return self._return(node)
        if isinstance(node, ast.If):
            return self._if(node)
        if isinstance(node, (ast.For, ast.AsyncFor)):
            return self._for(node)
        if isinstance(node, ast.While):
            return self._while(node)
        if isinstance(node, ast.Break):
            return "Jumps out of the loop right now, even if it had more passes to go."
        if isinstance(node, ast.Continue):
            return "Skips the rest of this pass and moves straight on to the next one."
        if isinstance(node, ast.Pass):
            return "Does nothing. It is only a placeholder so the block is not empty."
        if isinstance(node, ast.Import):
            names = ", ".join(f"`{a.name}`" for a in node.names)
            return f"Brings in {names} so its ready-made tools can be used."
        if isinstance(node, ast.ImportFrom):
            names = ", ".join(f"`{a.name}`" for a in node.names)
            return f"Brings in {names} from `{node.module}` so it can be used directly."
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params = ", ".join(f"`{a.arg}`" for a in node.args.args + node.args.kwonlyargs) or "no inputs"
            return f"Defines the function `{node.name}` that takes {params}. Nothing inside runs until it is called."
        if isinstance(node, ast.ClassDef):
            return f"Defines the class `{node.name}`, a blueprint for objects."
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            names = ", ".join(f"`{n}`" for n in node.names)
            return f"Says that {names} means the variable from outside this function, not a new local one."
        if isinstance(node, ast.Delete):
            return "Removes " + ", ".join(self.phrase(t) for t in node.targets) + "."
        if isinstance(node, ast.Assert):
            return f"Checks that {self.condition(node.test)}, and stops the program with an error if not."
        if isinstance(node, ast.Raise):
            return "Stops the function with an error" + (f": {_code(node.exc, 40)}." if node.exc is not None else ".")
        if isinstance(node, ast.Try):
            return "Tries the indented code; if it causes an error, the `except` part runs instead of the program crashing."
        if isinstance(node, (ast.With, ast.AsyncWith)):
            what = ", ".join(_code(i.context_expr, 30) for i in node.items)
            return f"Opens {what} for the block below and closes it automatically afterwards."
        if isinstance(node, ast.Lambda):
            return "Defines a tiny unnamed function for quick one-off use."
        # expression nodes the analyzer sometimes hands over
        if isinstance(node, ast.Call):
            return self._expr(node)
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            return f"Builds {self._comp_phrase(node)}."
        return None

    # ---- assignment -------------------------------------------------
    def _assign(self, targets, value) -> Optional[str]:
        if len(targets) != 1:
            names = ", ".join(_code(t) for t in targets)
            return f"Gives {names} all the same value: {self.phrase(value)}."
        tgt = targets[0]

        # swap / multi-assign:  a[i], a[j] = a[j], a[i]   or   a, b = b, a + b
        if isinstance(tgt, ast.Tuple) and isinstance(value, ast.Tuple) and len(tgt.elts) == len(value.elts):
            return self._tuple_assign(tgt, value)
        if isinstance(tgt, ast.Tuple):
            names = ", ".join(_code(t) for t in tgt.elts)
            return f"Unpacks {self.phrase(value)} into {names}."

        # target is a plain name
        if isinstance(tgt, ast.Name):
            return self._assign_name(tgt, value)

        # target is container[index]
        if isinstance(tgt, ast.Subscript):
            return self._assign_subscript(tgt, value)

        if isinstance(tgt, ast.Attribute):
            return f"Sets the `{tgt.attr}` of {self.phrase(tgt.value)} to {self.phrase(value)}."
        return None

    def _tuple_assign(self, tgt: ast.Tuple, value: ast.Tuple) -> str:
        pairs = list(zip(tgt.elts, value.elts))
        # real swap: each target's new value is the other target's old value
        if len(pairs) == 2 and _src(pairs[0][0]) == _src(pairs[1][1]) and _src(pairs[1][0]) == _src(pairs[0][1]):
            a, b = tgt.elts
            if isinstance(a, ast.Subscript) and isinstance(b, ast.Subscript) and _src(a.value) == _src(b.value):
                return (f"Swaps the items at positions {_code(a.slice)} and {_code(b.slice)} "
                        f"of {self.phrase(a.value)}.")
            return f"Swaps the values of {_code(a)} and {_code(b)}."
        # rolling update like a, b = b, a + b
        targets = {_src(t) for t in tgt.elts}
        uses_old = any(isinstance(n, ast.Name) and n.id in targets for v in value.elts for n in ast.walk(v))
        if not uses_old:
            bits = [f"{_code(t)} to {self.phrase(v)}" for t, v in pairs]
            return "Sets " + " and ".join(bits) + "."
        bits = [f"{_code(t)} becomes {self.phrase(v)}" for t, v in pairs]
        return "Updates both at the same time (each uses the old values): " + "; ".join(bits) + "."

    def _assign_name(self, tgt: ast.Name, value) -> str:
        name = tgt.id
        role = role_of(name)
        keep = f"`{name}`" + (f", {role}" if role else "")

        # x = x + something  ->  same as an in-place update
        if isinstance(value, ast.BinOp) and isinstance(value.left, ast.Name) and value.left.id == name:
            return self._update_phrase(name, value.op, value.right)

        # best = max(best, x)  /  smallest = min(smallest, x)
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("min", "max") \
                and len(value.args) == 2 and any(isinstance(a, ast.Name) and a.id == name for a in value.args):
            other = next(a for a in value.args if not (isinstance(a, ast.Name) and a.id == name))
            word = "larger" if value.func.id == "max" else "smaller"
            return f"Keeps the {word} of `{name}` and {self.phrase(other)} in `{name}`, so `{name}` always holds the {'largest' if value.func.id == 'max' else 'smallest'} value seen so far."
        # cur = max(x, cur + x)  (restart-or-extend, as in Kadane)
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("min", "max") \
                and len(value.args) == 2 and any(isinstance(n, ast.Name) and n.id == name for a in value.args if isinstance(a, ast.BinOp) for n in ast.walk(a)):
            return f"Chooses the {'better' if value.func.id == 'max' else 'smaller'} of two options for `{name}`: {_code(value, 44)}."
        if isinstance(value, ast.JoinedStr):
            return f"Builds a piece of text from {_code(value, 40)} and keeps it in `{name}`."
        # x = y + 1  /  x = y - 1  (moving a boundary or position)
        if isinstance(value, ast.BinOp) and isinstance(value.op, (ast.Add, ast.Sub)) \
                and isinstance(value.left, ast.Name) and _is_int_const(value.right, 1):
            how = "one more than" if isinstance(value.op, ast.Add) else "one less than"
            return f"Sets {keep} to {how} `{value.left.id}`."

        if isinstance(value, ast.Constant):
            v = value.value
            if v is None:
                return f"Starts `{name}` as `None`, meaning it holds nothing yet."
            if v is True or v is False:
                return f"Sets the flag `{name}` to `{v}`."
            if isinstance(v, (int, float)) and v == 0:
                return self.pick(f"Starts `{name}` at 0" + (f" (it will be {role})." if role else "."),
                                 f"Sets `{name}` to 0 before the work begins.")
            if isinstance(v, str) and v == "":
                return f"Starts `{name}` as an empty string that text can be added to later."
            return f"Sets {keep} to {self.phrase(value)}."

        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "float" \
                and value.args and isinstance(value.args[0], ast.Constant) and isinstance(value.args[0].value, str) \
                and value.args[0].value.lower().replace("-", "") in ("inf", "infinity"):
            neg = value.args[0].value.startswith("-")
            return (f"Starts `{name}` at {'negative ' if neg else ''}infinity, so the first real value "
                    f"will always beat it.")

        if isinstance(value, ast.List) and not value.elts:
            return self.pick(f"Creates `{name}` as an empty list to fill up later.", f"Makes an empty list called `{name}`.")
        if isinstance(value, ast.Dict) and not value.keys:
            return f"Creates `{name}` as an empty dictionary (key/value store)."
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "set" and not value.args:
            return f"Creates `{name}` as an empty set (a collection with no duplicates)."
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("deque",) :
            return f"Creates `{name}` as a double-ended queue."

        # [0] * n   or  [[0]*m for _ in range(n)]
        if isinstance(value, ast.BinOp) and isinstance(value.op, ast.Mult):
            lst, cnt = (value.left, value.right) if isinstance(value.left, ast.List) else (value.right, value.left)
            if isinstance(lst, ast.List) and len(lst.elts) == 1:
                return f"Creates `{name}` as a list of {self.phrase(cnt)} slots, each starting as {self.phrase(lst.elts[0])}."
        if isinstance(value, ast.ListComp) and isinstance(value.elt, (ast.List, ast.BinOp, ast.ListComp)) \
                and "[" in _src(value.elt) and len(value.generators) >= 1 and self._looks_grid(value):
            return f"Builds `{name}` as a 2D grid (a list of rows), one row for every pass of the outer count."

        # middle position
        if self._is_midpoint(value):
            lo_hi = self._midpoint_ends(value)
            return f"Finds the middle position{lo_hi} and keeps it in `{name}`."

        # len / min / max / sum etc
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name):
            fn = value.func.id
            if fn == "len" and value.args:
                return f"Counts how many items {self.phrase(value.args[0])} has and keeps that in `{name}`."
            if fn in ("min", "max"):
                return f"Keeps {self.phrase(value)} in {keep}."
        if isinstance(value, ast.Name):
            return f"Copies the current value of `{value.id}` into {keep}."
        if isinstance(value, ast.Subscript):
            return f"Reads {self.phrase(value)} and keeps it in {keep}."
        if isinstance(value, ast.Call):
            return f"Runs {_code(value)} and keeps what it gives back in {keep}."
        if isinstance(value, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            return f"Builds `{name}` as {self.phrase(value)}."
        if isinstance(value, (ast.Compare, ast.BoolOp)):
            return f"Works out {self.phrase(value)}, giving `True` or `False`, and keeps it in `{name}`."
        if isinstance(value, ast.IfExp):
            return f"Picks one of two values and keeps it in `{name}`: {self.phrase(value)}."
        return f"Works out {self.phrase(value)} and keeps it in {keep}."

    def _assign_subscript(self, tgt: ast.Subscript, value) -> str:
        base_txt = self.phrase(tgt.value)
        base_name = _src(tgt.value)
        idx = _code(tgt.slice)
        reads_same = self._reads_container(value, base_name)

        # frequency count:  d[k] = d.get(k, 0) + 1
        if isinstance(value, ast.BinOp) and isinstance(value.op, ast.Add) and _is_int_const(value.right, 1) \
                and isinstance(value.left, ast.Call) and isinstance(value.left.func, ast.Attribute) \
                and value.left.func.attr == "get" and _src(value.left.func.value) == base_name:
            return f"Counts one more occurrence of {self.phrase(tgt.slice)} in `{base_name}` (starting from 0 if it has not been seen)."
        # cache save:  memo[n] = result
        if isinstance(tgt.value, ast.Name) and tgt.value.id.lower() in ("memo", "cache", "seen", "lookup"):
            return (f"Saves {self.phrase(value)} in `{tgt.value.id}` under key {idx}, "
                    f"so it never has to be worked out again.")

        # DP-style fill: the slot is built from other slots of the same table
        if reads_same:
            return (f"Fills slot {idx} of `{base_name}` using answers that are already stored "
                    f"in `{base_name}`: {_code(value, 40)}.")

        # copy:  R[k] = arr[mid + (1 + k)]
        if isinstance(value, ast.Subscript) and not isinstance(value.slice, ast.Slice):
            src_base = self.phrase(value.value)
            return (f"Copies the item at position {_code(value.slice)} of {src_base} "
                    f"into position {idx} of {base_txt}.")

        if isinstance(value, ast.Constant):
            return f"Sets position {idx} of {base_txt} to {self.phrase(value)}."
        return f"Stores {self.phrase(value)} at position {idx} of {base_txt}."

    @staticmethod
    def _looks_grid(comp: ast.ListComp) -> bool:
        return isinstance(comp.elt, (ast.List, ast.ListComp)) or \
            (isinstance(comp.elt, ast.BinOp) and isinstance(comp.elt.op, ast.Mult) and isinstance(comp.elt.left, ast.List))

    @staticmethod
    def _reads_container(value, base_name: str) -> bool:
        for n in ast.walk(value):
            if isinstance(n, ast.Subscript):
                try:
                    if ast.unparse(n.value) == base_name:
                        return True
                except Exception:
                    pass
        return False

    @staticmethod
    def _is_midpoint(v) -> bool:
        # (a + b) // 2   or   a + (b - a) // 2   or   (a + b) >> 1
        if isinstance(v, ast.BinOp) and isinstance(v.op, ast.FloorDiv) and _is_int_const(v.right, 2):
            return isinstance(v.left, ast.BinOp) and isinstance(v.left.op, ast.Add)
        if isinstance(v, ast.BinOp) and isinstance(v.op, ast.RShift) and _is_int_const(v.right, 1):
            return isinstance(v.left, ast.BinOp) and isinstance(v.left.op, ast.Add)
        if isinstance(v, ast.BinOp) and isinstance(v.op, ast.Add) and isinstance(v.right, ast.BinOp) \
                and isinstance(v.right.op, ast.FloorDiv) and _is_int_const(v.right.right, 2):
            return isinstance(v.right.left, ast.BinOp) and isinstance(v.right.left.op, ast.Sub)
        return False

    @staticmethod
    def _midpoint_ends(v) -> str:
        try:
            if isinstance(v.op, ast.Add):  # a + (b - a)//2
                return f" between `{_src(v.left)}` and `{_src(v.right.left.left)}`"
            s = v.left
            return f" between `{_src(s.left)}` and `{_src(s.right)}`"
        except Exception:
            return ""

    # ---- augmented assignment --------------------------------------
    def _augassign(self, node: ast.AugAssign) -> str:
        tgt = node.target
        if isinstance(tgt, ast.Name):
            return self._update_phrase(tgt.id, node.op, node.value)
        # container[i] += x
        if isinstance(tgt, ast.Subscript) and isinstance(node.op, ast.Add) and _is_int_const(node.value, 1) \
                and isinstance(tgt.value, ast.Name) and tgt.value.id.lower() in ("count", "counts", "cnt", "freq", "frequency", "counter", "hist", "tally"):
            return f"Counts one more occurrence of {self.phrase(tgt.slice)} in `{tgt.value.id}`."
        what = self.phrase(tgt)
        v = self.phrase(node.value)
        if isinstance(node.op, ast.Add):
            return f"Adds {v} to {what}."
        if isinstance(node.op, ast.Sub):
            return f"Takes {v} away from {what}."
        return f"Updates {what} using {v}."

    def _update_phrase(self, name: str, op, rhs) -> str:
        r = self.phrase(rhs)
        lname = name.lower()
        counterish = lname in ("count", "cnt", "c", "num", "steps", "total_count", "ans", "res", "result", "swaps", "comparisons")
        if isinstance(op, ast.Add):
            if _is_int_const(rhs, 1):
                if counterish:
                    return f"Counts one more: adds 1 to `{name}`."
                return self.pick(f"Moves `{name}` forward by 1.", f"Adds 1 to `{name}`, stepping to the next position.")
            if isinstance(rhs, ast.Constant) and isinstance(rhs.value, str):
                return f"Adds the text {r} to the end of `{name}`."
            if lname in ("total", "sum", "s", "acc", "res", "result", "ans", "current_sum", "curr_sum", "window"):
                return f"Adds {r} to the running total `{name}`."
            return f"Adds {r} to `{name}`."
        if isinstance(op, ast.Sub):
            if _is_int_const(rhs, 1):
                return self.pick(f"Moves `{name}` back by 1.", f"Subtracts 1 from `{name}`, stepping to the previous position.")
            return f"Takes {r} away from `{name}`."
        if isinstance(op, ast.Mult):
            return f"Multiplies `{name}` by {r}."
        if isinstance(op, (ast.FloorDiv, ast.Div)) and _is_int_const(rhs, 2):
            return f"Cuts `{name}` in half."
        if isinstance(op, ast.RShift) and _is_int_const(rhs, 1):
            return f"Shifts the bits of `{name}` right by one, which halves it."
        if isinstance(op, ast.LShift) and _is_int_const(rhs, 1):
            return f"Shifts the bits of `{name}` left by one, which doubles it."
        if isinstance(op, (ast.FloorDiv, ast.Div)):
            return f"Divides `{name}` by {r}."
        if isinstance(op, ast.Mod):
            return f"Replaces `{name}` with its remainder after dividing by {r}."
        if isinstance(op, ast.Pow):
            return f"Raises `{name}` to the power {r}."
        if isinstance(op, ast.BitAnd):
            return f"Keeps only the bits of `{name}` that are also set in {r}."
        if isinstance(op, ast.BitOr):
            return f"Turns on the bits of `{name}` that are set in {r}."
        if isinstance(op, ast.BitXor):
            return f"Flips the bits of `{name}` that are set in {r}."
        return f"Updates `{name}` using {r}."

    # ---- bare expressions (calls) ----------------------------------
    def _expr(self, v) -> Optional[str]:
        if isinstance(v, ast.Constant) and isinstance(v.value, str):
            return None  # docstring: handled by the caller
        if isinstance(v, (ast.Yield, ast.YieldFrom)):
            return f"Hands {self.phrase(v.value) if v.value is not None else 'a value'} to the caller and pauses until it asks for the next one."
        if isinstance(v, ast.Await):
            v = v.value
        if not isinstance(v, ast.Call):
            return None
        fn, args = v.func, v.args
        if isinstance(fn, ast.Attribute):
            m, owner = fn.attr, self.phrase(fn.value)
            a0 = args[0] if args else None
            if m == "append" and a0 is not None:
                return f"Adds {self.phrase(a0)} to the end of {owner}."
            if m == "appendleft" and a0 is not None:
                return f"Adds {self.phrase(a0)} to the front of {owner}."
            if m == "extend" and a0 is not None:
                return f"Adds every item of {self.phrase(a0)} to the end of {owner}."
            if m == "insert" and len(args) >= 2:
                return f"Inserts {self.phrase(args[1])} at position {self.phrase(args[0])} of {owner}, shifting later items along."
            if m == "pop" and not args:
                return f"Removes the last item of {owner}."
            if m == "pop" and _is_int_const(a0, 0):
                return f"Removes the first item of {owner}, shifting every other item one place left."
            if m == "pop" and a0 is not None:
                return f"Removes the entry at {self.phrase(a0)} from {owner}."
            if m == "popleft":
                return f"Removes the first item of {owner}."
            if m == "remove" and a0 is not None:
                return f"Finds {self.phrase(a0)} in {owner} and removes it."
            if m == "add" and a0 is not None:
                return f"Adds {self.phrase(a0)} to the set {owner}."
            if m == "discard" and a0 is not None:
                return f"Removes {self.phrase(a0)} from the set {owner} if it is there."
            if m == "update" and a0 is not None:
                return f"Merges {self.phrase(a0)} into {owner}."
            if m == "sort":
                return f"Sorts {owner} in place (the same list is rearranged)."
            if m == "reverse":
                return f"Reverses the order of {owner} in place."
            if m == "clear":
                return f"Empties {owner}."
            if m in ("heappush",) and len(args) >= 2:
                return f"Pushes {self.phrase(args[1])} onto the heap {self.phrase(args[0])}."
            return f"Calls `.{m}()` on {owner}."
        if isinstance(fn, ast.Name):
            name = fn.id
            if name == "print":
                shown = ", ".join(self.phrase(a) for a in args) or "an empty line"
                return f"Prints {shown} to the console."
            if name in ("heappush",) and len(args) >= 2:
                return f"Pushes {self.phrase(args[1])} onto the heap {self.phrase(args[0])}."
            if name in self.recursive_funcs and name == self.function_name:
                return f"Calls itself with {_code(v, 40)}, a smaller version of the same problem."
            return f"Runs `{name}` with {', '.join(self.phrase(a) for a in args) or 'no inputs'}."
        return None

    # ---- return -----------------------------------------------------
    def _return(self, node: ast.Return) -> str:
        v = node.value
        if v is None:
            return "Ends the function here without giving anything back."
        if isinstance(v, ast.Constant):
            return f"Stops the function here and gives back {self.phrase(v)}."
        self_calls = self._self_calls(v)
        if len(self_calls) >= 2:
            return (f"Gives back the answer built by combining {len(self_calls)} recursive calls: "
                    f"{', '.join(_code(c, 28) for c in self_calls[:3])}.")
        if len(self_calls) == 1:
            return f"Gives back the result of the recursive call {_code(self_calls[0], 36)}, possibly adjusted."
        if isinstance(v, (ast.Compare, ast.BoolOp)):
            return f"Gives back `True` or `False`, depending on whether {self.condition(v)}."
        if isinstance(v, ast.Tuple):
            return f"Gives back {len(v.elts)} values together: {', '.join(self.phrase(e) for e in v.elts[:3])}."
        if isinstance(v, ast.Name):
            return f"Gives back the value of `{v.id}`."
        return f"Gives back {self.phrase(v)}."

    def _self_calls(self, v) -> List[ast.Call]:
        out = []
        for n in ast.walk(v):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == self.function_name:
                out.append(n)
        return out

    # ---- if / loops -------------------------------------------------
    def _if(self, node: ast.If) -> str:
        cond = self.condition(node.test)
        returns = self._body_returns_early(node.body)
        lead = "Otherwise, checks" if self._is_elif(node) else "Checks"
        if self.function_name in self.recursive_funcs and returns and self._is_base_case_test(node.test) and lead == "Checks":
            tail = "If so, the function stops here: this is the stopping case (base case) of the recursion."
        elif returns:
            tail = "If so, the function ends right there."
        else:
            tail = "If so, the indented lines run; if not, they are skipped."
        return f"{lead} whether {cond}. {tail}"

    def _is_elif(self, node) -> bool:
        if getattr(node, "_is_elif", False):
            return True
        ln = getattr(node, "lineno", 0)
        if 1 <= ln <= len(self.source_lines):
            return self.source_lines[ln - 1].lstrip().startswith("elif ")
        return False

    @staticmethod
    def _body_returns_early(body) -> bool:
        return bool(body) and isinstance(body[0], (ast.Return, ast.Raise))

    def _is_base_case_test(self, test) -> bool:
        """`n <= 1`, `n == 0`, `not arr`, `len(arr) == 0`, `lo > hi`: a parameter
        compared with a small constant or with another parameter."""
        names = {n.id for n in ast.walk(test) if isinstance(n, ast.Name)}
        if not (names & set(self.params)):
            return False
        if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
            return True
        if isinstance(test, ast.Compare):
            consts = [c for c in [test.left, *test.comparators] if isinstance(c, ast.Constant)]
            if any(isinstance(c.value, int) and abs(c.value) <= 2 for c in consts):
                return not any(isinstance(n, ast.Subscript) for n in ast.walk(test))
            sides = [test.left, *test.comparators]
            if all(isinstance(x, ast.Name) and x.id in self.params for x in sides):
                return True
        return False

    def _for(self, node) -> str:
        what = self._iter_phrase(node.iter, node.target)
        t = node.target
        if isinstance(t, ast.Tuple):
            names = ", ".join(_code(x) for x in t.elts)
            return f"Repeats the lines below once for {what}, calling the pieces {names} each time."
        return f"Repeats the lines below once for {what}, calling the current one {_code(t)}."

    def _while(self, node: ast.While) -> str:
        t = node.test
        if isinstance(t, ast.Constant) and t.value is True:
            return "Repeats the lines below forever, until a `break` or `return` inside stops it."
        return f"Keeps repeating the lines below for as long as {self.condition(t)}."


# ======================================================================
# step-by-step walkthrough of a whole program
# ======================================================================
_SKIP = (ast.Import, ast.ImportFrom, ast.Pass, ast.Global, ast.Nonlocal)


def _is_docstring(n) -> bool:
    return isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str)


def _main_body(tree: ast.AST):
    """(function_node_or_None, statements). The entry point is the function nobody else calls,
    preferring the one with the most loops/recursion; a script with no functions uses module code."""
    funcs = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if not funcs:
        return None, [n for n in getattr(tree, "body", []) if not isinstance(n, _SKIP)]
    called = set()
    for fn in funcs:
        for c in ast.walk(fn):
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id != fn.name:
                called.add(c.func.id)
    roots = [f for f in funcs if f.name not in called] or funcs

    def weight(fn):
        return sum(isinstance(n, (ast.For, ast.While, ast.AsyncFor)) for n in ast.walk(fn)) * 3 + len(fn.body)
    top = max(roots, key=weight)
    return top, list(top.body)


def walkthrough(tree: Optional[ast.AST], pick: Optional[Callable[..., str]] = None, max_items: int = 10) -> str:
    """Markdown bullet list: what the main function does, in order, in plain words."""
    if tree is None:
        return ""
    try:
        fn, body = _main_body(tree)
        recursive = set()
        for f in ast.walk(tree):
            if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if any(isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == f.name for c in ast.walk(f)):
                    recursive.add(f.name)
        name = fn.name if fn is not None else None
        params = [a.arg for a in (fn.args.args + fn.args.kwonlyargs)] if fn is not None else []
        nar = StatementNarrator(pick=pick, function_name=name, recursive_funcs=recursive, params=params)

        items, total = [], 0

        def emit(stmt, depth):
            nonlocal total
            if isinstance(stmt, _SKIP) or _is_docstring(stmt):
                return
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                return
            sentence = nar.narrate(stmt)
            if not sentence:
                return
            total += 1
            if len(items) < max_items:
                lead = "\u21b3 " * depth
                items.append(f"- {lead}Line {stmt.lineno}: {sentence}")

        def walk(stmts, depth):
            for st in stmts:
                emit(st, depth)
                if depth < 2 and isinstance(st, (ast.For, ast.AsyncFor, ast.While)):
                    walk(st.body, depth + 1)
                elif depth < 2 and isinstance(st, ast.If):
                    walk(st.body, depth + 1)
                    if st.orelse and not (len(st.orelse) == 1 and isinstance(st.orelse[0], ast.If)):
                        walk(st.orelse, depth + 1)
                    elif st.orelse:
                        walk(st.orelse, depth)

        walk(body, 0)
        if not items:
            return ""
        more = total - len(items)
        if more > 0:
            items.append(f"- ...and {more} more line(s); click any line to see its own explanation.")
        title = f"`{name}`" if name else "the program"
        return f"Reading {title} from top to bottom:\n" + "\n".join(items)
    except Exception:
        return ""
