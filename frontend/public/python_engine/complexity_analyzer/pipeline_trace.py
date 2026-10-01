"""
pipeline_trace.py -- "glass box" replay of the complexity analysis model.

`trace_pipeline(source)` runs the SAME engine as `analyze_source_code`, in the
same order as the Complexity Analysis Model diagram, while an observer records
what every stage does. The result is a JSON-friendly event log the front-end
"Pipeline" tab plays back (play / pause / step / speed).

Stages (match the model diagram):
  init        Initialization: Code Ingestion & Parsing (AST parser)
  callgraph   BFS Call Graph & Reachability Mapper
  topo        Topological Sequencer (Dependency Ordering)
  signature   Dependency-Ordered Signature Pass (DFS)
  synthesis   Final Synthesis Pass (DFS)
  master      Master Theorem Assigner
  efficiency  Efficiency Evaluator
  result      Structured Static Complexity Result

This module is strictly observational: it never changes what the analyzer
computes, and the normal `analyze_source_code` path never imports it.
"""
import ast
import re

from complexity_analyzer.code_preprocessor import preprocess_source
from complexity_analyzer.analyzer import (
    ComplexityAnalyzer,
    fallback_analyzer,
    _finalize_line_output,
    AlgoBlocksTracer,
)

MAX_AST_NODES = 400
MAX_EVENTS = 2600          # hard cap on droppable (per-node) events
SKIP_EVENT_KINDS = ('visit', 'record', 'cache')


def _short(text, n=60):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


class PipelineRecorder:
    """Collects ordered events. Per-node events are droppable past a cap so a
    very large program can't blow up the payload; structural events never are."""

    def __init__(self):
        self.events = []
        self.dropped = 0
        self.truncated = False
        self._droppable_count = 0

    def emit(self, stage, kind, **data):
        if kind in SKIP_EVENT_KINDS:
            if self._droppable_count >= MAX_EVENTS:
                self.dropped += 1
                self.truncated = True
                return
            self._droppable_count += 1
        ev = {"i": len(self.events), "stage": stage, "kind": kind}
        ev.update(data)
        self.events.append(ev)


def _node_label(node):
    t = type(node).__name__
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return f"{t}: {node.name}"
    if isinstance(node, ast.Name):
        return f"Name: {node.id}"
    if isinstance(node, ast.Constant):
        return f"Constant: {_short(repr(node.value), 18)}"
    if isinstance(node, ast.Attribute):
        return f"Attribute: .{node.attr}"
    if isinstance(node, ast.arg):
        return f"arg: {node.arg}"
    if isinstance(node, (ast.BinOp, ast.BoolOp, ast.UnaryOp, ast.Compare)):
        op = getattr(node, 'op', None) or (node.ops[0] if getattr(node, 'ops', None) else None)
        return f"{t}" + (f" ({type(op).__name__})" if op is not None else "")
    return t


def _build_ast(tree):
    """Pre-order flatten of the AST (capped). Returns (nodes, id_by_obj)."""
    nodes, id_by_obj = [], {}
    stack = [(tree, -1, 0)]
    while stack and len(nodes) < MAX_AST_NODES:
        node, parent, depth = stack.pop()
        nid = len(nodes)
        id_by_obj[id(node)] = nid
        nodes.append({
            "id": nid, "parent": parent, "depth": depth,
            "type": type(node).__name__, "label": _node_label(node),
            "line": getattr(node, 'lineno', None),
            "stmt": isinstance(node, ast.stmt),
        })
        kids = [c for c in ast.iter_child_nodes(node)
                if not isinstance(c, (ast.Load, ast.Store, ast.Del))]
        for c in reversed(kids):
            stack.append((c, nid, depth + 1))
    return nodes, id_by_obj


def _line_snapshot(entry):
    return {
        "line": entry.get("lineno"), "code": _short(entry.get("lineOfCode", ""), 80),
        "operation": entry.get("operation"),
        "local_time": entry.get("local_time"), "global_time": entry.get("global_time"),
        "local_space": entry.get("local_space"), "global_space": entry.get("global_space"),
        "indent": entry.get("indent", 0),
    }


