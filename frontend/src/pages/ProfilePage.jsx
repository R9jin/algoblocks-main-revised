// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserHeader from '../components/UserHeader';

// Weights perfectly mapped to analyzer.py's internal ranking scale
const COMPLEXITY_WEIGHTS = {
  "O(1)": 1,
  "O(log n)": 2,
  "O(√n)": 3,
  "O(n)": 4,
  "O(V)": 4.2,           
  "O(V + E)": 4.5,
  "O(n log n)": 5,
  "O(n^2)": 6,
  "O(n^2 log n)": 6.5,
  "O(n^3)": 7,
  "O(2^n)": 8,
  "O(n!)": 9,
  "O(n^d)": 9            
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ tsr: 0, aes: 0, rog: 0 });

  useEffect(() => {
    // 1. Verify User Login
    const storedUserStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUserStr) {
      navigate("/signin");
      return;
    }
    const storedUser = JSON.parse(storedUserStr);
    setUser(storedUser);

    // 2. Fetch User Activities from Database
    const fetchActivities = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${API_BASE}/api/get-all-submissions?email=${storedUser.email}`);
        
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.submissions) {
            calculateMetrics(data.submissions);
          }
        }
      } catch (err) {
        console.error("Failed to load profile metrics", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [navigate]);

  const calculateMetrics = (activities) => {
    // Safety check to prevent map/forEach crashes
    if (!activities || !Array.isArray(activities)) return;

    let totalPassed = 0;
    let totalExecuted = 0;
    let totalAes = 0;
    let aesCount = 0;
    let totalRog = 0;
    let rogCount = 0;

    activities.forEach(activity => {
      // 1. Task Success Rate (TSR)
      totalPassed += activity.testCasesPassed || 0;
      totalExecuted += activity.testCasesTotal || 0;

      const target = activity.targetTime || activity.targetComplexity;
      const actual = activity.actualTime || activity.timeComplexity || activity.actualComplexity;
      const initial = activity.initialTime || activity.initialComplexity;
      const final = activity.finalTime || activity.finalComplexity || actual;

      // 2. Algorithmic Efficiency Score (AES)
      if (target && actual) {
        const wTarget = COMPLEXITY_WEIGHTS[target];
        const wActual = COMPLEXITY_WEIGHTS[actual];

        if (wTarget && wActual) {
          const aes = Math.min(100, (wTarget / wActual) * 100); 
          totalAes += aes;
          aesCount++;
        }
      }

      // 3. Refactoring Optimization Gain (ROG)
      if (target && initial && final) {
        const wTarget = COMPLEXITY_WEIGHTS[target];
        const wInitial = COMPLEXITY_WEIGHTS[initial];
        const wFinal = COMPLEXITY_WEIGHTS[final];

        if (wTarget && wInitial && wFinal) {
          const aesInitial = Math.min(100, (wTarget / wInitial) * 100);
          const aesFinal = Math.min(100, (wTarget / wFinal) * 100);
          
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

  if (!user) return null;

  return (
    <div className="landing-container user-homepage">
      <UserHeader user={user} onLogoutClick={() => {
          localStorage.removeItem("user");
          navigate("/signin");
      }} />
      
      <main className="landing-main" style={{ paddingTop: '100px' }}>
        <div className="p-6 max-w-5xl mx-auto bg-white rounded-xl shadow-md mt-10">
          <h1 className="text-3xl font-bold mb-2 text-gray-800">Learner Profile</h1>
          <p className="text-gray-500 mb-8">Track your overall algorithmic mastery and growth.</p>
          
          {loading ? (
             <div className="text-center py-10 text-gray-500">Loading metrics...</div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Task Success Rate (TSR) */}
              <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg flex flex-col justify-between" style={{ minHeight: '160px'}}>
                <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-2">Task Success Rate (TSR)</h2>
                <p className="text-5xl font-extrabold text-blue-900">{metrics.tsr}%</p>
                <p className="text-xs text-blue-600 mt-3 font-medium">Measures logical and functional code correctness across all test cases.</p>
              </div>

              {/* Efficiency Score (AES) */}
              <div className="p-5 bg-green-50 border border-green-200 rounded-lg flex flex-col justify-between" style={{ minHeight: '160px'}}>
                <h2 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">Efficiency Score (AES)</h2>
                <p className="text-5xl font-extrabold text-green-900">{metrics.aes}%</p>
                <p className="text-xs text-green-600 mt-3 font-medium">Measures target bounds vs actual runtime complexity submitted.</p>
              </div>

              {/* Optimization Gain (ROG) */}
              <div className="p-5 bg-purple-50 border border-purple-200 rounded-lg flex flex-col justify-between" style={{ minHeight: '160px'}}>
                <h2 className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-2">Optimization Gain (ROG)</h2>
                <p className="text-5xl font-extrabold text-purple-900">+{metrics.rog}%</p>
                <p className="text-xs text-purple-600 mt-3 font-medium">Measures complexity improvement driven by refactoring and system feedback.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}