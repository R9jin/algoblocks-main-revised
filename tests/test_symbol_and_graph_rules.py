"""Regression tests for symbolic-size identity, BFS list-queue cost, and dead nested helpers."""
import conftest  # noqa: F401  (puts the engine on sys.path)
from complexity_analyzer.analyzer import analyze_source_code


def total(src):
    return analyze_source_code(src)["total"]


def lines(src):
    return {l["lineno"]: l["time"] for l in analyze_source_code(src)["lines"]}


def test_lone_m_loop_keeps_its_symbol():
    src = "def f(n, m):\n    for j in range(m):\n        print(j)\n"
    assert total(src) == "O(m)"
    assert lines(src)[2] == "O(m)"


def test_nested_loops_over_m_are_m_squared():
    assert total("def f(n, m):\n    for i in range(m):\n        for j in range(m):\n            print(i)\n") == "O(m^2)"


def test_sequential_loops_add():
    assert total("def f(n, m):\n    for i in range(n):\n        print(i)\n    for j in range(m):\n        print(j)\n") == "O(n + m)"


BFS = """def bfs(graph, start):
    visited = {start}
    queue = %s
    while queue:
        v = queue.%s
        for nb in graph.get(v, []):
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
"""


def test_bfs_list_pop0_is_quadratic_in_v():
    assert total(BFS % ("[start]", "pop(0)")) == "O(V^2+E)"


def test_bfs_deque_is_linear():
    src = "from collections import deque\n" + BFS % ("deque([start])", "popleft()")
    assert total(src) == "O(V+E)"


def test_uncalled_nested_helper_does_not_count():
    src = """def outer(n):
    def helper(k):
        if k <= 0:
            return 1
        return helper(k - 1) + helper(k - 1)
    total = 0
    for i in range(n):
        total += i
    return total
outer(5)
"""
    assert total(src) == "O(n)"
