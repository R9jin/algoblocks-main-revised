"""
Notation Insight

Teaches what a Big-O *notation itself* means, for the classes beyond the usual
O(1) / O(n) / O(n^2). Before this module every power of n from 2 upward was
explained with the same generic "polynomial" sentence, so a learner who got
O(n^3) or O(n^4) was told nothing about *why* it is cubic, what code shape
produces it, or how far the input can grow before the program stalls.

Covered notations (as emitted by the analyzer, with or without spaces/unicode):

    O(n^2)  O(n^3)  O(n^4) ... O(n^k)        polynomial, k nested dimensions
    O(n^2 log n)  O(n^3 log n) ... O(n^k log n)   polynomial x a log factor
    O(n log^2 n)                              a log factor applied twice
    O(2^n)  O(3^n)  O(c^n)                    exponential, base c
    O(n!)   O(n * n!)                         factorial / permutations
    O(n^n)                                    super-exponential
    O(n * m)  O(n * m * k)                    several independent sizes

Everything is deterministic text built from the notation string; no learner code
is executed.
"""
import math
import re
from dataclasses import dataclass, field
from typing import List, Optional

# operations a plain Python loop body can do in about one second (a deliberately
# modest figure so the "largest practical n" lines are honest for CPython)
_OPS_PER_SECOND = 10_000_000

_SUPERSCRIPT = {"⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
                "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n"}

_DEGREE_NAMES = {
    2: "quadratic", 3: "cubic", 4: "quartic", 5: "quintic",
}

_ORDINALS = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}


@dataclass
class NotationProfile:
    kind: str                       # poly | polylog | exp | fact | superexp | multi | loglog
    raw: str
    name: str                       # "cubic time", "exponential time (base 3)" ...
    degree: int = 0                 # for poly / polylog
    base: int = 2                   # for exp
    log_power: int = 0              # for polylog / loglog
    dims: int = 0                   # for multi
    cues: List[str] = field(default_factory=list)


def _normalise(text: str) -> str:
    s = str(text or "").strip().lower()
    for sup, plain in _SUPERSCRIPT.items():
        s = s.replace(sup, "^" + plain if sup != "ⁿ" else "^n")
    s = s.replace("**", "^").replace("×", "*").replace("·", "*")
    s = s.replace("log₂", "log").replace("log2", "log")
    s = s.replace("amortized", "")
    s = re.sub(r"\s+", "", s)
    s = s.replace("^^", "^")
    return s


def classify_notation(complexity: str) -> Optional[NotationProfile]:
    """Return a NotationProfile for the notations this module explains, or None
    for anything else (O(1), O(n), O(log n), O(n log n), recurrences...)."""
    s = _normalise(complexity)
    m = re.search(r"o\((.*)\)", s)
    if not m or "t(" in s:
        return None
    body = m.group(1)

    if body == "n^n":
        return NotationProfile("superexp", complexity, "super-exponential time")
    if body in ("n*n!", "n!*n"):
        return NotationProfile("fact", complexity, "factorial time (with an extra factor of n)", degree=1)
    if body == "n!":
        return NotationProfile("fact", complexity, "factorial time")

    mexp = re.fullmatch(r"(\d+|c|k)\^n", body)
    if mexp:
        b = int(mexp.group(1)) if mexp.group(1).isdigit() else 2
        label = "exponential time" if b == 2 else f"exponential time (base {b})"
        return NotationProfile("exp", complexity, label, base=b)

    # n log^2 n  /  n (log n)^2
    mll = re.fullmatch(r"n\*?\(?log(?:\^|\)\^)?(\d+)\(?n\)?", body.replace("logn", "log1n"))
    if mll and int(mll.group(1)) >= 2:
        return NotationProfile("loglog", complexity, f"n times log n to the power {mll.group(1)}", log_power=int(mll.group(1)))

    # several independent sizes: n*m, n*m*k, n*m*p ...
    letters = re.findall(r"[a-z]", body) if re.fullmatch(r"[a-z](\*[a-z])+", body) else []
    if len(letters) >= 3:
        return NotationProfile("multi", complexity, f"{_ORDINALS.get(len(letters), len(letters))}-way product time", dims=len(letters))

    # n^k [* log n]
    mp = re.fullmatch(r"n\^(\d+)(?:\*?logn)?", body)
    if mp:
        k = int(mp.group(1))
        if k >= 2:
            has_log = "logn" in body
            if has_log:
                return NotationProfile("polylog", complexity, f"{_DEGREE_NAMES.get(k, f'degree-{k}')} time with a log factor", degree=k, log_power=1)
            if k >= 3:
                return NotationProfile("poly", complexity, f"{_DEGREE_NAMES.get(k, f'degree-{k} polynomial')} time", degree=k)
            return NotationProfile("poly", complexity, "quadratic time", degree=2)
    if body in ("n^d", "n^k"):
        return NotationProfile("poly", complexity, "higher-degree polynomial time", degree=0)
    return None


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _fmt_big(x: float) -> str:
    if x == float("inf") or x > 1e24:
        return "an astronomical number of"
    if x < 1e6:
        return f"{int(round(x)):,}"
    for limit, word in ((1e9, "million"), (1e12, "billion"), (1e15, "trillion"), (1e18, "quadrillion"), (1e21, "quintillion"), (1e24, "sextillion")):
        if x < limit:
            div = limit / 1000
            return f"{x / div:.1f} {word}".replace(".0 ", " ")
    return "an astronomical number of"


