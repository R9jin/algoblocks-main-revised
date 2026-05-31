// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import {
  FiCheckCircle, FiChevronDown, FiChevronRight, FiCircle, FiClipboard,
  FiDatabase, FiFilter, FiLock, FiRefreshCw, FiShare2, FiUsers,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB } from "../db";
import "../styles/LearningPath.css";

const moduleIcons = {
  "module-0": { icon: FiUsers, color: "#7c5cff", difficulty: "Beginner", description: "Learn the fundamentals of AlgoBlocks." },
  "module-1": { icon: FiUsers, color: "#6366f1", difficulty: "Beginner", description: "Understand Big-O notation and complexity analysis." },
  "module-2": { icon: FiDatabase, color: "#22c55e", difficulty: "Intermediate", prereq: "Module 1", description: "Master brute force and exhaustive search strategies." },
  "module-3": { icon: FiFilter, color: "#f97316", difficulty: "Intermediate", prereq: "Module 1", description: "Learn divide and conquer algorithm design." },
  "module-4": { icon: FiFilter, color: "#a855f7", difficulty: "Intermediate", prereq: "Module 1", description: "Explore greedy algorithm strategies." },
  "module-5": { icon: FiShare2, color: "#3b82f6", difficulty: "Advanced", prereq: "Module 3", description: "Master dynamic programming techniques." },
  "module-6": { icon: FiRefreshCw, color: "#ec4899", difficulty: "Advanced", prereq: "Module 3", description: "Solve problems using backtracking." },
};

