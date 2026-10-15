"""
Entry-point execution vs function-level analysis, plus local/cumulative space attribution.

Policy under test (see AlgoBlocks "Required analysis policy"):
  * An uncalled helper never executes, so it adds NOTHING to the entry point's total.
  * Its body is still analysed on its own: its rows carry its own complexity and are flagged
    `uncalled_function` / scope == "function-level".
  * A CALLED helper is folded into the caller's complexity.
  * Creating an empty container allocates O(1); the O(V) peak is attributed to the statements
    that grow it, and the program's overall space is unchanged by that re-attribution.
Assumptions: n, m, V, E are independent symbolic sizes.
"""
import pytest
import conftest  # noqa: F401  (puts the engine on sys.path)
from complexity_analyzer.analyzer import analyze_source_code

FACT = '''    def factorial_search(items):
        if len(items) <= 1:
            return 1
        total = 0
        for i in range(len(items)):
            remaining = items[:i] + items[i + 1:]
            total += factorial_search(remaining)
        return total
'''
EXP = '''    def exponential(k):
        if k <= 0:
            return 1
        return exponential(k - 1) + exponential(k - 1)
'''
BFS = '''    visited = set()
    queue = []
    if graph:
        start = next(iter(graph))
        visited.add(start)
        queue.append(start)
        while queue:
            vertex = queue.pop(0)
            for neighbor in graph.get(vertex, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
'''


def run(src):
    r = analyze_source_code(src)
    assert r["status"] == "success", r.get("error")
    return r


def rows(r, text):
    return [l for l in r["lines"] if text in l["lineOfCode"]]


def test_uncalled_recursive_helper_is_excluded_from_entry_total():
    src = "def f(n):\n    x = 0\n    for i in range(n):\n        x += i\n" + FACT + "    return x\n"
    r = run(src)
    assert r["total"] == "O(n)"          # not O(n!)
    assert r["space_total"] == "O(1)"    # not O(n^2)


def test_uncalled_helper_is_analysed_at_function_level():
    src = "def f(n):\n    x = 0\n    for i in range(n):\n        x += i\n" + FACT + "    return x\n"
    r = run(src)
    flagged = [l for l in r["lines"] if l.get("uncalled_function")]
    assert flagged, "uncalled helper rows must be flagged"
    assert all(l["scope"] == "function-level" for l in flagged)
    assert all(l["operation"] != "Dead Code" for l in flagged)
    assert rows(r, "for i in range(len(items))")[0]["time"] == "O(n!)"   # its OWN complexity is reported
    assert rows(r, "remaining = items[:i]")[0]["space"] == "O(n^2)"
    # the entry point's own rows are not flagged
    assert not rows(r, "x += i")[0].get("uncalled_function")


def test_called_recursive_helper_is_included_in_caller():
    src = "def f(arr):\n    x = 0\n" + FACT + "    x = factorial_search(arr)\n    return x\n"
    r = run(src)
    assert r["total"] == "O(n!)"
    assert not any(l.get("uncalled_function") for l in r["lines"])


def test_only_the_called_helper_counts():
    src = "def f(n):\n" + EXP + FACT + "    return exponential(n)\n"
    r = run(src)
    assert r["total"] == "O(2^n)"        # factorial_search is never called
    assert rows(r, "def factorial_search")[0].get("uncalled_function")
    assert not rows(r, "def exponential")[0].get("uncalled_function")


def test_uncalled_helper_does_not_wipe_callers_running_maxima():
    # the nested def sits AFTER the heavy loops; the caller's total must survive it
    src = ("def f(n):\n    x = 0\n    for i in range(n):\n        for j in range(n):\n            x += 1\n"
           + EXP + "    return x\n")
    assert run(src)["total"] == "O(n^2)"


def test_top_level_definition_only_snippet_is_still_analysed():
    src = "def exponential(k):\n    if k <= 0:\n        return 1\n    return exponential(k - 1) + exponential(k - 1)\n"
    assert run(src)["total"] == "O(2^n)"


def test_exponential_base_case_is_not_labelled_linear():
    r = run("def exponential(k):\n    if k <= 0:\n        return 1\n    return exponential(k - 1) + exponential(k - 1)\n")
    # cumulative executions of the base case equal the number of invocations: 2^n, never O(n)
    assert rows(r, "if k <= 0")[0]["time"] == "O(2^n)"
    assert rows(r, "return 1")[0]["time"] == "O(2^n)"


def test_empty_container_init_is_constant_space_and_growth_is_attributed_to_the_loop():
    r = run("def f(graph):\n" + BFS + "    return 0\n")
    assert rows(r, "visited = set()")[0]["space"] == "O(1)"
    assert rows(r, "queue = []")[0]["space"] == "O(1)"
    growth = [l for l in r["lines"] if l["lineOfCode"].strip() in ("visited.add(neighbor)", "queue.append(neighbor)")]
    assert growth and all(l["space"] in ("O(V)", "O(V+E)") for l in growth)
    # re-attribution must not change the program's overall space
    assert r["space_total"] in ("O(n)", "O(V)", "O(V+E)")


def test_list_pop0_bfs_is_quadratic_in_v_but_deque_is_linear():
    r = run("def f(graph):\n" + BFS + "    return 0\n")
    assert rows(r, "queue.pop(0)")[0]["time"] == "O(V^2)"
    deque_src = ("from collections import deque\ndef f(graph):\n    visited = set()\n    queue = deque()\n"
                 "    start = next(iter(graph))\n    visited.add(start)\n    queue.append(start)\n    while queue:\n"
                 "        vertex = queue.popleft()\n        for neighbor in graph.get(vertex, []):\n"
                 "            if neighbor not in visited:\n                visited.add(neighbor)\n"
                 "                queue.append(neighbor)\n    return 0\n")
    assert run(deque_src)["total"] == "O(V+E)"


def test_independent_dimensions_and_graph_symbols_stay_separate():
    src = ("def f(n, m, graph):\n    x = 0\n    for i in range(n):\n        for j in range(n):\n            for k in range(m):\n"
           "                x += 1\n    for i in range(n):\n        for j in range(n):\n            for k in range(n):\n"
           "                x += 1\n" + BFS + "    return x\n")
    r = run(src)
    assert r["total"] == "O(n^2 * m + n^3 + V^2+E)"
    assert r["space_total"] == "O(V)"      # n and m are never allocated; only the visited set / queue grow


CALLED_BOTH = ("def f(n, arr, graph):\n" + EXP + FACT +
               "    exponential_result = exponential(n)\n    factorial_result = factorial_search(arr)\n"
               "    visited = set()\n    for v in graph:\n        visited.add(v)\n    return exponential_result, factorial_result\n")


def test_call_rows_show_the_callees_resolved_class_not_a_raw_recurrence():
    r = run(CALLED_BOTH)
    assert rows(r, "factorial_result = factorial_search(arr)")[0]["time"] == "O(n!)"
    assert rows(r, "exponential_result = exponential(n)")[0]["time"] == "O(2^n)"
    assert r["total"] == "O(n!)"


def test_call_row_keeps_callee_space_even_when_caller_is_graph_flavoured_or_another_helper_is_heavier():
    r = run(CALLED_BOTH)
    sp = rows(r, "exponential_result = exponential(n)")[0]["space"]
    assert sp == "O(n)", sp                      # not O(V+E), not factorial_search's O(n^2)
    assert rows(r, "factorial_result = factorial_search(arr)")[0]["space"] == "O(n^2)"
