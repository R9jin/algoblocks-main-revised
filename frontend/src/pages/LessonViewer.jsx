import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiCircle,
  FiClock,
  FiTarget,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import BigOChart from "../components/BigOChart";
import CodeSnippet from "../components/CodeSnippet";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LessonViewer.css";

function renderParagraphs(content, className = "lesson-section-content") {
  if (!content) {
    return null;
  }

  return (
    <div className={className}>
      {content.split("\n\n").map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function renderBullets(items) {
  if (!items?.length) {
    return null;
  }

  return (
    <ul className="lesson-bullet-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function renderCodeSnippets(snippets) {
  if (!snippets?.length) {
    return null;
  }

  return (
    <div className="lesson-code-snippets">
      {snippets.map((snippet, index) => (
        <CodeSnippet key={`${snippet.title || "snippet"}-${index}`} snippet={snippet} />
      ))}
    </div>
  );
}

function renderChart(chart) {
  if (!chart) {
    return null;
  }

  return (
    <figure className="lesson-chart-panel">
      {(chart.title || chart.description) && (
        <figcaption>
          {chart.title && <strong>{chart.title}</strong>}
          {chart.description && <span>{chart.description}</span>}
        </figcaption>
      )}
      <BigOChart
        maxN={chart.maxN}
        curves={chart.curves}
        normalize={chart.normalize}
      />
    </figure>
  );
}

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));

  useEffect(() => {
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

        const fetchPath = `/data/curriculum/${moduleId}/${lessonId}.json`;
        const response = await fetch(fetchPath);

        if (!response.ok) {
          throw new Error(`Failed to fetch lesson: ${response.status}`);
        }

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
  const moduleNum = moduleId.split("-").pop();
  const lessonNum = lessonId.split("-").pop();

  return (
    <div className="lesson-viewer-wrapper">
      <aside className="lesson-modules-sidebar">
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
          {curriculumIndex.map((module) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);

            return (
              <div key={module.moduleId} className="module-group">
                <button
                  className={`module-title ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleModule(module.moduleId)}
                >
                  <span className="module-info">
                    <FiBookOpen className="module-icon" />
                    <span>
                      <span className="module-number">Module {modNumber}</span>
                      <span className="module-name">{module.title}</span>
                    </span>
                  </span>
                  <span className="expand-icon">v</span>
                </button>

                {isExpanded && (
                  <div className="lessons-list">
                    {module.lessons.map((lessonItem) => {
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
                            <FiCircle aria-hidden="true" />
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

      <main className="lesson-viewer-container">
        <div className="lesson-top-nav">
          <div className="breadcrumb">
            <a href="/learning-path">Learning Path</a>
            <FiChevronRight className="breadcrumb-icon" />
            <span>
              Module {moduleNum}: {currentModule?.title}
            </span>
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
                <FiClock className="meta-icon" />
                <span>Estimated Time</span>
                <strong>{lesson.estimatedTime}</strong>
              </div>
              <div className="lesson-meta-card">
                <FiBarChart2 className="meta-icon" />
                <span>Difficulty</span>
                <strong>{lesson.difficulty}</strong>
              </div>
              <div className="lesson-meta-card">
                <FiTarget className="meta-icon" />
                <span>Prerequisites</span>
                <strong>{lesson.prerequisites}</strong>
              </div>
            </div>
          </div>

          <article className="lesson-article">
            {lesson.sections?.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className={`lesson-section ${section.type}`}
              >
                <h2>{section.title}</h2>
                {renderParagraphs(section.content)}
                {renderBullets(section.bullets)}
                {renderChart(section.chart)}
                {renderCodeSnippets(section.codeSnippets)}
                {section.subsections?.map((subsection) => (
                  <div
                    key={subsection.id || subsection.title}
                    className="lesson-subsection"
                  >
                    <h3>{subsection.title}</h3>
                    {renderParagraphs(
                      subsection.content,
                      "lesson-subsection-content"
                    )}
                    {renderBullets(subsection.bullets)}
                    {renderChart(subsection.chart)}
                    {renderCodeSnippets(subsection.codeSnippets)}
                  </div>
                ))}
              </section>
            ))}
          </article>

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
