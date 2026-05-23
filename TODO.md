# TODO

## Phase 1 — Gather / Understand (already done)
- [x] Reviewed existing `api/semantic_nlg.py`
- [x] Reviewed `api/analyzer.py` to understand what complexity strings and AST nodes are passed into NLG
- [x] Found all usages of `SemanticNLGEngine` and `generate_explanations`

## Phase 2 — Plan enhancement (approved)
- [x] Define robust Big-O parsing + normalization layer (semantic labels; graceful fallback)
- [x] Implement AST-driven pattern detectors (loop depth, recursion/backtracking risk, comprehension expansion, membership-in-loop detection, graph traversal detection, repeated call density)
- [x] Separate concerns: structure detection, time reasoning, space reasoning, pattern insights
- [x] Add dual-audience phrasing helpers (beginner-friendly + CS terminology)
- [x] Reduce anti-template repetition by assembling from semantic fragments
- [ ] Ensure compatibility with analyzer-emitted strings (including `T(n)=...`, `O(√n)`, `O(E log V)`, `O(n log² n)`, `O(n+m)`, amortized, undefined/∞)


## Phase 3 — Implementation
- [ ] Refactor `api/semantic_nlg.py` accordingly
- [ ] Add extensive internal tests (small script or unit-like checks) for Big-O parsing

## Phase 4 — Verification
- [ ] Run backend analyzer flow (smoke test) to ensure no runtime errors
- [ ] Manually validate a few known outputs (e.g., binary search, quick sort patterns, recursive factorial, nested loops)

