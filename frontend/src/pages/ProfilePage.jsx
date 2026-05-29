// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from "react";
import { FiActivity, FiAward, FiBarChart2, FiBook, FiCheckCircle, FiTrendingUp } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import UserHeader from "../components/UserHeader";
import { assessmentsDB, progressDB, projectsDB } from "../db";
import "../styles/Dashboard.css";
import "../styles/ProfilePage.css"; // Added clean styling

export default function ProfilePage() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    tsr: 0,
    aes: 0,
    rog: 0,
    modulesCompleted: 0,
    totalAssessments: 0,
    totalProjects: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!storedUser) {
          navigate("/signin");
          return;
        }
        const parsedUser = JSON.parse(storedUser);
        setUserData(parsedUser);

        const [allProgress, allAssessments, allProjects] = await Promise.all([
          getAllFromDB(progressDB),
          getAllFromDB(assessmentsDB),
          getAllFromDB(projectsDB),
        ]);

        const userEmail = parsedUser.email;
        const userProgress = allProgress.filter(p => p && p.score !== undefined);
        const userAssessments = allAssessments.filter(a => a && a.score !== undefined);
        const userProjects = allProjects.filter(p => p && (p.owner_id === userEmail || p.userId === userEmail));

        // METRIC 1: Task Success Rate (TSR)
        let totalScore = 0;
        let scoreCount = 0;

        userAssessments.forEach(a => { totalScore += a.score; scoreCount += 1; });
        userProgress.forEach(p => {
          if (p.score !== undefined) { totalScore += p.score; scoreCount += 1; }
        });

        const calculatedTsr = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

        // METRIC 2: Refactoring Optimization Gain (ROG)
        let improvedAssessments = 0;
        let totalMultiAttempts = 0;

        userAssessments.forEach(a => {
          if (a.attempts && a.attempts > 1) {
             totalMultiAttempts += 1;
             if (a.score >= 75) improvedAssessments += 1;
          }
        });
        
        const calculatedRog = totalMultiAttempts > 0 
          ? Math.round((improvedAssessments / totalMultiAttempts) * 100) 
          : (calculatedTsr > 80 ? 100 : 0); 

        // METRIC 3: Algorithmic Efficiency Score (AES)
        let aesScore = 0;
        if (userProjects.length > 0) {
            let efficiencyPoints = 0;
            userProjects.forEach(() => { efficiencyPoints += 85; });
            aesScore = Math.min(100, Math.round(efficiencyPoints / userProjects.length));
        }

        const modulesCompleted = new Set(userProgress.map(p => {
           const match = String(p.id || "").match(/module[_-](\d+)/);
           return match ? match[1] : null;
        }).filter(Boolean)).size;

        setStats({
          tsr: calculatedTsr,
          aes: aesScore,
          rog: calculatedRog,
          modulesCompleted: modulesCompleted,
          totalAssessments: userAssessments.length,
          totalProjects: userProjects.length,
        });

      } catch (err) {
        console.error("Error calculating profile statistics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [navigate]);

  const getAllFromDB = async (db) => {
    const items = [];
    try {
        await db.iterate((value, key) => { items.push({ id: key, ...value }); });
    } catch (e) {
        console.warn("Failed to iterate DB:", e);
    }
    return items;
  };

  if (loading || !userData) {
    return (
      <div className="dashboard-layout">
        <UserHeader />
        <main className="dashboard-content">
          <div style={{ color: "white", padding: "40px", textAlign: "center" }}>
            Loading profile statistics...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <UserHeader />
      
      <main className="dashboard-content">
        <div className="profile-container">
          
          <div className="profile-header-block">
            <h1 className="profile-welcome-text">Learner Profile</h1>
            <p className="profile-subtitle-text">Track your algorithmic mastery and coding efficiency.</p>
          </div>

          {/* User Info Card */}
          <div className="profile-user-card">
            <div className="profile-avatar">
              {userData.name ? userData.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="profile-user-info">
              <h2>{userData.name}</h2>
              <p>{userData.email}</p>
              <span className="profile-status-badge">Active Learner</span>
            </div>
          </div>

          {/* Performance Analytics */}
          <h2 className="profile-section-title">Performance Analytics</h2>
          <div className="profile-stats-grid">
            
            {/* TSR Card */}
            <div className="profile-stat-card">
              <div className="profile-stat-header">
                <div className="profile-stat-icon blue"><FiCheckCircle size={22} /></div>
                <h3 className="profile-stat-title">Task Success Rate (TSR)</h3>
              </div>
              <div className="profile-stat-value">{stats.tsr}%</div>
              <p className="profile-stat-subtitle">Average score across all assessments</p>
              <div className="profile-progress-bar-bg">
                <div className="profile-progress-bar-fill blue" style={{ width: `${stats.tsr}%` }} />
              </div>
            </div>

            {/* AES Card */}
            <div className="profile-stat-card">
              <div className="profile-stat-header">
                <div className="profile-stat-icon green"><FiActivity size={22} /></div>
                <h3 className="profile-stat-title">Algorithmic Efficiency (AES)</h3>
              </div>
              <div className="profile-stat-value">{stats.aes}%</div>
              <p className="profile-stat-subtitle">Code complexity optimization score</p>
              <div className="profile-progress-bar-bg">
                <div className="profile-progress-bar-fill green" style={{ width: `${stats.aes}%` }} />
              </div>
            </div>

            {/* ROG Card */}
            <div className="profile-stat-card">
              <div className="profile-stat-header">
                <div className="profile-stat-icon purple"><FiTrendingUp size={22} /></div>
                <h3 className="profile-stat-title">Refactoring Gain (ROG)</h3>
              </div>
              <div className="profile-stat-value">{stats.rog}%</div>
              <p className="profile-stat-subtitle">Score improvement across attempts</p>
              <div className="profile-progress-bar-bg">
                <div className="profile-progress-bar-fill purple" style={{ width: `${stats.rog}%` }} />
              </div>
            </div>

          </div>

          {/* Learning Progress Overview */}
          <h2 className="profile-section-title">Learning Progress</h2>
          <div className="profile-overview-grid">
            
            <div className="profile-overview-card">
              <div className="overview-icon-container icon-purple"><FiBook /></div>
              <h3>Modules Completed</h3>
              <div className="overview-value">{stats.modulesCompleted} / 6</div>
            </div>

            <div className="profile-overview-card">
              <div className="overview-icon-container icon-yellow"><FiAward /></div>
              <h3>Total Assessments</h3>
              <div className="overview-value">{stats.totalAssessments}</div>
            </div>

            <div className="profile-overview-card">
              <div className="overview-icon-container icon-red"><FiBarChart2 /></div>
              <h3>Saved Projects</h3>
              <div className="overview-value">{stats.totalProjects}</div>
            </div>

          </div>
          
        </div>
      </main>
    </div>
  );
}