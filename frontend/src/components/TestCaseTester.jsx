import { useEffect, useRef, useState } from "react";
import "../styles/TestCaseTester.css";

export default function TestCaseTester({ pythonCode, testCases, onTestComplete }) {
  const [results, setResults] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState(null);
  const workerRef = useRef(null);

  useEffect(() => {
    // Initialize the Web Worker
    workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { type, results, error } = event.data;
      
      if (type === "TEST_RESULTS") {
        setResults(results);
        setIsTesting(false);
        
        // Count passed tests for progress saving
        const passedCount = results.filter(r => r.passed).length;
        if (onTestComplete) {
          onTestComplete(passedCount, results.length);
        }
      } else if (type === "ERROR") {
        setError(error);
        setIsTesting(false);
      }
    };

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [onTestComplete]);

  const handleRunTests = () => {
    if (!pythonCode || !testCases || testCases.length === 0) return;
    
    setIsTesting(true);
    setError(null);
    setResults([]);

    // Format the test cases ensuring the web worker knows it's a function call context
    const formattedTestCases = testCases.map(tc => ({
      ...tc,
      input: tc.call || tc.input,
      call: tc.call || tc.input 
    }));

    // Send code and CodeChum formatted test cases to the worker
    workerRef.current.postMessage({
      type: "RUN_TESTS", // Dispatch command
      code: pythonCode,
      testCases: formattedTestCases
    });
  };

  return (
    <div className="test-case-tester">
      <div className="tester-header">
        <h3>Test Cases</h3>
        <button 
          className="run-tests-btn" 
          onClick={handleRunTests} 
          disabled={isTesting || !pythonCode}
        >
          {isTesting ? "Evaluating..." : "Run Tests"}
        </button>
      </div>

      {error && <div className="tester-error">Execution Error: {error}</div>}

      <div className="results-container">
        {results.map((res, index) => (
          <div key={index} className={`test-result-card ${res.passed ? "passed" : "failed"}`}>
            <div className="test-card-header">
              <h4>Test Case {index + 1} {res.isHidden ? "(Hidden)" : ""}</h4>
              <span className={`status-badge ${res.passed ? "passed" : "failed"}`}>
                {res.passed ? "Passed" : "Failed"}
              </span>
            </div>
            
            {/* Show details only if it's not a hidden test case */}
            {!res.isHidden && (
              <div className="test-details">
                <div className="detail-row">
                  <strong>Function Call / Input:</strong>
                  <pre>{res.call || res.input || "No Input"}</pre>
                </div>
                <div className="detail-row">
                  <strong>Expected Output:</strong>
                  <pre>{res.expected}</pre>
                </div>
                <div className="detail-row">
                  <strong>Your Output:</strong>
                  <pre className={res.error ? "error-text" : ""}>
                    {res.error ? res.error : (res.actual !== undefined ? res.actual : "No Output")}
                  </pre>
                </div>
              </div>
            )}
            
            {res.isHidden && !res.passed && (
              <div className="test-details">
                <p className="hidden-fail-msg">Your code failed on a hidden test case. Re-check your algorithm constraints and edge cases.</p>
              </div>
            )}
          </div>
        ))}
        
        {results.length === 0 && !isTesting && (
          <div className="no-results-msg">
            <p>Click "Run Tests" to evaluate your code against the required conditions.</p>
          </div>
        )}
      </div>
    </div>
  );
}