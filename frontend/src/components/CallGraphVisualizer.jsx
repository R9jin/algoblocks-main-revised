import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCubes, FaProjectDiagram } from 'react-icons/fa';
import '../styles/CallGraphVisualizer.css';

const CallGraphVisualizer = ({ analysisData }) => {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);

  const callGraph = analysisData?.call_graph || {};
  const rawNodes = Object.keys(callGraph);

  // Update container size for the SVG canvas
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 600
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [analysisData]);

  // Layout Engine: Calculates BFS Layers and SVG coordinates
  const { nodes, edges, layoutWidth, layoutHeight } = useMemo(() => {
    if (!rawNodes.length) return { nodes: [], edges: [], layoutWidth: 0, layoutHeight: 0 };

    // 1. Assign Layers via BFS (Breadth-First Search)
    const layers = {};
    const visited = {};
    
    // Attempt to find the entry point. Default to __main__ or the first function.
    const root = callGraph['__main__'] ? '__main__' : rawNodes[0];

    const queue = [root];
    visited[root] = 0;
    layers[0] = [root];

    while (queue.length > 0) {
      const u = queue.shift();
      const currLayer = visited[u];
      const neighbors = callGraph[u] || [];

      neighbors.forEach(v => {
        // If not visited, assign to the next layer down
        if (visited[v] === undefined) {
          visited[v] = currLayer + 1;
          if (!layers[currLayer + 1]) layers[currLayer + 1] = [];
          layers[currLayer + 1].push(v);
          queue.push(v);
        }
      });
    }

    // Capture Unreachable/Dead Functions and throw them at the bottom
    let maxLayer = Math.max(...Object.keys(layers).map(Number));
    rawNodes.forEach(node => {
      if (visited[node] === undefined) {
        visited[node] = maxLayer + 1;
        if (!layers[maxLayer + 1]) layers[maxLayer + 1] = [];
        layers[maxLayer + 1].push(node);
      }
    });

    // 2. Calculate Coordinates
    const Y_SPACING = 160;
    const MIN_X_SPACING = 240;

    let maxNodesInLayer = 0;
    Object.values(layers).forEach(layerNodes => {
      if (layerNodes.length > maxNodesInLayer) maxNodesInLayer = layerNodes.length;
    });

    const reqWidth = Math.max(containerSize.width, maxNodesInLayer * MIN_X_SPACING);
    const reqHeight = Math.max(containerSize.height, (Object.keys(layers).length) * Y_SPACING + 100);

    const nodeCoords = {};
    const nodeArr = [];

    Object.entries(layers).forEach(([layerIdx, layerNodes]) => {
      const y = (parseInt(layerIdx) + 1) * Y_SPACING - (Y_SPACING / 2);
      const count = layerNodes.length;
      const sectionWidth = reqWidth / count;

      layerNodes.forEach((nodeId, idx) => {
        const x = sectionWidth * idx + (sectionWidth / 2);
        nodeCoords[nodeId] = { x, y };
        nodeArr.push({ id: nodeId, x, y, layer: parseInt(layerIdx) });
      });
    });

    // 3. Create SVG Edges
    const edgeArr = [];
    Object.entries(callGraph).forEach(([u, neighbors]) => {
      neighbors.forEach(v => {
        // If node exists (filters out built-ins that weren't tracked as nodes)
        if (nodeCoords[u] && nodeCoords[v]) {
          edgeArr.push({
            id: `${u}-${v}`,
            source: u,
            target: v,
            sx: nodeCoords[u].x,
            sy: nodeCoords[u].y + 25, // Start edge from bottom of node
            tx: nodeCoords[v].x,
            ty: nodeCoords[v].y - 25, // Point edge to top of node
            isSelf: u === v,
            isBack: visited[v] <= visited[u] && u !== v // Backtracking recursion
          });
        }
      });
    });

    return { nodes: nodeArr, edges: edgeArr, layoutWidth: reqWidth, layoutHeight: reqHeight };

  }, [callGraph, containerSize, rawNodes]);

  if (!rawNodes.length) {
    return (
      <div className="callgraph-empty">
        <FaProjectDiagram className="empty-icon" />
        <p>No function calls detected to map.</p>
      </div>
    );
  }

  return (
    <div className="callgraph-visualizer">
      <div className="callgraph-header">
        <div className="header-title">
          <FaProjectDiagram className="header-icon" />
          <h3>Dynamic Call Graph</h3>
        </div>
        <div className="nodes-badge">
          <FaCubes />
          <span>{nodes.length} Executable Nodes</span>
        </div>
      </div>

      <div className="callgraph-canvas-container" ref={containerRef}>
        <div className="callgraph-scroll-area" style={{ width: layoutWidth, height: layoutHeight }}>
          
          {/* SVG Layer for Drawing Edges */}
          <svg className="callgraph-svg" width={layoutWidth} height={layoutHeight}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#95a5a6" />
              </marker>
              <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#e74c3c" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const { sx, sy, tx, ty, isSelf, isBack, source, target } = edge;
              let pathData = "";

              if (isSelf) {
                // Draw a loop out to the right for self-recursion (e.g. merge_sort -> merge_sort)
                pathData = `M ${sx + 70},${sy - 25} C ${sx + 140},${sy - 60} ${sx + 140},${sy + 60} ${sx + 70},${sy + 10}`;
              } else if (isBack) {
                // Draw a wide loop out to the left for back-edges (Mutual Recursion)
                pathData = `M ${sx - 70},${sy - 25} C ${sx - 180},${sy} ${tx - 180},${ty} ${tx - 70},${ty - 10}`;
              } else {
                // Standard smooth S-curve for forward logic
                const midY = (sy + ty) / 2;
                pathData = `M ${sx},${sy} C ${sx},${midY} ${tx},${midY} ${tx},${ty}`;
              }

              const isHighlighted = hoveredNode === source || hoveredNode === target;

              return (
                <path
                  key={edge.id}
                  d={pathData}
                  fill="none"
                  stroke={isHighlighted ? "#e74c3c" : "#454d5a"}
                  strokeWidth={isHighlighted ? "3" : "2"}
                  markerEnd={`url(#${isHighlighted ? 'arrowhead-highlight' : 'arrowhead'})`}
                  style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
                />
              );
            })}
          </svg>

          {/* HTML Layer for Drawing Nodes */}
          {nodes.map((node) => {
            const isMain = node.id === "__main__";
            const isHovered = hoveredNode === node.id;
            
            return (
              <div
                key={node.id}
                className={`cg-node ${isMain ? 'cg-main' : ''} ${isHovered ? 'cg-hovered' : ''}`}
                style={{ left: node.x, top: node.y }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <div className="cg-node-title">{isMain ? "Main Program" : `${node.id}()`}</div>
                <div className="cg-node-layer">Layer {node.layer}</div>
              </div>
            );
          })}
          
        </div>
      </div>
    </div>
  );
};

export default CallGraphVisualizer;