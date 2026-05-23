// frontend/src/pages/LessonViewer.jsx
import { useEffect, useState } from "react";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LessonViewer.css";

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Keep the current module expanded in the sidebar by default
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));

  useEffect(() => {
    const loadLesson = async () => {
      try {
        setLoading(true);
        const module = curriculumIndex.find((m) => m.moduleId === moduleId);
        if (!module) {
          setLoading(false);
          return;
        }

        // Force the correct path to point to the public/data/curriculum folder
        const fetchPath = `/data/curriculum/${moduleId}/${lessonId}.json`;
        const res = await fetch(fetchPath);
        
        if (res.ok) {
          const data = await res.json();
          setLesson(data);
        } else {
          console.error(`Failed to fetch lesson data from: ${fetchPath}`);
          setLesson(null);
        }
      } catch (e) {
        console.error("Error loading lesson:", e);
        setLesson(null);
      } finally {
        setLoading(false);
      }
    };

    loadLesson();
  }, [moduleId, lessonId]);

  const toggleModule = (mId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(mId)) {
      newExpanded.delete(mId);
    } else {
      newExpanded.add(mId);
    }
    setExpandedModules(newExpanded);
  };

  const currentModule = curriculumIndex.find((m) => m.moduleId === moduleId);
  
  // Extract module and lesson numbers from the IDs
  const moduleNum = moduleId?.split("-").pop() || "0";
  const lessonNum = lessonId?.split("-").pop() || "0";

  return (
    <div className="lesson-viewer-wrapper">
      {/* Left Sidebar with Modules Navigation */}
      <div className="lesson-modules-sidebar">
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate("/learning-path")}>
            <FiChevronLeft /> Back to Dashboard
          </button>
        </div>
        
        <div className="modules-header">
          <h3>Curriculum</h3>
        </div>
        
        <div className="modules-nav">
          {curriculumIndex.map((m, mIdx) => {
            const isExpanded = expandedModules.has(m.moduleId);
            return (
              <div key={m.moduleId} className="module-group">
                <button
                  className={`module-title ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleModule(m.moduleId)}
                >
                  <div className="module-info">
                    <span className="module-number">M{mIdx}</span>
                    <span className="module-name">{m.title}</span>
                  </div>
                  <FiChevronDown className="expand-icon" />
                </button>
                
                {isExpanded && (
                  <div className="lessons-list">
                    {m.lessons.map((l, lIdx) => {
                      const isActive = l.lessonId === lessonId;
                      return (
                        <button
                          key={l.lessonId}
                          className={`lesson-item ${isActive ? "active" : ""}`}
                          onClick={() => navigate(`/learning-path/${m.moduleId}/${l.lessonId}`)}
                        >
                          <span className="lesson-number">{mIdx}.{lIdx + 1}</span>
                          <span className="lesson-title">{l.title}</span>
                          {isActive && <FiChevronRight className="lesson-indicator" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lesson-viewer-container">
        <div className="lesson-top-nav">
          <div className="breadcrumb">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate("/learning-path"); }}>Learning Path</a>
            <FiChevronRight className="breadcrumb-icon" />
            <span className="breadcrumb-current">Module {moduleNum}: {currentModule?.title}</span>
          </div>
        </div>

        {/* 
            FIX: The loading check now ONLY hides the content, not the whole screen.
            This completely eliminates the flickering sidebar.
        */}
        {loading ? (
          <div className="lesson-loading">Loading lesson...</div>
        ) : !lesson ? (
          <div className="lesson-loading">Lesson not found.</div>
        ) : (
          <div className="lesson-content-wrapper">
            <div className="lesson-header">
              <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
              <h1>{lesson.title}</h1>
              <p>{lesson.description}</p>
              <div className="lesson-meta-grid">
                <div className="lesson-meta-card">
                  <span>Difficulty</span>
                  <strong>{lesson.difficulty}</strong>
                </div>
                <div className="lesson-meta-card">
                  <span>Estimated Time</span>
                  <strong>{lesson.estimatedTime}</strong>
                </div>
              </div>
            </div>

            {lesson.sections?.map((section, idx) => (
              <div key={idx} className={`lesson-section ${section.type}`}>
                <h2>{section.title}</h2>
                <div className="lesson-section-content">
                  <p style={{ whiteSpace: "pre-line" }}>{section.content}</p>
                </div>
              </div>
            ))}

            {lesson.references && lesson.references.length > 0 && (
              <div className="lesson-resources">
                <h2>Additional Resources</h2>
                <ul>
                  {lesson.references.map((ref, idx) => (
                    <li key={idx}>
                      <a href={ref.url} target="_blank" rel="noopener noreferrer">
                        {ref.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}