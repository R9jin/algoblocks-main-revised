// frontend/src/pages/LessonViewer.jsx
import { useEffect, useState } from "react";
import { FiCheckCircle, FiChevronLeft, FiChevronRight, FiCircle, FiClipboard, FiLock } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import curriculumIndex from "../data/curriculumIndex";
import "../styles/LessonViewer.css";

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));

  // Progress State
  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [assessments, setAssessments] = useState({});

  // 1. Load User Progress & Assessment results from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserProgress(parsed.progress || {});
        setAssessments(parsed.assessments || {});
      }
    } catch (e) {
      console.warn("Could not load user progress:", e);
    }
  }, []);

  // 2. Fetch ALL Lesson JSONs to compute locks
  useEffect(() => {
    const fetchLessonsData = async () => {
      const details = {};
      for (const module of curriculumIndex) {
        for (const lessonMeta of module.lessons) {
          try {
            const fetchPath = `/data/curriculum/${module.moduleId}/${lessonMeta.lessonId}.json`;
            const res = await fetch(fetchPath);
            if (res.ok) {
              details[lessonMeta.lessonId] = await res.json();
            }
          } catch (e) {
            console.error(`Failed to fetch lesson data for ${lessonMeta.lessonId}`, e);
          }
        }
      }
      setLessonDetails(details);
    };
    fetchLessonsData();
  }, []);

  // 3. Fetch the CURRENT Lesson
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

  // ── Lock Computation Logic (Mirrored from LearningPath) ────────────

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
    if (newExpanded.has(mId)) {
      newExpanded.delete(mId);
    } else {
      newExpanded.add(mId);
    }
    setExpandedModules(newExpanded);
  };

  const currentModule = curriculumIndex.find((m) => m.moduleId === moduleId);
  const moduleNum = moduleId?.split("-").pop();
  const lessonNum = lessonId?.split("-").pop();
  const currentActivityId = lesson?.activities?.[0]?.id;

  // ── Rendering ───────────────────────────────────────────────────────

  if (loading || Object.keys(lessonDetails).length === 0) {
    return <div className="lesson-loading">Loading curriculum data...</div>;
  }

  return (
    <div className="lesson-viewer-wrapper">
      {/* Left Sidebar with Modules Navigation */}
      <aside className="lesson-modules-sidebar">
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate("/learning-path")}>
            <FiChevronLeft /> Back to Dashboard
          </button>
        </div>

        <div className="modules-header">
          <h3>Curriculum</h3>
        </div>

        <nav className="modules-nav">
          {curriculumIndex.map((module) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);

            const preComplete = hasPreAssessment(module.moduleId);
            const modComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);

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
                      <span className="module-name" style={{ fontSize: '0.85rem' }}>{module.title}</span>
                    </span>
                  </span>
                  <span className="expand-icon">▼</span>
                </button>

                {isExpanded && (
                  <div className="lessons-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
                    
                    {/* Pre-Assessment Sidebar Item */}
                    <div 
                        onClick={() => navigate(`/assessment/${module.moduleId}/pre`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 15px', paddingLeft: '45px', cursor: 'pointer', color: preComplete ? '#22c55e' : '#2b005c', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.02)' }}
                    >
                        <FiClipboard size={14} />
                        <span>Pre-Assessment</span>
                        <span style={{ marginLeft: 'auto' }}>
                           {preComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff"/>}
                        </span>
                    </div>

                    {/* Lessons List */}
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
                              pointerEvents: isLocked ? 'none' : 'auto',
                              paddingLeft: '45px'
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

                    {/* Post-Assessment Sidebar Item */}
                    <div 
                        onClick={() => { if(modComplete || postComplete) navigate(`/assessment/${module.moduleId}/post`) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 15px', paddingLeft: '45px', cursor: modComplete || postComplete ? 'pointer' : 'not-allowed', opacity: modComplete || postComplete ? 1 : 0.5, color: postComplete ? '#22c55e' : '#2b005c', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.02)' }}
                    >
                        <FiClipboard size={14} />
                        <span>Post-Assessment</span>
                        <span style={{ marginLeft: 'auto' }}>
                           {!modComplete && !postComplete ? <FiLock size={14} /> : postComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff"/>}
                        </span>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="lesson-viewer-container">
        
        {/* Security Check: Is the URL manually hacked to bypass a lock? */}
        {isCurrentLessonLocked ? (
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
               <FiLock size={64} style={{ marginBottom: '20px', color: '#cbd5e1' }} />
               <h2>Lesson Locked</h2>
               <p>Please complete the pre-assessment and preceding activities to unlock this lesson.</p>
               <button onClick={() => navigate('/learning-path')} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#7c5cff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                   Return to Path
               </button>
           </div>
        ) : (
            <>
                <div className="lesson-top-nav">
                <div className="breadcrumb">
                    <a href="/learning-path">Learning Path</a>
                    <FiChevronRight className="breadcrumb-icon" />
                    <span>Module {moduleNum}: {currentModule?.title}</span>
                    <FiChevronRight className="breadcrumb-icon" />
                    <span className="breadcrumb-current">
                    Lesson {moduleNum}.{lessonNum}: {lesson?.title}
                    </span>
                </div>
                </div>

                <div className="lesson-content-wrapper">
                <div className="lesson-header">
                    <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
                    <h1>{lesson?.title}</h1>
                    <p>{lesson?.description}</p>
                    <div className="lesson-meta-grid">
                    <div className="lesson-meta-card">
                        <div className="meta-icon">⏱️</div>
                        <span>Estimated Time</span>
                        <strong>{lesson?.estimatedTime}</strong>
                    </div>
                    <div className="lesson-meta-card">
                        <div className="meta-icon">📊</div>
                        <span>Difficulty</span>
                        <strong>{lesson?.difficulty}</strong>
                    </div>
                    <div className="lesson-meta-card">
                        <div className="meta-icon">🎯</div>
                        <span>Prerequisites</span>
                        <strong>{lesson?.prerequisites}</strong>
                    </div>
                    </div>
                </div>

                {lesson?.sections?.map((section) => (
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

                {lesson?.references?.length > 0 && (
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

                {/* ✅ Added Call-to-Action for Activity */}
                {currentActivityId && (
                    <div style={{ marginTop: '50px', padding: '30px', backgroundColor: 'rgba(124, 92, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(124, 92, 255, 0.3)', textAlign: 'center' }}>
                        <h3 style={{ color: '#2b005c', marginBottom: '10px', fontSize: '1.5rem' }}>Ready to practice?</h3>
                        <p style={{ marginBottom: '25px', color: '#4b5563', fontSize: '1.05rem' }}>Put your knowledge to the test with an interactive coding activity.</p>
                        <button 
                            onClick={() => navigate(`/activity/${moduleId}/${currentActivityId}`)}
                            style={{ padding: '14px 28px', backgroundColor: '#7c5cff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 14px rgba(124, 92, 255, 0.4)', transition: 'transform 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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