def trace_pipeline(source_code):
    rec = PipelineRecorder()
    raw_lines = source_code.splitlines()

    # ------------------------------------------------------------------
    # Stage: Initialization -- Code Ingestion & Parsing
    # ------------------------------------------------------------------
    rec.emit('init', 'ingest', lines=len(raw_lines),
             msg=f"Raw source code received ({len(raw_lines)} lines).")
    patched = preprocess_source(source_code)
    if patched != source_code:
        rec.emit('init', 'preprocess',
                 msg="Legacy syntax patched (e.g. Python 2 print / xrange) so the code can be parsed.")
    source_code = patched
    lines = source_code.splitlines()

    try:
        tree = ast.parse(source_code)
    except Exception as e:
        rec.emit('init', 'parse_error', line=getattr(e, 'lineno', None) or 1,
                 error=f"{type(e).__name__}: {e}",
                 msg="Fatal parse error -> control passes to the fallback regex-heuristic analyzer. "
                     "The static model does not proceed.")
        fb = fallback_analyzer(source_code)
        rec.emit('result', 'fallback', total=fb.get("total"), space_total=fb.get("space_total"),
                 msg="Fallback analyzer produced a rough heuristic rating.")
        return {
            "status": "fallback", "source": lines, "ast": [], "events": rec.events,
            "final": {"total": fb.get("total"), "space_total": fb.get("space_total"),
                      "lines": [], "call_graph": {}},
            "truncated": False,
        }

    ast_nodes, id_by_obj = _build_ast(tree)
    stmt_ids = [n["id"] for n in ast_nodes if n["stmt"]]
    rec.emit('init', 'parse_start', node_count=len(ast_nodes),
             msg="Parsing: the AST parser turns source text into a tree of nodes.")
    rec.emit('init', 'ast_reveal', reveal_to=0, line=None, msg="Module root created.")
    for k, sid in enumerate(stmt_ids):
        nxt = stmt_ids[k + 1] if k + 1 < len(stmt_ids) else len(ast_nodes)
        n = ast_nodes[sid]
        rec.emit('init', 'ast_reveal', reveal_to=nxt - 1, node=sid, line=n["line"],
                 msg=f"Parsed {n['type']}" + (f" on line {n['line']}" if n["line"] else "") + ".")
    rec.emit('init', 'validated', msg="Validated AST handed to the static complexity engine.")

    # The runtime tracer feeds execution counts to the explanations. It is
    # intentionally not part of the replay; it just runs quietly so the
    # numbers match the normal analysis exactly.
    trace_data = {"history": [], "line_hits": {}}
    if AlgoBlocksTracer is not None:
        try:
            trace_data = AlgoBlocksTracer().execute_and_trace(source_code)
        except Exception:
            pass

    analyzer = ComplexityAnalyzer(source_code, trace_data)
    analyzer.pipeline_recorder = rec

    param_names = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for a in list(node.args.args) + list(node.args.posonlyargs) + list(node.args.kwonlyargs):
                param_names.add(a.arg)
    for stmt in getattr(tree, 'body', []):
        if (isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Constant)
                and isinstance(stmt.value.value, (int, float)) and not isinstance(stmt.value.value, bool)):
            for target in stmt.targets:
                if isinstance(target, ast.Name) and target.id not in param_names:
                    analyzer.module_int_constants.add(target.id)

    # ------------------------------------------------------------------
    # Stages: BFS Call Graph Mapper + Topological Sequencer (hooks inside)
    # ------------------------------------------------------------------
    analyzer.call_graph_mapper.bfs_first_pass(tree)

    # ------------------------------------------------------------------
    # Instrumentation for the two DFS passes (wrappers, not core edits)
    # ------------------------------------------------------------------
    state = {"stage": "signature", "depth": 0}
    visitor = analyzer.ast_visitor
    orig_visit = visitor.visit
    sr = analyzer.signature_recorder
    orig_record = sr.record_line

    def traced_visit(node):
        is_trace_node = isinstance(node, (ast.stmt, ast.ListComp, ast.SetComp, ast.DictComp, ast.Lambda))
        if is_trace_node:
            rec.emit(state["stage"], 'visit', node=id_by_obj.get(id(node)), type=type(node).__name__,
                     line=getattr(node, 'lineno', None), depth=state["depth"],
                     msg=f"DFS enters {type(node).__name__}" +
                         (f" (line {node.lineno})" if getattr(node, 'lineno', None) else "") + ".")
            state["depth"] += 1
        try:
            return orig_visit(node)
        finally:
            if is_trace_node:
                state["depth"] -= 1

    def traced_record(node, *a, **kw):
        n_before = len(analyzer._details)
        out = orig_record(node, *a, **kw)
        if analyzer._details:
            entry = analyzer._details[-1]
            rec.emit(state["stage"], 'record', node=id_by_obj.get(id(node)),
                     new_row=len(analyzer._details) > n_before, row=_line_snapshot(entry),
                     msg=f"Rule applied -> line {entry.get('lineno')}: "
                         f"{entry.get('operation')} = {entry.get('global_time')} time, "
                         f"{entry.get('global_space')} space.")
        return out

    def wrap_cached(obj, name, label):
        orig = getattr(obj, name)

        def wrapper(node):
            key = (name, id(node))
            hit = key in analyzer._loop_classify_cache
            res = orig(node)
            rec.emit(state["stage"], 'cache', hit=hit, name=label, node=id_by_obj.get(id(node)),
                     line=getattr(node, 'lineno', None), result=bool(res),
                     msg=("Cache HIT" if hit else "Classified") + f" {label} on line {getattr(node, 'lineno', '?')}"
                         + (" (re-classification skipped)." if hit else "."))
            return res
        setattr(obj, name, wrapper)

    visitor.visit = traced_visit
    sr.record_line = traced_record
    wrap_cached(analyzer.call_graph_mapper, '_is_graph_for_loop', 'graph-loop check')
    wrap_cached(analyzer.complexity_heuristics, '_is_constant_loop', 'constant-loop check')
    wrap_cached(analyzer.complexity_heuristics, '_is_sqrt_loop', 'sqrt-loop check')
    wrap_cached(analyzer.complexity_heuristics, '_is_exponential_loop', 'exponential-loop check')

    # ------------------------------------------------------------------
    # Stage: Dependency-Ordered Signature Pass (DFS)
    # ------------------------------------------------------------------
    order = list(getattr(analyzer.topological_sequencer, 'topological_order', []))
    rec.emit('signature', 'start', order=order,
             msg="Visiting function bodies in topological order so callees are resolved before callers.")
    for name in order:
        node = analyzer.symbol_table.get(name)
        if node is None:
            continue
        rec.emit('signature', 'func_begin', name=name, line=getattr(node, 'lineno', None),
                 msg=f"Begin signature for {name}().")
        visitor.visit(node)
        sig = analyzer.custom_functions.get(name)
        space = analyzer.custom_space.get(name)
        rec.emit('signature', 'func_end', name=name, signature=sig, space=space,
                 msg=f"Signature for {name}(): time {sig or 'O(1)'}, space {space or 'O(1)'}.")
    analyzer.reset_state()
    state["depth"] = 0

    # ------------------------------------------------------------------
    # Stage: Final Synthesis Pass (DFS)
    # ------------------------------------------------------------------
    state["stage"] = "synthesis"
    rec.emit('synthesis', 'start',
             msg="One full traversal of the whole tree produces the line-by-line local/global report.")
    visitor.visit(tree)
    rec.emit('synthesis', 'end', rows=len(analyzer._details),
             msg=f"Traversal complete: {len(analyzer._details)} lines scored.")

    # ------------------------------------------------------------------
    # Stage: Master Theorem Assigner
    # ------------------------------------------------------------------
    synth = analyzer.complexity_synthesizer
    rec.emit('master', 'start', msg="Resolving each function's recurrence relation to a closed form.")
    for fname, relation in analyzer.custom_functions.items():
        resolved, matched = relation, None
        for k, v in analyzer.RECURRENCE_RESOLVER.items():
            if k in relation:
                resolved, matched = v, k
                break
        rec.emit('master', 'resolve', name=fname, relation=relation, matched=matched, resolved=resolved,
                 msg=(f"{fname}: {relation}  =>  {resolved}" if matched
                      else f"{fname}: {relation} (no recurrence pattern needed)"))

    # ------------------------------------------------------------------
    # Stage: Efficiency Evaluator
    # ------------------------------------------------------------------
    total = synth.get_final_asymptotic_badge()
    space_total = synth.get_final_space_badge()
    pool = sorted({str(d.get('global_time', '')) for d in analyzer._details if d.get('global_time')})
    space_pool = sorted({str(d.get('global_space', '')) for d in analyzer._details if d.get('global_space')})
    rec.emit('efficiency', 'time', candidates=pool, winner=total,
             msg=f"Dominance ladder over all per-line time costs -> {total}.")
    rec.emit('efficiency', 'space', candidates=space_pool, winner=space_total,
             msg=f"Dominance ladder over all per-line space costs -> {space_total}.")

    # ------------------------------------------------------------------
    # Stage: Structured Result (same assembly as analyze_source_code)
    # ------------------------------------------------------------------
    overall_exp = synth.get_overall_explanation(tree)
    final_lines = _finalize_line_output(analyzer.details)
    rows = [{
        "line": d.get("lineno"), "code": _short(d.get("lineOfCode", ""), 80),
        "operation": d.get("operation"), "time": d.get("time") or d.get("global_time"),
        "space": d.get("space") or d.get("global_space"), "indent": d.get("indent", 0),
    } for d in final_lines]
    rec.emit('result', 'done', total=total, space_total=space_total,
             msg=f"Structured result assembled: time {total}, space {space_total}.")

    return {
        "status": "success",
        "source": lines,
        "ast": ast_nodes,
        "events": rec.events,
        "final": {
            "total": total, "space_total": space_total, "lines": rows,
            "call_graph": getattr(analyzer, 'call_graph', {}),
            "symbol_table": sorted(analyzer.symbol_table.keys()),
            "signatures": {k: v for k, v in analyzer.custom_functions.items()},
            "explanation_chars": len(overall_exp or ""),
        },
        "truncated": rec.truncated,
        "dropped": rec.dropped,
    }
