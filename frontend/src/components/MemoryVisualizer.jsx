// MemoryVisualizer.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  FaCube,
  FaDatabase,
  FaFont,
  FaHashtag,
  FaInfoCircle,
  FaLayerGroup,
  FaLink,
  FaMemory,
  FaPause,
  FaPlay,
  FaRandom,
  FaRegHdd,
  FaStepBackward,
  FaStepForward,
  FaThList
} from 'react-icons/fa';
import '../styles/MemoryVisualizer.css';

// Parses a Python repr() preview string like "[3, 1, 4]" or "{'a': 1, 'b': 2}"
// into its top-level elements, so real values can be rendered instead of
// blank placeholder blocks. Tracks bracket/quote depth so nested containers
// and strings containing commas don't get split incorrectly.
function splitTopLevel(str) {
  const parts = [];
  let depth = 0, current = '', inStr = false, strCh = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      current += c;
      if (c === strCh && str[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; current += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// The tracer caps previews at 30 chars and swaps in a placeholder like
// "<list (size: 40)>" once a collection gets large. This only attempts a
// real parse when an actual repr is available; otherwise it returns null so
// the caller can fall back to an honest "values not shown" state instead of
// pretending to know what's inside.
function parseContainerPreview(preview) {
  if (!preview || typeof preview !== 'string') return null;
  const trimmed = preview.trim();
  const first = trimmed[0];
  if (!'[({'.includes(first)) return null; // placeholder text, not a real repr

  const truncated = trimmed.endsWith('...');
  let inner = trimmed.slice(1).replace(/[\])}]\s*$/, '');
  if (truncated) inner = inner.replace(/\.\.\.$/, '');

  const rawParts = splitTopLevel(inner).filter(Boolean);
  const isDict = first === '{' && rawParts.some((p) => /^\s*['"].*['"]\s*:|^\s*[\w.]+\s*:/.test(p));
  const kind = first === '[' ? 'list' : first === '(' ? 'tuple' : isDict ? 'dict' : 'set';

  return { kind, parts: rawParts, truncated };
}

const truncateCell = (text, max = 10) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Where a variable "lives" for the purposes of this teaching visualization.
// This is a simplified stack-vs-heap model for explaining reference vs.
// value semantics, not a literal map of CPython's real memory internals.
const getTypeConfig = (type) => {
  const t = (type || '').toLowerCase();
  if (['int', 'float', 'bool', 'complex'].includes(t)) {
    return { icon: <FaHashtag />, category: 'Primitive', region: 'stack', color: '#38BDF8' };
  }
  if (t === 'str') {
    return { icon: <FaFont />, category: 'String', region: 'stack', color: '#C084FC' };
  }
  if (['list', 'tuple', 'deque'].includes(t)) {
    return { icon: <FaLayerGroup />, category: 'Indexed sequence', region: 'heap', color: '#FBBF24' };
  }
  if (['dict', 'set', 'defaultdict'].includes(t)) {
    return { icon: <FaRandom />, category: 'Hash table', region: 'heap', color: '#FB7185' };
  }
  return { icon: <FaLink />, category: 'Object reference', region: 'heap', color: '#2DD4BF' };
};

// Renders the actual contents of a variable: real indexed cells for
// sequences, real key/value or value chips for hash tables (never a linear
// block strip, since a dict/set is not contiguous memory), and an honest
// "not shown" fallback only when the runtime preview was too large to parse.
const VariableBody = ({ type, size, preview, color }) => {
  const t = (type || '').toLowerCase();
  const isSequence = ['list', 'tuple', 'deque'].includes(t);
  const isHash = ['dict', 'set', 'defaultdict'].includes(t);

  if (!isSequence && !isHash) {
    return (
      <div className="mv-scalar-pill" style={{ borderColor: color }}>
        <span className="mv-scalar-value">{preview || `<${type || 'value'}>`}</span>
      </div>
    );
  }

  const parsed = parseContainerPreview(preview);

  if (isSequence) {
    if (parsed && !parsed.truncated) {
      const shown = parsed.parts.slice(0, 24);
      const remainder = size - shown.length;
      return (
        <div className="mv-sequence-wrapper">
          <div className="mv-index-cells">
            {shown.map((val, i) => (
              <div key={i} className="mv-index-cell" style={{ borderColor: color }}>
                <span className="mv-cell-value" title={val}>{truncateCell(val)}</span>
                <span className="mv-cell-index">{i}</span>
              </div>
            ))}
            {remainder > 0 && <span className="mv-more-tag">+{remainder} more</span>}
          </div>
        </div>
      );
    }
    // Too large (or unparsable) to show real values - be honest about it
    // rather than rendering fake identical squares as if they were data.
    const blockCount = Math.min(size || 0, 50);
    return (
      <div className="mv-sequence-wrapper">
        <div className="mv-abstract-strip">
          <span className="mv-tick">0</span>
          <div className="mv-blocks">
            {Array.from({ length: blockCount }).map((_, i) => (
              <div key={i} className="mv-block" style={{ backgroundColor: color }} />
            ))}
            {size > blockCount && <span className="mv-more-tag">⋯</span>}
          </div>
          <span className="mv-tick">{size}</span>
        </div>
        <span className="mv-fallback-note">Contiguous sequence, {size} item(s) - too large to preview values.</span>
      </div>
    );
  }

  // Hash tables: deliberately NOT rendered as an indexed strip. Order is not
  // guaranteed and there's no meaningful "position 0..N", so chips are laid
  // out unordered to match how the structure actually behaves.
  if (parsed && !parsed.truncated) {
    const shown = parsed.parts.slice(0, 20);
    const remainder = size - shown.length;
    return (
      <div className="mv-chip-cloud">
        {shown.map((entry, i) => {
          const isDict = parsed.kind === 'dict';
          const splitAt = isDict ? entry.indexOf(':') : -1;
          const key = splitAt > -1 ? entry.slice(0, splitAt).trim() : null;
          const val = splitAt > -1 ? entry.slice(splitAt + 1).trim() : entry;
          return (
            <div key={i} className="mv-chip" style={{ borderColor: color }}>
              {key && <span className="mv-chip-key" title={key}>{truncateCell(key, 8)}</span>}
              {key && <span className="mv-chip-arrow">→</span>}
              <span className="mv-chip-value" title={val}>{truncateCell(val, 8)}</span>
            </div>
          );
        })}
        {remainder > 0 && <span className="mv-more-tag">+{remainder} more</span>}
      </div>
    );
  }
  return (
    <div className="mv-hash-fallback">
      <div className="mv-dot-cloud">
        {Array.from({ length: Math.min(size || 0, 24) }).map((_, i) => (
          <span key={i} className="mv-dot" style={{ backgroundColor: color }} />
        ))}
      </div>
      <span className="mv-fallback-note">{size} entr{size === 1 ? 'y' : 'ies'} - hashed, unordered, values too large to preview.</span>
    </div>
  );
};

const CONTAINER_TYPES = ['list', 'tuple', 'deque', 'dict', 'set', 'defaultdict'];
const isContainerType = (type) => CONTAINER_TYPES.includes((type || '').toLowerCase());
const looksLikeRealRepr = (preview) => typeof preview === 'string' && '[({'.includes(preview.trim()[0] || '');
const sameVar = (a, b) => !!a && !!b && a.type === b.type && a.size === b.size && a.preview === b.preview;

// Groups one snapshot into stack slots (scalars) and heap objects. When the
// tracer supplied object identities, several names bound to the SAME object
// (b = a) collapse into one heap card with all of its names; without them (older
// saved results) every name keeps its own card, exactly as before. `prevState`
// (the previous snapshot) is only used to mark what is new / changed.
const buildModel = (memoryState, prevState) => {
  const stack = [];
  const heapMap = new Map();
  Object.entries(memoryState || {}).forEach(([name, v]) => {
    const cfg = getTypeConfig(v.type);
    const prev = prevState ? prevState[name] : undefined;
    let status = 'same';
    if (prevState) status = !prev ? 'new' : (sameVar(prev, v) ? 'same' : 'changed');
    if (cfg.region === 'stack') {
      stack.push({ name, v, cfg, status, prev });
      return;
    }
    const hasId = v.id !== undefined && v.id !== null;
    const key = hasId ? `id:${v.id}` : `name:${name}`;
    const entry = heapMap.get(key);
    if (entry) {
      entry.members.push({ name, status, prev });
      if ((v.size ?? 0) > (entry.v.size ?? 0)) entry.v = v;
    } else {
      heapMap.set(key, { key, v, cfg, hasId, members: [{ name, status, prev }] });
    }
  });

  const heap = [...heapMap.values()].map((entry) => {
    const names = entry.members.map((m) => m.name);
    const old = entry.members.filter((m) => m.status !== 'new');
    const status = old.length === 0 && prevState ? 'new'
      : old.some((m) => m.status === 'changed') ? 'changed' : 'same';
    return {
      ...entry,
      names,
      status,
      prev: old.find((m) => m.prev)?.prev,
      newAliases: status !== 'new' && prevState ? entry.members.filter((m) => m.status === 'new').map((m) => m.name) : [],
    };
  });

  // Separate objects that merely hold equal values (a = [1,2]; c = [1,2]) are
  // worth pointing out, because they look identical but do not share changes.
  const byValue = new Map();
  heap.forEach((h) => {
    if (!h.hasId || !looksLikeRealRepr(h.v.preview)) return;
    const k = `${h.v.type}|${h.v.size}|${h.v.preview}`;
    byValue.set(k, [...(byValue.get(k) || []), h]);
  });
  heap.forEach((h) => {
    const twins = h.hasId && looksLikeRealRepr(h.v.preview)
      ? (byValue.get(`${h.v.type}|${h.v.size}|${h.v.preview}`) || []).filter((o) => o !== h)
      : [];
    h.twinNames = twins.flatMap((o) => o.names);
  });

  return { stack, heap };
};

// Items held in memory in one snapshot: each scalar counts 1, each distinct
// heap object counts its length. Used for the memory-over-time strip.
const countItems = (memoryState) => {
  const { stack, heap } = buildModel(memoryState, null);
  return stack.length + heap.reduce((n, h) => n + (h.v.size ?? 1), 0);
};

const describeChange = (prev, cur) => {
  if (!prev) return null;
  if (isContainerType(cur.type)) {
    if (prev.size !== cur.size) return `${prev.size} → ${cur.size} item${cur.size === 1 ? '' : 's'}`;
    return 'contents changed';
  }
  return `was ${prev.preview}`;
};

const SPARK_W = 300;
const SPARK_H = 54;

const MemorySpark = ({ values, selected, onSelect, spaceComplexity }) => {
  if (values.length < 2) return null;
  const pad = 6;
  const maxV = Math.max(1, ...values);
  const x = (i) => pad + (i * (SPARK_W - 2 * pad)) / (values.length - 1);
  const y = (v) => SPARK_H - pad - (v / maxV) * (SPARK_H - 2 * pad);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const colW = SPARK_W / values.length;
  return (
    <div className="mv-spark">
      <div className="mv-spark-head">
        <span>Items held in memory, line by line</span>
        <span className="mv-spark-range">{Math.min(...values)} → {Math.max(...values)}{spaceComplexity ? ` · program space ${spaceComplexity}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="mv-spark-svg" role="img" aria-label="Items held in memory at each line">
        <polyline points={points} fill="none" stroke="var(--purple-main)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={x(selected)} cy={y(values[selected])} r="4" fill="#F59E0B" vectorEffect="non-scaling-stroke" />
        {values.map((_, i) => (
          <rect key={i} x={i * colW} y="0" width={colW} height={SPARK_H} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSelect(i)} />
        ))}
      </svg>
    </div>
  );
};

const STATUS_TAG = { new: 'New', changed: 'Changed' };

const MemoryVisualizer = ({ analysisData, currentStep, spaceComplexity = null }) => {
  const [hoveredAlloc, setHoveredAlloc] = useState(null);
  // The chosen step and play flag are tied to the analysis they were chosen in,
  // so a new analysis (a new run) automatically starts the walkthrough over.
  const [picked, setPicked] = useState({ data: null, idx: null, playing: false });
  const sel = picked.data === analysisData ? picked.idx : null;
  const playingRaw = picked.data === analysisData && picked.playing;
  const setPlaying = (on) => setPicked((p) => ({ data: analysisData, idx: p.data === analysisData ? p.idx : null, playing: on }));

  // Only lines that actually had variables in memory are steps; lines that never
  // ran (dead code) or hold no variables have nothing to show.
  const steps = useMemo(
    () => (analysisData || [])
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row && row.memory_state && Object.keys(row.memory_state).length > 0),
    [analysisData]
  );

  const lastIdx = Math.max(0, steps.length - 1);
  const defaultIdx = useMemo(() => {
    const at = steps.findIndex((st) => st.idx === currentStep);
    return at >= 0 ? at : lastIdx;
  }, [steps, currentStep, lastIdx]);
  const eff = sel !== null && sel <= lastIdx ? sel : defaultIdx;

  // Autoplay: advance one line at a time; it simply stops at the last line.
  const playing = playingRaw && eff < lastIdx;
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => setPicked({ data: analysisData, idx: eff + 1, playing: true }), 900);
    return () => clearTimeout(t);
  }, [playing, eff, analysisData]);

  const current = steps[eff] || null;
  const prevState = eff > 0 ? steps[eff - 1].row.memory_state : null;
  const model = useMemo(
    () => (current ? buildModel(current.row.memory_state, prevState) : { stack: [], heap: [] }),
    [current, prevState]
  );
  const removed = useMemo(
    () => (prevState && current ? Object.keys(prevState).filter((k) => !(k in current.row.memory_state)) : []),
    [prevState, current]
  );
  const itemCounts = useMemo(() => steps.map((st) => countItems(st.row.memory_state)), [steps]);

  if (!analysisData || analysisData.length === 0) {
    return (
      <div className="memory-visualizer empty-state">
        <FaRegHdd className="empty-icon" />
        <p>Run your code to see how its variables live in the stack and heap.</p>
      </div>
    );
  }

  const goTo = (i) => setPicked({ data: analysisData, idx: Math.min(Math.max(0, i), lastIdx), playing: false });
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    setPicked({ data: analysisData, idx: eff >= lastIdx ? 0 : eff, playing: true });
  };

  const renderTag = (status) => (STATUS_TAG[status] ? <span className={`mv-status-tag mv-tag-${status}`}>{STATUS_TAG[status]}</span> : null);

  const renderStackCard = ({ name, v, cfg, status, prev }) => {
    const note = status === 'changed' ? describeChange(prev, v) : null;
    return (
      <div
        key={name}
        className={`memory-card mv-status-${status} ${hoveredAlloc === name ? 'hovered' : ''}`}
        onMouseEnter={() => setHoveredAlloc(name)}
        onMouseLeave={() => setHoveredAlloc(null)}
        style={{ borderTopColor: cfg.color }}
      >
        <div className="card-top">
          <div className="card-name-group">
            <span className="card-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
            <span className="card-name">{name}</span>
            {renderTag(status)}
          </div>
          <div className="card-stats"><span>{v.type || 'unknown'}</span></div>
        </div>
        <VariableBody type={v.type} size={v.size ?? 1} preview={v.preview} color={cfg.color} />
        {note && <span className="mv-was">{note}</span>}
        {v.explanation && (
          <div className="card-explanation" style={{ borderLeftColor: cfg.color }}>
            <FaInfoCircle className="explanation-icon" style={{ color: cfg.color }} />
            <span className="explanation-text">{v.explanation}</span>
          </div>
        )}
      </div>
    );
  };

  const renderHeapCard = (h) => {
    const size = h.v.size ?? 1;
    const note = h.status === 'changed' ? describeChange(h.prev, h.v) : null;
    const shared = h.hasId && h.names.length > 1;
    return (
      <div
        key={h.key}
        className={`memory-card mv-status-${h.status} ${h.names.some((n) => n === hoveredAlloc) ? 'hovered' : ''}`}
        onMouseEnter={() => setHoveredAlloc(h.names[0])}
        onMouseLeave={() => setHoveredAlloc(null)}
        style={{ borderTopColor: h.cfg.color }}
      >
        <div className="card-top">
          <div className="card-name-group">
            <span className="card-icon" style={{ color: h.cfg.color }}>{h.cfg.icon}</span>
            {h.names.map((n) => <span key={n} className={shared ? 'card-name mv-name-chip' : 'card-name'}>{n}</span>)}
            {renderTag(h.status)}
          </div>
          <div className="card-stats">
            <span>{h.v.type || 'unknown'}{isContainerType(h.v.type) ? ` · ${size} item${size === 1 ? '' : 's'}` : ''}</span>
          </div>
        </div>
        <VariableBody type={h.v.type} size={size} preview={h.v.preview} color={h.cfg.color} />
        {note && <span className="mv-was">{note}</span>}
        {shared && (
          <div className="mv-ref-note">
            <FaLink />
            <span>
              {h.names.join(' and ')} point to the <strong>same object</strong>, so a change made through one is seen through the other.
              {h.newAliases.length > 0 ? ` (${h.newAliases.join(', ')} just started pointing to it.)` : ''}
            </span>
          </div>
        )}
        {!shared && h.newAliases.length > 0 && (
          <div className="mv-ref-note"><FaLink /><span>New name for this object: {h.newAliases.join(', ')}.</span></div>
        )}
        {h.twinNames.length > 0 && (
          <div className="mv-ref-note mv-ref-twin">
            <FaInfoCircle />
            <span>Holds the same values as {h.twinNames.join(', ')}, but it is a <strong>separate object</strong>, so changes are not shared.</span>
          </div>
        )}
        {h.v.explanation && (
          <div className="card-explanation" style={{ borderLeftColor: h.cfg.color }}>
            <FaInfoCircle className="explanation-icon" style={{ color: h.cfg.color }} />
            <span className="explanation-text">{h.v.explanation}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="memory-visualizer">
      <div className="memory-header">
        <div className="header-title">
          <FaMemory className="header-icon" />
          <div>
            <h3>Stack &amp; Heap Memory Map</h3>
            <span className="header-subtitle">
              Where each variable lives. A snapshot is taken as a line starts, so it shows memory before that line runs
              (for a line inside a loop, the largest state seen).
            </span>
          </div>
        </div>
        {current && (
          <div className="trace-depth-badge">
            <span>Before line {current.row.lineno ?? '—'} runs</span>
          </div>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="no-vars">
          <FaRegHdd className="dim-icon" />
          <span>No variables were in memory while this code ran.</span>
        </div>
      ) : (
        <>
          <div className="mv-controls">
            <button type="button" className="mv-ctl-btn" onClick={() => goTo(eff - 1)} disabled={eff <= 0} aria-label="Previous line" title="Previous line"><FaStepBackward /></button>
            <button type="button" className="mv-ctl-btn mv-ctl-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play through the lines'} title={playing ? 'Pause' : 'Play through the lines'}>
              {playing ? <FaPause /> : <FaPlay />}
            </button>
            <button type="button" className="mv-ctl-btn" onClick={() => goTo(eff + 1)} disabled={eff >= lastIdx} aria-label="Next line" title="Next line"><FaStepForward /></button>
            <input
              className="mv-slider"
              type="range"
              min={0}
              max={lastIdx}
              value={eff}
              onChange={(e) => goTo(Number(e.target.value))}
              aria-label="Step through the lines of your program"
            />
            <span className="mv-step-count">{eff + 1} / {steps.length}</span>
          </div>

          {current?.row.lineOfCode && (
            <div className="mv-code-line"><span className="mv-code-label">Line {current.row.lineno}</span><code>{String(current.row.lineOfCode).trim()}</code></div>
          )}

          <MemorySpark values={itemCounts} selected={eff} onSelect={goTo} spaceComplexity={spaceComplexity} />

          {eff > 0 && (
            <div className="mv-legend">
              <span><i className="mv-dot-new" /> New since the previous line</span>
              <span><i className="mv-dot-changed" /> Changed</span>
              {removed.length > 0 && <span className="mv-removed">No longer in memory: {removed.join(', ')}</span>}
            </div>
          )}

          <div className="memory-regions">
            {model.stack.length > 0 && (
              <section className="memory-region">
                <div className="region-label">
                  <FaThList /> <span>Stack frame</span>
                  <span className="region-caption">Fixed-size values, copied by value</span>
                </div>
                <div className="memory-grid">{model.stack.map(renderStackCard)}</div>
              </section>
            )}
            {model.heap.length > 0 && (
              <section className="memory-region">
                <div className="region-label">
                  <FaDatabase /> <span>Heap</span>
                  <span className="region-caption">Dynamically sized objects, accessed by reference</span>
                </div>
                <div className="memory-grid">{model.heap.map(renderHeapCard)}</div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MemoryVisualizer;
