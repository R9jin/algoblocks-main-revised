// frontend/src/pages/AssessmentPage.jsx
import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiAward, FiBarChart2, FiBookOpen, FiCheck, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiFileText, FiInfo, FiLock, FiSave, FiTarget, FiTrendingUp, FiX } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { assessmentsDB, curriculumCacheDB, progressDB, syncQueueDB } from "../db";
import "../styles/AssessmentPage.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

// OFFLINE FIX: AssessmentPage used to call fetch(targetFile) directly, so it
// depended entirely on the Workbox precache intercepting that exact request.
// If the service worker hadn't precached this specific file yet (fresh
// device, dev server with no SW, cache eviction, etc.) the fetch failed with
// no fallback and the page showed "Assessment not available", even though
// LearningPath.jsx and ActivityApp.jsx already have an IndexedDB-backed
// fallback for their own JSON (curriculumCacheDB / templatesDB). This gives
// assessment question sets the same layered resilience: try the network
// (which the SW transparently serves from precache when offline, per the
// ignoreURLParametersMatching config in vite.config.js), then fall back to
// the shared curriculumCacheDB entry keyed by the same URL LearningPath
// would use if it ever prefetches this file, caching a fresh copy whenever
// the network attempt succeeds.
async function fetchAssessmentWithCache(url) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      try {
        await curriculumCacheDB.setItem(url, data);
      } catch (e) {
        // best-effort cache write; a failed write shouldn't block using the data
      }
      return data;
    }
  } catch (e) {
    // network/SW fetch failed (likely offline with nothing precached yet) -- fall through to cache
  }

  try {
    const cached = await curriculumCacheDB.getItem(url);
    if (cached) return cached;
  } catch (e) {
    // ignore -- handled by the caller's catch-all below
  }

  throw new Error(`Assessment fetch failed for ${url} and no cache available.`);
}

// BUG-09 Fix: Scope draft keys by user email
const getDraftKey = (moduleId, type) => {
  const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
  const user = JSON.parse(userStr || "{}");
  const userEmail = user.email || "anonymous";
  return `algoblocks_draft_${userEmail}_${moduleId}_${type}`;
};

function saveDraft(moduleId, type, payload) {
  try {
    localStorage.setItem(getDraftKey(moduleId, type), JSON.stringify(payload));
  } catch (e) {
    console.warn("Could not save draft:", e);
  }
}

