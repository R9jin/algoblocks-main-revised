// frontend/src/pages/AssessmentPage.jsx
import { useEffect, useRef, useState } from "react";
import { FiAward, FiCheck, FiChevronLeft, FiChevronRight, FiSave, FiX } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import "../styles/AssessmentPage.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── Storage helpers ──────────────────────────────────────────────────────────
const getUserEmail = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}").email || "guest"; } 
  catch { return "guest"; }
};

// Draft key: stores in-progress answers, question order, and elapsed time.
const getDraftKey = (moduleId, type) => `algoblocks_draft_${getUserEmail()}_${moduleId}_${type}`;
const getResultKey = (moduleId, type) => `algoblocks_result_${getUserEmail()}_${moduleId}_${type}`;

function saveDraft(moduleId, type, payload) {
  try {
    localStorage.setItem(getDraftKey(moduleId, type), JSON.stringify(payload));
  } catch (e) {
    console.warn("Could not save draft:", e);
  }
}

function loadDraft(moduleId, type) {
  try {
    const scopedKey = getDraftKey(moduleId, type);
    const unScopedKey = `algoblocks_draft_${moduleId}_${type}`;
    let raw = localStorage.getItem(scopedKey);
    
    // Migrate old unscoped draft if it exists
    if (!raw) {
        raw = localStorage.getItem(unScopedKey);
        if (raw) {
            localStorage.setItem(scopedKey, raw);
            localStorage.removeItem(unScopedKey);
        }
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(moduleId, type) {
  try {
    localStorage.removeItem(getDraftKey(moduleId, type));
  } catch (e) {
    // ignore
  }
}

function saveResult(moduleId, type, result) {
  try {
    localStorage.setItem(getResultKey(moduleId, type), JSON.stringify(result));
    // Also persist into the user object so LearningPath can read it immediately
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const assessments = user.assessments || {};
    assessments[`${moduleId}_${type}_assessment`] = result;
    user.assessments = assessments;
    localStorage.setItem("user", JSON.stringify(user));
  } catch (e) {
    console.warn("Could not save result:", e);
  }
}

function loadResult(moduleId, type) {
  try {
    const scopedKey = getResultKey(moduleId, type);
    const unScopedKey = `algoblocks_result_${moduleId}_${type}`;
    let raw = localStorage.getItem(scopedKey);
    
    // Migrate old unscoped result if it exists
    if (!raw) {
        raw = localStorage.getItem(unScopedKey);
        if (raw) {
            localStorage.setItem(scopedKey, raw);
            localStorage.removeItem(unScopedKey);
        }
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Shuffle ──────────────────────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Module routing maps ──────────────────────────────────────────────────────
const MODULE_FIRST_LESSON = {
  "module-0": "lesson-0-1",
  "module-1": "lesson-1-1",
  "module-2": "lesson-2-1",
  "module-3": "lesson-3-1",
  "module-4": "lesson-4-1",
  "module-5": "lesson-5-1",
  "module-6": "lesson-6-1",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function AssessmentPage() {
  const { moduleId, type } = useParams(); // type = "pre" | "post"
  const navigate = useNavigate();

  const [questions, setQuestions]           = useState([]);
  const [moduleTitle, setModuleTitle]       = useState("");
  const [currentIndex, setCurrentIndex]     = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted]           = useState(false);
  const [score, setScore]                   = useState(0);
  const [loading, setLoading]               = useState(true);
  const [timeElapsed, setTimeElapsed]       = useState(0);
  const [lastSavedAt, setLastSavedAt]       = useState(null); // timestamp of last auto-save
  const [hasDraft, setHasDraft]             = useState(false); // whether a draft was restored
  const [prevResult, setPrevResult]         = useState(null);  // previously submitted result (for resume display)

  const timerRef    = useRef(null);
  const autoSaveRef = useRef(null);

  // ── 1. Load assessment JSON + restore draft / previous result ───────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/data/assessments/${moduleId}.json`);
        if (!res.ok) throw new Error("Assessment not found");
        const data = await res.json();

        // Check if there's a previously submitted result
        const existingResult = loadResult(moduleId, type);
        if (existingResult) {
          setPrevResult(existingResult);
        }

        // Check if there's an in-progress draft
        const draft = loadDraft(moduleId, type);
        if (draft && draft.questionIds) {
          // Restore the exact question order from the draft
          const idMap = Object.fromEntries(data.questions.map((q) => [q.id, q]));
          const restored = draft.questionIds.map((id) => idMap[id]).filter(Boolean);
          if (restored.length === data.questions.length) {
            setQuestions(restored);
            setSelectedAnswers(draft.selectedAnswers || {});
            setCurrentIndex(draft.currentIndex || 0);
            setTimeElapsed(draft.timeElapsed || 0);
            setHasDraft(true);
            setModuleTitle(data.moduleTitle);
            setLoading(false);
            return;
          }
        }

        // Fresh start — shuffle
        const shuffled = shuffleArray(data.questions);
        setQuestions(shuffled);
        setModuleTitle(data.moduleTitle);
      } catch (err) {
        console.error("Failed to load assessment:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [moduleId, type]);

  // ── 2. Auto-save draft every 10 seconds while answering ────────────────────
  useEffect(() => {
    if (submitted || loading || questions.length === 0) return;

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
  }, [submitted, loading, questions, selectedAnswers, currentIndex, timeElapsed, moduleId, type]);

  // ── 4. Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (submitted || loading || questions.length === 0) return;
    timerRef.current = setInterval(() => {
      setTimeElapsed((t) => t + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [submitted, loading, questions.length]);

  // ── 5. Save draft on tab close / visibility change ─────────────────────────
  useEffect(() => {
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
        // Show browser "leave page?" dialog only when answers exist
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
  }, [submitted, questions, selectedAnswers, currentIndex, timeElapsed, moduleId, type]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getScoreLabel = (s) => {
    if (s >= 90) return { label: "Excellent!",    color: "#22c55e", icon: "🏆" };
    if (s >= 75) return { label: "Proficient",    color: "#3b82f6", icon: "🎯" };
    if (s >= 60) return { label: "Developing",    color: "#f97316", icon: "📈" };
    return              { label: "Needs Review",  color: "#ef4444", icon: "📚" };
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleSelectAnswer = (optionIndex) => {
    if (submitted) return;

    const updated = { ...selectedAnswers, [currentIndex]: optionIndex };
    setSelectedAnswers(updated);

    // Immediate draft save on every answer
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

    const result = {
      moduleId,
      type,
      score: finalScore,
      correct,
      total: questions.length,
      timeElapsed,
      completedAt: new Date().toISOString(),
      // Preserve all previous attempts count
      attempts: (prevResult?.attempts ?? 0) + 1,
    };

    // Persist result + clear draft
    saveResult(moduleId, type, result);
    clearDraft(moduleId, type);

    // Sync to cloud
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.email) {
        await fetch(`${API_BASE}/api/update-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            lesson_id: `${moduleId}_${type}_assessment`,
            score: finalScore,
          }),
        });
      }
    } catch (err) {
      console.warn("Could not sync assessment to cloud:", err);
    }
  };

  const handleProceed = () => {
    if (type === "pre") {
      navigate(`/learning-path/${moduleId}/${MODULE_FIRST_LESSON[moduleId]}`);
    } else {
      navigate("/learning-path");
    }
  };

  const handleRetake = () => {
    clearDraft(moduleId, type);
    setSubmitted(false);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setTimeElapsed(0);
    setLastSavedAt(null);
    setHasDraft(false);
    setQuestions((prev) => shuffleArray(prev));
  };

  const handleDiscardDraft = () => {
    clearDraft(moduleId, type);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setTimeElapsed(0);
    setHasDraft(false);
    setQuestions((prev) => shuffleArray(prev));
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  const isPre           = type === "pre";
  const moduleNum       = moduleId?.split("-").pop();
  const answeredCount   = Object.keys(selectedAnswers).length;
  const currentQuestion = questions[currentIndex];

  // ── Loading / empty guards ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="assessment-page">
        <DashboardHeader />
        <div className="assessment-loading">Loading assessment...</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="assessment-page">
        <DashboardHeader />
        <div className="assessment-loading">Assessment not available for this module.</div>
      </div>
    );
  }

  // ── RESULTS SCREEN ────────────────────────────────────────────────────────────
  if (submitted) {
    const { label, color, icon } = getScoreLabel(score);
    const correctCount = Math.round((score / 100) * questions.length);
    return (
      <div className="assessment-page">
        <DashboardHeader />
        <div className="assessment-results-wrapper">
          <div className="results-card">
            <div className="results-header">
              <div className="results-badge" style={{ borderColor: color }}>
                <span className="results-icon">{icon}</span>
                <span className="results-label" style={{ color }}>{label}</span>
              </div>
              <h1 className="results-score" style={{ color }}>{score}%</h1>
              <p className="results-subtitle">
                {isPre ? "Pre-Assessment" : "Post-Assessment"} — Module {moduleNum}: {moduleTitle}
              </p>
              <p className="results-attempt">
                Attempt #{(prevResult?.attempts ?? 0) + 1} &nbsp;·&nbsp; {formatTime(timeElapsed)} taken
              </p>
            </div>

            <div className="results-stats">
              <div className="stat-box">
                <span className="stat-number">{correctCount}</span>
                <span className="stat-label">Correct</span>
              </div>
              <div className="stat-box">
                <span className="stat-number">{questions.length - correctCount}</span>
                <span className="stat-label">Incorrect</span>
              </div>
              <div className="stat-box">
                <span className="stat-number">{questions.length}</span>
                <span className="stat-label">Total</span>
              </div>
            </div>

            {/* Answer Review */}
            <div className="results-review">
              <h3>Answer Review</h3>
              <div className="review-list">
                {questions.map((q, i) => {
                  const userAnswer = selectedAnswers[i];
                  const correct = userAnswer === q.answer;
                  return (
                    <div key={q.id} className={`review-item ${correct ? "correct" : "incorrect"}`}>
                      <div className="review-item-header">
                        <span className="review-num">Q{i + 1}</span>
                        <span className="review-icon">
                          {correct ? <FiCheck color="#22c55e" /> : <FiX color="#ef4444" />}
                        </span>
                        <span className="review-question">{q.question}</span>
                      </div>
                      {!correct && (
                        <div className="review-answer-detail">
                          <span className="your-answer">
                            Your answer: <em>{userAnswer !== undefined ? q.options[userAnswer] : "Not answered"}</em>
                          </span>
                          <span className="correct-answer">
                            Correct: <em>{q.options[q.answer]}</em>
                          </span>
                          <span className="explanation-text">💡 {q.explanation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="results-actions">
              <button className="btn-retake" onClick={handleRetake}>Retake Assessment</button>
              <button className="btn-proceed" onClick={handleProceed}>
                {isPre ? `Start Module ${moduleNum} →` : "Back to Learning Path →"}
              </button>
            </div>

            {isPre && score < 60 && (
              <p className="results-note">
                📌 Your pre-assessment score suggests this module will introduce new concepts.
                That's perfectly fine — the lessons are designed to build your understanding from the ground up.
              </p>
            )}
            {!isPre && score >= 75 && (
              <p className="results-note" style={{ color: "#22c55e" }}>
                ✅ Great performance! You've demonstrated strong understanding of Module {moduleNum} concepts.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTION SCREEN ───────────────────────────────────────────────────────────
  return (
    <div className="assessment-page">
      <DashboardHeader />

      <div className="assessment-wrapper">
        {/* Header */}
        <div className="assessment-header">
          <div className="assessment-title-block">
            <div className="assessment-tag">{isPre ? "PRE-ASSESSMENT" : "POST-ASSESSMENT"}</div>
            <h1>Module {moduleNum}: {moduleTitle}</h1>
            <p className="assessment-subtitle">
              {isPre
                ? "This assessment measures your prior knowledge before starting the module. It does not affect your progress."
                : "This assessment evaluates your understanding after completing the module."}
            </p>
          </div>
          <div className="assessment-meta">
            <div className="meta-pill">⏱ {formatTime(timeElapsed)}</div>
            <div className="meta-pill">📝 {answeredCount}/{questions.length} answered</div>
            {lastSavedAt && (
              <div className="meta-pill saved">
                <FiSave size={12} />
                Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        </div>

        {/* Draft restore banner */}
        {hasDraft && (
          <div className="draft-banner">
            <span>🔄 Your previous session was restored — {answeredCount} answer{answeredCount !== 1 ? "s" : ""} recovered.</span>
            <button className="draft-discard-btn" onClick={handleDiscardDraft}>
              Start Fresh
            </button>
          </div>
        )}

        {/* Previous result banner */}
        {prevResult && !hasDraft && (
          <div className="prev-result-banner">
            <span>
              📊 You previously scored <strong>{prevResult.score}%</strong> on this assessment
              (Attempt #{prevResult.attempts}).
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="assessment-progress-bar">
          <div
            className="assessment-progress-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        <div className="assessment-body">
          {/* Question navigator */}
          <aside className="question-navigator">
            <h4>Questions</h4>
            <div className="question-nav-grid">
              {questions.map((_, i) => (
                <button
                  key={i}
                  className={`nav-dot ${i === currentIndex ? "active" : ""} ${
                    selectedAnswers[i] !== undefined ? "answered" : ""
                  }`}
                  onClick={() => setCurrentIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="nav-legend">
              <span className="legend-dot answered" /> Answered
              <span className="legend-dot active" /> Current
              <span className="legend-dot" /> Unanswered
            </div>
          </aside>

          {/* Question card */}
          <main className="question-main">
            <div className="question-card">
              <div className="question-counter">
                Question {currentIndex + 1} of {questions.length}
              </div>
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

              {/* Navigation */}
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
                <p className="submit-warning">
                  ⚠ Please answer all {questions.length} questions before submitting.
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