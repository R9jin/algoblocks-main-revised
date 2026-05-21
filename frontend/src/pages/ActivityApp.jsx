import Editor from "@monaco-editor/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Split from "react-split";

import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from "../components/ComplexityGraph.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import MemoryVisualizer from "../components/MemoryVisualizer.jsx";

import "../styles/ActivityApp.css";
import { translatePythonError } from "../utils/errorTranslator.js";
import { formatComplexity } from "../utils/formatters";

import { submissionsDB, syncQueueDB, templatesDB } from "../db.js";
import { sharedAnalyzerWorker } from "../workers/analyzerInstance.js";

const handleEditorWillMount = (monaco) => {
  monaco.editor.defineTheme("algoblocks-purple", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1C1236",
      "editor.foreground": "#EBE4FF",
      "editorLineNumber.foreground": "#6C5CE7",
      "editor.lineHighlightBackground": "#2D234A",
      "editorCursor.foreground": "#FFFFFF",
      "editor.selectionBackground": "#6C5CE755",
      "editor.inactiveSelectionBackground": "#6C5CE733",
    },
  });
};

const renderFormattedTask = (text) => {
  if (!text || typeof text !== "string") return null;
  const formattedHtml = text
    .replace(/\n/g, "<br/>")
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #26004a;">$1</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #4400ff;">$1</code>'
    );
  return <div dangerouslySetInnerHTML={{ __html: formattedHtml }} />;
};

const getComplexityColor = (complexity) => {
  const comp = String(complexity || "").toLowerCase();
  if (comp.includes("o(1)")) return "#2ecc71";
  if (comp.includes("log n") && !comp.includes("n log")) return "#3498db";
  if (comp.includes("o(n)") && !comp.includes("log")) return "#f1c40f";
  if (comp.includes("n log n")) return "#e67e22";
  if (comp.includes("n^2") || comp.includes("n²")) return "#e74c3c";
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("n!")) return "#9b59b6";
  return "#95a5a6";
};

const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, "");

  if (comp.includes("n!") || comp.includes("n*t(n-1)")) return 9;
  if (
    comp.includes("2^n") ||
    comp.includes("2ⁿ") ||
    comp.includes("t(n-1)+t(n-2)")
  )
    return 8;
  if (comp.includes("n^3") || comp.includes("n³")) return 7;
  if (
    comp.includes("n^2") ||
    comp.includes("n²") ||
    comp.includes("t(n-1)+o(n)")
  )
    return 6;
  if (
    comp.includes("nlogn") ||
    comp.includes("2t(n/2)+o(n)") ||
    comp.includes("t(n-1)+o(logn)")
  )
    return 5;
  if (comp.includes("v+e")) return 4.5;
  if (
    comp.includes("o(n)") ||
    comp.includes("o(m)") ||
    comp.includes("2t(n/2)+o(1)") ||
    comp.includes("t(n/2)+o(n)") ||
    comp.includes("t(n-1)+o(1)")
  )
    return 4;
  if (comp.includes("√n") || comp.includes("sqrt")) return 3;
  if (comp.includes("logn") || comp.includes("log") || comp.includes("t(n/2)+o(1)")) return 2;
  if (comp.includes("o(1)")) return 1;

  return 0;
};

const formatExplanation = (text, isBottleneck, isLocalTab) => {
  if (!text) return null;
  const sections = text.split(/\n\n+/);

  return sections
    .map((sec, idx) => {
      const match = sec.match(/^\s*\*\*(.*?)\*\*(.*)$/s);
      if (!match) {
        return (
          <p
            key={idx}
            style={{ color: "#1e293b", margin: "0 0 8px 0", fontSize: "0.9rem", lineHeight: "1.6" }}
          >
            {sec.trim()}
          </p>
        );
      }

      const title = match[1].replace(/:$/, "").trim();
      const content = match[2].replace(/^:/, "").trim();
      const titleLower = title.toLowerCase();

      let type = null;
      if (
        titleLower.includes("bottleneck") ||
        titleLower.includes("factor") ||
        titleLower.includes("slowest") ||
        titleLower.includes("memory user")
      )
        type = "warning";
      else if (titleLower.includes("tip") || titleLower.includes("insight")) type = "tip";
      else if (
        titleLower.includes("optimized") ||
        titleLower.includes("efficient") ||
        titleLower.includes("mastery") ||
        titleLower.includes("scaling")
      )
        type = "praise";

      if (!type) {
        return (
          <p
            key={idx}
            style={{ color: "#1e293b", margin: "0 0 8px 0", fontSize: "0.9rem", lineHeight: "1.6" }}
          >
            <strong>{title}:</strong> {content}
          </p>
        );
      }

      if (type === "warning" && (isLocalTab || !isBottleneck)) return null;

      let bgColor = "rgba(0,0,0,0.05)";
      let borderColor = "#888";
      let titleColor = "#333";

      if (type === "warning") {
        bgColor = "rgba(255, 55, 95, 0.08)";
        borderColor = "#ff375f";
        titleColor = "#d63031";
      } else if (type === "tip") {
        bgColor = "rgba(52, 152, 219, 0.08)";
        borderColor = "#3498db";
        titleColor = "#2980b9";
      } else if (type === "praise") {
        bgColor = "rgba(46, 204, 113, 0.08)";
        borderColor = "#2ecc71";
        titleColor = "#27ae60";
      }

      return (
        <div
          key={idx}
          style={{
            marginTop: "12px",
            padding: "10px 14px",
            backgroundColor: bgColor,
            borderLeft: `4px solid ${borderColor}`,
            borderRadius: "0 6px 6px 0",
          }}
        >
          <strong
            style={{
              display: "block",
              color: titleColor,
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "6px",
            }}
          >
            {title}
          </strong>
          <p style={{ margin: 0, color: "#1e293b", fontSize: "0.85rem", lineHeight: "1.5" }}>{content}</p>
        </div>
      );
    })
    .filter(Boolean);
};

