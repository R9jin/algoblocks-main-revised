"""Named-algorithm recognition and theory notes (algorithm_recognizer / theory_catalog)."""
import ast
import conftest  # noqa: F401
from complexity_explainer import paradigm_detector as P
from complexity_explainer import theory_catalog as T
from complexity_analyzer.analyzer import analyze_source_code

CASES = {
    "Bubble sort": """def b(list2):
    n = len(list2)
    for i in range(1, n):
        swapped = False
        for j in range(n - 1):
            if list2[j] > list2[j + 1]:
                temp = list2[j]
                list2[j] = list2[j + 1]
                list2[j + 1] = temp
                swapped = True
        if not swapped:
            break
""",
    "Bubble sort (tuple swap)": """def b(a):
    for i in range(len(a)):
        for j in range(len(a) - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
""",
    "Selection sort": """def s(a):
    for i in range(len(a)):
        m = i
        for j in range(i + 1, len(a)):
            if a[j] < a[m]:
                m = j
        a[i], a[m] = a[m], a[i]
""",
    "Insertion sort": """def ins(a):
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
""",
    "Merge sort": """def ms(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    l = ms(a[:mid]); r = ms(a[mid:])
    out = []; i = j = 0
    while i < len(l) and j < len(r):
        if l[i] <= r[j]:
            out.append(l[i]); i += 1
        else:
            out.append(r[j]); j += 1
    return out + l[i:] + r[j:]
""",
    "Floyd": """def fw(d, n):
    for k in range(n):
        for i in range(n):
            for j in range(n):
                d[i][j] = min(d[i][j], d[i][k] + d[k][j])
""",
    "Matrix multiplication": """def mm(A, B, C, n):
    for i in range(n):
        for j in range(n):
            for k in range(n):
                C[i][j] += A[i][k] * B[k][j]
""",
    "Longest common subsequence": """def lcs(x, y):
    dp = [[0] * (len(y) + 1) for _ in range(len(x) + 1)]
    for i in range(1, len(x) + 1):
        for j in range(1, len(y) + 1):
            if x[i - 1] == y[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]
""",
}


def top(src):
    m = P.detect(ast.parse(src))
    return m[0].name if m else ""


def test_named_algorithms_are_recognised():
    for expect, src in CASES.items():
        assert top(src).startswith(expect.split(" (")[0]) or expect.split()[0] in top(src), (expect, top(src))


def test_bubble_sort_is_not_dynamic_programming():
    for key in ("Bubble sort", "Bubble sort (tuple swap)", "Insertion sort", "Selection sort"):
        assert "ynamic" not in top(CASES[key]), key


def test_shift_inside_input_list_is_not_a_dp_table():
    src = "def shift(a):\n    for j in range(len(a) - 1):\n        a[j] = a[j + 1]\n"
    assert not top(src).startswith("Dynamic programming")


def test_real_dp_table_is_still_dp():
    src = "def f(n):\n    dp = [0] * (n + 1)\n    dp[1] = 1\n    for i in range(2, n + 1):\n        dp[i] = dp[i - 1] + dp[i - 2]\n    return dp[n]\n"
    assert top(src).startswith("Dynamic programming")


def test_frequency_count_is_not_counting_sort():
    src = "def f(s):\n    count = [0] * 256\n    for c in s:\n        count[ord(c)] += 1\n    return max(count)\n"
    assert "Counting sort" not in top(src)


def test_every_complexity_shape_gets_theory_text():
    for c in ("O(1)", "O(log n)", "O(sqrt n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(n^2 log n)", "O(n * m)", "O(n^2 * m)",
              "O(n + m)", "O(m log n)", "O(2^n)", "O(n!)", "O(V+E)", "O(V^2+E)", "O(n^2 * m + n^3 + V^2+E)", "O(n^5)"):
        assert T.class_block(c, "time"), c
        assert T.class_block(c, "space"), c


def test_overall_report_has_theory_and_correct_bubble_label():
    md = analyze_source_code(CASES["Bubble sort"])["overall_explanation"]
    assert "Bubble sort" in md and "Dynamic programming" not in md
    assert "#### Theory Notes" in md and "n(n-1)/2" in md
