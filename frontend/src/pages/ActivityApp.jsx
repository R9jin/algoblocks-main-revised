// frontend/src/pages/ActivityApp.jsx
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from "../components/ComplexityGraph.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import MemoryVisualizer from "../components/MemoryVisualizer.jsx";
import { usePyodide } from "../context/PyodideContext.jsx";
import { progressDB, submissionsDB, syncQueueDB, templatesDB } from "../db.js";
import "../styles/ActivityApp.css";
import { translatePythonError } from "../utils/errorTranslator.js";
import { formatComplexity } from "../utils/formatters";

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
  if (!text) return null;

  if (Array.isArray(text)) {
    return (
      <div className="activity-task-description">
        {text.map((line, idx) => {
          const formattedLine = line
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #26004a;">$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #4400ff;">$1</code>');
            
          return (
            <p 
              key={idx} 
              style={{ minHeight: line === "" ? "1rem" : "auto", margin: "4px 0", color: '#1e293b', fontSize: '0.9rem', lineHeight: '1.6' }} 
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formattedLine) }} 
            />
          );
        })}
      </div>
    );
  }

  if (typeof text !== "string") return null;

  const formattedHtml = text
    .replace(/\n/g, "<br/>")
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #26004a;">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #4400ff;">$1</code>');

  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formattedHtml) }} />;
};

const getComplexityColor = (complexity) => {
  const comp = String(complexity || "").toLowerCase();
  if (comp.includes("o(1)")) return "#2ecc71";
  if (comp.includes("log n") && !comp.includes("n log")) return "#3498db";
  if (comp.includes("o(n)") && !comp.includes("log")) return "#f1c40f";
  if (comp.includes("n log n")) return "#e67e22";
  if (comp.includes("o(v") || comp.includes("o(e")) return "#d35400";
  if (comp.includes("o(n^2)") || comp.includes("o(n²)") || comp.includes("o(n*m)")) return "#e74c3c";
  if (comp.includes("o(n^3)") || comp.includes("o(n³)")) return "#c0392b";
  if (comp.includes("2^n") || comp.includes("n!")) return "#8e44ad";
  return "#95a5a6";
};

const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, '');
  if (comp.includes("o(1)") || comp === "1") return 1;
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("n2")) return 5;
  if (comp.includes("n^3") || comp.includes("n³") || comp.includes("n3")) return 6;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("2n")) return 7;
  if (comp.includes("n!")) return 8;
  if (comp.includes("nlogn")) return 4;
  if (comp.includes("logn")) return 2;
  if (comp.includes("o(n)") || comp === "n") return 3;
  return 0;
};