def _unit(n: float, word: str) -> str:
    n = int(round(n))
    return f"about {n:,} {word}" + ("" if n == 1 else "s")


def _time_phrase(seconds: float) -> str:
    if seconds < 1:
        return "under a second"
    if seconds < 60:
        return _unit(seconds, "second")
    if seconds < 3600:
        return _unit(seconds / 60, "minute")
    if seconds < 86400:
        return _unit(seconds / 3600, "hour")
    days = seconds / 86400
    if days < 365:
        return _unit(days, "day")
    years = days / 365
    if years < 1e6:
        return _unit(years, "year")
    return "longer than the age of the universe"


def _ops(profile: NotationProfile, n: int) -> float:
    try:
        lg = math.log2(max(n, 2))
        if profile.kind == "poly":
            return float(n) ** (profile.degree or 3)
        if profile.kind == "polylog":
            return float(n) ** profile.degree * lg
        if profile.kind == "loglog":
            return n * lg ** profile.log_power
        if profile.kind == "exp":
            return float(profile.base) ** n
        if profile.kind == "fact":
            v = math.factorial(n)
            return v * n if profile.degree else float(v)
        if profile.kind == "superexp":
            return float(n) ** n
        if profile.kind == "multi":
            return float(n) ** profile.dims
    except OverflowError:
        return float("inf")
    return float(n)


def practical_limit(profile: NotationProfile) -> int:
    """Largest n whose operation count still fits in about one second."""
    lo, hi = 1, 10_000_000
    best = 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if mid > 400 and profile.kind in ("exp", "fact", "superexp"):
            hi = mid - 1
            continue
        if _ops(profile, mid) <= _OPS_PER_SECOND:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return best


