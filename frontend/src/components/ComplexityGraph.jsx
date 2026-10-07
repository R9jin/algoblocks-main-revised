// frontend/src/components/ComplexityGraph.jsx
//
// Big-O curve chart shown in the per-line dropdown of the Complexity panel.
//
// Design (from panel feedback, Doc A #4):
//  - Every curve is LABELED ON THE CURVE ITSELF (at its right end, or where it
//    leaves the top of the chart), so students never have to guess which line is which.
//  - The X axis is titled "Input size (n)" and the Y axis "Operations (time)" or
//    "Memory (space)", with numbered ticks.
//  - Coloured zones (Excellent -> Horrible) sit behind the curves, and a legend
//    above the chart explains them.
//  - The curve for the line being explained is highlighted; the other classes are
//    drawn faint as a reference so its growth can be compared at a glance.
//  - A one-line readout states the exact value at n = 10, so the numbers are concrete.
//  - Hovering (or touching) the chart draws a crosshair and lists every curve's value at that n;
//    the curve nearest the pointer is highlighted.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import '../styles/ComplexityGraph.css';
import { resolveRecurrenceToBigO, formatComplexity } from '../utils/formatters';

const N_MAX = 10;   // x-axis: input size 0..10 (same for every curve so they can be compared)
const Y_MAX = 60;   // y-axis ceiling; faster-growing curves visibly shoot off the top
const STEPS = 160;

// Smooth (Stirling) approximation of n! so the factorial curve is continuous.
const stirling = (n) => (n <= 1 ? 1 : Math.sqrt(2 * Math.PI * n) * Math.pow(n / Math.E, n));
const lg = (n) => Math.log2(n + 1);

const fnFor = (type, degree = 3) => {
  switch (type) {
    case 'constant': return () => 1;
    case 'log': return lg;
    case 'sqrt': return Math.sqrt;
    case 'linear': return (n) => n;
    case 'nlogn': return (n) => n * lg(n);
    case 'n2logn': return (n) => n * n * lg(n);
    case 'quadratic': return (n) => n * n;
    case 'poly': return (n) => Math.pow(n, degree);
    case 'exponential': return (n) => Math.pow(2, n);
    case 'factorial': return stirling;
    default: return (n) => n;
  }
};

const CANONICAL_LABEL = {
  constant: 'O(1)', log: 'O(log n)', sqrt: 'O(√n)', linear: 'O(n)', nlogn: 'O(n log n)',
  n2logn: 'O(n² log n)', quadratic: 'O(n²)', poly: 'O(n³)', exponential: 'O(2ⁿ)', factorial: 'O(n!)',
};

// Which zone a class sits in (matches the coloured bands behind the curves).
const RATING = {
  constant: 'Excellent', log: 'Excellent', sqrt: 'Good', linear: 'Good', nlogn: 'Fair',
  n2logn: 'Bad', quadratic: 'Bad', poly: 'Horrible', exponential: 'Horrible', factorial: 'Horrible',
};

// Reference curves always drawn, in the order they are listed.
const BASE_TYPES = ['constant', 'log', 'linear', 'nlogn', 'quadratic', 'exponential', 'factorial'];

// Zones are the areas under these boundary curves, painted worst -> best.
const ZONES = [
  { name: 'Horrible',  color: '#ff8a8a', fn: null },            // everything above n²
  { name: 'Bad',       color: '#ffc04d', fn: (n) => n * n },
  { name: 'Fair',      color: '#fff35c', fn: (n) => n * lg(n) },
  { name: 'Good',      color: '#b8e04a', fn: (n) => n },
  { name: 'Excellent', color: '#4cc61e', fn: lg },
];

// Resolve a complexity string to a curve family. "nlogn" must be tested before "logn".
const classifyComplexity = (comp) => {
  if (comp.includes('o(1)')) return { type: 'constant' };
  if (comp.includes('n^2logn') || comp.includes('n²logn')) return { type: 'n2logn' };
  { const m = comp.match(/n\^(\d+)/); if (m && Number(m[1]) >= 3) return { type: 'poly', degree: Number(m[1]) }; }
  if (comp.includes('n³')) return { type: 'poly', degree: 3 };
  if (comp.includes('nlogn')) return { type: 'nlogn' };
  if (comp.includes('logn')) return { type: 'log' };
  if (comp.includes('n^2') || comp.includes('n²') || comp.includes('n*n') || comp.includes('n*m') || comp.includes('m*n')) return { type: 'quadratic' };
  if (comp.includes('2^n') || comp.includes('2ⁿ') || comp.includes('c^n')) return { type: 'exponential' };
  if (comp.includes('n!')) return { type: 'factorial' };
  if (comp.includes('sqrt') || comp.includes('√n')) return { type: 'sqrt' };
  return { type: 'linear' }; // O(n), O(m), O(V+E), O(n+m) and the default
};

