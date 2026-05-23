// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import { FiChevronDown, FiCircle, FiDatabase, FiFilter, FiRefreshCw, FiShare2, FiUsers } from "react-icons/fi";
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

  // Load user progress
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

  // Pre-fetch the lesson JSONs using the correct /data/ path
  useEffect(() => {
    const fetchLessonsData = async () => {
      const details = {};
      for (const module of curriculumIndex) {
        for (const lesson of module.lessons) {
          try {
            // Force the correct path to point to the public/data/curriculum folder
            const fetchPath = `/data/curriculum/${module.moduleId}/${lesson.lessonId}.json`;
            const res = await fetch(fetchPath);
            
            if (res.ok) {
              details[lesson.lessonId] = await res.json();
            } else {
              console.error(`Failed to fetch: ${fetchPath} - Status: ${res.status}`);
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

  return (
    <div className="learning-path-page">
      <DashboardHeader />
      <div className="learning-path-container">
        
        <div className="learning-path-header">
          <h1>Learning Path</h1>
          <p>Follow this step-by-step curriculum to master algorithms.</p>
        </div>
        
        <div className="modules-container">
          {curriculumIndex.map((module, index) => {
            const isExpanded = expandedModules.has(module.moduleId);
            const iconData = moduleIcons[module.moduleId] || { icon: FiCircle, color: "#7c5cff", description: "Explore this module." };
            const IconComponent = iconData.icon;

            return (
              <div key={module.moduleId} className="module-group">
                <div className="module-card-v2" onClick={() => toggleModule(module.moduleId)}>
                  <div className="module-card-icon" style={{ backgroundColor: `${iconData.color}15`, color: iconData.color }}>
                    <IconComponent size={28} />
                  </div>
                  <div className="module-card-content">
                    <h3 className="module-card-title">{module.title}</h3>
                    <p className="module-card-description">{iconData.description}</p>
                  </div>
                  <div className={`module-card-chevron ${isExpanded ? 'expanded' : ''}`}>
                    <FiChevronDown size={24} color="#7c5cff" />
                  </div>
                </div>

                {isExpanded && (
                  <div className="module-lessons-dropdown">
                    {module.lessons.map((lesson, idx) => {
                      const details = lessonDetails[lesson.lessonId];
                      
                      // Correctly access the first activity id from the JSON array
                      const firstActivityId = details?.activities?.[0]?.id;

                      return (
                        <div key={lesson.lessonId} className="dropdown-lesson-item">
                          <div className="lesson-number">{index + 1}.{idx + 1}</div>
                          <div className="lesson-title">{lesson.title}</div>
                          
                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              style={{
                                padding: '6px 14px',
                                background: '#f0e8ff',
                                color: '#7c5cff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => e.target.style.background = '#e0d4ff'}
                              onMouseOut={(e) => e.target.style.background = '#f0e8ff'}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/learning-path/${module.moduleId}/${lesson.lessonId}`);
                              }}
                            >
                              Read Lesson
                            </button>

                            <button
                              disabled={!firstActivityId}
                              style={{
                                padding: '6px 14px',
                                background: firstActivityId ? '#7c5cff' : '#e2e8f0',
                                color: firstActivityId ? '#ffffff' : '#94a3b8',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: firstActivityId ? 'pointer' : 'not-allowed',
                                fontWeight: '600',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => {
                                if(firstActivityId) e.target.style.background = '#6248d4';
                              }}
                              onMouseOut={(e) => {
                                if(firstActivityId) e.target.style.background = '#7c5cff';
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (firstActivityId) {
                                  navigate(`/activity/${module.moduleId}/${firstActivityId}`);
                                }
                              }}
                            >
                              {firstActivityId ? "Start Activities" : "No Activities"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
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