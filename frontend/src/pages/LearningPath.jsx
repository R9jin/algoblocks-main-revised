// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCircle,
  FiDatabase,
  FiFilter,
  FiLock,
  FiRefreshCw,
  FiShare2,
  FiUsers,
  FiClipboard,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";

import "../styles/LearningPath.css";

// Module icon mapping with colors
const moduleIcons = {
  "module-0": { icon: FiUsers, color: "#7c5cff", description: "Learn the fundamentals of AlgoBlocks." },
  "module-1": { icon: FiUsers, color: "#6366f1", description: "Understand Big-O notation and complexity analysis." },
  "module-2": { icon: FiDatabase, color: "#22c55e", description: "Master brute force and exhaustive search strategies." },
  "module-3": { icon: FiFilter, color: "#f97316", description: "Learn divide and conquer algorithm design." },
  "module-4": { icon: FiFilter, color: "#a855f7", description: "Explore greedy algorithm strategies." },
  "module-5": { icon: FiShare2, color: "#3b82f6", description: "Master dynamic programming techniques." },
  "module-6": { icon: FiRefreshCw, color: "#ec4899", description: "Solve problems using backtracking." },
};

// Last lesson per module — determines when post-assessment unlocks
const MODULE_LAST_LESSONS = {
  "module-0": "lesson-0-4",
  "module-1": "lesson-1-3",
  "module-2": "lesson-2-3",
  "module-3": "lesson-3-4",
  "module-4": "lesson-4-3",
  "module-5": "lesson-5-4",
  "module-6": "lesson-6-4",
};

