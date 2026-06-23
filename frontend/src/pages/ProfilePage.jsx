// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from "react";
import { FiActivity, FiBookOpen, FiCheckCircle, FiChevronDown, FiCode, FiCpu, FiInfo, FiTarget, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB, submissionsDB } from "../db";
import "../styles/ProfilePage.css";

export default function ProfilePage() {
  const [user, setUser] = useState({ name: "User", email: "", progress: {}, assessments: {} });
  const [metrics, setMetrics] = useState({
    lessonsCompleted: 0,
    totalLessons: 0,
    overallAes: 0,
    overallRog: 0,
    assessmentsTaken: 0,
  });
  const [moduleMastery, setModuleMastery] = useState([]);
  const [expandedModules, setExpandedModules] = useState({});
  const [userRank, setUserRank] = useState("Novice Coder");
  const [loading, setLoading] = useState(true);

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = JSON.parse(stored || "{}");
        if (!parsed.email) parsed = { name: "User", email: "", progress: {}, assessments: {} };

        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        // 1. Sync Base Progress and Assessments
        await progressDB.iterate((value, key) => { initialProg[key] = value.score !== undefined ? value.score : value; });
        await assessmentsDB.iterate((value, key) => { initialAssm[key] = value.data || value; });

        if (navigator.onLine && parsed.email && !parsed.isGuest) {
          try {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers });
            if (progRes.ok) {
              const data = await progRes.json();
              for (const [key, val] of Object.entries(data.progress || data)) {
                initialProg[key] = val; await progressDB.setItem(key, { score: val, isSynced: true });
              }
            }

            const assmRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
            if (assmRes.ok) {
              const data = await assmRes.json();
              for (const [key, val] of Object.entries(data.assessments || data)) {
                initialAssm[key] = val; await assessmentsDB.setItem(key, { ...val, isSynced: true });
              }
            }
          } catch (e) { console.warn("Cloud sync warning:", e); }
        }

        const finalUser = { ...parsed, progress: initialProg, assessments: initialAssm };
        setUser(finalUser);

        // 2. Fetch all local submissions to extract AES and ROG
        const userSubs = {};
        await submissionsDB.iterate((val) => {
          if (val.userId === finalUser.email) {
            if (!userSubs[val.moduleId]) userSubs[val.moduleId] = {};
            userSubs[val.moduleId][val.activityId] = val;
          }
        });

        // 3. Fetch all JSON activity definitions to build the dynamic hierarchy
        const allActivities = {};
        for (let i = 0; i <= 6; i++) {
          try {
            const res = await fetch(`/data/activities/module_${i}.json`);
            if (res.ok) allActivities[`module-${i}`] = await res.json();
          } catch (e) { console.warn(`Could not load module_${i}.json`); }
        }

        // 4. Build the Curriculum Mastery Tree
        let tLessons = 0, cLessons = 0;
        let globalAesSum = 0, globalAesCount = 0;
        let globalRogSum = 0, globalRogCount = 0;

        const masteryData = curriculumIndex.map((mod) => {
          const modActs = allActivities[mod.moduleId] || {};
          let modCompletedLessons = 0;
          let modAesSum = 0, modAesCount = 0;
          let modRogSum = 0, modRogCount = 0;

          tLessons += mod.lessons.length;

          const mappedLessons = mod.lessons.map((lesson) => {
            const lessonKeyJson = lesson.lessonId.replace(/-/g, '_'); // e.g., lesson-0-1 -> lesson_0_1
            const acts = modActs[lessonKeyJson] || [];

            let lessonCompletedActs = 0;

            const mappedActs = acts.map((act) => {
              const sub = userSubs[mod.moduleId]?.[act.id];
              let aes = 0; let rog = 0; let isCompleted = false;

              if (sub) {
                // Support both AES mathematical model and legacy 5-point fallbacks
                aes = sub.final_aes !== null && sub.final_aes !== undefined ? sub.final_aes : sub.score || 0;
                if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100; 
                aes = Math.min(aes, 100);

                rog = sub.rog || 0;
                isCompleted = aes >= 50 || sub.status === "passed";

                if (isCompleted) lessonCompletedActs++;
                
                modAesSum += aes; modAesCount++; globalAesSum += aes; globalAesCount++;
                if (rog > 0) { modRogSum += rog; modRogCount++; globalRogSum += rog; globalRogCount++; }
              }

              return { ...act, aes, rog, isCompleted };
            });

            // Lesson is complete if all contained activities are complete, or if progress dict has passing score
            let isLessonCompleted = false;
            if (acts.length > 0 && lessonCompletedActs === acts.length) isLessonCompleted = true;
            else if (finalUser.progress[lesson.lessonId] >= 50 || finalUser.progress[lesson.lessonId] === true) isLessonCompleted = true;

            if (isLessonCompleted) {
              modCompletedLessons++;
              cLessons++;
            }

            return { ...lesson, activities: mappedActs, isCompleted: isLessonCompleted };
          });

          return {
            ...mod,
            lessons: mappedLessons,
            completed: modCompletedLessons,
            total: mod.lessons.length,
            percentage: mod.lessons.length > 0 ? Math.round((modCompletedLessons / mod.lessons.length) * 100) : 0,
            avgAes: modAesCount > 0 ? Math.round(modAesSum / modAesCount) : 0,
            avgRog: modRogCount > 0 ? Math.round(modRogSum / modRogCount) : 0
          };
        });

        const assessmentsTaken = Object.keys(finalUser.assessments || {}).filter(k => k.includes('_assessment') || k.includes('test')).length;
        const avgScore = globalAesCount > 0 ? Math.round(globalAesSum / globalAesCount) : 0;
        const avgRog = globalRogCount > 0 ? Math.round(globalRogSum / globalRogCount) : 0;

        setMetrics({
          lessonsCompleted: cLessons,
          totalLessons: tLessons,
          overallAes: avgScore,
          overallRog: avgRog,
          assessmentsTaken: assessmentsTaken
        });

        setModuleMastery(masteryData);

        // Rank Calculation
        const completionRatio = tLessons > 0 ? cLessons / tLessons : 0;
        if (completionRatio === 1 && avgScore > 90) setUserRank("Algorithm Grandmaster");
        else if (completionRatio >= 0.8) setUserRank("Algorithm Scholar");
        else if (completionRatio >= 0.4) setUserRank("Intermediate Architect");
        else if (completionRatio > 0) setUserRank("Syntax Explorer");
        else setUserRank("Novice Coder");

      } catch (e) {
        console.error("Profile data load error:", e);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const initials = user.name ? user.name.charAt(0).toUpperCase() : "U";

  if (loading) {
    return (
      <div className="profile-page-v2">
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

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
              <div className="stat-icon-wrapper purple"><FiTarget /></div>
              <div className="stat-info">
                <h4 style={{ display: 'flex', alignItems: 'center' }}>
                  Efficiency Rate
                  <div className="info-tooltip">
                    <FiInfo size={14} />
                    <span className="tooltip-text">
                      <span className="tooltip-title">Algorithmic Efficiency Score (AES)</span>
                      Measures how close your code's Time and Space complexity is to the theoretical optimal solution. 100% means perfect efficiency.
                    </span>
                  </div>
                </h4>
                <p><strong>{metrics.overallAes}%</strong> <span className="text-muted">avg AES</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper orange"><FiTrendingUp /></div>
              <div className="stat-info">
                <h4 style={{ display: 'flex', alignItems: 'center' }}>
                  Optimization Gain
                  <div className="info-tooltip">
                    <FiInfo size={14} />
                    <span className="tooltip-text">
                      <span className="tooltip-title">Refactoring Optimization Gain (ROG)</span>
                      Measures your behavioral improvement. It tracks how many points your AES increased after reading feedback and refactoring your initial working code.
                    </span>
                  </div>
                </h4>
                <p><strong>+{metrics.overallRog}</strong> <span className="text-muted">avg ROG</span></p>
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
              <span className="mastery-subtitle">Your hierarchical progress, efficiency scores, and optimization metrics</span>
            </div>

            <div className="mastery-list">
              {moduleMastery.map((mod, index) => {
                const isComplete = mod.completed === mod.total && mod.total > 0;
                const isExpanded = expandedModules[mod.moduleId];

                return (
                  <div key={mod.moduleId} className="mastery-card-container">
                    <div className={`mastery-card ${isComplete ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleModule(mod.moduleId)}>
                      <div className="mastery-card-left">
                        <div className="mastery-module-number">M{index + 1}</div>
                        <div className="mastery-details">
                          <h4>{mod.title}</h4>
                          <span className="mastery-fraction">
                            {mod.completed} of {mod.total} lessons cleared
                            {mod.avgAes > 0 && <span className="mod-inline-metric"> • Avg AES: {mod.avgAes}%</span>}
                          </span>
                        </div>
                      </div>

                      <div className="mastery-card-right">
                        <div className="progress-bar-container">
                          <div className="progress-bar-track">
                            <div className={`progress-bar-fill ${isComplete ? 'gold' : ''}`} style={{ width: `${mod.percentage}%` }}></div>
                          </div>
                          <span className="progress-percentage">{mod.percentage}%</span>
                        </div>
                        <FiChevronDown className={`module-chevron ${isExpanded ? 'rotated' : ''}`} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="module-dropdown-content">
                        {mod.lessons.map((lesson, lIdx) => (
                          <div key={lesson.lessonId} className="lesson-block">
                            <div className="lesson-header">
                              <span className="lesson-title">Lesson {index + 1}.{lIdx + 1}: {lesson.title}</span>
                              {lesson.isCompleted && <FiCheckCircle className="lesson-check" />}
                            </div>
                            
                            {lesson.activities.length === 0 ? (
                              <div className="activity-row empty-row">
                                <span className="empty-text">Review / Assessment Content</span>
                              </div>
                            ) : (
                              <div className="activities-list">
                                {lesson.activities.map((act) => (
                                  <div key={act.id} className="activity-row">
                                    <div className="act-left">
                                      <FiCode className="act-icon" />
                                      <div className="act-info">
                                        <span className="act-title">{act.title}</span>
                                        <span className={`act-difficulty ${act.difficulty?.toLowerCase() || 'easy'}`}>{act.difficulty || 'Easy'}</span>
                                      </div>
                                    </div>
                                    <div className="act-right">
                                      <span className={`metric-badge aes-badge ${act.aes >= 100 ? 'perfect' : act.aes > 0 ? 'good' : 'empty'}`}>
                                        AES: {act.aes > 0 ? `${act.aes}%` : '--'}
                                      </span>
                                      <span className={`metric-badge rog-badge ${act.rog > 0 ? 'active' : 'empty'}`}>
                                        ROG: {act.rog > 0 ? `+${act.rog}` : '--'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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