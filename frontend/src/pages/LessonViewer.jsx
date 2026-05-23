import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LessonViewer.css";

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  // Keep the current module expanded in the sidebar by default.
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));

  useEffect(() => {
    // Load lesson JSON metadata for the selected module and lesson.
    // This is a client-side fetch to the `path` declared in `curriculumIndex`.
    // The fetch is intentionally simple to avoid introducing complex error UI
    // in this viewer; errors are logged and a 'Lesson not found' message is shown.
    const loadLesson = async () => {
      try {
        const module = curriculumIndex.find((m) => m.moduleId === moduleId);
        if (!module) {
          setLoading(false);
          return;
        }

        const lessonMeta = module.lessons.find((l) => l.lessonId === lessonId);
        if (!lessonMeta) {
          setLoading(false);
          return;
        }

        const response = await fetch(lessonMeta.path);
        const data = await response.json();
        setLesson(data);
      } catch (error) {
        console.error("Failed to load lesson:", error);
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
      // toggleModule: update sidebar expansion state using a new Set each time
      newExpanded.add(mId);
    }
    setExpandedModules(newExpanded);
  };

  if (loading) {
    return <div className="lesson-loading">Loading lesson...</div>;
  }

  if (!lesson) {
    return <div className="lesson-loading">Lesson not found.</div>;
  }

  const currentModule = curriculumIndex.find((m) => m.moduleId === moduleId);
  const currentLessonIndex = currentModule?.lessons.findIndex(
    (l) => l.lessonId === lessonId
  );
  
  // Extract module and lesson numbers
  const moduleNum = moduleId.split("-").pop();
  const lessonNum = lessonId.split("-").pop();

  return (
    <div className="lesson-viewer-wrapper">
      {/* Left Sidebar with Modules Navigation */}
      <aside className="lesson-modules-sidebar">
        {/* Back to Dashboard */}
        <div className="sidebar-header">
          <button
            className="back-button"
            onClick={() => navigate("/learning-path")}
          >
            <FiChevronLeft /> Back to Dashboard
          </button>
        </div>

        <div className="modules-header">
          <h3>Modules</h3>
        </div>

        <nav className="modules-nav">
          {curriculumIndex.map((module, modIdx) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);

            return (
              <div key={module.moduleId} className="module-group">
                <button
                  className={`module-title ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleModule(module.moduleId)}
                >
                  <span className="module-info">
                    <span className="module-icon">📚</span>
                    <span>
                      <span className="module-number">Module {modNumber}</span>
                      <span className="module-name">{module.title}</span>
                    </span>
                  </span>
                  <span className="expand-icon">▼</span>
                </button>

                {isExpanded && (
                  <div className="lessons-list">
                    {module.lessons.map((lessonItem, lesIdx) => {
                      const lesNumber = lessonItem.lessonId.split("-").pop();
                      const isActive = lessonId === lessonItem.lessonId;

                      return (
                        <a
                          key={lessonItem.lessonId}
                          href={`/learning-path/${module.moduleId}/${lessonItem.lessonId}`}
                          className={`lesson-item ${isActive ? "active" : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(
                              `/learning-path/${module.moduleId}/${lessonItem.lessonId}`
                            );
                          }}
                        >
                          <span className="lesson-number">
                            {modNumber}.{lesNumber}
                          </span>
                          <span className="lesson-title">
                            {lessonItem.title}
                          </span>
                          <span className="lesson-indicator">
                            {isActive ? "●" : "○"}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="lesson-viewer-container">
        <div className="lesson-top-nav">
          <div className="breadcrumb">
            <a href="/learning-path">Learning Path</a>
            <FiChevronRight className="breadcrumb-icon" />
            <span>Module {moduleNum}: {currentModule?.title}</span>
            <FiChevronRight className="breadcrumb-icon" />
            <span className="breadcrumb-current">
              Lesson {moduleNum}.{lessonNum}: {lesson.title}
            </span>
          </div>
        </div>

        <div className="lesson-content-wrapper">
          <div className="lesson-header">
            <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
            <h1>{lesson.title}</h1>
            <p>{lesson.description}</p>
            <div className="lesson-meta-grid">
              <div className="lesson-meta-card">
                <div className="meta-icon">⏱️</div>
                <span>Estimated Time</span>
                <strong>{lesson.estimatedTime}</strong>
              </div>
              <div className="lesson-meta-card">
                <div className="meta-icon">📊</div>
                <span>Difficulty</span>
                <strong>{lesson.difficulty}</strong>
              </div>
              <div className="lesson-meta-card">
                <div className="meta-icon">🎯</div>
                <span>Prerequisites</span>
                <strong>{lesson.prerequisites}</strong>
              </div>
            </div>
          </div>

          {lesson.sections?.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={`lesson-section ${section.type}`}
            >
              <h2>{section.title}</h2>
              <div className="lesson-section-content">
                {section.content
                  .split("\\n\\n")
                  .map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
              </div>
            </section>
          ))}

          {lesson.references?.length > 0 && (
            <div className="lesson-resources">
              <h2>References</h2>
              <ul>
                {lesson.references?.map((reference, index) => (
                  <li key={index}>
                    <a href={reference.url} target="_blank" rel="noreferrer">
                      {reference.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}