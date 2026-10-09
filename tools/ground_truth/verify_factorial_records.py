"""Empirical check of the hand-derived labels in factorial_records_src.py.

Runs each program with growing n under a line tracer and compares the measured
growth of every tagged line with its label. Not a replacement for the derivation
(growth at n<=8 cannot prove an asymptotic class), but it catches a wrong tier.
"""
import math, random, re, sys, tracemalloc
sys.path.insert(0, __import__("os").path.dirname(__file__))
from factorial_records_src import RECORDS

TAG = re.compile(r"\s*#@\s*(\w+)\s*\|\s*(\w+)\s*$")
CLS = {"1": "O(1)", "n": "O(n)", "n2": "O(n^2)", "f": "O(n!)"}

def strip(code):
    out, tags = [], {}
    for i, line in enumerate(code.split("\n"), 1):
        m = TAG.search(line)
        if m:
            tags[i] = (m.group(1), m.group(2)); line = TAG.sub("", line)
        out.append(line)
    return "\n".join(out), tags

def run_counts(code, call, n):
    ns = {"__name__": "lib", "print": lambda *a, **k: None}
    exec(compile(code, "<rec>", "exec"), ns)
    cnt = {}
    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<rec>": return None
        def local(fr, ev, ar):
            if ev == "line": cnt[fr.f_lineno] = cnt.get(fr.f_lineno, 0) + 1
            return local
        if event == "call": cnt[frame.f_lineno] = cnt.get(frame.f_lineno, 0) + 1  # def-line analogue
        return local
    sys.settrace(tracer)
    try: call(ns, n)
    finally: sys.settrace(None)
    return cnt

def last_state_inverse(n):
    a = list(range(n)); last = None
    def rec(l):
        nonlocal last
        if l == n - 1: last = a[:]; return
        for i in range(l, n):
            a[l], a[i] = a[i], a[l]; rec(l + 1); a[l], a[i] = a[i], a[l]
    rec(0); inv = [0] * n
    for i, v in enumerate(last): inv[v] = i
    return inv

R = random.Random(1)
def rm(n): return [[R.randint(1, 9) for _ in range(n)] for _ in range(n)]
CALLS = {
 "algo_nfact_299": [lambda ns,n: ns["permute"](list("ABCDEFGHIJ"[:n]),0,n-1)],
 "algo_nfact_300": [lambda ns,n: ns["permutations"](list(range(n)))],
 "algo_nfact_301": [lambda ns,n: ns["permute"]("abcdefghij"[:n])],
 "algo_nfact_302": [lambda ns,n: ns["heap_permutation"](list(range(n)),n,n)],
 "algo_nfact_303": [lambda ns,n: (lambda a: [None for _ in iter(lambda: ns["next_permutation"](a), False)])(list(range(n)))],
 "algo_nfact_304": [lambda ns,n: ns["tsp"](rm(n),list(range(n)),1,n-1,float("inf"))],
 "algo_nfact_305": [lambda ns,n: ns["permutation_sort"](last_state_inverse(n),0)],
 "algo_nfact_306": [lambda ns,n: ns["count_derangements"](list(range(n)),0,n)],
 "algo_nfact_307": [lambda ns,n: ns["assign"](rm(n),0,[False]*n,0,float("inf"))],
 "algo_nfact_308": [lambda ns,n: ns["permutations"](list(range(n)))],
 "algo_nfact_309": [lambda ns,n: ns["permute_unique"](list("ABCDEFGHIJ"[:n]),[],n),
                    lambda ns,n: ns["permute_unique"](list("AA"+"BCDEFGHIJ"[:n-2]),[],n)],
 "algo_nfact_310": [lambda ns,n: ns["generate"](n,[],[False]*(n+1))],
 "algo_nfact_311": [lambda ns,n: ns["count_hamiltonian_paths"]([[0 if i==j else 1 for j in range(n)] for i in range(n)],list(range(n)),0,n)],
 "algo_nfact_312": [lambda ns,n: ns["permute"](list("ABCDEFGHIJ"[:n]),[])],
}
SIZES = (5, 6, 7, 8)

def classify(c6, c7, c8):
    if c8 == 0: return None
    if c8 / max(c7, 1) >= 5: return "f"
    slope = math.log(c8 / max(c6, 1)) / math.log(8 / 6)
    return "1" if slope < 0.4 else "n" if slope < 1.5 else "n2"

def main():
    bad = 0
    for rec in RECORDS:
        code, tags = strip(rec["code"])
        per = {n: {} for n in SIZES}
        for call in CALLS[rec["id"]]:
            for n in SIZES:
                c = run_counts(code, call, n)
                for k, v in c.items(): per[n][k] = max(per[n].get(k, 0), v)
        issues = []
        for ln, (t, s) in sorted(tags.items()):
            if ln not in per[8]:   # driver lines are not executed by the harness
                continue
            got = classify(per[6].get(ln,0), per[7].get(ln,0), per[8].get(ln,0))
            if got is not None and got != t and not (t == "n" and got == "1" and per[8][ln] <= 8):
                issues.append((ln, "label", t, "measured", got, [per[n].get(ln,0) for n in SIZES]))
        # space: peak traced memory growth between n=6 and n=8 (informational)
        peaks = []
        for n in (6, 7, 8):
            ns = {"__name__": "lib", "print": lambda *a, **k: None}; exec(compile(code, "<rec>", "exec"), ns)
            tracemalloc.start(); CALLS[rec["id"]][0](ns, n); _, pk = tracemalloc.get_traced_memory(); tracemalloc.stop(); peaks.append(pk)
        print(f'{rec["id"]} T={rec["T"]} S={rec["S"]}  peak bytes n=6,7,8: {peaks}  (x7/6 {peaks[1]/peaks[0]:.2f}, x8/7 {peaks[2]/peaks[1]:.2f})')
        for i in issues: print("   MISMATCH", i); bad += 1
    print("mismatching lines:", bad)
main()
