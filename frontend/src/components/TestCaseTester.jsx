import '../styles/TestCaseTester.css'; // Make sure this exists or inline styles are used

const TestCaseTester = ({ results, isRunning }) => {
  if (isRunning) {
    return (
      <div className="tester-container loader-mode">
        <div className="spinner"></div>
        <p>Running Code & Analyzing AST for Complexity...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="tester-container empty-mode">
        <p>Run your code to see the test case results.</p>
        <div className="test-skeleton">
           <div className="skeleton-box"></div>
           <div className="skeleton-box"></div>
           <div className="skeleton-box"></div>
        </div>
      </div>
    );
  }

  const renderStatus = (passed) => (
    passed 
      ? <span className="status-badge pass">✅ Passed</span> 
      : <span className="status-badge fail">❌ Failed</span>
  );

  return (
    <div className="tester-container">
      <h3>Test Results</h3>

      {/* SECTION 1: Regular Test Cases (Up to 3) */}
      <div className="test-section">
        <h4 className="section-title">Standard Tests (3)</h4>
        {results.regular && results.regular.length > 0 ? (
          <div className="test-grid">
            {results.regular.map((test, index) => (
              <div key={index} className={`test-card ${test.passed ? 'passed' : 'failed'}`}>
                <div className="test-header">
                  <strong>Test Case {index + 1}</strong>
                  {renderStatus(test.passed)}
                </div>
                <div className="test-details">
                  <div className="detail-row">
                    <span>Input:</span> <code>{test.input}</code>
                  </div>
                  <div className="detail-row">
                    <span>Expected:</span> <code>{test.expected}</code>
                  </div>
                  <div className="detail-row actual">
                    <span>Actual:</span> <code>{test.actual}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="no-data">No standard tests found.</p>}
      </div>

      {/* SECTION 2: Target Complexity Test Cases (2) */}
      <div className="test-section">
        <h4 className="section-title">Algorithm Efficiency (Target vs Actual)</h4>
        {results.complexity && results.complexity.length > 0 ? (
          <div className="test-grid complexity-grid">
            {results.complexity.map((comp, index) => (
              <div key={index} className={`test-card complexity-card ${comp.passed ? 'passed' : 'failed'}`}>
                <div className="test-header">
                  <strong>{comp.metric}</strong>
                  {renderStatus(comp.passed)}
                </div>
                <div className="test-details">
                  <div className="detail-row">
                    <span>Target Max:</span> <code className="target-badge">{comp.target}</code>
                  </div>
                  <div className="detail-row actual">
                    <span>Analyzed:</span> <code className={comp.passed ? "pass-text" : "fail-text"}>{comp.actual}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="no-data">No complexity targets defined for this activity.</p>}
      </div>

      {/* SECTION 3: Hidden Test Cases (2) */}
      <div className="test-section">
        <h4 className="section-title">Hidden Tests (2)</h4>
        <p className="hidden-desc">Inputs and expected outputs are hidden to prevent hardcoding.</p>
        {results.hidden && results.hidden.length > 0 ? (
          <div className="test-grid hidden-grid">
            {results.hidden.map((test, index) => (
              <div key={index} className={`test-card hidden-card ${test.passed ? 'passed' : 'failed'}`}>
                <div className="test-header">
                  <strong>🔒 Hidden Test {index + 1}</strong>
                  {renderStatus(test.passed)}
                </div>
                {/* Do not show expected/actual/input for hidden cases */}
                {!test.passed && (
                   <div className="test-details error-details">
                     <span className="fail-text">Your code failed on a hidden edge case. Try reviewing your logic.</span>
                   </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="no-data">No hidden tests found.</p>}
      </div>

    </div>
  );
};

export default TestCaseTester;