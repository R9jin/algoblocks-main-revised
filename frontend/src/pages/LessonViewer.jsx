// frontend/src/pages/LessonViewer.jsx
import { useEffect, useState } from "react";
import {
  FiBarChart2, FiBookOpen, FiCheckCircle, FiChevronLeft,
  FiChevronRight, FiCircle, FiClipboard, FiClock, FiLock, FiTarget,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import BigOChart from "../components/BigOChart";
import CodeSnippet from "../components/CodeSnippet";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB } from "../db";
import "../styles/LessonViewer.css";

function renderParagraphs(content, className = "lesson-section-content") {
  if (!content) return null;
  return (
    <div className={className}>
      {content.split("\n\n").map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function renderBullets(items) {
  if (!items?.length) return null;
  return (
    <ul className="lesson-bullet-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function renderCodeSnippets(snippets) {
  if (!snippets?.length) return null;
  return (
    <div className="lesson-code-snippets">
      {snippets.map((snippet, index) => (
        <CodeSnippet key={`${snippet.title || "snippet"}-${index}`} snippet={snippet} />
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
          {chart.description && <span>{chart.description}</span>}
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

  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [activitiesData, setActivitiesData] = useState({});
  const [assessments, setAssessments] = useState({});

  // OFFLINE FIRST: Load User Progress & Assessment results
  useEffect(() => {
    const loadOfflineData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = stored ? JSON.parse(stored) : {};
        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        // 1. Explicitly override with IndexedDB (Offline First Source of Truth)
        await progressDB.iterate((value, key) => {
            initialProg[key] = value.score !== undefined ? value.score : value;
        });
        await assessmentsDB.iterate((value, key) => {
            initialAssm[key] = value;
        });

        setUserProgress(initialProg);
        setAssessments(initialAssm);

        // 2. Explicitly fetch from the cloud properly (Vercel Fix)
        if (navigator.onLine && parsed.email && !parsed.isGuest) {
            try {
                const progRes = await fetch(`${API_BASE}/api/get-progress?email=${parsed.email}`);
                if (progRes.ok) {
                    const data = await progRes.json();
                    const progData = data.progress || data;
                    for (const [key, val] of Object.entries(progData)) {
                        initialProg[key] = val;
                        await progressDB.setItem(key, { score: val, isSynced: true });
                    }
                }

                const assRes = await fetch(`${API_BASE}/api/get-assessments?email=${parsed.email}`);
                if (assRes.ok) {
                    const data = await assRes.json();
                    const assData = data.assessments || data;
                    for (const [key, val] of Object.entries(assData)) {
                        initialAssm[key] = val;
                        await assessmentsDB.setItem(key, { ...val, isSynced: true });
                    }
                }
                
                setUserProgress({...initialProg});
                setAssessments({...initialAssm});
                
                parsed.progress = initialProg;
                parsed.assessments = initialAssm;
                localStorage.setItem("user", JSON.stringify(parsed));
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

      for (const module of curriculumIndex) {
        const mid = module.moduleId.split("-").pop();
        try {
          const resAct = await fetch(`/data/activities/module_${mid}.json`);
          if (resAct.ok) acts[module.moduleId] = await resAct.json();
        } catch (e) {}

        for (const lessonMeta of module.lessons) {
          try {
            const fetchPath = `/data/curriculum/${module.moduleId}/${lessonMeta.lessonId}.json`;
            const res = await fetch(fetchPath);
            if (res.ok) details[lessonMeta.lessonId] = await res.json();
          } catch (e) {
            console.error(`Failed to fetch lesson data for ${lessonMeta.lessonId}`, e);
          }
        }
      }
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
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`Failed to fetch lesson: ${response.status}`);

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

  const hasPreAssessment = (mId) => assessments[`${mId}_pre_assessment`] !== undefined;
  const hasPostAssessment = (mId) => assessments[`${mId}_post_assessment`] !== undefined;

  const isModuleComplete = (mId) => {
    const module = curriculumIndex.find((m) => m.moduleId === mId);
    if (!module) return false;
    return module.lessons.every((l) => {
      const details = lessonDetails[l.lessonId];
      const firstActivityId = details?.activities?.[0]?.id;
      if (!firstActivityId) return true;
      return (userProgress[l.lessonId] || 0) >= 1;
    });
  };

  const buildLockMap = () => {
    const lockMap = {};
    for (const module of curriculumIndex) {
      const preComplete = hasPreAssessment(module.moduleId);
      let isNextLocked = !preComplete;
      for (const l of module.lessons) {
        lockMap[l.lessonId] = isNextLocked;
        if (!isNextLocked) {
          const details = lessonDetails[l.lessonId];
          const firstActivityId = details?.activities?.[0]?.id;
          const prog = userProgress[l.lessonId] || 0;
          if (firstActivityId && prog < 1) {
            isNextLocked = true;
          }
        }
      }
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

  if (loading || Object.keys(lessonDetails).length === 0) {
    return <div className="lesson-loading">Loading curriculum data...</div>;
  }

  return (
    <div className="lesson-viewer-wrapper">
      <aside className="lesson-modules-sidebar">
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate("/learning-path")}>
            <FiChevronLeft /> Back to Dashboard
          </button>
        </div>
        <div className="modules-header"><h3>Curriculum</h3></div>
        <nav className="modules-nav">
          {curriculumIndex.map((module) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);
            const preComplete = hasPreAssessment(module.moduleId);
            const modComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);

            const optimizations = activitiesData[module.moduleId]?.optimizations || [];
            const hasOptimizations = optimizations.length > 0;
            const lastLessonId = module.lessons[module.lessons.length - 1]?.lessonId;
            const optimizationsLocked = lockMap[lastLessonId] || (userProgress[lastLessonId] || 0) < 1;

            return (
              <div key={module.moduleId} className="module-group">
                <button className={`module-title ${isExpanded ? "expanded" : ""}`} onClick={() => toggleModule(module.moduleId)}>
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
                    <div onClick={() => navigate(`/assessment/${module.moduleId}/pre`)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px", cursor: "pointer", color: preComplete ? "#22c55e" : "#2b005c", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.02)" }}>
                      <FiClipboard size={14} /><span>Pre-Assessment</span>
                      <span style={{ marginLeft: "auto" }}>{preComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff" />}</span>
                    </div>

                    {module.lessons.map((lessonItem) => {
                      const lesNumber = lessonItem.lessonId.split("-").pop();
                      const isActive = lessonId === lessonItem.lessonId;
                      const isLocked = lockMap[lessonItem.lessonId];
                      const prog = userProgress[lessonItem.lessonId] || 0;

                      return (
                        <a key={lessonItem.lessonId} href={`/learning-path/${module.moduleId}/${lessonItem.lessonId}`} className={`lesson-item ${isActive ? "active" : ""}`}
                          style={{ opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? "none" : "auto", paddingLeft: "45px" }}
                          onClick={(e) => { e.preventDefault(); if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lessonItem.lessonId}`); }}>
                          <span className="lesson-number">{modNumber}.{lesNumber}</span>
                          <span className="lesson-title">{lessonItem.title}</span>
                          <span className="lesson-indicator">{isLocked ? <FiLock size={12} /> : prog >= 1 ? <FiCheckCircle size={12} color="#22c55e" /> : isActive ? "●" : "○"}</span>
                        </a>
                      );
                    })}

                    {hasOptimizations && (
                      <div onClick={() => { if (!optimizationsLocked) navigate(`/activity/${module.moduleId}/${optimizations[0].id}`); }}
                        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px", cursor: optimizationsLocked ? "not-allowed" : "pointer", opacity: optimizationsLocked ? 0.5 : 1, color: "#d35400", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(243, 156, 18, 0.05)" }}>
                        <span style={{color: "#f39c12", fontSize: "1.1rem"}}>★</span><span>Optimization Challenges</span>
                        <span style={{ marginLeft: "auto" }}>{optimizationsLocked ? <FiLock size={12} /> : userProgress[`lesson-${modNumber}-optimizations`] ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#f39c12" />}</span>
                      </div>
                    )}

                    <div onClick={() => { if (modComplete || postComplete) navigate(`/assessment/${module.moduleId}/post`); }}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px", cursor: modComplete || postComplete ? "pointer" : "not-allowed", opacity: modComplete || postComplete ? 1 : 0.5, color: postComplete ? "#22c55e" : "#2b005c", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.02)" }}>
                      <FiClipboard size={14} /><span>Post-Assessment</span>
                      <span style={{ marginLeft: "auto" }}>{!modComplete && !postComplete ? <FiLock size={14} /> : postComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff" />}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="lesson-viewer-container">
        {isCurrentLessonLocked ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
            <FiLock size={64} style={{ marginBottom: "20px", color: "#cbd5e1" }} />
            <h2>Lesson Locked</h2>
            <p>Please complete the pre-assessment and preceding activities to unlock this lesson.</p>
            <button onClick={() => navigate("/learning-path")} style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>
              Return to Path
            </button>
          </div>
        ) : (
          <>
            <div className="lesson-top-nav">
              <div className="breadcrumb">
                <a href="/learning-path">Learning Path</a><FiChevronRight className="breadcrumb-icon" />
                <span>Module {moduleNum}: {currentModule?.title}</span><FiChevronRight className="breadcrumb-icon" />
                <span className="breadcrumb-current">Lesson {moduleNum}.{lessonNum}: {lesson?.title}</span>
              </div>
            </div>

            <div className="lesson-content-wrapper">
              <div className="lesson-header">
                <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
                <h1>{lesson?.title}</h1>
                <p>{lesson?.description}</p>
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
                  <button onClick={() => navigate(`/activity/${moduleId}/${currentActivityId}`)}
                    style={{ padding: "14px 28px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "6px", fontSize: "1.1rem", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px rgba(124, 92, 255, 0.4)", transition: "transform 0.2s" }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
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