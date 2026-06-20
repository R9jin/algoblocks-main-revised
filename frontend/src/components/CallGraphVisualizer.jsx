import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCubes, FaProjectDiagram } from 'react-icons/fa';
import '../styles/CallGraphVisualizer.css';

const CallGraphVisualizer = ({ analysisData, callGraph: callGraphProp }) => {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);

  // 1. SAFE EXTRACTION: The dangerous fallback has been removed. 
  // It will no longer accidentally map JSON metadata keys.
  const extractCallGraph = () => {
    if (callGraphProp && typeof callGraphProp === 'object' && Object.keys(callGraphProp).length > 0) return callGraphProp;
    if (analysisData?.call_graph && typeof analysisData.call_graph === 'object') return analysisData.call_graph;
    if (analysisData?.callGraph && typeof analysisData.callGraph === 'object') return analysisData.callGraph;
    if (analysisData?.analysis?.call_graph && typeof analysisData.analysis.call_graph === 'object') return analysisData.analysis.call_graph;
    return {};
  };

  const callGraph = extractCallGraph();

  // 2. Filter raw nodes to guarantee strings (prevents random object keys from crashing the layout)
  const rawNodes = Object.keys(callGraph).filter(k => typeof k === 'string');

  // 3. A graph is empty if no nodes exist or only __main__ exists with no external calls
  const totalEdges = Object.values(callGraph).reduce((sum, calls) => sum + (Array.isArray(calls) ? calls.length : 0), 0);
  const isEmpty = rawNodes.length === 0 || (rawNodes.length === 1 && rawNodes[0] === '__main__' && totalEdges === 0);

  // 4. Stable signature to completely prevent the "changed size between renders" React Hook crash
  const graphSignature = JSON.stringify(callGraph);

  // Update container size dynamically
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
    const timeoutId = setTimeout(updateSize, 100);

    let resizeObserver;
    if (window.ResizeObserver && containerRef.current) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timeoutId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // 5. Layout Engine
  const { nodes, edges, layoutWidth, layoutHeight } = useMemo(() => {
    if (isEmpty) return { nodes: [], edges: [], layoutWidth: 0, layoutHeight: 0 };

    const layers = {};
    const visited = {};

    const root = callGraph['__main__'] ? '__main__' : rawNodes[0];

    const queue = [root];
    visited[root] = 0;
    layers[0] = [root];

    while (queue.length > 0) {
      const u = queue.shift();
      const currLayer = visited[u];
      const neighbors = callGraph[u] || [];

      const neighborArray = Array.isArray(neighbors) ? neighbors : [];
      neighborArray.forEach(v => {
        if (visited[v] === undefined) {
          visited[v] = currLayer + 1;
          if (!layers[currLayer + 1]) layers[currLayer + 1] = [];
          layers[currLayer + 1].push(v);
          queue.push(v);
        }
      });
    }

    // Capture unlinked/dead code functions
    const layerKeys = Object.keys(layers).map(Number);
    let maxLayer = layerKeys.length > 0 ? Math.max(...layerKeys) : 0;

    rawNodes.forEach(node => {
      if (visited[node] === undefined) {
        visited[node] = maxLayer + 1;
        if (!layers[maxLayer + 1]) layers[maxLayer + 1] = [];
        layers[maxLayer + 1].push(node);
      }
    });

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

    const edgeArr = [];
    Object.entries(callGraph).forEach(([u, neighbors]) => {
      const neighborArray = Array.isArray(neighbors) ? neighbors : [];
      neighborArray.forEach(v => {
        if (nodeCoords[u]) {
          if (!nodeCoords[v]) {
             const exX = reqWidth / 2;
             const exY = reqHeight - 50;
             nodeCoords[v] = { x: exX, y: exY };
             nodeArr.push({ id: v, x: exX, y: exY, layer: maxLayer + 2, isExternal: true });
          }

          edgeArr.push({
            id: `${u}-${v}-${Math.random().toString(36).substring(2, 7)}`,
            source: u,
            target: v,
            sx: nodeCoords[u].x,
            sy: nodeCoords[u].y + 25,
            tx: nodeCoords[v].x,
            ty: nodeCoords[v].y - 25,
            isSelf: u === v,
            isBack: visited[v] <= visited[u] && u !== v
          });
        }
      });
    });

    return { nodes: nodeArr, edges: edgeArr, layoutWidth: reqWidth, layoutHeight: reqHeight };

  }, [graphSignature, containerSize.width, containerSize.height, isEmpty]);

  if (isEmpty) {
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
                pathData = `M ${sx + 70},${sy - 25} C ${sx + 140},${sy - 60} ${sx + 140},${sy + 60} ${sx + 70},${sy + 10}`;
              } else if (isBack) {
                pathData = `M ${sx - 70},${sy - 25} C ${sx - 180},${sy} ${tx - 180},${ty} ${tx - 70},${ty - 10}`;
              } else {
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

          {nodes.map((node) => {
            const isMain = node.id === "__main__";
            const isHovered = hoveredNode === node.id;

            return (
              <div
                key={node.id}
                className={`cg-node ${isMain ? 'cg-main' : ''} ${isHovered ? 'cg-hovered' : ''} ${node.isExternal ? 'cg-external' : ''}`}
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