// frontend/src/components/tracePlayer/RecursionTreeTraceFrame.jsx
//
// Renders a recursion call tree that grows one call at a time as the player
// advances, instead of a bulleted "Fib(3) appears 2 times" description.
// Layout is computed generically from each node's parentId (standard
// leaf-counting tidy-tree layout), so this isn't hardcoded to Fibonacci --
// any small call tree with `{ id, parentId, label, revealAt }` nodes works.
import { useMemo } from "react";

const COL_GAP = 78;
const ROW_GAP = 62;
const NODE_R = 24;

function layoutTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, { ...n, children: [] }]));
  let root = null;
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId).children.push(n);
    } else {
      root = n;
    }
  });

  let leafCounter = 0;
  const positions = new Map();

  function visit(node, depth) {
    if (node.children.length === 0) {
      const x = leafCounter;
      leafCounter += 1;
      positions.set(node.id, { x, y: depth });
      return x;
    }
    const childXs = node.children.map((c) => visit(c, depth + 1));
    const x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    positions.set(node.id, { x, y: depth });
    return x;
  }

  if (root) visit(root, 0);

  const maxDepth = Math.max(0, ...[...positions.values()].map((p) => p.y));
  const leafCount = Math.max(leafCounter, 1);

  return { positions, maxDepth, leafCount, byId };
}

export default function RecursionTreeTraceFrame({ nodes, currentStep }) {
  const { positions, maxDepth, leafCount, byId } = useMemo(() => layoutTree(nodes), [nodes]);

  const width = leafCount * COL_GAP;
  const height = (maxDepth + 1) * ROW_GAP;

  const revealed = nodes
    .filter((n) => n.revealAt <= currentStep)
    .sort((a, b) => a.revealAt - b.revealAt);

  const seenCounts = {};
  const occurrenceOf = {};
  revealed.forEach((n) => {
    seenCounts[n.label] = (seenCounts[n.label] || 0) + 1;
    occurrenceOf[n.id] = seenCounts[n.label];
  });

  const edges = [];
  byId.forEach((node) => {
    if (node.parentId && positions.has(node.parentId) && node.revealAt <= currentStep) {
      edges.push({ from: node.parentId, to: node.id });
    }
  });

  const point = (id) => {
    const p = positions.get(id);
    return { x: p.x * COL_GAP + COL_GAP / 2, y: p.y * ROW_GAP + NODE_R };
  };

  return (
    <div className="recursion-tree-trace-frame">
      <div className="recursion-tree-trace-svg-wrap">
        <svg
          viewBox={`0 0 ${Math.max(width, COL_GAP)} ${height}`}
          className="recursion-tree-trace-svg"
          preserveAspectRatio="xMidYMin meet"
        >
          {edges.map((e) => {
            const a = point(e.from);
            const b = point(e.to);
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="recursion-tree-trace-edge"
              />
            );
          })}
          {revealed.map((node) => {
            const p = point(node.id);
            const occurrence = occurrenceOf[node.id];
            const isRepeat = occurrence > 1;
            const isNewest = node.revealAt === currentStep;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                className={`recursion-tree-trace-node${isRepeat ? " repeat" : ""}${isNewest ? " newest" : ""}`}
              >
                <circle r={NODE_R} />
                <text textAnchor="middle" dy="0.32em">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="recursion-tree-trace-legend">
        <div className="recursion-tree-trace-legend-title">Times computed so far</div>
        {Object.keys(seenCounts).length === 0 && (
          <div className="recursion-tree-trace-legend-empty">—</div>
        )}
        {Object.entries(seenCounts)
          .sort()
          .map(([label, count]) => (
            <div
              key={label}
              className={`recursion-tree-trace-legend-row${count > 1 ? " repeat" : ""}`}
            >
              <span>{label}</span>
              <span className="recursion-tree-trace-legend-count">×{count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