def _shape_sentence(profile: NotationProfile) -> str:
    k = profile.degree
    if profile.kind == "poly" and k >= 3:
        loops = " inside ".join(["a loop over n"] * k)
        return (f"The exponent counts how many loops over the input are stacked: {loops}. "
                f"The innermost line runs n x " + " x ".join(["n"] * (k - 1)) + f" = n^{k} times.")
    if profile.kind == "poly" and k == 2:
        return "Two loops over the input stacked inside each other: the inner line runs n x n = n^2 times."
    if profile.kind == "poly":
        return "A fixed number of loops over the input stacked inside each other; the exponent is how many."
    if profile.kind == "polylog":
        return (f"{_ORDINALS.get(k, k)} stacked loops over the input (n^{k}), and every pass also pays a logarithmic step -- "
                "typically a sort, a binary search, a heap operation or a balanced-tree lookup done inside the innermost loop.")
    if profile.kind == "loglog":
        return (f"A pass over n items where each item pays a (log n)^{profile.log_power} step -- usually a logarithmic operation "
                "that itself contains another logarithmic operation (e.g. a sort or search done inside every step of a divide-and-conquer).")
    if profile.kind == "exp":
        b = profile.base
        if b == 2:
            return ("Every extra input item doubles the number of cases: a recursion that calls itself twice per call without remembering answers, "
                    "or code that tries every subset (take it / leave it for each item).")
        return (f"Every extra input item multiplies the number of cases by {b}: a recursion that branches {b} ways per call, "
                f"or code that tries {b} choices for every item (e.g. every string over {b} symbols).")
    if profile.kind == "fact":
        extra = " Each of those arrangements also costs about n to build or check, hence the extra factor." if profile.degree else ""
        return ("The program is going through every possible ordering (permutation) of the items: n choices for the first spot, "
                "n-1 for the second, n-2 for the third, and so on." + extra)
    if profile.kind == "superexp":
        return ("n choices made n separate times -- n x n x ... x n (n times). This is worse than factorial and is usually a sign "
                "of an unrestricted brute-force search.")
    if profile.kind == "multi":
        return ("The input has several independent sizes (for example rows, columns and layers), and the work is their product; "
                "doubling just one of them doubles the work.")
    return ""


def _analogy(profile: NotationProfile) -> str:
    k = profile.degree
    if profile.kind == "poly" and k == 2:
        return "Every person at a party shakes hands with every other person."
    if profile.kind == "poly" and k == 3:
        return "Checking every (row, column, layer) cell of a cube of side n -- or comparing every triple of friends."
    if profile.kind == "poly" and k == 4:
        return "A hypercube with four sides of length n: every cell has four coordinates to visit."
    if profile.kind == "poly":
        return f"A {k}-dimensional grid with n cells along every side: you visit all n^{k} cells."
    if profile.kind == "polylog":
        return "Doing an n^%d-sized job, but at every step you also have to look something up in a sorted phone book." % k
    if profile.kind == "loglog":
        return "Sorting each of n piles of paper, where every pile is itself sorted by splitting it into halves several times."
    if profile.kind == "exp":
        return "A light-switch panel: with n switches there are %d^n on/off patterns to test." % profile.base if profile.base == 2 else \
               f"A combination lock with n dials and {profile.base} positions per dial: {profile.base}^n codes to try."
    if profile.kind == "fact":
        return "Seating n guests in every possible order around a table."
    if profile.kind == "superexp":
        return "Filling n slots where every slot can hold any of n values, with no restriction."
    if profile.kind == "multi":
        return "Visiting every cell of a box whose sides have different lengths."
    return ""


def _examples(profile: NotationProfile) -> str:
    k = profile.degree
    if profile.kind == "poly" and k == 3:
        return "Naive matrix multiplication, Floyd-Warshall all-pairs shortest paths, or checking every triple (a, b, c) such as in 3Sum brute force."
    if profile.kind == "poly" and k == 4:
        return "Brute-force search for four values that satisfy a condition (4Sum brute force), or a 3D-grid DP with one more nested scan."
    if profile.kind == "poly" and k >= 5:
        return "Brute force over five or more values at once -- rare in practice, and almost always a hint to rethink the approach."
    if profile.kind == "poly":
        return "Bubble, selection and insertion sort; comparing every pair of items."
    if profile.kind == "polylog":
        return "Sorting inside a loop, or a binary search done for every pair of items."
    if profile.kind == "loglog":
        return "Some divide-and-conquer algorithms whose combine step itself sorts, and certain geometric algorithms."
    if profile.kind == "exp" and profile.base == 2:
        return "Naive recursive Fibonacci, generating every subset (power set), or brute-force subset-sum / knapsack."
    if profile.kind == "exp":
        return (f"A recursion that calls itself {profile.base} times per call (such as a ternary decision tree), "
                f"or brute-force over every string of length n built from {profile.base} symbols.")
    if profile.kind == "fact":
        return "Generating all permutations, or the brute-force Travelling Salesperson search."
    if profile.kind == "superexp":
        return "Unrestricted brute force over n positions with n options each."
    if profile.kind == "multi":
        return "Processing a 3-D grid of size n x m x k, or comparing every combination of three lists."
    return ""


