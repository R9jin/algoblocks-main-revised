"""
test_notation_clarity.py -- the educational insight must clear up the places where the
same code can be read two ways (fixed number vs n, where n comes from, direct ranges,
two inputs, two styles with the same output) WITHOUT changing the complexity result and
without contradicting it.
"""
import contextlib
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "python_engine")))

from complexity_analyzer.analyzer import analyze_source_code  # noqa: E402


def _run(src):
    with contextlib.redirect_stdout(io.StringIO()):
        r = analyze_source_code(src)
    lines = r["lines"].values() if isinstance(r["lines"], dict) else r["lines"]
    text = r["overall_explanation"] + "\n".join(v["time_explanation"] for v in lines)
    return r, text


CASES = [
    # (name, source, expected total, phrase that must appear)
    ("fixed literal", "t = 0\nfor i in range(1000):\n    t += 1\n", "O(1)", "A fixed number is not n"),
    ("fixed variable", "n = 10\nt = 0\nfor i in range(n):\n    t += i\n", "O(1)", "A variable can still be a constant"),
    ("typed-in n", "n = int(input())\nt = 0\nfor i in range(n):\n    t += i\n", "O(n)", "Where n comes from"),
    ("parameter", "def f(n):\n    t = 0\n    for i in range(n):\n        t += 1\n    return t\n", "O(n)", "A number you pass in is the size"),
    ("size alias", "def f(a):\n    k = len(a)\n    t = 0\n    for i in range(k):\n        t += a[i]\n    return t\n", "O(n)", "A new name is still the same n"),
    ("offset", "def f(n):\n    t = 0\n    for i in range(5, n):\n        t += 1\n    return t\n", "O(n)", "A start offset is dropped"),
    ("step", "def f(n):\n    t = 0\n    for i in range(0, n, 2):\n        t += 1\n    return t\n", "O(n)", "Skipping doesn't change the class"),
    ("fraction", "def f(n):\n    t = 0\n    for i in range(n // 2):\n        t += 1\n    return t\n", "O(n)", "Constants and offsets don't change the class"),
    ("constant inner loop", "def f(n):\n    t = 0\n    for i in range(n):\n        for j in range(3):\n            t += 1\n    return t\n", "O(n)", "Not every nested loop is another factor of n"),
    ("two inputs", "def f(a, b):\n    t = 0\n    for x in a:\n        for y in b:\n            t += 1\n    return t\n", "O(n^2)", "Two different inputs"),
    ("fixed gap", "def f(a):\n    t = 0\n    for i in range(len(a)):\n        for j in range(i, i + 3):\n            t += 1\n    return t\n", "O(n^2)", "A direct range counts the gap"),
    ("formula vs loop", "def f(n):\n    return n * (n + 1) // 2\n", "O(1)", "Same output, different Big-O"),
    ("digits", "def f(n):\n    c = 0\n    while n > 0:\n        n //= 10\n        c += 1\n    return c\n", "O(log n)", "Value vs. digits"),
]


@pytest.mark.parametrize("name,src,total,phrase", CASES, ids=[c[0] for c in CASES])
def test_clarity_note_appears_and_total_is_unchanged(name, src, total, phrase):
    r, text = _run(src)
    assert r["total"] == total, f"{name}: analyzer total changed to {r['total']}"
    assert phrase in text, f"{name}: expected a note containing {phrase!r}"


def test_loops_but_still_constant_is_said_at_program_level():
    _, text = _run("n = 10\nt = 0\nfor i in range(n):\n    t += i\n")
    assert "Loops, but still O(1)" in text


def test_never_claims_o1_when_the_analyzer_reads_the_bound_as_a_size():
    # M / N are kept as sizes by the analyzer even when assigned a literal (matrix dimensions),
    # so the notes must not call these loops O(1).
    src = "M = 6\nN = 6\ndef f(g):\n    t = 0\n    for i in range(M):\n        for j in range(N):\n            t += g[i][j]\n    return t\n"
    r, text = _run(src)
    assert r["total"] != "O(1)"
    assert "A variable can still be a constant" not in text
    assert "A name for a fixed number" not in text


def test_n_times_n_is_not_called_linear():
    _, text = _run("def f(n):\n    t = 0\n    for i in range(n * n):\n        t += 1\n    return t\n")
    assert "Constants and offsets don't change the class" not in text
