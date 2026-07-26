// frontend/src/components/ComplexityGraph.jsx
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import '../styles/ComplexityGraph.css';
import { resolveRecurrenceToBigO } from '../utils/formatters';

// Smooth (Stirling) approximation of n! so the factorial curve can be
// sampled at the same resolution as every other curve instead of only at
// 9-10 integer points. Accurate to within ~1% by n=2 and improves from there.
const stirlingFactorial = (n) => {
  if (n <= 1) return 1;
  return Math.sqrt(2 * Math.PI * n) * Math.pow(n / Math.E, n);
};

// Compact number formatting for axis ticks (1200 -> "1.2K", 3628800 -> "3.6M")
const formatTick = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1);
};

// Each curve family gets its own max-N and sample density so its true
// mathematical shape (concave / linear / convex / near-vertical) is
// actually visible instead of being squashed into the same 0-10 window as
// every other class. Point counts are high enough for a smooth, accurate
// curve rather than a handful of jagged line segments.
const CURVE_DEFS = {
  constant:    { maxN: 20,  points: 30, fn: () => 1 },
  log:         { maxN: 100, points: 40, fn: (n) => Math.log2(n + 1) },
  sqrt:        { maxN: 100, points: 40, fn: (n) => Math.sqrt(n) },
  linear:      { maxN: 100, points: 40, fn: (n) => n },
  nlogn:       { maxN: 100, points: 40, fn: (n) => n * Math.log2(n + 1) },
  quadratic:   { maxN: 30,  points: 40, fn: (n) => n * n },
  cubic:       { maxN: 15,  points: 40, fn: (n) => Math.pow(n, 3) },
  exponential: { maxN: 15,  points: 40, fn: (n) => Math.pow(2, n) },
  factorial:   { maxN: 9,   points: 40, fn: stirlingFactorial },
};

// Resolve a complexity string to one of the analyzer's 9 recognized classes.
// IMPORTANT: "nlogn" must be checked BEFORE the plain "logn" check, since
// the string "nlogn" itself contains "logn" as a substring. The old code
// checked "logn" first, which meant O(n log n) could never be reached and
// always silently rendered as a plain O(log n) curve instead.
const classifyComplexity = (comp, isConstant) => {
  if (isConstant) return 'constant';
  if (comp.includes('nlogn')) return 'nlogn';
  if (comp.includes('logn')) return 'log';
  if (comp.includes('n^2') || comp.includes('n²') || comp.includes('n*n') || comp.includes('n*m') || comp.includes('m*n')) return 'quadratic';
  if (comp.includes('n^3') || comp.includes('n³')) return 'cubic';
  if (comp.includes('2^n') || comp.includes('2ⁿ') || comp.includes('c^n')) return 'exponential';
  if (comp.includes('n!')) return 'factorial';
  if (comp.includes('v+e') || comp.includes('e+v') || comp.includes('n+m') || comp.includes('m+n')) return 'linear';
  if (comp.includes('sqrt') || comp.includes('√n')) return 'sqrt';
  if (comp.includes('o(n)') || comp.includes('o(m)')) return 'linear';
  return 'linear'; // Default fallback
};

const ComplexityGraph = ({ complexity, color, label }) => {
  // 1. Resolve any T(n) recurrence relations into standard Big-O notation
  const resolvedComplexity = resolveRecurrenceToBigO(complexity);

  // Extract and evaluate the complexity string outside the useMemo so axes can read it
  const comp = resolvedComplexity.toLowerCase().replace(/\s+/g, '');
  const isConstant = comp.includes("o(1)");
  const curveType = classifyComplexity(comp, isConstant);

  // 2. Generate curve data based on the mathematical shape of the resolved complexity
  const data = useMemo(() => {
    const { maxN, points, fn } = CURVE_DEFS[curveType];
    const dataPoints = [];

    // Sample at a fine resolution across a domain sized to that curve
    // family (not a fixed 0..10) so concave (log/sqrt), linear, and convex
    // (quadratic/cubic/exponential/factorial) shapes are all clearly and
    // correctly distinguishable.
    for (let i = 0; i <= points; i++) {
      const n = (maxN * i) / points;
      const yVal = fn(n);
      dataPoints.push({
        n: Number(n.toFixed(2)),
        operations: Number(yVal.toFixed(2))
      });
    }
    return dataPoints;
  }, [curveType]);

  const maxY = data.length ? data[data.length - 1].operations : 1;
  const maxX = data.length ? data[data.length - 1].n : 1;

  return (
    <div className="complexity-graph-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          
          <XAxis
            dataKey="n"
            type="number"
            domain={[0, 'dataMax']}
            ticks={[0, maxX]}
            stroke="#888"
            tickLine={false}
            axisLine={{ stroke: '#A096B9', strokeWidth: 2 }} // Colored, visible X-axis
            tick={{ fill: '#A096B9', fontSize: 9 }}
            tickFormatter={formatTick}
          />

          <YAxis
            type="number"
            domain={[0, isConstant ? 10 : 'dataMax']}
            ticks={isConstant ? [0, 10] : [0, maxY]}
            stroke="#888"
            tickLine={false}
            axisLine={{ stroke: '#A096B9', strokeWidth: 2 }} // Colored, visible Y-axis
            tick={{ fill: '#A096B9', fontSize: 9 }}
            tickFormatter={formatTick}
            width={34}
          />
          
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1C1236', 
              border: `1px solid ${color}`, 
              borderRadius: '6px',
              color: '#fff', 
              fontSize: '0.8rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            itemStyle={{ color: color, fontWeight: 'bold' }}
            labelStyle={{ color: '#A096B9', marginBottom: '4px' }}
            labelFormatter={(label) => `Input Size (n): ${label}`}
            formatter={(value) => [value, label || 'Operations']}
            animationDuration={200}
          />
          
          <Line 
            type="monotone" 
            dataKey="operations" 
            stroke={color} 
            strokeWidth={3} 
            dot={false} 
            activeDot={{ r: 5, fill: '#fff', stroke: color, strokeWidth: 2 }}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ComplexityGraph;