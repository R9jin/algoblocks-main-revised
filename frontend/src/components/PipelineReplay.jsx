// frontend/src/components/PipelineReplay.jsx
//
// "Pipeline" tab of the Complexity panel: a glass-box replay of the complexity
// analysis model. It asks the Python engine to re-run the analysis with an
// observer attached (complexity_analyzer/pipeline_trace.py) and plays the
// recorded events back stage by stage, following the Complexity Analysis Model
// diagram. The replay is purely observational -- it never changes the results
// shown in the other Complexity tabs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Split from "react-split";
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay, FiRotateCcw, FiAlertTriangle, FiCheck, FiMaximize2, FiZoomIn, FiZoomOut, FiX, FiLayout } from "react-icons/fi";
import { usePyodide } from "../context/PyodideContext.jsx";
import { formatComplexity } from "../utils/formatters";
import "../styles/PipelineReplay.css";

/* ------------------------- resizable panel layout ------------------------- */
// Same react-split gutters the main workspace uses. Sizes are remembered per
// panel group (localStorage) so a layout the user dragged into place survives
// stage changes and reloads; "Reset layout" restores the defaults.
const LAYOUT_KEY = "algoblocks.pipeline.layout.v1";
function readLayout() {
  try { return JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || "{}") || {}; } catch { return {}; }
}
function usePaneLayout() {
  const store = useRef(null);
  if (store.current === null) store.current = readLayout();
  const [epoch, setEpoch] = useState(0);
  const get = useCallback((id, fallback) => {
    const v = store.current[id];
    return Array.isArray(v) && v.length === fallback.length && v.every((n) => Number.isFinite(n)) ? v : fallback;
  }, []);
  const set = useCallback((id, sizes) => {
    store.current = { ...store.current, [id]: sizes };
    try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(store.current)); } catch { /* storage unavailable: layout just isn't remembered */ }
  }, []);
  const reset = useCallback(() => {
    store.current = {};
    try { window.localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ }
    setEpoch((e) => e + 1);
  }, []);
  return useMemo(() => ({ get, set, reset, epoch }), [get, set, reset, epoch]);
}
function useNarrow(maxWidth = 820) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}
// A group of panes separated by draggable gutters. On narrow screens the panes
// simply stack (a drag handle is useless there).
function Panes({ id, layout, direction = "horizontal", sizes, min, className = "", children }) {
  const narrow = useNarrow();
  if (narrow) return <div className={`${className} pr-stacked`}>{children}</div>;
  return (
    <Split
      key={`${id}:${layout.epoch}`}
      className={`${className} pr-panes pr-panes-${direction}`}
      direction={direction}
      sizes={layout.get(id, sizes)}
      minSize={min}
      gutterSize={10}
      snapOffset={0}
      onDragEnd={(next) => layout.set(id, next)}
    >
      {children}
    </Split>
  );
}

const STAGES = [
  { id: "init", label: "Initialization", sub: "Code Ingestion & Parsing", out: "Validated AST" },
  { id: "callgraph", label: "BFS Call Graph", sub: "& Reachability Mapper", out: "Call Graph + Reachable Functions + Recursion/Cycle Flags" },
  { id: "topo", label: "Topological Sequencer", sub: "Dependency Ordering", out: "Topological Visit Order" },
  { id: "signature", label: "Signature Pass", sub: "Dependency-Ordered (DFS)", out: "Function Complexity Signatures" },
  { id: "synthesis", label: "Final Synthesis", sub: "Pass (DFS)", out: "Per-Line Local/Global Weights" },
  { id: "master", label: "Master Theorem", sub: "Assigner", out: "Resolved Recurrence Relations" },
  { id: "efficiency", label: "Efficiency", sub: "Evaluator", out: "Definitive Asymptotic Ratings" },
  { id: "result", label: "Structured Result", sub: "Line-by-line + Overall", out: "" },
];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const BASE_DELAY_MS = 750;
const REQUEST_TIMEOUT_MS = 30000;
const NOISY_KINDS = new Set(["visit", "cache"]);

function scrollChildIntoContainer(container, child) {
  if (!container || !child) return;
  const cTop = container.scrollTop;
  const cHeight = container.clientHeight;
  const elTop = child.offsetTop;
  const elHeight = child.offsetHeight;
  if (elTop < cTop) {
    container.scrollTop = elTop;
  } else if (elTop + elHeight > cTop + cHeight) {
    container.scrollTop = elTop + elHeight - cHeight;
  }
}

/* ----------------------------- derived state ----------------------------- */

