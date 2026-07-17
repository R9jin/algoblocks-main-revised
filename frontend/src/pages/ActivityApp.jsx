import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiBookOpen, FiChevronLeft, FiChevronRight, FiGrid, FiInfo, FiPlay, FiTerminal } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DockedBottomPanel from "../components/DockedBottomPanel.jsx";
import PythonCodeEditor from "../components/PythonCodeEditor.jsx";
import TourHelpButton from "../components/TourHelpButton";
import WorkspaceFooterBar from "../components/WorkspaceFooterBar.jsx";
import { useOnboarding } from "../context/OnboardingContext";
import { usePyodide } from "../context/PyodideContext.jsx";
import { getIntroActivityTour } from "../data/introActivityTours.js";
import { progressDB, submissionsDB, syncQueueDB, templatesDB } from "../db.js";
import "../styles/ActivityApp.css";
import { getComplexityWeight, sanitizePythonCode, usePanelResizer } from "../utils/asymptoticParser.jsx";
import { translatePythonError } from "../utils/errorTranslator.js";
import { formatComplexity } from "../utils/formatters";

// ULTIMATE FALLBACK: Completely bypasses syncQueueDB errors by using native localStorage queue
const pushToSyncQueue = (key, data) => {
  try {
    if (syncQueueDB && typeof syncQueueDB.setItem === 'function') {
        syncQueueDB.setItem(key, data);
        return;
    }
  } catch(e) {}
  
  try {
    const queue = JSON.parse(localStorage.getItem("offline_sync_queue") || "[]");
    queue.push({ key, data, timestamp: Date.now() });
    localStorage.setItem("offline_sync_queue", JSON.stringify(queue));
  } catch (e) { console.error("Sync queue failed:", e); }
};

