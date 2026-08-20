// MemoryVisualizer.jsx
import { useMemo, useState } from 'react';
import {
  FaCube,
  FaDatabase,
  FaFont,
  FaHashtag,
  FaInfoCircle,
  FaLayerGroup,
  FaLink,
  FaMemory,
  FaRandom,
  FaRegHdd,
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

const MemoryVisualizer = ({ analysisData, currentStep }) => {
  const [hoveredAlloc, setHoveredAlloc] = useState(null);

  const stepData = useMemo(() => {
    if (!analysisData || analysisData.length === 0 || currentStep < 0) return null;
    return analysisData[currentStep] || null;
  }, [analysisData, currentStep]);

  const currentMemoryState = stepData?.memory_state || {};
  const variables = Object.entries(currentMemoryState);

  const stackVars = variables.filter(([, v]) => getTypeConfig(v.type).region === 'stack');
  const heapVars = variables.filter(([, v]) => getTypeConfig(v.type).region === 'heap');

  if (!analysisData || analysisData.length === 0) {
    return (
      <div className="memory-visualizer empty-state">
        <FaRegHdd className="empty-icon" />
        <p>Run your code to see how its variables live in the stack and heap.</p>
      </div>
    );
  }

  const renderCard = ([varName, varData], index) => {
    const config = getTypeConfig(varData.type);
    const isHovered = hoveredAlloc === varName;
    const size = varData.size ?? 1;

    return (
      <div
        key={`${varName}-${index}`}
        className={`memory-card ${isHovered ? 'hovered' : ''}`}
        onMouseEnter={() => setHoveredAlloc(varName)}
        onMouseLeave={() => setHoveredAlloc(null)}
        style={{ borderTopColor: config.color }}
      >
        <div className="card-top">
          <div className="card-name-group">
            <span className="card-icon" style={{ color: config.color }}>{config.icon}</span>
            <span className="card-name">{varName}</span>
          </div>
          <div className="card-stats">
            <span>{varData.type || 'unknown'}{['list', 'tuple', 'deque', 'dict', 'set', 'defaultdict'].includes((varData.type || '').toLowerCase()) ? ` · ${size} item${size === 1 ? '' : 's'}` : ''}</span>
          </div>
        </div>

        <VariableBody type={varData.type} size={size} preview={varData.preview} color={config.color} />

        {varData.explanation && (
          <div className="card-explanation" style={{ borderLeftColor: config.color }}>
            <FaInfoCircle className="explanation-icon" style={{ color: config.color }} />
            <span className="explanation-text">{varData.explanation}</span>
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
            <span className="header-subtitle">A simplified view of where each variable lives during execution</span>
          </div>
        </div>
        {stepData && (
          <div className="trace-depth-badge">
            <span>Snapshot after line {stepData.lineno ?? '—'}</span>
          </div>
        )}
      </div>

      {variables.length === 0 ? (
        <div className="no-vars">
          <FaRegHdd className="dim-icon" />
          <span>No active variables at this line.</span>
        </div>
      ) : (
        <div className="memory-regions">
          {stackVars.length > 0 && (
            <section className="memory-region">
              <div className="region-label">
                <FaThList /> <span>Stack frame</span>
                <span className="region-caption">Fixed-size values, copied by value</span>
              </div>
              <div className="memory-grid">{stackVars.map(renderCard)}</div>
            </section>
          )}
          {heapVars.length > 0 && (
            <section className="memory-region">
              <div className="region-label">
                <FaDatabase /> <span>Heap</span>
                <span className="region-caption">Dynamically sized objects, accessed by reference</span>
              </div>
              <div className="memory-grid">{heapVars.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryVisualizer;