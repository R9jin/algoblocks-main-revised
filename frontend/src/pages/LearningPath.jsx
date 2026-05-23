// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LearningPath.css";

export default function LearningPath() {
  const navigate = useNavigate();

  // State to hold our curriculum modules
  const [modules, setModules] = useState([]);
  
  // State to track which module's accordion is currently open
  const [expandedTopic, setExpandedTopic] = useState(null);

  useEffect(() => {
    // Load the curriculum index into state when the component mounts
    setModules(curriculumIndex);
  }, []);

  // Toggles the accordion open/closed for a specific module
  const toggleTopic = (moduleId) => {
    setExpandedTopic((prevTopic) => (prevTopic === moduleId ? null : moduleId));
  };

  // Handles clicking on a specific lesson
  const handleLessonClick = (lessonPath) => {
    // Navigate to the LessonViewer, passing the JSON path as a URL parameter
    navigate(`/lesson-viewer?path=${encodeURIComponent(lessonPath)}`);
  };

  return (
    <div className="learning-path-layout">
      <DashboardHeader />
      
      <div className="learning-path-container">
        <h1>Learning Path</h1>
        <p className="learning-path-subtitle">
          Select a module below to start your journey into algorithms and data structures.
        </p>
        
        {modules.length === 0 ? (
          <div className="loading-container">
            <p>Loading modules...</p>
          </div>
        ) : (
          <div className="modules-list">
            {modules.map((mod) => (
              <div key={mod.moduleId} className={`module-card ${expandedTopic === mod.moduleId ? 'expanded' : ''}`}>
                <div 
                  className="module-header" 
                  onClick={() => toggleTopic(mod.moduleId)}
                >
                  <div className="module-title-group">
                    <h2>{mod.title}</h2>
                    <span className="lesson-count">
                      {mod.lessons.length} {mod.lessons.length === 1 ? 'Lesson' : 'Lessons'}
                    </span>
                  </div>
                  <span className="expand-icon">
                    {expandedTopic === mod.moduleId ? "▼" : "▶"}
                  </span>
                </div>
                
                {expandedTopic === mod.moduleId && (
                  <div className="lesson-list-container">
                    <ul className="lesson-list">
                      {mod.lessons.map((lesson, index) => (
                        <li 
                          key={lesson.lessonId} 
                          className="lesson-item"
                          onClick={() => handleLessonClick(lesson.path)}
                        >
                          <div className="lesson-item-content">
                            <span className="lesson-number">{index + 1}.</span>
                            <span className="lesson-title">{lesson.title}</span>
                          </div>
                          <button className="start-lesson-btn">Start</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}