def _reduce_tip(profile: NotationProfile) -> str:
    k = profile.degree
    if profile.kind == "poly" and k >= 3:
        return (f"Ask whether the innermost loops are searching or matching: replacing one loop with a set/dict lookup, or sorting first and using two pointers, "
                f"usually removes a whole factor of n (n^{k} becomes n^{k - 1}). If every one of the n^{k} combinations really must be visited, it is already optimal.")
    if profile.kind == "poly":
        return "A set/dict lookup or sorting plus two pointers can often bring this down to O(n) or O(n log n)."
    if profile.kind == "polylog":
        return "Move the sort or search out of the innermost loop (do it once, before the loops) to drop the log factor."
    if profile.kind == "loglog":
        return "Check whether the inner sort/search can be done once up front, or replaced by an O(n) merge, to drop one log factor."
    if profile.kind == "exp":
        return "Look for overlapping subproblems: memoization or a DP table turns many exponential recursions into polynomial time."
    if profile.kind == "fact":
        return "Prune the search (backtracking) as soon as a partial answer cannot work, or use dynamic programming over subsets when the problem allows it."
    if profile.kind == "superexp":
        return "Add pruning or restrict the choices so each position can only take values not already used -- that alone turns n^n into n!."
    if profile.kind == "multi":
        return "Check whether one of the dimensions can be dropped (a running total, or keeping only the previous layer)."
    return ""


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------
def notation_name(complexity: str) -> str:
    """Short noun phrase for the class, e.g. 'cubic time'; '' when not covered."""
    p = classify_notation(complexity)
    return p.name if p else ""


def limit_line(complexity: str) -> str:
    """'**Practical limit:** ...' sentence, or ''."""
    p = classify_notation(complexity)
    if not p:
        return ""
    n = practical_limit(p)
    if p.kind in ("exp", "fact", "superexp"):
        sample = 30 if p.kind == "exp" else 20
        ops = _ops(p, sample)
        secs = ops / _OPS_PER_SECOND
        return (f"**Practical limit:** a Python loop manages roughly {_fmt_big(_OPS_PER_SECOND)} simple steps per second, so this only stays comfortable "
                f"up to about n = {n}. At n = {sample} it would already need {_fmt_big(ops)} steps ({_time_phrase(secs)}).")
    ops_1k = _ops(p, 1000)
    if ops_1k > 1e18:
        tail = ""
    else:
        tail = f" At n = 1,000 it needs about {_fmt_big(ops_1k)} steps ({_time_phrase(ops_1k / _OPS_PER_SECOND)})."
    return (f"**Practical limit:** a Python loop manages roughly {_fmt_big(_OPS_PER_SECOND)} simple steps per second, so this stays under about a second "
            f"only up to n = {n:,}.{tail}")


def comparison_line(complexity: str) -> str:
    """How this class compares with the one a step below it."""
    p = classify_notation(complexity)
    if not p:
        return ""
    if p.kind == "poly" and p.degree >= 3:
        k = p.degree
        return (f"**Compared with O(n^{k - 1}):** one more nested level multiplies the cost by another factor of n. "
                f"At n = 1,000 that is {1000:,} times more steps than the O(n^{k - 1}) version.")
    if p.kind == "polylog":
        return f"**Compared with O(n^{p.degree}):** the log factor is small (about 10 at n = 1,000), but it multiplies everything."
    if p.kind == "exp" and p.base >= 3:
        return f"**Compared with O(2^n):** with base {p.base}, adding one item multiplies the work by {p.base} instead of 2, so it becomes unmanageable even sooner."
    if p.kind == "superexp":
        return "**Compared with O(n!):** n^n is larger still -- n! shrinks the choices at every position, n^n never does."
    if p.kind == "fact":
        return "**Compared with O(2^n):** n! overtakes it quickly; by n = 10 it is already 3.6 million versus 1,024."
    return ""


