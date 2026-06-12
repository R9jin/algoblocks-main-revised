import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiChevronDown, FiClock, FiCpu, FiLock, FiPlay, FiXCircle } from "react-icons/fi";
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
  const [expandedTests, setExpandedTests] = useState({});
  const workerRef = useRef(null);

  useEffect(() => {
    // Initialize the Web Worker
    workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { type, results: workerResults, error: workerError, data } = event.data;
      
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
        const visibleTests = workerResults.filter(r => !r.isHidden);
        const hiddenTests = workerResults.filter(r => r.isHidden);

        const actualTime = analysisData?.total || "O(1)";
        const actualSpace = analysisData?.space_total || "O(1)";

        const actualTimeWeight = getComplexityWeight(actualTime);
        const targetTimeWeight = getComplexityWeight(targetTime);
        const timePassed = actualTimeWeight > 0 && actualTimeWeight <= targetTimeWeight;

        const actualSpaceWeight = getComplexityWeight(actualSpace);
        const targetSpaceWeight = getComplexityWeight(targetSpace);
        const spacePassed = actualSpaceWeight > 0 && actualSpaceWeight <= targetSpaceWeight;

        const compTests = [
          { isComplexityTest: true, isTime: true, title: "Time Complexity Check", expected: `≤ ${targetTime}`, actual: actualTime, passed: timePassed, isHidden: false, call: "Static Code Analysis" },
          { isComplexityTest: true, isTime: false, title: "Space Complexity Check", expected: `≤ ${targetSpace}`, actual: actualSpace, passed: spacePassed, isHidden: false, call: "Static Code Analysis" }
        ];

        // Ensure array conforms to layout: regular, complexity, then hidden tests
        const finalResults = [...visibleTests, ...compTests, ...hiddenTests];

        setResults(finalResults);
        setIsTesting(false);
        // Reset expansions on new test run
        setExpandedTests({});
        
        const passedCount = finalResults.filter(r => r.passed).length;
        if (onTestComplete) {
          onTestComplete(passedCount, finalResults.length);
        }

      } else if (type === "ERROR") {
        setError(workerError);
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

  const toggleTest = (index) => {
    setExpandedTests(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const getTestIcon = (res) => {
    if (res.isHidden) return <FiLock className="tct-icon locked" />;
    if (res.isComplexityTest) {
      return res.isTime ? <FiClock className={`tct-icon ${res.passed ? 'passed' : 'failed'}`} /> 
                        : <FiCpu className={`tct-icon ${res.passed ? 'passed' : 'failed'}`} />;
    }
    return res.passed ? <FiCheckCircle className="tct-icon passed" /> : <FiXCircle className="tct-icon failed" />;
  };

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  return (
    <div className="tct-container">
      <div className="tct-header">
        <div className="tct-header-title">
          <h3>Test Cases</h3>
          {totalCount > 0 && !isTesting && (
            <span className={`tct-counter ${passedCount === totalCount ? 'perfect' : ''}`}>
              {passedCount}/{totalCount} Passed
            </span>
          )}
        </div>
        <button 
          className={`tct-run-btn ${isTesting ? 'running' : ''}`} 
          onClick={handleRunTests} 
          disabled={isTesting || !pythonCode}
        >
          <FiPlay /> {isTesting ? "Evaluating..." : "Run Tests"}
        </button>
      </div>

      {error && (
        <div className="tct-error-banner">
          <strong>Execution Error:</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="tct-results-list">
        {results.length === 0 && !isTesting && !error && (
          <div className="tct-empty-state">
            <FiPlay size={32} className="tct-empty-icon" />
            <p>Click "Run Tests" to evaluate your code against the required conditions.</p>
          </div>
        )}

        {results.map((res, index) => {
          const displayTitle = res.isComplexityTest ? res.title : res.isHidden ? `Hidden Test` : `Test Case ${index + 1}`;
          const isExpanded = expandedTests[index];
          const statusClass = res.passed ? "passed" : "failed";

          return (
            <div key={index} className={`tct-card ${statusClass}`}>
              <div 
                className="tct-card-header" 
                onClick={() => !res.isHidden && toggleTest(index)}
                style={{ cursor: res.isHidden ? "default" : "pointer" }}
              >
                <div className="tct-card-title-group">
                  {getTestIcon(res)}
                  <strong className={`tct-card-title ${statusClass}`}>{displayTitle}</strong>
                </div>
                
                <div className="tct-card-status-group">
                  {res.isHidden && <span className="tct-hidden-badge">Locked</span>}
                  {!res.isHidden && (
                    <FiChevronDown className={`tct-chevron ${isExpanded ? 'open' : ''} ${statusClass}`} />
                  )}
                </div>
              </div>
              
              {isExpanded && !res.isHidden && (
                <div className="tct-card-body">
                  <div className="tct-detail-row">
                    <span className="tct-detail-label">{res.isComplexityTest ? "Metric Constraint:" : "Input:"}</span>
                    <code className="tct-detail-code">{res.call || res.input || "No Input"}</code>
                  </div>
                  <div className="tct-detail-row">
                    <span className="tct-detail-label">{res.isComplexityTest ? "Requirement:" : "Expected Output:"}</span>
                    <code className="tct-detail-code">{res.expected}</code>
                  </div>
                  <div className="tct-detail-row status-row">
                    <span className="tct-detail-label">Result:</span>
                    <span className={`tct-detail-status ${statusClass}`}>
                       {res.passed ? "Passed" : res.error ? "Failed (Execution Error)" : "Failed (Incorrect Output)"}
                    </span>
                  </div>
                  
                  {(!res.passed || res.error) && (
                    <div className="tct-detail-row error-row">
                       <span className="tct-detail-label">{res.isComplexityTest ? "Your Assessment:" : "Your Output:"}</span>
                       <pre className={`tct-error-output ${res.error ? "has-error" : ""}`}>
                         {res.error ? res.error : (res.actual !== undefined ? res.actual : "No Output")}
                       </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}