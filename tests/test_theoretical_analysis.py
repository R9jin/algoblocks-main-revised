"""
test_theoretical_analysis.py -- regression tests for the THEORETICAL (asymptotic) analysis rules.

Convention under test: a variable is a symbolic size that grows toward infinity, whatever value it was
assigned (`n = 10` is only a sample value). Only literals written in the construct itself
(`range(10)`, `while i < 64`, `range(2**10)`) are constants.

Run:  pytest tests/test_theoretical_analysis.py -v      (also runs with plain `python`)
"""
import io
from contextlib import redirect_stdout

import pytest

from conftest import ENGINE_ROOT  # noqa: F401  (puts python_engine on sys.path)
import complexity_analyzer.code_preprocessor as cp
from complexity_analyzer.analyzer import analyze_source_code


@pytest.fixture(autouse=True)
def _theoretical_defaults():
    saved = (cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, getattr(cp, "SUM_OF_INDEPENDENT_TERMS", False))
    cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, cp.SUM_OF_INDEPENDENT_TERMS = True, True, False
    yield
    cp.THEORETICAL_MODE, cp.MULTI_VARIABLE_NOTATION, cp.SUM_OF_INDEPENDENT_TERMS = saved


def run(src):
    with redirect_stdout(io.StringIO()):
        return analyze_source_code(src)


def time_of(src):
    return run(src)["total"]


def indent(body):
    return "def f(n):\n" + "".join("    " + l + "\n" for l in body.splitlines())


# --- 1. an assigned value never makes a variable constant ------------------------------------
@pytest.mark.parametrize("src,expected", [
    ("n = 10\nfor i in range(n):\n    print(i)\n", "O(n)"),
    ("n = 10\nfor i in range(n):\n    for j in range(n):\n        print(i)\n", "O(n^2)"),
    ("n = 10\nfor i in range(n):\n    for j in range(n):\n        for k in range(n):\n            pass\n", "O(n^3)"),
    ("MAX = 50\nfor i in range(MAX):\n    pass\n", "O(n)"),
    ("n = 100\ni = 0\nwhile i < n:\n    i += 1\n", "O(n)"),
    ("n = 8\narr = [0] * n\n", "O(n)"),
])
def test_assigned_value_stays_symbolic(src, expected):
    assert time_of(src) == expected


def test_script_level_and_parameter_agree_on_every_class():
    bodies = [
        "i = n\nwhile i > 1:\n    i //= 2\n",                                  # log n
        "for k in range(n):\n    i = 1\n    while i < n:\n        i *= 2\n",     # n log n
        "i = 1\nwhile i * i <= n:\n    i += 1\n",                                # sqrt n
        "x = 0\nfor i in range(2**n):\n    x += 1\n",                            # 2^n
        "for i in range(n):\n    for j in range(i):\n        pass\n",            # n^2
    ]
    for b in bodies:
        assert time_of("n = 16\n" + b) == time_of(indent(b)), b


# --- 2. literals written in the construct -------------------------------------------------------
# A `for` over range(<fixed constant>) is scored as the loop pattern (O(n)); the explanation says
# that STRICT asymptotic analysis of the exact code is O(1). (cp.SYMBOLIC_FIXED_RANGE = False
# restores the old O(1) scoring.) A literal-bounded `while` counter is still O(1).
@pytest.mark.parametrize("src,expected", [
    ("for i in range(10):\n    print(i)\n", "O(n)"),
    ("for i in range(4):\n    print(i)\n", "O(n)"),
    ("for i in range(1, 10, 2):\n    pass\n", "O(n)"),
    ("for i in range(10):\n    for j in range(10):\n        pass\n", "O(n^2)"),
    ("for i in range(2**10):\n    pass\n", "O(n)"),
    ("i = 1\nwhile i < 64:\n    i *= 2\n", "O(1)"),
    ("for i in range(4):\n    x = 1\n    break\n", "O(1)"),   # unconditional break: really one pass
])
def test_fixed_range_scored_as_loop_pattern(src, expected):
    assert time_of(src) == expected


def test_fixed_range_switch_restores_strict_scoring():
    saved = cp.SYMBOLIC_FIXED_RANGE
    cp.SYMBOLIC_FIXED_RANGE = False
    try:
        assert time_of("for i in range(10):\n    print(i)\n") == "O(1)"
    finally:
        cp.SYMBOLIC_FIXED_RANGE = saved


def test_fixed_range_explanation_states_the_strict_result_per_line():
    r = run("for i in range(4):\n    print(i)\n")
    assert r["total"] == "O(n)"
    for line in r["lines"]:
        assert "Strict asymptotic analysis" in line["time_explanation"], line["lineOfCode"]
        assert "`O(1)`" in line["time_explanation"]
    assert "Strict asymptotic analysis" in r["overall_explanation"]
    assert "this exact program is therefore `O(1)`" in r["overall_explanation"]