const formatExplanation = (text, isBottleneck, isLocal) => {
  if (!text) return "No explanation available.";
  const sections = text.split(/(TIME BOTTLENECK:|SPACE BOTTLENECK:|ALGORITHM MASTERY:|Runtime Observation:)/g);
  return sections.map((sec, idx) => {
    const trimmedSec = sec.trim();
    if (trimmedSec === "TIME BOTTLENECK:" || trimmedSec === "SPACE BOTTLENECK:" || trimmedSec === "ALGORITHM MASTERY:" || trimmedSec === "Runtime Observation:") return null;
    if (trimmedSec.startsWith("-")) {
      const items = trimmedSec.split("\n").map(i => i.replace(/^- /, ""));
      return (
        <div key={idx} style={{ marginTop: '8px' }}>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e293b', fontSize: '0.85rem' }}>
            {items.map((item, i) => <li key={i} style={{ marginBottom: '4px' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')) }}></li>)}
          </ul>
        </div>
      );
    }
    if (trimmedSec.includes("TIME BOTTLENECK:") || trimmedSec.includes("SPACE BOTTLENECK:")) {
      const content = trimmedSec.replace(/TIME BOTTLENECK:|SPACE BOTTLENECK:/g, "").trim();
      return (
        <div key={idx} style={{ marginTop: '12px', marginBottom: '12px', padding: '10px 14px', backgroundColor: 'rgba(255, 55, 95, 0.08)', borderLeft: '4px solid #ff375f', borderRadius: '0 6px 6px 0' }}>
          <strong style={{ display: 'block', color: '#d63031', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Performance Bottleneck</strong>
          <p style={{ margin: 0, color: '#1e293b', fontSize: '0.85rem', lineHeight: '1.5' }}>{content}</p>
        </div>
      );
    }
    if (trimmedSec.includes("ALGORITHM MASTERY:")) {
      const content = trimmedSec.replace("ALGORITHM MASTERY:", "").trim();
      return (
        <div key={idx} style={{ marginTop: '12px', marginBottom: '12px', padding: '10px 14px', backgroundColor: 'rgba(46, 204, 113, 0.08)', borderLeft: '4px solid #2ecc71', borderRadius: '0 6px 6px 0' }}>
          <strong style={{ display: 'block', color: '#27ae60', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Optimized Design</strong>
          <p style={{ margin: 0, color: '#1e293b', fontSize: '0.85rem', lineHeight: '1.5' }}>{content}</p>
        </div>
      );
    }
    if (trimmedSec.startsWith("Runtime Observation:")) {
      const content = trimmedSec.replace("Runtime Observation:", "").trim();
      return (
        <div key={idx} style={{ marginTop: '12px', marginBottom: '12px', padding: '8px 12px', backgroundColor: 'rgba(155, 89, 182, 0.08)', borderLeft: '4px solid #9b59b6', borderRadius: '0 6px 6px 0' }}>
          <strong style={{ display: 'block', color: '#8e44ad', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Runtime Data</strong>
          <p style={{ margin: 0, color: '#1e293b', fontSize: '0.85rem', lineHeight: '1.5' }}>{content}</p>
        </div>
      );
    }
    let parsedSec = trimmedSec.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return <p key={idx} style={{ color: '#1e293b', margin: '0 0 10px 0', fontSize: '0.9rem', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedSec) }}></p>;
  }).filter(Boolean);
};

const ActivityAppInner = ({ moduleId, activityId }) => {
  const API_BASE = import.meta.env.VITE_API_URL || "";
  const navigate = useNavigate();
  const { worker, isEngineReady, resetWorker } = usePyodide();
  const isReadyRef = useRef(false);
  const workspaceRef = useRef(null);
  const consoleEndRef = useRef(null);
  const workerRef = useRef(null);
  const workerMessageHandler = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const isDragging = useRef(false);
  const saveDraftTimeoutRef = useRef(null);
  const latestBlocksJsonRef = useRef(null);
  const testResolveRef = useRef(null);
  const testRejectRef = useRef(null);
  const outputAccumulatorRef = useRef("");
  const latestStateRef = useRef({
    userId: null,
    json: null,
    pythonCode: "# Drag blocks to generate Python code",
    score: 0,
    passed: 0,
    testResults: [],
    actualTime: "O(n^2)",
    actualSpace: "O(1)",
    status: "draft",
    type: "activity",
    targetTime: "O(n)",
    targetSpace: "O(1)"
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...\n");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(true);
  const [expandedTests, setExpandedTests] = useState({});
  const [bottomPanel, setBottomPanel] = useState(null);
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeTab, setActiveTab] = useState("local");
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});
  const [modalConfig, setModalConfig] = useState({
    isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", isDanger: false, onConfirmAction: null, onCancelAction: null
  });
  const [isEditingCode, setIsEditingCode] = useState(false);
  
  // DEEP STACK ERROR STATE
  const [syntaxErrors, setSyntaxErrors] = useState([]);
  const [isErrorDropdownOpen, setIsErrorDropdownOpen] = useState(false);

  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});
  const [panelHeight, setPanelHeight] = useState(300);
  const [activityDataResolved, setActivityDataResolved] = useState(null);
  const [topicIdResolved, setTopicIdResolved] = useState(null);
  const [lessonActivitiesResolved, setLessonActivitiesResolved] = useState([]);

  useEffect(() => {
    if (workspaceRef.current && viewMode === 'workspace') {
      setTimeout(() => { workspaceRef.current.resize(); }, 50);
      setTimeout(() => { workspaceRef.current.resize(); }, 300);
    }
  }, [viewMode, isLeftPanelVisible, isRightPanelVisible]);

  const processedTestCases = useMemo(() => {
    if (!activityDataResolved) return [];
    const originalTests = activityDataResolved.testCasesList || [];
    const visibleTests = originalTests.filter(tc => !tc.isHidden);
    const hiddenTests = originalTests.filter(tc => tc.isHidden);
    const timeTarget = activityDataResolved.targetTimeComplexity || "O(n)";
    const spaceTarget = activityDataResolved.targetSpaceComplexity || "O(n)";
    const timeTest = { isComplexityTest: true, title: "Time Complexity Check", target: timeTarget, call: "Static Code Analysis", expected: `<= ${timeTarget}`, isHidden: false };
    const spaceTest = { isComplexityTest: true, title: "Space Complexity Check", target: spaceTarget, call: "Static Code Analysis", expected: `<= ${spaceTarget}`, isHidden: false };
    return [...visibleTests, timeTest, spaceTest, ...hiddenTests];
  }, [activityDataResolved]);

  const totalTests = processedTestCases.length;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); showToast("Connection restored. Syncing drafts...", "success"); };
    const handleOffline = () => { setIsOnline(false); showToast("Connection lost. Saving drafts locally.", "error"); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  workerMessageHandler.current = (event) => {
    const { type, data, counts } = event.data;
    if (type === "ANALYZE_RESULT") {
      if (data.status === "success") {
        setAnalysisTime(data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00");
        setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });
        latestStateRef.current.actualTime = data.total;
        latestStateRef.current.actualSpace = data.space_total || "O(1)";
        const initialCounts = {};
        (data.lines || []).forEach((l) => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
        setLineExecutions(prev => ({ ...prev, ...initialCounts }));
        
        // DEEP STACK FIX: Clear errors on success
        setSyntaxErrors([]);
        setIsErrorDropdownOpen(false);
      } else {
        // DEEP STACK FIX: Process multiple errors simultaneously
        if (data.multiple_errors && data.multiple_errors.length > 0) {
          const mappedErrors = data.multiple_errors.map(err => {
            const hint = translatePythonError(err.message);
            return { line: err.line, message: `${err.message}. ${hint}` };
          });
          setSyntaxErrors(mappedErrors);
        } else {
          const hint = translatePythonError(data.message);
          setSyntaxErrors([{ line: data.line, message: `${data.message}. ${hint}` }]);
        }
      }
    } else if (type === "RUN_RESULT") {
      clearTimeout(runTimeoutRef.current);
      clearInterval(renderIntervalRef.current);
      if (testResolveRef.current) {
        setTimeout(() => {
          const flushed = pendingOutputRef.current;
          pendingOutputRef.current = "";
          outputAccumulatorRef.current += flushed + (data !== undefined && data !== null ? data : "");
          if (counts) setLineExecutions(prev => { const next = { ...prev }; Object.keys(counts).forEach(k => next[k] = Math.max(next[k] || 0, counts[k])); return next; });
          if (testResolveRef.current) testResolveRef.current(outputAccumulatorRef.current);
          testResolveRef.current = null;
          testRejectRef.current = null;
        }, 50);
      } else {
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const resultData = (data !== undefined && data !== null && data !== "") ? `\n${String(data)}` : "";
        setConsoleOutput((prev) => prev + flushed + resultData + "\n> Program finished.\n");
        if (counts) setLineExecutions(prev => { const next = { ...prev }; Object.keys(counts).forEach(k => next[k] = Math.max(next[k] || 0, counts[k])); return next; });
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }
    } else if (type === "OUTPUT") {
      outputCountRef.current += 1;
      pendingOutputRef.current += data;
      if (outputCountRef.current > 5000) {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);
        resetWorker();
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const floodMsg = "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n";
        if (testRejectRef.current) {
          testRejectRef.current(new Error(floodMsg));
          testResolveRef.current = null;
          testRejectRef.current = null;
        } else {
          setConsoleOutput((prev) => prev + flushed + floodMsg);
          setIsEvaluating(false);
          setIsWaitingForInput(false);
        }
        outputCountRef.current = 0;
      } else if (!renderIntervalRef.current && !testResolveRef.current) {
        renderIntervalRef.current = setInterval(() => {
          if (pendingOutputRef.current) {
            setConsoleOutput((prev) => prev + pendingOutputRef.current);
            pendingOutputRef.current = "";
          }
        }, 100);
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
      if (testRejectRef.current) {
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        outputAccumulatorRef.current += flushed;
        testRejectRef.current(new Error(data));
        testResolveRef.current = null;
        testRejectRef.current = null;
      } else {
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput((prev) => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }
    }
  };

  useEffect(() => {
    if (worker) {
      workerRef.current = worker;
      workerRef.current.onmessage = workerMessageHandler.current;
    }
  }, [worker]);

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
      const res = await fetch(`${url}?t=${new Date().getTime()}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await res.json();
          try { await templatesDB.setItem(cacheKey, json); } catch (e) { }
          return json;
        } else {
          throw new Error("Response is not JSON format");
        }
      } else {
        throw new Error(`HTTP error ${res.status}`);
      }
    } catch (e) {
      console.warn(`Network fetch failed for ${url}, falling back to cache.`, e);
    }
    try {
      const cached = await templatesDB.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { }
    throw new Error(`Fetch failed for ${url} and no cache available.`);
  };

  const resolveActivityFromModule = async () => {
    const mid = String(moduleId).replace(/[^0-9]/g, "");
    if (!mid) throw new Error("Invalid moduleId");
    const activitiesUrl = `/data/activities/module_${mid}.json`;
    const activitiesJson = await fetchJsonWithCache(`activities:module_${mid}`, activitiesUrl);

    let foundActivity = null;
    let foundLessonKey = null;
    let activitiesInLesson = [];

    for (const [lessonKey, list] of Object.entries(activitiesJson || {})) {
      if (!Array.isArray(list)) continue;
      const matched = list.find((a) => a && a.id === activityId);
      if (matched) {
        foundActivity = matched;
        foundLessonKey = lessonKey;
        activitiesInLesson = list;
        break;
      }
    }

    if (!foundActivity) throw new Error("Activity not found in module activities JSON");

    const lessonNum = foundLessonKey.replace("lesson_", "");
    const formattedLessonId = `lesson-${mid}-${lessonNum}`;
    setTopicIdResolved(formattedLessonId);
    setLessonActivitiesResolved(activitiesInLesson);

    const testCasesList = (foundActivity.testCasesPool || []).map((tc) => ({
      call: tc.call,
      expected: tc.expected,
      isHidden: !!tc.isHidden
    }));

    return {
      id: foundActivity.id,
      title: foundActivity.title || foundLessonKey,
      task: foundActivity.task,
      type: foundActivity.type || (foundLessonKey === "optimizations" ? "optimization" : "activity"),
      difficulty: foundActivity.difficulty || (foundLessonKey === "optimizations" ? "Advanced" : "Easy"),
      targetTimeComplexity: foundActivity.targetTime || foundActivity.targetTimeComplexity || "O(n)",
      targetSpaceComplexity: foundActivity.targetSpace || foundActivity.targetSpaceComplexity || "O(n)",
      testCasesList,
      templateUrl: foundActivity.templateUrl || null
    };
  };

  const triggerFinalSave = () => {
    const state = latestStateRef.current;
    if (!state.userId) return;
    if (state.pythonCode === "# Drag blocks to generate Python code" && (!state.json || Object.keys(state.json).length === 0)) return;

    const payload = {
      userId: state.userId,
      moduleId: moduleId,
      activityId: activityId,
      type: state.type || "activity",
      status: state.status || "draft",
      score: state.score,
      maxScore: 5,
      passedTestCases: state.passed,
      totalTestCases: totalTests,
      passed_tests: state.passed,
      total_tests: totalTests,
      testCases: state.testResults,
      target_complexity: state.targetTime || "O(n)",
      actual_complexity: state.actualTime,
      target_space_complexity: state.targetSpace || "O(1)",
      actual_space_complexity: state.actualSpace,
      workspace: { blocklyJson: state.json || {} },
      pythonCode: state.pythonCode,
      timestamp: Date.now(),
      submittedAt: new Date().toISOString(),
      isSynced: true
    };

    const finalSubId = `${state.userId}_${moduleId}_${activityId}`;
    submissionsDB.setItem(finalSubId, { ...payload, isSynced: false });

    if (navigator.onLine && API_BASE) {
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");
        fetch(`${API_BASE}/api/sync-submission`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (err) {
        syncQueueDB.setItem(`sync_${finalSubId}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
      }
    } else {
      syncQueueDB.setItem(`sync_${finalSubId}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => { triggerFinalSave(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    isReadyRef.current = false;

    const boot = async () => {
      try {
        const resolvedActivity = await resolveActivityFromModule();
        if (cancelled) return;
        setActivityDataResolved(resolvedActivity);
        latestStateRef.current.type = resolvedActivity.type;
        latestStateRef.current.targetTime = resolvedActivity.targetTimeComplexity;
        latestStateRef.current.targetSpace = resolvedActivity.targetSpaceComplexity;

        const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!storedUser) {
          navigate("/learning-path", { replace: true });
          return;
        }

        const user = JSON.parse(storedUser);
        latestStateRef.current.userId = user.email;

        const submissionId = `${user.email}_${moduleId}_${activityId}`;
        let localSubmission = null;
        try { localSubmission = await submissionsDB.getItem(submissionId); } catch (e) { }

        let cloudSubmission = null;
        if (navigator.onLine && !user.isGuest && API_BASE) {
          try {
            const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");
            const res = await fetch(`${API_BASE}/api/get-submission?activityId=${activityId}&moduleId=${moduleId}`, {
              headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.submission) cloudSubmission = data.submission;
            }
          } catch (e) { }
        }

        let finalSubmissionToLoad = null;
        const localCode = localSubmission?.pythonCode || "";
        const cloudCode = cloudSubmission?.pythonCode || "";
        const isLocalBlank = !localCode || localCode === "# Drag blocks to generate Python code";
        const isCloudBlank = !cloudCode || cloudCode === "# Drag blocks to generate Python code";

        if (isLocalBlank && !isCloudBlank) {
          finalSubmissionToLoad = cloudSubmission;
          await submissionsDB.setItem(submissionId, cloudSubmission);
        } else if (!isLocalBlank && !isCloudBlank) {
          if ((localSubmission.timestamp || 0) >= (cloudSubmission.timestamp || 0)) finalSubmissionToLoad = localSubmission;
          else finalSubmissionToLoad = cloudSubmission;
        } else if (!isLocalBlank) {
          finalSubmissionToLoad = localSubmission;
        }

        if (finalSubmissionToLoad && finalSubmissionToLoad.activityId === activityId && !cancelled) {
          try {
            const json = finalSubmissionToLoad.workspace?.blocklyJson || finalSubmissionToLoad.blocklyJson || {};
            const pythonCode = finalSubmissionToLoad.pythonCode;
            latestStateRef.current.json = json;
            latestStateRef.current.pythonCode = pythonCode;
            latestStateRef.current.score = finalSubmissionToLoad.score || 0;
            latestStateRef.current.passed = finalSubmissionToLoad.passedTestCases || finalSubmissionToLoad.passed_tests || 0;
            latestStateRef.current.status = finalSubmissionToLoad.status || "draft";

            setTimeout(() => {
              if (workspaceRef.current?.loadTemplate && Object.keys(json).length > 0 && !cancelled) workspaceRef.current.loadTemplate(json);
            }, 400);
            if (pythonCode && pythonCode !== "# Drag blocks to generate Python code") setGeneratedPython(pythonCode);
            setPassedTests(latestStateRef.current.passed);
          } catch (e) {
            console.error("Failed to load blocks");
          }
        } else {
          if (resolvedActivity.templateUrl) {
            try {
              const templateJson = await fetchJsonWithCache(`template:${resolvedActivity.id}`, resolvedActivity.templateUrl);
              latestStateRef.current.json = templateJson;
              setTimeout(() => {
                if (workspaceRef.current?.loadTemplate && !cancelled) workspaceRef.current.loadTemplate(templateJson);
              }, 400);
            } catch (err) { }
          }
        }

        const savedTests = localStorage.getItem(`activity_tests_${moduleId}_${activityId}`);
        if (savedTests && !cancelled) {
          try {
            const { consoleOutput: savedOut, passedTests: savedPassed } = JSON.parse(savedTests);
            if (savedOut) setConsoleOutput(savedOut);
            if (savedPassed !== undefined) setPassedTests(savedPassed);
          } catch (e) { }
        }

        if (!cancelled) {
          isReadyRef.current = true;
        }

      } catch (e) {
        console.error("Activity bootstrap failed:", e);
        if (!cancelled) navigate("/learning-path", { replace: true });
      }
    };

    boot();

    return () => {
      cancelled = true;
      triggerFinalSave();
      if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    };
  }, []);

  const saveSubmission = async (json, pythonCode, score = null, passed = null, total = totalTests, testResults = null, actualTime = "O(n^2)", actualSpace = "O(1)", isDraft = false) => {
    if (!latestStateRef.current.userId) return;

    const finalScore = score !== null ? score : latestStateRef.current.score;
    const finalPassed = passed !== null ? passed : latestStateRef.current.passed;
    const finalTestResults = testResults !== null ? testResults : latestStateRef.current.testResults;
    const finalStatus = isDraft ? (finalScore >= 1 ? "passed" : "draft") : (finalScore >= 1 ? "passed" : "failed");

    latestStateRef.current.json = json;
    latestStateRef.current.pythonCode = pythonCode;
    latestStateRef.current.score = finalScore;
    latestStateRef.current.passed = finalPassed;
    latestStateRef.current.testResults = finalTestResults;
    latestStateRef.current.status = finalStatus;

    const submissionId = `${latestStateRef.current.userId}_${moduleId}_${activityId}`;
    const payload = {
      userId: latestStateRef.current.userId,
      moduleId: moduleId,
      activityId: activityId,
      type: latestStateRef.current.type || "activity",
      status: finalStatus,
      score: finalScore,
      maxScore: 5,
      passedTestCases: finalPassed,
      totalTestCases: total,
      passed_tests: finalPassed,
      total_tests: total,
      testCases: finalTestResults,
      target_complexity: latestStateRef.current.targetTime || "O(n)",
      actual_complexity: actualTime,
      target_space_complexity: latestStateRef.current.targetSpace || "O(1)",
      actual_space_complexity: actualSpace,
      workspace: { blocklyJson: json || {} },
      pythonCode: pythonCode || "",
      timestamp: Date.now(),
      submittedAt: new Date().toISOString(),
      isSynced: false
    };

    try {
      await submissionsDB.setItem(submissionId, payload);
      window.dispatchEvent(new Event("localDataSynced"));
    } catch (e) { }

    if (!navigator.onLine) {
      await syncQueueDB.setItem(`sync_${submissionId}_${Date.now()}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
      return;
    }

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");
      if (API_BASE) {
        const response = await fetch(`${API_BASE}/api/sync-submission`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ ...payload, isSynced: true }),
        });
        if (response.ok) {
          await submissionsDB.setItem(submissionId, { ...payload, isSynced: true });
        } else {
          throw new Error("Server rejected submission");
        }
      }
    } catch (err) {
      await syncQueueDB.setItem(`sync_${submissionId}_${Date.now()}`, { type: 'SUBMISSION', action: 'UPSERT', data: payload });
    }
  };

  const handleWorkspaceAutoSave = (json, pythonCode) => {
    if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    saveDraftTimeoutRef.current = setTimeout(async () => {
      if (pythonCode && pythonCode !== "# Drag blocks to generate Python code" && Object.keys(json || {}).length > 0) {
        await saveSubmission(json, pythonCode, null, null, totalTests, null, latestStateRef.current.actualTime, latestStateRef.current.actualSpace, true);
      }
    }, 1500);
  };

  // DEEP STACK FIX: Debounce Analyzer calls to stop flickering
  useEffect(() => {
    if (!isReadyRef.current) return;
    if (isOnline && isEngineReady && workerRef.current && generatedPython !== "# Drag blocks to generate Python code" && isEditingCode) {
      const timeoutId = setTimeout(() => {
        workerRef.current.postMessage({ type: 'ANALYZE_CODE', code: generatedPython });
      }, 800);
      return () => clearTimeout(timeoutId);
    }
  }, [generatedPython, isEditingCode, isOnline, isEngineReady]);

  const handleWorkspaceChange = async (json, pythonCode) => {
    if (!isReadyRef.current) return;
    latestBlocksJsonRef.current = json;
    const oldCode = (generatedPython || "").trim();
    const newCode = (pythonCode || "").trim();
    latestStateRef.current.json = json;
    latestStateRef.current.pythonCode = pythonCode;
    handleWorkspaceAutoSave(json, pythonCode);
    if (!isEditingCode && oldCode !== newCode) {
      setGeneratedPython(pythonCode);
      setLineExecutions({});
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
          onCancelAction: closeModal
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

    runTimeoutRef.current = setTimeout(() => {
      resetWorker();
      const flushed = pendingOutputRef.current;
      pendingOutputRef.current = "";
      setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
      setIsEvaluating(false);
      setIsWaitingForInput(false);
    }, 10000);

    workerRef.current?.postMessage({ type: "RUN_CODE", code: generatedPython });
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: "INPUT_RESPONSE", data: userInput });
      outputCountRef.current = 0;
      setUserInput("");
      setIsWaitingForInput(false);

      runTimeoutRef.current = setTimeout(() => {
        resetWorker();
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const savePartialProgress = async (lessonId, score) => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    if (!user.progress) user.progress = {};
    user.progress[lessonId] = Math.max(user.progress[lessonId] || 0, score);
    localStorage.setItem("user", JSON.stringify(user));

    const payload = { email: user.email, lesson_id: lessonId, score: user.progress[lessonId] };
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");

    await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: false });

    if (navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: true });
        else throw new Error("Sync failed");
      } catch (error) {
        await syncQueueDB.setItem(`sync_prog_${lessonId}_${Date.now()}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
      }
    } else if (!user.isGuest) {
      await syncQueueDB.setItem(`sync_prog_${lessonId}_${Date.now()}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
    }
  };

  const completeFullTopic = async (topicId) => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    if (!user.progress) user.progress = {};
    user.progress[topicId] = true;
    localStorage.setItem("user", JSON.stringify(user));

    const payload = { email: user.email, lesson_id: topicId, score: 100, completed: true };
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("token") || sessionStorage.getItem("authToken");

    await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: false });

    if (navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: true });
        else throw new Error("Sync failed");
      } catch (error) {
        await syncQueueDB.setItem(`sync_prog_${topicId}_${Date.now()}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
      }
    } else if (!user.isGuest) {
      await syncQueueDB.setItem(`sync_prog_${topicId}_${Date.now()}`, { type: 'PROGRESS', action: 'UPSERT', data: payload });
    }
  };

  const executeTest = async (codeToRun) => {
    return new Promise((resolve, reject) => {
      outputAccumulatorRef.current = "";
      testResolveRef.current = resolve;
      testRejectRef.current = reject;

      runTimeoutRef.current = setTimeout(() => {
        resetWorker();
        if (testRejectRef.current) {
          testRejectRef.current(new Error("Infinite Loop detected. Execution timed out after 10 seconds."));
          testResolveRef.current = null;
          testRejectRef.current = null;
        }
      }, 10000);

      workerRef.current.postMessage({ type: "RUN_CODE", code: codeToRun });
    });
  };

  const handleSuccess = (score, maxScore, funcPassed, funcTotal) => {
    const currentIndex = lessonActivitiesResolved.findIndex(a => a.id === activityId);
    const isLast = currentIndex === lessonActivitiesResolved.length - 1;
    const nextActivity = !isLast ? lessonActivitiesResolved[currentIndex + 1] : null;

    let promptMsg = "";
    if (score === 5) {
      promptMsg = `Perfect execution!\nYou earned a Gold Medal (5/5).\n\nYou passed all tests and mastered both the target Time and Space complexity!\n\nReady for the next challenge?`;
    } else if (funcPassed < funcTotal) {
      promptMsg = `Keep trying!\nYou earned a score of ${score}/${maxScore}.\n\nYou passed ${funcPassed}/${funcTotal} functional test cases.\nSome hidden test cases or edge cases failed.\n\nReady to proceed or want to try fixing it?`;
    } else if (score === 4) {
      promptMsg = `Great job!\nYou earned a Silver Medal (4/5).\n\nYou passed all functional tests, but mastered only one of the Time or Space complexities.\nCan you optimize it further to get the Gold?\n\nReady to proceed?`;
    } else {
      promptMsg = `Good effort!\nYou earned a Bronze Medal (${score}/5).\n\nYour code works and passed all functional tests!\nHowever, it hasn't reached the optimal Time and Space complexity yet.\nCan you make it faster or leaner to get the Gold Medal?\n\nReady to proceed?`;
    }

    if (!isLast && nextActivity) {
      setModalConfig({
        isOpen: true,
        title: "Activity Completed!",
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
        title: "Section Completed!",
        message: `${promptMsg}\n\nIncredible! You have finished all activities in this section.\nReturn to the learning path to unlock the next topic.`,
        confirmText: "Finish",
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
    if (!processedTestCases.length) return;
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
      localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: errorMsg, passedTests: 0 }));
      return;
    }

    setBottomPanel("console");
    setConsoleOutput("\n> --- Running Test Cases ---\n\n");
    setPassedTests(0);

    let passed = 0;
    let functionalPassed = 0;
    let functionalTotal = 0;
    let fullOutput = "\n> --- Running Test Cases ---\n";

    for (let i = 0; i < totalTests; i++) {
      const tc = processedTestCases[i];

      if (tc.isComplexityTest) {
        const actualVal = tc.title.includes("Time") ? analysisResult.total : analysisResult.space_total;
        const actualWeight = getComplexityWeight(actualVal);
        const targetWeight = getComplexityWeight(tc.target);
        const testPassed = actualWeight > 0 && actualWeight <= targetWeight;

        if (testPassed) passed++;
        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n  Metric: ${tc.title}\n  Expected: <= ${formatComplexity(tc.target)}\n  Actual: ${formatComplexity(actualVal)}\n\n`;
        setConsoleOutput(fullOutput);
        setPassedTests(passed);
        continue;
      }

      functionalTotal++;
      const isFunctionCall = tc.call?.includes("(") && tc.call?.includes(")");
      const taskId = activityDataResolved?.id || "";
      const isIntroLevel = taskId === "l1-t1" || taskId === "l1-t3";
      let codeToRun = "";

      if (isFunctionCall && !isIntroLevel) codeToRun = generatedPython + `\n\ntry:\n    assert ${tc.call} == ${tc.expected}\n    print("TEST_PASSED_FLAG")\nexcept:\n    print("TEST_ERROR_FLAG")`;
      else codeToRun = `${generatedPython}\n${tc.call || ""}`;

      try {
        const rawOutput = await executeTest(codeToRun);
        const actualOutput = rawOutput.trim();
        const expected = String(tc.expected).replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();

        let testPassed = false;
        if (isFunctionCall && !isIntroLevel) {
          if (actualOutput.includes("TEST_PASSED_FLAG")) {
            passed++;
            functionalPassed++;
            testPassed = true;
          }
        } else {
          if (actualOutput.trim() === expected) {
            passed++;
            functionalPassed++;
            testPassed = true;
          }
        }

        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;
        if (!testPassed) {
          if (tc.isHidden) {
            fullOutput += `  [Hidden Test Case] Expected values and inputs are omitted.\n`;
          } else {
            fullOutput += `  Expected: ${expected}\n  Actual: ${actualOutput}\n`;
          }
        }
        fullOutput += "\n";

        setConsoleOutput(fullOutput);
        setPassedTests(passed);

      } catch (err) {
        fullOutput += `Test ${i + 1}: ERROR\n  Message: ${err.message}\n\n`;
        setConsoleOutput(fullOutput);
      }
    }

    setIsEvaluating(false);

    let score = 0;
    if (functionalPassed === 0) score = 0;
    else if (functionalPassed < functionalTotal) score = Math.max(1, Math.floor((functionalPassed / functionalTotal) * 2));
    else if (functionalPassed === functionalTotal) {
      score = 3;
      const targetTimeWeight = getComplexityWeight(activityDataResolved?.targetTimeComplexity || "O(n)");
      const targetSpaceWeight = getComplexityWeight(activityDataResolved?.targetSpaceComplexity || "O(n)");
      const actualTimeWeight = getComplexityWeight(analysisResult.total || "O(n^2)");
      const actualSpaceWeight = getComplexityWeight(analysisResult.space_total || "O(n)");

      if (actualTimeWeight > 0 && actualTimeWeight <= targetTimeWeight) score += 1;
      if (actualSpaceWeight > 0 && actualSpaceWeight <= targetSpaceWeight) score += 1;
    }

    const testResults = processedTestCases.map((tc, idx) => ({
      id: `tc_${idx}`,
      status: fullOutput.includes(`Test ${idx + 1}: PASSED`) ? "passed" : "failed"
    }));

    await saveSubmission(
      latestStateRef.current.json,
      generatedPython,
      score,
      passed,
      totalTests,
      testResults,
      analysisResult.total || "O(n^2)",
      analysisResult.space_total || "O(1)",
      false
    );

    localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: fullOutput, passedTests: passed, score: score }));
    const lessonKey = `${moduleId}:${activityId}`;
    await savePartialProgress(lessonKey, score);

    if (score >= 1) handleSuccess(score, 5, functionalPassed, functionalTotal);
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
      {/* CSS Block to cleanly hide sidebars without breaking react-split widths */}
      <style>{`
        .activity-main-layout.left-hidden .activity-left-panel { display: none !important; width: 0 !important; }
        .activity-main-layout.left-hidden .gutter.gutter-horizontal:first-of-type { display: none !important; }
        .activity-main-layout.right-hidden .activity-right-panel { display: none !important; width: 0 !important; }
        .activity-main-layout.right-hidden .gutter.gutter-horizontal:last-of-type { display: none !important; }
        .activity-main-layout.left-hidden .activity-center-panel,
        .activity-main-layout.right-hidden .activity-center-panel { flex: 1 !important; width: auto !important; }
        .sidebar-toggle-btn.right-panel-toggle { left: auto; right: 0; border-radius: 4px 0 0 4px; }
      `}</style>

      {toast.show && (<div className={`toast-notification ${toast.type === "error" ? "toast-error" : "toast-success"}`} style={{ position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 9999 }}>{toast.message}</div>)}

      <header className="activity-topbar">
        <div className="activity-back-btn" onClick={() => navigate("/learning-path")}><img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Dashboard</div>
        <div className="activity-toggle-group"><button className={`activity-toggle-btn ${viewMode === "workspace" ? "active" : ""}`} onClick={() => setViewMode("workspace")}>Workspace</button><button className={`activity-toggle-btn ${viewMode === "python" ? "active" : ""}`} onClick={() => setViewMode("python")}>Python Code</button></div>
        <div className="activity-actions" style={{ display: "flex", gap: "10px" }}><button className="activity-action-btn" onClick={handleActivityRun} style={{ backgroundColor: "#2D234A", border: "1px solid #6C5CE7", color: "#EBE4FF", opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? "not-allowed" : "pointer" }} title="Run code in console without submitting to test cases">{isEvaluating ? "..." : "Run Code"}</button><button className="activity-action-btn run-btn" onClick={runTestCases} style={{ opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? "not-allowed" : "pointer" }}>{isEvaluating ? "..." : "Run Tests"}</button></div>
      </header>

      <Split className={`activity-main-layout ${!isLeftPanelVisible ? "left-hidden" : ""} ${!isRightPanelVisible ? "right-hidden" : ""}`} sizes={[25, 50, 25]} minSize={[isLeftPanelVisible ? 250 : 0, 400, isRightPanelVisible ? 250 : 0]} gutterSize={8}>
        <aside className="activity-left-panel">
          {lessonActivitiesResolved.length > 0 && (<div className="activity-selector-container"><label className="activity-selector-label"><img src="/assets/learning-icon.png" alt="List" style={{ width: "16px", height: "16px" }} /> Lesson Outline</label><select className="activity-selector-dropdown" value={activityId} onChange={(e) => navigate(`/activity/${moduleId}/${e.target.value}`)}>{lessonActivitiesResolved.map((act, index) => (<option key={act.id} value={act.id}>{index + 1}. {act.title}</option>))}</select></div>)}
          <div className="activity-panel-header" style={{ paddingTop: "15px" }}><h2><img src="/assets/console-icon.png" alt="Icon" style={{ width: "24px" }} /> Description</h2></div>
          <div className="activity-panel-content">
            <div className="activity-task-header" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", marginTop: "10px" }}><h2 style={{ margin: 0, fontSize: "1.4rem", color: "#2b005c", fontWeight: "bold" }}>{activityDataResolved?.title || "Loading..."}</h2><span style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold", backgroundColor: activityDataResolved?.difficulty === "Easy" ? "rgba(0, 184, 163, 0.15)" : activityDataResolved?.difficulty === "Medium" ? "rgba(255, 192, 30, 0.15)" : "rgba(255, 55, 95, 0.15)", color: activityDataResolved?.difficulty === "Easy" ? "#00b8a3" : activityDataResolved?.difficulty === "Medium" ? "#ffc01e" : "#ff375f" }}>{activityDataResolved?.difficulty || "Easy"}</span></div>
            <div className="activity-card" style={{ lineHeight: "1.7", fontSize: "0.95rem", backgroundColor: "transparent", border: "none", padding: "0", color: "#2f2f2f" }}>
              {renderFormattedTask(activityDataResolved?.task || "Loading activity...")}
            </div>
          </div>
        </aside>

        <main className="workspace-main activity-center-panel">
          <button className={`sidebar-toggle-btn ${!isLeftPanelVisible ? "closed" : ""}`} onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} title={isLeftPanelVisible ? "Hide Instructions" : "Show Instructions"}>
            <span className="toggle-icon">{isLeftPanelVisible ? "<" : ">"}</span>
          </button>
          <button className={`sidebar-toggle-btn right-panel-toggle ${!isRightPanelVisible ? "closed" : ""}`} onClick={() => setIsRightPanelVisible(!isRightPanelVisible)} title={isRightPanelVisible ? "Hide Test Cases" : "Show Test Cases"}>
            <span className="toggle-icon">{isRightPanelVisible ? ">" : "<"}</span>
          </button>

          <div className="editor-container" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div className={viewMode === "workspace" ? "workspace-view d-block" : "workspace-view d-none"} style={{ display: viewMode === "workspace" ? "block" : "none", height: "100%" }}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} syntaxError={null} />
            </div>
            <div className={viewMode === "python" ? "python-view d-flex" : "python-view d-none"} style={{ display: viewMode === "python" ? "flex" : "none", flexDirection: "column", height: "100%", background: "#1C1236" }}>
              <div className="python-header" style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
                <span className="python-sync-status" style={{ color: "#EBE4FF", fontSize: "0.85rem" }}>{isEditingCode ? "Unsaved code changes..." : "Code is synced with blocks."}</span>
                <button onClick={handleSyncToBlocks} disabled={!isEditingCode} className={`python-sync-btn ${isEditingCode ? "active" : "disabled"}`} style={{ padding: "5px 12px", borderRadius: "4px", cursor: isEditingCode ? "pointer" : "not-allowed", backgroundColor: isEditingCode ? "#6C5CE7" : "#444", color: "white", border: "none" }}>Sync to Blocks</button>
              </div>
              
              {/* DEEP STACK: Floating Dropdown Editor Wrapper */}
              <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
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
                    setSyntaxErrors([]); // DEEP STACK: Clear errors immediately on typing
                    latestStateRef.current.pythonCode = newCode;
                    handleWorkspaceAutoSave(latestStateRef.current.json, newCode);
                  }} 
                  options={{ minimap: { enabled: false }, fontSize: 15, fontFamily: "Consolas, 'Courier New', monospace", scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: "smooth", formatOnPaste: true, suggestOnTriggerCharacters: true, wordWrap: "on", padding: { top: 16 } }} 
                />

                {/* DEEP STACK: Floating Error Dropdown */}
                {syntaxErrors && syntaxErrors.length > 0 && (
                  <div className="floating-error-container">
                    {isErrorDropdownOpen && (
                      <div className="error-dropdown-menu">
                        <div className="error-dropdown-header">
                          Detected Issues ({syntaxErrors.length})
                        </div>
                        <div className="error-dropdown-list">
                          {syntaxErrors.map((err, idx) => (
                            <div key={idx} className="error-dropdown-item">
                              <span className="error-line-badge">Line {err.line}</span>
                              <span className="error-message">{err.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button 
                      className={`floating-error-btn ${isErrorDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsErrorDropdownOpen(!isErrorDropdownOpen)}
                    >
                      ⚠️ {syntaxErrors.length} Error{syntaxErrors.length > 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {bottomPanel && (
            <div className="bottom-hover-panel" style={{ height: `${panelHeight}px` }}>
              <div className="panel-resizer" onMouseDown={handleDragStart}><div className="resizer-dash"></div></div>
              <div className="panel-header"><span className="panel-title">{bottomPanel === "console" ? "Console Panel" : "Complexity Analysis"}</span><button onClick={() => setBottomPanel(null)} className="panel-close-btn">X</button></div>
              <div className="panel-body" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {bottomPanel === "console" ? (
                  <div className="console-content-wrapper" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}><div className="console-container" style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}><pre className="console-output">{consoleOutput}</pre>{isWaitingForInput && (<div className="console-input-line"><span className="console-cursor">{">"}</span><input type="text" className="console-input-field" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleSendInput} autoFocus /></div>)}<div ref={consoleEndRef} /></div><div style={{ padding: "10px", backgroundColor: "#111", borderTop: "1px solid #333", display: "flex", justifyContent: "flex-end" }}><button className="clear-console-btn" onClick={() => setConsoleOutput("Ready to run...\n")}>Clear Console</button></div></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <div className="complexity-tabs"><div className="tab-btn-group"><button onClick={() => { setActiveTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "local" ? "active" : ""}`}>Local Complexity</button><button onClick={() => { setActiveTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "global" ? "active" : ""}`}>Global Complexity</button><button onClick={() => { setActiveTab("memory"); setExpandedLines({}); }} className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}>Memory Map</button></div>
                      <div className="total-badge-group"><span className="total-badge"><span className="total-label">Total Time:</span> <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatComplexity(analysisResult.total)}</span></span><span className="total-badge" style={{ backgroundColor: "rgba(0, 184, 163, 0.15)", color: "#00b8a3", border: "1px solid rgba(0, 184, 163, 0.3)" }}><span className="total-label" style={{ color: "#00b8a3" }}>Total Space:</span> <span style={{ fontSize: "20px", fontWeight: "bold" }}>{formatComplexity(analysisResult.space_total)}</span></span><span className="total-badge" style={{ backgroundColor: "rgba(155, 89, 182, 0.15)", color: "#9b59b6", border: "1px solid rgba(155, 89, 182, 0.3)" }}><span className="total-label" style={{ color: "#c275e0" }}>Analysis:</span> <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#db7fff" }}>{analysisTime} ms</span></span></div>
                    </div>
                    {activeTab === "memory" ? (<div style={{ flex: 1, overflow: "hidden", padding: "10px 15px" }}><MemoryVisualizer analysisData={analysisResult.lines} currentStep={analysisResult.lines.length > 0 ? analysisResult.lines.length - 1 : 0} /></div>) : (
                      <div className="complexity-table-wrapper">
                        <table className="complexity-table">
                          <thead><tr><th>Line of Code</th><th>Operation</th><th className="right-align">{activeTab === "local" ? "Local Time" : "Global Time"}</th><th className="right-align">{activeTab === "local" ? "Local Space" : "Global Space"}</th></tr></thead>
                          <tbody>
                            {analysisResult.lines.map((line, i) => {
                              const timeComplexity = activeTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)";
                              const spaceComplexity = activeTab === "local" ? line.local_space || "O(1)" : line.global_space || "O(1)";
                              let timeExp = line.time_explanation ?? line.local_explanation ?? "Analysis not available.";
                              let spaceExp = line.space_explanation ?? line.global_explanation ?? "Analysis not available.";
                              const isBottleneck = actualBottleneckIndices.includes(i);
                              const timeColor = getComplexityColor(timeComplexity);
                              const spaceColor = getComplexityColor(spaceComplexity);
                              const compStripped = timeComplexity.toLowerCase().replace(/\s+/g, "");
                              const isEfficient = !isBottleneck && (compStripped.includes("logn") || compStripped.includes("√n") || compStripped.includes("sqrt") || compStripped.includes("t(n/2)+o(1)")) && !compStripped.includes("nlogn");
                              return (
                                <React.Fragment key={i}>
                                  <tr className={`complexity-row ${expandedLines[i] ? "expanded" : ""} ${isBottleneck ? "bottleneck-active" : ""} ${isEfficient ? "efficient-active" : ""}`} onClick={() => toggleLine(i)} style={{ cursor: "pointer", borderLeft: isBottleneck ? "4px solid #ff375f" : isEfficient ? "4px solid #2ecc71" : expandedLines[i] ? `3px solid ${timeColor}` : "none", backgroundColor: isBottleneck ? "rgba(255, 55, 95, 0.12)" : isEfficient ? "rgba(46, 204, 113, 0.12)" : "transparent" }}>
                                    <td className="code-cell" style={{ color: "#000000", paddingLeft: line.indent ? `${line.indent * 15 + 20}px` : "20px" }}>{line.lineOfCode || line.code}</td>
                                    <td className="operation-cell" style={{ color: "#000000", display: "flex", alignItems: "center", gap: "8px" }}>
                                      {line.operation || "-"}
                                      {isBottleneck && <span className="bottleneck-badge" style={{ backgroundColor: "#ff375f", color: "white", fontSize: "0.7rem", fontWeight: "bold", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase", marginLeft: "10px", boxShadow: "0 0 8px rgba(255, 55, 95, 0.6)" }}>Bottleneck</span>}
                                      {isEfficient && <span style={{ backgroundColor: "#2ecc71", color: "white", fontSize: "0.7rem", fontWeight: "bold", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase", marginLeft: "10px", boxShadow: "0 0 8px rgba(46, 204, 113, 0.6)" }}>Efficient</span>}
                                    </td>
                                    <td className="complexity-cell" style={{ color: timeColor, fontWeight: "bold" }}>{formatComplexity(timeComplexity)}</td>
                                    <td className="complexity-cell" style={{ color: spaceColor, fontWeight: "bold" }}>{formatComplexity(spaceComplexity)} <span className="dropdown-chevron" style={{ transform: expandedLines[i] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s', marginLeft: '6px' }}>v</span></td>
                                  </tr>
                                  {expandedLines[i] && (
                                    <tr className="explanation-row">
                                      <td colSpan="4" style={{ padding: 0, border: "none" }}>
                                        <div className="explanation-content" style={{ borderLeftColor: timeColor, display: "flex", gap: "20px", padding: "16px", background: "rgba(255, 255, 255, 0.05)", margin: "0 16px 12px 16px", borderRadius: "8px", animation: "slideDown 0.3s ease forwards" }}>
                                          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><div className="explanation-text" style={{ display: "flex", alignItems: "flex-start" }}><div style={{ width: "100%" }}><strong style={{ color: timeColor, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Time Complexity</strong><div style={{ marginTop: "6px" }}>{formatExplanation(timeExp, isBottleneck, activeTab === "local")}</div></div></div><div className="explanation-graph" style={{ marginTop: "15px", height: "120px" }}><ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" /></div></div>
                                          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "20px" }}><div className="explanation-text" style={{ display: "flex", alignItems: "flex-start" }}><div style={{ width: "100%" }}><strong style={{ color: spaceColor, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Space Complexity</strong><div style={{ marginTop: "6px" }}>{formatExplanation(spaceExp, isBottleneck, activeTab === "local")}</div></div></div><div className="explanation-graph" style={{ marginTop: "15px", height: "120px" }}><ComplexityGraph complexity={spaceComplexity} color={spaceColor} label="Space Curve" /></div></div>
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
            <div className="footer-left"><button className={`footer-tab ${bottomPanel === "console" ? "active" : ""}`} onClick={() => setBottomPanel(bottomPanel === "console" ? null : "console")}><img src="/assets/console-icon.png" alt="Console" className="tab-icon" /> Console</button><button className={`footer-tab ${bottomPanel === "complexity" ? "active" : ""}`} onClick={() => setBottomPanel(bottomPanel === "complexity" ? null : "complexity")}><img src="/assets/complexity-icon.png" alt="Complexity" className="tab-icon" /> Complexity</button><button className="footer-tab big-o-btn" onClick={() => setIsBigOModalOpen(true)}><img src="/assets/table-icon.png" alt="Reference" className="tab-icon" /> Big O Reference</button></div>
            <div className="footer-right"><button className="footer-action-icon" onClick={() => setModalConfig({
              isOpen: true, title: "Restart Activity?", message: "Are you sure you want to restart this activity? Your progress will be lost.", confirmText: "Restart", cancelText: "Cancel", isDanger: true, onConfirmAction: async () => {
                const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
                if (storedUser) {
                  const user = JSON.parse(storedUser);
                  await submissionsDB.removeItem(`${user.email}_${moduleId}_${activityId}`);
                }
                localStorage.removeItem(`activity_tests_${moduleId}_${activityId}`);
                await saveSubmission(null, "# Drag blocks to generate Python code", 0, 0, totalTests, [], "O(1)", "O(1)", true);
                window.location.reload();
              }, onCancelAction: closeModal
            })} title="Restart Activity"><img src="/assets/recursive-icon.png" alt="Restart" /></button></div>
          </footer>
        </main>

        <aside className="activity-right-panel">
          <div className="activity-panel-header"><h3>Test Cases</h3><span className="test-cases-counter">{passedTests}/{totalTests} passed</span></div>
          <div className="activity-panel-content">
            {processedTestCases.map((tc, i) => {
              const testIdentifier = `Test ${i + 1}`;
              const isPassing = consoleOutput.includes(`${testIdentifier}: PASSED`);
              const isFailing = consoleOutput.includes(`${testIdentifier}: FAILED`);
              const isError = consoleOutput.includes(`${testIdentifier}: ERROR`);
              const isExpanded = expandedTests[i];
              const statusClass = isPassing ? "passing" : isFailing || isError ? "failing" : "";
              const displayTitle = tc.isComplexityTest ? tc.title : tc.isHidden ? `Hidden Test` : `Test ${i + 1}`;

              return (
                <div key={i} className={`test-case-card ${statusClass}`}>
                  <div className="test-case-header" onClick={() => !tc.isHidden && toggleTest(i)} style={{ cursor: tc.isHidden ? "default" : "pointer" }}>
                    <div className="test-case-header-left"><div className={`test-case-indicator ${statusClass}`}></div><strong className="test-case-title">{displayTitle}</strong></div>
                    {tc.isHidden ? (<span style={{ fontSize: "0.85rem", opacity: 0.6 }}>[Locked]</span>) : (<span className={`test-case-chevron ${isExpanded ? "open" : ""}`}>v</span>)}
                  </div>
                  {isExpanded && !tc.isHidden && (
                    <div className="test-case-details">
                      <div className="test-case-row"><span className="test-case-label">{tc.isComplexityTest ? "Metric Constraint:" : "Input:"}</span><code className="test-case-code">{tc.call}</code></div>
                      <div className="test-case-row"><span className="test-case-label">{tc.isComplexityTest ? "Requirement:" : "Expected Output:"}</span><code className="test-case-code">{tc.expected}</code></div>
                      {(isPassing || isFailing || isError) && (<div className="test-case-status-row"><span className="test-case-label">Result:</span><span style={{ fontWeight: "bold", color: isPassing ? "#27AE60" : "#e74c3c" }}>{isPassing ? "Passed" : isFailing ? "Failed (Incorrect)" : "Failed (Syntax Error)"}</span></div>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </Split>

      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} cancelText={modalConfig.cancelText} isDanger={modalConfig.isDanger} onCancel={modalConfig.onCancelAction || closeModal} onConfirm={modalConfig.onConfirmAction} />
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
    </div>
  );
};

export default function ActivityApp() {
  const { moduleId, activityId } = useParams();
  return <ActivityAppInner key={`${moduleId}-${activityId}`} moduleId={moduleId} activityId={activityId} />;
}