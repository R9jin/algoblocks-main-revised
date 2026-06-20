import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCompressArrowsAlt, FaCubes, FaNetworkWired, FaProjectDiagram, FaSearchMinus, FaSearchPlus } from 'react-icons/fa';
import '../styles/CallGraphVisualizer.css';

const CallGraphVisualizer = ({ analysisData, callGraph: callGraphProp }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);

  // Pan and Zoom State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Robustly extract the call graph
  const extractCallGraph = () => {
    if (callGraphProp && typeof callGraphProp === 'object' && Object.keys(callGraphProp).length > 0) return callGraphProp;
    if (analysisData?.call_graph && typeof analysisData.call_graph === 'object') return analysisData.call_graph;
    if (analysisData?.callGraph && typeof analysisData.callGraph === 'object') return analysisData.callGraph;
    if (analysisData?.analysis?.call_graph && typeof analysisData.analysis.call_graph === 'object') return analysisData.analysis.call_graph;
    return {};
  };

  const callGraph = extractCallGraph();
  const rawNodes = Object.keys(callGraph).filter(k => typeof k === 'string');

  // Compute Total Calls & Check if Empty
  const totalEdges = Object.values(callGraph).reduce((sum, calls) => sum + (Array.isArray(calls) ? calls.length : 0), 0);
  const isEmpty = rawNodes.length === 0 || (rawNodes.length === 1 && rawNodes[0] === '__main__' && totalEdges === 0);

  const graphSignature = JSON.stringify(callGraph);

  // Node Dimensions
  const NODE_W = 180;
  const NODE_H = 60;

  // Layout Engine
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

    const reqWidth = Math.max(800, maxNodesInLayer * MIN_X_SPACING);
    const reqHeight = Math.max(600, (Object.keys(layers).length) * Y_SPACING + 100);

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
            sy: nodeCoords[u].y,
            tx: nodeCoords[v].x,
            ty: nodeCoords[v].y,
            isSelf: u === v,
            isBack: visited[v] <= visited[u] && u !== v
          });
        }
      });
    });

    return { nodes: nodeArr, edges: edgeArr, layoutWidth: reqWidth, layoutHeight: reqHeight };

  }, [graphSignature, isEmpty]);

  // Center Graph on Load
  const resetView = () => {
    if (containerRef.current && layoutWidth > 0 && layoutHeight > 0) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const fitScale = Math.min(cw / layoutWidth, ch / layoutHeight, 1) * 0.9;

      setTransform({
        x: (cw - layoutWidth * fitScale) / 2,
        y: (ch - layoutHeight * fitScale) / 2,
        scale: fitScale
      });
    }
  };

  useEffect(() => {
    resetView();
  }, [graphSignature, layoutWidth, layoutHeight]);

  // --- PAN AND ZOOM HANDLERS ---
  const handleMouseDown = (e) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Natively attach wheel event to prevent passive listener issues in React
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomSensitivity = 0.0015;
      const zoomFactor = -e.deltaY * zoomSensitivity;

      setTransform((prev) => {
        const newScale = Math.min(Math.max(0.1, prev.scale * (1 + zoomFactor)), 5);
        const rect = el.getBoundingClientRect();
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xs = (mouseX - prev.x) / prev.scale;
        const ys = (mouseY - prev.y) / prev.scale;

        const newX = mouseX - xs * newScale;
        const newY = mouseY - ys * newScale;

        return { x: newX, y: newY, scale: newScale };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const manualZoom = (factor) => {
    setTransform(prev => {
      const newScale = Math.min(Math.max(0.1, prev.scale * factor), 5);
      const cw = containerRef.current?.clientWidth || 800;
      const ch = containerRef.current?.clientHeight || 600;
      const cx = cw / 2;
      const cy = ch / 2;
      const xs = (cx - prev.x) / prev.scale;
      const ys = (cy - prev.y) / prev.scale;
      return { x: cx - xs * newScale, y: cy - ys * newScale, scale: newScale };
    });
  };

  if (isEmpty) {
    return (
      <div className="callgraph-empty">
        <FaProjectDiagram className="empty-icon" />
        <p>No function calls detected to map.</p>
      </div>
    );
  }

  return (
    <div className="callgraph-visualizer" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header Panel */}
      <div className="callgraph-header" style={{ flexShrink: 0 }}>
        <div className="header-title">
          <FaProjectDiagram className="header-icon" />
          <h3>Dynamic Call Graph</h3>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="nodes-badge">
            <FaCubes />
            <span>{nodes.length} Executable Nodes</span>
          </div>
          <div className="nodes-badge" style={{ backgroundColor: '#EEF2FF', color: '#3B82F6', borderColor: '#BFDBFE' }}>
            <FaNetworkWired />
            <span>{totalEdges} Total Calls</span>
          </div>
        </div>
      </div>

      {/* Interactive Graph Area */}
      <div 
        className="callgraph-canvas-container" 
        ref={containerRef}
        style={{ 
          flexGrow: 1, 
          overflow: 'hidden', 
          position: 'relative',
          backgroundColor: '#F8FAFC',
          userSelect: 'none'
        }}
      >
        {/* Floating Zoom Controls */}
        <div style={{ position: 'absolute', right: '20px', bottom: '20px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10 }}>
          <button onClick={() => manualZoom(1.2)} style={controlBtnStyle} title="Zoom In"><FaSearchPlus /></button>
          <button onClick={resetView} style={controlBtnStyle} title="Reset View"><FaCompressArrowsAlt /></button>
          <button onClick={() => manualZoom(0.8)} style={controlBtnStyle} title="Zoom Out"><FaSearchMinus /></button>
        </div>

        {/* Pure SVG Implementation for Crisp Zooming */}
        <svg 
          ref={svgRef}
          width="100%" 
          height="100%" 
          style={{ cursor: isDragging ? 'grabbing' : 'grab', position: 'absolute', top: 0, left: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#95a5a6" />
            </marker>
            <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#e74c3c" />
            </marker>
            <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.05" />
            </filter>
          </defs>

          {/* Group that handles Pan and Zoom */}
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            
            {/* Draw Edges */}
            {edges.map((edge) => {
              const { sx, sy, tx, ty, isSelf, isBack, source, target } = edge;
              let pathData = "";

              if (isSelf) {
                pathData = `M ${sx + NODE_W/2},${sy - 15} C ${sx + NODE_W/2 + 60},${sy - 50} ${sx + NODE_W/2 + 60},${sy + 50} ${sx + NODE_W/2},${sy + 15}`;
              } else if (isBack) {
                pathData = `M ${sx - NODE_W/2},${sy} C ${sx - NODE_W/2 - 80},${sy} ${tx - NODE_W/2 - 80},${ty} ${tx - NODE_W/2},${ty}`;
              } else {
                const midY = (sy + ty) / 2;
                // Offset the end target up slightly so the arrowhead doesn't clip into the border radius
                pathData = `M ${sx},${sy + NODE_H/2} C ${sx},${midY} ${tx},${midY} ${tx},${ty - NODE_H/2 - 5}`;
              }

              const isHighlighted = hoveredNode === source || hoveredNode === target;

              return (
                <path
                  key={edge.id}
                  d={pathData}
                  fill="none"
                  stroke={isHighlighted ? "#e74c3c" : "#94A3B8"}
                  strokeWidth={isHighlighted ? "3" : "2"}
                  markerEnd={`url(#${isHighlighted ? 'arrowhead-highlight' : 'arrowhead'})`}
                  style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
                />
              );
            })}

            {/* Draw SVG Nodes */}
            {nodes.map((node) => {
              const isMain = node.id === "__main__";
              const isHovered = hoveredNode === node.id;
              const isExternal = node.isExternal;

              let strokeColor = "#CBD5E1";
              let bgColor = "#FFFFFF";
              let textColor = "#1E293B";
              let strokeDasharray = "none";
              let strokeWidth = "2";

              if (isMain) {
                strokeColor = "#7928CA";
                bgColor = "#FAF5FF";
                textColor = "#4C1D95";
              } else if (isExternal) {
                strokeColor = "#94A3B8";
                bgColor = "#F1F5F9";
                strokeDasharray = "6,4";
                textColor = "#475569";
              }

              if (isHovered) {
                strokeColor = "#e74c3c";
                strokeWidth = "3";
              }

              const titleText = isMain ? "Main Program" : `${node.id}()`;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={-NODE_W/2} 
                    y={-NODE_H/2} 
                    width={NODE_W} 
                    height={NODE_H} 
                    rx="8"
                    fill={bgColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    filter="url(#node-shadow)"
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  <text x="0" y="-3" textAnchor="middle" fill={textColor} fontSize="14px" fontWeight="bold" fontFamily="Consolas, monospace" style={{ pointerEvents: 'none' }}>
                    {titleText}
                  </text>
                  <text x="0" y="16" textAnchor="middle" fill="#64748B" fontSize="12px" fontFamily="sans-serif" style={{ pointerEvents: 'none' }}>
                    Layer {node.layer}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};

// Inline styling for the zoom/pan buttons
const controlBtnStyle = {
  width: '36px', height: '36px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  color: '#475569',
  fontSize: '14px',
  transition: 'all 0.2s ease'
};

export default CallGraphVisualizer;