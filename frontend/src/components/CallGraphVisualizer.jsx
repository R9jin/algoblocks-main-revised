import { FaArrowRight, FaCubes, FaProjectDiagram } from 'react-icons/fa';
import '../styles/CallGraphVisualizer.css';

const CallGraphVisualizer = ({ analysisData }) => {
  const callGraph = analysisData?.call_graph || {};
  const nodes = Object.keys(callGraph);

  if (!nodes.length) {
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
          <h3>Call Graph Visualizer</h3>
        </div>
        <div className="nodes-badge">
          <FaCubes />
          <span>{nodes.length} Functions Detected</span>
        </div>
      </div>

      <div className="callgraph-grid">
        {nodes.map((caller) => {
          const callees = callGraph[caller] || [];
          const isMain = caller === "__main__";
          
          return (
            <div key={caller} className={`callgraph-card ${isMain ? 'main-card' : ''}`}>
              <div className="card-top">
                <span className="caller-name">{isMain ? "Main Execution Thread" : `${caller}()`}</span>
                <span className="outbound-count">{callees.length} Outbound Calls</span>
              </div>
              
              <div className="card-body">
                {callees.length === 0 ? (
                  <span className="no-calls">No sub-routines executed.</span>
                ) : (
                  <div className="callees-list">
                    {callees.map((callee, idx) => (
                      <div key={idx} className="callee-item">
                        <FaArrowRight className="callee-arrow" />
                        <span className="callee-name">{callee}()</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CallGraphVisualizer;