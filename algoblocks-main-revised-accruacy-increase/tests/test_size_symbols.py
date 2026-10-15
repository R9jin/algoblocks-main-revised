"""
test_size_symbols.py -- regression tests for symbolic size tracking (conventional asymptotic analysis).

A loop bound is a symbolic size. Two bounds are the SAME symbol only when they are the same quantity;
otherwise each independent size keeps its own letter (n, m, k ...) and the result keeps them apart:

    for i in range(x): for j in range(y)      -> O(n * m)     (x and y are different sizes)
    n = len(arr); range(n) x range(len(arr))  -> O(n^2)       (same size)
    two loops one after the other over x, y   -> O(n + m)

Run:  pytest tests/test_size_symbols.py -v
"""
import io
from contextlib import redirect_stdout

import pytest

from conftest import ENGINE_ROOT  # noqa: F401  (puts python_engine on sys.path)
import complexity_analyzer.code_preprocessor as cp
from complexity_analyzer.analyzer import analyze_source_code


@pytest.fixture(autouse=True)
def _defaults():
    saved = (cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, cp.SUM_OF_INDEPENDENT_TERMS)
    cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, cp.SUM_OF_INDEPENDENT_TERMS = True, True, True
    yield
    cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, cp.SUM_OF_INDEPENDENT_TERMS = saved


def run(src):
    with redirect_stdout(io.StringIO()):
        return analyze_source_code(src)


def time_of(src):
    return run(src)["total"]


def lines_text(src):
    r = run(src)
    return " ".join(l["time_explanation"] for l in r["lines"]) + " " + str(r["overall_explanation"])


# --- 1. the variable's identity decides the symbol, not its spelling ---------------------------------
@pytest.mark.parametrize("src,expected", [
    ("x = 10\ny = 20\nfor i in range(x):\n    for j in range(y):\n        print(i, j)\n", "O(n * m)"),
    ("n = 10\nm = 20\nfor i in range(n):\n    for j in range(m):\n        print(i, j)\n", "O(n * m)"),
    ("def f(rows, cols):\n    for i in range(rows):\n        for j in range(cols):\n            pass\n", "O(n * m)"),
    ("def f(a, b):\n    for i in range(a):\n        for j in range(b):\n            pass\n", "O(n * m)"),
    ("def f(a, b, c):\n    for i in range(a):\n        for j in range(b):\n            for k in range(c):\n                pass\n", "O(n * m * k)"),
    ("x = 10\nfor i in range(x):\n    for j in range(x):\n        pass\n", "O(n^2)"),
])
def test_independent_sizes_stay_separate(src, expected):
    assert time_of(src) == expected


def test_polynomial_bound_with_second_size():
    assert time_of("x = 10\ny = 20\nfor i in range(x**2):\n    for j in range(y):\n        print(i, j)\n") == "O(n^2 * m)"
    assert time_of("def f(n, m):\n    for i in range(n * m):\n        pass\n") == "O(n * m)"


# --- 2. different names, same size -> one symbol ----------------------------------------------------
@pytest.mark.parametrize("src", [
    "def f(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(len(arr)):\n            pass\n",
    "def f(arr, n):\n    for i in range(n):\n        for j in range(len(arr)):\n            pass\n",           # f(arr, n) idiom
    "def f(arr):\n    size = len(arr)\n    half = size // 2\n    for i in range(half):\n        for j in range(size):\n            pass\n",
    "def f(n):\n    for i in range(n):\n        for j in range(i):\n            pass\n",                         # triangular
    "def f(a, b):\n    if len(a) != len(b):\n        return False\n    for x in a:\n        for y in b:\n            pass\n",  # equal-length guard
])
def test_same_size_is_one_symbol(src):
    assert time_of(src) == "O(n^2)"