export default function LearningPath() {
  const navigate = useNavigate();
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [assessments, setAssessments] = useState({});

  // 1. Load User Progress & Assessment results from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserProgress(parsed.progress || {});
        setAssessments(parsed.assessments || {});
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // 2. Fetch Lesson JSONs to find activities
  useEffect(() => {
    const fetchLessonsData = async () => {
      const details = {};
      for (const module of curriculumIndex) {
        for (const lesson of module.lessons) {
          try {
            const fetchPath = `/data/curriculum/${module.moduleId}/${lesson.lessonId}.json`;
            const res = await fetch(fetchPath);
            if (res.ok) {
              details[lesson.lessonId] = await res.json();
            }
          } catch (e) {
            console.error(`Failed to fetch lesson data for ${lesson.lessonId}`, e);
          }
        }
      }
      setLessonDetails(details);
    };
    fetchLessonsData();
  }, []);

  const toggleModule = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const handleModuleClick = (moduleId, lessonId) => {
    navigate(`/learning-path/${moduleId}/${lessonId}`);
  };

  // ── Assessment helpers ────────────────────────────────────────────────────

  /** True if the user has completed the pre-assessment for this module */
  const hasPreAssessment = (moduleId) => {
    const key = `${moduleId}_pre_assessment`;
    return assessments[key] !== undefined;
  };

  /** True if the user has completed the post-assessment for this module */
  const hasPostAssessment = (moduleId) => {
    const key = `${moduleId}_post_assessment`;
    return assessments[key] !== undefined;
  };

  /** Score label for display */
  const getAssessmentScore = (moduleId, type) => {
    const key = `${moduleId}_${type}_assessment`;
    return assessments[key]?.score ?? null;
  };

  /**
   * True if all lessons in the module are completed — this gates the post-assessment.
   * A lesson is "complete" if it has no activity (just reading counts), or its activity progress >= 1.
   */
  const isModuleComplete = (moduleId) => {
    const module = curriculumIndex.find((m) => m.moduleId === moduleId);
    if (!module) return false;
    return module.lessons.every((lesson) => {
      const details = lessonDetails[lesson.lessonId];
      const firstActivityId = details?.activities?.[0]?.id;
      if (!firstActivityId) return true; // Reading-only lesson always counts as complete
      return (userProgress[lesson.lessonId] || 0) >= 1;
    });
  };

  // ── Lesson lock computation ────────────────────────────────────────────────
  // A lesson is locked if:
  //   (a) The module's pre-assessment hasn't been taken yet, OR
  //   (b) The previous lesson had an activity and hasn't been passed
  const buildLockMap = () => {
    const lockMap = {};

    for (const module of curriculumIndex) {
      const preComplete = hasPreAssessment(module.moduleId);
      let isNextLocked = !preComplete; // ALL lessons locked until pre-assessment is done

      for (const lesson of module.lessons) {
        lockMap[lesson.lessonId] = isNextLocked;

        if (!isNextLocked) {
          // Activity-based gate (only after pre is done)
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
            and interactive learning experiences.
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

            return (
              <div key={module.moduleId}>
                <div
                  className="module-card-v2"
                  onClick={() => toggleModule(module.moduleId)}
                >
                  <div
                    className="module-card-icon"
                    style={{ backgroundColor: `${iconConfig?.color}15` }}
                  >
                    <IconComponent size={32} color={iconConfig?.color} />
                  </div>

                  <div className="module-card-content">
                    <div className="module-card-header">
                      <div>
                        <h3 className="module-card-title">
                          Module {moduleNum}: {module.title}
                        </h3>
                        <p className="module-card-description">
                          {iconConfig?.description || module.title}
                        </p>
                      </div>
                      <FiChevronDown
                        size={24}
                        color="#7c5cff"
                        className={`module-card-chevron ${isExpanded ? "expanded" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="module-lessons-dropdown">

                    {/* ── PRE-ASSESSMENT ROW ─────────────────────────────── */}
                    <div className={`assessment-row pre ${preComplete ? "done" : "pending"}`}>
                      <div className="assessment-row-left">
                        <FiClipboard size={16} />
                        <span className="assessment-row-label">Pre-Assessment</span>
                        {preScore !== null && (
                          <span className="assessment-score-badge">{preScore}%</span>
                        )}
                      </div>
                      <div className="assessment-row-right">
                        {preComplete ? (
                          <>
                            <FiCheckCircle color="#22c55e" size={16} />
                            <button
                              className="btn-assessment retake"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/assessment/${module.moduleId}/pre`);
                              }}
                            >
                              Retake
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-assessment start"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/assessment/${module.moduleId}/pre`);
                            }}
                          >
                            Take Pre-Assessment
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── LESSON ROWS ────────────────────────────────────── */}
                    {module.lessons.map((lesson) => {
                      const details = lessonDetails[lesson.lessonId];
                      const firstActivityId = details?.activities?.[0]?.id;
                      const prog = userProgress[lesson.lessonId] || 0;
                      const lessonDisplay = lesson.lessonId
                        .replace("lesson-", "")
                        .replace(/-/g, ".");
                      const isLocked = lockMap[lesson.lessonId];

                      return (
                        <div
                          key={lesson.lessonId}
                          className={`dropdown-lesson-item ${isLocked ? "locked" : ""}`}
                        >
                          <div className="lesson-info">
                            <span className="lesson-number">{lessonDisplay}</span>
                            <span className="lesson-title">{lesson.title}</span>
                          </div>

                          <div className="lesson-actions">
                            <button
                              className="btn-read-lesson"
                              disabled={isLocked}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked)
                                  navigate(
                                    `/learning-path/${module.moduleId}/${lesson.lessonId}`
                                  );
                              }}
                            >
                              Read Lesson
                            </button>

                            <button
                              className={`btn-start-activity ${!firstActivityId ? "disabled" : ""}`}
                              disabled={isLocked || !firstActivityId}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked && firstActivityId) {
                                  navigate(
                                    `/activity/${module.moduleId}/${firstActivityId}`
                                  );
                                }
                              }}
                            >
                              {firstActivityId ? "Start Activity" : "No Activity"}
                            </button>
                          </div>

                          <span className="lesson-status-icon">
                            {isLocked ? (
                              <FiLock color="#bdbdbd" />
                            ) : prog >= 1 ? (
                              <FiCheckCircle color="#22c55e" />
                            ) : (
                              <FiCircle color="#7c5cff" />
                            )}
                          </span>
                        </div>
                      );
                    })}

                    {/* ── POST-ASSESSMENT ROW ────────────────────────────── */}
                    <div
                      className={`assessment-row post ${
                        postComplete ? "done" : moduleComplete ? "pending" : "locked"
                      }`}
                    >
                      <div className="assessment-row-left">
                        <FiClipboard size={16} />
                        <span className="assessment-row-label">Post-Assessment</span>
                        {postScore !== null && (
                          <span className="assessment-score-badge post">{postScore}%</span>
                        )}
                        {!moduleComplete && !postComplete && (
                          <span className="assessment-gate-note">
                            (Complete all lessons first)
                          </span>
                        )}
                      </div>
                      <div className="assessment-row-right">
                        {!moduleComplete && !postComplete ? (
                          <FiLock color="#bdbdbd" size={16} />
                        ) : postComplete ? (
                          <>
                            <FiCheckCircle color="#22c55e" size={16} />
                            <button
                              className="btn-assessment retake"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/assessment/${module.moduleId}/post`);
                              }}
                            >
                              Retake
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
                            Take Post-Assessment
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="module-dropdown-footer">
                      <button
                        className="view-all-lessons"
                        onClick={(e) => {
                          e.stopPropagation();
                          const first = module.lessons[0]?.lessonId;
                          if (first && !lockMap[first]) {
                            handleModuleClick(module.moduleId, first);
                          }
                        }}
                      >
                        View all lessons in this module
                        <FiChevronRight />
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