def test_fixed_range_inside_a_variable_loop_is_strictly_linear():
    r = run("def f(n):\n    for i in range(n):\n        for j in range(4):\n            pass\n")
    assert r["total"] == "O(n^2)"
    inner = next(l for l in r["lines"] if l["lineOfCode"].strip().startswith("for j"))
    assert "Strictly, this loop is therefore `O(n)`" in inner["time_explanation"]
    outer = next(l for l in r["lines"] if l["lineOfCode"].strip().startswith("for i"))
    assert "Strict asymptotic analysis" not in outer["time_explanation"]   # a variable loop needs no note


# --- 3. doubling / halving over a size variable is logarithmic --------------------------------
@pytest.mark.parametrize("src", [
    "def f(n):\n    i = 1\n    while i < n:\n        i *= 2\n",
    "def f(n):\n    x = n\n    while x > 0:\n        x //= 2\n",
    "n = 64\ni = n\nwhile i > 1:\n    i //= 2\n",
])
def test_log_loops(src):
    assert time_of(src) == "O(log n)"


def test_literal_loop_nested_in_symbolic_loop_is_linear():
    assert time_of("def f(n):\n    for k in range(n):\n        i = 1\n        while i < 8:\n            i *= 2\n") == "O(n)"


# --- 4. polynomial bounds in the range() argument ---------------------------------------------
@pytest.mark.parametrize("bound,expected", [
    ("n**2", "O(n^2)"), ("n**3", "O(n^3)"), ("n*n", "O(n^2)"), ("n*(n-1)//2", "O(n^2)"),
    ("2*n", "O(n)"), ("len(a)*2", "O(n)"),
])
def test_polynomial_range_bounds(bound, expected):
    assert time_of(f"def f(n, a):\n    for i in range({bound}):\n        pass\n") == expected


@pytest.mark.parametrize("bound", ["2**n", "1 << n"])
def test_exponent_that_grows_is_exponential(bound):
    assert time_of(f"def f(n):\n    for i in range({bound}):\n        pass\n") == "O(2^n)"


# --- 5. distinct size variables stay distinct --------------------------------------------------
def test_nested_loops_over_different_sizes():
    assert time_of("def f(n, m):\n    for i in range(n):\n        for j in range(m):\n            pass\n") == "O(n * m)"


def test_same_size_still_collapses_to_power():
    assert time_of("def f(n):\n    for i in range(n):\n        for j in range(n):\n            pass\n") == "O(n^2)"


def test_switch_restores_single_size_convention():
    cp.MULTI_VARIABLE_NOTATION = False
    assert time_of("def f(n, m):\n    for i in range(n):\n        for j in range(m):\n            pass\n") == "O(n^2)"


# --- 6. recursion ------------------------------------------------------------------------------
@pytest.mark.parametrize("src,expected", [
    ("def p(k):\n    if k == 0:\n        return\n    for i in range(k):\n        p(k-1)\n", "O(n!)"),
    ("def p(n):\n    if n <= 1:\n        return\n    for i in range(n):\n        p(n-1)\n", "O(n!)"),
    # constant branching factor is exponential, not factorial
    ("def g(n):\n    if n == 0:\n        return\n    for i in range(3):\n        g(n-1)\n", "O(2^n)"),
    ("def g(n):\n    if n == 0:\n        return 1\n    return g(n-1) + g(n-1)\n", "O(2^n)"),
    ("def g(n):\n    if n == 0:\n        return 0\n    return 1 + g(n-1)\n", "O(n)"),
])
def test_recursion_classes(src, expected):
    assert time_of(src) == expected


# --- 7. documented exception: fixed alphabet sizes ---------------------------------------------
def test_alphabet_size_constant_is_constant():
    src = "MAX_CHAR = 26\ndef f(s):\n    c = [0] * MAX_CHAR\n    for ch in s:\n        c[ord(ch) - 97] += 1\n"
    assert time_of(src) == "O(n)"          # the loop over s, not the 26-slot table


# --- 8. explanations never quote what one run happened to do -----------------------------------
def test_explanations_are_not_runtime_based():
    r = run("n = 10\nfor i in range(n):\n    arr = [i] * n\n")
    for line in r["lines"]:
        text = (line.get("time_explanation") or "") + (line.get("space_explanation") or "")
        assert "actually ran" not in text and "observed during this run" not in text


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))


def _symbolic_note(src):
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        r = analyze_source_code(src)
    return r["overall_explanation"]


def test_symbolic_scoring_note_is_not_limited_to_for_loops():
    assert "Symbolic scoring" in _symbolic_note("for i in range(5):\n    print(i)\n")
    assert "Symbolic scoring" in _symbolic_note("n = 10\nt = 0\nfor i in range(n):\n    t += i\n")
    assert "Symbolic scoring" in _symbolic_note(
        "def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\nprint(fact(5))\n")
    # a real input size needs no such note
    assert "Symbolic scoring" not in _symbolic_note("def f(n):\n    t = 0\n    for i in range(n):\n        t += i\n    return t\n")
