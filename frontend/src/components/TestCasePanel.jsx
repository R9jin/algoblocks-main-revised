// frontend/src/components/TestCasePanel.jsx
import { useState } from 'react';

export default function TestCasePanel({ testCases, consoleOutput, passedTests, totalTests }) {
  const [expandedTests, setExpandedTests] = useState({ 0: true });

  const toggleTest = (index) => {
    setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <aside className="activity-right-panel">
      <div className="activity-panel-header">
        <h3>Test Cases</h3>
        <span className="test-cases-counter">{passedTests}/{totalTests} passed</span>
      </div>

      <div className="activity-panel-content">
        {testCases?.map((tc, i) => {
          const testIdentifier = `Test ${i + 1}`;
          
          // Parse the live console output to determine the visual UI status
          const isPassing = consoleOutput.includes(`${testIdentifier}: PASSED`);
          const isFailing = consoleOutput.includes(`${testIdentifier}: FAILED`);
          const isError = consoleOutput.includes(`${testIdentifier}: ERROR`);

          const isExpanded = expandedTests[i];
          const statusClass = isPassing ? 'passing' : (isFailing || isError) ? 'failing' : '';

          return (
            <div key={i} className={`test-case-card ${statusClass}`}>
              <div className="test-case-header" onClick={() => toggleTest(i)}>
                <div className="test-case-header-left">
                  <div className={`test-case-indicator ${statusClass}`}></div>
                  <strong className="test-case-title">Test {i + 1}</strong>
                </div>
                <span className={`test-case-chevron ${isExpanded ? 'open' : ''}`}>❯</span>
              </div>

              {isExpanded && (
                <div className="test-case-details">
                  <div className="test-case-row">
                    <span className="test-case-label">Input:</span>
                    <code className="test-case-code">{tc.call || "(None)"}</code>
                  </div>
                  <div className="test-case-row">
                    <span className="test-case-label">Expected Output:</span>
                    <code className="test-case-code">{tc.expected}</code>
                  </div>

                  {(isPassing || isFailing || isError) && (
                    <div className="test-case-status-row">
                      <span className="test-case-label">Result:</span>
                      <span style={{ fontWeight: 'bold', color: isPassing ? '#27AE60' : '#e74c3c' }}>
                        {isPassing ? 'Passed' : isFailing ? 'Failed (Incorrect Output)' : 'Failed (Execution Error)'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}