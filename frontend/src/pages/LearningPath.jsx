// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import {
  FiAward,
  FiCheckCircle,
  FiChevronDown,
  FiCircle,
  FiClipboard,
  FiDatabase,
  FiEye,
  FiFilter,
  FiLock,
  FiRefreshCw,
  FiShare2,
  FiUsers
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { useOnboarding } from "../context/OnboardingContext";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, curriculumCacheDB, progressDB, submissionsDB } from "../db";
import "../styles/LearningPath.css";
import { syncDownFromServer } from "../utils/syncManager";

const moduleIcons = {
  "module-0": {
    icon: FiUsers,
    color: "#7c5cff",
    difficulty: "Beginner",
    description: "Learn the fundamentals of AlgoBlocks.",
  },
  "module-1": {
    icon: FiUsers,
    color: "#6366f1",
    difficulty: "Beginner",
    description: "Understand Big-O notation and complexity analysis.",
  },
  "module-2": {
    icon: FiDatabase,
    color: "#22c55e",
    difficulty: "Intermediate",
    prereq: "Module 1",
    description: "Master brute force and exhaustive search strategies.",
  },
  "module-3": {
    icon: FiFilter,
    color: "#f97316",
    difficulty: "Intermediate",
    prereq: "Module 1",
    description: "Learn divide and conquer algorithm design.",
  },
  "module-4": {
    icon: FiFilter,
    color: "#a855f7",
    difficulty: "Intermediate",
    prereq: "Module 1",
    description: "Explore greedy algorithm strategies.",
  },
  "module-5": {
    icon: FiShare2,
    color: "#3b82f6",
    difficulty: "Advanced",
    prereq: "Module 3",
    description: "Master dynamic programming techniques.",
  },
  "module-6": {
    icon: FiRefreshCw,
    color: "#ec4899",
    difficulty: "Advanced",
    prereq: "Module 3",
    description: "Solve problems using backtracking.",
  },
};

