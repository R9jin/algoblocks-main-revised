import { useEffect, useState } from "react";
import DashboardHeader from "../components/DashboardHeader";
import { submissionsDB } from "../db";
import "../styles/Dashboard.css"; // Reusing existing dashboard styles for layout

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [metrics, setMetrics] = useState({
    tsr: 0,
    aes: 0,
    rog: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    const calculateMetrics = async () => {
      try {
        let totalPassed = 0;
        let totalTests = 0;
        
        let aesSum = 0;
        let aesCount = 0;

        const optimizationData = {};

        // Helper to map Big-O notation to weights
        const getComplexityWeight = (complexity) => {
          const weights = {
            "O(1)": 1,
            "O(log n)": 2,
            "O(n)": 4, 
            "O(n log n)": 5,
            "O(n^2)": 6,
            "O(n^3)": 7,
            "O(2^n)": 8,
            "O(n!)": 9,
          };
          // Strip whitespace/formatting to match
          const cleanComp = complexity?.replace(/\s+/g, ' ').trim() || "O(n^2)";
          return weights[cleanComp] || 10; 
        };

        await submissionsDB.iterate((submission) => {
          const { 
            type, // "activity" or "optimization"
            activityId, 
            passed_tests = 0, 
            total_tests = 0, 
            target_complexity, 
            actual_complexity,
            timestamp = Date.now()
          } = submission;

          // 1. Task Success Rate (TSR) - All Activities
          totalPassed += passed_tests;
          totalTests += total_tests;

          // Calculate submission AES
          let currentAes = 0;
          if (target_complexity && actual_complexity) {
            const wTarget = getComplexityWeight(target_complexity);
            const wActual = getComplexityWeight(actual_complexity);
            currentAes = (wTarget / wActual) * 100;
          }

          // 2. Algorithmic Efficiency Score (AES) - Standard Activities
          if (type === "activity" && currentAes > 0) {
            aesSum += currentAes;
            aesCount += 1;
          }

          // 3. Refactoring Optimization Gain (ROG) - Optimization Activities
          if (type === "optimization" && currentAes > 0) {
            if (!optimizationData[activityId]) {
              optimizationData[activityId] = [];
            }
            optimizationData[activityId].push({ aes: currentAes, timestamp });
          }
        });

        // Finalize TSR
        const finalTsr = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

        // Finalize AES
        const finalAes = aesCount > 0 ? (aesSum / aesCount) : 0;

        // Finalize ROG
        let rogSum = 0;
        let rogCount = 0;

        Object.values(optimizationData).forEach((attempts) => {
          if (attempts.length >= 2) {
            // Sort chronologically
            attempts.sort((a, b) => a.timestamp - b.timestamp);
            const initialAes = attempts[0].aes;
            // Get the best AES achieved after the initial submission
            const maxFinalAes = Math.max(...attempts.slice(1).map(a => a.aes));
            
            rogSum += (maxFinalAes - initialAes);
            rogCount += 1;
          }
        });

        const finalRog = rogCount > 0 ? (rogSum / rogCount) : 0;

        setMetrics({
          tsr: finalTsr.toFixed(2),
          aes: finalAes.toFixed(2),
          rog: finalRog.toFixed(2),
        });

      } catch (error) {
        console.error("Error calculating profile metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    calculateMetrics();
  }, []);

  return (
    <div className="dashboard-layout">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />
      
      <main className="dashboard-main" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '30px' }}>
          <h1>My Profile</h1>
          <p style={{ color: '#5b5675', fontSize: '1.1rem' }}>
            {user?.name || "Student"} | {user?.email || ""}
          </p>
        </div>

        {loading ? (
          <p>Loading performance metrics...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* Task Success Rate Card */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <h3 style={{ color: '#2c264a', marginBottom: '10px' }}>Task Success Rate (TSR)</h3>
              <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4CAF50', margin: '10px 0' }}>
                {metrics.tsr}%
              </p>
              <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: '1.4' }}>
                Measures the functional correctness of your algorithms based on test case execution across all activities.
              </p>
            </div>

            {/* Algorithmic Efficiency Score Card */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <h3 style={{ color: '#2c264a', marginBottom: '10px' }}>Algorithmic Efficiency (AES)</h3>
              <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#2196F3', margin: '10px 0' }}>
                {metrics.aes}%
              </p>
              <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: '1.4' }}>
                Evaluates your structural optimization by comparing your generated AST complexity against the optimal target.
              </p>
            </div>

            {/* Refactoring Optimization Gain Card */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <h3 style={{ color: '#2c264a', marginBottom: '10px' }}>Optimization Gain (ROG)</h3>
              <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#FF9800', margin: '10px 0' }}>
                +{metrics.rog}%
              </p>
              <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: '1.4' }}>
                Captures the behavioral improvement and efficiency gained from refactoring algorithms in optimization activities.
              </p>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}