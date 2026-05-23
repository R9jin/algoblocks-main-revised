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

export default function LearningPath() {
  const navigate = useNavigate();
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});

  // 1. Load User Progress
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserProgress(parsed.progress || {});
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

  // Toggle expansion state for a module.
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

  // 3. Compute Lesson Locks
  // A lesson is locked if the previous lesson HAS an activity, and the user hasn't passed it.
  let isNextLocked = false;
  const lockMap = {};

  curriculumIndex.forEach(module => {
    module.lessons.forEach(lesson => {
      lockMap[lesson.lessonId] = isNextLocked;

      const details = lessonDetails[lesson.lessonId];
      const firstActivityId = details?.activities?.[0]?.id;
      const prog = userProgress[lesson.lessonId] || 0;

      // If the lesson has an activity and progress is < 1, lock the next lessons.
      if (firstActivityId && prog < 1) {
        isNextLocked = true;
      }
    });
  });

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

            return (
              <div key={module.moduleId}>
                <div
                  className="module-card-v2"
                  onClick={() => toggleModule(module.moduleId)}
                >
                  <div className="module-card-icon" style={{ backgroundColor: `${iconConfig?.color}15` }}>
                    <IconComponent size={32} color={iconConfig?.color} />
                  </div>

                  <div className="module-card-content">
                    <div className="module-card-header">
                      <div>
                        <h3 className="module-card-title">Module {moduleNum}: {module.title}</h3>
                        <p className="module-card-description">
                          {iconConfig?.description || module.title}
                        </p>
                      </div>
                      <FiChevronDown
                        size={24}
                        color="#7c5cff"
                        className={`module-card-chevron ${isExpanded ? 'expanded' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="module-lessons-dropdown">
                    {module.lessons.map((lesson) => {
                      const details = lessonDetails[lesson.lessonId];
                      const firstActivityId = details?.activities?.[0]?.id;
                      const prog = userProgress[lesson.lessonId] || 0;
                      const lessonDisplay = lesson.lessonId.replace("lesson-", "").replace(/-/g, ".");
                      const isLocked = lockMap[lesson.lessonId];

                      return (
                        <div key={lesson.lessonId} className={`dropdown-lesson-item ${isLocked ? 'locked' : ''}`}>
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
                                if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lesson.lessonId}`);
                              }}
                            >
                              Read Lesson
                            </button>

                            <button
                              className={`btn-start-activity ${!firstActivityId ? 'disabled' : ''}`}
                              disabled={isLocked || !firstActivityId}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked && firstActivityId) {
                                  navigate(`/activity/${module.moduleId}/${firstActivityId}`);
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

                    <div className="module-dropdown-footer">
                      <button
                        className="view-all-lessons"
                        onClick={(e) => {
                          e.stopPropagation();
                          const first = module.lessons[0] && module.lessons[0].lessonId;
                          if (first && !lockMap[first]) handleModuleClick(module.moduleId, first);
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