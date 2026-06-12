// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from "react";
import { FiActivity, FiBookOpen, FiCheckCircle, FiCode, FiCpu, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB } from "../db";
import "../styles/ProfilePage.css";

export default function ProfilePage() {
  const [user, setUser] = useState({ name: "User", email: "", progress: {}, assessments: {} });
  const [metrics, setMetrics] = useState({
    lessonsCompleted: 0,
    totalLessons: 0,
    overallScore: 0,
    assessmentsTaken: 0,
  });
  const [moduleMastery, setModuleMastery] = useState([]);
  const [userRank, setUserRank] = useState("Novice Coder");

  useEffect(() => {
    const loadOfflineData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = JSON.parse(stored || "{}");
        if (!parsed.email) parsed = { name: "User", email: "", progress: {}, assessments: {} };

        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        await progressDB.iterate((value, key) => {
          initialProg[key] = value.score !== undefined ? value.score : value;
        });
        await assessmentsDB.iterate((value, key) => {
          initialAssm[key] = value.data || value;
        });

        setUser({ ...parsed, progress: initialProg, assessments: initialAssm });

        if (navigator.onLine && parsed.email && !parsed.isGuest) {
          try {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers });
            if (progRes.ok) {
              const data = await progRes.json();
              const progData = data.progress || data;
              for (const [key, val] of Object.entries(progData)) {
                initialProg[key] = val;
                await progressDB.setItem(key, { score: val, isSynced: true });
              }
            }

            const assmRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
            if (assmRes.ok) {
              const data = await assmRes.json();
              const assmData = data.assessments || data;
              for (const [key, val] of Object.entries(assmData)) {
                initialAssm[key] = val;
                await assessmentsDB.setItem(key, { ...val, isSynced: true });
              }
            }

            const finalUser = { ...parsed, progress: initialProg, assessments: initialAssm };
            setUser(finalUser);

            if (localStorage.getItem("user")) localStorage.setItem("user", JSON.stringify(finalUser));
            if (sessionStorage.getItem("user")) sessionStorage.setItem("user", JSON.stringify(finalUser));
          } catch (e) {
            console.warn("Could not sync latest progress for profile:", e);
          }
        }
      } catch (e) {
        console.error("Profile data load error:", e);
      }
    };

    loadOfflineData();
  }, []);

  useEffect(() => {
    let tLessons = 0;
    let cLessons = 0;
    let tActivities = 0;
    let scoreSum = 0;

    const masteryData = curriculumIndex.map((module) => {
      const lessonsInModule = module.lessons ? module.lessons.length : 0;
      let completedInModule = 0;
      tLessons += lessonsInModule;

      (module.lessons || []).forEach((lesson) => {
        tActivities += 1;
        const rawScore = user.progress[lesson.lessonId];

        let score = 0;
        let isCompleted = false;

        if (typeof rawScore === 'object' && rawScore !== null) {
          score = rawScore.score !== undefined ? Number(rawScore.score) : 0;
          isCompleted = rawScore.completed || false;
        } else if (rawScore === true) {
          score = 100;
          isCompleted = true;
        } else {
          score = Number(rawScore) || 0;
        }

        // Normalize 5-point scale outputs from ActivityApp to 100%
        if (score > 0 && score <= 5) score = (score / 5) * 100;
        score = Math.min(score, 100);

        if (score >= 20 || isCompleted) { // Minimum threshold mapped to passing
          cLessons += 1;
          completedInModule += 1;
        }

        scoreSum += score;
      });

      return {
        id: module.moduleId,
        title: module.title,
        completed: completedInModule,
        total: lessonsInModule,
        percentage: lessonsInModule > 0 ? Math.round((completedInModule / lessonsInModule) * 100) : 0
      };
    });

    const assessmentsTaken = Object.keys(user.assessments || {}).filter(k => k.includes('_assessment') || k.includes('test')).length;
    const avgScore = tActivities > 0 ? Math.round(scoreSum / tActivities) : 0;

    setMetrics({
      lessonsCompleted: cLessons,
      totalLessons: tLessons,
      totalActivities: tActivities,
      overallScore: avgScore,
      assessmentsTaken: assessmentsTaken
    });

    setModuleMastery(masteryData);

    // Dynamic Rank Evaluation
    const completionRatio = tLessons > 0 ? cLessons / tLessons : 0;
    if (completionRatio === 1 && avgScore > 90) setUserRank("Algorithm Grandmaster");
    else if (completionRatio >= 0.8) setUserRank("Algorithm Scholar");
    else if (completionRatio >= 0.4) setUserRank("Intermediate Architect");
    else if (completionRatio > 0) setUserRank("Syntax Explorer");
    else setUserRank("Novice Coder");

  }, [user]);

  const initials = user.name ? user.name.charAt(0).toUpperCase() : "U";

  return (
    <div className="profile-page-v2">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />

      <div className="profile-container-v2">
        <div className="profile-cover">
          <div className="cover-pattern"></div>
        </div>

        <div className="profile-header-card">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-v2">{initials}</div>
            <div className="avatar-status-badge" title="Online & Ready"></div>
          </div>

          <div className="profile-user-details">
            <div className="user-title-row">
              <h1>{user.name}</h1>
              <span className="role-badge"><FiCpu style={{ marginRight: '6px' }} /> {userRank}</span>
            </div>
            <p className="user-email">{user.email}</p>
          </div>

          <div className="profile-header-actions">
            <Link to="/learning-path" className="btn-resume-learning">
              <FiCode size={18} /> Continue Learning
            </Link>
          </div>
        </div>

        <div className="profile-content-grid">
          <aside className="profile-sidebar">
            <h3 className="sidebar-title">Performance Metrics</h3>

            <div className="stat-box">
              <div className="stat-icon-wrapper blue"><FiBookOpen /></div>
              <div className="stat-info">
                <h4>Lessons Conquered</h4>
                <p><strong>{metrics.lessonsCompleted}</strong> <span className="text-muted">/ {metrics.totalLessons}</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper purple"><FiTrendingUp /></div>
              <div className="stat-info">
                <h4>Accuracy Rate</h4>
                <p><strong>{metrics.overallScore}%</strong> <span className="text-muted">avg score</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper green"><FiActivity /></div>
              <div className="stat-info">
                <h4>Assessments</h4>
                <p><strong>{metrics.assessmentsTaken}</strong> <span className="text-muted">evaluations passed</span></p>
              </div>
            </div>
          </aside>

          <main className="profile-main-content">
            <div className="content-header-row">
              <h2>Curriculum Mastery</h2>
              <span className="mastery-subtitle">Your progress mapped across the learning path</span>
            </div>

            <div className="mastery-list">
              {moduleMastery.map((mod, index) => {
                const isComplete = mod.completed === mod.total && mod.total > 0;

                return (
                  <div key={mod.id} className={`mastery-card ${isComplete ? 'completed' : ''}`}>
                    <div className="mastery-card-left">
                      <div className="mastery-module-number">M{index + 1}</div>
                      <div className="mastery-details">
                        <h4>{mod.title}</h4>
                        <span className="mastery-fraction">{mod.completed} of {mod.total} lessons cleared</span>
                      </div>
                    </div>

                    <div className="mastery-card-right">
                      <div className="progress-bar-container">
                        <div className="progress-bar-track">
                          <div
                            className={`progress-bar-fill ${isComplete ? 'gold' : ''}`}
                            style={{ width: `${mod.percentage}%` }}
                          ></div>
                        </div>
                        <span className="progress-percentage">{mod.percentage}%</span>
                      </div>
                      {isComplete && <FiCheckCircle className="completion-icon" color="#10B981" size={24} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>

        </div>
      </div>
    </div>
  );
}