const ActivityApp = () => {
  const VERCEL_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

  const { moduleId, activityId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!moduleId || !activityId) navigate("/learning-path", { replace: true });
  }, [moduleId, activityId, navigate]);

  // Refs
  const workspaceRef = useRef(null);
  const consoleEndRef = useRef(null);
  const workerRef = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const isDragging = useRef(false);

  // Synchronize state trackers
  const latestBlocksJsonRef = useRef(null);
  const saveDraftTimeoutRef = useRef(null);

  // UI state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...\n");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);

  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [expandedTests, setExpandedTests] = useState({});
  const [bottomPanel, setBottomPanel] = useState(null);
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeTab, setActiveTab] = useState("local");

  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");

  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});

  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", isDanger: false, onConfirmAction: null, onCancelAction: null });
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [syntaxError, setSyntaxError] = useState(null);
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});
  const [panelHeight, setPanelHeight] = useState(300);

  const [activityDataResolved, setActivityDataResolved] = useState(null);
  const [topicIdResolved, setTopicIdResolved] = useState(null);
  const [lessonActivitiesResolved, setLessonActivitiesResolved] = useState([]);

  const totalTests = useMemo(() => activityDataResolved?.testCasesList?.length || 0, [activityDataResolved]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Connection restored. Syncing drafts...", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("Connection lost. Using local IndexedDB cache.", "error");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const initWorker = () => {
    if (!workerRef.current) return;

    workerRef.current.onmessage = (event) => {
      const { type, data, counts } = event.data;

      if (type === "ANALYZE_RESULT") {
        if (data.status === "success") {
          setAnalysisTime(data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00");
          setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });

          const initialCounts = {};
          (data.lines || []).forEach((l) => {
            if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits;
          });
          setLineExecutions(initialCounts);
          setSyntaxError(null);
        } else {
          const hint = translatePythonError(data.message);
          setSyntaxError({ line: data.line, message: `${data.message}. ${hint}` });
        }
      } else if (type === "RUN_RESULT") {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const resultData = data !== undefined && data !== null && data !== "" ? `\n${String(data)}` : "";
        setConsoleOutput((prev) => prev + flushed + resultData + "\n> Program finished.\n");
        if (counts) setLineExecutions(counts);
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      } else if (type === "OUTPUT") {
        outputCountRef.current += 1;
        pendingOutputRef.current += data;
        if (outputCountRef.current > 5000) {
          clearTimeout(runTimeoutRef.current);
          clearInterval(renderIntervalRef.current);
          workerRef.current.terminate();
          workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url), { type: "module" });
          workerRef.current.postMessage({ type: "INIT_ENGINE" });
          initWorker();
          const flushed = pendingOutputRef.current;
          pendingOutputRef.current = "";
          setConsoleOutput(
            (prev) =>
              prev +
              flushed +
              "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n"
          );
          setIsEvaluating(false);
          setIsWaitingForInput(false);
          outputCountRef.current = 0;
        }
      } else if (type === "INPUT_REQUEST") {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + data.prompt);
        setIsWaitingForInput(true);
      } else if (type === "ERROR") {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput((prev) => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }
    };
  };

  useEffect(() => {
    workerRef.current = sharedAnalyzerWorker;
    initWorker();
    return () => {
      clearTimeout(runTimeoutRef.current);
      clearInterval(renderIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === "output") {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleOutput, isWaitingForInput, consoleTab]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const newHeight = window.innerHeight - e.clientY - 48;
      if (newHeight >= 150 && newHeight <= window.innerHeight - 150) setPanelHeight(newHeight);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const toggleLine = (index) => setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });
  const handleDragStart = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  const fetchJsonWithCache = async (cacheKey, url) => {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        try { await templatesDB.setItem(cacheKey, json); } catch (e) { /* ignore */ }
        return json;
      }
    } catch (e) {
      console.warn(`Network fetch failed for ${url}, falling back to cache.`);
    }

    try {
      const cached = await templatesDB.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { /* ignore */ }

    throw new Error(`Fetch failed for ${url} and no cache available.`);
  };

  const resolveActivityFromModule = async () => {
    const mid = String(moduleId).replace(/[^0-9]/g, "");
    if (!mid) throw new Error("Invalid moduleId");

    const moduleUrl = `/data/modules/module_${mid}.json`;
    const modulesJson = await fetchJsonWithCache(`modules:module_${mid}`, moduleUrl);

    const topics = modulesJson?.topics || [];
    let currentTopic = null;
    let activitiesInTopic = [];

    for (const t of topics) {
      if (t?.activities?.some((a) => a?.id === activityId)) {
        currentTopic = t;
        activitiesInTopic = t.activities;
        break;
      }
    }

    if (!currentTopic) throw new Error("Activity not found in module topics");

    setTopicIdResolved(currentTopic.id);
    setLessonActivitiesResolved(activitiesInTopic);

    const activitiesUrl = `/data/activities/module_${mid}.json`;
    const activitiesJson = await fetchJsonWithCache(`activities:module_${mid}`, activitiesUrl);

    for (const [lessonKey, list] of Object.entries(activitiesJson || {})) {
      if (!Array.isArray(list)) continue;
      const found = list.find((x) => x && x.id === activityId);
      if (found) {
        const testCasesList = (found.testCasesPool || []).map((tc) => ({
          call: tc.call,
          expected: tc.expected,
          isHidden: !!tc.isHidden,
        }));

        return {
          id: found.id,
          title: found.title || lessonKey,
          task: found.task,
          difficulty: found.difficulty || "Easy",
          testCasesList,
        };
      }
    }

    throw new Error("Activity not found in module activities JSON");
  };

  const resetActivitySessionState = () => {
    setGeneratedPython("# Drag blocks to generate Python code");
    setConsoleOutput("Ready to run...\n");
    setViewMode("workspace");
    setPassedTests(0);
    setIsEvaluating(false);
    setConsoleTab("output");
    setBottomPanel(null);
    setExpandedTests({});
    setExpandedLines({});
    setSyntaxError(null);
    setLineExecutions({});
    setAnalysisResult({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
    setAnalysisTime("0.0");
    setIsEditingCode(false);
    pendingOutputRef.current = "";
    outputCountRef.current = 0;
  };

  useEffect(() => {
    if (!moduleId || !activityId) return;

    resetActivitySessionState();
    let cancelled = false;

    const boot = async () => {
      try {
        const resolvedActivity = await resolveActivityFromModule();
        if (cancelled) return;
        setActivityDataResolved(resolvedActivity);

        // --- SUBMISSION LOADING PIPELINE (MONGODB -> INDEXEDDB) ---
        const storedUser = localStorage.getItem("user");
        let loadedSubmission = null;

        if (storedUser) {
           const user = JSON.parse(storedUser);
           const submissionId = `${user.email}_${moduleId}_${activityId}`;
           
           try {
             // Try fetching from local IndexedDB first
             loadedSubmission = await submissionsDB.getItem(submissionId);
             
             // If not found locally, fetch from cloud
             if (!loadedSubmission && navigator.onLine) {
                const res = await fetch(`${VERCEL_URL}/api/get-submission?email=${user.email}&activityId=${activityId}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data && data.submission) {
                     loadedSubmission = data.submission;
                     await submissionsDB.setItem(submissionId, loadedSubmission);
                  }
                }
             }
           } catch (e) { console.error("Restoration error", e); }
        }

        // Apply Submission Restoration
        if (loadedSubmission) {
          try {
            const json = loadedSubmission.workspace?.blocklyJson;
            const pythonCode = loadedSubmission.pythonCode;
            latestBlocksJsonRef.current = json; 
            
            if (workspaceRef.current?.loadTemplate && json) {
              workspaceRef.current.loadTemplate(json);
            }
            if (pythonCode) setGeneratedPython(pythonCode);

            // Restore Score UI
            if (loadedSubmission.score !== undefined) {
               setPassedTests(loadedSubmission.passedTests || 0);
            }
          } catch (e) {
            if (workspaceRef.current?.clear) workspaceRef.current.clear();
          }
        } else {
          if (workspaceRef.current?.clear) workspaceRef.current.clear();
        }
        // -----------------------------------------------------

        // Load saved test results for the UI Panel (Terminal output history)
        const savedTests = localStorage.getItem(`activity_tests_${moduleId}_${activityId}`);
        if (savedTests) {
          try {
            const { consoleOutput: savedOut, passedTests: savedPassed } = JSON.parse(savedTests);
            if (savedOut) setConsoleOutput(savedOut);
            if (savedPassed !== undefined) setPassedTests(savedPassed);
          } catch (e) {
            console.error("Failed to parse saved tests", e);
          }
        }

        setViewMode("workspace");
        setIsEditingCode(false);
      } catch (e) {
        console.error("Activity bootstrap failed:", e);
        showToast("Failed to load activity. Returning to path...", "error");
        if (!cancelled) navigate("/learning-path", { replace: true });
      }
    };

    boot();
    return () => { cancelled = true; };
  }, [moduleId, activityId]);

  // --- AUTOMATIC SYNC TO INDEXEDDB + MONGODB ---
  const saveSubmission = async (json, pythonCode, score = 0, passed = 0, total = 0, testResults = []) => {
    if (!moduleId || !activityId) return;
    
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    const submissionId = `${user.email}_${moduleId}_${activityId}`;
    const payload = {
      userId: user.email,
      moduleId,
      activityId,
      status: score >= 1 ? "passed" : "failed",
      score,
      maxScore: 5,
      passedTestCases: passed,
      totalTestCases: total,
      testCases: testResults,
      workspace: { blocklyJson: json },
      pythonCode,
      submittedAt: new Date().toISOString(),
      isSynced: false
    };

    // 1. Save locally to IndexedDB immediately
    await submissionsDB.setItem(submissionId, payload);

    // 2. Sync / Queue
    if (navigator.onLine) {
      try {
        await fetch(`${VERCEL_URL}/api/sync-submission`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        payload.isSynced = true;
        await submissionsDB.setItem(submissionId, payload);
      } catch (e) {
        // Fallback to queue
        await syncQueueDB.setItem(`sync_${submissionId}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
      }
    } else {
      await syncQueueDB.setItem(`sync_${submissionId}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
    }
  };

  const handleWorkspaceAutoSave = (json, pythonCode) => {
    if (!moduleId || !activityId) return;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    saveDraftTimeoutRef.current = setTimeout(async () => {
        // Just keep the local tracking updated as a 'failed' or 0 score state for auto-save
        await saveSubmission(json, pythonCode, 0, 0, totalTests, []);
    }, 1000); // 1 Second Debounce
  };

  const analyzeCode = async (code) => {
    if (!code || code.trim() === "") return;

    if (isOnline) {
      try {
        const response = await fetch(`${VERCEL_URL}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) throw new Error("FastAPI analyze endpoint failed");
        const data = await response.json();

        if (data.status === "success") {
          setAnalysisTime(data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00");
          setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });

          const initialCounts = {};
          (data.lines || []).forEach((l) => {
            if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits;
          });
          setLineExecutions(initialCounts);
          setSyntaxError(null);
        } else {
          const hint = translatePythonError(data.message);
          setSyntaxError({ line: data.line, message: `${data.message}. ${hint}` });
        }
        return;
      } catch (error) {
        console.warn("Online analysis failed, falling back to local worker.", error);
      }
    }
    workerRef.current?.postMessage({ type: "ANALYZE_CODE", code });
  };

  useEffect(() => {
    if (!isEditingCode) return;
    const timeoutId = setTimeout(() => analyzeCode(generatedPython), 500);
    return () => clearTimeout(timeoutId);
  }, [generatedPython, isEditingCode, isOnline]);

  const handleWorkspaceChange = async (json, pythonCode) => {
    latestBlocksJsonRef.current = json; 

    const oldCode = (generatedPython || "").trim();
    const newCode = (pythonCode || "").trim();

    handleWorkspaceAutoSave(json, pythonCode);

    if (!isEditingCode && oldCode !== newCode) {
      setGeneratedPython(pythonCode);
      setLineExecutions({});
      analyzeCode(pythonCode);
    }
  };

  const handleSyncToBlocks = async () => {
    if (workspaceRef.current && generatedPython) {
      try {
        await workspaceRef.current.loadFromPython(generatedPython);
        setIsEditingCode(false);
        setViewMode("workspace");
      } catch (e) {
        setModalConfig({
          isOpen: true,
          title: "Sync Error",
          message: "Cannot sync to blocks until syntax errors are fixed.",
          confirmText: "Close",
          cancelText: "Ok",
          isDanger: true,
          onConfirmAction: closeModal,
          onCancelAction: closeModal,
        });
      }
    }
  };

  const handleActivityRun = async () => {
    if (isEvaluating) return;
    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute.");
      setBottomPanel("console");
      setConsoleTab("output");
      return;
    }

    clearTimeout(runTimeoutRef.current);
    clearInterval(renderIntervalRef.current);

    setIsEvaluating(true);
    setLineExecutions({});
    setBottomPanel("console");
    setConsoleTab("output");
    setConsoleOutput((prev) => prev + "\n> Running the program...\n");

    outputCountRef.current = 0;
    pendingOutputRef.current = "";
    renderIntervalRef.current = setInterval(() => {
      if (pendingOutputRef.current) {
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed);
      }
    }, 100);

    workerRef.current?.postMessage({ type: "RUN_CODE", code: generatedPython });

    runTimeoutRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      clearInterval(renderIntervalRef.current);

      workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url), { type: "module" });
      workerRef.current.postMessage({ type: "INIT_ENGINE" });
      initWorker();

      const flushed = pendingOutputRef.current;
      pendingOutputRef.current = "";
      setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
      setIsEvaluating(false);
      setIsWaitingForInput(false);
    }, 10000);
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: "INPUT_RESPONSE", data: userInput });
      outputCountRef.current = 0;
      setUserInput("");
      setIsWaitingForInput(false);

      renderIntervalRef.current = setInterval(() => {
        if (pendingOutputRef.current) {
          const flushed = pendingOutputRef.current;
          pendingOutputRef.current = "";
          setConsoleOutput((prev) => prev + flushed);
        }
      }, 100);

      runTimeoutRef.current = setTimeout(() => {
        workerRef.current?.terminate();
        clearInterval(renderIntervalRef.current);
        workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url), { type: "module" });
        workerRef.current.postMessage({ type: "INIT_ENGINE" });
        initWorker();

        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const savePartialProgress = async (lessonId, score) => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    if (!user.progress) user.progress = {};
    user.progress[lessonId] = Math.max(user.progress[lessonId] || 0, score);
    localStorage.setItem("user", JSON.stringify(user));

    try {
      await fetch(`${VERCEL_URL}/api/update-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, lesson_id: lessonId, score }),
      });
    } catch (error) { /* ignore */ }
  };

  const completeFullTopic = async (topicId) => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    if (!user.progress) user.progress = {};
    user.progress[topicId] = true;
    localStorage.setItem("user", JSON.stringify(user));

    try {
      await fetch(`${VERCEL_URL}/api/update-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, lesson_id: topicId, score: 100, completed: true }),
      });
    } catch (error) {
      console.error("Failed to mark topic complete", error);
    }
  };

  const executeTest = async (codeToRun) => {
    if (isOnline) {
      try {
        const response = await fetch(`${VERCEL_URL}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeToRun }),
        });
        if (!response.ok) throw new Error("FastAPI execution failed");
        const data = await response.json();

        if (data.counts) {
          setLineExecutions((prev) => {
            const next = { ...prev };
            for (const [key, val] of Object.entries(data.counts)) next[key] = (next[key] || 0) + val;
            return next;
          });
        }

        if (data.error) {
          const hint = translatePythonError(data.error);
          throw new Error(data.error + (hint ? `\n${hint}` : ""));
        }

        return data.output !== undefined && data.output !== null ? String(data.output) : "";
      } catch (error) {
        console.warn("Online test execution failed, falling back to local...", error);
      }
    }

    return new Promise((resolve, reject) => {
      let outputAccumulator = "";
      const timeout = setTimeout(() => {
        workerRef.current?.terminate();
        workerRef.current = new Worker(new URL("../workers/analyzer.worker.js", import.meta.url), { type: "module" });
        workerRef.current.postMessage({ type: "INIT_ENGINE" });
        initWorker();
        reject(new Error("Infinite Loop detected. Execution timed out after 10 seconds."));
      }, 10000);

      workerRef.current.onmessage = (event) => {
        const { type, data, counts } = event.data;
        if (type === "OUTPUT") {
          outputAccumulator += data;
        } else if (type === "RUN_RESULT") {
          clearTimeout(timeout);
          outputAccumulator += data !== undefined && data !== null ? data : "";
          if (counts) {
            setLineExecutions((prev) => {
              const next = { ...prev };
              for (const [key, val] of Object.entries(counts)) next[key] = (next[key] || 0) + val;
              return next;
            });
          }
          initWorker();
          resolve(outputAccumulator);
        } else if (type === "ERROR") {
          clearTimeout(timeout);
          initWorker();

          const hint = translatePythonError(data);
          const errorMsg = data + (hint ? `\n${hint}` : "");
          reject(new Error(errorMsg));
        }
      };

      workerRef.current.postMessage({ type: "RUN_CODE", code: codeToRun });
    });
  };

  const handleSuccess = (score, maxScore) => {
    const currentIndex = lessonActivitiesResolved.findIndex(a => a.id === activityId);
    const isLast = currentIndex === lessonActivitiesResolved.length - 1;
    const nextActivity = !isLast ? lessonActivitiesResolved[currentIndex + 1] : null;

    let promptMsg = "";
    if (score === maxScore) {
      promptMsg = `Perfect execution! You earned a maximum score of ${score}/${maxScore}.\n\nReady for the next challenge?`;
    } else {
      promptMsg = `Good effort! You met the minimum passing requirements with a score of ${score}/${maxScore}.\n(Hidden test cases or slight inefficiencies reduced your score).\n\nReady to proceed?`;
    }

    if (!isLast && nextActivity) {
      setModalConfig({
        isOpen: true,
        title: "Activity Completed! 🎉",
        message: promptMsg,
        confirmText: "Next Activity",
        cancelText: "Stay Here",
        isDanger: false,
        onConfirmAction: () => {
          closeModal();
          navigate(`/activity/${moduleId}/${nextActivity.id}`);
        },
        onCancelAction: closeModal,
      });
    } else {
      setModalConfig({
        isOpen: true,
        title: "Lesson Completed! 🏆",
        message: `Incredible! You have finished all activities in this lesson.\n\nReturn to the learning path to unlock the next topic.`,
        confirmText: "Finish Lesson",
        cancelText: "Stay Here",
        isDanger: false,
        onConfirmAction: async () => {
          closeModal();
          if (topicIdResolved) {
            await completeFullTopic(topicIdResolved);
          }
          navigate("/learning-path");
        },
        onCancelAction: closeModal,
      });
    }
  };

  const toggleTest = (index) => setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] }));

  const runTestCases = async () => {
    if (isEvaluating) return;

    const testCases = activityDataResolved?.testCasesList || [];
    if (!testCases.length) return;

    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute.");
      setBottomPanel("console");
      setConsoleTab("output");
      return;
    }

    setIsEvaluating(true);
    setLineExecutions({});
    setConsoleOutput("Running pre-flight checks (Detecting infinite loops)...\n");
    setBottomPanel("console");
    setConsoleTab("output");

    try {
      await executeTest(generatedPython);
    } catch (failure) {
      const errorMsg = `Test Execution Prevented:\n\n${failure.error || failure.message}`;
      setConsoleOutput(errorMsg);
      setBottomPanel("console");
      setIsEvaluating(false);
      
      localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({
        consoleOutput: errorMsg,
        passedTests: 0
      }));
      return;
    }

    setBottomPanel("console");
    setConsoleOutput("\n> Running Tests...\n");
    setPassedTests(0);

    let passed = 0;
    let visiblePassed = 0;
    let visibleTotal = 0;
    const total = testCases.length;

    testCases.forEach(tc => {
      if (!tc.isHidden) visibleTotal++;
    });

    let fullOutput = "\n> --- Running Test Cases ---\n";

    for (let i = 0; i < total; i++) {
      const tc = testCases[i];
      const isFunctionCall = tc.call?.includes("(") && tc.call?.includes(")");
      const taskId = activityDataResolved?.id || "";
      const isIntroLevel = taskId === "l1-t1" || taskId === "l1-t3";

      let codeToRun = "";
      if (isFunctionCall && !isIntroLevel) {
        codeToRun =
          generatedPython +
          `\n\ntry:\n    assert ${tc.call} == ${tc.expected}\n    print("TEST_PASSED_FLAG")\nexcept:\n    print("TEST_ERROR_FLAG")`;
      } else {
        codeToRun = `${generatedPython}\n${tc.call || ""}`;
      }

      try {
        const rawOutput = await executeTest(codeToRun);
        const actualOutput = rawOutput.trim();
        const expected = String(tc.expected).replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();

        let testPassed = false;
        if (isFunctionCall && !isIntroLevel) {
          if (actualOutput.includes("TEST_PASSED_FLAG")) {
            passed++;
            testPassed = true;
          }
        } else {
          if (actualOutput.trim() === expected) {
            passed++;
            testPassed = true;
          }
        }

        if (testPassed && !tc.isHidden) {
          visiblePassed++;
        }

        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;
        if (!testPassed) {
          if (tc.isHidden) {
            fullOutput += `   [Hidden Test Case] Expected values and inputs are omitted.\n`;
          } else {
            fullOutput += `   Expected: ${expected}\n   Actual: ${actualOutput}\n`;
          }
        }
        fullOutput += "\n";

        setConsoleOutput(fullOutput);
        setPassedTests(passed);

      } catch (err) {
        fullOutput += `Test ${i + 1}: ERROR\n   Message: ${err.message}\n\n`;
        setConsoleOutput(fullOutput);
      }
    }

    setIsEvaluating(false);
    
    // Dynamic Scoring Rule
    const score = passed === 0 ? 0 : Math.max(1, Math.round((passed / total) * 5));

    // Construct detailed test results for persistence
    const testResults = testCases.map((tc, idx) => ({
      id: `tc_${idx}`,
      status: fullOutput.includes(`Test ${idx + 1}: PASSED`) ? "passed" : "failed"
    }));

    // Trigger Unified Submission Save
    await saveSubmission(latestBlocksJsonRef.current, generatedPython, score, passed, total, testResults);
    
    localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({
      consoleOutput: fullOutput,
      passedTests: passed,
      score: score
    }));
    
    // Partial progress compile rule
    const lessonKey = `${moduleId}:${activityId}`;
    await savePartialProgress(lessonKey, score);

    // Progression Unlock Rule: Score >= 1
    if (score >= 1) {
      handleSuccess(score, 5);
    }
  };

  const lines = analysisResult?.lines || [];
  let maxWeight = 0;
  let bottleneckIndices = [];

  lines.forEach((line, index) => {
    const targetComplexity = activeTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)";
    const weight = getComplexityWeight(targetComplexity);

    if (weight > maxWeight) {
      maxWeight = weight;
      bottleneckIndices = [index];
    } else if (weight === maxWeight && weight > 0) {
      bottleneckIndices.push(index);
    }
  });

  const actualBottleneckIndices = maxWeight >= 5 ? bottleneckIndices : [];
  const pythonLines = (generatedPython || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(lineExecutions));

  return (
    <div className="activity-app-container">
      {toast.show && (
        <div
          className={`toast-notification ${toast.type === "error" ? "toast-error" : "toast-success"}`}
          style={{ position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 9999 }}
        >
          {toast.message}
        </div>
      )}

      <header className="activity-topbar">
        <div className="activity-back-btn" onClick={() => navigate("/learning-path")}>
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Dashboard
        </div>

        <div className="activity-toggle-group">
          <button className={`activity-toggle-btn ${viewMode === "workspace" ? "active" : ""}`} onClick={() => setViewMode("workspace")}>Workspace</button>
          <button className={`activity-toggle-btn ${viewMode === "python" ? "active" : ""}`} onClick={() => setViewMode("python")}>Python Code</button>
        </div>

        <div className="activity-actions" style={{ display: "flex", gap: "10px" }}>
          <button
            className="activity-action-btn"
            onClick={handleActivityRun}
            style={{
              backgroundColor: "#2D234A",
              border: "1px solid #6C5CE7",
              color: "#EBE4FF",
              opacity: isEvaluating ? 0.7 : 1,
              cursor: isEvaluating ? "not-allowed" : "pointer",
            }}
            title="Run code in console without submitting to test cases"
          >
            {isEvaluating ? "..." : "▷ Run Code"}
          </button>
          <button className="activity-action-btn run-btn" onClick={runTestCases} style={{ opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? "not-allowed" : "pointer" }}>
            {isEvaluating ? "..." : "▶ Run Tests"}
          </button>
        </div>
      </header>

      <Split className={`activity-main-layout ${!isLeftPanelVisible ? "left-hidden" : ""}`} sizes={[25, 50, 25]} minSize={[isLeftPanelVisible ? 250 : 0, 400, 250]} gutterSize={8}>
        <aside className="activity-left-panel">
          
          {lessonActivitiesResolved.length > 0 && (
            <div className="activity-selector-container">
              <label className="activity-selector-label">
                <img src="/assets/learning-icon.png" alt="List" style={{ width: "16px", height: "16px" }} />
                Lesson Outline
              </label>
              <select
                className="activity-selector-dropdown"
                value={activityId}
                onChange={(e) => navigate(`/activity/${moduleId}/${e.target.value}`)}
              >
                {lessonActivitiesResolved.map((act, index) => (
                  <option key={act.id} value={act.id}>
                    {index + 1}. {act.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="activity-panel-header" style={{ paddingTop: "15px" }}>
            <h2>
              <img src="/assets/console-icon.png" alt="Icon" style={{ width: "24px" }} /> Description
            </h2>
          </div>

          <div className="activity-panel-content">
            <div className="activity-task-header" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", marginTop: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "1.4rem", color: "#2b005c", fontWeight: "bold" }}>
                {activityDataResolved?.title || "Loading..."}
              </h2>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  backgroundColor:
                    activityDataResolved?.difficulty === "Easy"
                      ? "rgba(0, 184, 163, 0.15)"
                      : activityDataResolved?.difficulty === "Medium"
                        ? "rgba(255, 192, 30, 0.15)"
                        : "rgba(255, 55, 95, 0.15)",
                  color:
                    activityDataResolved?.difficulty === "Easy"
                      ? "#00b8a3"
                      : activityDataResolved?.difficulty === "Medium"
                        ? "#ffc01e"
                        : "#ff375f",
                }}
              >
                {activityDataResolved?.difficulty || "Easy"}
              </span>
            </div>

            <div className="activity-card" style={{ lineHeight: "1.7", fontSize: "0.95rem", backgroundColor: "transparent", border: "none", padding: "0", color: "#2f2f2f" }}>
              {renderFormattedTask(activityDataResolved?.task || "Loading activity...")}
            </div>
          </div>
        </aside>

        <main className="workspace-main activity-center-panel">
          <button className={`sidebar-toggle-btn ${!isLeftPanelVisible ? "closed" : ""}`} onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} title={isLeftPanelVisible ? "Hide Instructions" : "Show Instructions"}>
            <span className="toggle-icon">{isLeftPanelVisible ? "❮" : "❯"}</span>
          </button>

          <div className="editor-container" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div className={viewMode === "workspace" ? "workspace-view d-block" : "workspace-view d-none"} style={{ display: viewMode === "workspace" ? "block" : "none", height: "100%" }}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} syntaxError={syntaxError} />
            </div>

            <div className={viewMode === "python" ? "python-view d-flex" : "python-view d-none"} style={{ display: viewMode === "python" ? "flex" : "none", flexDirection: "column", height: "100%", background: "#1C1236" }}>
              <div className="python-header" style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
                <span className="python-sync-status" style={{ color: "#EBE4FF", fontSize: "0.85rem" }}>{isEditingCode ? "✏️ Unsaved code changes..." : "Code is synced with blocks."}</span>
                <button onClick={handleSyncToBlocks} disabled={!isEditingCode} className={`python-sync-btn ${isEditingCode ? "active" : "disabled"}`} style={{ padding: "5px 12px", borderRadius: "4px", cursor: isEditingCode ? "pointer" : "not-allowed", backgroundColor: isEditingCode ? "#6C5CE7" : "#444", color: "white", border: "none" }}>
                  Sync to Blocks ↻
                </button>
              </div>

              <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                {syntaxError && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(231, 76, 60, 0.9)", color: "white", padding: "6px 15px", zIndex: 10, fontSize: "0.85rem", fontWeight: "bold", display: "flex", justifyContent: "space-between" }}>
                    <span>
                      Syntax Error on line {syntaxError.line}: {syntaxError.message}
                    </span>
                    <button onClick={() => setSyntaxError(null)} style={{ background: "transparent", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>✕</button>
                  </div>
                )}

                <Editor
                  height="100%"
                  language="python"
                  theme="algoblocks-purple"
                  beforeMount={handleEditorWillMount}
                  value={generatedPython}
                  onChange={(value) => {
                    const newCode = value || "";
                    setGeneratedPython(newCode);
                    setIsEditingCode(true);
                    if (syntaxError) setSyntaxError(null);
                    
                    // Unified save for pure python typers
                    handleWorkspaceAutoSave(latestBlocksJsonRef.current, newCode);
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 15, fontFamily: "Consolas, 'Courier New', monospace", scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: "smooth", formatOnPaste: true, suggestOnTriggerCharacters: true, wordWrap: "on", padding: { top: 16 } }}
                />
              </div>
            </div>
          </div>

          {bottomPanel && (
            <div className="bottom-hover-panel" style={{ height: `${panelHeight}px` }}>
              <div className="panel-resizer" onMouseDown={handleDragStart}>
                <div className="resizer-dash"></div>
              </div>

              <div className="panel-header">
                <span className="panel-title">{bottomPanel === "console" ? "Console Panel" : "Complexity Analysis"}</span>
                <button onClick={() => setBottomPanel(null)} className="panel-close-btn">✕</button>
              </div>

              <div className="panel-body" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {bottomPanel === "console" ? (
                  <div className="console-content-wrapper" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                    <div className="complexity-tabs" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "10px", marginBottom: "0", paddingTop: "5px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="tab-btn-group">
                        <button onClick={() => setConsoleTab("output")} className={`tab-btn ${consoleTab === "output" ? "active" : ""}`}>Terminal Output</button>
                        <button onClick={() => setConsoleTab("executions")} className={`tab-btn ${consoleTab === "executions" ? "active" : ""}`}>Line Executions</button>
                      </div>

                      {consoleTab === "output" && (
                        <button
                          onClick={() => setConsoleOutput("Ready to run...\n")}
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.15)",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            borderRadius: "6px",
                            padding: "5px 14px",
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginLeft: "auto",
                          }}
                          title="Clear Terminal Output"
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.25)")}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)")}
                        >
                          Clear Console
                        </button>
                      )}
                    </div>

                    <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                      {consoleTab === "output" ? (
                        <div className="console-container" style={{ height: "100%" }}>
                          <pre className="console-output">{consoleOutput}</pre>
                          {isWaitingForInput && (
                            <div className="console-input-line">
                              <span className="console-cursor">❯</span>
                              <input autoFocus value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleSendInput} className="console-input-field" placeholder="Type here and press Enter..." />
                            </div>
                          )}
                          <div ref={consoleEndRef} />
                        </div>
                      ) : (
                        <div className="complexity-table-wrapper" style={{ height: "100%", margin: 0, border: "none" }}>
                          <table className="complexity-table">
                            <thead>
                              <tr>
                                <th style={{ width: "60px", textAlign: "center" }}>Line</th>
                                <th>Source Code</th>
                                <th style={{ width: "100px", textAlign: "center" }}>Hits</th>
                                <th style={{ width: "30%" }}>Frequency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pythonLines.map((lineText, idx) => {
                                const lineNum = idx + 1;
                                const hits = lineExecutions[lineNum] || 0;
                                return (
                                  <tr key={idx} style={{ backgroundColor: hits > 0 ? "rgba(255, 255, 255, 0.03)" : "transparent" }}>
                                    <td style={{ color: "#888", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.05)" }}>{lineNum}</td>
                                    <td style={{ fontFamily: "'Fira Code', monospace", whiteSpace: "pre", color: "#000000", paddingLeft: "15px" }}>{lineText || " "}</td>
                                    <td style={{ textAlign: "center", fontWeight: "bold", color: hits > 0 ? "#00b8a3" : "#555" }}>{hits > 0 ? hits : "-"}</td>
                                    <td style={{ paddingRight: "20px" }}>
                                      {hits > 0 && maxExecutions > 0 && (
                                        <div
                                          style={{
                                            height: "8px",
                                            width: `${(hits / maxExecutions) * 100}%`,
                                            backgroundColor: hits === maxExecutions ? "#f39c12" : "#00b8a3",
                                            borderRadius: "4px",
                                            transition: "width 0.5s ease-out",
                                            boxShadow: hits === maxExecutions ? "0 0 8px rgba(243, 156, 18, 0.5)" : "none",
                                          }}
                                          title={`${Math.round((hits / maxExecutions) * 100)}% of max execution load`}
                                        />
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="complexity-content">
                    <div className="complexity-tabs">
                      <div className="tab-btn-group">
                        <button onClick={() => { setActiveTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "local" ? "active" : ""}`}>Local Complexity</button>
                        <button onClick={() => { setActiveTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "global" ? "active" : ""}`}>Global Complexity</button>
                        <button onClick={() => { setActiveTab("memory"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}>Memory Map</button>
                      </div>

                      <div className="total-badge-group">
                        <span className="total-badge"><span className="total-label">Total Time:</span> <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatComplexity(analysisResult.total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: "rgba(0, 184, 163, 0.15)", color: "#00b8a3", border: "1px solid rgba(0, 184, 163, 0.3)" }}><span className="total-label" style={{ color: "#00b8a3" }}>Total Space:</span> <span style={{ fontSize: "20px", fontWeight: "bold" }}>{formatComplexity(analysisResult.space_total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: "rgba(155, 89, 182, 0.15)", color: "#9b59b6", border: "1px solid rgba(155, 89, 182, 0.3)" }}><span className="total-label" style={{ color: "#c275e0" }}>Analysis:</span> <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#db7fff" }}>{analysisTime} ms</span></span>
                      </div>
                    </div>

                    {activeTab === "memory" ? (
                      <div style={{ flex: 1, overflow: "hidden", padding: "10px 15px" }}>
                        <MemoryVisualizer analysisData={analysisResult.lines} currentStep={analysisResult.lines.length > 0 ? analysisResult.lines.length - 1 : 0} />
                      </div>
                    ) : (
                      <div className="complexity-table-wrapper">
                        <table className="complexity-table">
                          <thead>
                            <tr>
                              <th>Line of Code</th>
                              <th>Operation</th>
                              <th className="right-align">{activeTab === "local" ? "Local Time" : "Global Time"}</th>
                              <th className="right-align">{activeTab === "local" ? "Local Space" : "Global Space"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysisResult.lines.map((line, i) => {
                              const timeComplexity = activeTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)";
                              const spaceComplexity = activeTab === "local" ? line.local_space || "O(1)" : line.global_space || "O(1)";

                              let timeExp = line.time_explanation ?? line.local_explanation ?? "Analysis not available.";
                              let spaceExp = line.space_explanation ?? line.global_explanation ?? "Analysis not available.";

                              const isBottleneck = actualBottleneckIndices.includes(i);

                              if (activeTab === "local" || !isBottleneck) {
                                timeExp = timeExp.replace(/(?:⚠️\s*)?\*\*(TIME BOTTLENECK|MAIN TIME FACTOR|SLOWEST STEP)[\s\S]*/i, "");
                              }
                              if (activeTab === "local") {
                                spaceExp = spaceExp.replace(/(?:⚠️\s*)?\*\*(MAIN MEMORY USER|DOMINANT SPACE FACTOR|MEMORY BOTTLENECK)[\s\S]*/i, "");
                              }

                              const timeColor = getComplexityColor(timeComplexity);
                              const spaceColor = getComplexityColor(spaceComplexity);

                              const compStripped = timeComplexity.toLowerCase().replace(/\s+/g, "");
                              const isEfficient =
                                !isBottleneck &&
                                (compStripped.includes("logn") || compStripped.includes("√n") || compStripped.includes("sqrt") || compStripped.includes("t(n/2)+o(1)")) &&
                                !compStripped.includes("nlogn");

                              return (
                                <React.Fragment key={i}>
                                  <tr
                                    className={`complexity-row ${expandedLines[i] ? "expanded" : ""} ${isBottleneck ? "bottleneck-active" : ""} ${isEfficient ? "efficient-active" : ""}`}
                                    onClick={() => toggleLine(i)}
                                    style={{
                                      cursor: "pointer",
                                      borderLeft: isBottleneck ? "4px solid #ff375f" : isEfficient ? "4px solid #2ecc71" : expandedLines[i] ? `3px solid ${timeColor}` : "none",
                                      backgroundColor: isBottleneck ? "rgba(255, 55, 95, 0.12)" : isEfficient ? "rgba(46, 204, 113, 0.12)" : "transparent",
                                    }}
                                  >
                                    <td className="code-cell" style={{ color: "#000000", paddingLeft: line.indent ? `${line.indent * 15 + 20}px` : "20px" }}>
                                      {line.lineOfCode || line.code}
                                    </td>
                                    <td className="operation-cell" style={{ color: "#000000", display: "flex", alignItems: "center", gap: "8px" }}>
                                      {line.operation || "-"}
                                      {isBottleneck && <span style={{ backgroundColor: "#ff375f", color: "white", fontSize: "0.7rem", fontWeight: "bold", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase", marginLeft: "10px", boxShadow: "0 0 8px rgba(255, 55, 95, 0.6)" }}>Bottleneck</span>}
                                      {isEfficient && <span style={{ backgroundColor: "#2ecc71", color: "white", fontSize: "0.7rem", fontWeight: "bold", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase", marginLeft: "10px", boxShadow: "0 0 8px rgba(46, 204, 113, 0.6)" }}>Efficient</span>}
                                    </td>
                                    <td className="complexity-cell" style={{ color: timeColor, fontWeight: "bold" }}>{formatComplexity(timeComplexity)}</td>
                                    <td className="complexity-cell" style={{ color: spaceColor, fontWeight: "bold" }}>{formatComplexity(spaceComplexity)}</td>
                                  </tr>

                                  {expandedLines[i] && (
                                    <tr className="explanation-row">
                                      <td colSpan="4" style={{ padding: 0, border: "none" }}>
                                        <div
                                          className="explanation-content"
                                          style={{
                                            borderLeftColor: timeColor,
                                            display: "flex",
                                            gap: "20px",
                                            padding: "16px",
                                            background: "rgba(255, 255, 255, 0.05)",
                                            margin: "0 16px 12px 16px",
                                            borderRadius: "8px",
                                            animation: "slideDown 0.3s ease forwards",
                                          }}
                                        >
                                          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                                            <div className="explanation-text" style={{ display: "flex", alignItems: "flex-start" }}>
                                              <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: "10px", width: "18px" }} />
                                              <div style={{ width: "100%" }}>
                                                <strong style={{ color: timeColor, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Time Complexity</strong>
                                                <div style={{ marginTop: "6px" }}>{formatExplanation(timeExp, isBottleneck, activeTab === "local")}</div>
                                              </div>
                                            </div>
                                            <div className="explanation-graph" style={{ marginTop: "15px", height: "120px" }}>
                                              <ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" />
                                            </div>
                                          </div>

                                          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "20px" }}>
                                            <div className="explanation-text" style={{ display: "flex", alignItems: "flex-start" }}>
                                              <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: "10px", width: "18px" }} />
                                              <div style={{ width: "100%" }}>
                                                <strong style={{ color: spaceColor, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Space Complexity</strong>
                                                <div style={{ marginTop: "6px" }}>{formatExplanation(spaceExp, isBottleneck, activeTab === "local")}</div>
                                              </div>
                                            </div>
                                            <div className="explanation-graph" style={{ marginTop: "15px", height: "120px" }}>
                                              <ComplexityGraph complexity={spaceComplexity} color={spaceColor} label="Space Curve" />
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <footer className="workspace-footer">
            <div className="footer-left">
              <button className={`footer-tab ${bottomPanel === "console" ? "active" : ""}`} onClick={() => setBottomPanel(bottomPanel === "console" ? null : "console")}>
                <img src="/assets/console-icon.png" alt="Console" className="tab-icon" /> Console
              </button>
              <button className={`footer-tab ${bottomPanel === "complexity" ? "active" : ""}`} onClick={() => setBottomPanel(bottomPanel === "complexity" ? null : "complexity")}>
                <img src="/assets/complexity-icon.png" alt="Complexity" className="tab-icon" /> Complexity
              </button>
              <button className="footer-tab big-o-btn" onClick={() => setIsBigOModalOpen(true)}>
                <img src="/assets/table-icon.png" alt="Reference" className="tab-icon" /> Big O Reference
              </button>
            </div>

            <div className="footer-right">
              <button
                className="footer-action-icon"
                onClick={() =>
                  setModalConfig({
                    isOpen: true,
                    title: "Restart Activity?",
                    message: "Are you sure you want to restart this activity? Your progress will be lost.",
                    confirmText: "Restart",
                    cancelText: "Cancel",
                    isDanger: true,
                    onConfirmAction: () => {
                      // --- UPDATED: Clear DB, sync empty, and clear tests ---
                      const storedUser = localStorage.getItem("user");
                      if (storedUser) {
                        const user = JSON.parse(storedUser);
                        submissionsDB.removeItem(`${user.email}_${moduleId}_${activityId}`);
                      }
                      localStorage.removeItem(`activity_tests_${moduleId}_${activityId}`);
                      saveSubmission(null, "# Drag blocks to generate Python code", 0, 0, totalTests, []); 
                      
                      window.location.reload();
                    },
                    onCancelAction: closeModal,
                  })
                }
                title="Restart Activity"
              >
                <img src="/assets/recursive-icon.png" alt="Restart" />
              </button>
            </div>
          </footer>
        </main>

        <aside className="activity-right-panel">
          <div className="activity-panel-header">
            <h3>Test Cases</h3>
            <span className="test-cases-counter">
              {passedTests}/{totalTests} passed
            </span>
          </div>

          <div className="activity-panel-content">
            {(activityDataResolved?.testCasesList || []).map((tc, i) => {
              const testIdentifier = `Test ${i + 1}`;
              const isPassing = consoleOutput.includes(`${testIdentifier}: PASSED`);
              const isFailing = consoleOutput.includes(`${testIdentifier}: FAILED`);
              const isError = consoleOutput.includes(`${testIdentifier}: ERROR`);

              const isExpanded = expandedTests[i];
              const statusClass = isPassing ? "passing" : isFailing || isError ? "failing" : "";

              return (
                <div key={i} className={`test-case-card ${statusClass}`}>
                  <div 
                    className="test-case-header" 
                    onClick={() => !tc.isHidden && toggleTest(i)}
                    style={{ cursor: tc.isHidden ? "default" : "pointer" }}
                  >
                    <div className="test-case-header-left">
                      <div className={`test-case-indicator ${statusClass}`}></div>
                      <strong className="test-case-title">
                        {tc.isHidden ? `Hidden Test ${i + 1}` : `Test ${i + 1}`}
                      </strong>
                    </div>
                    {tc.isHidden ? (
                      <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>🔒</span>
                    ) : (
                      <span className={`test-case-chevron ${isExpanded ? "open" : ""}`}>❯</span>
                    )}
                  </div>

                  {isExpanded && !tc.isHidden && (
                    <div className="test-case-details">
                      <div className="test-case-row">
                        <span className="test-case-label">Input:</span>
                        <code className="test-case-code">{tc.call}</code>
                      </div>
                      <div className="test-case-row">
                        <span className="test-case-label">Expected Output:</span>
                        <code className="test-case-code">{tc.expected}</code>
                      </div>

                      {(isPassing || isFailing || isError) && (
                        <div className="test-case-status-row">
                          <span className="test-case-label">Result:</span>
                          <span style={{ fontWeight: "bold", color: isPassing ? "#27AE60" : "#e74c3c" }}>
                            {isPassing ? "Passed" : isFailing ? "Failed (Incorrect Output)" : "Failed (Syntax Error)"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </Split>

      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        isDanger={modalConfig.isDanger}
        onCancel={modalConfig.onCancelAction || closeModal}
        onConfirm={modalConfig.onConfirmAction}
      />

      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
    </div>
  );
};

export default ActivityApp;