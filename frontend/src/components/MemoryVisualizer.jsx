// frontend/src/components/MemoryVisualizer.jsx
import { useState } from 'react';
import '../styles/MemoryVisualizer.css';
import { formatComplexity } from '../utils/formatters';

const MemoryVisualizer = ({ analysisData, currentStep }) => {
  const [hoveredAlloc, setHoveredAlloc] = useState(null);

  if (!analysisData || analysisData.length === 0) {
    return <div className="memory-empty">Run the code to map memory usage.</div>;
  }

  // Slice the data up to the current execution step to simulate memory build-up
  const executedLines = analysisData.slice(0, currentStep + 1);
  
  // Filter allocations that consume space (ignoring basic O(1) primitives to reduce noise)
  const allocations = executedLines
    .map((step, index) => ({ ...step, displayLine: index + 1 }))
    .filter(step => step.local_space && step.local_space.toLowerCase() !== "o(1)");

  const currentGlobalSpace = executedLines[executedLines.length - 1]?.global_space || "O(1)";

  // Color palette for distinct memory blocks
  const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#9b59b6', '#ff7f50', '#00d8d6'];

  // Heuristic: Map complexity to a relative number of visual grid blocks
  const getBlockCount = (comp) => {
    const c = String(comp).toLowerCase();
    if (c.includes('2^') || c.includes('!')) return 64; // Massive allocation
    if (c.includes('^2') || c.includes('²')) return 32; // Matrix / 2D Array
    if (c.includes('n log')) return 16; // Mergesort buffers
    if (c.includes('n') || c.includes('v') || c.includes('e')) return 8; // Linear arrays
    if (c.includes('log')) return 4; // Call stacks
    return 2; // Default small alloc
  };

  // Process allocations and pre-calculate exact grid boundaries
  let currentOffset = 0;
  const processedAllocs = allocations.map((alloc, idx) => {
    const codeStr = alloc.lineOfCode || alloc.code;
    const varNameMatch = codeStr.match(/^\s*([a-zA-Z0-9_]+)\s*=/);
    const varName = varNameMatch ? varNameMatch[1] : `Ptr_${idx + 1}`;
    
    const blockCount = getBlockCount(alloc.local_space);
    const startIndex = currentOffset;
    const endIndex = currentOffset + blockCount;
    
    currentOffset += blockCount; // Advance the offset for the next allocation

    return {
      ...alloc,
      varName,
      blockCount,
      startIndex,
      endIndex,
      color: colors[idx % colors.length],
      id: `alloc-${idx}`
    };
  });

  // Calculate total grid size (min 128 blocks for visual effect, expanding if memory grows heavily)
  const totalAllocatedBlocks = currentOffset;
  const GRID_COLUMNS = 16;
  const GRID_SIZE = Math.max(128, Math.ceil((totalAllocatedBlocks + 16) / GRID_COLUMNS) * GRID_COLUMNS);

  // Map individual grid cells based on pre-calculated boundaries
  const gridCells = Array.from({ length: GRID_SIZE }).map((_, i) => {
    const foundAlloc = processedAllocs.find(a => i >= a.startIndex && i < a.endIndex) || null;
    return { index: i, alloc: foundAlloc };
  });

  return (
    <div className="memory-visualizer-container">
      <div className="memory-summary-dashboard">
        <div className="mem-stat-box">
          <span className="mem-stat-title">Peak Space Complexity</span>
          <span className="mem-stat-value">{formatComplexity(currentGlobalSpace)}</span>
        </div>
        <div className="mem-stat-box">
          <span className="mem-stat-title">Heap Allocations</span>
          <span className="mem-stat-value">{allocations.length} structures</span>
        </div>
      </div>

      <div className="memory-split-view">
        {/* Left: The Visual Memory Matrix */}
        <div className="memory-matrix-panel">
          <div className="matrix-header">
            <span>0x0000</span>
            <span>SYSTEM HEAP</span>
            <span>0xFFFF</span>
          </div>
          
          <div className="memory-grid">
            {gridCells.map(cell => (
              <div 
                key={cell.index} 
                className={`memory-cell ${cell.alloc ? 'allocated' : 'free'} ${hoveredAlloc === cell.alloc?.id ? 'highlighted' : ''}`}
                style={{ 
                  backgroundColor: cell.alloc ? cell.alloc.color : undefined,
                  opacity: hoveredAlloc && hoveredAlloc !== cell.alloc?.id ? 0.3 : 1
                }}
                onMouseEnter={() => setHoveredAlloc(cell.alloc?.id)}
                onMouseLeave={() => setHoveredAlloc(null)}
              />
            ))}
          </div>
          <div className="matrix-footer">
            <span className="legend-free">■ Free Space</span>
            <span className="legend-used">■ Allocated</span>
          </div>
        </div>

        {/* Right: Allocation Ledger */}
        <div className="memory-ledger-panel">
          <h4 className="ledger-title">Allocation Registry</h4>
          {processedAllocs.length === 0 ? (
            <div className="ledger-empty">
              <span className="safe-icon">✅</span> O(1) - No dynamic memory detected.
            </div>
          ) : (
            <div className="ledger-list">
              {processedAllocs.map(alloc => (
                <div 
                  key={alloc.id} 
                  className={`ledger-item ${hoveredAlloc === alloc.id ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredAlloc(alloc.id)}
                  onMouseLeave={() => setHoveredAlloc(null)}
                  style={{ borderLeftColor: alloc.color }}
                >
                  <div className="ledger-item-header">
                    <div className="ledger-var">
                      <span className="color-dot" style={{ backgroundColor: alloc.color }}></span>
                      {alloc.varName}
                    </div>
                    <div className="ledger-complexity" style={{ color: alloc.color }}>
                      {formatComplexity(alloc.local_space)}
                    </div>
                  </div>
                  <div className="ledger-code-line">
                    <span className="line-num">L{alloc.displayLine}:</span>
                    <code>{alloc.lineOfCode || alloc.code}</code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryVisualizer;