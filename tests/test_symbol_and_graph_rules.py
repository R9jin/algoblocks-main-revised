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


BFS_LIST_VISITED = """def bfs(graph, start):
    visited = []
    queue = %s
    visited.append(start)
    while len(queue) > 0:
        node = queue.%s
        for neighbor in graph[node]:
            if not neighbor in visited:
                visited.append(neighbor)
                queue.append(neighbor)
    return visited

graph = {0: [1, 2], 1: [0, 3], 2: [0], 3: [1]}
bfs(graph, 0)
"""


def test_bfs_list_visited_and_list_queue_total():
    # pop(0) -> V^2, `in visited` on a list -> V * E
    assert total(BFS_LIST_VISITED % ("[start]", "pop(0)")) == "O(V^2+V*E)"


def test_bfs_list_visited_with_deque_is_v_times_e():
    src = "from collections import deque\n" + BFS_LIST_VISITED % ("deque([start])", "popleft()")
    assert total(src) == "O(V*E)"


def test_bfs_list_visited_rows():
    src = BFS_LIST_VISITED % ("[start]", "pop(0)")
    rows = {l["lineno"]: l for l in analyze_source_code(src)["lines"]}
    assert rows[8]["time"] == "O(V*E)"            # if not neighbor in visited
    assert rows[9]["space"] == "O(V)"             # visited.append(neighbor): at most V entries
    assert rows[14]["time"] == "O(V^2+V*E)"       # the call is the whole traversal


def test_bfs_set_visited_is_unchanged():
    assert total(BFS % ("[start]", "pop(0)")) == "O(V^2+E)"


def test_bfs_set_visited_with_deque_is_v_plus_e():
    # the shipped BFS templates: set visited + deque queue
    src = "from collections import deque\n" + BFS % ("deque([start])", "popleft()")
    assert total(src) == "O(V+E)"


def test_deque_blocks_round_trip_from_python():
    import json
    from blockly_ast import BlocklyASTConverter
    code = "from collections import deque\nq = deque([1])\nx = q.popleft()\nq.popleft()\nd = deque()\n"
    types = json.dumps(BlocklyASTConverter().convert(code)["blocks"])
    for t in ("deque_from_list", "deque_popleft", "deque_popleft_statement", "deque_create_empty"):
        assert t in types
