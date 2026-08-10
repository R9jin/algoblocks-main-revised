"""
analyzer_diagnostics
=====================
Backend-side regression check for the complexity analyzer.

Why this exists
----------------
The complexity analyzer normally runs client-side in the browser via
Pyodide (see EvaluationSuite.jsx for the full interactive benchmark). That's
great for exploratory analysis, but it depends on a ~30MB WASM runtime
loading in the admin's browser, and it has no notion of "pass" or "fail" --
it just shows numbers.

This package is a second, independent way to ask the same question --
"is the analyzer still as accurate as Chapter 4 claims?" -- as a fast,
server-side, pass/fail check that:
  - runs in FastAPI on plain CPython (no browser, no WASM)
  - compares against fixed accuracy floors (see regression_check.py)
  - returns a simple PASS/FAIL verdict an admin can act on

Why the engine and dataset are vendored here (not imported from
frontend/public/)
------------------------------------------------------------------
The FastAPI backend deploys as its own Vercel serverless function from the
api/ directory. Relying on a relative path into frontend/public/ at
runtime is fragile -- whether those files are present in the deployed
function bundle depends on Vercel's build/bundling behavior, which isn't
something we want this feature's correctness to depend on. Vendoring a
copy of complexity_analyzer/ and the ground-truth chunks directly under
api/ guarantees they ship with the backend regardless of how the frontend
static assets get bundled.

Trade-off worth knowing: this means there are now two copies of
complexity_analyzer/ in the repo (the original, imported by the frontend
via Pyodide; and this one). If you change analyzer logic, update both, or
this backend check will silently test stale code. A short list of "things
to keep in sync" like this is normal and fine to name explicitly in a
thesis limitations section -- it's not something that needs solving before
your defense.
"""
