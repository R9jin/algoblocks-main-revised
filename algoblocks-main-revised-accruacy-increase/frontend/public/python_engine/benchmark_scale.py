"""benchmark_scale.py -- map analyzer labels onto the benchmark's nine-class scale.

WHY THIS EXISTS
The analyzer now keeps independent size symbols apart (O(n * m), O(n + m), O(n * k),
O(m^2 + n) ...). That is the right *analysis* output and it is never altered here. The
benchmark ground truth, however, is written on a single-size scale, and
data/evaluation/GROUND_TRUTH_RULES.md fixes how:

  rule 1  n is the largest size parameter, so O(n x m) is O(n^2) and O(n + m) is O(n).
  rule 9  a graph's vertex count V is n; E <= V^2, so a lower-case edge count e next to an
          n^2 (or larger) term is absorbed. Any label that names a V+E sum -- including
          "O(n * m + V+E)", which the benchmark has always scored as O(V + E) -- stays in the
          O(V + E) class.

Scoring a prediction therefore means folding it by those two rules first. The fold is
symmetric (ground-truth labels already sit on the scale, so folding them is a no-op), is
applied only to *polynomial* labels over plain size symbols, and never turns one class into
another: it only chooses the representative of the single-size class the expression
belongs to. Anything it cannot fold (O(t(n-1)), O(n log m), O(n * e) ...) is returned
unchanged and is scored as-is -- i.e. as a miss against the nine classes.

The raw analyzer string must still be kept and reported next to the scored one.
"""
import re

NINE_CLASSES = ["O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)",
                "O(n^2)", "O(2^n)", "O(n!)", "O(V + E)"]
_PASSTHROUGH = {"", "-", "MISSING", "PARSE_FAIL", "ERROR"}
_FACTOR = re.compile(r"^([a-z])(?:\^(\d+))?$")


def fold_to_benchmark_scale(label):
    """Return `label` expressed on the benchmark scale, or `label` unchanged."""
    if label is None:
        return label
    s = str(label).strip()
    compact = s.replace(" ", "")
    if "V+E" in compact or "E+V" in compact:              # a traversal term that names V and E explicitly:
        return "O(V + E)"                                 # scored as the V+E class (the pre-existing rule)
    if s in NINE_CLASSES or s in _PASSTHROUGH:
        return s
    body = re.fullmatch(r"o\((.*)\)", s.lower().replace(" ", ""))
    if not body:
        return s
    body = body.group(1)
    if not re.fullmatch(r"[a-z0-9^*+]+", body):          # log, sqrt, !, t(...) etc.: not polynomial
        return s

    degrees, edge_term = [], False
    for term in body.split("+"):
        deg, has_e = 0, False
        for factor in term.split("*"):
            if factor.isdigit():
                continue
            m = _FACTOR.fullmatch(factor)
            if not m:
                return s
            sym, power = m.group(1), int(m.group(2) or 1)
            if sym == "e":
                has_e = True                              # edge count: handled below
            else:
                deg += power                              # n, m, k, v ... all fold to n
        degrees.append((deg, has_e))
        edge_term = edge_term or has_e

    vertex_side = [d for d, has_e in degrees if not has_e]
    top = max(vertex_side) if vertex_side else 0
    if edge_term and top < 2:                             # plain V+E (or n*e): leave to its own class
        return s
    if top == 0:
        return "O(1)"
    if top == 1:
        return "O(n)"
    if top == 2:
        return "O(n^2)"
    return "O(n^%d)" % top                                 # outside the nine classes: stays a miss
