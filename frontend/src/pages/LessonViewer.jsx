// frontend/src/pages/LessonViewer.jsx
import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBookOpen,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCircle,
  FiClipboard,
  FiClock,
  FiLock,
  FiTarget,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import BigOChart from "../components/BigOChart";
import CodeSnippet from "../components/CodeSnippet";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, curriculumCacheDB, progressDB } from "../db";
import "../styles/LessonViewer.css";

function formatText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderParagraphs(content, className = "lesson-section-content") {
  if (!content) return null;

  return (
    <div className={className}>
      {content.split("\n\n").map((paragraph, index) => {
        const lines = paragraph.split("\n");

        const hasBullets = lines.some(
          (line) => line.trim().startsWith("* ") || line.trim().startsWith("- "),
        );

        if (!hasBullets) {
          return (
            <p key={index}>
              {lines.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {formatText(line)}
                  {lineIndex !== lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          );
        }

        const elements = [];
        let currentList = [];

        lines.forEach((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
            currentList.push(
              <li key={`li-${i}`}>
                {formatText(trimmed.substring(2).trim())}
              </li>,
            );
          } else {
            if (currentList.length > 0) {
              elements.push(
                <ul key={`ul-${i}`} className="lesson-bullet-list">
                  {currentList}
                </ul>,
              );
              currentList = [];
            }
            elements.push(
              <span key={`span-${i}`}>
                {formatText(line)}
                <br />
              </span>,
            );
          }
        });

        if (currentList.length > 0) {
          elements.push(
            <ul key="ul-end" className="lesson-bullet-list">
              {currentList}
            </ul>,
          );
        }

        return (
          <div key={index} style={{ marginBottom: "1em" }}>
            {elements}
          </div>
        );
      })}
    </div>
  );
}

function renderBullets(items) {
  if (!items?.length) return null;
  return (
    <ul className="lesson-bullet-list">
      {items.map((item, index) => (
        <li key={index}>
          {item.split("\n\n").map((paragraph, pIndex, pArray) => (
            <div key={pIndex} style={{ marginBottom: pIndex !== pArray.length - 1 ? "0.5em" : "0" }}>
              {paragraph.split("\n").map((line, lIndex, lArray) => (
                <span key={lIndex}>
                  {formatText(line)}
                  {lIndex !== lArray.length - 1 && <br />}
                </span>
              ))}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function renderCodeSnippets(snippets) {
  if (!snippets?.length) return null;
  return (
    <div className="lesson-code-snippets">
      {snippets.map((snippet, index) => (
        <CodeSnippet
          key={`${snippet.title || "snippet"}-${index}`}
          snippet={snippet}
        />
      ))}
    </div>
  );
}

function renderChart(chart) {
  if (!chart) return null;
  return (
    <figure className="lesson-chart-panel">
      {(chart.title || chart.description) && (
        <figcaption>
          {chart.title && <strong>{chart.title}</strong>}
          {chart.description && <span>{formatText(chart.description)}</span>}
        </figcaption>
      )}
      <BigOChart maxN={chart.maxN} curves={chart.curves} normalize={chart.normalize} />
    </figure>
  );
}

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [activitiesData, setActivitiesData] = useState({});
  const [assessments, setAssessments] = useState({});

  const storedUser = JSON.parse(
    localStorage.getItem("user") || sessionStorage.getItem("user") || "{}",
  );
  const isAdmin = storedUser.role === "admin" || storedUser.isAdmin === true;

  useEffect(() => {
    const loadOfflineData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        let initialProg = storedUser.progress || {};
        let initialAssm = storedUser.assessments || {};

        await progressDB.iterate((value, key) => {
          initialProg[key] = value.score !== undefined ? value.score : value;
        });
        await assessmentsDB.iterate((value, key) => {
          initialAssm[key] = value;
        });

        setUserProgress(initialProg);
        setAssessments(initialAssm);

        if (navigator.onLine && storedUser.email && !storedUser.isGuest) {
          try {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers });
            if (progRes.ok) {
              const data = await progRes.json();
              const progData = data.progress || data;
              for (const [key, val] of Object.entries(progData)) {
                initialProg[key] = val;
                await progressDB.setItem(key, { score: val, isSynced: true });
              }
            }

            const assRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
            if (assRes.ok) {
              const data = await assRes.json();
              const assData = data.assessments || data;
              for (const [key, val] of Object.entries(assData)) {
                initialAssm[key] = val;
                await assessmentsDB.setItem(key, { ...val, isSynced: true });
              }
            }

            setUserProgress({ ...initialProg });
            setAssessments({ ...initialAssm });

            storedUser.progress = initialProg;
            storedUser.assessments = initialAssm;
            localStorage.setItem("user", JSON.stringify(storedUser));
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
      const fetchPromises = [];

      const fetchWithCache = async (url, type, key) => {
        try {
          const cachedData = await curriculumCacheDB.getItem(url);
          if (cachedData) {
            if (type === 'activity') acts[key] = cachedData;
            if (type === 'lesson') details[key] = cachedData;
            return;
          }

          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            await curriculumCacheDB.setItem(url, data);
            if (type === 'activity') acts[key] = data;
            if (type === 'lesson') details[key] = data;
          }
        } catch (e) {
          console.warn(`Failed to load ${url}`, e);
        }
      };

      for (const module of curriculumIndex) {
        const mid = module.moduleId.split("-").pop();
        
        fetchPromises.push(
          fetchWithCache(`/data/activities/module_${mid}.json`, 'activity', module.moduleId)
        );

        for (const lessonMeta of module.lessons) {
          fetchPromises.push(
            fetchWithCache(`/data/curriculum/${module.moduleId}/${lessonMeta.lessonId}.json`, 'lesson', lessonMeta.lessonId)
          );
        }
      }

      // Parallel fetch for the sidebar mapping
      await Promise.all(fetchPromises);

      setLessonDetails(details);
      setActivitiesData(acts);
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    const loadLesson = async () => {
      setLoading(true);
      try {
        const module = curriculumIndex.find((m) => m.moduleId === moduleId);
        if (!module) return;
        const lessonMeta = module.lessons.find((l) => l.lessonId === lessonId);
        if (!lessonMeta) return;

        const fetchPath = `/data/curriculum/${moduleId}/${lessonId}.json`;
        
        // Optimize actual lesson text load with Cache
        const cachedData = await curriculumCacheDB.getItem(fetchPath);
        if (cachedData) {
          setLesson(cachedData);
          setLoading(false);
          return;
        }

        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`Failed to fetch lesson: ${response.status}`);

        const data = await response.json();
        await curriculumCacheDB.setItem(fetchPath, data); // Save for next time
        setLesson(data);
      } catch (error) {
        console.error("Failed to load lesson:", error);
      } finally {
        setLoading(false);
      }
    };
    loadLesson();
  }, [moduleId, lessonId]);

  const hasPostAssessment = (mId) => assessments[`${mId}_post_assessment`] !== undefined;

  const isModuleComplete = (mId) => {
    const module = curriculumIndex.find((m) => m.moduleId === mId);
    if (!module) return false;
    return module.lessons.every((l) => {
      const details = lessonDetails[l.lessonId];
      const firstActivityId = details?.activities?.[0]?.id;
      if (!firstActivityId) return (userProgress[l.lessonId] || 0) >= 1;
      return (userProgress[l.lessonId] || 0) >= 1; 
    });
  };

  const buildLockMap = () => {
    const lockMap = {};
    const isGlobalPreTestDone = assessments["course-pre-test_pre_assessment"] !== undefined;
    let isNextLocked = isAdmin ? false : !isGlobalPreTestDone;

    for (const module of curriculumIndex) {
      for (const l of module.lessons) {
        lockMap[l.lessonId] = isAdmin ? false : isNextLocked;
        if (!isNextLocked) {
          const details = lessonDetails[l.lessonId];
          const firstActivityId = details?.activities?.[0]?.id;
          const prog = userProgress[l.lessonId] || 0;
          if (prog < 1) {
            isNextLocked = true;
          }
        }
      }
      const postComplete = hasPostAssessment(module.moduleId);
      if (!postComplete && !isAdmin) isNextLocked = true;
    }
    return lockMap;
  };

  const lockMap = buildLockMap();
  const isCurrentLessonLocked = lockMap[lessonId];

  const toggleModule = (mId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(mId)) newExpanded.delete(mId);
    else newExpanded.add(mId);
    setExpandedModules(newExpanded);
  };

  const currentModule = curriculumIndex.find((m) => m.moduleId === moduleId);
  const moduleNum = moduleId?.split("-").pop();
  const lessonNum = lessonId?.split("-").pop();
  const currentActivityId = lesson?.activities?.[0]?.id;

  if (Object.keys(lessonDetails).length === 0) {
    return <div className="lesson-loading">Loading curriculum data...</div>;
  }

  return (
    <div className="lesson-viewer-wrapper">
      <aside className={`lesson-modules-sidebar ${!isSidebarVisible ? "hidden" : ""}`}>
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate("/learning-path")}>
            <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Dashboard
          </button>
        </div>
        <div className="modules-header">
          <h3>Curriculum</h3>
        </div>
        <nav className="modules-nav">
          {curriculumIndex.map((module) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);
            const modComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);

            const optimizations = activitiesData[module.moduleId]?.optimizations || [];
            const hasOptimizations = optimizations.length > 0;
            const lastLessonId = module.lessons[module.lessons.length - 1]?.lessonId;

            const optimizationsLocked = isAdmin ? false : lockMap[lastLessonId] || (userProgress[lastLessonId] || 0) < 1;
            const postAssessmentUnlocked = isAdmin || modComplete || postComplete;

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
                      <span className="module-name" style={{ fontSize: "0.85rem" }}>{module.title}</span>
                    </span>
                  </span>
                  <span className="expand-icon">v</span>
                </button>

                {isExpanded && (
                  <div className="lessons-list" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 0" }}>
                    
                    {module.lessons.map((lessonItem) => {
                      const lesNumber = lessonItem.lessonId.split("-").pop();
                      const isActive = lessonId === lessonItem.lessonId;
                      const isLocked = lockMap[lessonItem.lessonId];
                      const prog = userProgress[lessonItem.lessonId] || 0;

                      return (
                        <a
                          key={lessonItem.lessonId}
                          href={`/learning-path/${module.moduleId}/${lessonItem.lessonId}`}
                          className={`lesson-item ${isActive ? "active" : ""}`}
                          style={{
                            opacity: isLocked ? 0.5 : 1,
                            pointerEvents: isLocked ? "none" : "auto",
                            paddingLeft: "45px",
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lessonItem.lessonId}`);
                          }}
                        >
                          <span className="lesson-number">{modNumber}.{lesNumber}</span>
                          <span className="lesson-title">{lessonItem.title}</span>
                          <span className="lesson-indicator">
                            {isLocked ? <FiLock size={12} /> : prog >= 1 ? <FiCheckCircle size={12} color="#22c55e" /> : isActive ? "●" : "○"}
                          </span>
                        </a>
                      );
                    })}

                    {hasOptimizations && (
                      <div
                        onClick={() => {
                          if (!optimizationsLocked) navigate(`/activity/${module.moduleId}/${optimizations[0].id}`);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px",
                          cursor: optimizationsLocked ? "not-allowed" : "pointer", opacity: optimizationsLocked ? 0.5 : 1,
                          color: "#d35400", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(243, 156, 18, 0.05)",
                        }}
                      >
                        <span style={{ color: "#f39c12", fontSize: "1.1rem" }}>★</span>
                        <span>Optimization Challenges</span>
                        <span style={{ marginLeft: "auto" }}>
                          {optimizationsLocked ? <FiLock size={12} /> : userProgress[`lesson-${modNumber}-optimizations`] ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#f39c12" />}
                        </span>
                      </div>
                    )}

                    <div
                      onClick={() => {
                        if (postAssessmentUnlocked) navigate(`/assessment/${module.moduleId}/post`);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px",
                        cursor: postAssessmentUnlocked ? "pointer" : "not-allowed", opacity: postAssessmentUnlocked ? 1 : 0.5,
                        color: postComplete ? "#22c55e" : "#2b005c", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.02)",
                      }}
                    >
                      <FiClipboard size={14} />
                      <span>Post-Assessment Quiz</span>
                      <span style={{ marginLeft: "auto" }}>
                        {!postAssessmentUnlocked ? <FiLock size={14} /> : postComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff" />}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="lesson-viewer-container">
        <div style={{ position: 'sticky', top: '50vh', zIndex: 1000, width: 0, height: 0, left: 0 }}>
          <button className="lesson-sidebar-toggle-btn" onClick={() => setIsSidebarVisible(!isSidebarVisible)} title="Toggle Sidebar">
            {isSidebarVisible ? <FiChevronLeft size={16} /> : <FiChevronRight size={16} />}
          </button>
        </div>

        {isCurrentLessonLocked ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
            <FiLock size={64} style={{ marginBottom: "20px", color: "#cbd5e1" }} />
            <h2>Lesson Locked</h2>
            <p>Please complete the Global Course Pre-Test and preceding activities to unlock this lesson.</p>
            <button
              onClick={() => navigate("/learning-path")}
              style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              Return to Path
            </button>
          </div>
        ) : loading ? (
          <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", height: "100%", color: "#7c5cff" }}>
            <h3>Loading lesson content...</h3>
          </div>
        ) : (
          <>
            <div className="lesson-top-nav">
              <div className="breadcrumb">
                <a href="/learning-path">Learning Path</a>
                <FiChevronRight className="breadcrumb-icon" />
                <span>Module {moduleNum}: {currentModule?.title}</span>
                <FiChevronRight className="breadcrumb-icon" />
                <span className="breadcrumb-current">Lesson {moduleNum}.{lessonNum}: {lesson?.title}</span>
              </div>
            </div>

            <div className="lesson-content-wrapper">
              <div className="lesson-header">
                <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
                <h1>{lesson?.title}</h1>
                <p>{formatText(lesson?.description)}</p>
                <div className="lesson-meta-grid">
                  <div className="lesson-meta-card"><FiClock className="meta-icon" /><span>Estimated Time</span><strong>{lesson?.estimatedTime}</strong></div>
                  <div className="lesson-meta-card"><FiBarChart2 className="meta-icon" /><span>Difficulty</span><strong>{lesson?.difficulty}</strong></div>
                  <div className="lesson-meta-card"><FiTarget className="meta-icon" /><span>Prerequisites</span><strong>{lesson?.prerequisites}</strong></div>
                </div>
              </div>

              <article className="lesson-article">
                {lesson?.sections?.map((section) => (
                  <section key={section.id} id={section.id} className={`lesson-section ${section.type}`}>
                    <h2>{section.title}</h2>
                    {renderParagraphs(section.content)}
                    {renderBullets(section.bullets)}
                    {renderChart(section.chart)}
                    {renderCodeSnippets(section.codeSnippets)}
                    {section.subsections?.map((subsection) => (
                      <div key={subsection.id || subsection.title} className="lesson-subsection">
                        <h3>{subsection.title}</h3>
                        {renderParagraphs(subsection.content, "lesson-subsection-content")}
                        {renderBullets(subsection.bullets)}
                        {renderChart(subsection.chart)}
                        {renderCodeSnippets(subsection.codeSnippets)}
                      </div>
                    ))}
                  </section>
                ))}
              </article>

              {lesson?.references?.length > 0 && (
                <div className="lesson-resources">
                  <h2>References</h2>
                  <ul>
                    {lesson.references?.map((reference, index) => (
                      <li key={index}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a></li>
                    ))}
                  </ul>
                </div>
              )}

              {currentActivityId && (
                <div style={{ marginTop: "50px", padding: "30px", backgroundColor: "rgba(124, 92, 255, 0.05)", borderRadius: "12px", border: "1px solid rgba(124, 92, 255, 0.3)", textAlign: "center" }}>
                  <h3 style={{ color: "#2b005c", marginBottom: "10px", fontSize: "1.5rem" }}>Ready to practice?</h3>
                  <p style={{ marginBottom: "25px", color: "#4b5563", fontSize: "1.05rem" }}>Put your knowledge to the test with an interactive coding activity.</p>
                  <button
                    onClick={() => navigate(`/activity/${moduleId}/${currentActivityId}`)}
                    style={{ padding: "14px 28px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "6px", fontSize: "1.1rem", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px rgba(124, 92, 255, 0.4)", transition: "transform 0.2s" }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    Start Activity
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}