import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

const DEFAULT_COLORS = ["#7c5cff", "#ff7a7a", "#34c759", "#ffb84d", "#6ad3ff"];

function computeValue(curve, n) {
  switch (curve) {
    case "O(1)":
      return 1;
    case "O(log n)":
      return Math.log2(n || 1) || 0.0001;
    case "O(n)":
      return n;
    case "O(n log n)":
      return n * (Math.log2(n || 1) || 0.0001);
    case "O(n^2)":
      return n * n;
    case "O(2^n)":
      // cap to avoid Infinity on chart
      return Math.min(Math.pow(2, n), 1e9);
    default:
      return n;
  }
}

function generateData(maxN, curves, normalize = true) {
  const rows = [];
  for (let n = 1; n <= maxN; n++) {
    const row = { n };
    curves.forEach((c) => {
      row[c] = computeValue(c, n);
    });
    rows.push(row);
  }

  if (!normalize) return rows;

  // Normalize each curve so the largest value becomes 1 — this makes curves comparable visually
  const maxPerCurve = {};
  curves.forEach((c) => {
    maxPerCurve[c] = Math.max(...rows.map((r) => r[c] || 0), 1);
  });

  return rows.map((r) => {
    const out = { n: r.n };
    curves.forEach((c) => {
      out[c] = (r[c] || 0) / maxPerCurve[c];
    });
    return out;
  });
}

export default function BigOChart({ maxN = 32, curves = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"], normalize = true, colors = DEFAULT_COLORS }) {
  const data = useMemo(() => generateData(Math.max(4, maxN), curves, normalize), [maxN, curves, normalize]);

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, left: 12, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="n" label={{ value: "n (input size)", position: "insideBottomRight", offset: -6 }} />
          <YAxis tickFormatter={(v) => (v >= 0 && v <= 1 ? `${Math.round(v * 100)}%` : v)} />
          <Tooltip formatter={(value, name) => [typeof value === "number" ? value.toFixed(4) : value, name]} />
          <Legend />
          {curves.map((c, idx) => (
            <Line key={c} type="monotone" dataKey={c} stroke={colors[idx % colors.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
