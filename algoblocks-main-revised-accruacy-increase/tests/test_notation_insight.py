"""
test_notation_insight.py -- the educational insight must explain the notations
beyond O(n^2) (cubic and onward, log-factor variants, exponential bases, n^n,
n * n!), not recite one generic "polynomial" sentence.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "python_engine")))

from complexity_explainer import notation_insight as ni  # noqa: E402
from complexity_explainer.growth_insight import growth_word  # noqa: E402
from complexity_analyzer.analyzer import analyze_source_code  # noqa: E402


@pytest.mark.parametrize("text,kind,name", [
    ("O(n^3)", "poly", "cubic time"),
    ("O(n³)", "poly", "cubic time"),
    ("O(n^4)", "poly", "quartic time"),
    ("O(n^5)", "poly", "quintic time"),
    ("O(n^7)", "poly", "degree-7 polynomial time"),
    ("O(n^2 log n)", "polylog", "quadratic time with a log factor"),
    ("O(n^3 log n)", "polylog", "cubic time with a log factor"),
    ("O(n log^2 n)", "loglog", "n times log n to the power 2"),
    ("O(2^n)", "exp", "exponential time"),
    ("O(2ⁿ)", "exp", "exponential time"),
    ("O(3^n)", "exp", "exponential time (base 3)"),
    ("O(n!)", "fact", "factorial time"),
    ("O(n * n!)", "fact", "factorial time (with an extra factor of n)"),
    ("O(n^n)", "superexp", "super-exponential time"),
    ("O(n * m * k)", "multi", "three-way product time"),
])
def test_classify(text, kind, name):
    p = ni.classify_notation(text)
    assert p is not None, text
    assert (p.kind, p.name) == (kind, name)


@pytest.mark.parametrize("text", ["O(1)", "O(n)", "O(log n)", "O(n log n)", "O(V + E)", "O(sqrt n)", "T(n) = 2T(n/2) + O(n)", ""])
def test_everyday_classes_are_left_alone(text):
    assert ni.classify_notation(text) is None
    assert ni.notation_card(text) == ""


def test_quadratic_has_no_card_but_cubic_does():
    assert ni.notation_card("O(n^2)") == ""
    card = ni.notation_card("O(n^3)")
    assert "cubic" in card and "n x n x n" in card and "Practical limit" in card


def test_exponent_equals_stacked_loops():
    assert "n x n x n x n = n^4" in ni.notation_card("O(n^4)")


def test_practical_limit_orders_correctly():
    lim = lambda t: ni.practical_limit(ni.classify_notation(t))  # noqa: E731
    assert lim("O(n^3)") > lim("O(n^4)") > lim("O(n^5)")
    assert lim("O(2^n)") > lim("O(3^n)") > lim("O(n!)") > lim("O(n^n)")


def test_growth_word_names_the_degree():
    assert growth_word("O(n^2)") == "quadratic"
    assert growth_word("O(n^3)") == "cubic"
    assert growth_word("O(n^4)") == "quartic"
    assert growth_word("O(n^6)") == "high-degree polynomial"
    assert growth_word("O(n^2 log n)") == "polynomial with a log factor"


_CUBIC = '''def triple_count(a):
    n = len(a)
    count = 0
    for i in range(n):
        for j in range(n):
            for k in range(n):
                if a[i] + a[j] + a[k] == 0:
                    count += 1
    return count
print(triple_count([1, -1, 0, 2, -2]))
'''


def test_end_to_end_cubic_explanation():
    res = analyze_source_code(_CUBIC)
    text = res["overall_explanation"]
    assert "O(n^3)" in text
    assert "cubic" in text
    assert "Practical limit" in text
    assert "(cubic)" in text            # the summary line names the class, not "polynomial"


def test_end_to_end_quartic_lists_all_four_loops():
    src = _CUBIC.replace("for k in range(n):", "for k in range(n):\n                for l in range(n):").replace(
        "                if a[i] + a[j] + a[k] == 0:\n                    count += 1",
        "                    if a[i] + a[j] + a[k] + a[l] == 0:\n                        count += 1")
    text = analyze_source_code(src)["overall_explanation"]
    assert "quartic" in text
    assert "`for l in range(n):`" in text.split("The bottleneck is nested loops:")[1].split("\n")[0]