def notation_card(complexity: str, unit: str = "time") -> str:
    """Multi-line 'what does this notation mean?' block. '' when the notation
    is one of the everyday ones that the existing explanations already cover."""
    p = classify_notation(complexity)
    if not p:
        return ""
    if p.kind == "poly" and p.degree == 2:
        return ""       # quadratic is already explained at length elsewhere
    lines = [f"**What `{complexity}` means:** this is {p.name}."]
    shape = _shape_sentence(p)
    if shape:
        lines.append(shape)
    if unit == "space":
        lines = [f"**What `{complexity}` means for memory:** this is {p.name.replace(' time', '')} memory growth."]
        if p.kind in ("poly", "polylog", "multi"):
            d = p.degree or p.dims
            lines.append(f"It usually means a {d}-dimensional structure (such as a 3-D table or a list of lists of lists) holding about "
                         + " x ".join(["n"] * max(d, 2)) + " cells.")
        else:
            lines.append("It usually means the program stores a number of results that multiplies with every extra input item.")
    else:
        an = _analogy(p)
        if an:
            lines.append(f"*Think of it as:* {an}")
        ex = _examples(p)
        if ex:
            lines.append(f"*Typical examples:* {ex}")
    cmp_ = comparison_line(complexity)
    if cmp_ and unit != "space":
        lines.append(cmp_)
    lim = limit_line(complexity)
    if lim and unit != "space":
        lines.append(lim)
    tip = _reduce_tip(p)
    if tip and unit != "space":
        lines.append(f"**Can it be reduced?** {tip}")
    return "\n\n".join(lines)


def short_local_phrase(complexity: str) -> str:
    """One sentence for a single line whose own cost is a higher-order notation."""
    p = classify_notation(complexity)
    if not p:
        return ""
    k = p.degree
    if p.kind == "poly" and k >= 3:
        return (f"On its own, this line is {complexity}: {p.name}, which means roughly {k} loops over the input stacked inside one another "
                f"({' x '.join(['n'] * k)} repetitions).")
    if p.kind == "polylog":
        return (f"On its own, this line is {complexity}: {p.name} -- {_ORDINALS.get(k, k)} stacked loops over the input, plus a logarithmic step "
                "(a sort or search) on every pass.")
    if p.kind == "loglog":
        return f"On its own, this line is {complexity}: a pass over the data where each item pays a repeated logarithmic cost."
    if p.kind == "exp":
        return (f"On its own, this line is {complexity}: {p.name} -- every extra input item multiplies the work by {p.base}.")
    if p.kind == "fact":
        return f"On its own, this line is {complexity}: {p.name} -- it goes through every possible ordering of the items."
    if p.kind == "superexp":
        return f"On its own, this line is {complexity}: {p.name} -- n choices made n times over."
    if p.kind == "multi":
        return f"On its own, this line is {complexity}: the work is the product of {p.dims} independent sizes."
    return ""


def optimal_note(complexity: str) -> str:
    """Honest caveat: some high-degree costs are unavoidable."""
    p = classify_notation(complexity)
    if p and p.kind == "poly" and p.degree == 3:
        return ("Not every cubic algorithm is a mistake: multiplying two n x n matrices the standard way, or Floyd-Warshall, "
                "genuinely needs three nested loops.")
    return ""


def meaning_line(complexity: str) -> str:
    """Compact 'what does this notation mean' note for per-line explanations
    (name + the loop/recursion shape that produces it). '' for everyday classes."""
    p = classify_notation(complexity)
    if not p or (p.kind == "poly" and p.degree == 2):
        return ""
    shape = _shape_sentence(p)
    note = optimal_note(complexity)
    return f"**What `{complexity}` means:** {p.name}. {shape}" + (f" {note}" if note else "")


def reduce_tip(complexity: str) -> str:
    """Public wrapper: improvement advice for the notation, '' when not covered."""
    p = classify_notation(complexity)
    return _reduce_tip(p) if p else ""