// Sample a curve into data-space points; stops where it leaves the top of the chart.
const sampleCurve = (fn) => {
  const pts = [];
  let exitX = null;
  let prev = null;
  for (let i = 0; i <= STEPS; i++) {
    const x = (N_MAX * i) / STEPS;
    const y = fn(x);
    if (y > Y_MAX) {
      if (prev) {
        const t = (Y_MAX - prev.y) / (y - prev.y);
        exitX = prev.x + t * (x - prev.x);
        pts.push({ x: exitX, y: Y_MAX });
      } else {
        exitX = 0;
        pts.push({ x: 0, y: Y_MAX });
      }
      break;
    }
    prev = { x, y };
    pts.push(prev);
  }
  return { pts, exitX };
};

const formatValue = (v) => {
  if (!isFinite(v)) return '∞';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  if (Number.isInteger(v)) return `${v}`;
  return v.toFixed(1);
};

const useElementSize = (ref, fallback) => {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

const ComplexityGraph = ({ complexity, color, label }) => {
  const clipId = useId().replace(/:/g, '');
  const hostRef = useRef(null);
  const { w: W, h: H } = useElementSize(hostRef, { w: 320, h: 220 });
  const [hover, setHover] = useState(null); // { n, mx, my, type } while the pointer is over the plot

  const isSpace = /space/i.test(label || '');
  const yTitle = isSpace ? 'Memory used (space)' : 'Operations (time)';
  const unit = isSpace ? 'memory units' : 'operations';

  const resolved = resolveRecurrenceToBigO(complexity);
  const comp = resolved.toLowerCase().replace(/\s+/g, '');
  const { type: activeType, degree } = classifyComplexity(comp);
  const activeText = formatComplexity(resolved);
  const activeFn = useMemo(() => fnFor(activeType, degree), [activeType, degree]);
  const activeValue = activeFn(N_MAX);
  const rating = RATING[activeType];

  const types = BASE_TYPES.includes(activeType) ? BASE_TYPES : [...BASE_TYPES, activeType];
  const curves = useMemo(() => types.map((t) => {
    const { pts, exitX } = sampleCurve(fnFor(t, degree));
    return { type: t, pts, exitX };
  }), [types.join(','), degree]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- label text (decided before geometry so the right margin can fit it) ----
  const mergedLowActive = activeType === 'constant' || activeType === 'log';
  const narrow = W < 400; // on narrow panels the merged O(log n)/O(1) label wraps onto two lines
  const labelSpecs = [];
  curves.forEach((c) => {
    if (c.type === 'constant') return; // merged into the O(log n) label (as in the reference chart)
    const isActive = c.type === activeType;
    let lines = [CANONICAL_LABEL[c.type]];
    if (c.type === 'log') lines = narrow ? ['O(log n),', 'O(1)'] : ['O(log n), O(1)'];
    if (isActive && c.type !== 'log') lines = [activeText];
    labelSpecs.push({ type: c.type, lines, active: c.type === 'log' ? mergedLowActive : isActive, exitX: c.exitX });
  });
  const labelWidth = (l) => Math.max(...l.lines.map((t) => t.length)) * (l.active ? 7.4 : 6.4) + 6;
  const endSpecs = labelSpecs.filter((l) => l.exitX === null);
  const topSpecs = labelSpecs.filter((l) => l.exitX !== null);

  // Plot geometry in real pixels, so text stays readable at any panel width.
  const ml = narrow ? 44 : 50, mt = 8, mb = 38;
  const mr = Math.min(Math.max(70, Math.max(0, ...endSpecs.map(labelWidth)) + 12), Math.max(70, W * 0.42));
  const pw = Math.max(60, W - ml - mr);
  const ph = Math.max(60, H - mt - mb);
  const px = (x) => ml + (x / N_MAX) * pw;
  const py = (y) => mt + ph - (Math.min(y, Y_MAX) / Y_MAX) * ph;
  const toPath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');

  const zones = useMemo(() => ZONES.map((z) => {
    if (!z.fn) return { ...z, pts: null };
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = (N_MAX * i) / STEPS;
      pts.push({ x, y: Math.min(z.fn(x), Y_MAX) });
    }
    return { ...z, pts };
  }), []);

  // ---- labels placed ON the curves --------------------------------------
  const lineH = 12;
  const endLabels = endSpecs.map((l) => ({ ...l, key: l.type, y: py(fnFor(l.type, degree)(N_MAX)), h: l.lines.length * lineH }));
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    const minGap = (endLabels[i - 1].h + endLabels[i].h) / 2 + 2;
    if (endLabels[i].y - endLabels[i - 1].y < minGap) endLabels[i].y = endLabels[i - 1].y + minGap;
  }
  const topLabels = topSpecs.map((l) => ({ ...l, key: l.type, x: px(l.exitX) + 4, w: labelWidth(l) }));
  topLabels.sort((a, b) => a.x - b.x);
  for (let i = 1; i < topLabels.length; i++) {
    const minGap = topLabels[i - 1].w + 4;
    if (topLabels[i].x - topLabels[i - 1].x < minGap) topLabels[i].x = topLabels[i - 1].x + minGap;
  }
  // keep every label inside the SVG, even on very narrow panels
  topLabels.forEach((l) => { l.x = Math.min(l.x, W - l.w - 2); });

  const xTicks = [0, 2, 4, 6, 8, 10];
  const yTicks = [0, 20, 40, 60];
  const activeCurve = curves.find((c) => c.type === activeType);
  const dot = activeCurve && activeCurve.pts.length ? activeCurve.pts[activeCurve.pts.length - 1] : null;

  // ---- hover: crosshair + a value for every curve at the pointer's n ----------
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (mx < ml || mx > ml + pw || my < mt || my > mt + ph) { setHover(null); return; }
    const n = ((mx - ml) / pw) * N_MAX;
    let best = null, bestD = Infinity;
    curves.forEach((c) => {
      const y = fnFor(c.type, degree)(n);
      if (y > Y_MAX) return; // that curve has already left the chart here, so it can't be "under" the pointer
      const d = Math.abs(py(y) - my);
      if (d < bestD) { bestD = d; best = c.type; }
    });
    setHover({ n, mx, my, type: bestD <= 14 ? best : null });
  };
  const hoverRows = hover
    ? curves.map((c) => ({
        type: c.type,
        v: fnFor(c.type, degree)(hover.n),
        label: c.type === activeType ? activeText : CANONICAL_LABEL[c.type],
        active: c.type === activeType,
      })).sort((x, y) => y.v - x.v)
    : [];
  const tipOnLeft = hover ? hover.mx > W * 0.55 : false;

  return (
    <div className="complexity-graph-container">
      <div className="cg-legend" aria-label="Growth zones">
        {[...ZONES].reverse().map((z) => (
          <span key={z.name} className="cg-chip" style={{ background: z.color }}>{z.name}</span>
        ))}
      </div>

      <div className="cg-plot" ref={hostRef}>
        <svg width={W} height={H} role="img" className="cg-interactive"
          aria-label={`${label || 'Complexity'} chart for ${activeText}: operations versus input size. Hover to read each curve's value.`}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <clipPath id={clipId}><rect x={ml} y={mt} width={pw} height={ph} /></clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {zones.map((z) => (z.pts
              ? <path key={z.name} fill={z.color} fillOpacity="0.42"
                  d={`${toPath(z.pts)} L${px(N_MAX)},${py(0)} L${px(0)},${py(0)} Z`} />
              : <rect key={z.name} x={ml} y={mt} width={pw} height={ph} fill={z.color} fillOpacity="0.42" />
            ))}
          </g>

          {yTicks.map((t) => (
            <line key={`gy${t}`} x1={ml} x2={ml + pw} y1={py(t)} y2={py(t)} className="cg-grid" />
          ))}
          {xTicks.map((t) => (
            <line key={`gx${t}`} x1={px(t)} x2={px(t)} y1={mt} y2={mt + ph} className="cg-grid" />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {curves.filter((c) => c.type !== activeType).map((c) => (
              <path key={c.type} d={toPath(c.pts)} className={`cg-ref-curve ${hover && hover.type === c.type ? 'cg-ref-curve-hover' : ''}`} />
            ))}
            {activeCurve && <path d={toPath(activeCurve.pts)} fill="none" stroke={color} strokeWidth={hover && hover.type === activeType ? 4.4 : 3.2} strokeLinejoin="round" strokeLinecap="round" />}
          </g>
          {dot && <circle cx={px(dot.x)} cy={py(dot.y)} r="4.5" fill="#fff" stroke={color} strokeWidth="2" />}
          {hover && (
            <g pointerEvents="none">
              <line x1={px(hover.n)} x2={px(hover.n)} y1={mt} y2={mt + ph} className="cg-cursor" />
              {hoverRows.filter((r) => r.v <= Y_MAX).map((r) => (
                <circle key={r.type} cx={px(hover.n)} cy={py(r.v)} r={r.type === hover.type ? 5 : 3.2}
                  fill={r.active ? color : 'currentColor'} stroke="#fff" strokeWidth="1.2"
                  opacity={r.active || r.type === hover.type ? 1 : 0.75} />
              ))}
            </g>
          )}

          {endLabels.map((l) => (
            <text key={l.key} x={ml + pw + 6} y={l.y - ((l.lines.length - 1) * lineH) / 2 + 4}
              className={`cg-label ${l.active ? 'cg-label-active' : ''}`} style={l.active ? { fill: color } : undefined}>
              {l.lines.map((t, i) => <tspan key={i} x={ml + pw + 6} dy={i ? lineH : 0}>{t}</tspan>)}
            </text>
          ))}
          {topLabels.map((l) => (
            <text key={l.key} x={l.x} y={mt + 14} className={`cg-label ${l.active ? 'cg-label-active' : ''}`}
              style={l.active ? { fill: color } : undefined}>{l.lines[0]}</text>
          ))}

          <line x1={ml} x2={ml} y1={mt} y2={mt + ph} className="cg-axis" />
          <line x1={ml} x2={ml + pw} y1={mt + ph} y2={mt + ph} className="cg-axis" />
          {xTicks.map((t) => (
            <text key={`tx${t}`} x={px(t)} y={mt + ph + 14} textAnchor="middle" className="cg-tick">{t}</text>
          ))}
          {yTicks.map((t) => (
            <text key={`ty${t}`} x={ml - 6} y={py(t) + 3} textAnchor="end" className="cg-tick">{t}</text>
          ))}
          <text x={ml + pw / 2} y={H - 5} textAnchor="middle" className="cg-axis-title">Input size (n)</text>
          <text transform={`translate(12 ${mt + ph / 2}) rotate(-90)`} textAnchor="middle" className="cg-axis-title">{yTitle}</text>
        </svg>

        {hover && (
          <div className="cg-tooltip"
            style={{
              top: Math.max(4, Math.min(hover.my - 12, H - 24 - hoverRows.length * 17)),
              ...(tipOnLeft ? { right: W - hover.mx + 12 } : { left: hover.mx + 12 }),
            }}>
            <div className="cg-tip-head">{`n = ${hover.n.toFixed(1)}`}</div>
            {hoverRows.map((r) => (
              <div key={r.type}
                className={`cg-tip-row ${r.type === hover.type ? 'cg-tip-hovered' : ''} ${r.active ? 'cg-tip-active' : ''}`}>
                <span className="cg-tip-swatch" style={{ background: r.active ? color : 'currentColor' }} />
                <span className="cg-tip-name">{r.label}{r.active ? ' (yours)' : ''}</span>
                <span className="cg-tip-val">{r.v > Y_MAX ? `${formatValue(r.v)} · off chart` : formatValue(r.v)}</span>
              </div>
            ))}
            <div className="cg-tip-foot">{unit}</div>
          </div>
        )}
      </div>

      <div className="cg-readout">
        <strong style={{ color }}>{activeText}</strong>
        {` at n = ${N_MAX}: ≈ ${formatValue(activeValue)} ${unit}`}
        {activeValue > Y_MAX ? ' (off the chart)' : ''}
        {` · ${rating}`}
        <span className="cg-hint">{' · hover the chart to read each curve'}</span>
      </div>
    </div>
  );
};

export default ComplexityGraph;
