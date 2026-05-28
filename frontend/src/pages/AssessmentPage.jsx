// frontend/src/pages/AssessmentPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { progressDB, syncQueueDB } from "../db.js";
import "../styles/AssessmentPage.css";

// We use localForage via an extra DB instance or progressDB directly.
// For assessment drafts, we'll store them directly in progressDB for offline support.

const AssessmentPage = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_URL || "";

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Track specific drafts
  const [draftTimestamp, setDraftTimestamp] = useState(0);

  const activeModuleRef = useRef(moduleId);

  useEffect(() => {
    activeModuleRef.current = moduleId;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      triggerFinalAssessmentSave();
    };
  }, [moduleId]);

  // Load Assessment Questions & Smart Load Drafts
  useEffect(() => {
    if (!moduleId) return;

    const loadAssessment = async () => {
      try {
        const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!storedUser) {
          navigate("/learning-path");
          return;
        }
        const user = JSON.parse(storedUser);

        // Fetch questions JSON
        const res = await fetch(`/data/assessments/module-${moduleId}.json`);
        if (!res.ok) throw new Error("Assessment not found");
        const data = await res.json();
        setQuestions(data);

        // 1. Fetch Local Draft
        const draftId = `draft_${user.email}_assessment_${moduleId}`;
        let localDraft = null;
        try {
           localDraft = await progressDB.getItem(draftId);
        } catch(e){}

        // 2. Fetch Cloud Draft
        let cloudDraft = null;
        if (navigator.onLine) {
            try {
                const cloudRes = await fetch(`${API_BASE}/api/get-assessment?email=${user.email}&moduleId=${moduleId}`);
                if (cloudRes.ok) {
                    const cData = await cloudRes.json();
                    if (cData && cData.assessment) cloudDraft = cData.assessment;
                }
            } catch(e){}
        }

        // 3. Smart Load
        let finalDraft = null;
        const hasLocal = localDraft && Object.keys(localDraft.answers || {}).length > 0;
        const hasCloud = cloudDraft && Object.keys(cloudDraft.answers || {}).length > 0;

        if (hasLocal && hasCloud) {
            if ((localDraft.timestamp || 0) >= (cloudDraft.timestamp || 0)) {
                finalDraft = localDraft;
            } else {
                finalDraft = cloudDraft;
            }
        } else if (hasLocal) {
            finalDraft = localDraft;
        } else if (hasCloud) {
            finalDraft = cloudDraft;
            await progressDB.setItem(draftId, cloudDraft); // sync down
        }

        if (finalDraft) {
            setAnswers(finalDraft.answers || {});
            setDraftTimestamp(finalDraft.timestamp || Date.now());
            if (finalDraft.submitted) {
                setSubmitted(true);
                setScore(finalDraft.score || 0);
            }
        }
        setLoading(false);
      } catch (err) {
        console.error("Failed to load assessment:", err);
        navigate("/learning-path");
      }
    };
    loadAssessment();
  }, [moduleId, navigate, API_BASE]);

  // Handle Radio Selection
  const handleSelect = (qId, optionIdx) => {
    if (submitted) return;
    const newAnswers = { ...answers, [qId]: optionIdx };
    setAnswers(newAnswers);
    
    // Auto-save draft
    saveAssessmentDraft(newAnswers, false, 0);
  };

  const triggerFinalAssessmentSave = () => {
    // Only attempt if we have answers and haven't submitted yet
    if (Object.keys(answers).length > 0 && !submitted) {
      saveAssessmentDraft(answers, false, 0, true);
    }
  };

  const saveAssessmentDraft = async (currentAnswers, isSubmitted, currentScore, isUnmounting = false) => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    const payload = {
        userId: user.email,
        moduleId: activeModuleRef.current,
        answers: currentAnswers,
        submitted: isSubmitted,
        score: currentScore,
        timestamp: Date.now()
    };

    const draftId = `draft_${user.email}_assessment_${activeModuleRef.current}`;
    await progressDB.setItem(draftId, payload);

    if (navigator.onLine && API_BASE) {
      try {
        fetch(`${API_BASE}/api/sync-assessment`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload),
            keepalive: isUnmounting // Ensure it completes even if tab closes
        });
      } catch (err) {}
    }
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      alert("Please answer all questions before submitting.");
      return;
    }

    let calculatedScore = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.correct) {
        calculatedScore += 1;
      }
    });

    const finalPercent = Math.round((calculatedScore / questions.length) * 100);
    setScore(finalPercent);
    setSubmitted(true);

    // Save Assessment State
    await saveAssessmentDraft(answers, true, finalPercent);

    // Update Global Progress Map
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      const lessonKey = `assessment-${moduleId}`;

      if (!user.progress) user.progress = {};
      user.progress[lessonKey] = finalPercent;
      localStorage.setItem("user", JSON.stringify(user));

      const payload = { email: user.email, lesson_id: lessonKey, score: finalPercent };
      await progressDB.setItem(lessonKey, { score: finalPercent, isSynced: false });

      if (navigator.onLine) {
        try {
          await fetch(`${API_BASE}/api/update-progress`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          await progressDB.setItem(lessonKey, { score: finalPercent, isSynced: true });
        } catch (err) {
          await syncQueueDB.setItem(`sync_prog_${lessonKey}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
        }
      } else {
        await syncQueueDB.setItem(`sync_prog_${lessonKey}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
      }
    }
  };

  if (loading) {
    return <div className="assessment-loading">Loading Assessment...</div>;
  }

  return (
    <div className="assessment-page">
      <header className="assessment-header">
        <button className="back-btn" onClick={() => navigate("/learning-path")}>
          &larr; Back to Path
        </button>
        <h1>Module {moduleId} Assessment</h1>
      </header>

      <main className="assessment-content">
        {!isOnline && (
            <div style={{ backgroundColor: "#f39c12", color: "white", padding: "10px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" }}>
                You are offline. Your answers will be saved locally and synced when you reconnect.
            </div>
        )}
      
        {questions.map((q, idx) => (
          <div key={q.id} className={`question-card ${submitted ? (answers[q.id] === q.correct ? 'correct-card' : 'wrong-card') : ''}`}>
            <h3>{idx + 1}. {q.question}</h3>
            
            {q.code && (
              <pre className="code-snippet">
                <code>{q.code}</code>
              </pre>
            )}

            <div className="options-list">
              {q.options.map((opt, optIdx) => {
                let optClass = "option-label";
                if (submitted) {
                  if (optIdx === q.correct) optClass += " correct-option";
                  else if (answers[q.id] === optIdx) optClass += " wrong-option";
                }

                return (
                  <label key={optIdx} className={optClass}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={optIdx}
                      checked={answers[q.id] === optIdx}
                      onChange={() => handleSelect(q.id, optIdx)}
                      disabled={submitted}
                    />
                    <span className="option-text">{opt}</span>
                  </label>
                );
              })}
            </div>
            
            {submitted && answers[q.id] !== q.correct && (
              <div className="explanation-box">
                 <strong>Explanation: </strong> {q.explanation || "Review the module lessons to understand why this is the optimal approach."}
              </div>
            )}
          </div>
        ))}

        {submitted ? (
          <div className="results-panel">
            <h2>Assessment Complete</h2>
            <div className="score-display">Your Score: {score}%</div>
            <button className="submit-btn" onClick={() => navigate("/learning-path")}>
              Return to Modules
            </button>
          </div>
        ) : (
          <button className="submit-btn" onClick={handleSubmit}>
            Submit Answers
          </button>
        )}
      </main>
    </div>
  );
};

export default AssessmentPage;