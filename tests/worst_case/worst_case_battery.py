"""
49 programs with known worst-case answers (loops, recursion, sorting, hash tables, strings, graphs)

Run from api/analyzer_diagnostics (or frontend/public/python_engine):
    python ../../tests/worst_case/worst_case_battery.py .
Every expected answer is the TRUE worst case, worked out by hand -- not taken from the benchmark labels.
Prints only the programs the analyzer gets wrong, then "N/N correct".
"""
import sys, re
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else '.')
from complexity_analyzer.analyzer import analyze_source_code
L = lambda *a: "\n".join(a) + "\n"
# (name, expected_time, expected_space or None, code)
B = [
("linear sum", "O(n)", "O(1)", L("def f(arr):","    t = 0","    for x in arr:","        t += x","    return t")),
("constant", "O(1)", "O(1)", L("def f(a):","    return a[0] + a[-1]")),
("triangular j<i", "O(n^2)", "O(1)", L("def f(n):","    for i in range(n):","        for j in range(i):","            pass")),
("triangular j>=i", "O(n^2)", "O(1)", L("def f(n):","    for i in range(n):","        for j in range(i, n):","            pass")),
("search w/ early return", "O(n)", "O(1)", L("def f(arr, t):","    for x in arr:","        if x == t:","            return True","    return False")),
("inner break still n^2", "O(n^2)", None, L("def f(n):","    for i in range(n):","        for j in range(n):","            if i * j > 5:","                break")),
("halving while", "O(log n)", "O(1)", L("def f(n):","    while n > 1:","        n //= 2")),
("doubling while", "O(log n)", "O(1)", L("def f(n):","    i = 1","    while i < n:","        i *= 2")),
("n x log n loops", "O(n log n)", None, L("def f(n):","    for i in range(n):","        j = 1","        while j < n:","            j *= 2")),
("sqrt loop", "O(sqrt n)", "O(1)", L("def f(n):","    i = 1","    while i * i <= n:","        i += 1")),
("binary search", "O(log n)", "O(1)", L("def bs(a, t):","    lo, hi = 0, len(a) - 1","    while lo <= hi:","        mid = (lo + hi) // 2","        if a[mid] == t:","            return mid","        elif a[mid] < t:","            lo = mid + 1","        else:","            hi = mid - 1","    return -1")),
("factorial recursion", "O(n)", "O(n)", L("def fact(n):","    if n <= 1:","        return 1","    return n * fact(n - 1)")),
("T(n-1)+n recursion", "O(n^2)", "O(n)", L("def f(n):","    if n <= 0:","        return","    for i in range(n):","        pass","    f(n - 1)")),
("fib naive", "O(2^n)", "O(n)", L("def fib(n):","    if n < 2:","        return n","    return fib(n - 1) + fib(n - 2)")),
("fib memo", "O(n)", "O(n)", L("def fib(n, memo={}):","    if n < 2:","        return n","    if n in memo:","        return memo[n]","    memo[n] = fib(n - 1, memo) + fib(n - 2, memo)","    return memo[n]")),
("recursive halving", "O(log n)", "O(log n)", L("def f(n):","    if n <= 1:","        return 0","    return 1 + f(n // 2)")),
("merge sort", "O(n log n)", "O(n)", L("def ms(a):","    if len(a) <= 1:","        return a","    m = len(a) // 2","    l = ms(a[:m])","    r = ms(a[m:])","    out = []","    i = j = 0","    while i < len(l) and j < len(r):","        if l[i] <= r[j]:","            out.append(l[i]); i += 1","        else:","            out.append(r[j]); j += 1","    out.extend(l[i:]); out.extend(r[j:])","    return out")),
("quicksort", "O(n^2)", "O(n)", L("def qs(a, lo, hi):","    if lo < hi:","        p = part(a, lo, hi)","        qs(a, lo, p - 1)","        qs(a, p + 1, hi)","def part(a, lo, hi):","    piv = a[hi]","    i = lo - 1","    for j in range(lo, hi):","        if a[j] <= piv:","            i += 1","            a[i], a[j] = a[j], a[i]","    a[i + 1], a[hi] = a[hi], a[i + 1]","    return i + 1")),
("bubble sort", "O(n^2)", "O(1)", L("def bs(a):","    n = len(a)","    for i in range(n):","        for j in range(n - i - 1):","            if a[j] > a[j + 1]:","                a[j], a[j + 1] = a[j + 1], a[j]")),
("insertion sort", "O(n^2)", "O(1)", L("def ins(a):","    for i in range(1, len(a)):","        k = a[i]","        j = i - 1","        while j >= 0 and a[j] > k:","            a[j + 1] = a[j]","            j -= 1","        a[j + 1] = k")),
("selection sort", "O(n^2)", "O(1)", L("def sel(a):","    n = len(a)","    for i in range(n):","        m = i","        for j in range(i + 1, n):","            if a[j] < a[m]:","                m = j","        a[i], a[m] = a[m], a[i]")),
("heapq sort", "O(n log n)", "O(n)", L("import heapq","def hs(a):","    h = []","    for x in a:","        heapq.heappush(h, x)","    return [heapq.heappop(h) for _ in range(len(h))]")),
("permutations", "O(n!)", None, L("def perm(a, k, out):","    if k == len(a):","        out.append(a[:])","        return","    for i in range(k, len(a)):","        a[k], a[i] = a[i], a[k]","        perm(a, k + 1, out)","        a[k], a[i] = a[i], a[k]")),
("subsets include/exclude", "O(2^n)", None, L("def sub(a, i, cur, out):","    if i == len(a):","        out.append(cur[:])","        return","    sub(a, i + 1, cur, out)","    cur.append(a[i])","    sub(a, i + 1, cur, out)","    cur.pop()")),
("hanoi", "O(2^n)", "O(n)", L("def hanoi(n, a, b, c):","    if n == 0:","        return","    hanoi(n - 1, a, c, b)","    hanoi(n - 1, c, b, a)")),
("dict count (hash O(1))", "O(n)", "O(n)", L("def f(arr):","    d = {}","    for x in arr:","        d[x] = d.get(x, 0) + 1","    return d")),
("dict get loop", "O(n)", "O(n)", L("def f(arr):","    d = dict()","    for x in arr:","        if d.get(x):","            d[x] += 1","        else:","            d[x] = 1","    return d")),
("set membership loop", "O(n)", "O(n)", L("def f(arr):","    seen = set()","    for x in arr:","        if x in seen:","            return True","        seen.add(x)","    return False")),
("dict membership loop", "O(n)", "O(n)", L("def f(arr):","    d = {}","    for x in arr:","        if x in d:","            d[x] += 1","        else:","            d[x] = 1","    return d")),
("dict setdefault/pop loop", "O(n)", None, L("def f(arr):","    d = {}","    for x in arr:","        d.setdefault(x, []).append(x)","    for k in list(d):","        d.pop(k)","    return d")),
("list membership loop", "O(n^2)", "O(n)", L("def f(arr):","    seen = []","    for x in arr:","        if x in seen:","            return True","        seen.append(x)","    return False")),
("two sum brute", "O(n^2)", "O(1)", L("def f(a, t):","    for i in range(len(a)):","        for j in range(i + 1, len(a)):","            if a[i] + a[j] == t:","                return (i, j)")),
("two sum dict", "O(n)", "O(n)", L("def f(a, t):","    seen = {}","    for i, x in enumerate(a):","        if t - x in seen:","            return (seen[t - x], i)","        seen[x] = i")),
("pop(0) loop", "O(n^2)", None, L("def f(a):","    while a:","        a.pop(0)")),
("insert(0) loop", "O(n^2)", None, L("def f(arr):","    out = []","    for x in arr:","        out.insert(0, x)","    return out")),
("deque popleft loop", "O(n)", None, L("from collections import deque","def f(arr):","    q = deque(arr)","    while q:","        q.popleft()")),
("sum() in loop", "O(n^2)", None, L("def f(arr):","    r = 0","    for i in range(len(arr)):","        r += sum(arr)","    return r")),
("list.index in loop", "O(n^2)", None, L("def f(arr):","    for x in arr:","        arr.index(x)")),
("string concat loop", "O(n^2)", None, L("def f(text):","    s = ''","    for c in text:","        s = s + c","    return s")),
("slice recursion", "O(n^2)", None, L("def f(a):","    if not a:","        return 0","    return a[0] + f(a[1:])")),
("two pointer amortized", "O(n)", "O(1)", L("def f(a, n):","    i = 0","    for j in range(n):","        while i < j and a[i] < a[j]:","            i += 1","    return i")),
("shared pointer inner while", "O(n)", None, L("def f(a, n):","    seen = set(a)","    nxt = 1","    for i in range(n):","        while nxt in seen:","            nxt += 1","    return nxt")),
("n x m loops", "O(n * m)", "O(1)", L("def f(n, m):","    for i in range(n):","        for j in range(m):","            pass")),
("grid rows x cols", "O(n * m)", None, L("def f(grid):","    c = 0","    for row in grid:","        for v in row:","            c += v","    return c")),
("bfs adjacency", "O(V+E)", "O(V)", L("from collections import deque","def bfs(g, s):","    seen = {s}","    q = deque([s])","    while q:","        u = q.popleft()","        for v in g[u]:","            if v not in seen:","                seen.add(v)","                q.append(v)")),
("gcd euclid", "O(log n)", "O(1)", L("def gcd(a, b):","    while b:","        a, b = b, a % b","    return a")),
("trial division prime", "O(sqrt n)", "O(1)", L("def prime(n):","    i = 2","    while i * i <= n:","        if n % i == 0:","            return False","        i += 1","    return True")),
("matrix multiply", "O(n^3)", "O(n^2)", L("def mm(A, B, n):","    C = [[0]*n for _ in range(n)]","    for i in range(n):","        for j in range(n):","            for k in range(n):","                C[i][j] += A[i][k] * B[k][j]","    return C")),
("sorted in loop", "O(n^2 log n)", None, L("def f(arr):","    for i in range(len(arr)):","        s = sorted(arr)")),
]
def norm(x): return re.sub(r"\s+", "", x or "")
bad = 0
for name, et, es, code in B:
    try:
        r = analyze_source_code(code); t, s = r['total'], r['space_total']
    except Exception as ex:
        t = s = "ERR:" + type(ex).__name__
    okT = norm(t) == norm(et); okS = (es is None) or norm(s) == norm(es)
    if not (okT and okS):
        bad += 1
        print(f"{'T' if not okT else ' '}{'S' if not okS else ' '} {name:28s} got T={t:12s} S={s:8s} | expected T={et:12s} S={es}")
print(f"\n{len(B)-bad}/{len(B)} correct")
