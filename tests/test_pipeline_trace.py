import sys
import os
import pytest

# Ensure complexity_analyzer can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'python_engine')))

from complexity_analyzer.pipeline_trace import trace_pipeline
from complexity_analyzer.analyzer import analyze_source_code


def test_trace_simple_script():
    code = "x = 1\ny = 2\nz = x + y\n"
    res = trace_pipeline(code)
    assert res["status"] == "success"
    assert res["final"]["total"] == "O(1)"
    assert res["final"]["space_total"] == "O(1)"
    assert len(res["ast"]) > 0
    assert any(e["stage"] == "init" for e in res["events"])
    assert any(e["stage"] == "synthesis" for e in res["events"])
    assert any(e["stage"] == "result" for e in res["events"])


def test_trace_matches_analyzer_totals():
    code = """
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
"""
    direct = analyze_source_code(code)
    traced = trace_pipeline(code)

    assert traced["status"] == "success"
    assert traced["final"]["total"] == direct["total"]
    assert traced["final"]["space_total"] == direct["space_total"]


def test_trace_recursive_reconciliation():
    code = """
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] < right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
"""
    traced = trace_pipeline(code)
    assert traced["status"] == "success"

    # Verify reconcile events were emitted
    reconcile_events = [e for e in traced["events"] if e.get("kind") == "reconcile"]
    assert len(reconcile_events) >= 1

    # Verify Master Theorem assigner classifies merge as closed and merge_sort as resolved
    master_events = [e for e in traced["events"] if e.get("stage") == "master" and e.get("kind") == "resolve"]
    master_by_name = {e["name"]: e for e in master_events}

    assert "merge" in master_by_name
    assert master_by_name["merge"]["status"] == "closed"


def test_trace_dominance_ladder_ordered():
    code = """
def mixed(arr):
    x = 1
    for i in range(len(arr)):
        x += 1
    for i in range(len(arr)):
        for j in range(len(arr)):
            x += 2
"""
    traced = trace_pipeline(code)
    eff_time = next(e for e in traced["events"] if e.get("stage") == "efficiency" and e.get("kind") == "time")
    candidates = eff_time["candidates"]

    # Candidates must only contain Big-O costs
    for c in candidates:
        assert c.startswith("O(")

    # Must contain O(n^2)
    assert eff_time["winner"] in ["O(n^2)", "O(n²)", "O(n2)"]


def test_trace_syntax_error_fallback():
    code = "def bad_syntax(:\n    pass"
    traced = trace_pipeline(code)
    assert traced["status"] == "fallback"
    assert "fallback_reason" in traced
    assert any(e["kind"] == "parse_error" for e in traced["events"])
    assert any(e["kind"] == "fallback" for e in traced["events"])


def test_trace_async_function_support():
    code = """
async def async_worker(arr):
    total = 0
    for x in arr:
        for y in arr:
            total += x * y
    return total
"""
    traced = trace_pipeline(code)
    assert traced["status"] == "success"
    assert "async_worker" in traced["final"]["symbol_table"]
    assert traced["final"]["total"] in ["O(n^2)", "O(n²)", "O(n2)"]


def test_trace_large_statement_budget():
    # 100 statements
    lines = [f"x{i} = {i}" for i in range(100)]
    code = "\n".join(lines)
    traced = trace_pipeline(code)
    assert traced["status"] == "success"

    stmt_nodes = [n for n in traced["ast"] if n.get("stmt")]
    assert len(stmt_nodes) >= 100
    assert not traced.get("ast_truncated", False)


def test_trace_honest_record_changed_flag():
    code = """
def test_flags(n):
    a = 1
    b = 2
    c = 3
"""
    traced = trace_pipeline(code)
    records = [e for e in traced["events"] if e.get("kind") == "record"]
    assert any("changed" in r for r in records)


def test_trace_callgraph_flags_no_main_recursive():
    code = """
def step(n):
    if n > 0:
        step(n - 1)
step(10)
"""
    traced = trace_pipeline(code)
    flags = next(e for e in traced["events"] if e.get("stage") == "callgraph" and e.get("kind") == "flags")
    assert "__main__" not in flags["recursive"]
    assert "__main__" not in flags["indirect"]


# --------------------------------------------------------------------------
# Dead code: functions nothing live calls must not count toward the total.
# --------------------------------------------------------------------------

DEAD_HELPER = """
def helper(arr):
    total = 0
    for i in arr:
        for j in arr:
            total += i * j
    return total

def used(arr):
    s = 0
    for x in arr:
        s += x
    return s

data = [1, 2, 3]
print(used(data))
"""


