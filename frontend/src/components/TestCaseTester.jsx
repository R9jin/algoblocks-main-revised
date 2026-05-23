import { useEffect, useRef, useState } from "react";
import "../styles/TestCaseTester.css";

// Helper copied from original formatters/utils logic to accurately grade complexity tests
const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, "");
  if (comp.includes("n!") || comp.includes("n*t(n-1)")) return 9;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("t(n-1)+t(n-2)")) return 8;
  if (comp.includes("n^3") || comp.includes("n³")) return 7;
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("t(n-1)+o(n)")) return 6;
  if (comp.includes("nlogn") || comp.includes("2t(n/2)+o(n)") || comp.includes("t(n-1)+o(logn)")) return 5;
  if (comp.includes("v+e")) return 4.5;
  if (comp.includes("o(n)") || comp.includes("o(m)") || comp.includes("2t(n/2)+o(1)") || comp.includes("t(n/2)+o(n)") || comp.includes("t(n-1)+o(1)")) return 4;
  if (comp.includes("√n") || comp.includes("sqrt")) return 3;
  if (comp.includes("logn") || comp.includes("log") || comp.includes("t(n/2)+o(1)")) return 2;
  if (comp.includes("o(1)")) return 1;
  return 0;
};

export default function TestCaseTester({ pythonCode, testCases, targetTime = "O(n)", targetSpace = "O(n)", onTestComplete }) {
  const [results, setResults] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const workerRef = useRef(null);

  useEffect(() => {
    // Initialize the Web Worker
    workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { type, results, error, data } = event.data;
      
      if (type === "ANALYZE_RESULT") {
        setAnalysisData(data);
        const formattedTestCases = testCases.map(tc => ({
          ...tc,
          input: tc.call || tc.input,
          call: tc.call || tc.input 
        }));
        
        // After analysis is complete, trigger the actual run tests
        workerRef.current.postMessage({
          type: "RUN_TESTS", 
          code: pythonCode,
          testCases: formattedTestCases
        });
      } else if (type === "TEST_RESULTS") {
        
        // Segregate original tests to inject the complexity checks inside
        const visibleTests = results.filter(r => !r.isHidden);
        const hiddenTests = results.filter(r => r.isHidden);

        const actualTime = analysisData?.total || "O(1)";
        const actualSpace = analysisData?.space_total || "O(1)";

        const actualTimeWeight = getComplexityWeight(actualTime);
        const targetTimeWeight = getComplexityWeight(targetTime);
        const timePassed = actualTimeWeight > 0 && actualTimeWeight <= targetTimeWeight;

        const actualSpaceWeight = getComplexityWeight(actualSpace);
        const targetSpaceWeight = getComplexityWeight(targetSpace);
        const spacePassed = actualSpaceWeight > 0 && actualSpaceWeight <= targetSpaceWeight;

        const compTests = [
          { isComplexityTest: true, title: "Time Complexity Check", expected: `≤ ${targetTime}`, actual: actualTime, passed: timePassed, isHidden: false, call: "Static Code Analysis" },
          { isComplexityTest: true, title: "Space Complexity Check", expected: `≤ ${targetSpace}`, actual: actualSpace, passed: spacePassed, isHidden: false, call: "Static Code Analysis" }
        ];

        // Ensure array conforms to layout: 3 regular, 2 complexity, 2 hidden tests
        const finalResults = [...visibleTests, ...compTests, ...hiddenTests];

        setResults(finalResults);
        setIsTesting(false);
        
        const passedCount = finalResults.filter(r => r.passed).length;
        if (onTestComplete) {
          onTestComplete(passedCount, finalResults.length);
        }

      } else if (type === "ERROR") {
        setError(error);
        setIsTesting(false);
      }
    };

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [onTestComplete, pythonCode, testCases, targetTime, targetSpace, analysisData]);

  const handleRunTests = () => {
    if (!pythonCode || !testCases || testCases.length === 0) return;
    
    setIsTesting(true);
    setError(null);
    setResults([]);

    // Chain starts with analysis (to get accurate BigO targets) then flows automatically to Run Tests inside the message handler
    workerRef.current.postMessage({
      type: "ANALYZE_CODE",
      code: pythonCode
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
        {results.map((res, index) => {
          const displayTitle = res.isComplexityTest ? res.title : res.isHidden ? `Hidden Test` : `Test Case ${index + 1}`;

          return (
            <div key={index} className={`test-result-card ${res.passed ? "passed" : "failed"}`}>
              <div className="test-card-header">
                <h4>{displayTitle}</h4>
                <span className={`status-badge ${res.passed ? "passed" : "failed"}`}>
                  {res.passed ? "Passed" : "Failed"}
                </span>
              </div>
              
              {!res.isHidden && (
                <div className="test-details">
                  <div className="detail-row">
                    <strong>{res.isComplexityTest ? "Metric Check:" : "Function Call / Input:"}</strong>
                    <pre>{res.call || res.input || "No Input"}</pre>
                  </div>
                  <div className="detail-row">
                    <strong>{res.isComplexityTest ? "Requirement:" : "Expected Output:"}</strong>
                    <pre>{res.expected}</pre>
                  </div>
                  <div className="detail-row">
                    <strong>{res.isComplexityTest ? "Your Assessment:" : "Your Output:"}</strong>
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
          );
        })}
        
        {results.length === 0 && !isTesting && (
          <div className="no-results-msg">
            <p>Click "Run Tests" to evaluate your code against the required conditions.</p>
          </div>
        )}
      </div>
    </div>
  );
}