function deriveState(trace, events, cur) {
  const userSymbols = new Set(trace?.final?.symbol_table || []);
  userSymbols.add("__main__");

  const d = {
    revealTo: -1, node: null, line: null,
    visited: new Set(), visitSeq: [],
    cg: { nodes: [], edges: [], newestEdge: null, recursive: [], indirect: [], reachable: [], dead: [], entry: true, flagged: false },
    topo: { deps: null, clusters: null, order: null },
    sigs: {}, currentFunc: null, sigOrder: null,
    rows: new Map(), cache: { hits: 0, misses: 0 }, lastCache: null,
    master: [], eff: { time: null, space: null }, result: null, parseError: null,
  };
  if (!cur) return d;
  const stage = cur.stage;
  const addNode = (n) => {
    if (n && userSymbols.has(n) && !d.cg.nodes.includes(n)) d.cg.nodes.push(n);
  };

  for (let i = 0; i <= cur.i && i < events.length; i++) {
    const e = events[i];
    switch (e.kind) {
      case "ast_reveal":
        d.revealTo = Math.max(d.revealTo, e.reveal_to);
        break;
      case "parse_error":
        d.parseError = e;
        break;
      case "func":
        addNode("__main__");
        addNode(e.name);
        break;
      case "edge":
        if (userSymbols.has(e.src) && userSymbols.has(e.dst)) {
          addNode(e.src);
          addNode(e.dst);
          d.cg.edges.push(e);
          d.cg.newestEdge = e;
        }
        break;
      case "flags":
        d.cg.recursive = (e.recursive || []).filter((k) => k !== "__main__" && userSymbols.has(k));
        d.cg.indirect = (e.indirect || []).filter((k) => k !== "__main__" && userSymbols.has(k));
        d.cg.reachable = (e.reachable || []).filter((k) => userSymbols.has(k));
        d.cg.dead = (e.dead || []).filter((k) => k !== "__main__" && userSymbols.has(k));
        d.cg.entry = e.entry !== false;
        d.cg.flagged = true;
        break;
      case "deps":
        d.topo.deps = e.deps;
        break;
      case "clusters":
        d.topo.clusters = e.clusters;
        break;
      case "order":
        d.topo.order = e.order;
        break;
      case "start":
        if (e.stage === "signature") d.sigOrder = e.order;
        d.currentFunc = null;
        break;
      case "func_begin":
        d.currentFunc = e.name;
        break;
      case "func_end":
        d.sigs[e.name] = { signature: e.signature, space: e.space, dead: !!e.dead };
        d.currentFunc = null;
        break;
      case "resolve":
        d.master.push(e);
        break;
      case "time":
        d.eff.time = e;
        break;
      case "space":
        d.eff.space = e;
        break;
      case "done":
      case "fallback":
        d.result = e;
        break;
      default:
        break;
    }

    if (e.stage === stage) {
      if (e.kind === "start" && (stage === "signature" || stage === "synthesis")) {
        d.visited = new Set();
        d.visitSeq = [];
        d.rows = new Map();
        d.cache = { hits: 0, misses: 0 };
      }
      if (e.kind === "visit" && e.node != null) {
        d.visited.add(e.node);
        d.visitSeq.push({ node: e.node, depth: e.depth ?? 0 });
      }
      if (e.kind === "record" && e.row) {
        d.rows.set(e.row.line, { ...e.row, func: d.currentFunc, stage });
      }
      if (e.kind === "reconcile" && e.rows) {
        e.rows.forEach((r) => {
          if (r && r.line != null) {
            d.rows.set(r.line, { ...r, func: d.currentFunc, stage });
          }
        });
      }
      if (e.kind === "cache") {
        if (e.hit) d.cache.hits++;
        else d.cache.misses++;
      }
    }
  }

  // Derive active node and active line for the CURRENT event only
  const isNodeEvent = cur.kind === "visit" || cur.kind === "record" || cur.kind === "cache" || cur.kind === "ast_reveal";
  d.node = isNodeEvent && cur.node != null ? cur.node : null;
  d.line = cur.line != null ? cur.line : cur.row?.line != null ? cur.row.line : null;
  if (cur.kind === "cache") d.lastCache = cur;

  return d;
}

/* ------------------------------- sub views ------------------------------- */