export default function LearningPath() {
  const navigate = useNavigate();
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [activitiesData, setActivitiesData] = useState({});
  const [assessments, setAssessments] = useState({});

  // OFFLINE FIRST: Load User Progress & Assessment results
  useEffect(() => {
    const loadOfflineData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = stored ? JSON.parse(stored) : {};
        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        // 1. Explicitly override with IndexedDB (Offline First Source of Truth)
        await progressDB.iterate((value, key) => {
          if (!value) return;
          const realKey = value.lesson_id || key;
          if (typeof realKey === 'string' && isNaN(Number(realKey))) {
            initialProg[realKey] = value.score !== undefined ? value.score : value;
          }
        });
        await assessmentsDB.iterate((value, key) => {
          if (!value) return;
          const realKey = value.assessment_key || key;
          const realVal = value.data || value;
          if (typeof realKey === 'string' && isNaN(Number(realKey))) {
            initialAssm[realKey] = realVal;
          }
        });

        setUserProgress(initialProg);
        setAssessments(initialAssm);

        // 2. Explicitly fetch from the cloud properly
        if (navigator.onLine && parsed.email && !parsed.isGuest) {
          try {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) {
              headers["Authorization"] = `Bearer ${token}`;
            }

            const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers });
            if (progRes.ok) {
              const data = await progRes.json();
              const progDataRaw = data.progress || data;

              let normalizedProg = {};
              if (Array.isArray(progDataRaw)) {
                progDataRaw.forEach(item => {
                  const k = item.lesson_id || item.key;
                  if (k) normalizedProg[k] = item.score !== undefined ? item.score : (item.data?.score ?? 1);
                });
              } else if (typeof progDataRaw === 'object' && progDataRaw !== null) {
                normalizedProg = progDataRaw;
              }

              for (const [key, val] of Object.entries(normalizedProg)) {
                if (typeof key === 'string' && isNaN(Number(key))) {
                  initialProg[key] = val;
                  await progressDB.setItem(key, { score: val, isSynced: true });
                }
              }
            }

            // Fetch Assessments
            const assRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
            if (assRes.ok) {
              const data = await assRes.json();
              const assDataRaw = data.assessments || data;

              let normalizedAssm = {};
              if (Array.isArray(assDataRaw)) {
                assDataRaw.forEach(item => {
                  const k = item.assessment_key || item.key;
                  if (k) normalizedAssm[k] = item.data || item;
                });
              } else if (typeof assDataRaw === 'object' && assDataRaw !== null) {
                normalizedAssm = assDataRaw;
              }

              for (const [key, val] of Object.entries(normalizedAssm)) {
                if (typeof key === 'string' && isNaN(Number(key))) {
                  initialAssm[key] = val;
                  await assessmentsDB.setItem(key, { ...val, isSynced: true });
                }
              }
            }

            setUserProgress({ ...initialProg });
            setAssessments({ ...initialAssm });

            parsed.progress = initialProg;
            parsed.assessments = initialAssm;
            localStorage.setItem("user", JSON.stringify(parsed));
          } catch (e) {
            console.warn("Could not fetch latest progress from cloud:", e);
          }
        }
      } catch (e) {
        console.warn("Error loading offline progress:", e);
      }
    };
    loadOfflineData();
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      const details = {};
      const acts = {};

      for (const module of curriculumIndex) {
        const mid = module.moduleId.split("-").pop();
        try {
          const resAct = await fetch(`/data/activities/module_${mid}.json`);
          if (resAct.ok) acts[module.moduleId] = await resAct.json();
        } catch (e) { }

        for (const lesson of module.lessons) {
          try {
            const fetchPath = `/data/curriculum/${module.moduleId}/${lesson.lessonId}.json`;
            const res = await fetch(fetchPath);
            if (res.ok) details[lesson.lessonId] = await res.json();
          } catch (e) {
            console.error(`Failed to fetch lesson data for ${lesson.lessonId}`, e);
          }
        }
      }
      setLessonDetails(details);
      setActivitiesData(acts);
    };
    fetchAllData();
  }, []);

  const toggleModule = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) newExpanded.delete(moduleId);
    else newExpanded.add(moduleId);
    setExpandedModules(newExpanded);
  };

  const handleModuleClick = (moduleId, lessonId) => {
    navigate(`/learning-path/${moduleId}/${lessonId}`);
  };

  const hasPreAssessment = (moduleId) => assessments[`${moduleId}_pre_assessment`] !== undefined;
  const hasPostAssessment = (moduleId) => assessments[`${moduleId}_post_assessment`] !== undefined;
  const getAssessmentScore = (moduleId, type) => assessments[`${moduleId}_${type}_assessment`]?.score ?? null;

  const isModuleComplete = (moduleId) => {
    const module = curriculumIndex.find((m) => m.moduleId === moduleId);
    if (!module) return false;
    return module.lessons.every((lesson) => {
      const details = lessonDetails[lesson.lessonId];
      const firstActivityId = details?.activities?.[0]?.id;
      if (!firstActivityId) return true;
      return (userProgress[lesson.lessonId] || 0) >= 1;
    });
  };

  const buildLockMap = () => {
    const lockMap = {};
    for (const module of curriculumIndex) {
      const preComplete = hasPreAssessment(module.moduleId);
      let isNextLocked = !preComplete;
      for (const lesson of module.lessons) {
        lockMap[lesson.lessonId] = isNextLocked;
        if (!isNextLocked) {
          const details = lessonDetails[lesson.lessonId];
          const firstActivityId = details?.activities?.[0]?.id;
          const prog = userProgress[lesson.lessonId] || 0;
          if (firstActivityId && prog < 1) {
            isNextLocked = true;
          }
        }
      }
    }
    return lockMap;
  };

  const lockMap = buildLockMap();

  return (
    <div className="learning-path-page">
      <DashboardHeader />
      <div className="learning-path-container">
        <div className="learning-path-header">
          <h1>Learning Path</h1>
          <p>
            Explore algorithm concepts through structured lessons, virtual explanations,
            and interactive learning experiences. Jump into the topic that interests you most!
          </p>
        </div>

        <div className="modules-container">
          {curriculumIndex.map((module) => {
            const moduleNum = module.moduleId.split("-").pop();
            const iconConfig = moduleIcons[module.moduleId];
            const IconComponent = iconConfig?.icon || FiUsers;
            const isExpanded = expandedModules.has(module.moduleId);

            const preComplete = hasPreAssessment(module.moduleId);
            const preScore = getAssessmentScore(module.moduleId, "pre");
            const moduleComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);
            const postScore = getAssessmentScore(module.moduleId, "post");

            const optimizations = activitiesData[module.moduleId]?.optimizations || [];
            const hasOptimizations = optimizations.length > 0;
            const lastLessonId = module.lessons[module.lessons.length - 1]?.lessonId;
            const optimizationsLocked = lockMap[lastLessonId] || (userProgress[lastLessonId] || 0) < 1;

            return (
              <div key={module.moduleId}>
                <div className="module-card-v2" onClick={() => toggleModule(module.moduleId)}>
                  <div className="module-card-icon" style={{ backgroundColor: `${iconConfig?.color || '#7c5cff'}15` }}>
                    <IconComponent size={32} color={iconConfig?.color || '#7c5cff'} />
                  </div>
                  <div className="module-card-content">
                    <div className="module-card-header" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <h3 className="module-card-title" style={{ margin: 0 }}>
                            Module {moduleNum}: {module.title}
                          </h3>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {iconConfig?.difficulty && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: iconConfig.difficulty === "Beginner" ? "rgba(34, 197, 94, 0.15)" : iconConfig.difficulty === "Intermediate" ? "rgba(249, 115, 22, 0.15)" : "rgba(236, 72, 153, 0.15)", color: iconConfig.difficulty === "Beginner" ? "#22c55e" : iconConfig.difficulty === "Intermediate" ? "#ea580c" : "#ec4899" }}>
                                {iconConfig.difficulty}
                              </span>
                            )}
                            {iconConfig?.prereq && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '3px 10px', borderRadius: '12px', backgroundColor: 'rgba(100, 116, 139, 0.1)', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Req: {iconConfig.prereq}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="module-card-description" style={{ marginTop: 0 }}>{iconConfig?.description || module.title}</p>
                      </div>
                      <FiChevronDown size={24} color={iconConfig?.color || "#7c5cff"} className={`module-card-chevron ${isExpanded ? "expanded" : ""}`} style={{ marginTop: '4px' }} />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="module-lessons-dropdown">
                    <div className={`assessment-row pre ${preComplete ? "done" : "pending"}`}>
                      <div className="assessment-row-left">
                        <FiClipboard size={16} /><span className="assessment-row-label">Pre-Assessment</span>
                        {preScore !== null && (<span className="assessment-score-badge">{preScore}%</span>)}
                      </div>
                      <div className="assessment-row-right">
                        {preComplete ? (
                          <>
                            <FiCheckCircle color="#22c55e" size={16} />
                            <button className="btn-assessment retake" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${module.moduleId}/pre`); }}>Retake</button>
                          </>
                        ) : (
                          <button className="btn-assessment start" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${module.moduleId}/pre`); }}>Take Pre-Assessment</button>
                        )}
                      </div>
                    </div>

                    {module.lessons.map((lesson) => {
                      const details = lessonDetails[lesson.lessonId];
                      const firstActivityId = details?.activities?.[0]?.id;
                      const prog = userProgress[lesson.lessonId] || 0;
                      const lessonDisplay = lesson.lessonId.replace("lesson-", "").replace(/-/g, ".");
                      const isLocked = lockMap[lesson.lessonId];

                      return (
                        <div key={lesson.lessonId} className={`dropdown-lesson-item ${isLocked ? "locked" : ""}`}>
                          <div className="lesson-info">
                            <span className="lesson-number">{lessonDisplay}</span><span className="lesson-title">{lesson.title}</span>
                          </div>
                          <div className="lesson-actions">
                            <button className="btn-read-lesson" disabled={isLocked} onClick={(e) => { e.stopPropagation(); if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lesson.lessonId}`); }}>Read Lesson</button>
                            <button className={`btn-start-activity ${!firstActivityId ? "disabled" : ""}`} disabled={isLocked || !firstActivityId} onClick={(e) => { e.stopPropagation(); if (!isLocked && firstActivityId) navigate(`/activity/${module.moduleId}/${firstActivityId}`); }}>
                              {firstActivityId ? "Start Activity" : "No Activity"}
                            </button>
                          </div>
                          <span className="lesson-status-icon">{isLocked ? (<FiLock color="#bdbdbd" />) : prog >= 1 ? (<FiCheckCircle color="#22c55e" />) : (<FiCircle color="#7c5cff" />)}</span>
                        </div>
                      );
                    })}

                    {hasOptimizations && (
                      <div className={`dropdown-lesson-item ${optimizationsLocked ? "locked" : ""}`} style={{ backgroundColor: "rgba(243, 156, 18, 0.04)" }}>
                        <div className="lesson-info">
                          <span className="lesson-number" style={{ color: "#f39c12", fontSize: "1.2rem" }}>★</span>
                          <span className="lesson-title" style={{ fontWeight: "bold", color: "#d35400" }}>Optimization Challenges</span>
                        </div>
                        <div className="lesson-actions">
                          <button className={`btn-start-activity ${optimizationsLocked ? "disabled" : ""}`} style={{ backgroundColor: optimizationsLocked ? "" : "#f39c12" }} disabled={optimizationsLocked} onClick={(e) => { e.stopPropagation(); if (!optimizationsLocked) navigate(`/activity/${module.moduleId}/${optimizations[0].id}`); }}>
                            Start Challenges
                          </button>
                        </div>
                        <span className="lesson-status-icon">{optimizationsLocked ? (<FiLock color="#bdbdbd" />) : userProgress[`lesson-${moduleNum}-optimizations`] ? (<FiCheckCircle color="#22c55e" />) : (<FiCircle color="#f39c12" />)}</span>
                      </div>
                    )}

                    <div className={`assessment-row post ${postComplete ? "done" : moduleComplete ? "pending" : "locked"}`}>
                      <div className="assessment-row-left">
                        <FiClipboard size={16} /><span className="assessment-row-label">Post-Assessment</span>
                        {postScore !== null && (<span className="assessment-score-badge post">{postScore}%</span>)}
                        {!moduleComplete && !postComplete && (<span className="assessment-gate-note">(Complete all lessons first)</span>)}
                      </div>
                      <div className="assessment-row-right">
                        {!moduleComplete && !postComplete ? (<FiLock color="#bdbdbd" size={16} />) : postComplete ? (
                          <><FiCheckCircle color="#22c55e" size={16} /><button className="btn-assessment retake" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${module.moduleId}/post`); }}>Retake</button></>
                        ) : (
                          <button className="btn-assessment start post" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${module.moduleId}/post`); }}>Take Post-Assessment</button>
                        )}
                      </div>
                    </div>

                    <div className="module-dropdown-footer">
                      <button className="view-all-lessons" onClick={(e) => { e.stopPropagation(); const first = module.lessons[0]?.lessonId; if (first && !lockMap[first]) handleModuleClick(module.moduleId, first); }}>
                        View all lessons in this module <FiChevronRight />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}