def test_counters_and_built_structures_are_not_new_sizes():
    src = ("def f(arr):\n    lo, hi = 0, len(arr) - 1\n    out = []\n    while lo < hi:\n        out.append(arr[lo])\n"
           "        lo += 1\n    for v in out:\n        pass\n")
    assert time_of(src) == "O(n)"


def test_alphabet_constant_is_not_a_size():
    src = "MAX_CHAR = 26\ndef f(s):\n    count = [0] * MAX_CHAR\n    for ch in s:\n        count[ord(ch) - 97] += 1\n    for i in range(MAX_CHAR):\n        pass\n"
    assert time_of(src) == "O(n)"


# --- 3. matrices: rows and columns are different sizes -----------------------------------------------
def test_grid_rows_by_columns():
    assert time_of("def f(grid):\n    for i in range(len(grid)):\n        for j in range(len(grid[0])):\n            pass\n") == "O(n * m)"
    assert time_of("def f(grid):\n    for row in grid:\n        for v in row:\n            pass\n") == "O(n * m)"


def test_table_allocation_keeps_both_sides():
    src = "def f(a, b):\n    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]\n    return dp\n"
    r = run(src)
    assert r["total"] == "O(n * m)" and r["space_total"] == "O(n * m)"


# --- 4. sequential code adds, nested code multiplies --------------------------------------------------
@pytest.mark.parametrize("src,expected", [
    ("n = 10\nm = 20\nfor i in range(n):\n    print(i)\nfor j in range(m):\n    print(j)\n", "O(n + m)"),
    ("x = 1\ny = 2\nz = 3\nfor i in range(x): pass\nfor i in range(y): pass\nfor i in range(z): pass\n", "O(n + m + k)"),
    ("def f(n, m):\n    for i in range(n):\n        for j in range(n):\n            pass\n    for k in range(m):\n        pass\n", "O(n^2 + m)"),
    ("def f(n, m):\n    for i in range(n + m):\n        pass\n", "O(n + m)"),
    ("def f(n):\n    for i in range(n):\n        pass\n    for j in range(n):\n        pass\n", "O(n)"),
])
def test_sequential_sizes_add(src, expected):
    assert time_of(src) == expected


# --- 5. the theoretical-mode rules still hold ------------------------------------------------------
@pytest.mark.parametrize("src,expected", [
    ("n = 10\nfor i in range(n):\n    print(i)\n", "O(n)"),
    ("for i in range(10):\n    pass\n", "O(n)"),
    ("def f(n):\n    for i in range(n):\n        for j in range(10):\n            pass\n", "O(n^2)"),
    ("i = 1\nwhile i < 64:\n    i *= 2\n", "O(1)"),
    ("def f(n):\n    i = 1\n    while i < n:\n        i *= 2\n", "O(log n)"),
])
def test_theoretical_rules_unchanged(src, expected):
    assert time_of(src) == expected


# --- 6. the explanation agrees with the badge ------------------------------------------------------
def test_explanation_matches_badge_for_two_sizes():
    txt = lines_text("x = 10\ny = 20\nfor i in range(x):\n    for j in range(y):\n        print(i, j)\n")
    assert "single n" not in txt and "exact only when" not in txt
    assert "O(n * m)" in txt


def test_no_two_sizes_note_when_names_differ_but_size_is_same():
    txt = lines_text("def f(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(len(arr)):\n            pass\n")
    assert "Two different" not in txt


# --- 7. switches ---------------------------------------------------------------------------------------
def test_switches_restore_single_size_output():
    src = "x = 10\ny = 20\nfor i in range(x):\n    for j in range(y):\n        pass\n"
    cp.MULTI_VARIABLE_NOTATION = False
    assert time_of(src) == "O(n^2)"
    cp.MULTI_VARIABLE_NOTATION = True
    cp.SUM_OF_INDEPENDENT_TERMS = False
    assert time_of("n = 1\nm = 2\nfor i in range(n): pass\nfor j in range(m): pass\n") == "O(n)"