function SourcePane({ lines, activeLine }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current?.querySelector(".pr-src-line.active");
    if (el) scrollChildIntoContainer(bodyRef.current, el);
  }, [activeLine]);

  return (
    <div className="pr-pane pr-source">
      <div className="pr-pane-title">Source</div>
      <div className="pr-pane-body" ref={bodyRef}>
        {(lines || []).map((t, i) => (
          <div key={i} className={`pr-src-line ${activeLine === i + 1 ? "active" : ""}`}>
            <span className="pr-src-no">{i + 1}</span>
            <code>{t || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- AST tree (graph) view --------------------------- */

const T_ROW_H = 30, T_PILL_H = 22, T_PAD = 18, T_GAP = 46, T_CHAR_W = 6.6;

const pillWidth = (r) => Math.max(76, Math.ceil(String(r.label || "").length * T_CHAR_W) + 18 + (r.line != null ? 26 : 0));

// Lay the (visible) AST out as a left-to-right tree: x = depth, leaves take
// consecutive rows, parents are centred on their children. Column widths follow
// the widest label at that depth, so nothing is truncated or overlaps.
function layoutTree(rows) {
  const kids = new Map();
  rows.forEach((r) => kids.set(r.id, []));
  const roots = [];
  rows.forEach((r) => {
    if (r.vp >= 0 && kids.has(r.vp)) kids.get(r.vp).push(r.id);
    else roots.push(r.id);
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const colW = [];
  rows.forEach((r) => { colW[r.d] = Math.max(colW[r.d] || 0, pillWidth(r)); });
  const colX = [];
  let acc = T_PAD;
  for (let d = 0; d < colW.length; d++) { colX[d] = acc; acc += (colW[d] || 0) + T_GAP; }
  const pos = new Map();
  let slot = 0;
  const place = (id) => {
    const r = byId.get(id);
    const ch = kids.get(id);
    let y;
    if (!ch.length) y = slot++;
    else {
      const ys = ch.map(place);
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    pos.set(id, { x: colX[r.d], y: T_PAD + y * T_ROW_H + T_ROW_H / 2, w: pillWidth(r) });
    return y;
  };
  roots.forEach(place);
  return { pos, width: Math.max(acc - T_GAP + T_PAD, 120), height: T_PAD * 2 + Math.max(slot, 1) * T_ROW_H };
}

// Works out visit numbers (1 = first node entered) from the real DFS trace and
// checks the defining property of depth-first order: once the traversal has left
// a branch it never comes back into it.
function analyzeVisitOrder(seq, nodes) {
  const order = new Map();
  let open = new Set();
  const closed = new Set();
  let violation = null;
  (seq || []).forEach((v) => {
    if (v.node == null || order.has(v.node)) return;
    order.set(v.node, order.size + 1);
    const anc = new Set();
    for (let p = nodes[v.node]?.parent; p != null && p >= 0; p = nodes[p]?.parent) anc.add(p);
    if (!violation) {
      for (const a of anc) if (closed.has(a)) { violation = { node: v.node, branch: a }; break; }
    }
    const next = new Set([v.node]);
    open.forEach((o) => { if (anc.has(o)) next.add(o); else closed.add(o); });
    open = next;
  });
  return { order, violation };
}

function DepthStrip({ seq }) {
  if (!seq || seq.length < 2) return null;
  const W = 300, H = 30;
  const maxD = Math.max(1, ...seq.map((v) => v.depth));
  const ys = seq.map((v) => H - 3 - (v.depth / maxD) * (H - 6));
  const pts = ys.map((y, i) => `${(i / (seq.length - 1)) * W},${y}`);
  return (
    <div className="pr-depth">
      <span className="pr-depth-l" title="Recursion depth of the visitor at each visit, in order. Depth-first dives down a branch and climbs back (zig-zag); breadth-first would only ever step down level by level.">stack depth per visit</span>
      <div className="pr-depth-box">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pr-depth-svg">
          <polyline points={pts.join(" ")} fill="none" />
        </svg>
        <span className="pr-depth-dot" style={{ left: "100%", top: `${(ys[ys.length - 1] / H) * 100}%` }} />
      </div>
    </div>
  );
}

const ZOOM_MIN = 0.4, ZOOM_MAX = 2.5;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function AstTreeCanvas({ rows, activeNode, order, big }) {
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [follow, setFollow] = useState(true);
  const { pos, width, height } = useMemo(() => layoutTree(rows), [rows]);

  const fit = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    setZoom(clampZoom(Math.min((w.clientWidth - 8) / width, (w.clientHeight - 8) / height, 1.4)));
    w.scrollLeft = 0; w.scrollTop = 0;
  }, [width, height]);

  // Fit once when the panel is opened (and when switching between inline/expanded).
  useEffect(() => { fit(); /* eslint-disable-next-line */ }, [big]);

  // Keep the active node in view (unless the user has panned away on purpose).
  useEffect(() => {
    const wrap = wrapRef.current;
    const p = activeNode != null ? pos.get(activeNode) : null;
    if (!wrap || !p || !follow) return;
    const x = p.x * zoom, y = p.y * zoom, w = p.w * zoom, m = 50;
    if (x < wrap.scrollLeft + m) wrap.scrollLeft = Math.max(0, x - m);
    else if (x + w > wrap.scrollLeft + wrap.clientWidth - m) wrap.scrollLeft = x + w - wrap.clientWidth + m;
    if (y - m < wrap.scrollTop) wrap.scrollTop = Math.max(0, y - m * 2);
    else if (y + m > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = y + m * 2 - wrap.clientHeight;
  }, [activeNode, pos, zoom, follow]);

  // Drag-to-pan + ctrl/cmd + wheel to zoom.
  const onDown = (e) => {
    if (e.button !== 0) return;
    const w = wrapRef.current;
    drag.current = { x: e.clientX, y: e.clientY, sl: w.scrollLeft, st: w.scrollTop };
    w.classList.add("grabbing");
  };
  const onMove = (e) => {
    const d = drag.current, w = wrapRef.current;
    if (!d || !w) return;
    w.scrollLeft = d.sl - (e.clientX - d.x);
    w.scrollTop = d.st - (e.clientY - d.y);
    setFollow(false);
  };
  const onUp = () => { drag.current = null; wrapRef.current?.classList.remove("grabbing"); };
  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return undefined;
    const wheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    w.addEventListener("wheel", wheel, { passive: false });
    return () => w.removeEventListener("wheel", wheel);
  }, []);

  if (!rows.length) return <div className="pr-empty">The tree appears here as the parser builds it.</div>;

  return (
    <div className="pr-tree-box">
      <div className="pr-tree-tools">
        <button type="button" className="pr-tool" onClick={() => setZoom((z) => clampZoom(z / 1.2))} title="Zoom out"><FiZoomOut size={13} /></button>
        <span className="pr-tool-pct">{Math.round(zoom * 100)}%</span>
        <button type="button" className="pr-tool" onClick={() => setZoom((z) => clampZoom(z * 1.2))} title="Zoom in"><FiZoomIn size={13} /></button>
        <button type="button" className="pr-tool txt" onClick={() => { fit(); setFollow(true); }} title="Fit the whole tree in view">Fit</button>
        <button type="button" className={`pr-tool txt ${follow ? "on" : ""}`} onClick={() => setFollow((f) => !f)} title="Auto-scroll to the node being visited">Follow</button>
      </div>
      <div className="pr-tree-wrap" ref={wrapRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        <svg className="pr-tree" width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Abstract syntax tree">
          <g>
            {rows.map((r) => {
              const a = pos.get(r.vp);
              const b = pos.get(r.id);
              if (!a || !b) return null;
              const x1 = a.x + a.w, x2 = b.x, mx = (x1 + x2) / 2;
              const cls = r.id === activeNode ? "active" : order?.has(r.id) ? "visited" : "";
              return <path key={`e${r.id}`} className={`pr-tree-edge ${cls}`} d={`M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`} />;
            })}
          </g>
          <g>
            {rows.map((r) => {
              const p = pos.get(r.id);
              const n = order?.get(r.id);
              const cls = `pr-tree-node ${r.id === activeNode ? "active" : ""} ${n ? "visited" : ""} ${r.stmt || r.is_traversal ? "stmt" : ""}`;
              return (
                <g key={r.id} className={cls} transform={`translate(${p.x},${p.y - T_PILL_H / 2})`}>
                  <title>{`${r.type || r.label}${r.line != null ? ` (line ${r.line})` : ""}${n ? ` — visited #${n}` : ""}`}</title>
                  <rect width={p.w} height={T_PILL_H} rx="6" />
                  <text x={n ? 18 : 9} y={T_PILL_H / 2} dominantBaseline="central">{r.label}</text>
                  {r.line != null && <text className="pr-tree-ln" x={p.w - 6} y={T_PILL_H / 2} textAnchor="end" dominantBaseline="central">{r.line}</text>}
                  {n != null && (
                    <g className="pr-tree-badge" transform={`translate(0,${T_PILL_H / 2})`}>
                      <circle r="9" />
                      <text textAnchor="middle" dominantBaseline="central">{n}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function AstTree({ nodes, upTo, activeNode, visited, visitSeq, stmtOnly, view = "list", onView }) {
  const bodyRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    if (!stmtOnly) return (nodes || []).filter((n) => n.id <= upTo).map((n) => ({ ...n, d: n.depth, vp: n.parent }));
    const depthOf = {};
    const anc = {}; // nearest visible ancestor-or-self
    const out = [];
    (nodes || []).forEach((n) => {
      const pd = n.parent >= 0 ? depthOf[n.parent] ?? 0 : -1;
      const isVis = n.stmt || n.is_traversal;
      depthOf[n.id] = isVis ? pd + 1 : pd;
      anc[n.id] = isVis || n.parent < 0 ? n.id : anc[n.parent];
      if (isVis || n.parent < 0) out.push({ ...n, d: n.parent < 0 ? 0 : depthOf[n.id], vp: n.parent >= 0 ? anc[n.parent] : -1 });
    });
    return out;
  }, [nodes, upTo, stmtOnly]);

  const analysis = useMemo(() => (stmtOnly ? analyzeVisitOrder(visitSeq, nodes || []) : null), [stmtOnly, visitSeq, nodes]);
  const order = analysis?.order;
  const labelOf = (id) => nodes?.[id]?.label || `#${id}`;
  const isTree = view === "tree";

  useEffect(() => {
    if (isTree) return;
    const el = bodyRef.current?.querySelector(".pr-ast-row.active");
    if (el) scrollChildIntoContainer(bodyRef.current, el);
  }, [activeNode, upTo, isTree]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => { if (!isTree) setExpanded(false); }, [isTree]);

  const orderBar = isTree && stmtOnly && order && (
    <div className="pr-order">
      {order.size === 0 ? (
        <span className="pr-muted">Numbers appear on nodes in the order the traversal enters them.</span>
      ) : analysis.violation ? (
        <span className="pr-order-bad">Not depth-first: re-entered {labelOf(analysis.violation.branch)} after leaving it.</span>
      ) : (
        <span className="pr-order-ok"><FiCheck size={11} /> Depth-first: {order.size} node{order.size === 1 ? "" : "s"} entered, and no branch was re-entered after being left.</span>
      )}
      <DepthStrip seq={visitSeq} />
    </div>
  );

  const viewToggle = onView && (
    <span className="pr-seg pr-seg-sm" role="group" aria-label="AST view">
      <button type="button" className={view === "list" ? "on" : ""} onClick={() => onView("list")}>List</button>
      <button type="button" className={view === "tree" ? "on" : ""} onClick={() => onView("tree")}>Tree</button>
    </span>
  );
  const title = stmtOnly ? "AST traversal (statements & expressions)" : "Abstract Syntax Tree";

  return (
    <div className="pr-pane pr-ast">
      <div className="pr-pane-title pr-ast-head">
        <span>{title}</span>
        <span className="pr-head-tools">
          {isTree && (
            <button type="button" className="pr-tool" onClick={() => setExpanded(true)} title="Expand to a large view" aria-label="Expand tree"><FiMaximize2 size={13} /></button>
          )}
          {viewToggle}
        </span>
      </div>
      {isTree && !expanded && orderBar}
      <div className={`pr-pane-body ${isTree ? "tree" : ""}`} ref={bodyRef}>
        {isTree ? (
          expanded ? <div className="pr-empty">Shown in the expanded view.</div> : <AstTreeCanvas rows={rows} activeNode={activeNode} order={order} big={false} />
        ) : (
          <>
            {rows.map((n) => (
              <div
                key={n.id}
                className={`pr-ast-row ${n.id === activeNode ? "active" : ""} ${visited?.has(n.id) ? "visited" : ""} ${n.stmt ? "stmt" : ""} ${n.is_traversal ? "traversal" : ""}`}
                style={{ paddingLeft: 8 + n.d * 14 }}
              >
                {order?.has(n.id) && <span className="pr-ast-ord">{order.get(n.id)}</span>}
                <span className="pr-ast-type">{n.label}</span>
                {n.line != null && <span className="pr-ast-line">L{n.line}</span>}
              </div>
            ))}
            {rows.length === 0 && <div className="pr-empty">The tree appears here as the parser builds it.</div>}
          </>
        )}
      </div>
      {expanded && createPortal(
        <div className="pr-overlay" role="dialog" aria-modal="true" aria-label="Expanded AST tree" onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <div className="pr-overlay-card">
            <div className="pr-pane-title pr-ast-head">
              <span>{title}</span>
              <span className="pr-head-tools">
                {viewToggle}
                <button type="button" className="pr-tool" onClick={() => setExpanded(false)} title="Close (Esc)" aria-label="Close expanded tree"><FiX size={14} /></button>
              </span>
            </div>
            {orderBar}
            <div className="pr-pane-body tree"><AstTreeCanvas rows={rows} activeNode={activeNode} order={order} big /></div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function CallGraphScene({ cg }) {
  const names = cg.nodes;
  // Node text. Full function names are always shown -- the old fixed 19px circles
  // chopped anything past 7 characters ("tower_…", "move_d…"). Each node is now a
  // pill whose width is measured from its own label.
  const labelOf = (nm) => (nm === "__main__" ? "main" : nm);
  const FONT = 10.5, CHAR_W = FONT * 0.62, HH = 14, PAD_X = 14;

  const layout = useMemo(() => {
    const n = names.length;
    const box = {};
    names.forEach((nm) => {
      box[nm] = { hw: Math.max(24, (labelOf(nm).length * CHAR_W) / 2 + PAD_X), hh: HH };
    });
    const place = (rx, ry) => {
      const g = {};
      names.forEach((nm, i) => {
        const ang = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
        g[nm] = { ...box[nm], x: rx * Math.cos(ang), y: ry * Math.sin(ang), ox: n === 1 ? 0 : Math.cos(ang), oy: n === 1 ? -1 : Math.sin(ang) };
      });
      return g;
    };
    const overlaps = (g) => {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const A = g[names[i]], B = g[names[j]];
        if (Math.abs(A.x - B.x) < A.hw + B.hw + 18 && Math.abs(A.y - B.y) < A.hh + B.hh + 26) return true;
      }
      return false;
    };
    // Grow the ring until no two pills touch, so long names never collide.
    let rx = n <= 1 ? 0 : 70 + n * 18, ry = n <= 1 ? 0 : 52 + n * 12;
    let g = place(rx, ry);
    for (let k = 0; k < 80 && overlaps(g); k++) { rx *= 1.08; ry *= 1.08; g = place(rx, ry); }
    // viewBox hugs the drawing (+ room for self-loops) instead of a fixed 420x250,
    // so wide labels are never clipped by the SVG edge.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    names.forEach((nm) => {
      const o = g[nm], loop = 46;
      const down = o.oy > 0.15;
      x0 = Math.min(x0, o.x - o.hw - 16); x1 = Math.max(x1, o.x + o.hw + 16);
      y0 = Math.min(y0, o.y - o.hh - (down ? 0 : loop)); y1 = Math.max(y1, o.y + o.hh + (down ? loop : 0));
    });
    const M = 20;
    if (!isFinite(x0)) { x0 = -100; x1 = 100; y0 = -60; y1 = 60; }
    return { g, vb: { x: x0 - M, y: y0 - M, w: x1 - x0 + 2 * M, h: y1 - y0 + 2 * M } };
  }, [names]);
  const { g: geo, vb } = layout;

  // Point where a ray leaving the node centre in direction (ux, uy) crosses its pill outline.
  const rim = (o, ux, uy) => {
    const t = Math.min(o.hw / Math.max(Math.abs(ux), 1e-6), o.hh / Math.max(Math.abs(uy), 1e-6)) + 2;
    return { x: o.x + ux * t, y: o.y + uy * t };
  };
  // One arrow per caller->callee pair (repeated calls drew identical overlapping arrows).
  const edges = useMemo(() => {
    const seen = new Set();
    return cg.edges.filter((e) => { const k = `${e.src}\u0000${e.dst}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [cg.edges]);
  const isHot = (e) => !!cg.newestEdge && cg.newestEdge.src === e.src && cg.newestEdge.dst === e.dst;

  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Call graph (BFS)</div>
      <div className="pr-pane-body pr-center">
        {names.length > 0 && (
          <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="pr-cg-svg" style={{ maxWidth: vb.w * 1.7 }} role="img" aria-label="Call graph">
            <defs>
              <marker id="pr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#64748B" />
              </marker>
              <marker id="pr-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#7928CA" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const a = geo[e.src], b = geo[e.dst];
              if (!a || !b) return null;
              const hot = isHot(e);
              const stroke = hot ? "#7928CA" : "#64748B";
              const arrow = `url(#${hot ? "pr-arrow-hot" : "pr-arrow"})`;
              if (e.src === e.dst) {
                // Self-call: a loop leaving the top edge (nodes in the upper half) or the
                // bottom edge (lower half), i.e. away from the middle of the graph so it
                // can't run into arrows arriving from other nodes.
                const dir = a.oy > 0.15 ? 1 : -1;
                const yEdge = a.y + dir * (a.hh + 1);
                const yTip = a.y + dir * (a.hh + 40);
                return (
                  <path key={i} d={`M ${a.x - 12} ${yEdge} C ${a.x - 34} ${yTip}, ${a.x + 34} ${yTip}, ${a.x + 12} ${yEdge + dir * 3}`}
                    fill="none" stroke={stroke} strokeWidth={hot ? 2.2 : 1.4} markerEnd={arrow} />
                );
              }
              const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len;
              const s0 = rim(a, ux, uy), e0 = rim(b, -ux, -uy);
              const bend = 14;
              const mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
              return (
                <path key={i} d={`M ${s0.x} ${s0.y} Q ${mx} ${my} ${e0.x} ${e0.y}`}
                  fill="none" stroke={stroke} strokeWidth={hot ? 2.2 : 1.4} markerEnd={arrow} />
              );
            })}
            {names.map((nm) => {
              const o = geo[nm];
              if (!o) return null;
              const rec = cg.flagged && nm !== "__main__" && cg.recursive.includes(nm);
              const dead = cg.flagged && nm !== "__main__" && cg.dead.includes(nm);
              return (
                <g key={nm}>
                  <title>{nm === "__main__" ? "main (module level)" : dead ? `${nm} (dead code: never called, excluded from the total)` : nm}</title>
                  <rect x={o.x - o.hw} y={o.y - o.hh} width={o.hw * 2} height={o.hh * 2} rx={o.hh}
                    fill={dead ? "#F1F5F9" : nm === "__main__" ? "#EEF2FF" : "#F5F3FF"}
                    stroke={dead ? "#94A3B8" : rec ? "#EF4444" : "#7928CA"} strokeWidth={rec && !dead ? 3 : 1.6}
                    strokeDasharray={dead ? "4 3" : undefined} />
                  <text x={o.x} y={o.y + 3.8} textAnchor="middle" className="pr-cg-label" opacity={dead ? 0.55 : 1}>{labelOf(nm)}</text>
                </g>
              );
            })}
          </svg>
        )}
        {names.length === 0 && (
          <div className="pr-empty">
            {cg.flagged ? "No functions defined in this program (pure script execution)." : "Functions and calls appear as the BFS discovers them."}
          </div>
        )}
        {cg.flagged && (
          <div className="pr-chip-row">
            <span className="pr-chip">Reachable: {cg.reachable.length}</span>
            <span className={`pr-chip ${cg.dead.length ? "dead" : ""}`} title="Functions no live code ever calls. They are scored O(1) and excluded from the program total.">
              Dead code: {cg.dead.length ? cg.dead.join(", ") : "none"}
            </span>
            {!cg.entry && cg.nodes.length > 1 && (
              <span className="pr-chip muted" title="Nothing at module level calls the defined functions, so every function is analysed as an entry point.">
                No driver code: all functions analysed
              </span>
            )}
            <span className={`pr-chip ${cg.recursive.filter((n) => n !== "__main__").length ? "warn" : ""}`}>
              Recursive: {cg.recursive.filter((n) => n !== "__main__").length ? cg.recursive.filter((n) => n !== "__main__").join(", ") : "none"}
            </span>
            {cg.indirect.filter((n) => n !== "__main__").length > 0 && (
              <span className="pr-chip warn">Indirect cycle: {cg.indirect.filter((n) => n !== "__main__").join(", ")}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopoScene({ topo }) {
  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Dependency ordering</div>
      <div className="pr-pane-body">
        {topo.deps && (
          <div className="pr-block">
            <div className="pr-block-h">Dependencies (caller → callees)</div>
            {Object.entries(topo.deps).map(([f, ds]) => (
              <div key={f} className="pr-dep-row">
                <b>{f}</b><span className="pr-arrow">→</span>{ds.length ? ds.join(", ") : <i>nothing</i>}
              </div>
            ))}
          </div>
        )}
        {topo.clusters && (
          <div className="pr-block">
            <div className="pr-block-h">Clusters (mutually recursive functions share one)</div>
            <div className="pr-chip-row">
              {topo.clusters.map((c, i) => (
                <span key={i} className={`pr-chip ${c.length > 1 ? "warn" : ""}`}>
                  {`{ ${c.join(", ")} }`}
                </span>
              ))}
            </div>
          </div>
        )}
        {topo.order && (
          <div className="pr-block">
            <div className="pr-block-h">Topological visit order (callees first)</div>
            <div className="pr-order">
              {topo.order.map((f, i) => (
                <React.Fragment key={f}>
                  {i > 0 && <span className="pr-arrow">→</span>}
                  <span className="pr-chip strong">{f}</span>
                </React.Fragment>
              ))}
              {topo.order.length === 0 && <span className="pr-muted">no functions to order</span>}
            </div>
          </div>
        )}
        {!topo.deps && <div className="pr-empty">Waiting for the call graph…</div>}
      </div>
    </div>
  );
}

function Ledger({ rows, activeLine, title, showFunc }) {
  const list = useMemo(() => [...rows.values()].sort((a, b) => (a.line ?? 0) - (b.line ?? 0)), [rows]);
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current?.querySelector(".pr-led-row.active");
    if (el) scrollChildIntoContainer(bodyRef.current, el);
  }, [activeLine, list.length]);

  return (
    <div className="pr-pane pr-ledger">
      <div className="pr-pane-title">{title}</div>
      <div className="pr-pane-body" ref={bodyRef}>
        <table className="pr-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Operation</th>
              {showFunc && <th>In</th>}
              <th className="r">Time</th>
              <th className="r">Space</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.line} className={`pr-led-row ${activeLine === r.line ? "active" : ""} ${r.dead_reason ? "dead" : ""}`}>
                <td>{r.line}</td>
                <td className="op">
                  <code>{r.code}</code><span className="pr-op">{r.operation}</span>
                  {r.dead_reason && <span className="pr-dead-tag" title={r.dead_reason}>Dead code</span>}
                  {r.dead_reason && <div className="pr-dead-why">{r.dead_reason}</div>}
                </td>
                {showFunc && <td>{r.func || "main"}</td>}
                <td className="r mono">{formatComplexity(r.global_time || "O(1)")}</td>
                <td className="r mono sp">{formatComplexity(r.global_space || "O(1)")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="pr-empty">Rows fill in as each rule fires.</div>}
      </div>
    </div>
  );
}

function SignatureTable({ sigs, order, currentFunc }) {
  const names = order || Object.keys(sigs);
  return (
    <div className="pr-block pr-sigs">
      <div className="pr-block-h">Signature table (memoized)</div>
      {names.map((n) => (
        <div key={n} className={`pr-sig-row ${currentFunc === n ? "now" : ""} ${sigs[n]?.dead ? "dead" : ""}`}>
          <b>{n === "__main__" ? "main" : n}()</b>
          {sigs[n]?.dead ? (
            <span className="mono">dead code · excluded from total</span>
          ) : sigs[n] ? (
            <span className="mono">
              {formatComplexity(sigs[n].signature || "O(1)")} · space {formatComplexity(sigs[n].space || "O(1)")}
            </span>
          ) : (
            <i>{currentFunc === n ? "analyzing…" : "pending"}</i>
          )}
        </div>
      ))}
      {names.length === 0 && <div className="pr-muted small">No functions to record.</div>}
    </div>
  );
}

function MasterScene({ items, symbolCount }) {
  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Recurrence → closed form</div>
      <div className="pr-pane-body">
        {items.map((m) => (
          <div key={m.name} className="pr-master-row">
            <div className="pr-master-name">{m.name === "__main__" ? "main" : m.name}()</div>
            <div className="pr-master-rel mono">{m.relation}</div>
            <div className="pr-master-res">
              {m.status === "closed" ? (
                <span className="pr-muted">closed form (iterative)</span>
              ) : m.status === "unresolved" ? (
                <span className="pr-chip warn small">unresolved recurrence</span>
              ) : m.matched ? (
                <>
                  <span className="pr-arrow">⇒</span>
                  <span className="pr-chip strong">{formatComplexity(m.resolved)}</span>
                </>
              ) : (
                <span className="pr-muted">no recurrence to resolve</span>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="pr-empty">
            {symbolCount === 0 ? "No functions defined in this program." : "Looking up each recurrence in the Master Theorem table…"}
          </div>
        )}
      </div>
    </div>
  );
}

function Ladder({ ev, label }) {
  if (!ev) return null;
  return (
    <div className="pr-block">
      <div className="pr-block-h">{label}: costs found across all lines</div>
      <div className="pr-chip-row">
        {(ev.candidates || []).map((c) => (
          <span key={c} className={`pr-chip ${c === ev.winner ? "strong" : ""}`}>
            {formatComplexity(c)}
          </span>
        ))}
        {!(ev.candidates || []).length && <span className="pr-muted">none</span>}
      </div>
      <div className="pr-winner">
        Dominant → <span className="pr-chip strong big">{formatComplexity(ev.winner)}</span>
        {ev.inferred && (
          <span className="pr-chip muted small" title="Synthesized by the analyzer from whole-program context rather than a single line">
            (inferred)
          </span>
        )}
      </div>
    </div>
  );
}

function EfficiencyScene({ eff }) {
  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Dominance ladder</div>
      <div className="pr-pane-body">
        <Ladder ev={eff.time} label="Time" />
        <Ladder ev={eff.space} label="Space" />
        {!eff.time && <div className="pr-empty">Ranking every per-line cost to find the dominant term…</div>}
      </div>
    </div>
  );
}

function ResultScene({ final, status, result, fallbackReason, runtimeCrash = null }) {
  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Structured static complexity result</div>
      <div className="pr-pane-body">
        <div className="pr-chip-row big">
          <span className="pr-badge time"><small>Total Time</small>{formatComplexity(final.total || "O(1)")}</span>
          <span className="pr-badge space"><small>Total Space</small>{formatComplexity(final.space_total || "O(1)")}</span>
          {status === "fallback" && <span className="pr-badge warn"><small>Source</small>Fallback heuristic</span>}
        </div>
        {status === "fallback" && (
          <div className="pr-error-card" style={{ marginTop: 10, marginBottom: 10 }}>
            <FiAlertTriangle size={20} />
            <div>
              <b>Static Model Fallback Triggered</b>
              <p>{fallbackReason || "Complex or non-standard syntax required fallback to the regex heuristic analyzer."}</p>
            </div>
          </div>
        )}
        {runtimeCrash && (
          <div className="pr-error-card" style={{ marginTop: 10, marginBottom: 10 }}>
            <FiAlertTriangle size={20} />
            <div>
              <b>The code stopped with an error when it ran</b>
              <p>{runtimeCrash.line ? `Line ${runtimeCrash.line}: ` : ""}{runtimeCrash.message}. The result below is a static estimate of the code as written, not proof that it runs correctly.</p>
            </div>
          </div>
        )}
        {result && status === "success" && (
          <>
            <div className="pr-block">
              <div className="pr-block-h">Symbol table</div>
              <div className="pr-chip-row">
                {(final.symbol_table || []).map((s) => <span key={s} className="pr-chip">{s}()</span>)}
                {!(final.symbol_table || []).length && <span className="pr-muted">no functions defined</span>}
              </div>
            </div>
            <div className="pr-block">
              <div className="pr-block-h">Line-by-line</div>
              <table className="pr-table">
                <tbody>
                  {(final.lines || []).map((r, i) => (
                    <tr key={i}>
                      <td>{r.line}</td>
                      <td className="op"><code>{r.code}</code></td>
                      <td className="r mono">{formatComplexity(r.time || "O(1)")}</td>
                      <td className="r mono sp">{formatComplexity(r.space || "O(1)")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!result && status === "success" && <div className="pr-empty">Assembling the result object…</div>}
      </div>
    </div>
  );
}

/* --------------------------------- main ---------------------------------- */

export default function PipelineReplay({ sourceCode, blockingErrors = [], runtimeCrash = null }) {
  const pyodide = usePyodide();
  const worker = pyodide?.worker || null;
  const ready = !!pyodide?.isEngineReady;

  const [trace, setTrace] = useState(null);
  const [loadState, setLoadState] = useState("idle"); // idle | loading | error | ready
  const [errMsg, setErrMsg] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [detail, setDetail] = useState("key"); // key | all
  const [astView, setAstView] = useState("list"); // list | tree
  const epochRef = useRef(0);

  const code = (sourceCode || "").trim();
  const hasCode = code !== "" && code !== "# Drag blocks to generate Python code";

  // Request a fresh trace whenever the source changes (debounced).
  useEffect(() => {
    if (!worker || !ready || !hasCode) return undefined;
    const myEpoch = ++epochRef.current;
    let done = false;
    let timeoutId = null;

    const onMsg = (e) => {
      const { type, data, requestEpoch } = e.data || {};
      if (type !== "TRACE_PIPELINE_RESULT" || requestEpoch !== myEpoch) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (!data || data.status === "error") {
        setErrMsg(data?.message || "The replay could not be generated.");
        setLoadState("error");
        return;
      }
      setTrace(data);
      setIdx(0);
      setPlaying(false);
      setLoadState("ready");
    };

    worker.addEventListener("message", onMsg);

    const kick = setTimeout(() => {
      setLoadState("loading");
      worker.postMessage({ type: "TRACE_PIPELINE", code, requestEpoch: myEpoch });
      timeoutId = setTimeout(() => {
        if (!done) {
          setErrMsg("The replay timed out. Try again after the engine finishes loading.");
          setLoadState("error");
        }
      }, REQUEST_TIMEOUT_MS);
    }, 350);

    return () => {
      clearTimeout(kick);
      if (timeoutId) clearTimeout(timeoutId);
      worker.removeEventListener("message", onMsg);
    };
  }, [worker, ready, code, hasCode]);

  const allEvents = useMemo(() => trace?.events || [], [trace]);
  const events = useMemo(
    () => (detail === "all" ? allEvents : allEvents.filter((e) => !NOISY_KINDS.has(e.kind) && !(e.kind === "record" && e.changed === false))),
    [allEvents, detail]
  );
  const safeIdx = Math.min(idx, Math.max(events.length - 1, 0));
  const cur = events[safeIdx];
  const last = safeIdx >= events.length - 1;

  // Autoplay.
  useEffect(() => {
    if (!playing || !events.length) return undefined;
    if (last) return undefined;
    const t = setTimeout(() => {
      setIdx((i) => {
        const next = Math.min(i + 1, events.length - 1);
        if (next >= events.length - 1) setPlaying(false);
        return next;
      });
    }, BASE_DELAY_MS / speed);
    return () => clearTimeout(t);
  }, [playing, safeIdx, speed, events.length, last]);

  // Keep position stable when toggling detail level: jump to nearest event.
  const changeDetail = useCallback((mode) => {
    const curOrig = cur?.i ?? 0;
    const list = mode === "all" ? allEvents : allEvents.filter((e) => !NOISY_KINDS.has(e.kind) && !(e.kind === "record" && e.changed === false));
    let best = 0;
    for (let k = 0; k < list.length; k++) {
      if (list[k].i <= curOrig) best = k;
      else break;
    }
    setDetail(mode);
    setIdx(best);
  }, [cur, allEvents]);

  const jumpToStage = useCallback((stageId) => {
    const k = events.findIndex((e) => e.stage === stageId);
    if (k >= 0) {
      setIdx(k);
      setPlaying(false);
    }
  }, [events]);

  const layout = usePaneLayout();
  const derived = useMemo(() => (trace ? deriveState(trace, allEvents, cur) : null), [trace, allEvents, cur]);

  /* ---- guard states ---- */
  if (!hasCode) {
    return <div className="pr-root"><div className="pr-state">Write or build some code, then open this tab to watch the analysis model work through it.</div></div>;
  }
  if (!ready) {
    return <div className="pr-root"><div className="pr-state">The Python engine is still loading…</div></div>;
  }
  // Code with errors (syntax error, undefined name) has no valid complexity result, so the
  // replay doesn't present one -- same rule as the Complexity tab.
  if (blockingErrors.length > 0) {
    const first = blockingErrors[0];
    return (
      <div className="pr-root">
        <div className="pr-state err">
          <FiAlertTriangle /> The analysis model can't produce a valid result while the code has errors
          {first.line ? ` (line ${first.line})` : ""}: {first.message}. Fix the errors and the replay will run.
        </div>
      </div>
    );
  }
  if (loadState === "error") {
    return <div className="pr-root"><div className="pr-state err"><FiAlertTriangle /> {errMsg}</div></div>;
  }
  if (!trace || !cur || !derived) {
    return <div className="pr-root"><div className="pr-state">Recording the analysis pipeline…</div></div>;
  }

  const stageIdx = STAGE_INDEX[cur.stage] ?? 0;
  const stageDef = STAGES[stageIdx];
  const presentStages = new Set(allEvents.map((e) => e.stage));
  const isFallback = trace.status === "fallback";
  const traversal = cur.stage === "signature" || cur.stage === "synthesis";
  const progressPct = events.length > 1 ? (safeIdx / (events.length - 1)) * 100 : 100;
  const stale = loadState === "loading";

  // Calculate actual previous output for hand-off label
  const actualPrevStage = STAGES.slice(0, stageIdx).reverse().find((s) => presentStages.has(s.id));
  const prevOut = !actualPrevStage
    ? "Raw Source Code"
    : isFallback && actualPrevStage.id === "init"
    ? "Fallback Heuristic"
    : actualPrevStage.out || "Previous Stage";

  const scene = (() => {
    if (cur.stage === "init") {
      if (derived.parseError) {
        return (
          <div className="pr-pane pr-scene-pane">
            <div className="pr-pane-title">Parser</div>
            <div className="pr-pane-body">
              <div className="pr-error-card">
                <FiAlertTriangle size={20} />
                <div>
                  <b>Fatal parse error</b>
                  <div className="mono">{derived.parseError.error}</div>
                  <p>Control passes to the fallback regex-heuristic analyzer. The static model does not proceed.</p>
                </div>
              </div>
            </div>
          </div>
        );
      }
      return <AstTree nodes={trace.ast} upTo={derived.revealTo} activeNode={derived.node} visited={null} visitSeq={null} stmtOnly={false} view={astView} onView={setAstView} />;
    }
    if (cur.stage === "callgraph") return <CallGraphScene cg={derived.cg} />;
    if (cur.stage === "topo") return <TopoScene topo={derived.topo} />;
    if (traversal) {
      return (
        <Panes
          id={astView === "tree" ? "split-tree" : "split-list"}
          layout={layout}
          className="pr-split"
          sizes={astView === "tree" ? [62, 38] : [38, 62]}
          min={[220, 240]}
        >
          <AstTree nodes={trace.ast} upTo={Infinity} activeNode={derived.node} visited={derived.visited} visitSeq={derived.visitSeq} stmtOnly view={astView} onView={setAstView} />
          <Panes
            id={cur.stage === "signature" ? "col-signature" : "col-synthesis"}
            layout={layout}
            direction="vertical"
            className="pr-col"
            sizes={cur.stage === "signature" ? [30, 70] : [22, 78]}
            min={[60, 120]}
          >
            <div className="pr-col-top">
              {cur.stage === "signature" && (
                <SignatureTable sigs={derived.sigs} order={derived.sigOrder} currentFunc={derived.currentFunc} />
              )}
              {cur.stage === "synthesis" && (
                <div className="pr-block pr-cache">
                  <div className="pr-block-h">Loop re-classification cache</div>
                  <div className="pr-chip-row">
                    <span className="pr-chip">Computed: {derived.cache.misses}</span>
                    <span className="pr-chip strong">Cache hits: {derived.cache.hits}</span>
                  </div>
                  {detail === "key" && <div className="pr-muted small">Switch to “Every step” to watch each cache lookup.</div>}
                </div>
              )}
            </div>
            <Ledger
              rows={derived.rows}
              activeLine={derived.line}
              title={cur.stage === "signature" ? "Rule applications (signature pass)" : "Per-line local/global weights"}
              showFunc={cur.stage === "signature"}
            />
          </Panes>
        </Panes>
      );
    }
    if (cur.stage === "master") return <MasterScene items={derived.master} symbolCount={trace?.final?.symbol_table?.length ?? 0} />;
    if (cur.stage === "efficiency") return <EfficiencyScene eff={derived.eff} />;
    return <ResultScene final={trace.final} status={trace.status} result={derived.result || (isFallback ? cur : null)} runtimeCrash={runtimeCrash} fallbackReason={trace.fallback_reason} />;
  })();

  return (
    <div className="pr-root">
      {/* Stage stepper -- mirrors the Complexity Analysis Model diagram */}
      <div className="pr-stages">
        {STAGES.map((s, i) => {
          const skipped = !presentStages.has(s.id);
          const state = skipped ? "skipped" : i < stageIdx ? "done" : i === stageIdx ? "active" : "todo";
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span className={`pr-stage-link ${i <= stageIdx && !skipped ? "on" : ""}`} />}
              <button type="button" className={`pr-stage ${state}`} disabled={skipped} onClick={() => jumpToStage(s.id)} title={s.sub}>
                <span className="pr-stage-n">{state === "done" ? <FiCheck size={11} /> : i + 1}</span>
                <span className="pr-stage-t">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="pr-handoff">
        <span className="pr-handoff-in">{prevOut}</span><span className="pr-arrow">→</span>
        <b>{stageDef.label} {stageDef.sub}</b>
        {stageDef.out && <><span className="pr-arrow">→</span><span className="pr-handoff-out">{stageDef.out}</span></>}
        {isFallback && <span className="pr-chip warn">fallback path</span>}
        {stale && <span className="pr-chip">refreshing…</span>}
        {trace.ast_truncated && <span className="pr-chip warn" title={`AST trimmed: ${trace.ast?.length || 0} nodes kept out of ${trace.ast_total || 'more'}`}>AST trimmed</span>}
        {trace.truncated && <span className="pr-chip warn" title="Event budget reached: some per-node steps were not recorded">events trimmed</span>}
      </div>

      <Panes id="main" layout={layout} className="pr-main" sizes={[32, 68]} min={[160, 320]}>
        <SourcePane lines={trace.source} activeLine={derived.line} />
        <div className="pr-scene">{scene}</div>
      </Panes>

      <div className="pr-caption" aria-live="polite">
        <span className="pr-caption-stage">{stageDef.label}</span>
        {cur.msg}
      </div>

      <div className="pr-controls">
        <button type="button" className="pr-btn" onClick={() => { setIdx(0); setPlaying(false); }} title="Restart"><FiRotateCcw /></button>
        <button type="button" className="pr-btn" onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={safeIdx === 0} title="Step back"><FiChevronLeft /></button>
        <button type="button" className="pr-btn primary" onClick={() => { if (last) setIdx(0); setPlaying((p) => !p); }} title={playing ? "Pause" : "Play"}>
          {playing ? <FiPause /> : <FiPlay />}
        </button>
        <button type="button" className="pr-btn" onClick={() => { setPlaying(false); setIdx((i) => Math.min(events.length - 1, i + 1)); }} disabled={last} title="Step forward"><FiChevronRight /></button>
        <input
          type="range"
          className="pr-scrub"
          min={0}
          max={Math.max(events.length - 1, 0)}
          value={safeIdx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
          style={{ "--pr-pct": `${progressPct}%` }}
          aria-label="Replay position"
        />
        <span className="pr-count">{safeIdx + 1} / {events.length}</span>
        <label className="pr-speed">Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <button type="button" className="pr-btn" onClick={layout.reset} title="Reset panel sizes to the default layout" aria-label="Reset panel layout"><FiLayout /></button>
        <div className="pr-seg" role="group" aria-label="Detail level">
          <button type="button" className={detail === "key" ? "on" : ""} onClick={() => changeDetail("key")}>Key steps</button>
          <button type="button" className={detail === "all" ? "on" : ""} onClick={() => changeDetail("all")}>Every step</button>
        </div>
      </div>
    </div>
  );
}
