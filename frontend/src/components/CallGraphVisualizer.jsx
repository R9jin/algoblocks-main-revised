import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCompressArrowsAlt, FaCubes, FaNetworkWired, FaProjectDiagram, FaSearchMinus, FaSearchPlus } from 'react-icons/fa';
import '../styles/CallGraphVisualizer.css';

const CallGraphVisualizer = ({ analysisData, callGraph: callGraphProp }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);

  // Explanatory hover tooltip: shows a brief plain-language blurb for
  // whichever node or edge the cursor is currently over.
  const [hoverInfo, setHoverInfo] = useState(null); // { title, lines: string[] } | null
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Pan and Zoom State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  
  const lastMousePos = useRef({ x: 0, y: 0 });
  const hintTimeoutRef = useRef(null);

  // Track the container's REAL, live size via ResizeObserver rather than a
  // one-shot read of clientWidth/clientHeight at mount time. The panel this
  // graph lives in is only mounted while its tab is active and can still be
  // mid-layout (0-size, or a stale pre-flex size) at the instant the mount
  // effect runs, and there's no other signal that fires when the panel is
  // later resized -- both are why the view could get stuck zoomed out.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setContainerSize({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Theme Colors
  const themePurple = "#7928CA";
  const themeRed = "#EF4444";
  const themeSlateDark = "#1E293B";
  const themeSlateMuted = "#64748B";
  const themeSlateBorder = "#CBD5E1";
  const themeEdge = "#94A3B8";

  // Robustly extract the call graph and normalize it
  const extractCallGraph = () => {
    let raw = {};
    if (callGraphProp && typeof callGraphProp === 'object' && Object.keys(callGraphProp).length > 0) raw = callGraphProp;
    else if (analysisData?.call_graph && typeof analysisData.call_graph === 'object') raw = analysisData.call_graph;
    else if (analysisData?.callGraph && typeof analysisData.callGraph === 'object') raw = analysisData.callGraph;
    else if (analysisData?.analysis?.call_graph && typeof analysisData.analysis.call_graph === 'object') raw = analysisData.analysis.call_graph;

    const norm = {};
    if (!raw) return norm;
    
    for (const [caller, targets] of Object.entries(raw)) {
      norm[caller] = (Array.isArray(targets) ? targets : []).map(t => {
        if (typeof t === 'string') return { target: t, line: '?', hits: 0 };
        return t;
      });
    }
    return norm;
  };

  const callGraph = extractCallGraph();
  const rawNodes = Object.keys(callGraph).filter(k => typeof k === 'string');

  const totalEdges = Object.values(callGraph).reduce((sum, calls) => sum + calls.length, 0);
  const isEmpty = rawNodes.length === 0 || (rawNodes.length === 1 && rawNodes[0] === '__main__' && totalEdges === 0);

  const graphSignature = JSON.stringify(callGraph);

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

      neighbors.forEach(edgeInfo => {
        const v = edgeInfo.target;
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
    const MIN_X_SPACING = 280; 

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
      neighbors.forEach(edgeInfo => {
        const v = edgeInfo.target;
        const line = edgeInfo.line;
        const hits = edgeInfo.hits;

        if (nodeCoords[u]) {
          if (!nodeCoords[v]) {
             const exX = reqWidth / 2;
             const exY = reqHeight - 50;
             nodeCoords[v] = { x: exX, y: exY };
             nodeArr.push({ id: v, x: exX, y: exY, layer: maxLayer + 2, isExternal: true });
          }

          edgeArr.push({
            id: `${u}-${v}-${line}-${Math.random().toString(36).substring(2, 7)}`,
            source: u,
            target: v,
            line: line,
            hits: hits,
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

  // Per-node call stats for the hover tooltip. For every node we track the
  // full list of callers (who calls it, and at which line) and the full
  // list of callees (what it calls, and at which line), so the tooltip can
  // spell out the calling relationship explicitly rather than just counts.
  const nodeStats = useMemo(() => {
    const stats = {};
    nodes.forEach((n) => { stats[n.id] = { incoming: [], outgoing: [] }; });
    edges.forEach((e) => {
      if (stats[e.target]) {
        stats[e.target].incoming.push({ caller: e.source, line: e.line, hits: e.hits || 0 });
      }
      if (stats[e.source]) {
        stats[e.source].outgoing.push({ callee: e.target, line: e.line, hits: e.hits || 0 });
      }
    });
    return stats;
  }, [nodes, edges]);

  // Builds the structured hover explanation for a node: who calls it (with
  // line numbers) and what it calls (with line numbers), clearly labeled so
  // the direction of the relationship is unambiguous.
  //
  // Recursive self-calls (a function calling itself) are pulled out of
  // "Called by" / "Calls" into their own "Recursion" section. Without this,
  // a recursive function would list itself under BOTH headings with the
  // same lines, which reads as a confusing, seemingly duplicated mess.
  const buildNodeExplanation = (node, stats) => {
    const isMain = node.id === "__main__";
    const isExternal = node.isExternal;
    const lines = [];

    const formatEntry = (name, line, hits) =>
      `${name}() — line ${line !== undefined && line !== null && line !== '' ? line : '?'} (${hits} hit${hits === 1 ? '' : 's'})`;
    const formatSelfEntry = (line, hits) =>
      `line ${line !== undefined && line !== null && line !== '' ? line : '?'} (${hits} hit${hits === 1 ? '' : 's'})`;

    if (isExternal) {
      lines.push({ type: 'text', text: 'Called but not defined in your analyzed code (e.g. a built-in or external function).' });
      lines.push({ type: 'header', text: 'Called by:' });
      if (stats.incoming.length === 0) {
        lines.push({ type: 'empty', text: 'None detected' });
      } else {
        stats.incoming.forEach((c) => lines.push({ type: 'entry', text: formatEntry(c.caller, c.line, c.hits) }));
      }
      return lines;
    }

    // Split out self-calls (caller/callee === this node) from real,
    // different-function callers/callees.
    const externalCallers = stats.incoming.filter((c) => c.caller !== node.id);
    const externalCallees = stats.outgoing.filter((c) => c.callee !== node.id);
    const selfCalls = stats.outgoing.filter((c) => c.callee === node.id);

    lines.push({ type: 'header', text: 'Called by:' });
    if (externalCallers.length === 0) {
      lines.push({
        type: 'empty',
        text: isMain
          ? 'None (entry-point function)'
          : selfCalls.length > 0
            ? 'No other function calls this — only calls itself (see Recursion below)'
            : 'None (no callers detected)',
      });
    } else {
      externalCallers.forEach((c) => lines.push({ type: 'entry', text: formatEntry(c.caller, c.line, c.hits) }));
    }

    lines.push({ type: 'header', text: 'Calls:' });
    if (externalCallees.length === 0) {
      lines.push({ type: 'empty', text: selfCalls.length > 0 ? 'No other functions — only itself (see Recursion below)' : 'None' });
    } else {
      externalCallees.forEach((c) => lines.push({ type: 'entry', text: formatEntry(c.callee, c.line, c.hits) }));
    }

    if (selfCalls.length > 0) {
      lines.push({ type: 'header', text: 'Recursion (calls itself):' });
      selfCalls.forEach((c) => lines.push({ type: 'entry', text: formatSelfEntry(c.line, c.hits) }));
    }

    return lines;
  };

  // Center Graph on Load
  const resetView = () => {
    if (layoutWidth > 0 && layoutHeight > 0) {
      const cw = containerSize.width || containerRef.current?.clientWidth || 0;
      const ch = containerSize.height || containerRef.current?.clientHeight || 0;
      if (cw <= 0 || ch <= 0) return; // container isn't laid out yet -- the ResizeObserver will re-fire once it is

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphSignature, layoutWidth, layoutHeight, containerSize.width, containerSize.height]);

  // --- PAN AND ZOOM HANDLERS ---
  const handleMouseDown = (e) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Attach wheel event to the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        setShowZoomHint(true);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = setTimeout(() => setShowZoomHint(false), 1500);
        return; 
      }

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
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
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
    <div className="callgraph-visualizer" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
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
          {/* Inheriting the Emerald standard theme colors for the edges badge */}
          <div className="nodes-badge" style={{ backgroundColor: '#ECFDF5', color: '#10B981', borderColor: '#A7F3D0' }}>
            <FaNetworkWired />
            <span>{totalEdges} Edges</span>
          </div>
        </div>
      </div>

      {/* Ctrl + Scroll Overlay Hint */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: '500',
        pointerEvents: 'none',
        opacity: showZoomHint ? 1 : 0,
        transition: 'opacity 0.3s ease',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <FaSearchPlus /> Use Ctrl + Scroll to zoom
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

        {/* Explanatory hover tooltip -- follows the cursor over whichever
            node or edge is currently hovered, flipping to stay on-screen
            near the container's edges. */}
        {hoverInfo && (
          <div
            className="callgraph-hover-tooltip"
            style={{
              left: cursorPos.x > containerSize.width - 220 ? cursorPos.x - 210 : cursorPos.x + 16,
              top: cursorPos.y > containerSize.height - 110 ? cursorPos.y - 100 : cursorPos.y + 16,
            }}
          >
            <div className="callgraph-hover-tooltip-title">{hoverInfo.title}</div>
            {hoverInfo.lines.map((line, i) => {
              const item = typeof line === 'string' ? { type: 'text', text: line } : line;
              const isRecursionHeader = item.type === 'header' && item.text.startsWith('Recursion');
              const cls =
                isRecursionHeader ? 'callgraph-hover-tooltip-header callgraph-hover-tooltip-header-recursion' :
                item.type === 'header' ? 'callgraph-hover-tooltip-header' :
                item.type === 'entry' ? 'callgraph-hover-tooltip-entry' :
                item.type === 'empty' ? 'callgraph-hover-tooltip-empty' :
                'callgraph-hover-tooltip-line';
              return <div className={cls} key={i}>{item.text}</div>;
            })}
          </div>
        )}

        {/* Pure SVG Implementation */}
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
              <polygon points="0 0, 10 3.5, 0 7" fill={themeEdge} />
            </marker>
            <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={themeRed} />
            </marker>
            <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.05" />
            </filter>
            <filter id="badge-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* Group that handles Pan and Zoom */}
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            
            {/* Draw Edges */}
            {edges.map((edge) => {
              const { sx, sy, tx, ty, isSelf, isBack, source, target, line, hits } = edge;
              let pathData = "";
              let labelX, labelY;

              if (isSelf) {
                pathData = `M ${sx + NODE_W/2},${sy - 15} C ${sx + NODE_W/2 + 60},${sy - 50} ${sx + NODE_W/2 + 60},${sy + 50} ${sx + NODE_W/2},${sy + 15}`;
                labelX = sx + NODE_W/2 + 60;
                labelY = sy;
              } else if (isBack) {
                pathData = `M ${sx - NODE_W/2},${sy} C ${sx - NODE_W/2 - 80},${sy} ${tx - NODE_W/2 - 80},${ty} ${tx - NODE_W/2},${ty}`;
                labelX = (sx + tx) / 2 - NODE_W/2 - 60;
                labelY = (sy + ty) / 2;
              } else {
                const midY = (sy + ty) / 2;
                pathData = `M ${sx},${sy + NODE_H/2} C ${sx},${midY} ${tx},${midY} ${tx},${ty - NODE_H/2 - 5}`;
                labelX = (sx + tx) / 2;
                labelY = midY;
              }

              const isHighlighted = hoveredNode === source || hoveredNode === target;

              const edgeExplanation = isSelf
                ? [
                    { type: 'entry', text: `Caller: ${source}() (calls itself — recursion)` },
                    { type: 'entry', text: `Call site: line ${line}` },
                    { type: 'text', text: `Ran ${hits || 0} time${hits === 1 ? "" : "s"} during execution.` },
                  ]
                : isBack
                  ? [
                      { type: 'entry', text: `Caller: ${source}()` },
                      { type: 'entry', text: `Callee: ${target}() (earlier point in the call tree)` },
                      { type: 'entry', text: `Call site: line ${line}` },
                      { type: 'text', text: `Ran ${hits || 0} time${hits === 1 ? "" : "s"} -- often part of a loop or recursive pattern.` },
                    ]
                  : [
                      { type: 'entry', text: `Caller: ${source}()` },
                      { type: 'entry', text: `Callee: ${target}()` },
                      { type: 'entry', text: `Call site: line ${line}` },
                      { type: 'text', text: `Ran ${hits || 0} time${hits === 1 ? "" : "s"} while your code executed. A higher count usually means it's inside a loop.` },
                    ];

              return (
                <g
                  key={edge.id}
                  onMouseEnter={() => setHoverInfo({ title: isSelf ? `${source}() — recursive call` : `${source}() calls ${target}()`, lines: edgeExplanation })}
                  onMouseLeave={() => setHoverInfo(null)}
                  style={{ cursor: 'help' }}
                >
                  {/* Wider invisible path underneath, just to make the thin edge easier to hover */}
                  <path d={pathData} fill="none" stroke="transparent" strokeWidth="16" />
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isHighlighted ? themeRed : themeEdge}
                    strokeWidth={isHighlighted ? "3" : "2"}
                    markerEnd={`url(#${isHighlighted ? 'arrowhead-highlight' : 'arrowhead'})`}
                    style={{ transition: 'stroke 0.3s, stroke-width 0.3s', pointerEvents: 'none' }}
                  />
                  
                  {/* Floating Metadata Badge for the Edge */}
                  <g transform={`translate(${labelX}, ${labelY})`}>
                    <rect 
                      x="-45" y="-12" 
                      width="90" height="24" 
                      rx="12" 
                      fill="#FFFFFF" 
                      stroke={isHighlighted ? themeRed : themeSlateBorder} 
                      strokeWidth="1" 
                      filter="url(#badge-shadow)"
                      style={{ transition: 'stroke 0.3s' }}
                    />
                    <text x="0" y="4" textAnchor="middle" fill={isHighlighted ? themeRed : themeSlateMuted} fontSize="10px" fontWeight="bold" fontFamily="sans-serif" style={{ pointerEvents: 'none' }}>
                      L{line} : {hits || 0} hits
                    </text>
                  </g>

                </g>
              );
            })}

            {/* Draw SVG Nodes */}
            {nodes.map((node) => {
              const isMain = node.id === "__main__";
              const isHovered = hoveredNode === node.id;
              const isExternal = node.isExternal;

              let strokeColor = themeSlateBorder;
              let bgColor = "#FFFFFF";
              let textColor = themeSlateDark;
              let strokeDasharray = "none";
              let strokeWidth = "2";

              if (isMain) {
                strokeColor = themePurple;
                bgColor = "#FAF5FF";
                textColor = "#4C1D95";
              } else if (isExternal) {
                strokeColor = themeEdge;
                bgColor = "#F1F5F9";
                strokeDasharray = "6,4";
                textColor = themeSlateMuted;
              }

              if (isHovered) {
                strokeColor = themeRed;
                strokeWidth = "3";
              }

              // Short label drawn inside the node box on the canvas.
              const nodeLabelText = isMain ? "Main Program" : `${node.id}()`;
              // Fuller, unambiguous title shown in the hover tooltip -- makes
              // clear which specific function is being inspected.
              const tooltipTitle = isMain
                ? `Inspecting: ${node.id}() — Main Program (entry point)`
                : isExternal
                  ? `Inspecting: ${node.id}() — external/built-in`
                  : `Inspecting: ${node.id}()`;
              const stats = nodeStats[node.id] || { incoming: [], outgoing: [] };
              const nodeExplanation = buildNodeExplanation(node, stats);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => { setHoveredNode(node.id); setHoverInfo({ title: tooltipTitle, lines: nodeExplanation }); }}
                  onMouseLeave={() => { setHoveredNode(null); setHoverInfo(null); }}
                  style={{ cursor: 'help' }}
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
                    {nodeLabelText}
                  </text>
                  <text x="0" y="16" textAnchor="middle" fill={themeSlateMuted} fontSize="12px" fontFamily="sans-serif" style={{ pointerEvents: 'none' }}>
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

const controlBtnStyle = {
  width: '36px', height: '36px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  color: '#64748B',
  fontSize: '14px',
  transition: 'all 0.2s ease'
};

export default CallGraphVisualizer;