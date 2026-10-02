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
