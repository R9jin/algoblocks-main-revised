// frontend/src/components/PipelineReplay.jsx
//
// "Pipeline" tab of the Complexity panel: a glass-box replay of the complexity
// analysis model. It asks the Python engine to re-run the analysis with an
// observer attached (complexity_analyzer/pipeline_trace.py) and plays the
// recorded events back stage by stage, following the Complexity Analysis Model
// diagram. The replay is purely observational -- it never changes the results
// shown in the other Complexity tabs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay, FiRotateCcw, FiAlertTriangle, FiCheck } from "react-icons/fi";
import { usePyodide } from "../context/PyodideContext.jsx";
import { formatComplexity } from "../utils/formatters";
import "../styles/PipelineReplay.css";

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
    visited: new Set(),
    cg: { nodes: [], edges: [], newestEdge: null, recursive: [], indirect: [], reachable: [], flagged: false },
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
        d.sigs[e.name] = { signature: e.signature, space: e.space };
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
        d.rows = new Map();
        d.cache = { hits: 0, misses: 0 };
      }
      if (e.kind === "visit" && e.node != null) {
        d.visited.add(e.node);
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

function AstTree({ nodes, upTo, activeNode, visited, stmtOnly }) {
  const bodyRef = useRef(null);
  const rows = useMemo(() => {
    if (!stmtOnly) return (nodes || []).filter((n) => n.id <= upTo).map((n) => ({ ...n, d: n.depth }));
    const depthOf = {};
    const out = [];
    (nodes || []).forEach((n) => {
      const pd = n.parent >= 0 ? depthOf[n.parent] ?? 0 : -1;
      const isVis = n.stmt || n.is_traversal;
      depthOf[n.id] = isVis ? pd + 1 : pd;
      if (isVis || n.parent < 0) out.push({ ...n, d: n.parent < 0 ? 0 : depthOf[n.id] });
    });
    return out;
  }, [nodes, upTo, stmtOnly]);

  useEffect(() => {
    const el = bodyRef.current?.querySelector(".pr-ast-row.active");
    if (el) scrollChildIntoContainer(bodyRef.current, el);
  }, [activeNode, upTo]);

  return (
    <div className="pr-pane pr-ast">
      <div className="pr-pane-title">{stmtOnly ? "AST traversal (statements & expressions)" : "Abstract Syntax Tree"}</div>
      <div className="pr-pane-body" ref={bodyRef}>
        {rows.map((n) => (
          <div
            key={n.id}
            className={`pr-ast-row ${n.id === activeNode ? "active" : ""} ${visited?.has(n.id) ? "visited" : ""} ${n.stmt ? "stmt" : ""} ${n.is_traversal ? "traversal" : ""}`}
            style={{ paddingLeft: 8 + n.d * 14 }}
          >
            <span className="pr-ast-type">{n.label}</span>
            {n.line != null && <span className="pr-ast-line">L{n.line}</span>}
          </div>
        ))}
        {rows.length === 0 && <div className="pr-empty">The tree appears here as the parser builds it.</div>}
      </div>
    </div>
  );
}

function CallGraphScene({ cg }) {
  const W = 420, H = 250, cx = W / 2, cy = H / 2;
  const names = cg.nodes;
  const pos = useMemo(() => {
    const p = {};
    const n = names.length;
    const r = Math.min(88, 28 + n * 14);
    names.forEach((nm, i) => {
      const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      p[nm] = n === 1 ? { x: cx, y: cy } : { x: cx + r * 1.35 * Math.cos(a), y: cy + r * 0.85 * Math.sin(a) };
    });
    return p;
  }, [names, cx, cy]);

  return (
    <div className="pr-pane pr-scene-pane">
      <div className="pr-pane-title">Call graph (BFS)</div>
      <div className="pr-pane-body pr-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="pr-cg-svg">
          <defs>
            <marker id="pr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
            <marker id="pr-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#7928CA" />
            </marker>
          </defs>
          {cg.edges.map((e, i) => {
            const a = pos[e.src], b = pos[e.dst];
            if (!a || !b) return null;
            const hot = cg.newestEdge === e;
            if (e.src === e.dst) {
              const loopUp = a.y > 65;
              const y1 = loopUp ? a.y - 18 : a.y + 18;
              const yCtrl = loopUp ? Math.max(8, a.y - 46) : a.y + 46;
              return (
                <path
                  key={i}
                  d={`M ${a.x - 10} ${y1} C ${a.x - 36} ${yCtrl}, ${a.x + 36} ${yCtrl}, ${a.x + 10} ${y1}`}
                  fill="none"
                  stroke={hot ? "#7928CA" : "#94a3b8"}
                  strokeWidth={hot ? 2.2 : 1.4}
                  markerEnd={`url(#${hot ? "pr-arrow-hot" : "pr-arrow"})`}
                />
              );
            }
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            const bend = 14;
            const mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
            return (
              <path
                key={i}
                d={`M ${a.x + ux * 20} ${a.y + uy * 20} Q ${mx} ${my} ${b.x - ux * 22} ${b.y - uy * 22}`}
                fill="none"
                stroke={hot ? "#7928CA" : "#94a3b8"}
                strokeWidth={hot ? 2.2 : 1.4}
                markerEnd={`url(#${hot ? "pr-arrow-hot" : "pr-arrow"})`}
              />
            );
          })}
          {names.map((nm) => {
            const p = pos[nm];
            if (!p) return null;
            const rec = cg.flagged && nm !== "__main__" && cg.recursive.includes(nm);
            return (
              <g key={nm}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={19}
                  fill={nm === "__main__" ? "#EEF2FF" : "#F5F3FF"}
                  stroke={rec ? "#EF4444" : "#7928CA"}
                  strokeWidth={rec ? 3 : 1.6}
                />
                <text x={p.x} y={p.y + 4} textAnchor="middle" className="pr-cg-label">
                  {nm === "__main__" ? "main" : nm.length > 7 ? nm.slice(0, 6) + "…" : nm}
                </text>
              </g>
            );
          })}
        </svg>
        {names.length === 0 && (
          <div className="pr-empty">
            {cg.flagged ? "No functions defined in this program (pure script execution)." : "Functions and calls appear as the BFS discovers them."}
          </div>
        )}
        {cg.flagged && (
          <div className="pr-chip-row">
            <span className="pr-chip">Reachable: {cg.reachable.length}</span>
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
              <tr key={r.line} className={`pr-led-row ${activeLine === r.line ? "active" : ""}`}>
                <td>{r.line}</td>
                <td className="op"><code>{r.code}</code><span className="pr-op">{r.operation}</span></td>
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
        <div key={n} className={`pr-sig-row ${currentFunc === n ? "now" : ""}`}>
          <b>{n === "__main__" ? "main" : n}()</b>
          {sigs[n] ? (
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

function ResultScene({ final, status, result, fallbackReason }) {
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

export default function PipelineReplay({ sourceCode }) {
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

  const derived = useMemo(() => (trace ? deriveState(trace, allEvents, cur) : null), [trace, allEvents, cur]);

  /* ---- guard states ---- */
  if (!hasCode) {
    return <div className="pr-root"><div className="pr-state">Write or build some code, then open this tab to watch the analysis model work through it.</div></div>;
  }
  if (!ready) {
    return <div className="pr-root"><div className="pr-state">The Python engine is still loading…</div></div>;
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
      return <AstTree nodes={trace.ast} upTo={derived.revealTo} activeNode={derived.node} visited={null} stmtOnly={false} />;
    }
    if (cur.stage === "callgraph") return <CallGraphScene cg={derived.cg} />;
    if (cur.stage === "topo") return <TopoScene topo={derived.topo} />;
    if (traversal) {
      return (
        <div className="pr-split">
          <AstTree nodes={trace.ast} upTo={Infinity} activeNode={derived.node} visited={derived.visited} stmtOnly />
          <div className="pr-col">
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
            <Ledger
              rows={derived.rows}
              activeLine={derived.line}
              title={cur.stage === "signature" ? "Rule applications (signature pass)" : "Per-line local/global weights"}
              showFunc={cur.stage === "signature"}
            />
          </div>
        </div>
      );
    }
    if (cur.stage === "master") return <MasterScene items={derived.master} symbolCount={trace?.final?.symbol_table?.length ?? 0} />;
    if (cur.stage === "efficiency") return <EfficiencyScene eff={derived.eff} />;
    return <ResultScene final={trace.final} status={trace.status} result={derived.result || (isFallback ? cur : null)} fallbackReason={trace.fallback_reason} />;
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

      <div className="pr-main">
        <SourcePane lines={trace.source} activeLine={derived.line} />
        <div className="pr-scene">{scene}</div>
      </div>

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
        <div className="pr-seg" role="group" aria-label="Detail level">
          <button type="button" className={detail === "key" ? "on" : ""} onClick={() => changeDetail("key")}>Key steps</button>
          <button type="button" className={detail === "all" ? "on" : ""} onClick={() => changeDetail("all")}>Every step</button>
        </div>
      </div>
    </div>
  );
}