export default function LearningPath() {
  const navigate = useNavigate();
  const { state: onboardingState } = useOnboarding();
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [userProgress, setUserProgress] = useState({});
  const [assessments, setAssessments] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [activitiesData, setActivitiesData] = useState({});
  const [isLoadingCurriculum, setIsLoadingCurriculum] = useState(true);

  // Safe JSON Parsing to prevent component unmount if local storage is malformed
  let storedUser = {};
  try {
    storedUser = JSON.parse(
      localStorage.getItem("user") || sessionStorage.getItem("user") || "{}"
    );
    if (!storedUser || typeof storedUser !== 'object') storedUser = {};
  } catch (e) {
    storedUser = {};
  }
  
  const userEmail = storedUser.email || "";
  const isGuest = storedUser.isGuest === true;
  const isAdmin = storedUser.role === "admin" || storedUser.isAdmin === true;

  const learningPathTour = {
    id: "learning-path-tour",
    pageId: "learning-path",
    title: "Learning Path Tour",
    steps: [
      { target: ".learning-path-header", title: "Curriculum overview", description: "See where you are in the course and what the page is built to guide you through." },
      { target: ".btn-assessment.start", title: "Start the pre-test", description: "Use the course diagnostic to unlock the curriculum when you are ready." },
      { target: ".module-card-v2", title: "Explore modules", description: "Open a module to inspect lessons, activities, and post-assessments." },
    ],
  };

  useEffect(() => {
    if (!storedUser.email || isGuest) return;
    const seen = onboardingState?.pages?.["learning-path"]?.seen;
    if (!seen && onboardingState?.tourSeen) return;
  }, [storedUser.email, isGuest, onboardingState]);

  const checkActivityDone = (moduleId, actId) => {
    const sub = submissions[moduleId]?.[actId];
    if (!sub) return false;
    
    let aes = sub.final_aes !== null && sub.final_aes !== undefined ? sub.final_aes : sub.score || 0;
    if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100;
    aes = Math.min(aes, 100);

    return aes >= 50 || sub.status === "passed";
  };

  const getMinReq = (moduleId, activities, isOpt = false) => {
    if (!activities || activities.length === 0) return 0;
    if (isOpt) return Math.min(2, activities.length); 

    const difficulty = moduleIcons[moduleId]?.difficulty || "Beginner";
    if (difficulty === "Beginner") return Math.min(3, activities.length);
    if (difficulty === "Intermediate") return Math.min(2, activities.length);
    if (difficulty === "Advanced") return Math.min(1, activities.length);
    
    return activities.length;
  };

  const loadData = async () => {
    try {
      const initialProg = {};
      const initialAssm = {};
      const initialSubs = {};

      await progressDB.iterate((value, key) => {
        initialProg[key] = value.score !== undefined ? value.score : value;
      });
      await assessmentsDB.iterate((value, key) => {
        initialAssm[key] = value.data || value;
      });
      
      await submissionsDB.iterate((val) => {
        // BUG FIX: `|| isGuest` used to make this true unconditionally for
        // any guest session, pulling in every submission ever cached
        // locally -- including other accounts' -- instead of just this
        // guest's own (which, correctly, should be none until they submit
        // something new). Guests are scoped by their own generated
        // userEmail like anyone else.
        if (val && val.userId === userEmail) {
          if (!initialSubs[val.moduleId]) initialSubs[val.moduleId] = {};
          initialSubs[val.moduleId][val.activityId] = val;
        }
      });

      setUserProgress(initialProg);
      setAssessments(initialAssm);
      setSubmissions(initialSubs);
    } catch (e) {
      console.error("Failed to load local DB data", e);
    }
  };

  useEffect(() => {
    loadData();
    syncDownFromServer();

    const handleSync = () => loadData();
    window.addEventListener("localDataSynced", handleSync);
    return () => window.removeEventListener("localDataSynced", handleSync);
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const details = {};
        const acts = {};
        const fetchPromises = [];

        const fetchWithCache = async (url, type, key) => {
          try {
            const cachedData = await curriculumCacheDB.getItem(url);
            if (cachedData) {
              if (type === 'activity') acts[key] = cachedData;
              if (type === 'lesson') details[key] = cachedData;
              return;
            }

            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              await curriculumCacheDB.setItem(url, data);
              if (type === 'activity') acts[key] = data;
              if (type === 'lesson') details[key] = data;
            }
          } catch (e) {
            console.warn(`Failed to load ${url}`, e);
          }
        };

        // OFFLINE FIX: warm the same curriculumCacheDB store with every
        // assessment JSON (per-module pretest/posttest plus the course-level
        // pre/post test) that AssessmentPage.jsx reads from. Without this,
        // a learner had to have already opened each assessment once online
        // for it to be cached -- browsing the Learning Path itself didn't
        // guarantee assessments would work offline, only lessons/activities
        // did. This makes the whole learning path (lessons, activities, AND
        // assessments) equally available offline after one online visit.
        const warmAssessmentCache = async (url) => {
          try {
            const cachedData = await curriculumCacheDB.getItem(url);
            if (cachedData) return;

            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              await curriculumCacheDB.setItem(url, data);
            }
          } catch (e) {
            console.warn(`Failed to precache assessment ${url}`, e);
          }
        };

        for (const module of curriculumIndex) {
          const mid = module.moduleId.split("-").pop();
          
          fetchPromises.push(
            fetchWithCache(`/data/activities/module_${mid}.json`, 'activity', module.moduleId)
          );

          for (const lesson of module.lessons) {
            fetchPromises.push(
              fetchWithCache(`/data/curriculum/${module.moduleId}/${lesson.lessonId}.json`, 'lesson', lesson.lessonId)
            );
          }

          fetchPromises.push(warmAssessmentCache(`/data/assessments/${module.moduleId}.json`));
        }

        fetchPromises.push(warmAssessmentCache(`/data/assessments/course-pre-test.json`));
        fetchPromises.push(warmAssessmentCache(`/data/assessments/course-post-test.json`));
        fetchPromises.push(warmAssessmentCache(`/data/assessments/course-post-test-v1.json`));

        await Promise.all(fetchPromises);

        setActivitiesData(acts);
      } catch (e) {
        console.error("Error loading curriculum:", e);
      } finally {
        setIsLoadingCurriculum(false);
      }
    };

    fetchAllData();
  }, []);

  const toggleModule = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) newExpanded.delete(moduleId);
    else newExpanded.add(moduleId);
    setExpandedModules(newExpanded);
  };

  const findMilestoneData = (keywords) => {
    const cleanKws = keywords.map(k => String(k).toLowerCase().replace(/[-_ ]/g, ''));
    for (const [k, v] of Object.entries(assessments || {})) {
      // FIX: Added String() wrapper to prevent crashes when DB keys are numbers
      const cleanKey = String(k).toLowerCase().replace(/[-_ ]/g, '');
      if (cleanKws.some(kw => cleanKey.includes(kw))) {
        if (v !== null && v !== undefined && (v.completed || v.passed || v.score !== undefined || v.correct !== undefined)) {
          return v;
        }
      }
    }
    return null;
  };

  const getQuizData = (moduleId) => {
    const modClean = String(moduleId).toLowerCase().replace(/[-_ ]/g, ''); 
    const targetQuizKeys = [`${modClean}assessment`, `${modClean}quiz`, `${modClean}test`, modClean, `${modClean}postassessment`];
    
    for (const [k, v] of Object.entries(assessments || {})) {
      // FIX: Added String() wrapper for crash prevention 
      const kc = String(k).toLowerCase().replace(/[-_ ]/g, '');
      if (targetQuizKeys.includes(kc)) {
        return v;
      }
    }
    return null;
  };

  const preTestData = findMilestoneData(['pretest', 'coursepretest']);
  const postTestData = findMilestoneData(['posttest', 'courseposttest']);

  const isGlobalPreTestDone = preTestData !== null;
  const globalPreTestScore = preTestData?.score !== undefined ? Math.round(preTestData.score) : null;
  
  const isGlobalPostTestDone = postTestData !== null;
  const globalPostTestScore = postTestData?.score !== undefined ? Math.round(postTestData.score) : null;

  const hasPostAssessment = (moduleId) => {
    const quizData = getQuizData(moduleId);
    if (!quizData) return false;
    return quizData.passed || quizData.completed || (quizData.score !== undefined && quizData.score >= 50);
  };

  const getAssessmentScore = (moduleId) => {
    const quizData = getQuizData(moduleId);
    return quizData?.score !== undefined ? Math.round(quizData.score) : null;
  };

  const isModuleComplete = (moduleId) => {
    if (isLoadingCurriculum) return false;
    const module = curriculumIndex.find((m) => m.moduleId === moduleId);
    if (!module) return false;

    const modActs = activitiesData[moduleId] || {};
    // If activity data hasn't loaded for this module yet, return false
    // conservatively so the opt-count check isn't skipped while loading.
    if (Object.keys(modActs).length === 0) return false;

    const lessonsDone = module.lessons.every((lesson) => {
      const lessonNum = lesson.lessonId.split("-")[2];
      const activities = modActs[`lesson_${lessonNum}`] || [];
      if (activities.length === 0) return (userProgress[lesson.lessonId] || 0) >= 1;
      
      const minReq = getMinReq(moduleId, activities, false);
      const completedCount = activities.filter((a) => checkActivityDone(moduleId, a.id)).length;
      return completedCount >= minReq;
    });

    if (!lessonsDone) return false;

    const optimizations = modActs.optimizations || [];
    if (optimizations.length > 0) {
      const optMinReq = getMinReq(moduleId, optimizations, true);
      const completedOptCount = optimizations.filter(o => checkActivityDone(moduleId, o.id)).length;
      if (completedOptCount < optMinReq) return false;
    }

    return true;
  };

  const buildLockMap = () => {
    const lockMap = {};
    if (isLoadingCurriculum) return lockMap;

    let isNextLocked = isAdmin ? false : !isGlobalPreTestDone;

    for (const module of curriculumIndex) {
      const modActs = activitiesData[module.moduleId] || {};

      for (const lesson of module.lessons) {
        lockMap[lesson.lessonId] = isAdmin ? false : isNextLocked;

        if (!isNextLocked) {
          const lessonNum = lesson.lessonId.split("-")[2];
          const activities = modActs[`lesson_${lessonNum}`] || [];

          if (activities.length > 0) {
            const minReq = getMinReq(module.moduleId, activities, false);
            const completedCount = activities.filter((a) => checkActivityDone(module.moduleId, a.id)).length;
            
            if (completedCount < minReq) {
               isNextLocked = true; 
            }
          } else {
            if ((userProgress[lesson.lessonId] || 0) < 1) isNextLocked = true;
          }
        }
      }
      
      const optimizations = modActs.optimizations || [];
      if (optimizations.length > 0 && !isNextLocked) {
         const optMinReq = getMinReq(module.moduleId, optimizations, true);
         const completedOptCount = optimizations.filter((o) => checkActivityDone(module.moduleId, o.id)).length;
         if (completedOptCount < optMinReq) {
             isNextLocked = true;
         }
      }

      const postComplete = hasPostAssessment(module.moduleId);
      if (!postComplete && !isAdmin) isNextLocked = true;
    }
    return lockMap;
  };

  const lockMap = buildLockMap();

  const isCurriculumComplete = curriculumIndex.every((module) => {
    return isModuleComplete(module.moduleId) && hasPostAssessment(module.moduleId);
  });
  const isGlobalPostTestUnlocked = isAdmin || isCurriculumComplete;

  // BUG FIX: Guest sessions have nowhere to persist progress/assessments
  // (see clearLocalUserData()/isGuest handling above -- everything resets
  // to zero on next guest login), so letting guests into the curriculum
  // just let them "complete" lessons and quizzes that vanish the moment
  // they leave. Gate the whole page behind a sign-up prompt instead of
  // hiding this per-module, so there's no dead-end where a guest opens a
  // module card and finds broken/locked content underneath.
  if (isGuest) {
    return (
      <div className="learning-path-page">
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" showBackButton />
        <div className="learning-path-container">
          <div
            className="module-card-v2"
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "16px",
              border: "2px solid #7c5cff",
              background: "linear-gradient(145deg, rgba(124, 92, 255, 0.1) 0%, rgba(30, 41, 59, 0) 100%)",
              margin: "40px auto",
              maxWidth: "560px",
              padding: "32px",
            }}
          >
            <div className="module-card-icon" style={{ backgroundColor: "#7c5cff15" }}>
              <FiLock size={32} color="#7c5cff" />
            </div>
            <h2 style={{ margin: 0 }}>Sign up to access the Learning Path</h2>
            <p style={{ margin: 0, color: "#94a3b8" }}>
              Guest sessions don't save progress, so lessons, activities, and quiz
              results can't be tracked here. Create a free account to unlock the
              full curriculum and keep your progress across visits.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="btn-assessment start" style={{ padding: "12px 24px" }} onClick={() => navigate("/signup")}>
                Create Free Account
              </button>
              <button className="btn-assessment view-results" style={{ padding: "12px 24px" }} onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="learning-path-page">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={learningPathTour} tourPageId="learning-path" />
      <div className="learning-path-container">
        <div className="learning-path-header">
          <h1>Learning Path</h1>
          <p>
            Explore algorithm concepts through structured lessons, virtual
            explanations, and interactive learning experiences.
          </p>
        </div>

        <div className="modules-container">
          {/* GLOBAL PRE-TEST BANNER */}
          <div className="module-card-v2" style={{ border: "2px solid #7c5cff", marginBottom: "30px", background: "linear-gradient(145deg, rgba(124, 92, 255, 0.1) 0%, rgba(30, 41, 59, 0) 100%)" }}>
            <div className="module-card-icon" style={{ backgroundColor: "#7c5cff15" }}>
              <FiAward size={32} color="#7c5cff" />
            </div>
            <div className="module-card-content" style={{ paddingRight: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
                <div style={{ flex: 1 }}>
                  <h3 className="module-card-title" style={{ margin: "0 0 8px 0" }}>Comprehensive Course Pre-Test</h3>
                  <p className="module-card-description" style={{ margin: 0, color: "#94a3b8" }}>
                    A diagnostic assessment evaluating your baseline knowledge across all modules. This must be completed to unlock the curriculum.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  {isGlobalPreTestDone && (
                    <span style={{ fontWeight: "bold", fontSize: "1.2rem", color: "#22c55e" }}>{globalPreTestScore}%</span>
                  )}
                  {isGlobalPreTestDone ? (
                    <button
                      className="btn-assessment view-results"
                      onClick={() => navigate(`/assessment/course-pre-test/pre`)}
                      style={{ padding: "10px 20px" }}
                    >
                      <FiEye style={{ marginRight: "8px" }} />
                      View Results
                    </button>
                  ) : (
                    <button
                      className="btn-assessment start"
                      onClick={() => navigate(`/assessment/course-pre-test/pre`)}
                      style={{ padding: "12px 24px", fontSize: "1rem" }}
                    >
                      Start Diagnostic Exam
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* MODULES LIST */}
          {curriculumIndex.map((module) => {
            const moduleNum = module.moduleId.split("-").pop();
            const iconConfig = moduleIcons[module.moduleId];
            const IconComponent = iconConfig?.icon || FiUsers;
            const isExpanded = expandedModules.has(module.moduleId);

            const moduleComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);
            const postScore = getAssessmentScore(module.moduleId);

            const optimizations = activitiesData[module.moduleId]?.optimizations || [];
            const hasOptimizations = optimizations.length > 0;
            const lastLessonId = module.lessons[module.lessons.length - 1]?.lessonId;

            let AreLessonsCompleteForOpts = true;
            for (const lesson of module.lessons) {
              const lessonNum = lesson.lessonId.split("-")[2];
              const acts = activitiesData[module.moduleId]?.[`lesson_${lessonNum}`] || [];
              const cCount = acts.filter(a => checkActivityDone(module.moduleId, a.id)).length;
              if (cCount < getMinReq(module.moduleId, acts, false)) AreLessonsCompleteForOpts = false;
            }

            const optimizationsLocked = isAdmin ? false : lockMap[lastLessonId] || !AreLessonsCompleteForOpts;
            const optMinReqForQuiz = hasOptimizations ? getMinReq(module.moduleId, optimizations, true) : 0;
            const completedOptCountForQuiz = optimizations.filter(o => checkActivityDone(module.moduleId, o.id)).length;
            const optsMeetMinForQuiz = !hasOptimizations || completedOptCountForQuiz >= optMinReqForQuiz;
            const postAssessmentLocked = isAdmin ? false : (!moduleComplete || !optsMeetMinForQuiz) && !postComplete;
            const isModuleCompletelyLocked = isAdmin ? false : lockMap[module.lessons[0]?.lessonId];

            return (
              <div key={module.moduleId}>
                <div className={`module-card-v2 ${isModuleCompletelyLocked ? "locked" : ""}`} onClick={() => !isModuleCompletelyLocked && toggleModule(module.moduleId)}>
                  <div className="module-card-icon" style={{ backgroundColor: `${iconConfig?.color || "#7c5cff"}15` }}>
                    {isModuleCompletelyLocked ? <FiLock size={32} color="#64748b" /> : <IconComponent size={32} color={iconConfig?.color || "#7c5cff"} />}
                  </div>
                  <div className="module-card-content">
                    <div className="module-card-header" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                          <h3 className="module-card-title" style={{ margin: 0, color: isModuleCompletelyLocked ? "#64748b" : "" }}>
                            Module {moduleNum}: {module.title}
                          </h3>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {iconConfig?.difficulty && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: "bold",
                                  padding: "3px 10px",
                                  borderRadius: "12px",
                                  textTransform: "uppercase",
                                  backgroundColor: isModuleCompletelyLocked ? "rgba(100, 116, 139, 0.15)" : iconConfig.difficulty === "Beginner" ? "rgba(34, 197, 94, 0.15)" : iconConfig.difficulty === "Intermediate" ? "rgba(249, 115, 22, 0.15)" : "rgba(236, 72, 153, 0.15)",
                                  color: isModuleCompletelyLocked ? "#64748b" : iconConfig.difficulty === "Beginner" ? "#22c55e" : iconConfig.difficulty === "Intermediate" ? "#ea580c" : "#ec4899",
                                }}
                              >
                                {iconConfig.difficulty}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="module-card-description" style={{ marginTop: 0 }}>
                          {isModuleCompletelyLocked ? "Complete previous topics to unlock." : iconConfig?.description || module.title}
                        </p>
                      </div>
                      {!isModuleCompletelyLocked && (
                        <FiChevronDown
                          size={24}
                          color={iconConfig?.color || "#7c5cff"}
                          className={`module-card-chevron ${isExpanded ? "expanded" : ""}`}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && !isModuleCompletelyLocked && (
                  <div className="module-lessons-dropdown">
                    {module.lessons.map((lesson) => {
                      const lessonNum = lesson.lessonId.split("-")[2];
                      const activities = activitiesData[module.moduleId]?.[`lesson_${lessonNum}`] || [];
                      
                      const totalActivities = activities.length;
                      const completedCount = activities.filter((a) => checkActivityDone(module.moduleId, a.id)).length;
                      
                      const minReq = getMinReq(module.moduleId, activities, false);
                      const allDone = totalActivities > 0 ? completedCount >= minReq : (userProgress[lesson.lessonId] || 0) >= 1;
                      
                      const isLocked = lockMap[lesson.lessonId];
                      const lessonDisplay = lesson.lessonId.replace("lesson-", "").replace(/-/g, ".");
                      const firstActivityId = activities[0]?.id;

                      return (
                        <div key={lesson.lessonId} className={`dropdown-lesson-item ${isLocked ? "locked" : ""}`}>
                          <div className="lesson-info">
                            <span className="lesson-number">{lessonDisplay}</span>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span className="lesson-title">{lesson.title}</span>
                              {totalActivities > 0 && (
                                <span style={{ fontSize: "0.75rem", marginTop: "2px", fontWeight: "bold", color: completedCount >= minReq ? "#22c55e" : "#a8a8a8" }}>
                                  {completedCount} / {totalActivities} Activities Done (Min. {minReq} to progress)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="lesson-actions">
                            <button
                              className="btn-read-lesson"
                              disabled={isLocked}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lesson.lessonId}`);
                              }}
                            >
                              Read Lesson
                            </button>
                            <button
                              className={`btn-start-activity ${!firstActivityId ? "disabled" : ""}`}
                              disabled={isLocked || !firstActivityId}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked && firstActivityId) navigate(`/activity/${module.moduleId}/${firstActivityId}`);
                              }}
                            >
                              {firstActivityId ? "Start Activity" : "No Activity"}
                            </button>
                          </div>
                          <span className="lesson-status-icon">
                            {isLocked ? <FiLock color="#bdbdbd" /> : allDone ? <FiCheckCircle color="#22c55e" /> : <FiCircle color="#7c5cff" />}
                          </span>
                        </div>
                      );
                    })}

                    {hasOptimizations && (() => {
                       const optMinReq = getMinReq(module.moduleId, optimizations, true);
                       const completedOptCount = optimizations.filter(o => checkActivityDone(module.moduleId, o.id)).length;
                       const allOptsDone = completedOptCount >= optMinReq;

                       return (
                        <div className={`dropdown-lesson-item ${optimizationsLocked ? "locked" : ""}`} style={{ backgroundColor: "rgba(243, 156, 18, 0.04)" }}>
                          <div className="lesson-info">
                            <span className="lesson-number" style={{ color: "#f39c12", fontSize: "1.2rem" }}>★</span>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span className="lesson-title" style={{ fontWeight: "bold", color: "#d35400" }}>Optimization Challenges</span>
                              <span style={{ fontSize: "0.75rem", marginTop: "2px", fontWeight: "bold", color: allOptsDone ? "#22c55e" : "#d35400" }}>
                                {completedOptCount} / {optimizations.length} Challenges Done (Min. {optMinReq} to progress)
                              </span>
                            </div>
                          </div>
                          <div className="lesson-actions">
                            <button
                              className={`btn-start-activity ${optimizationsLocked ? "disabled" : ""}`}
                              style={{ backgroundColor: optimizationsLocked ? "" : "#f39c12" }}
                              disabled={optimizationsLocked}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!optimizationsLocked) navigate(`/activity/${module.moduleId}/${optimizations[0].id}`);
                              }}
                            >
                              Start Challenges
                            </button>
                          </div>
                          <span className="lesson-status-icon">
                            {optimizationsLocked ? <FiLock color="#bdbdbd" /> : allOptsDone ? <FiCheckCircle color="#22c55e" /> : <FiCircle color="#f39c12" />}
                          </span>
                        </div>
                       );
                    })()}

                    <div className={`assessment-row post ${postComplete ? "done" : postAssessmentLocked ? "locked" : "pending"}`}>
                      <div className="assessment-row-left">
                        <FiClipboard size={16} />
                        <span className="assessment-row-label">Quiz</span>
                        {postScore !== null && <span className="assessment-score-badge post">{postScore}%</span>}
                        {postAssessmentLocked && <span className="assessment-gate-note">(Complete all lessons and optimizations first)</span>}
                      </div>
                      <div className="assessment-row-right">
                        {postAssessmentLocked ? (
                          <FiLock color="#bdbdbd" size={16} />
                        ) : postComplete ? (
                          <>
                            <FiCheckCircle color="#22c55e" size={16} />
                            <button
                              className="btn-assessment view-results"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/assessment/${module.moduleId}/post`);
                              }}
                            >
                              View Results
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-assessment start post"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/assessment/${module.moduleId}/post`);
                            }}
                          >
                            Take Quiz
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className={`module-card-v2 ${!isGlobalPostTestUnlocked ? "locked" : ""}`} style={{ border: "2px solid #f59e0b", marginTop: "30px", background: "linear-gradient(145deg, rgba(245, 158, 11, 0.1) 0%, rgba(30, 41, 59, 0) 100%)" }}>
            <div className="module-card-icon" style={{ backgroundColor: "#f59e0b15" }}>
              {isGlobalPostTestUnlocked ? <FiAward size={32} color="#f59e0b" /> : <FiLock size={32} color="#64748b" />}
            </div>
            <div className="module-card-content" style={{ paddingRight: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
                <div style={{ flex: 1 }}>
                  <h3 className="module-card-title" style={{ margin: "0 0 8px 0", color: !isGlobalPostTestUnlocked ? "#64748b" : "" }}>Comprehensive Course Post-Test</h3>
                  <p className="module-card-description" style={{ margin: 0, color: "#94a3b8" }}>
                    {!isGlobalPostTestUnlocked 
                      ? "Complete all modules and their respective quizzes to unlock the final exam." 
                      : "The final challenge! Prove your mastery of all concepts covered in the curriculum."}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  {isGlobalPostTestDone && (
                    <span style={{ fontWeight: "bold", fontSize: "1.2rem", color: "#22c55e" }}>{globalPostTestScore}%</span>
                  )}
                  {!isGlobalPostTestUnlocked ? (
                    <button className="btn-assessment start disabled" disabled style={{ padding: "12px 24px", fontSize: "1rem", backgroundColor: "#334155", color: "#94a3b8" }}>
                      <FiLock style={{ marginRight: "8px" }} /> Locked
                    </button>
                  ) : isGlobalPostTestDone ? (
                    <button
                      className="btn-assessment view-results"
                      onClick={() => navigate(`/assessment/course-post-test/post`)}
                      style={{ padding: "10px 20px" }}
                    >
                      <FiEye style={{ marginRight: "8px" }} />
                      View Results
                    </button>
                  ) : (
                    <button
                      className="btn-assessment start"
                      onClick={() => navigate(`/assessment/course-post-test/post`)}
                      style={{ padding: "12px 24px", fontSize: "1rem", backgroundColor: "#f59e0b", color: "#1e293b", fontWeight: "bold" }}
                    >
                      Start Final Exam
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}