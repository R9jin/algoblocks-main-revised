"""
sync_analyzer.py -- keep the deployed analyzer copy identical to the source of truth.

The browser loads the analyzer from  frontend/public/python_engine/ .
The backend (api/services/analyzer_diagnostics_service.py) needs its own copy
under  api/analyzer_diagnostics/  because the API is deployed without the
frontend folder. The two had already drifted (pipeline_trace.py differed).

Source of truth: frontend/public/python_engine
Run from the repo root:

    python tools/sync_analyzer.py            # copy source -> api copy
    python tools/sync_analyzer.py --check    # exit 1 if they differ (CI / tests)

Only files that already exist in the api copy are mirrored; the api copy's
ground_truth/, regression_check.py and __init__.py are never touched.
"""
import filecmp
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "frontend", "public", "python_engine")
DST = os.path.join(ROOT, "api", "analyzer_diagnostics")

SKIP = {"__pycache__", "ground_truth", "regression_check.py"}


def mirrored_files():
    """(relative path) of every .py file present in BOTH trees, except skips."""
    out = []
    for dirpath, dirnames, filenames in os.walk(DST):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for f in filenames:
            if not f.endswith(".py") or f in SKIP or f == "__init__.py" and dirpath == DST:
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), DST)
            if os.path.exists(os.path.join(SRC, rel)):
                out.append(rel)
    return sorted(out)


def differing():
    return [r for r in mirrored_files()
            if not filecmp.cmp(os.path.join(SRC, r), os.path.join(DST, r), shallow=False)]


def main():
    diff = differing()
    if "--check" in sys.argv:
        if diff:
            print("Out of sync with frontend/public/python_engine:\n  " + "\n  ".join(diff))
            print("Run: python tools/sync_analyzer.py")
            return 1
        print("analyzer copies are in sync")
        return 0
    for r in diff:
        shutil.copyfile(os.path.join(SRC, r), os.path.join(DST, r))
        print("updated", r)
    if not diff:
        print("already in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
