import { useEffect, useState } from 'react';

// Weights perfectly mapped to analyzer.py's internal ranking scale
const COMPLEXITY_WEIGHTS = {
  "O(1)": 1,
  "O(log n)": 2,
  "O(√n)": 3,
  "O(n)": 4,
  "O(V)": 4.2,           // Specific to Space Complexity tracking in graphs
  "O(V + E)": 4.5,
  "O(n log n)": 5,
  "O(n^2)": 6,
  "O(n^2 log n)": 6.5,
  "O(n^3)": 7,
  "O(2^n)": 8,
  "O(n!)": 9,
  "O(n^d)": 9            // Analyzer's generic polynomial fallback
};

const ProfilePage = ({ userData, userActivities }) => {
  const [metrics, setMetrics] = useState({
    tsr: 0,
    aes: 0,
    rog: 0
  });

  useEffect(() => {
    if (userActivities && userActivities.length > 0) {
      calculateMetrics(userActivities);
    }
  }, [userActivities]);

  const calculateMetrics = (activities) => {
    let totalPassed = 0;
    let totalExecuted = 0;
    
    let totalAes = 0;
    let aesCount = 0;

    let totalRog = 0;
    let rogCount = 0;

    activities.forEach(activity => {
      // 1. Calculate Task Success Rate (TSR)
      const passed = activity.testCasesPassed || 0;
      const total = activity.testCasesTotal || 0;
      totalPassed += passed;
      totalExecuted += total;

      // Extract Complexity Data (Supports fallback keys depending on DB schema)
      const target = activity.targetTime || activity.targetComplexity;
      const actual = activity.actualTime || activity.timeComplexity || activity.actualComplexity;
      
      // ROG Tracking (Tracking their first attempt vs their final optimized attempt)
      const initial = activity.initialTime || activity.initialComplexity;
      const final = activity.finalTime || activity.finalComplexity || actual;

      // 2. Calculate AST-Derived Algorithmic Efficiency Score (AES)
      if (target && actual) {
        const wTarget = COMPLEXITY_WEIGHTS[target];
        const wActual = COMPLEXITY_WEIGHTS[actual];

        if (wTarget && wActual) {
          // Cap at 100% to prevent inflation if a user writes an O(1) solution for an O(n) task
          const aes = Math.min(100, (wTarget / wActual) * 100); 
          totalAes += aes;
          aesCount++;
        }
      }

      // 3. Calculate Refactoring Optimization Gain (ROG)
      if (target && initial && final) {
        const wTarget = COMPLEXITY_WEIGHTS[target];
        const wInitial = COMPLEXITY_WEIGHTS[initial];
        const wFinal = COMPLEXITY_WEIGHTS[final];

        if (wTarget && wInitial && wFinal) {
          const aesInitial = Math.min(100, (wTarget / wInitial) * 100);
          const aesFinal = Math.min(100, (wTarget / wFinal) * 100);
          
          // Only calculate gain if the student actually refactored their code (Initial vs Final diff)
          if (wInitial !== wFinal) {
            const rog = aesFinal - aesInitial; 
            totalRog += rog;
            rogCount++;
          }
        }
      }
    });

    setMetrics({
      tsr: totalExecuted > 0 ? ((totalPassed / totalExecuted) * 100).toFixed(1) : 0,
      aes: aesCount > 0 ? (totalAes / aesCount).toFixed(1) : 0,
      rog: rogCount > 0 ? (totalRog / rogCount).toFixed(1) : 0,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md mt-10">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Learner Profile & Metrics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Task Success Rate (TSR) Metric */}
        <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg flex flex-col justify-between">
          <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-2">Task Success Rate (TSR)</h2>
          <p className="text-4xl font-extrabold text-blue-900">{metrics.tsr}%</p>
          <p className="text-xs text-blue-600 mt-3 font-medium">Measures logical and functional code correctness across all test cases.</p>
        </div>

        {/* Algorithmic Efficiency Score (AES) Metric */}
        <div className="p-5 bg-green-50 border border-green-200 rounded-lg flex flex-col justify-between">
          <h2 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">Efficiency Score (AES)</h2>
          <p className="text-4xl font-extrabold text-green-900">{metrics.aes}%</p>
          <p className="text-xs text-green-600 mt-3 font-medium">Measures target bounds vs actual runtime complexity.</p>
        </div>

        {/* Refactoring Optimization Gain (ROG) Metric */}
        <div className="p-5 bg-purple-50 border border-purple-200 rounded-lg flex flex-col justify-between">
          <h2 className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-2">Optimization Gain (ROG)</h2>
          <p className="text-4xl font-extrabold text-purple-900">+{metrics.rog}%</p>
          <p className="text-xs text-purple-600 mt-3 font-medium">Measures complexity improvement driven by system feedback.</p>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;