def test_uncalled_function_is_excluded_from_total():
    res = analyze_source_code(DEAD_HELPER)
    assert res["total"] == "O(n)"  # not O(n^2) from the dead helper()


def test_dead_function_lines_are_marked_dead():
    res = analyze_source_code(DEAD_HELPER.lstrip("\n"))
    ops = {l["lineno"]: l["operation"] for l in res["lines"]}
    # helper() body = lines 2-6 (line 1 is its `def`, which just records the declaration)
    assert all(ops[n] == "Dead Code" for n in range(2, 7))
    assert ops[9] != "Dead Code"  # used() body stays live


def test_function_called_only_by_dead_function_is_dead():
    code = DEAD_HELPER + "\ndef a(x):\n    return b(x)\n\ndef b(x):\n    for i in x:\n        for j in x:\n            pass\n"
    assert analyze_source_code(code)["total"] == "O(n)"


def test_transitively_called_function_stays_live():
    code = """
def inner(arr):
    for i in arr:
        for j in arr:
            pass

def outer(arr):
    inner(arr)

outer([1, 2, 3])
"""
    assert analyze_source_code(code)["total"] == "O(n^2)"


def test_callback_reference_keeps_function_live():
    code = """
def slow_key(x):
    s = 0
    for i in range(x):
        for j in range(x):
            s += 1
    return s

def run(xs):
    return sorted(xs, key=slow_key)

run([3, 1, 2])
"""
    res = analyze_source_code(code)
    ops = {l["lineno"]: l["operation"] for l in res["lines"]}
    assert ops[3] != "Dead Code"


def test_definitions_only_snippet_is_still_analysed():
    code = "def f(arr):\n    for i in arr:\n        for j in arr:\n            pass\n"
    assert analyze_source_code(code)["total"] == "O(n^2)"


def test_pipeline_trace_reports_dead_funcs_and_matches_analyzer():
    traced = trace_pipeline(DEAD_HELPER)
    assert traced["status"] == "success"
    assert traced["final"]["dead_funcs"] == ["helper"]
    assert traced["final"]["total"] == analyze_source_code(DEAD_HELPER)["total"] == "O(n)"
    flags = [e for e in traced["events"] if e.get("stage") == "callgraph" and e.get("kind") == "flags"][0]
    assert flags["dead"] == ["helper"]
    assert "helper" not in flags["reachable"]


# --------------------------------------------------------------------------
# Dead-code signifier: every dead line carries a kind + human-readable reason.
# --------------------------------------------------------------------------

def _by_line(res):
    return {l["lineno"]: l for l in res["lines"]}


def test_unreachable_after_return_has_reason():
    code = "def f(xs):\n    return xs\n    print('never')\n\nf([1])\n"
    row = _by_line(analyze_source_code(code))[3]
    assert row["operation"] == "Dead Code"
    assert row["dead_kind"] == "unreachable"
    assert "return" in row["dead_reason"] and "line 2" in row["dead_reason"]


def test_uncalled_function_lines_carry_reason_including_def_line():
    rows = _by_line(analyze_source_code(DEAD_HELPER.lstrip("\n")))
    for n in range(1, 7):  # def line + body
        assert rows[n]["dead_kind"] == "uncalled_function", n
        assert "never called" in rows[n]["dead_reason"]
    assert "dead_reason" not in rows[9]


def test_function_only_called_by_dead_function_explains_chain():
    code = DEAD_HELPER.lstrip("\n") + "\ndef a(x):\n    return b(x)\n\ndef b(x):\n    return x\n"
    rows = _by_line(analyze_source_code(code))
    b_def = max(n for n, r in rows.items() if r["lineOfCode"].strip().startswith("def b"))
    assert "only called from dead code" in rows[b_def]["dead_reason"]


def test_live_lines_have_no_dead_fields():
    res = analyze_source_code("def f(a):\n    return a\n\nf(1)\n")
    assert all("dead_reason" not in l for l in res["lines"])


def test_pipeline_ledger_rows_include_dead_reason():
    traced = trace_pipeline(DEAD_HELPER.lstrip("\n"))
    recon = [e for e in traced["events"] if e.get("stage") == "synthesis" and e.get("kind") == "reconcile"][0]
    dead_rows = [r for r in recon["rows"] if r.get("dead_reason")]
    assert dead_rows and all("never called" in r["dead_reason"] for r in dead_rows)