const renderFormattedTask = (text) => {
  if (!text) return null;
  const parseStr = (str) => {
    let out = str.replace(/\n/g, "<br/>");
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--purple-main);">$1</strong>');
    out = out.replace(/\$([^$]+)\$/g, (match, math) => {
      let cleanMath = math.replace(/\\log\b/g, "log").replace(/\\/g, "");
      cleanMath = cleanMath.replace(/\^{([^}]+)}/g, "<sup>$1</sup>").replace(/\^([a-zA-Z0-9]+)/g, "<sup>$1</sup>");
      return `<span class="nlg-math-badge">${cleanMath}</span>`;
    });
    out = out.replace(/`([^`]+)`/g, '<code class="nlg-inline-code">$1</code>');
    return out;
  };

  if (Array.isArray(text)) {
    return (
      <div className="activity-task-description">
        {text.map((line, idx) => (
          <p key={idx} style={{ minHeight: line === "" ? "1rem" : "auto", margin: "4px 0", color: "var(--text-main)", fontSize: "0.9rem", lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseStr(line)) }} />
        ))}
      </div>
    );
  }
  if (typeof text !== "string") return null;
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseStr(text)) }} />;
};

const ActivityAppInner = ({ moduleId, activityId }) => {
  const API_BASE = import.meta.env.VITE_API_URL || "";
  const navigate = useNavigate();
  const { worker, isEngineReady, resetWorker, progress: engineProgress } = usePyodide();
  const { state: onboardingState, isHydrated, startTour } = useOnboarding();
  
  const isReadyRef = useRef(false);
  const isWorkspaceLoadedRef = useRef(false);
  const isUnmountingRef = useRef(false); 
  const loadTimeRef = useRef(0); 
  
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const workerMessageHandler = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const saveDraftTimeoutRef = useRef(null);
  const latestBlocksJsonRef = useRef(null);
  const testResolveRef = useRef(null);
  const testRejectRef = useRef(null);
  const outputAccumulatorRef = useRef("");

  const latestStateRef = useRef({
    userId: null, json: null, pythonCode: "# Drag blocks to generate Python code",
    score: 0, passed: 0, testResults: [], actualTime: "O(n^2)", actualSpace: "O(1)",
    status: "draft", type: "activity", targetTime: "O(n)", targetSpace: "O(1)",
    initial_aes: null, final_aes: null
  });

  const [currentAes, setCurrentAes] = useState(0);
  const [currentRog, setCurrentRog] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSyncingBlocks, setIsSyncingBlocks] = useState(false);
  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...\n");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);
  const [expandedTests, setExpandedTests] = useState({});
  const [bottomPanel, setBottomPanel] = useState(null);
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeComplexityTab, setActiveComplexityTab] = useState("overall");
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  
  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", overall_explanation: "", is_recursive: false, call_graph: {} });
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", isDanger: false, onConfirmAction: null, onCancelAction: null });
  const [isEditingCode, setIsEditingCode] = useState(false);

  const activityTour = {
    id: "activity-tour",
    pageId: `activity-${moduleId}-${activityId}`,
    title: "Activity Tour",
    steps: [
      { target: ".wh-toggle-btn.active", title: "Change the view", description: "Switch between the visual Blockly workspace and generated Python code." },
      { target: ".wh-btn-save", title: "Run the code", description: "Quickly execute your current code without submitting it to the activity grader." },
      { target: ".wh-btn-run", title: "Grade the activity", description: "Run the full evaluation when you are ready to submit your solution." },
      { target: ".footer-tab:nth-child(1)", title: "Open the console", description: "Inspect output, prompts, and execution traces in the console panel.", onEnter: () => { setBottomPanel("console"); setConsoleTab("output"); } },
      { target: ".bottom-docked-panel .clear-console-btn", title: "Clear the console", description: "Clear output before rerunning a test or experiment.", onEnter: () => { setBottomPanel("console"); setConsoleTab("output"); } },
      { target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(2)", title: "Line executions", description: "Check the frequency count for each line in the current solution.", onEnter: () => { setBottomPanel("console"); setConsoleTab("executions"); } },
      { target: ".footer-tab:nth-child(2)", title: "Open complexity analysis", description: "Switch to the complexity panel for time and space analysis.", onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("overall"); } },
      { target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(2)", title: "Local complexity", description: "Inspect local cost per line and see how each step contributes.", onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("local"); } },
      { target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(3)", title: "Global complexity", description: "Switch to the global analysis view for the whole algorithm.", onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("global"); } },
      { target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(4)", title: "Memory map", description: "Open the memory map to visualize how state changes over time.", onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("memory"); } },
      { target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(5)", title: "Call graph", description: "Follow recursion and call flow in the call graph view.", onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("callgraph"); } },
      { target: ".big-o-btn", title: "Big-O reference", description: "Open the complexity reference modal when you need a reminder of the notation.", onEnter: () => setIsBigOModalOpen(true), onExit: () => setIsBigOModalOpen(false) },
      { target: ".big-o-modal-content", title: "Reference library", description: "Browse the reference table and expand entries for deeper details." },
      { target: ".big-o-accordion .big-o-row-trigger", title: "Expandable complexity rows", description: "Open any row to inspect the definition, analogy, and examples behind a complexity class." },
    ],
  };

  const [syntaxErrors, setSyntaxErrors] = useState([]);
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);

  // A curated tour (see introActivityTours.js) exists only for the first
  // activity of each Module 0 lesson. Every other activity falls back to
  // the generic activityTour defined above.
  const introTour = getIntroActivityTour(activityId, moduleId, {
    setIsBigOModalOpen, setBottomPanel, setConsoleTab, setActiveComplexityTab,
  });
  const resolvedActivityTour = introTour || activityTour;

  // Auto-show this activity's tour the first time the learner opens it.
  // ActivityAppInner is remounted (via a `key={moduleId-activityId}` on the
  // outer component) every time the user switches activities, so this ref
  // is naturally scoped per-activity and won't leak into a different one.
  const activityTourAttemptedRef = useRef(false);
  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);
    if (user.isGuest) return;
    if (activityTourAttemptedRef.current) return;
    if (!isHydrated) return;
    const completed = Boolean(onboardingState?.pages?.[resolvedActivityTour.pageId]?.seen);
    if (completed) return;
    const timer = setTimeout(() => {
      activityTourAttemptedRef.current = true;
      startTour(resolvedActivityTour);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingState, isHydrated, startTour, resolvedActivityTour.pageId]);

  const { panelHeight, handleDragStart } = usePanelResizer(300);

  const [activityDataResolved, setActivityDataResolved] = useState(null);
  const [topicIdResolved, setTopicIdResolved] = useState(null);
  const [lessonActivitiesResolved, setLessonActivitiesResolved] = useState([]);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  useEffect(() => {
    if (workspaceRef.current && viewMode === "workspace") {
      setTimeout(() => workspaceRef.current.resize(), 50);
      setTimeout(() => workspaceRef.current.resize(), 300);
    }
  }, [viewMode, isLeftPanelVisible, isRightPanelVisible]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        triggerFinalSave();
        showToast("Draft saved locally and queued for sync.", "success");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moduleId, activityId]);

  const processedTestCases = useMemo(() => {
    if (!activityDataResolved) return [];
    const originalTests = activityDataResolved.testCasesList || [];
    const visibleTests = originalTests.filter((tc) => !tc.isHidden);
    const hiddenTests = originalTests.filter((tc) => tc.isHidden);
    const timeTarget = activityDataResolved.targetTimeComplexity || "O(n)";
    const spaceTarget = activityDataResolved.targetSpaceComplexity || "O(n)";
    return [
      ...visibleTests,
      { isComplexityTest: true, title: "Time Complexity Check", target: timeTarget, call: "Static Code Analysis", expected: `<= ${timeTarget}`, isHidden: false },
      { isComplexityTest: true, title: "Space Complexity Check", target: spaceTarget, call: "Static Code Analysis", expected: `<= ${spaceTarget}`, isHidden: false },
      ...hiddenTests
    ];
  }, [activityDataResolved]);

  const totalTests = processedTestCases.length;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); showToast("Connection restored. Syncing drafts...", "success"); };
    const handleOffline = () => { setIsOnline(false); showToast("Connection lost. Saving drafts locally.", "error"); };
    window.addEventListener("online", handleOnline); window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  workerMessageHandler.current = (event) => {
    const { type, data, counts } = event.data;
    if (type === "ANALYZE_RESULT") {
      if (data.status === "success") {
        setAnalysisTime(data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00");
        setAnalysisResult({
          total: data.total,
          space_total: data.space_total || "O(1)",
          overall_explanation: data.overall_explanation || "",
          lines: data.lines || [],
          call_graph: data.call_graph || {},
          is_recursive: data.is_recursive || false
        });
        
        latestStateRef.current.actualTime = data.total; latestStateRef.current.actualSpace = data.space_total || "O(1)";
        const initialCounts = {};
        (data.lines || []).forEach((l) => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
        setLineExecutions((prev) => ({ ...prev, ...initialCounts }));
        setSyntaxErrors([]);
      } else {
        if (data.multiple_errors && data.multiple_errors.length > 0) {
          const mappedErrors = data.multiple_errors.map((err) => ({ line: err.line, message: `${err.message}. ${translatePythonError(err.message)}` }));
          setSyntaxErrors(mappedErrors);
        } else {
          setSyntaxErrors([{ line: data.line, message: `${data.message}. ${translatePythonError(data.message)}` }]);
        }
      }
    } else if (type === "RUN_RESULT") {
      clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
      if (testResolveRef.current) {
        setTimeout(() => {
          const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
          outputAccumulatorRef.current += flushed + (data !== undefined && data !== null ? data : "");
          if (counts) setLineExecutions((prev) => { const next = { ...prev }; Object.keys(counts).forEach((k) => (next[k] = Math.max(next[k] || 0, counts[k]))); return next; });
          if (testResolveRef.current) testResolveRef.current(outputAccumulatorRef.current);
          testResolveRef.current = null; testRejectRef.current = null;
        }, 50);
      } else {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const resultData = data !== undefined && data !== null && data !== "" ? `\n${String(data)}` : "";
        const finalOutput = flushed + resultData;
        let notice = "";
        
        if (finalOutput.trim() === "") {
          notice = "\n> (Note: Code executed successfully, but no output was printed. Did you call your function?)";
        }
        
        setConsoleOutput((prev) => prev + finalOutput + "\n> Program finished." + notice + "\n");
        if (counts) setLineExecutions((prev) => { const next = { ...prev }; Object.keys(counts).forEach((k) => (next[k] = Math.max(next[k] || 0, counts[k]))); return next; });
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
    } else if (type === "OUTPUT") {
      outputCountRef.current += 1; pendingOutputRef.current += data;
      if (outputCountRef.current > 5000) {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current); resetWorker();
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const floodMsg = "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n";
        if (testRejectRef.current) { testRejectRef.current(new Error(floodMsg)); testResolveRef.current = null; testRejectRef.current = null; }
        else { setConsoleOutput((prev) => prev + flushed + floodMsg); setIsEvaluating(false); setIsWaitingForInput(false); }
        outputCountRef.current = 0;
      } else if (!renderIntervalRef.current && !testResolveRef.current) {
        renderIntervalRef.current = setInterval(() => { if (pendingOutputRef.current) { setConsoleOutput((prev) => prev + pendingOutputRef.current); pendingOutputRef.current = ""; } }, 100);
      }
    } else if (type === "INPUT_REQUEST") {
      clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
      const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
      setConsoleOutput((prev) => prev + flushed + data.prompt);
      setIsWaitingForInput(true);
    } else if (type === "ERROR") {
      clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
      if (testResolveRef.current) {
        pendingOutputRef.current += data;
      } else {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput((prev) => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
    }
  };

  useEffect(() => { 
    if (worker) { 
      workerRef.current = worker; 
      workerRef.current.onmessage = (event) => workerMessageHandler.current(event); 
    } 
  }, [worker]);

  const toggleTest = (index) => setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] }));
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const fetchJsonWithCache = async (cacheKey, url) => {
    try {
      const res = await fetch(`${url}?t=${new Date().getTime()}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await res.json();
          try { await templatesDB.setItem(cacheKey, json); } catch (e) { }
          return json;
        } else throw new Error("Response is not JSON format");
      } else throw new Error(`HTTP error ${res.status}`);
    } catch (e) { console.warn(`Network fetch failed for ${url}, falling back to cache.`, e); }
    try {
      const cached = await templatesDB.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { }
    throw new Error(`Fetch failed for ${url} and no cache available.`);
  };

  const resolveActivityFromModule = async () => {
    const mid = String(moduleId).replace(/[^0-9]/g, "");
    if (!mid) throw new Error("Invalid moduleId");
    const activitiesJson = await fetchJsonWithCache(`activities:module_${mid}`, `/data/activities/module_${mid}.json`);

    let foundActivity = null; let foundLessonKey = null; let activitiesInLesson = [];
    for (const [lessonKey, list] of Object.entries(activitiesJson || {})) {
      if (!Array.isArray(list)) continue;
      const matched = list.find((a) => a && a.id === activityId);
      if (matched) { foundActivity = matched; foundLessonKey = lessonKey; activitiesInLesson = list; break; }
    }

    if (!foundActivity) throw new Error("Activity not found in module activities JSON");

    const lessonNum = foundLessonKey.replace("lesson_", "");
    setTopicIdResolved(`lesson-${mid}-${lessonNum}`);
    setLessonActivitiesResolved(activitiesInLesson);

    return {
      id: foundActivity.id, title: foundActivity.title || foundLessonKey, task: foundActivity.task,
      type: foundActivity.type || (foundLessonKey === "optimizations" ? "optimization" : "activity"),
      difficulty: foundActivity.difficulty || (foundLessonKey === "optimizations" ? "Advanced" : "Easy"),
      targetTimeComplexity: foundActivity.targetTime || foundActivity.targetTimeComplexity || "O(n)",
      targetSpaceComplexity: foundActivity.targetSpace || foundActivity.targetSpaceComplexity || "O(n)",
      testCasesList: (foundActivity.testCasesPool || []).map((tc) => ({ call: tc.call, expected: tc.expected, isHidden: !!tc.isHidden })),
      templateUrl: foundActivity.templateUrl || null,
    };
  };

  const getFailsafeWorkspaceJson = () => {
    let finalJson = latestStateRef.current.json;
    if (workspaceRef.current) {
        try {
            if (typeof workspaceRef.current.getJson === 'function') {
                const wsJson = workspaceRef.current.getJson();
                if (wsJson && Object.keys(wsJson).length > 0) finalJson = wsJson;
            } else if (typeof workspaceRef.current.getBlocksJson === 'function') {
                const wsJson = workspaceRef.current.getBlocksJson();
                if (wsJson && Object.keys(wsJson).length > 0) finalJson = wsJson;
            }
        } catch(e) {}
    }
    return finalJson;
  };

  // ANTI-WIPEOUT PROTECTION: Protects against Unmount Destruction
  const triggerFinalSave = async () => {
    const state = latestStateRef.current;
    if (!state.userId) return;

    let currentJson = getFailsafeWorkspaceJson();
    const isJsonEmpty = !currentJson || Object.keys(currentJson).length === 0 || (currentJson.blocks && currentJson.blocks.blocks && currentJson.blocks.blocks.length === 0);
    const hasValidPython = state.pythonCode && state.pythonCode !== "# Drag blocks to generate Python code" && state.pythonCode.trim() !== "";
    
    // Critical: If blocks are empty due to worker race condition but python is valid, recover blocks from DB
    if (isJsonEmpty && hasValidPython) {
        try {
            const subId = `${state.userId}_${moduleId}_${activityId}`;
            const existingSub = await submissionsDB.getItem(subId);
            if (existingSub && existingSub.workspace && existingSub.workspace.blocklyJson) {
                currentJson = existingSub.workspace.blocklyJson;
            }
        } catch(e) {}
    }

    if (isJsonEmpty && !hasValidPython) return;

    const payload = {
      userId: state.userId, moduleId: moduleId, activityId: activityId, type: state.type || "activity", status: state.status || "draft",
      score: state.score, maxScore: 100,
      initial_aes: state.initial_aes, final_aes: state.final_aes,
      rog: (state.final_aes || 0) - (state.initial_aes || 0),
      passedTestCases: state.passed, totalTestCases: totalTests, passed_tests: state.passed, total_tests: totalTests,
      testCases: state.testResults, target_complexity: state.targetTime || "O(n)", actual_complexity: state.actualTime,
      target_space_complexity: state.targetSpace || "O(1)", actual_space_complexity: state.actualSpace,
      workspace: { blocklyJson: currentJson || {} }, pythonCode: state.pythonCode, timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: true,
    };

    const finalSubId = `${state.userId}_${moduleId}_${activityId}`;
    try { submissionsDB.setItem(finalSubId, { ...payload, isSynced: false }); } catch (e) {}

    if (navigator && navigator.onLine && API_BASE) {
      try {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
        fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), keepalive: true });
      } catch (err) { pushToSyncQueue(`sync_${finalSubId}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); }
    } else pushToSyncQueue(`sync_${finalSubId}`, { type: "SUBMISSION", action: "UPSERT", data: payload });
  };

  useEffect(() => {
    const handleBeforeUnload = () => triggerFinalSave();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    let cancelled = false; 
    isReadyRef.current = false;
    isUnmountingRef.current = false;

    const boot = async () => {
      try {
        const resolvedActivity = await resolveActivityFromModule();
        if (cancelled) return;
        setActivityDataResolved(resolvedActivity);
        latestStateRef.current.type = resolvedActivity.type; latestStateRef.current.targetTime = resolvedActivity.targetTimeComplexity; latestStateRef.current.targetSpace = resolvedActivity.targetSpaceComplexity;

        const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!storedUser) { navigate("/learning-path", { replace: true }); return; }
        const user = JSON.parse(storedUser); latestStateRef.current.userId = user.email;

        const submissionId = `${user.email}_${moduleId}_${activityId}`;
        let localSubmission = null; try { localSubmission = await submissionsDB.getItem(submissionId); } catch (e) { }
        let cloudSubmission = null;
        if (navigator && navigator.onLine && !user.isGuest && API_BASE) {
          try {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const res = await fetch(`${API_BASE}/api/get-submission?activityId=${activityId}&moduleId=${moduleId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); if (data && data.submission) cloudSubmission = data.submission; }
          } catch (e) { }
        }

        let finalSubmissionToLoad = null;
        const localCode = localSubmission?.pythonCode || ""; 
        const cloudCode = cloudSubmission?.pythonCode || "";
        const isLocalBlank = !localCode || localCode.trim() === "" || localCode === "# Drag blocks to generate Python code";
        const isCloudBlank = !cloudCode || cloudCode.trim() === "" || cloudCode === "# Drag blocks to generate Python code";

        if (!isLocalBlank && isCloudBlank) {
            finalSubmissionToLoad = localSubmission; 
        } else if (isLocalBlank && !isCloudBlank) {
            finalSubmissionToLoad = cloudSubmission;
            try { await submissionsDB.setItem(submissionId, cloudSubmission); } catch (e) {}
        } else if (localSubmission && cloudSubmission) {
           finalSubmissionToLoad = (localSubmission.timestamp || 0) >= (cloudSubmission.timestamp || 0) ? localSubmission : cloudSubmission;
        } else if (localSubmission) {
           finalSubmissionToLoad = localSubmission;
        } else if (cloudSubmission) {
           finalSubmissionToLoad = cloudSubmission;
        }

        const applyWorkspaceData = (json, pythonCode) => {
          if (workspaceRef.current?.loadTemplate && !cancelled && !isUnmountingRef.current) {
             workspaceRef.current.loadTemplate(json || {}, pythonCode);
             loadTimeRef.current = Date.now();
          } else if (!cancelled && !isUnmountingRef.current) {
             setTimeout(() => applyWorkspaceData(json, pythonCode), 100);
          }
        };

        if (finalSubmissionToLoad && finalSubmissionToLoad.activityId === activityId && !cancelled) {
          try {
            const json = finalSubmissionToLoad.workspace?.blocklyJson || finalSubmissionToLoad.blocklyJson || {};
            const pythonCode = finalSubmissionToLoad.pythonCode;
            latestStateRef.current.json = json; latestStateRef.current.pythonCode = pythonCode;
            latestStateRef.current.score = finalSubmissionToLoad.score || 0;

            latestStateRef.current.initial_aes = finalSubmissionToLoad.initial_aes ?? null;
            latestStateRef.current.final_aes = finalSubmissionToLoad.final_aes ?? null;
            latestStateRef.current.passed = finalSubmissionToLoad.passedTestCases || finalSubmissionToLoad.passed_tests || 0;
            latestStateRef.current.status = finalSubmissionToLoad.status || "draft";

            let loadedScore = finalSubmissionToLoad.score || 0;
            if (finalSubmissionToLoad.maxScore === 5 && loadedScore <= 5) loadedScore = (loadedScore / 5) * 100;

            const computedAes = Math.min(loadedScore, 100);
            setCurrentAes(computedAes);

            const loadedInitAes = finalSubmissionToLoad.initial_aes ?? null;
            if (loadedInitAes !== null) {
              const calcRog = computedAes - loadedInitAes;
              setCurrentRog(calcRog > 0 ? calcRog : 0);
            }

            applyWorkspaceData(json, pythonCode);
            if (pythonCode && pythonCode !== "# Drag blocks to generate Python code") {
                setGeneratedPython(pythonCode);
                
                const isJsonEmpty = !json || Object.keys(json).length === 0 || (json.blocks && json.blocks.blocks && json.blocks.blocks.length === 0);
                if (isJsonEmpty) {
                    setViewMode("python");
                    setIsEditingCode(true);
                }
            }
          } catch (e) { console.error("Failed to load blocks"); }
        } else if (resolvedActivity.templateUrl) {
          try {
            let fetchUrl = resolvedActivity.templateUrl;
            if (resolvedActivity.id && resolvedActivity.id.includes('opt')) {
              fetchUrl = `/data/optimizations/${resolvedActivity.id}.json`;
            }

            const rawTemplate = await fetchJsonWithCache(`template:${resolvedActivity.id}`, fetchUrl);

            let templateBlocks = rawTemplate;
            let templatePython = "# Drag blocks to generate Python code";

            if (rawTemplate.type === "algoblocks_project") {
              templateBlocks = rawTemplate.blocklyJson;
              templatePython = rawTemplate.pythonCode || templatePython;
            } else if (rawTemplate.workspace && rawTemplate.workspace.blocklyJson) {
              templateBlocks = rawTemplate.workspace.blocklyJson;
              templatePython = rawTemplate.pythonCode || templatePython;
            }

            latestStateRef.current.json = templateBlocks;
            latestStateRef.current.pythonCode = templatePython;

            applyWorkspaceData(templateBlocks, templatePython);

            if (templatePython && templatePython !== "# Drag blocks to generate Python code") {
              setGeneratedPython(templatePython);
            }
          } catch (err) { console.error("Template load error:", err); }
        }

        const savedTests = localStorage.getItem(`activity_tests_${moduleId}_${activityId}`);
        if (savedTests && !cancelled) {
          try { const { consoleOutput: savedOut, passedTests: savedPassed } = JSON.parse(savedTests); if (savedOut) setConsoleOutput(savedOut); if (savedPassed !== undefined) setPassedTests(savedPassed); } catch (e) { }
        }
        if (!cancelled) isReadyRef.current = true;
      } catch (e) { console.error("Activity bootstrap failed:", e); if (!cancelled) navigate("/learning-path", { replace: true }); }
    };
    boot();
    return () => { 
        isUnmountingRef.current = true; 
        cancelled = true; 
        triggerFinalSave(); 
        if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current); 
    };
  }, [moduleId, activityId]);

  const saveSubmission = async (json, pythonCode, score = null, passed = null, total = totalTests, testResults = null, actualTime = "O(n^2)", actualSpace = "O(1)", isDraft = false) => {
    if (!latestStateRef.current.userId) return;
    const finalScore = score !== null ? score : latestStateRef.current.score;
    const finalPassed = passed !== null ? passed : latestStateRef.current.passed;
    const finalTestResults = testResults !== null ? testResults : latestStateRef.current.testResults;
    const finalStatus = isDraft ? (finalScore >= 50 ? "passed" : "draft") : (finalScore >= 50 ? "passed" : "failed");

    let safeJson = json;
    const isBlocksEmpty = !safeJson || Object.keys(safeJson).length === 0 || (safeJson.blocks && safeJson.blocks.blocks && safeJson.blocks.blocks.length === 0);
    const hasValidPython = pythonCode && pythonCode !== "# Drag blocks to generate Python code" && pythonCode.trim() !== "";

    // ANTI-WIPEOUT: Secure recovery if json is empty but code exists
    const submissionId = `${latestStateRef.current.userId}_${moduleId}_${activityId}`;
    if (isBlocksEmpty && hasValidPython) {
        try {
            const existingSub = await submissionsDB.getItem(submissionId);
            if (existingSub && existingSub.workspace && existingSub.workspace.blocklyJson && Object.keys(existingSub.workspace.blocklyJson).length > 0) {
                safeJson = existingSub.workspace.blocklyJson;
            }
        } catch(e) {}
    }

    latestStateRef.current.json = safeJson; 
    latestStateRef.current.pythonCode = pythonCode; 
    latestStateRef.current.score = finalScore; 
    latestStateRef.current.passed = finalPassed; 
    latestStateRef.current.testResults = finalTestResults; 
    latestStateRef.current.status = finalStatus;

    const payload = {
      userId: latestStateRef.current.userId, moduleId: moduleId, activityId: activityId, type: latestStateRef.current.type || "activity", status: finalStatus,
      score: finalScore, maxScore: 100,
      initial_aes: latestStateRef.current.initial_aes, final_aes: latestStateRef.current.final_aes,
      rog: (latestStateRef.current.final_aes || 0) - (latestStateRef.current.initial_aes || 0),
      passedTestCases: finalPassed, totalTestCases: total, passed_tests: finalPassed, total_tests: total, testCases: finalTestResults, target_complexity: latestStateRef.current.targetTime || "O(n)", actual_complexity: actualTime, target_space_complexity: latestStateRef.current.targetSpace || "O(1)", actual_space_complexity: actualSpace, workspace: { blocklyJson: safeJson || {} }, pythonCode: pythonCode || "", timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: false,
    };

    try { await submissionsDB.setItem(submissionId, payload); window.dispatchEvent(new Event("localDataSynced")); } catch (e) { }

    if (navigator && !navigator.onLine) { pushToSyncQueue(`sync_${submissionId}_${Date.now()}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); return; }

    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (API_BASE) {
        const response = await fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...payload, isSynced: true }) });
        if (response.ok) {
           try { await submissionsDB.setItem(submissionId, { ...payload, isSynced: true }); } catch(e) {}
        } else throw new Error("Server rejected submission");
      }
    } catch (err) { pushToSyncQueue(`sync_${submissionId}_${Date.now()}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); }
  };

  const handleWorkspaceAutoSave = (json, pythonCode) => {
    if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    saveDraftTimeoutRef.current = setTimeout(async () => {
      if (pythonCode && pythonCode !== "# Drag blocks to generate Python code") {
        await saveSubmission(json, pythonCode, null, null, totalTests, null, latestStateRef.current.actualTime, latestStateRef.current.actualSpace, true);
      }
    }, 1500);
  };

  useEffect(() => {
    if (!isReadyRef.current || isUnmountingRef.current) return;
    if (isOnline && isEngineReady && workerRef.current && generatedPython && generatedPython !== "# Drag blocks to generate Python code") {
      const timeoutId = setTimeout(() => {
        workerRef.current.postMessage({ type: "ANALYZE_CODE", code: sanitizePythonCode(generatedPython) });
      }, 800);
      return () => clearTimeout(timeoutId);
    }
  }, [generatedPython, isOnline, isEngineReady]);

  const handleWorkspaceChange = async (json, incomingPythonCode, isUnsynced = false) => {
    if (isUnmountingRef.current || !isReadyRef.current) return;

    const isIncomingBlocksEmpty = !json || Object.keys(json).length === 0 || (json.blocks && json.blocks.blocks && json.blocks.blocks.length === 0);
    const isIncomingCodeEmpty = !incomingPythonCode || incomingPythonCode.trim() === "" || incomingPythonCode === "# Drag blocks to generate Python code";
    
    // Ignore early ghost wipeout events generated by Blockly's debouncer
    if ((isIncomingBlocksEmpty || isIncomingCodeEmpty) && Date.now() - loadTimeRef.current < 3000) {
        return;
    }

    latestBlocksJsonRef.current = json;
    let codeToSave = incomingPythonCode;
    
    if (isIncomingCodeEmpty && generatedPython && generatedPython.trim() !== "" && generatedPython !== "# Drag blocks to generate Python code") {
        if (Date.now() - loadTimeRef.current < 4000 || !isEditingCode) {
             codeToSave = generatedPython; 
        }
    }

    if (isEditingCode && !isUnsynced) codeToSave = generatedPython;

    const oldCode = (generatedPython || "").trim(); 
    const newCode = (codeToSave || "").trim();

    latestStateRef.current.json = json; 
    latestStateRef.current.pythonCode = codeToSave;
    handleWorkspaceAutoSave(json, codeToSave);

    if (isUnsynced) {
      setIsEditingCode(true);
      if (oldCode !== newCode) { setGeneratedPython(codeToSave); setLineExecutions({}); }
    } else if (!isEditingCode && oldCode !== newCode) {
      setGeneratedPython(codeToSave); setLineExecutions({});
    }
  };

  const handleSyncToBlocks = async () => {
    if (workspaceRef.current && generatedPython) {
      setIsSyncingBlocks(true);
      try {
        await workspaceRef.current.loadFromPython(sanitizePythonCode(generatedPython));
        loadTimeRef.current = Date.now(); // Reset protection timer
        setIsEditingCode(false); 
        setViewMode("workspace");
        showToast("Python code successfully converted into blocks!", "success");
      } catch (e) {
        setModalConfig({ isOpen: true, title: "Sync Error", message: "Cannot sync to blocks until syntax errors are fixed.", confirmText: "Close", isDanger: true, onConfirmAction: closeModal });
      } finally {
        setIsSyncingBlocks(false);
      }
    }
  };

  const handleActivityRun = async () => {
    if (isEvaluating) return;
    if (!isEngineReady) {
      setConsoleOutput(`Still preparing the Python engine${engineProgress?.stage ? ` (${engineProgress.stage})` : ""}. Please wait a moment and try again.`);
      setBottomPanel("console"); setConsoleTab("output");
      return;
    }
    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); setBottomPanel("console"); setConsoleTab("output"); return;
    }
    clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current); setIsEvaluating(true); setLineExecutions({});
    setBottomPanel("console"); setConsoleTab("output"); setConsoleOutput((prev) => prev + "\n> Running the program...\n");

    outputCountRef.current = 0; pendingOutputRef.current = "";
    runTimeoutRef.current = setTimeout(() => {
      resetWorker(); const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
      setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
      setIsEvaluating(false); setIsWaitingForInput(false);
    }, 10000);

    workerRef.current?.postMessage({ type: "RUN_CODE", code: sanitizePythonCode(generatedPython) });
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: "INPUT_RESPONSE", data: userInput });
      outputCountRef.current = 0; setUserInput(""); setIsWaitingForInput(false);

      runTimeoutRef.current = setTimeout(() => {
        resetWorker(); const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false); setIsWaitingForInput(false);
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
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");

    try { await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: false }); } catch(e) {}

    if (navigator && navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (res.ok) {
           try { await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: true }); } catch (e) {}
        } else throw new Error("Sync failed with status: " + res.status);
      } catch (error) { pushToSyncQueue(`sync_prog_${lessonId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload }); }
    } else if (!user.isGuest) pushToSyncQueue(`sync_prog_${lessonId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload });
  };

  const completeFullTopic = async (topicId) => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);
    if (!user.progress) user.progress = {};
    user.progress[topicId] = true;
    localStorage.setItem("user", JSON.stringify(user));

    const payload = { email: user.email, lesson_id: topicId, score: 100, completed: true };
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");

    try { await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: false }); } catch(e) {}

    if (navigator && navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (res.ok) {
            try { await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: true }); } catch (e) {}
        } else throw new Error("Sync failed with status: " + res.status);
      } catch (error) { pushToSyncQueue(`sync_prog_${topicId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload }); }
    } else if (!user.isGuest) pushToSyncQueue(`sync_prog_${topicId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload });
  };

  const executeTest = async (codeToRun) => {
    return new Promise((resolve, reject) => {
      outputAccumulatorRef.current = ""; testResolveRef.current = resolve; testRejectRef.current = reject;
      runTimeoutRef.current = setTimeout(() => {
        resetWorker();
        if (testRejectRef.current) {
          testRejectRef.current(new Error("Infinite Loop detected. Execution timed out after 10 seconds."));
          testResolveRef.current = null; testRejectRef.current = null;
        }
      }, 10000);
      workerRef.current.postMessage({ type: "RUN_CODE", code: codeToRun });
    });
  };

  // INSTANT PROGRESS FIX: Now accurately checks user.progress from localStorage to eliminate API DB sync delays
  const checkLessonCompletion = async (currentActivityId = null, currentScore = null) => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser || !lessonActivitiesResolved.length) return { passedCount: 0, threshold: 1, isCompleted: false };
    
    const user = JSON.parse(storedUser);
    const userProgress = user.progress || {};

    const diffs = lessonActivitiesResolved.map(a => (a.difficulty || 'Easy').toLowerCase());
    const types = lessonActivitiesResolved.map(a => (a.type || 'activity').toLowerCase());

    let threshold = 3;
    if (types.includes('optimization') || lessonActivitiesResolved.some(a => a.id.includes('opt'))) threshold = 2;
    else if (diffs.includes('hard') || diffs.includes('advanced')) threshold = 1;
    else if (diffs.includes('medium') || diffs.includes('intermediate')) threshold = 2;

    threshold = Math.min(threshold, lessonActivitiesResolved.length);

    let passedCount = 0;
    for (const act of lessonActivitiesResolved) {
      if (currentActivityId === String(act.id)) {
         if (currentScore >= 50) passedCount++;
         continue;
      }

      const lessonKey = `${moduleId}:${act.id}`;
      // Instant read from dict
      if (userProgress[lessonKey] >= 50) {
          passedCount++;
      } else {
          // Backup fetch just in case it's missing from dict but in IndexedDB
          const subId = `${user.email}_${moduleId}_${act.id}`;
          try {
            const sub = await submissionsDB.getItem(subId);
            if (sub && sub.score >= 50) passedCount++;
          } catch (e) { }
      }
    }
    return { passedCount, threshold, isCompleted: passedCount >= threshold };
  };

  const handleSuccess = async (aesScore, funcPassed, funcTotal, currentRog) => {
    const currentIndex = lessonActivitiesResolved.findIndex((a) => a.id === activityId);
    const isLast = currentIndex === lessonActivitiesResolved.length - 1;
    const nextActivity = !isLast ? lessonActivitiesResolved[currentIndex + 1] : null;

    const completionData = await checkLessonCompletion(activityId, aesScore);
    const meetsThreshold = completionData.isCompleted;

    if (meetsThreshold && topicIdResolved) {
        try { await completeFullTopic(topicIdResolved); } catch(e) {}
    }

    let promptMsg = "";
    if (aesScore === 100) {
      promptMsg = `Perfect execution!\nYou earned an Algorithmic Efficiency Score (AES) of 100%.\n\nYou passed all functional tests and completely mastered both the target Time and Space complexity!`;
    } else if (funcPassed < funcTotal) {
      promptMsg = `Keep trying!\nYour logic is incomplete. You passed ${funcPassed}/${funcTotal} functional test cases.\nFocus on fixing your syntax and logic before worrying about complexity.`;
    } else if (aesScore >= 75) {
      promptMsg = `Great job!\nYou earned an AES of ${aesScore}%.\n\nYou passed all functional tests, but your algorithm is slightly suboptimal in Time or Space complexity.\nCan you optimize it further to reach 100%?`;
    } else {
      promptMsg = `Good effort.\nYou earned an AES of ${aesScore}%.\n\nYour code works and passed all functional tests! However, it requires a lot more execution time or memory than the optimal solution.\nCan you make it faster or leaner?`;
    }

    if (currentRog > 0) {
      promptMsg += `\n\nOptimization recognized: Your refactoring improved your score by +${currentRog} ROG points!`;
    }

    if (meetsThreshold) promptMsg += `\n\nLesson Unlocked! You've successfully passed ${completionData.passedCount}/${completionData.threshold} required activities to advance.`;
    else promptMsg += `\n\nProgress: ${completionData.passedCount}/${completionData.threshold} required activities passed to advance.`;

    if (!isLast && nextActivity) {
      if (meetsThreshold) {
        setModalConfig({ isOpen: true, title: "Lesson Unlocked!", message: promptMsg + "\n\nYou can move on to the next lesson now, or stay here to complete the remaining optional practice activities.", confirmText: "Go to Next Lesson", cancelText: "Continue Practicing", isDanger: false, onConfirmAction: () => { closeModal(); navigate("/learning-path"); }, onCancelAction: () => { closeModal(); navigate(`/activity/${moduleId}/${nextActivity.id}`); } });
      } else {
        setModalConfig({ isOpen: true, title: "Activity Evaluated", message: promptMsg + "\n\nReady for the next challenge?", confirmText: "Next Activity", cancelText: "Stay Here", isDanger: false, onConfirmAction: () => { closeModal(); navigate(`/activity/${moduleId}/${nextActivity.id}`); }, onCancelAction: closeModal });
      }
    } else {
      setModalConfig({ isOpen: true, title: "Section Completed!", message: `${promptMsg}\n\nIncredible! You have finished all activities in this section.\nReturn to the learning path to explore the next topic.`, confirmText: "Finish", cancelText: "Stay Here", isDanger: false, onConfirmAction: async () => { closeModal(); navigate("/learning-path"); }, onCancelAction: closeModal });
    }
  };

  const runTestCases = async () => {
    if (isEvaluating || isSyncingBlocks) return;
    if (!isEngineReady) {
      setConsoleOutput(`Still preparing the Python engine${engineProgress?.stage ? ` (${engineProgress.stage})` : ""}. Please wait a moment and try again.`);
      setBottomPanel("console"); setConsoleTab("output");
      return;
    }
    if (!processedTestCases.length) return;
    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); setBottomPanel("console"); setConsoleTab("output"); return;
    }

    setIsEvaluating(true); setLineExecutions({});
    setConsoleOutput("Running pre-flight checks (Detecting infinite loops)...\n");
    setBottomPanel("console"); setConsoleTab("output");

    const cleanPayload = sanitizePythonCode(generatedPython);
    try { await executeTest(cleanPayload); } catch (failure) {
      const errorMsg = `Test Execution Prevented:\n\n${failure.error || failure.message}`;
      setConsoleOutput(errorMsg); setBottomPanel("console"); setIsEvaluating(false);
      localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: errorMsg, passedTests: 0 })); return;
    }

    setBottomPanel("console"); setConsoleOutput("\n> --- Running Test Cases ---\n\n"); setPassedTests(0);

    let passed = 0; let functionalPassed = 0; let functionalTotal = 0;
    let fullOutput = "\n> --- Running Test Cases ---\n";

    for (let i = 0; i < totalTests; i++) {
      const tc = processedTestCases[i];
      if (tc.isComplexityTest) {
        const actualVal = tc.title.includes("Time") ? analysisResult.total : analysisResult.space_total;
        const actualWeight = getComplexityWeight(actualVal); const targetWeight = getComplexityWeight(tc.target);
        const testPassed = actualWeight > 0 && actualWeight <= targetWeight;

        if (testPassed) passed++;
        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n  Metric: ${tc.title}\n  Expected: <= ${formatComplexity(tc.target)}\n  Actual: ${formatComplexity(actualVal)}\n\n`;
        setConsoleOutput(fullOutput); setPassedTests(passed); continue;
      }

      functionalTotal++;
      const isFunctionCall = tc.call?.includes("(") && tc.call?.includes(")");
      const taskId = activityDataResolved?.id || ""; const isIntroLevel = taskId === "l1-t1" || taskId === "l1-t3";
      let codeToRun = "";

      if (isFunctionCall && !isIntroLevel) {
          codeToRun = cleanPayload + `\n\ntry:\n    __student_res = ${tc.call}\n    if __student_res == ${tc.expected}:\n        print("TEST_PASSED_FLAG")\n    else:\n        print(f"TEST_FAILED_FLAG:{__student_res}")\nexcept Exception as e:\n    print(f"TEST_ERROR_FLAG:{type(e).__name__}: {str(e)}")`;
      } else {
          codeToRun = `${cleanPayload}\n${tc.call || ""}`;
      }

      try {
        const rawOutput = await executeTest(codeToRun); 
        const actualOutput = rawOutput.trim();
        const expected = String(tc.expected).replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();
        let testPassed = false;
        let displayActual = actualOutput;

        if (isFunctionCall && !isIntroLevel) {
          if (actualOutput.includes("TEST_PASSED_FLAG")) {
             passed++; functionalPassed++; testPassed = true;
          } else if (actualOutput.includes("TEST_FAILED_FLAG:")) {
             displayActual = actualOutput.split("TEST_FAILED_FLAG:").pop().trim();
          } else if (actualOutput.includes("TEST_ERROR_FLAG:")) {
             displayActual = "Error: " + actualOutput.split("TEST_ERROR_FLAG:").pop().trim();
          } else {
             displayActual = actualOutput;
          }
        } else {
          if (actualOutput.trim() === expected) { 
             passed++; functionalPassed++; testPassed = true; 
          }
        }

        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;
        if (!testPassed) {
          if (tc.isHidden) fullOutput += `  [Hidden Test Case] Expected values and inputs are omitted.\n`;
          else fullOutput += `  Expected: ${expected}\n  Actual: ${displayActual || "(No Output)"}\n`;
        }
        fullOutput += "\n";
        setConsoleOutput(fullOutput); setPassedTests(passed);
      } catch (err) { 
        fullOutput += `Test ${i + 1}: ERROR\n  Message: ${err.message}\n\n`; 
        setConsoleOutput(fullOutput); 
        break;
      }
    }

    setIsEvaluating(false);

    const tsr = functionalTotal > 0 ? (functionalPassed / functionalTotal) : 1.0;
    const targetTimeWeight = getComplexityWeight(activityDataResolved?.targetTimeComplexity || "O(n)");
    const actualTimeWeight = getComplexityWeight(analysisResult.total || "O(n^2)");

    const targetSpaceWeight = getComplexityWeight(activityDataResolved?.targetSpaceComplexity || "O(1)");
    const actualSpaceWeight = getComplexityWeight(analysisResult.space_total || "O(n)");

    const safeActualTime = actualTimeWeight > 0 ? actualTimeWeight : 6;
    const safeActualSpace = actualSpaceWeight > 0 ? actualSpaceWeight : 6;

    let timeRatio = targetTimeWeight / safeActualTime;
    if (timeRatio > 1.0) timeRatio = 1.0;

    let spaceRatio = targetSpaceWeight / safeActualSpace;
    if (spaceRatio > 1.0) spaceRatio = 1.0;

    const averageEfficiency = (timeRatio + spaceRatio) / 2;
    let aes = Math.floor((tsr * averageEfficiency) * 100);

    setCurrentAes(aes);

    let initialAes = latestStateRef.current.initial_aes;

    if (initialAes === null || initialAes === undefined) {
      if (activityDataResolved?.type === "optimization") {
        initialAes = 50;
      } else {
        initialAes = aes;
      }
    }

    if (aes < initialAes && latestStateRef.current.status !== "passed") {
      initialAes = aes;
    }

    latestStateRef.current.initial_aes = initialAes;
    latestStateRef.current.final_aes = aes;

    const calculatedRog = aes - initialAes;
    setCurrentRog(calculatedRog > 0 ? calculatedRog : 0);

    const testResults = processedTestCases.map((tc, idx) => ({ id: `tc_${idx}`, status: fullOutput.includes(`Test ${idx + 1}: PASSED`) ? "passed" : "failed" }));

    const trueFinalJsonToSave = getFailsafeWorkspaceJson() || latestStateRef.current.json;

    try { await saveSubmission(trueFinalJsonToSave, generatedPython, aes, passed, totalTests, testResults, analysisResult.total || "O(n^2)", analysisResult.space_total || "O(1)", false); } catch(e) { console.error(e) }
    try { localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: fullOutput, passedTests: passed, score: aes })); } catch(e) {}

    const lessonKey = `${moduleId}:${activityId}`;
    try { await savePartialProgress(lessonKey, aes); } catch(e) { console.error(e) }

    await handleSuccess(aes, functionalPassed, functionalTotal, calculatedRog);
  };

  return (
    <div className="activity-app-container">
      {toast.show && <div className={`toast-notification ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.message}</div>}

      <header className="workspace-header-purple">
        <div className="wh-left">
          <button className="wh-back-btn" onClick={() => navigate("/learning-path")}><FiChevronLeft size={18} /> Back</button>
          <div className="wh-divider"></div>
          <h1 className="wh-project-title">Activity: {activityDataResolved?.title || "Loading..."}</h1>
        </div>
        <div className="wh-center">
          <div className="wh-view-toggle">
            <button className={`wh-toggle-btn ${viewMode === "workspace" ? "active" : ""}`} onClick={() => setViewMode("workspace")}><FiGrid size={14} /> Workspace</button>
            <button className={`wh-toggle-btn ${viewMode === "python" ? "active" : ""}`} onClick={() => setViewMode("python")}><FiTerminal size={14} /> Python Code</button>
          </div>
        </div>
        <div className="wh-right">
          <TourHelpButton pageId={resolvedActivityTour.pageId} tour={resolvedActivityTour} label="Replay activity tour" />
          <button className={`wh-btn-save ${!isEngineReady ? "engine-loading" : ""}`} onClick={handleActivityRun} disabled={isEvaluating || isSyncingBlocks || !isEngineReady} title={!isEngineReady ? (engineProgress?.stage || "Preparing Python engine...") : "Run code without submitting to test cases"}>
            {!isEngineReady ? (
              <><span className="engine-loading-spinner" /> <span>{engineProgress?.stage || "Preparing..."} {typeof engineProgress?.percent === "number" ? `(${engineProgress.percent}%)` : ""}</span></>
            ) : (
              <><FiTerminal size={16} /> <span>{isEvaluating ? "..." : "Run Code"}</span></>
            )}
          </button>
          <button className={`wh-btn-run ${isEvaluating ? "running" : ""} ${!isEngineReady ? "engine-loading" : ""}`} onClick={runTestCases} disabled={isEvaluating || isSyncingBlocks || !isEngineReady} title={!isEngineReady ? (engineProgress?.stage || "Preparing Python engine...") : undefined}>
            {!isEngineReady ? (
              <><span className="engine-loading-spinner" /> <span>{engineProgress?.stage || "Preparing..."} {typeof engineProgress?.percent === "number" ? `(${engineProgress.percent}%)` : ""}</span></>
            ) : (
              <><FiPlay size={16} /> <span>{isEvaluating ? "..." : isSyncingBlocks ? "Syncing..." : "Submit"}</span></>
            )}
          </button>
        </div>
      </header>

      <Split className={`workspace-split activity-split ${!isLeftPanelVisible ? "left-hidden" : ""} ${!isRightPanelVisible ? "right-hidden" : ""}`} sizes={[20, 60, 20]} minSize={[isLeftPanelVisible ? 250 : 0, 400, isRightPanelVisible ? 250 : 0]} gutterSize={8}>

        <aside className="activity-left-panel">
          {lessonActivitiesResolved.length > 0 && (
            <div className="activity-selector-container">
              <label className="activity-selector-label"><FiBookOpen size={16} /> Lesson Outline</label>
              <select className="activity-selector-dropdown" value={activityId} onChange={(e) => navigate(`/activity/${moduleId}/${e.target.value}`)}>
                {lessonActivitiesResolved.map((act, index) => (<option key={act.id} value={act.id}>{index + 1}. {act.title}</option>))}
              </select>
            </div>
          )}
          <div className="activity-panel-header">
            <h2><FiInfo size={20} /> Description</h2>
          </div>
          <div className="activity-panel-content">
            <div className="activity-task-header">
              <h2 className="activity-title-text">{activityDataResolved?.title || "Loading..."}</h2>
              <span className={`difficulty-badge ${activityDataResolved?.difficulty?.toLowerCase() || "easy"}`}>{activityDataResolved?.difficulty || "Easy"}</span>
            </div>
            <div className="activity-card">
              {renderFormattedTask(activityDataResolved?.task || "Loading activity...")}
            </div>
          </div>
        </aside>

        <main className="workspace-main activity-center-panel">
          <button className={`sidebar-toggle-btn ${!isLeftPanelVisible ? "closed" : ""}`} onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} title="Toggle Instructions">
            <FiChevronRight className="toggle-icon" />
          </button>
          <button className={`sidebar-toggle-btn right-panel-toggle ${!isRightPanelVisible ? "closed" : ""}`} onClick={() => setIsRightPanelVisible(!isRightPanelVisible)} title="Toggle Test Cases">
            <FiChevronLeft className="toggle-icon" />
          </button>

          <div className="editor-container">
            <div className={viewMode === "workspace" ? "workspace-view d-block" : "workspace-view d-none"} style={{ width: "100%", height: "100%" }}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} syntaxError={null} />
            </div>
            <PythonCodeEditor
              viewMode={viewMode}
              pythonCode={generatedPython}
              isEditingCode={isEditingCode}
              syntaxErrors={syntaxErrors || []}
              onSyncToBlocks={handleSyncToBlocks}
              onChangeCode={(value) => {
                if (isUnmountingRef.current) return;
                const newCode = sanitizePythonCode(value);
                setGeneratedPython(newCode); setIsEditingCode(true); setSyntaxErrors([]);
                latestStateRef.current.pythonCode = newCode; handleWorkspaceAutoSave(getFailsafeWorkspaceJson() || latestStateRef.current.json, newCode);
              }}
              onMountEditor={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
            />
          </div>

          {bottomPanel && (
            <DockedBottomPanel
              bottomPanel={bottomPanel}
              onClosePanel={() => setBottomPanel(null)}
              panelHeight={panelHeight}
              onDragStart={handleDragStart}
              consoleTab={consoleTab}
              onConsoleTabChange={setConsoleTab}
              consoleOutput={consoleOutput}
              onClearConsole={() => setConsoleOutput("Ready to run...\n")}
              isWaitingForInput={isWaitingForInput}
              userInput={userInput}
              setUserInput={setUserInput}
              onSendInput={handleSendInput}
              pythonCode={generatedPython}
              lineExecutions={lineExecutions}
              activeComplexityTab={activeComplexityTab}
              onComplexityTabChange={setActiveComplexityTab}
              analysisResult={analysisResult}
              analysisTime={analysisTime}
              defaultWeight={7}
              analysisTimeLabel="Analyzed In:"
              analysisBadgeStyle={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
              analysisLabelStyle={{ color: '#64748B' }}
              analysisValStyle={{ color: '#0F172A' }}
              extraBadges={
                <>
                  <span className="total-badge aes-badge" style={{ position: 'relative' }}>
                    <span className="total-label">AES:</span>
                    <span className="total-val">{currentAes}%</span>
                    <div className="info-tooltip">
                      <FiInfo size={14} />
                      <span className="tooltip-text" style={{ zIndex: 9999, bottom: 'auto', top: '150%', left: '50%', transform: 'translateX(-50%)' }}>
                        <span className="tooltip-title">Algorithmic Efficiency Score</span>
                        Measures how efficiently your code solves the problem compared to the target optimal Time and Space complexity.
                      </span>
                    </div>
                  </span>
                  {currentRog > 0 && (
                    <span className="total-badge rog-badge" style={{ position: 'relative' }}>
                      <span className="total-label">ROG:</span>
                      <span className="total-val">+{currentRog}</span>
                      <div className="info-tooltip">
                        <FiInfo size={14} />
                        <span className="tooltip-text" style={{ zIndex: 9999, bottom: 'auto', top: '150%', left: '50%', transform: 'translateX(-50%)' }}>
                          <span className="tooltip-title">Refactoring Optimization Gain</span>
                          Points earned by refactoring and improving your initial solution's performance. Great job!
                        </span>
                      </div>
                    </span>
                  )}
                </>
              }
            />
          )}

          <WorkspaceFooterBar
            bottomPanel={bottomPanel}
            onTogglePanel={(panel) => setBottomPanel(bottomPanel === panel ? null : panel)}
            onOpenBigOModal={() => setIsBigOModalOpen(true)}
          >
            <button
              className="footer-action-icon clear-btn"
              title="Restart Activity"
              onClick={() =>
                setModalConfig({
                  isOpen: true, title: "Restart Activity?", message: "Are you sure you want to restart this activity? Your progress will be lost.",
                  confirmText: "Restart", cancelText: "Cancel", isDanger: true,
                  onConfirmAction: async () => {
                    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
                    if (storedUser) { const user = JSON.parse(storedUser); try { await submissionsDB.removeItem(`${user.email}_${moduleId}_${activityId}`); } catch(e){} }
                    localStorage.removeItem(`activity_tests_${moduleId}_${activityId}`);
                    await saveSubmission(null, "# Drag blocks to generate Python code", 0, 0, totalTests, [], "O(1)", "O(1)", true);
                    window.location.reload();
                  }, onCancelAction: closeModal
                })
              }
            >
              <FiActivity size={16} /> Restart
            </button>
          </WorkspaceFooterBar>
        </main>

        <aside className="activity-right-panel">
          <div className="activity-panel-header">
            <h3>Test Cases</h3>
            <span className="test-cases-counter">{passedTests}/{totalTests} passed</span>
          </div>
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
                    <div className="test-case-header-left">
                      <div className={`test-case-indicator ${statusClass}`}></div>
                      <strong className="test-case-title">{displayTitle}</strong>
                    </div>
                    {tc.isHidden ? <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>[Locked]</span> : <FiChevronRight size={16} className={`test-case-chevron ${isExpanded ? "open" : ""}`} />}
                  </div>
                  {isExpanded && !tc.isHidden && (
                    <div className="test-case-details">
                      <div className="test-case-row">
                        <span className="test-case-label">{tc.isComplexityTest ? "Metric Constraint:" : "Input:"}</span>
                        <code className="test-case-code">{tc.call}</code>
                      </div>
                      <div className="test-case-row">
                        <span className="test-case-label">{tc.isComplexityTest ? "Requirement:" : "Expected Output:"}</span>
                        <code className="test-case-code">{tc.expected}</code>
                      </div>
                      {(isPassing || isFailing || isError) && (
                        <div className="test-case-status-row">
                          <span className="test-case-label">Result:</span>
                          <span style={{ fontWeight: "bold", color: isPassing ? "#10B981" : "#EF4444" }}>{isPassing ? "Passed" : isFailing ? "Failed (Incorrect)" : "Failed (Syntax Error)"}</span>
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

      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} cancelText={modalConfig.cancelText} isDanger={modalConfig.isDanger} onCancel={modalConfig.onCancelAction || closeModal} onConfirm={modalConfig.onConfirmAction} />
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
    </div>
  );
};

const ActivityApp = () => {
  const { moduleId, activityId } = useParams();
  return <ActivityAppInner key={`${moduleId}-${activityId}`} moduleId={moduleId} activityId={activityId} />;
};

export default ActivityApp;