// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LearningPath.css";

export default function LearningPath() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [expandedTopic, setExpandedTopic] = useState(null);

  useEffect(() => {
    setModules(curriculumIndex);
    // Auto-expand the first module
    if (curriculumIndex.length > 0) {
      setExpandedTopic(curriculumIndex[0].moduleId);
    }
  }, []);

  const toggleTopic = (moduleId) => {
    setExpandedTopic((prev) => (prev === moduleId ? null : moduleId));
  };

  const handleLessonClick = (lessonPath) => {
    navigate(`/lesson-viewer?path=${encodeURIComponent(lessonPath)}`);
  };

  return (
    <div className="learning-path-page">
      <DashboardHeader />
      <div className="learning-path-content">
        <div className="learning-path-header-section">
          <h1>Learning Path</h1>
          <p>Master Data Structures and Algorithms with interactive line-by-line block tracing.</p>
        </div>
        
        <div className="modules-container">
          {modules.map((mod) => {
            const isExpanded = expandedTopic === mod.moduleId;
            return (
              <div key={mod.moduleId} className={`module-card ${isExpanded ? "expanded" : ""}`}>
                <div className="module-header" onClick={() => toggleTopic(mod.moduleId)}>
                  <div className="module-info">
                    <h2>{mod.title}</h2>
                    <span className="lesson-count">{mod.lessons.length} Lessons</span>
                  </div>
                  <div className="expand-indicator">
                    {isExpanded ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="lesson-list">
                    {mod.lessons.map((lesson, index) => (
                      <div 
                        key={lesson.lessonId} 
                        className="lesson-item"
                        onClick={() => handleLessonClick(lesson.path)}
                      >
                        <div className="lesson-details">
                          <span className="lesson-number">{index + 1}</span>
                          <span className="lesson-title">{lesson.title}</span>
                        </div>
                        <button className="start-btn">Start Lesson</button>
                      </div>
                    ))}
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