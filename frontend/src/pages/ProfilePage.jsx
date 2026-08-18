// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiCode,
  FiCpu,
  FiInfo,
  FiLock,
  FiMail,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiUnlock,
  FiUsers
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB, submissionsDB } from "../db";
import { isAdminUser } from "../utils/auth";
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
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  const profileTour = {
    id: "profile-tour",
    pageId: "profile",
    title: "Profile Tour",
    steps: [
      { target: ".profile-header-card", title: "Your overview", description: "See your rank, avatar, and account details at a glance." },
      { target: ".profile-sidebar", title: "Performance metrics", description: "Track lessons completed, your average AES and ROG, and total evaluations recorded." },
      { target: ".mastery-list", title: "Module mastery", description: "Review how each module is progressing and where you can improve." },
      { target: ".milestone-card-container", title: "Assessments and milestones", description: "Track diagnostic and post-test milestones across the course." },
    ],
  };

  // Global Milestones State
  const [milestones, setMilestones] = useState({
    preTest: null,
    postTest: null
  });
  const [isPostTestUnlocked, setIsPostTestUnlocked] = useState(false);

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const formatMilestoneScore = (data) => {
    if (!data) return "--";
    if (data.score !== undefined && data.score !== null) return `${Math.round(data.score)}%`;
    if (data.correct !== undefined && data.total !== undefined && data.total > 0) {
      return `${Math.round((data.correct / data.total) * 100)}% (${data.correct}/${data.total})`;
    }
    return "Completed";
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = JSON.parse(stored || "{}");
        if (!parsed.email && !parsed.isGuest) parsed = { name: "User", email: "", progress: {}, assessments: {} };

        const isGuest = parsed.isGuest === true;

        // Admin accounts no longer have Learning Path / Workspace / Project
        // progress at all, so none of the curriculum-mastery data fetching
        // below is relevant (or even meaningful) for them. Load just the
        // basic identity fields and stop there.
        if (isAdminUser(parsed)) {
          setUser(parsed);
          setIsAdmin(true);
          setLoading(false);
          return;
        }

        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        if (!isGuest) {
          await progressDB.iterate((value, key) => { initialProg[key] = value.score !== undefined ? value.score : value; });
          await assessmentsDB.iterate((value, key) => { initialAssm[key] = value.data || value; });
        }

        if (navigator.onLine && parsed.email && !isGuest) {
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

        const finalUser = { ...parsed, progress: isGuest ? {} : initialProg, assessments: isGuest ? {} : initialAssm };
        setUser(finalUser);

        const userSubs = {};
        if (!isGuest) {
          await submissionsDB.iterate((val) => {
            if (val.userId === finalUser.email) {
              if (!userSubs[val.moduleId]) userSubs[val.moduleId] = {};
              userSubs[val.moduleId][val.activityId] = val;
            }
          });
        }

        const findMilestoneData = (keywords) => {
          const cleanKws = keywords.map(k => k.toLowerCase().replace(/[-_ ]/g, ''));
          for (const [k, v] of Object.entries(finalUser.assessments || {})) {
            const cleanKey = k.toLowerCase().replace(/[-_ ]/g, '');
            if (cleanKws.some(kw => cleanKey.includes(kw))) {
              if (v !== null && v !== undefined && (v.completed || v.passed || v.score !== undefined || v.correct !== undefined)) {
                return v;
              }
            }
          }
          for (const [k, v] of Object.entries(finalUser.progress || {})) {
            const cleanKey = k.toLowerCase().replace(/[-_ ]/g, '');
            if (cleanKws.some(kw => cleanKey.includes(kw))) {
              if (v !== null && v !== undefined && (v === true || v >= 50 || (typeof v === 'object' && (v.completed || v.score !== undefined)))) {
                return typeof v === 'object' ? v : { score: v, completed: true };
              }
            }
          }
          return null;
        };

        const preTestData = findMilestoneData(['pretest', 'coursepretest']);
        const postTestData = findMilestoneData(['posttest', 'courseposttest']);

        setMilestones({ preTest: preTestData, postTest: postTestData });

        const allActivities = {};
        for (let i = 0; i <= 6; i++) {
          try {
            const res = await fetch(`/data/activities/module_${i}.json`);
            if (res.ok) allActivities[`module-${i}`] = await res.json();
          } catch (e) { console.warn(`Could not load module_${i}.json`); }
        }

        let tLessons = 0, cLessons = 0;
        let globalAesSum = 0, globalAesCount = 0;
        let globalRogSum = 0, globalRogCount = 0;
        let pathUnlocked = true; // Tracks continuous curriculum completion status

        const masteryData = curriculumIndex.map((mod) => {
          const modActs = allActivities[mod.moduleId] || {};
          let modCompletedLessons = 0;
          let modAesSum = 0, modAesCount = 0;
          let modRogSum = 0, modRogCount = 0;

          tLessons += mod.lessons.length;

          const mappedLessons = mod.lessons.map((lesson) => {
            // Correctly parse JSON property keys like "lesson_1" from "lesson-0-1"
            const lessonParts = lesson.lessonId.split('-');
            const lessonNum = lessonParts[2];
            const lessonKeyJson = `lesson_${lessonNum}`;
            const acts = modActs[lessonKeyJson] || [];

            let lessonCompletedActs = 0;

            const mappedActs = acts.map((act) => {
              const sub = userSubs[mod.moduleId]?.[act.id];
              let aes = 0; let rog = 0; let isCompleted = false;

              if (sub) {
                aes = sub.final_aes !== null && sub.final_aes !== undefined ? sub.final_aes : sub.score || 0;
                if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100; 
                aes = Math.min(aes, 100);

                rog = sub.rog || 0;
                isCompleted = aes >= 50 || sub.status === "passed";

                if (isCompleted) lessonCompletedActs++;
                
                modAesSum += aes; modAesCount++; globalAesSum += aes; globalAesCount++;
                if (rog > 0) { modRogSum += rog; modRogCount++; globalRogSum += rog; globalRogCount++; }
              }

              return { ...act, aes: Math.round(aes), rog: Math.round(rog), isCompleted };
            });

            const minRequired = lesson.minimumActivities || acts.length;
            let isLessonCompleted = false;
            if (acts.length > 0 && lessonCompletedActs >= minRequired) {
              isLessonCompleted = true;
            } else if (finalUser.progress[lesson.lessonId] >= 50 || finalUser.progress[lesson.lessonId] === true) {
              isLessonCompleted = true;
            }

            const currentUnlockState = pathUnlocked;

            if (!isLessonCompleted && acts.length > 0) {
              pathUnlocked = false; // Stop progression if minimum activities aren't completed
            }

            if (isLessonCompleted) {
              modCompletedLessons++;
              cLessons++;
            }

            return { 
              ...lesson, 
              activities: mappedActs, 
              isCompleted: isLessonCompleted, 
              isUnlocked: currentUnlockState,
              completedCount: lessonCompletedActs,
              minRequired: minRequired
            };
          });

          // ADDED: Parse Optimization Challenge Activities
          const rawOptimizations = modActs.optimizations || [];
          let optCompletedCount = 0;
          const isOptUnlocked = pathUnlocked; // Unlocks once standard module lessons are finished

          const mappedOptimizations = rawOptimizations.map((act) => {
            const sub = userSubs[mod.moduleId]?.[act.id];
            let aes = 0; let rog = 0; let isCompleted = false;

            if (sub) {
              aes = sub.final_aes !== null && sub.final_aes !== undefined ? sub.final_aes : sub.score || 0;
              if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100;
              aes = Math.min(aes, 100);

              rog = sub.rog || 0;
              isCompleted = aes >= 50 || sub.status === "passed";

              if (isCompleted) optCompletedCount++;

              modAesSum += aes; modAesCount++; globalAesSum += aes; globalAesCount++;
              if (rog > 0) { modRogSum += rog; modRogCount++; globalRogSum += rog; globalRogCount++; }
            } else if (finalUser.progress[act.id] >= 50 || finalUser.progress[act.id] === true) {
              isCompleted = true;
              optCompletedCount++;
            }

            return { ...act, aes: Math.round(aes), rog: Math.round(rog), isCompleted };
          });

          const modClean = mod.moduleId.toLowerCase().replace(/[-_ ]/g, ''); 
          const targetQuizKeys = [`${modClean}assessment`, `${modClean}quiz`, `${modClean}test`, modClean];
          let quizData = null;

          for (const [k, v] of Object.entries(finalUser.assessments || {})) {
            const kc = k.toLowerCase().replace(/[-_ ]/g, '');
            if (targetQuizKeys.includes(kc)) {
              quizData = v;
              break;
            }
          }

          const isQuizUnlocked = pathUnlocked;
          if (!quizData || (!quizData.passed && quizData.score < 50 && quizData.score !== undefined)) {
            pathUnlocked = false; // Lock next module if quiz isn't done
          }

          return {
            ...mod,
            lessons: mappedLessons,
            optimizations: {
              activities: mappedOptimizations,
              isUnlocked: isOptUnlocked,
              completedCount: optCompletedCount
            },
            quiz: quizData ? { ...quizData, isUnlocked: isQuizUnlocked } : { isUnlocked: isQuizUnlocked },
            completed: modCompletedLessons,
            total: mod.lessons.length,
            percentage: mod.lessons.length > 0 ? Math.round((modCompletedLessons / mod.lessons.length) * 100) : 0,
            avgAes: modAesCount > 0 ? Math.round(modAesSum / modAesCount) : 0,
            avgRog: modRogCount > 0 ? Math.round(modRogSum / modRogCount) : 0
          };
        });

        const checkPostTestUnlock = masteryData.length > 0 && masteryData.every(mod => {
          const lessonsDone = mod.total === 0 ? true : mod.completed >= mod.total;
          const quizDone = mod.quiz !== null && mod.quiz !== undefined && (mod.quiz.completed || mod.quiz.passed || mod.quiz.score !== undefined);
          return lessonsDone && quizDone;
        });
        setIsPostTestUnlocked(checkPostTestUnlock);

        const assessmentsTaken = Object.keys(finalUser.assessments || {}).filter(k => k.includes('_assessment') || k.includes('test') || k.includes('quiz')).length;
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

        if (isGuest) {
          setUserRank("Guest Visitor");
        } else {
          const completionRatio = tLessons > 0 ? cLessons / tLessons : 0;
          if (completionRatio === 1 && avgScore > 90) setUserRank("Algorithm Grandmaster");
          else if (completionRatio >= 0.8) setUserRank("Algorithm Scholar");
          else if (completionRatio >= 0.4) setUserRank("Intermediate Architect");
          else if (completionRatio > 0) setUserRank("Syntax Explorer");
          else setUserRank("Novice Coder");
        }

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
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="profile-page-v2">
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />

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
                <span className="role-badge"><FiShield style={{ marginRight: '6px' }} /> Administrator</span>
              </div>

              <div className="user-email-wrapper">
                <span className="user-email"><FiMail size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />{user.email}</span>
              </div>
            </div>

            <div className="profile-header-actions">
              <button type="button" className="btn-resume-learning" onClick={() => navigate("/dashboard")}>
                <FiShield size={18} /> Open Admin Dashboard
              </button>
            </div>
          </div>

          <div className="profile-content-grid">
            <main className="profile-main-content" style={{ gridColumn: '1 / -1' }}>
              <div className="content-header-row">
                <h2>Administrator Account</h2>
                <span className="mastery-subtitle">
                  Admin accounts do not track Learning Path, Workspace, or Project progress -- those are
                  student-only features. This account is scoped to user management and dataset testing.
                </span>
              </div>

              <div className="mastery-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div className="mastery-card-container">
                  <Link to="/admin/users" className="mastery-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                    <div className="mastery-card-left">
                      <div className="mastery-module-number"><FiUsers /></div>
                      <div className="mastery-details">
                        <h4>User Management</h4>
                        <span className="mastery-fraction">Search, suspend, or delete accounts</span>
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="mastery-card-container">
                  <Link to="/admin/evaluation-suite" className="mastery-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                    <div className="mastery-card-left">
                      <div className="mastery-module-number"><FiActivity /></div>
                      <div className="mastery-details">
                        <h4>Dataset Testing</h4>
                        <span className="mastery-fraction">Run the full complexity analyzer benchmark</span>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page-v2">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />

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
            
            <div className="user-email-wrapper">
              {user.isGuest ? (
                <span className="guest-warning-badge">
                  <FiAlertTriangle className="status-icon warning" />
                  Guest Mode (Local persistence disabled)
                </span>
              ) : (
                <span className="user-email">{user.email}</span>
              )}
            </div>
          </div>

          <div className="profile-header-actions">
            {/* BUG FIX: guests are blocked from the Learning Path (nothing
                would persist for them there anyway) -- point this button at
                Sign Up instead of a link that just bounces them back out. */}
            {user.isGuest ? (
              <Link to="/signup" className="btn-resume-learning">
                <FiCode size={18} /> Sign Up to Start Learning
              </Link>
            ) : (
              <Link to="/learning-path" className="btn-resume-learning">
                <FiCode size={18} /> Continue Learning
              </Link>
            )}
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
                      Measures how close your code's Time and Space complexity is to optimal. 100% represents optimal complexity.
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
                      Tracks AES point increases after reading automated complexity analysis and refactoring working code.
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
                <p><strong>{metrics.assessmentsTaken}</strong> <span className="text-muted">evaluations recorded</span></p>
              </div>
            </div>
          </aside>

          <main className="profile-main-content">
            <div className="content-header-row">
              <h2>Curriculum Path & Mastery</h2>
              <span className="mastery-subtitle">Chronological tracking from baseline evaluation to final verification</span>
            </div>

            <div className="mastery-list chronological-curriculum">
              {/* STAGE 0: PRE-TEST */}
              <div className="mastery-card-container milestone-card-container">
                <div className={`mastery-card milestone-card ${milestones.preTest ? 'completed' : ''}`}>
                  <div className="mastery-card-left">
                    <div className="mastery-module-number milestone-badge pre-badge">PRE</div>
                    <div className="mastery-details">
                      <h4>Course Pre-Test Evaluation</h4>
                      <span className="mastery-fraction">
                        {milestones.preTest 
                          ? `Completed • Baseline Recorded: ${formatMilestoneScore(milestones.preTest)}` 
                          : "Pending Initial Baseline Assessment"}
                      </span>
                    </div>
                  </div>
                  <div className="mastery-card-right">
                    {milestones.preTest ? (
                      // BUG FIX: this used to be a static, unclickable badge --
                      // once the pre-test was completed there was no way to
                      // get back to the results screen from the Profile page.
                      // AssessmentPage already renders a locked results view
                      // (score, label, breakdown) once a completed attempt is
                      // detected, so this just links there like the
                      // equivalent "View Results" button on the Learning Path
                      // page already does.
                      <Link to="/assessment/course-pre-test/pre" className="btn-milestone-action violet view-results-link">
                        <FiCheckCircle className="status-inline-icon" /> Baseline Recorded — View Results
                      </Link>
                    ) : (
                      <Link to="/assessment/course-pre-test/pre" className="btn-milestone-action violet">
                        Take Pre-Test
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* STAGES 1-7: REPEATING MODULES -> LESSONS -> OPTIMIZATIONS -> QUIZZES */}
              {moduleMastery.map((mod) => {
                const modNumber = mod.moduleId ? mod.moduleId.replace("module-", "") : "0";
                const isComplete = mod.completed === mod.total && mod.total > 0;
                const isExpanded = expandedModules[mod.moduleId];

                return (
                  <div key={mod.moduleId} className="mastery-card-container">
                    <div className={`mastery-card ${isComplete ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleModule(mod.moduleId)}>
                      <div className="mastery-card-left">
                        <div className="mastery-module-number">M{modNumber}</div>
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
                          <div key={lesson.lessonId} className={`lesson-block ${lesson.isUnlocked ? '' : 'locked-block'}`}>
                            <div className="lesson-header">
                              <span className="lesson-title">Lesson {modNumber}.{lIdx + 1}: {lesson.title}</span>
                              <div className="lesson-status-indicators">
                                {lesson.activities.length > 0 && (
                                  <span className={`activity-count-badge ${lesson.isCompleted ? 'cleared' : ''}`}>
                                    {lesson.completedCount}/{lesson.minRequired} Acts 
                                  </span>
                                )}
                                {!lesson.isUnlocked ? (
                                  <FiLock className="lesson-lock-icon" title="Complete previous activities to unlock" />
                                ) : lesson.isCompleted ? (
                                  <FiCheckCircle className="lesson-check cleared" />
                                ) : null}
                              </div>
                            </div>
                            
                            {lesson.activities.length === 0 ? (
                              <div className="activity-row empty-row">
                                <span className="empty-text">Concept / Interactive Reading Content</span>
                              </div>
                            ) : (
                              <div className="activities-list">
                                {lesson.activities.map((act) => (
                                  <div key={act.id} className={`activity-row ${act.isCompleted ? 'completed-row' : ''} ${!lesson.isUnlocked ? 'locked-row' : ''}`}>
                                    <div className="act-left">
                                      {act.isCompleted ? <FiCheckCircle className="act-icon success" /> : lesson.isUnlocked ? <FiCode className="act-icon pending" /> : <FiLock className="act-icon locked" />}
                                      <div className="act-info">
                                        <span className="act-title">{act.title}</span>
                                        <span className={`act-difficulty ${act.difficulty?.toLowerCase() || 'easy'}`}>{act.difficulty || 'Easy'}</span>
                                      </div>
                                    </div>
                                    <div className="act-right">
                                      {lesson.isUnlocked ? (
                                        <>
                                          <span className={`metric-badge aes-badge ${act.aes >= 100 ? 'perfect' : act.aes > 0 ? 'good' : 'empty'}`}>
                                            AES: {act.aes > 0 ? `${act.aes}%` : '--'}
                                          </span>
                                          <span className={`metric-badge rog-badge ${act.rog > 0 ? 'active' : 'empty'}`}>
                                            ROG: {act.rog > 0 ? `+${act.rog}` : '--'}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="locked-text">Locked</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* ADDED: Optimization Challenges Section */}
                        {mod.optimizations && mod.optimizations.activities.length > 0 && (
                          <div className={`lesson-block optimization-block ${mod.optimizations.isUnlocked ? '' : 'locked-block'}`}>
                            <div className="lesson-header">
                              <span className="lesson-title" style={{ display: 'flex', alignItems: 'center' }}>
                                <FiTarget style={{ marginRight: '8px', color: '#7c5cff' }} />
                                Module {modNumber} Optimization Challenges
                              </span>
                              <div className="lesson-status-indicators">
                                <span className={`activity-count-badge ${mod.optimizations.completedCount === mod.optimizations.activities.length ? 'cleared' : ''}`}>
                                  {mod.optimizations.completedCount}/{mod.optimizations.activities.length} Acts
                                </span>
                                {!mod.optimizations.isUnlocked ? (
                                  <FiLock className="lesson-lock-icon" title="Complete module lessons to unlock" />
                                ) : mod.optimizations.completedCount === mod.optimizations.activities.length ? (
                                  <FiCheckCircle className="lesson-check cleared" />
                                ) : null}
                              </div>
                            </div>

                            <div className="activities-list">
                              {mod.optimizations.activities.map((act) => (
                                <div key={act.id} className={`activity-row ${act.isCompleted ? 'completed-row' : ''} ${!mod.optimizations.isUnlocked ? 'locked-row' : ''}`}>
                                  <div className="act-left">
                                    {act.isCompleted ? <FiCheckCircle className="act-icon success" /> : mod.optimizations.isUnlocked ? <FiCode className="act-icon pending" /> : <FiLock className="act-icon locked" />}
                                    <div className="act-info">
                                      <span className="act-title">{act.title}</span>
                                      <span className={`act-difficulty ${act.difficulty?.toLowerCase() || 'medium'}`}>{act.difficulty || 'Medium'}</span>
                                    </div>
                                  </div>
                                  <div className="act-right">
                                    {mod.optimizations.isUnlocked ? (
                                      <>
                                        <span className={`metric-badge aes-badge ${act.aes >= 100 ? 'perfect' : act.aes > 0 ? 'good' : 'empty'}`}>
                                          AES: {act.aes > 0 ? `${act.aes}%` : '--'}
                                        </span>
                                        <span className={`metric-badge rog-badge ${act.rog > 0 ? 'active' : 'empty'}`}>
                                          ROG: {act.rog > 0 ? `+${act.rog}` : '--'}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="locked-text">Locked</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className={`lesson-block module-quiz-block ${mod.quiz && mod.quiz.isUnlocked ? '' : 'locked-block'}`}>
                          <div className="lesson-header">
                            <span className="lesson-title quiz-label">Module {modNumber} Verification Quiz</span>
                            {mod.quiz && (mod.quiz.passed || (mod.quiz.score !== undefined && mod.quiz.score >= 50)) && <FiCheckCircle className="lesson-check passed" />}
                          </div>
                          <div className="activity-row">
                            <div className="act-left">
                              {mod.quiz && mod.quiz.isUnlocked ? <FiActivity className="act-icon quiz-icon" /> : <FiLock className="act-icon locked" />}
                              <div className="act-info">
                                <span className="act-title">Post-Module Assessment</span>
                                <span className="act-difficulty medium">Required</span>
                              </div>
                            </div>
                            <div className="act-right">
                              {mod.quiz && (mod.quiz.passed || mod.quiz.score !== undefined) ? (
                                // BUG FIX: same "no way back to results" issue
                                // as the pre/post-test milestones -- wrap the
                                // score badge in a link to the completed
                                // quiz's results view instead of leaving it
                                // as inert text.
                                <Link to={`/assessment/${mod.moduleId}/post`} className={`metric-badge aes-badge ${mod.quiz.passed || (mod.quiz.score !== undefined && mod.quiz.score >= 50) ? 'perfect' : 'good'}`}>
                                  Score: {formatMilestoneScore(mod.quiz)}
                                </Link>
                              ) : mod.quiz && mod.quiz.isUnlocked ? (
                                <Link to={`/assessment/${mod.moduleId}/post`} className="btn-take-quiz">
                                  Take Quiz
                                </Link>
                              ) : (
                                <span className="btn-take-quiz locked" style={{ backgroundColor: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                                  <FiLock style={{ marginRight: '6px' }} /> Locked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}

              {/* STAGE FINAL: POST-TEST */}
              <div className="mastery-card-container milestone-card-container final-milestone">
                <div className={`mastery-card milestone-card ${milestones.postTest ? 'completed' : !isPostTestUnlocked ? 'locked' : 'ready'}`}>
                  <div className="mastery-card-left">
                    <div className={`mastery-module-number milestone-badge post-badge ${!isPostTestUnlocked && !milestones.postTest ? 'locked' : ''}`}>
                      POST
                    </div>
                    <div className="mastery-details">
                      <h4>Course Post-Test Final Verification</h4>
                      <span className="mastery-fraction">
                        {milestones.postTest 
                          ? `Completed • Final Score: ${formatMilestoneScore(milestones.postTest)}` 
                          : isPostTestUnlocked 
                          ? "Unlocked • Ready for Final Examination" 
                          : (
                            <span className="locked-reason-span">
                              <FiLock className="inline-lock-icon" />
                              Locked (Clear all Modules & Quizzes first)
                            </span>
                          )
                        }
                      </span>
                    </div>
                  </div>
                  <div className="mastery-card-right">
                    {milestones.postTest ? (
                      <Link to="/assessment/course-post-test/post" className="milestone-status validated view-results-link">
                        <FiCheckCircle className="status-inline-icon" /> Completed — View Results
                      </Link>
                    ) : isPostTestUnlocked ? (
                      <Link to="/assessment/course-post-test/post" className="btn-milestone-action gold">
                        <FiUnlock style={{ marginRight: '6px' }}/> Take Final Exam
                      </Link>
                    ) : (
                      <span className="milestone-status disabled">
                        <FiLock className="status-inline-icon" /> Exam Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}