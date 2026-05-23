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
  FiUsers
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

  // Toggle expansion state for a module.
  // Uses a new Set instance each time to avoid mutating React state directly.
  const toggleModule = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const [userProgress, setUserProgress] = useState({});

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

  // Navigate to a lesson; `lessonId` follows the `lesson-<module>-<index>` format.
  const handleModuleClick = (moduleId, lessonId) => {
    navigate(`/learning-path/${moduleId}/${lessonId}`);
  };

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
                      const prog = userProgress[lesson.lessonId] || 0;
                      const lessonDisplay = lesson.lessonId.replace("lesson-", "").replace(/-/g, ".");
                      return (
                        <button
                          key={lesson.lessonId}
                          className="dropdown-lesson-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModuleClick(module.moduleId, lesson.lessonId);
                          }}
                        >
                          <span className="lesson-number">{lessonDisplay}</span>
                          <span className="lesson-title">{lesson.title}</span>
                          <span className="lesson-status-icon">
                            {prog >= 1 ? (
                              <FiCheckCircle color="#22c55e" />
                            ) : prog > 0 ? (
                              <FiCircle color="#7c5cff" />
                            ) : (
                              <FiLock color="#bdbdbd" />
                            )}
                          </span>
                        </button>
                      );
                    })}

                    <div className="module-dropdown-footer">
                      {/* Footer row: behaves like a lesson row to maintain visual rhythm and accessibility */}
                      <button
                        className="view-all-lessons"
                        onClick={(e) => {
                          e.stopPropagation();
                          const first = module.lessons[0] && module.lessons[0].lessonId;
                          if (first) handleModuleClick(module.moduleId, first);
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