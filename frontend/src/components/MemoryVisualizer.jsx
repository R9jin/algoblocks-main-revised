// MemoryVisualizer.jsx
import { useMemo, useState } from 'react';
import {
  FaCodeBranch,
  FaCube,
  FaFont,
  FaHashtag,
  FaInfoCircle,
  FaLayerGroup,
  FaMemory,
  FaRegHdd,
  FaSitemap
} from 'react-icons/fa';
import '../styles/MemoryVisualizer.css';
import { formatComplexity } from '../utils/formatters';

const MemoryVisualizer = ({ analysisData, currentStep }) => {
  const [hoveredAlloc, setHoveredAlloc] = useState(null);

  // Safely extract the current line's memory state
  const currentMemoryState = useMemo(() => {
    if (!analysisData || analysisData.length === 0 || currentStep < 0) return {};
    const stepData = analysisData[currentStep];
    return stepData?.memory_state || {};
  }, [analysisData, currentStep]);

  // Helper to map python data types to appropriate React Icons and Categories
  const getTypeConfig = (type) => {
    const t = (type || '').toLowerCase();
    if (['int', 'float', 'bool', 'complex'].includes(t)) {
      return { icon: <FaHashtag />, category: 'Primitive', color: '#3498db' }; // Blue
    }
    if (t === 'str') {
      return { icon: <FaFont />, category: 'String', color: '#9b59b6' }; // Purple
    }
    if (['list', 'tuple', 'deque'].includes(t)) {
      return { icon: <FaLayerGroup />, category: 'Linear Structure', color: '#2ecc71' }; // Green
    }
    if (['dict', 'set', 'defaultdict'].includes(t)) {
      return { icon: <FaSitemap />, category: 'Hash Structure', color: '#e74c3c' }; // Red
    }
    return { icon: <FaCube />, category: 'Object/Reference', color: '#f1c40f' }; // Yellow
  };

  const variables = Object.entries(currentMemoryState);

  if (!analysisData || analysisData.length === 0) {
    return (
      <div className="memory-visualizer empty-state">
        <FaRegHdd className="empty-icon" />
        <p>Awaiting analysis data to map memory footprint...</p>
      </div>
    );
  }

  return (
    <div className="memory-visualizer">
      <div className="memory-header">
        <div className="header-title">
          <FaMemory className="header-icon" />
          <h3>Memory Allocation Visualizer</h3>
        </div>
        <div className="trace-depth-badge">
          <FaCodeBranch />
          <span>Trace Depth: {currentStep >= 0 ? currentStep : 0}</span>
        </div>
      </div>

      <div className="memory-grid">
        {variables.length === 0 ? (
          <div className="no-vars">
            <FaRegHdd className="dim-icon" />
            <span>No active memory allocations at this step.</span>
          </div>
        ) : (
          variables.map(([varName, varData], index) => {
            const config = getTypeConfig(varData.type);
            const isHovered = hoveredAlloc === varName;
            const size = varData.size || 1;
            
            // Limit rendering to 50 blocks so massive arrays don't crash the browser
            const visualBlocks = Array.from({ length: Math.min(size, 50) });
            const hasOverflow = size > 50;

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
                    <span>(Type: {varData.type || 'Unknown'}, Size: {size})</span>
                  </div>
                </div>

                <div className="memory-segments-wrapper">
                  <span className="segment-label">(0)</span>
                  <div className="segment-blocks">
                    {visualBlocks.map((_, i) => (
                      <div 
                        key={i} 
                        className="segment-block" 
                        style={{ backgroundColor: config.color, opacity: 0.8 }}
                      ></div>
                    ))}
                    {hasOverflow && <span className="segment-overflow">...</span>}
                  </div>
                  <span className="segment-label">({size})</span>
                </div>

                {/* Educational Insight Explanation */}
                {varData.explanation && (
                  <div className="card-explanation" style={{ borderLeftColor: config.color }}>
                    <FaInfoCircle className="explanation-icon" style={{ color: config.color }} />
                    <span className="explanation-text">{varData.explanation}</span>
                  </div>
                )}

                {varData.complexity && (
                  <div className="card-bottom">
                     <span className="space-complexity">Complexity: {formatComplexity(varData.complexity)}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MemoryVisualizer;