function loadDraft(moduleId, type) {
  try {
    const raw = localStorage.getItem(getDraftKey(moduleId, type));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(moduleId, type) {
  try {
    localStorage.removeItem(getDraftKey(moduleId, type));
  } catch {
    // ignore
  }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function CodeBlock({ code }) {
  if (!code) return null;
  return (
    <div className="question-code-block">
      <div className="code-block-header">
        <span className="code-block-label">Python</span>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function AssessmentPage() {
  const { moduleId, type } = useParams();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [moduleTitle, setModuleTitle] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [prevResult, setPrevResult] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [assessmentVersion, setAssessmentVersion] = useState(1);

  const timerRef = useRef(null);
  const autoSaveRef = useRef(null);

  const isGlobalPreTest = moduleId === "course-pre-test";
  const isGlobalPostTest = moduleId === "course-post-test";
  const moduleNum = (isGlobalPreTest || isGlobalPostTest) ? "Overall" : moduleId?.split("-").pop();

  // BUG FIX: assessments are Learning Path content and guests are gated out
  // of the Learning Path listing (see LearningPath.jsx), but this route is
  // reachable directly by URL. Bounce guests back to /learning-path, which
  // shows the sign-up prompt instead of quiz content.
  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : {};
    if (user.isGuest) {
      navigate("/learning-path", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const assessmentKey = `${moduleId}_${type}_assessment`;
        const existingResult = await assessmentsDB.getItem(assessmentKey);
        
        let existingNormalized = null;
        if (existingResult) {
          existingNormalized = existingResult.data ? { ...existingResult, ...existingResult.data } : existingResult;
          setPrevResult(existingNormalized);
          setScore(existingNormalized.score || 0);
          setTimeElapsed(existingNormalized.timeElapsed || 0);
        }

        const isPostTest = moduleId === "course-post-test";
        let targetFile = `/data/assessments/${moduleId}.json`;
        if (isPostTest && existingNormalized) {
          // If the user completed the older post test (version 1 or unversioned legacy record),
          // load the exact v1 question set they answered so their answer review matches perfectly.
          const isLegacyV1 = existingNormalized.version === 1 || !existingNormalized.version;
          if (isLegacyV1) {
            targetFile = `/data/assessments/course-post-test-v1.json`;
          }
        }

        const data = await fetchAssessmentWithCache(targetFile);
        setModuleTitle(data.moduleTitle || "");
        setAssessmentVersion(data.version || (isPostTest ? 2 : 1));

        if (existingNormalized) {
          if (existingNormalized.questionIds && existingNormalized.questionIds.length > 0) {
            const idMap = Object.fromEntries((data.questions || []).map((q) => [q.id, q]));
            const restored = existingNormalized.questionIds.map((id) => idMap[id]).filter(Boolean);
            setQuestions(restored.length > 0 ? restored : (data.questions || []));
          } else {
            setQuestions(data.questions || []);
          }

          if (existingNormalized.answers || existingNormalized.selectedAnswers) {
            setSelectedAnswers(existingNormalized.answers || existingNormalized.selectedAnswers || {});
          }

          setIsLocked(true);
          setLoading(false);
          return;
        }

        const draft = loadDraft(moduleId, type);
        if (draft && draft.questionIds) {
          const idMap = Object.fromEntries((data.questions || []).map((q) => [q.id, q]));
          const restored = draft.questionIds.map((id) => idMap[id]).filter(Boolean);
          if (restored.length === (data.questions || []).length) {
            setQuestions(restored);
            setSelectedAnswers(draft.selectedAnswers || {});
            setCurrentIndex(draft.currentIndex || 0);
            setTimeElapsed(draft.timeElapsed || 0);
            setHasDraft(true);
            setLoading(false);
            return;
          }
        }

        const shuffled = shuffleArray(data.questions || []);
        setQuestions(shuffled);
      } catch (err) {
        console.error("Failed to load assessment:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [moduleId, type, isGlobalPreTest, isGlobalPostTest]);

  useEffect(() => {
    if (submitted || loading || questions.length === 0 || isLocked) return;

    autoSaveRef.current = setInterval(() => {
      const draft = {
        moduleId,
        type,
        questionIds: questions.map((q) => q.id),
        selectedAnswers,
        currentIndex,
        timeElapsed,
        savedAt: new Date().toISOString(),
      };
      saveDraft(moduleId, type, draft);
      setLastSavedAt(new Date().toISOString());
    }, 10_000);

    return () => clearInterval(autoSaveRef.current);
  }, [submitted, loading, questions, selectedAnswers, currentIndex, timeElapsed, moduleId, type, isLocked]);

  useEffect(() => {
    if (submitted || loading || questions.length === 0 || isLocked) return;
    timerRef.current = setInterval(() => {
      setTimeElapsed((t) => t + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [submitted, loading, questions.length, isLocked]);

  useEffect(() => {
    if (isLocked) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !submitted && questions.length > 0) {
        const draft = {
          moduleId,
          type,
          questionIds: questions.map((q) => q.id),
          selectedAnswers,
          currentIndex,
          timeElapsed,
          savedAt: new Date().toISOString(),
        };
        saveDraft(moduleId, type, draft);
      }
    };
    const handleBeforeUnload = (e) => {
      if (!submitted && Object.keys(selectedAnswers).length > 0) {
        const draft = {
          moduleId,
          type,
          questionIds: questions.map((q) => q.id),
          selectedAnswers,
          currentIndex,
          timeElapsed,
          savedAt: new Date().toISOString(),
        };
        saveDraft(moduleId, type, draft);
        e.preventDefault();
        e.returnValue = "";
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [submitted, questions, selectedAnswers, currentIndex, timeElapsed, moduleId, type, isLocked]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getScoreLabel = (s) => {
    if (s >= 90) return { label: "Excellent!", color: "#22c55e", icon: <FiAward size={20} /> };
    if (s >= 75) return { label: "Proficient", color: "#3b82f6", icon: <FiTarget size={20} /> };
    if (s >= 60) return { label: "Developing", color: "#f97316", icon: <FiTrendingUp size={20} /> };
    return { label: "Needs Review", color: "#ef4444", icon: <FiBookOpen size={20} /> };
  };

  const handleSelectAnswer = (optionIndex) => {
    if (submitted || isLocked) return;

    const updated = { ...selectedAnswers, [currentIndex] : optionIndex };
    setSelectedAnswers(updated);

    const draft = {
      moduleId,
      type,
      questionIds: questions.map((q) => q.id),
      selectedAnswers: updated,
      currentIndex,
      timeElapsed,
      savedAt: new Date().toISOString(),
    };
    saveDraft(moduleId, type, draft);
    setLastSavedAt(new Date().toISOString());
  };

  const handleSubmit = async () => {
    clearInterval(timerRef.current);
    clearInterval(autoSaveRef.current);

    let correct = 0;
    questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.answer) correct++;
    });

    const finalScore = Math.round((correct / questions.length) * 100);
    setScore(finalScore);
    setSubmitted(true);

    const assessmentKey = `${moduleId}_${type}_assessment`;
    const result = {
      moduleId,
      type,
      score: finalScore,
      correct,
      total: questions.length,
      timeElapsed,
      completedAt: new Date().toISOString(),
      attempts: (prevResult?.attempts ?? 0) + 1,
      version: assessmentVersion || (isGlobalPostTest ? 2 : 1),
      questionIds: questions.map((q) => q.id),
      answers: selectedAnswers,
      selectedAnswers: selectedAnswers,
    };

    await assessmentsDB.setItem(assessmentKey, result);
    await progressDB.setItem(assessmentKey, { score: finalScore });

    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    const user = JSON.parse(userStr || "{}");
    
    user.assessments = user.assessments || {};
    user.assessments[assessmentKey] = result;
    user.progress = user.progress || {};
    user.progress[assessmentKey] = finalScore;
    
    if (localStorage.getItem("user")) localStorage.setItem("user", JSON.stringify(user));
    if (sessionStorage.getItem("user")) sessionStorage.setItem("user", JSON.stringify(user));

    clearDraft(moduleId, type);

    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken"); 
    const API_TARGET = `${API_BASE.replace(/\/$/, '')}/api`;

    const queuePayloadAssm = {
        url: `${API_TARGET}/update-assessment`,
        method: "POST",
        payload: { email: user.email, key: assessmentKey, assessment_key: assessmentKey, ...result },
        type: "assessment",
        timestamp: Date.now()
    };
    
    const queuePayloadProg = {
        url: `${API_TARGET}/update-progress`,
        method: "POST",
        payload: { email: user.email, key: assessmentKey, lesson_id: assessmentKey, score: finalScore },
        type: "progress",
        timestamp: Date.now()
    };

    if (navigator.onLine && user.email && !user.isGuest) {
      try {
        const res = await fetch(`${API_TARGET}/update-assessment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(queuePayloadAssm.payload)
        });
        
        const progRes = await fetch(`${API_TARGET}/update-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(queuePayloadProg.payload)
        });

        if (res.ok && progRes.ok) {
          await assessmentsDB.setItem(assessmentKey, { ...result, isSynced: true });
          await progressDB.setItem(assessmentKey, { score: finalScore, isSynced: true });
        } else {
          throw new Error("Sync failed");
        }
      } catch {
        const syncId = `sync_${Date.now()}`;
        await syncQueueDB.setItem(`${syncId}_assm`, queuePayloadAssm);
        await syncQueueDB.setItem(`${syncId}_prog`, queuePayloadProg);
      }
    } else if (user.email && !user.isGuest) {
        const syncId = `sync_${Date.now()}`;
        await syncQueueDB.setItem(`${syncId}_assm`, queuePayloadAssm);
        await syncQueueDB.setItem(`${syncId}_prog`, queuePayloadProg);
    }
  };

  const handleProceed = () => {
    navigate("/learning-path");
  };

  const handleDiscardDraft = () => {
    clearDraft(moduleId, type);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setTimeElapsed(0);
    setHasDraft(false);
    setQuestions((prev) => shuffleArray(prev));
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const currentQuestion = questions[currentIndex];

  if (loading) {
    return (
      <div className="assessment-page">
        <DashboardHeader backTo="/learning-path" backText="Back to Learning Path" />
        <div className="assessment-loading">Loading assessment...</div>
      </div>
    );
  }

  if (questions.length === 0 && !submitted && !isLocked) {
    return (
      <div className="assessment-page">
        <DashboardHeader backTo="/learning-path" backText="Back to Learning Path" />
        <div className="assessment-loading">Assessment not available for this module.</div>
      </div>
    );
  }

  if (submitted || isLocked) {
    const activeScore = submitted ? score : (prevResult?.score ?? score ?? 0);
    const activeTime = submitted ? timeElapsed : (prevResult?.timeElapsed ?? timeElapsed ?? 0);
    const activeAttempts = prevResult?.attempts || (submitted ? 1 : 1);
    const { label, color, icon } = getScoreLabel(activeScore);
    const hasRecordedAnswers = Object.keys(selectedAnswers).length > 0;
    const correctCount = hasRecordedAnswers
      ? questions.filter((q, i) => selectedAnswers[i] === q.answer).length
      : (prevResult?.correct !== undefined && prevResult?.correct !== null)
        ? prevResult.correct
        : Math.round((activeScore / 100) * (questions.length || 1));

    return (
      <div className="assessment-page">
        <DashboardHeader backTo="/learning-path" backText="Back to Learning Path" />
        <div className="assessment-results-wrapper">
          <div className="results-card">
            <div className="results-header">
              <div className="results-badge" style={{ borderColor: color }}>
                <span className="results-icon" style={{ display: "inline-flex", color }}>{icon}</span>
                <span className="results-label" style={{ color }}>{label}</span>
              </div>
              <h1 className="results-score" style={{ color }}>{activeScore}%</h1>
              <p className="results-subtitle">
                {isGlobalPreTest ? "Comprehensive Course Diagnostic" : isGlobalPostTest ? "Comprehensive Course Final Exam" : `Module ${moduleNum} Quiz: ${moduleTitle}`}
              </p>
              <p className="results-attempt">
                Attempt #{activeAttempts} &nbsp;·&nbsp; {formatTime(activeTime)} taken
              </p>

              {isLocked && (
                <div style={{ marginTop: "18px", padding: "14px 18px", backgroundColor: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: "0 8px 8px 0", textAlign: "left" }}>
                  <p className="results-note" style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", margin: 0, fontWeight: "600", fontSize: "0.95rem" }}>
                    <FiLock size={18} style={{ flexShrink: 0 }} /> For research and data integrity purposes, this assessment can only be taken once. Your score and full answer review are preserved below.
                  </p>
                </div>
              )}
            </div>

            <div className="results-stats">
              <div className="stat-box">
                <span className="stat-number">{correctCount}</span>
                <span className="stat-label">Correct</span>
              </div>
              <div className="stat-box">
                <span className="stat-number">{questions.length ? questions.length - correctCount : 0}</span>
                <span className="stat-label">Incorrect</span>
              </div>
              <div className="stat-box">
                <span className="stat-number">{questions.length || prevResult?.total || 0}</span>
                <span className="stat-label">Total</span>
              </div>
            </div>

            {questions.length > 0 && (
              <div className="results-review">
                <h3>Answer Review</h3>
                <div className="review-list">
                  {questions.map((q, i) => {
                    const userAnswer = selectedAnswers[i];
                    const hasAnswer = userAnswer !== undefined && userAnswer !== null;
                    const correct = hasAnswer ? userAnswer === q.answer : false;
                    return (
                      <div key={q.id || i} className={`review-item ${hasAnswer ? (correct ? "correct" : "incorrect") : "neutral"}`}>
                        <div className="review-item-header">
                          <span className="review-num">Q{i + 1}</span>
                          <span className="review-icon">
                            {hasAnswer ? (
                              correct ? <FiCheck color="#22c55e" /> : <FiX color="#ef4444" />
                            ) : (
                              <FiInfo color="#8b5cf6" />
                            )}
                          </span>
                          <span className="review-question">
                            {q.type === "code" && <span className="review-code-tag">CODE</span>}
                            {q.question}
                          </span>
                        </div>
                        {(!correct || !hasAnswer) && (
                          <div className="review-answer-detail">
                            {q.code && (
                              <div className="review-code-snippet">
                                <pre>{q.code}</pre>
                              </div>
                            )}
                            {hasAnswer && (
                              <span className="your-answer">
                                Your answer: <em>{q.options?.[userAnswer] ?? "Not answered"}</em>
                              </span>
                            )}
                            <span className="correct-answer">
                              Correct: <em>{q.options?.[q.answer] ?? ""}</em>
                            </span>
                            {q.explanation && (
                              <span className="explanation-text" style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                                <FiInfo style={{ marginTop: "3px", flexShrink: 0, color: "#eab308" }} /> {q.explanation}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="results-actions">
              <button className="btn-proceed" onClick={handleProceed}>
                {isGlobalPreTest ? "Start Curriculum →" : "Back to Learning Path →"}
              </button>
            </div>

            {isGlobalPreTest && (
              <p className="results-note" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <FiInfo size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  The curriculum is now fully unlocked. Use this score as a baseline to track your growth over the course! <br/> 
                  <strong>Note: This pre-test has now been locked.</strong>
                </span>
              </p>
            )}
            {isGlobalPostTest && (
              <p className="results-note" style={{ display: "flex", alignItems: "flex-start", gap: "8px", color: "#f59e0b", fontSize: "1.1rem" }}>
                <FiCheckCircle size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  Congratulations on completing the AlgoBlocks curriculum! You have proven your mastery of algorithmic foundations.<br/>
                  <strong>Note: This post-test has now been locked.</strong>
                </span>
              </p>
            )}
            {!(isGlobalPreTest || isGlobalPostTest) && activeScore >= 75 && (
              <p className="results-note" style={{ display: "flex", alignItems: "center", gap: "8px", color: "#22c55e" }}>
                <FiCheckCircle size={18} style={{ flexShrink: 0 }} /> Great performance! You've demonstrated strong understanding of Module {moduleNum} concepts.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="assessment-page">
      <DashboardHeader backTo="/learning-path" backText="Back to Learning Path" />

      <div className="assessment-wrapper">
        <div className="assessment-header">
          <div className="assessment-title-block">
            <div className="assessment-tag">{isGlobalPreTest ? "DIAGNOSTIC EXAM" : isGlobalPostTest ? "FINAL EXAM" : "QUIZ"}</div>
            <h1>{isGlobalPreTest ? "Comprehensive Course Pre-Test" : isGlobalPostTest ? "Comprehensive Course Post-Test" : `Module ${moduleNum}: ${moduleTitle}`}</h1>
            <p className="assessment-subtitle">
              {isGlobalPreTest
                ? "This assessment measures your prior knowledge across the entire course. It does not affect your grades. NOTE: For data validity, this test can only be taken ONCE."
                : isGlobalPostTest
                ? "This final assessment evaluates your complete mastery of algorithms across all modules. NOTE: For data validity, this test can only be taken ONCE."
                : "This assessment evaluates your understanding after completing the module."}
            </p>
          </div>
          <div className="assessment-meta">
            <div className="meta-pill" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <FiClock size={14} /> {formatTime(timeElapsed)}
            </div>
            <div className="meta-pill" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <FiFileText size={14} /> {answeredCount}/{questions.length} answered
            </div>
            {lastSavedAt && (
              <div className="meta-pill saved" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <FiSave size={14} />
                Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        </div>

        {hasDraft && (
          <div className="draft-banner">
            <span>🔄 Your previous session was restored — {answeredCount} answer{answeredCount !== 1 ? "s" : ""} recovered.</span>
            <button className="draft-discard-btn" onClick={handleDiscardDraft}>
              Start Fresh
            </button>
          </div>
        )}

        {prevResult && !hasDraft && (
          <div className="prev-result-banner">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <FiBarChart2 /> You previously scored <strong>{prevResult.score}%</strong> on this assessment
              (Attempt #{prevResult.attempts}).
            </span>
          </div>
        )}

        <div className="assessment-progress-bar">
          <div
            className="assessment-progress-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        <div className="assessment-body">
          <aside className="question-navigator">
            <h4>Questions</h4>
            <div className="question-nav-grid">
              {questions.map((q, i) => (
                <button
                  key={i}
                  className={`nav-dot ${i === currentIndex ? "active" : ""} ${
                    selectedAnswers[i] !== undefined ? "answered" : ""
                  } ${q.type === "code" ? "code-q" : ""}`}
                  onClick={() => setCurrentIndex(i)}
                  title={q.type === "code" ? "Code analysis question" : ""}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="nav-legend">
              <span className="legend-dot answered" /> Answered
              <span className="legend-dot active" /> Current
              <span className="legend-dot" /> Unanswered
              <span className="legend-dot code-q" /> Code Q
            </div>
          </aside>

          <main className="question-main">
            <div className="question-card">
              <div className="question-counter-row">
                <span className="question-counter">Question {currentIndex + 1} of {questions.length}</span>
                {currentQuestion.type === "code" && (
                  <span className="code-question-badge">💻 Code Analysis</span>
                )}
              </div>

              {currentQuestion.type === "code" && currentQuestion.code && (
                <CodeBlock code={currentQuestion.code} />
              )}

              <h2 className="question-text">{currentQuestion.question}</h2>

              <div className="options-list">
                {currentQuestion.options.map((opt, i) => (
                  <button
                    key={i}
                    className={`option-btn ${selectedAnswers[currentIndex] === i ? "selected" : ""}`}
                    onClick={() => handleSelectAnswer(i)}
                    disabled={submitted}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="option-text">{opt}</span>
                  </button>
                ))}
              </div>

              <div className="question-nav-row">
                <button
                  className="nav-btn"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                >
                  <FiChevronLeft /> Previous
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    className="nav-btn primary"
                    onClick={() => setCurrentIndex((i) => i + 1)}
                  >
                    Next <FiChevronRight />
                  </button>
                ) : (
                  <button
                    className="nav-btn submit"
                    onClick={handleSubmit}
                    disabled={answeredCount < questions.length}
                    title={
                      answeredCount < questions.length
                        ? `Answer all ${questions.length} questions to submit`
                        : ""
                    }
                  >
                    <FiAward /> Submit Assessment
                  </button>
                )}
              </div>

              {answeredCount < questions.length && currentIndex === questions.length - 1 && (
                <p className="submit-warning" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <FiAlertTriangle size={16} /> Please answer all {questions.length} questions before submitting.
                  ({questions.length - answeredCount} remaining)
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}