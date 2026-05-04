// frontend/src/components/MemoryVisualizer.jsx
import '../styles/MemoryVisualizer.css';
import { formatComplexity } from '../utils/formatters';

const MemoryVisualizer = ({ analysisData, currentStep }) => {
  if (!analysisData || analysisData.length === 0) {
    return <div className="memory-empty">Run the code to map memory usage.</div>;
  }

  // Slice the data up to the current execution step to simulate memory build-up
  const executedLines = analysisData.slice(0, currentStep + 1);
  
  // Map original line numbers (index + 1) BEFORE filtering so we don't lose the exact line
  const allocations = executedLines
    .map((step, index) => ({ ...step, displayLine: index + 1 }))
    .filter(
      (step) => step.local_space && step.local_space.toLowerCase() !== "o(1)"
    );

  // Get the peak memory usage up to this point
  const currentGlobalSpace = executedLines[executedLines.length - 1]?.global_space || "O(1)";

  return (
    <div className="memory-visualizer-container">
      
      {/* Top Dashboard Stats */}
      <div className="memory-summary-dashboard">
        <div className="mem-stat-box">
          <span className="mem-stat-title">Peak Heap Usage</span>
          <span className="mem-stat-value">{formatComplexity(currentGlobalSpace)}</span>
        </div>
        <div className="mem-stat-box">
          <span className="mem-stat-title">Active Allocations</span>
          <span className="mem-stat-value">{allocations.length}</span>
        </div>
      </div>

      {/* Hardware RAM Visualizer */}
      <div className="ram-container">
        <div className="ram-header">
          <span className="ram-title">SYSTEM MEMORY (RAM)</span>
          <span className="ram-slots">SLOT 1</span>
        </div>
        
        <div className="ram-stick">
          {allocations.length === 0 ? (
            <div className="ram-safe-message">
              <span className="safe-icon">✅</span>
              O(1) - No dynamic heap allocations detected.
            </div>
          ) : (
            allocations.map((alloc, index) => {
              const codeStr = alloc.lineOfCode || alloc.code;
              
              // Attempt to guess the variable name being allocated (e.g. 'arr = [0]*n' -> 'arr')
              const varNameMatch = codeStr.match(/^\s*([a-zA-Z0-9_]+)\s*=/);
              const varName = varNameMatch ? varNameMatch[1] : `Alloc #${index + 1}`;

              // Determine block size visually based on complexity
              const comp = alloc.local_space.toLowerCase();
              let sizeClass = 'small';
              if (comp.includes('^2') || comp.includes('²') || comp.includes('2^')) sizeClass = 'huge';
              else if (comp.includes('n') || comp.includes('v')) sizeClass = 'medium';

              return (
                <div key={index} className={`ram-chunk ${sizeClass}`}>
                  <div className="chunk-header">
                    <span className="chunk-name">{varName}</span>
                    <span className="chunk-size">{formatComplexity(alloc.local_space)}</span>
                  </div>
                  <div className="chunk-footer">
                    <span className="chunk-line">Line {alloc.displayLine}</span>
                    <span className="chunk-code">{codeStr}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
    </div>
  );
};

export default MemoryVisualizer;