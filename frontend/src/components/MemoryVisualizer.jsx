// frontend\src\components\MemoryVisualizer.jsx
import '../styles/MemoryVisualizer.css';

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
      (step) => step.local_space && step.local_space !== "O(1)" && step.space_explanation
    );

  // Get the peak memory usage up to this point
  const currentGlobalSpace = executedLines[executedLines.length - 1]?.global_space || "O(1)";

  return (
    <div className="memory-visualizer-container">
      <div className="memory-header">
        <h3>Memory Allocation Map</h3>
        <span className="global-badge">Total Heap: {currentGlobalSpace}</span>
      </div>

      <div className="memory-stack">
        {allocations.length === 0 ? (
          <div className="memory-safe">No major auxiliary memory allocated yet (O(1)).</div>
        ) : (
          allocations.map((alloc, index) => (
            <div key={index} className="memory-block">
              <div className="memory-block-header">
                <span className="line-num">Line {alloc.displayLine}</span>
                <span className="local-badge">{alloc.local_space}</span>
              </div>
              
              <div className="memory-details">
                {/* Updated to use lineOfCode matching the Python backend */}
                <p className="code-snippet"><code>{alloc.lineOfCode || alloc.code}</code></p>
                <p className="explanation">{alloc.space_explanation}</p>
              </div>

              {/* Visual representation of the memory size */}
              <div className="memory-bar-container">
                <div 
                  className={`memory-bar ${alloc.local_space.includes('^2') ? 'quadratic' : 'linear'}`}
                  style={{ 
                    width: alloc.local_space.includes('^2') ? '100%' : 
                           alloc.local_space.includes('n') || alloc.local_space.includes('V') ? '50%' : '10%' 
                  }}
                ></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MemoryVisualizer;