"""
36 beginner-style scripts (the programs a panelist is most likely to type in live)

Run from api/analyzer_diagnostics (or frontend/public/python_engine):
    python ../../tests/worst_case/beginner_battery.py .
Every expected answer is the TRUE worst case, worked out by hand -- not taken from the benchmark labels.
Prints only the programs the analyzer gets wrong, then "N/N correct".
"""
import sys, re
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else '.')
from complexity_analyzer.analyzer import analyze_source_code
L = lambda *a: "\n".join(a) + "\n"
N = "n = int(input())"
S = [
("print hello", "O(1)", "O(1)", L("print('Hello')")),
("two prints", "O(1)", "O(1)", L("print('a')","print('b')")),
("add two numbers", "O(1)", "O(1)", L("a = int(input())","b = int(input())","print(a + b)")),
("loop n", "O(n)", "O(1)", L(N,"for i in range(n):","    print(i)")),
("loop 10 fixed", "O(1)", "O(1)", L("for i in range(10):","    print(i)")),
("loop n=5 literal", "O(1)", "O(1)", L("n = 5","for i in range(n):","    print(i)")),
("sum 1..n loop", "O(n)", "O(1)", L(N,"t = 0","for i in range(1, n + 1):","    t += i","print(t)")),
("sum 1..n formula", "O(1)", "O(1)", L(N,"print(n * (n + 1) // 2)")),
("nested n x n", "O(n^2)", "O(1)", L(N,"for i in range(n):","    for j in range(n):","        print(i, j)")),
("two sequential loops", "O(n)", "O(1)", L(N,"for i in range(n):","    print(i)","for j in range(n):","    print(j)")),
("triangle pattern", "O(n^2)", "O(n)", L(N,"for i in range(1, n + 1):","    print('*' * i)")),
("while counter", "O(n)", "O(1)", L(N,"i = 0","while i < n:","    i += 1")),
("while halving", "O(log n)", "O(1)", L(N,"while n > 0:","    n = n // 2")),
("list max loop", "O(n)", "O(n)", L("a = list(map(int, input().split()))","m = a[0]","for x in a:","    if x > m:","        m = x","print(m)")),
("builtin max", "O(n)", "O(n)", L("a = list(map(int, input().split()))","print(max(a))")),
("sort list", "O(n log n)", None, L("a = list(map(int, input().split()))","a.sort()","print(a)")),
("sorted()", "O(n log n)", "O(n)", L("a = list(map(int, input().split()))","print(sorted(a))")),
("reverse string slice", "O(n)", "O(n)", L("s = input()","print(s[::-1])")),
("count chars loop", "O(n)", "O(1)", L("s = input()","c = 0","for ch in s:","    if ch == 'a':","        c += 1","print(c)")),
("factorial loop", "O(n)", "O(1)", L(N,"f = 1","for i in range(2, n + 1):","    f *= i","print(f)")),
("fibonacci loop", "O(n)", "O(1)", L(N,"a, b = 0, 1","for _ in range(n):","    a, b = b, a + b","print(a)")),
("fibonacci recursive", "O(2^n)", "O(n)", L("def fib(n):","    if n <= 1:","        return n","    return fib(n - 1) + fib(n - 2)","print(fib(int(input())))")),
("factorial recursive", "O(n)", "O(n)", L("def f(n):","    if n <= 1:","        return 1","    return n * f(n - 1)","print(f(int(input())))")),
("is prime trial", "O(sqrt n)", "O(1)", L(N,"p = True","i = 2","while i * i <= n:","    if n % i == 0:","        p = False","    i += 1","print(p)")),
("linear search", "O(n)", "O(1)", L("def find(a, t):","    for i in range(len(a)):","        if a[i] == t:","            return i","    return -1")),
("binary search", "O(log n)", "O(1)", L("def bs(a, t):","    lo, hi = 0, len(a) - 1","    while lo <= hi:","        mid = (lo + hi) // 2","        if a[mid] == t:","            return mid","        if a[mid] < t:","            lo = mid + 1","        else:","            hi = mid - 1","    return -1")),
("list comprehension", "O(n)", "O(n)", L(N,"sq = [i * i for i in range(n)]","print(sq)")),
("2D grid print", "O(n * m)", "O(1)", L("def show(grid):","    for row in grid:","        for v in row:","            print(v)")),
("multiplication table", "O(n^2)", "O(1)", L(N,"for i in range(1, n + 1):","    for j in range(1, n + 1):","        print(i * j)")),
("swap two vars", "O(1)", "O(1)", L("a = 1","b = 2","a, b = b, a")),
("string concat in loop", "O(n^2)", None, L(N,"s = ''","for i in range(n):","    s += str(i)")),
("bubble sort", "O(n^2)", "O(1)", L("def bs(a):","    n = len(a)","    for i in range(n):","        for j in range(n - i - 1):","            if a[j] > a[j + 1]:","                a[j], a[j + 1] = a[j + 1], a[j]")),
("dict word count", "O(n)", "O(n)", L("words = input().split()","c = {}","for w in words:","    c[w] = c.get(w, 0) + 1","print(c)")),
("set dedupe", "O(n)", "O(n)", L("a = list(map(int, input().split()))","print(set(a))")),
("palindrome check", "O(n)", None, L("s = input()","print(s == s[::-1])")),
("pairs i<j", "O(n^2)", "O(1)", L(N,"for i in range(n):","    for j in range(i + 1, n):","        print(i, j)")),
]
norm = lambda x: re.sub(r"\s+", "", x or "")
bad = 0
for name, et, es, code in S:
    try:
        r = analyze_source_code(code); t, s = r['total'], r['space_total']
    except Exception as ex:
        t = s = "ERR:" + type(ex).__name__
    okT = norm(t) == norm(et); okS = es is None or norm(s) == norm(es)
    if not (okT and okS):
        bad += 1; print(f"{'T' if not okT else ' '}{'S' if not okS else ' '} {name:24s} got T={t:12s} S={s:8s} | expected T={et:11s} S={es}")
print(f"\n{len(S)-bad}/{len(S)} correct")
