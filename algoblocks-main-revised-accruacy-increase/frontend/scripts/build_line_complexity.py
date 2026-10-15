#!/usr/bin/env python3
"""
Regenerates the per-line Big-O tables used by the lesson viewer's
"Complexity, line by line" ledger.

WHY THIS EXISTS
---------------
The ledger used to read `complexity.localBigO` off each trace step, and
defaulted to "O(1)" whenever a step didn't author one. Almost none did, so
every row read O(1) -- even `for` headers, nested loops and the recursive
`return fib(n-1) + fib(n-2)` line. The real in-app analyzer reports a
nesting/recursion-aware class per line, so the lessons now carry that same
answer directly.

WHAT IT DOES
------------
For every trace in public/data/curriculum/**/lesson-*.json that has
`codeLines` and step complexity data, it:

  1. runs public/python_engine/complexity_analyzer on the trace's code
     (the exact analyzer the workspace uses),
  2. writes `lineComplexity` -- an array parallel to `codeLines`, each item
     `{ "time": "O(..)", "space": "O(..)" }` or null (blank / no data),
  3. writes `overallSpace` -- `{ bigO, formula, note? }` for the summary's
     Space row, and
  4. applies the small, explicit OVERRIDES table below where the analyzer's
     answer contradicts the lesson or is a known analyzer limitation.
     Every override carries a `why`.

Run from anywhere:   python3 frontend/scripts/build_line_complexity.py
It is idempotent -- re-running after editing a lesson's codeLines refreshes
the tables. Pass --check to fail (exit 1) if any lesson is out of date.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.dirname(HERE)
ENGINE = os.path.join(FRONTEND, "public", "python_engine")
CURRICULUM = os.path.join(FRONTEND, "public", "data", "curriculum")
sys.path.insert(0, ENGINE)

import contextlib  # noqa: E402
import io  # noqa: E402

from complexity_analyzer.analyzer import analyze_source_code  # noqa: E402

RANK = {
    "O(1)": 0, "O(log n)": 1, "O(n)": 2, "O(n log n)": 3, "O(n^2)": 4,
    "O(n × m)": 4, "O(n^3)": 5, "O(2^n)": 7, "O(n!)": 8,
}


def rank(label):
    return RANK.get(label, -1)


# ---------------------------------------------------------------------------
# Pseudocode traces the analyzer cannot parse (START / PRINT / END blocks).
# Values are written by hand from what each line does.
# ---------------------------------------------------------------------------
MANUAL = {
    ("lesson-0-1.json", "Sequential Execution"): {
        "lines": {
            0: ("O(1)", "O(1)"), 1: ("O(1)", "O(1)"),
            2: ("O(1)", "O(1)"), 3: ("O(1)", "O(1)"),
        },
        "space": ("O(1)", "One variable, reused -- nothing grows."),
        "why": "Pseudocode (START/PRINT/END) is not valid Python, so the analyzer cannot parse it. "
               "Each block is a single constant-time step; the overall O(n) comes from n such blocks running in sequence.",
    },
    ("lesson-0-2.json", "Loop Execution"): {
        "lines": {
            0: ("O(1)", "O(1)"), 1: ("O(n)", "O(1)"), 2: ("O(n)", "O(1)"),
            3: ("O(n)", "O(1)"), 4: ("O(1)", "O(1)"),
        },
        "space": ("O(1)", "Only `count` is stored, and it is reused every pass."),
        "why": "Pseudocode. The `while` header and its two body lines run once per pass (n = starting count); "
               "the init and END run once.",
    },
}

# ---------------------------------------------------------------------------
# Deliberate departures from the raw analyzer output. Keyed by (file, title).
#   time / space : {line_index: "O(..)"}
#   overall_space: (bigO, note)   replaces the analyzer's overall space
#   set_on_steps : fields forced onto every step's complexity (badge fixes)
# ---------------------------------------------------------------------------
OVERRIDES = {
    ("lesson-4-1.json", "Greedy Coin Change (Amount = 41)"): {
        "time": {2: "O(n)", 3: "O(n)", 4: "O(n)", 5: "O(n)"},
        "space": {5: "O(n)"},
        "overall_space": ("O(n)", "`result` grows by one entry per coin taken."),
        "why": "Analyzer limitation: it multiplies the nested for/while as O(n^2), but the `while` only fires "
               "once per coin actually taken, so the pair is O(n) amortized (the lesson's own note says so). "
               "It also reports O(n^2) space where `result` is just a list of n items.",
    },
    ("lesson-5-4.json", "LCS DP Matrix"): {
        "time": {2: "O(n × m)", 4: "O(n × m)", 5: "O(n × m)", 6: "O(n × m)", 8: "O(n × m)"},
        "space": {2: "O(n × m)"},
        "overall_space": ("O(n × m)", "The dp table has (n+1) x (m+1) cells."),
        "why": "The two strings have independent lengths n and m; the analyzer collapses both to n and prints O(n^2). "
               "Using n × m matches the lesson's own badge.",
    },
    ("lesson-6-3.json", "N-Queens Pruning"): {
        "overall_space": ("O(n)", "`cols` holds one column per row, and the recursion is at most N frames deep."),
        "space": {},
        "why": "Analyzer reports O(n!) space; N-Queens only stores one board row array plus N stack frames.",
    },
    ("lesson-3-1.json", "Divide and Conquer Call Stack"): {
        "set_on_steps": {
            "bigO": "O(n)",
            "note": "Both halves get solved, so the total work is O(n) -- but each call halves the problem, "
                    "so the stack only ever gets log n frames deep (see Space).",
        },
        "overall_space": ("O(log n)", "Depth of the call stack: each call halves the range."),
        "why": "The Time badge said 'O(log n) depth', which is a stack-depth (space) fact, not a time class. "
               "Time is O(n) because both halves are solved; the depth now lives in the Space row.",
    },
    ("lesson-3-3.json", "Merge Sort Split Phase"): {
        "set_on_steps": {
            "bigO": "O(n log n)",
            "note": "The split makes O(log n) levels, and merging does O(n) work at each level, so the full sort is "
                    "O(n log n). The stack itself only gets log n frames deep.",
        },
        "space": {4: "O(n)", 5: "O(n)"},
        "overall_space": ("O(n)", "Slicing `arr[:mid]` / `arr[mid:]` copies elements; the stack is only O(log n) deep."),
        "why": "Same as lesson 3-1: 'O(log n) depth' was a space/depth fact sitting in the Time badge. "
               "The slice lines also allocate new lists, which the analyzer reports as O(1).",
    },
    ("lesson-0-4.json", "Basic Call Stack"): {
        "set_on_steps": {
            "bigO": "O(1)",
            "note": "Four straight-line calls that each run exactly once -- nothing scales with an input.",
        },
        "overall_space": ("O(1)", "Every call happens once in a fixed chain, so the stack depth never grows with any input."),
        "why": "Time badge said 'O(1) space'; time and space are now separate rows.",
    },
    ("lesson-1-3.json", "Recursion Depth = Space"): {
        "set_on_steps": {
            "bigO": "O(n)",
            "note": "One call per level of n, so time grows linearly.",
        },
        "overall_space": ("O(n)", "Space complexity here is about how deep the stack gets, not how many calls happen in total."),
        "why": "Time badge said 'O(n) space'; time and space are now separate rows.",
    },
}

# Depth of the call stack for recursive traces (space charged to the line that
# makes the recursive call). Analyzer reports O(1) for those lines because it
# models locals, not open frames.
STACK_DEPTH = {
    ("lesson-1-1.json", "O(2^n) - Branching recursion"): "O(n)",
    ("lesson-1-3.json", "Recursion Depth = Space"): "O(n)",
    ("lesson-2-1.json", "Backtracking Pruning"): "O(n)",
    ("lesson-3-1.json", "Divide and Conquer Call Stack"): "O(log n)",
    ("lesson-3-3.json", "Merge Sort Split Phase"): "O(log n)",
    ("lesson-5-1.json", "The Fib(5) call tree, one call at a time"): "O(n)",
    ("lesson-5-1.json", "Memoization trace for Fib(5)"): "O(n)",
    ("lesson-5-2.json", "Redundant Fib(4)"): "O(n)",
    ("lesson-6-1.json", "Backtracking Search"): "O(n)",
    ("lesson-6-2.json", "Permutations of {1, 2}"): "O(n)",
    ("lesson-6-3.json", "N-Queens Pruning"): "O(n)",
}

OVERALL_SPACE_FORMULA = {
    "O(1)": "Constant auxiliary space",
    "O(log n)": "Grows with log n",
    "O(n)": "Grows linearly with n",
    "O(n × m)": "Grows with n × m",
    "O(n!)": "Grows factorially",
}


def norm_source(line):
    """Some lessons show JS-flavoured pseudocode; make it parseable Python."""
    return re.sub(r"^(\s*)function\s+(\w+)\(", r"\1def \2(", line)


def iter_traces(o):
    if isinstance(o, dict):
        if o.get("codeLines") and (o.get("steps") or o.get("stepComplexity")):
            yield o
        for v in o.values():
            yield from iter_traces(v)
    elif isinstance(o, list):
        for v in o:
            yield from iter_traces(v)


def analyze(code_lines):
    src = "\n".join(norm_source(l) for l in code_lines)
    with contextlib.redirect_stdout(io.StringIO()):
        res = analyze_source_code(src)
    if res.get("error"):
        return None
    table = {}
    for ln in res.get("lines", []):
        table[ln["lineno"] - 1] = (ln["time"], ln["space"])
    return table, res.get("space_total") or "O(1)"


def recursive_call_lines(code_lines):
    m = re.search(r"^\s*(?:def|function)\s+(\w+)\(", "\n".join(code_lines), re.M)
    if not m:
        return []
    name = m.group(1)
    out = []
    for i, l in enumerate(code_lines):
        if re.match(r"^\s*(def|function)\b", l):
            continue
        if re.search(r"\b" + re.escape(name) + r"\(", l):
            out.append(i)
    return out


def build_for_trace(fname, trace, report):
    title = trace.get("title")
    key = (fname, title)
    code = trace["codeLines"]
    manual = MANUAL.get(key)
    ov = OVERRIDES.get(key, {})

    if manual:
        table = manual["lines"]
        overall_space, space_note = manual["space"]
        why = manual["why"]
        source = "manual"
    else:
        got = analyze(code)
        if got is None:
            report.append(f"!! {fname} '{title}': analyzer could not parse; left untouched")
            return False
        table, overall_space = got
        space_note = None
        why = ov.get("why")
        source = "analyzer"

    time = {i: t for i, (t, s) in table.items()}
    space = {i: s for i, (t, s) in table.items()}

    for i, v in ov.get("time", {}).items():
        time[i] = v
    for i, v in ov.get("space", {}).items():
        space[i] = v

    # `else:` / `try:` / `finally:` carry no cost of their own and the analyzer
    # emits no row for them. Give them the heaviest class among the lines they
    # guard so they never read as "unknown" once the branch runs.
    def indent(t):
        return len(t) - len(t.lstrip())

    for i, text in enumerate(code):
        if i in time or not re.match(r"^\s*(else|try|finally)\s*:\s*$", text):
            continue
        kids = []
        for j in range(i + 1, len(code)):
            if code[j].strip() and indent(code[j]) <= indent(text):
                break
            if j in time:
                kids.append(j)
        if kids:
            time[i] = max((time[j] for j in kids), key=rank)
            space[i] = "O(1)"

    depth = STACK_DEPTH.get(key)
    if depth:
        for i in recursive_call_lines(code):
            if rank(depth) > rank(space.get(i, "O(1)")):
                space[i] = depth

    if "overall_space" in ov:
        overall_space, space_note = ov["overall_space"]

    lc = []
    for i, text in enumerate(code):
        if not text.strip() or i not in time:
            lc.append(None)
        else:
            lc.append({"time": time[i], "space": space.get(i, "O(1)")})

    osp = {"bigO": overall_space,
           "formula": OVERALL_SPACE_FORMULA.get(overall_space, "")}
    if space_note:
        osp["note"] = space_note

    # rebuild dict so the new keys sit right after codeLines
    items = [(k, v) for k, v in trace.items() if k not in ("lineComplexity", "overallSpace")]
    trace.clear()
    for k, v in items:
        trace[k] = v
        if k == "codeLines":
            trace["lineComplexity"] = lc
            trace["overallSpace"] = osp

    steps_complexity = (
        [s.get("complexity") for s in trace.get("steps", [])] if trace.get("steps")
        else trace.get("stepComplexity", [])
    )
    for c in steps_complexity:
        if not c:
            continue
        for k, v in ov.get("set_on_steps", {}).items():
            c[k] = v
        # Single source of truth is the table now; drop the old per-step guess.
        c.pop("localBigO", None)

    tag = "override" if (ov or manual) else "analyzer"
    report.append(f"ok {fname:16} {title!r:52} [{source}{'+override' if ov and not manual else ''}] "
                  f"space={overall_space}" + (f"  ({tag}: {why})" if why else ""))
    return True


def main():
    check = "--check" in sys.argv
    report, stale = [], []
    for path in sorted(glob.glob(os.path.join(CURRICULUM, "module-*", "lesson-*.json"))):
        fname = os.path.basename(path)
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        data = json.loads(raw)
        touched = False
        for trace in iter_traces(data):
            touched |= build_for_trace(fname, trace, report)
        if not touched:
            continue
        out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        if out != raw:
            stale.append(path)
            if not check:
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(out)
    print("\n".join(report))
    print(f"\n{len(stale)} lesson file(s) {'out of date' if check else 'rewritten'}")
    if check and stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
