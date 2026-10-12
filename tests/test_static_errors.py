"""
Static run-time error detection, infinite-loop warning, empty-socket handling,
honest totals on parse failure, and the analyzer-copy drift guard.

These cover the feedback items "Fix error detection", "no output when the code
is wrong" and "error handling for code expected to throw".
"""
import os
import subprocess
import sys

import pytest

import conftest  # noqa: F401  (puts frontend/public/python_engine on sys.path)
from scope_detector import detect_name_errors, detect_static_runtime_errors
from logic_lint import detect_logic_issues
from complexity_analyzer.analyzer import analyze_source_code
from blockly_ast import BlocklyASTConverter


def _msg(code):
    r = detect_static_runtime_errors(code)
    return r[0]["message"] if r else None


@pytest.mark.parametrize("code,expected", [
    ("x = 10\ny = 0\nprint(x / y)", "ZeroDivisionError: division by zero"),
    ("print(10 // 0)", "ZeroDivisionError: division by zero"),
    ("a = [1, 2, 3]\nprint(a[10])", "IndexError: list index out of range"),
    ("a = [1, 2, 3]\nprint(a[-4])", "IndexError: list index out of range"),
    ("s = 'hi'\nprint(s[5])", "IndexError: string index out of range"),
    ("print('a' + 1)", "TypeError: can only concatenate str (not \"int\") to str"),
    ("x = 5\nprint('n: ' + x)", "TypeError: can only concatenate str (not \"int\") to str"),
    ("print(3 + 'a')", "TypeError: unsupported operand type(s) for +: 'int' and 'str'"),
    ("int('abc')", "ValueError: invalid literal for int() with base 10: 'abc'"),
])
def test_certain_runtime_errors_are_found(code, expected):
    assert _msg(code) == expected


@pytest.mark.parametrize("code", [
    "y = 0\nif y:\n    print(1 / y)",                                  # guarded
    "y = 0\ntry:\n    print(1 / y)\nexcept ZeroDivisionError:\n    pass",  # handled on purpose
    "a = [1, 2, 3]\na.append(4)\nprint(a[3])",                          # mutated
    "x = 1\nx = 0\nprint(5 / x)",                                       # reassigned
    "y = 0\nprint(y != 0 and 5 / y)",                                   # short-circuit
    "print('%d' % 0)",                                                  # string formatting
    "print('ab' * 3)",                                                  # valid
    "import sys\nsys.exit()\nprint(1 / 0)",                             # unreachable
    "def f(a):\n    return a[10]\nprint(f([1]*20))",                    # inside a function
    "a = [1]\nprint(a[0])",
])
def test_no_false_positives(code):
    assert _msg(code) is None


def test_static_errors_reach_the_name_errors_list_the_ui_merges():
    r = analyze_source_code("x = 10\ny = 0\nprint(x / y)", explain=False)
    assert r["status"] == "success"
    assert any(e["message"].startswith("ZeroDivisionError") and e["blocking"] for e in r["name_errors"])


@pytest.mark.parametrize("code,flagged", [
    ("while True:\n    i = 1", True),
    ("while 1:\n    i = 1", True),
    ("while True:\n    for i in range(3):\n        break\n", True),   # inner break doesn't count
    ("while True:\n    x = input()\n    if x == 'q':\n        break", False),
    ("def f():\n    while True:\n        return 1\n", False),
    ("while True:\n    try:\n        x = 1\n    except Exception:\n        break\n", False),
    ("i = 0\nwhile i < 3:\n    i += 1", False),
])
def test_infinite_while_warning(code, flagged):
    hit = any("always true" in w["message"] for w in detect_logic_issues(code))
    assert hit is flagged


@pytest.mark.parametrize("code", ["for i in range(3)\n    pass", "def f(:\n    pass", "x = (1,"])
def test_parse_failure_has_no_made_up_complexity(code):
    r = analyze_source_code(code, explain=False)
    assert r["status"] == "error"
    assert r["total"] is None and r["space_total"] is None
    # the regex guess is kept only for the accuracy benchmarks
    assert r["fallback_total"] and r["fallback_space_total"]


def test_empty_socket_is_a_name_error_not_a_zero():
    errs = detect_name_errors("for i in range(__empty_socket__):\n    print(i)")
    assert errs and "__empty_socket__" in errs[0]["message"] and errs[0]["blocking"]


def test_empty_socket_round_trips_to_an_empty_socket():
    d = BlocklyASTConverter().convert("for i in range(__empty_socket__):\n    print(i)\n")
    names = [v["name"] for v in d["blocks"]["variables"]]
    assert "__empty_socket__" not in names
    loop = d["blocks"]["blocks"]["blocks"][0]
    assert "TO" not in loop["inputs"]            # left empty, not filled with 0 or a variable


def test_undeclared_n_is_reported_not_defaulted():
    r = analyze_source_code("for i in range(n):\n    print(i)\n", explain=False)
    assert any("name 'n' is not defined" in e["message"] for e in r["name_errors"])


def test_analyzer_copies_are_in_sync():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    res = subprocess.run([sys.executable, os.path.join(root, "tools", "sync_analyzer.py"), "--check"],
                         capture_output=True, text=True)
    assert res.returncode == 0, res.stdout
