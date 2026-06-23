// frontend/src/pages/ActivityApp.jsx
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiAlertCircle, FiBookOpen, FiChevronDown, FiChevronLeft, FiChevronRight, FiGrid, FiInfo, FiPlay, FiTerminal, FiX } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import CallGraphVisualizer from "../components/CallGraphVisualizer.jsx";
import ComplexityGraph from "../components/ComplexityGraph.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import MemoryVisualizer from "../components/MemoryVisualizer.jsx";
import { usePyodide } from "../context/PyodideContext.jsx";
import { progressDB, submissionsDB, syncQueueDB, templatesDB } from "../db.js";
import "../styles/ActivityApp.css";
import { translatePythonError } from "../utils/errorTranslator.js";
import { formatComplexity } from "../utils/formatters";

const handleEditorWillMount = (monaco) => {
  monaco.editor.defineTheme("algoblocks-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7928CA", fontStyle: "bold" },
      { token: "string", foreground: "10B981" },
      { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
      { token: "number", foreground: "F59E0B" },
    ],
    colors: {
      "editor.background": "#F8FAFC",
      "editor.foreground": "#1E293B",
      "editorLineNumber.foreground": "#CBD5E1",
      "editor.lineHighlightBackground": "#F1F5F9",
      "editorCursor.foreground": "#7928CA",
      "editor.selectionBackground": "#E2E8F0",
      "editor.inactiveSelectionBackground": "#F1F5F9",
    },
  });
};

const getComplexityColor = (complexity) => {
  const comp = String(complexity || "").toLowerCase();
  if (comp.includes("o(1)")) return "#10B981";
  if (comp.includes("log n") && !comp.includes("n log")) return "#0EA5E9";
  if (comp.includes("o(n)") && !comp.includes("log")) return "#F59E0B";
  if (comp.includes("n log n")) return "#F97316";
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("n*m")) return "#EF4444";
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("n!")) return "#7928CA";
  return "#64748B";
};

// =========================================================================
// THESIS METHODOLOGY: ASYMPTOTIC WEIGHT MAPPING
// =========================================================================
const getComplexityWeight = (complexity) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, "");
  if (comp.includes("n!") || comp.includes("n*t(n-1)")) return 9;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("c^n") || comp.includes("t(n-1)+t(n-2)")) return 8;
  if (comp.includes("n^4") || comp.includes("n⁴")) return 7.5;
  if (comp.includes("n^3") || comp.includes("n³") || comp.includes("n*n*n")) return 7;
  if (comp.includes("n^2log") || comp.includes("n²log")) return 6.5;
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("n*n") || comp.includes("n*m") || comp.includes("m*n") || comp.includes("t(n-1)+o(n)")) return 6;
  if (comp.includes("nlogn") || comp.includes("n*log") || comp.includes("nlog") || comp.includes("2t(n/2)+o(n)") || comp.includes("t(n-1)+o(log")) return 5;
  if (comp.includes("v+e") || comp.includes("e+v") || comp.includes("n+m") || comp.includes("m+n")) return 4.5;
  if (comp.includes("o(n)") || comp.includes("o(m)") || comp.includes("2t(n/2)+o(1)") || comp.includes("t(n/2)+o(n)") || comp.includes("t(n-1)+o(1)")) return 4;
  if (comp.includes("√n") || comp.includes("sqrt")) return 3;
  if (comp.includes("logn") || comp.includes("log(n)") || comp.includes("log") || comp.includes("t(n/2)+o(1)")) return 2;
  if (comp.includes("o(1)")) return 1;
  return 6;
};

// ---------------------------------------------------------------------------------
// ADVANCED MARKDOWN PARSER (Custom Built for Asymptotic Step-by-Step Math)
// ---------------------------------------------------------------------------------
const parseMarkdown = (str) => {
  if (!str) return "";
  let html = str.trim();

  html = html.replace(/^###\s+(.*)$/gm, '<h3 class="overall-main-title">$1</h3>');
  html = html.replace(/^####\s+(.*)$/gm, '<h4 class="overall-sub-title">$1</h4>');
  html = html.replace(/^#####\s+(.*)$/gm, '<h5 class="overall-section-title">$1</h5>');

  html = html.replace(/\*\*(Step \d+:.*?)\*\*/g, '<span class="step-badge">$1</span>');
  html = html.replace(/\*\*(\d+\.\s.*?)\*\*/g, '<span class="step-badge">$1</span>');
  html = html.replace(/\*\*(Asymptotic Simplification|Final Asymptotic Complexity:?|Complexity Summary)\*\*/g, '<h5 class="overall-section-title">$1</h5>');

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  html = html.replace(/([a-zA-Z0-9_]+)\^([a-zA-Z0-9\+\-\/]+)/g, '$1<sup>$2</sup>');

  html = html.replace(/^`([TS]\(n\)\s*=.*?)`$/gm, '<div class="math-block">$1</div>');
  html = html.replace(/`([TS]\(n\)\s*=.*?)`/g, '<div class="math-block">$1</div>');

  html = html.replace(/`([^`]+)`/g, '<code class="nlg-inline-code">$1</code>');

  let blocks = html.split(/\n\s*\n/);
  let parsedBlocks = blocks.map(block => {
    if (block.includes('<h3') || block.includes('<h4') || block.includes('<h5') || block.includes('<div class="math-block"')) {
      return block.replace(/\n/g, '<br/>');
    }

    if (/^[-*]\s+/m.test(block)) {
      let listItems = block.split('\n').reduce((acc, line) => {
        let trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          acc.push(`<li>${trimmed.substring(2).trim()}</li>`);
        } else if (trimmed !== '') {
          if (acc.length > 0) acc[acc.length - 1] = acc[acc.length - 1].replace('</li>', ` ${trimmed}</li>`);
          else acc.push(`<li>${trimmed}</li>`);
        }
        return acc;
      }, []).join('');
      return `<ul class="nlg-list">${listItems}</ul>`;
    }

    return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
  });

  return parsedBlocks.join('');
};

const formatExplanation = (text, isBottleneck, isLocalTab) => {
  if (!text) return null;

  const headerRegex = /(?=\*\*Local Analysis:\*\*|\*\*Global Impact:\*\*|\*\*Educational Insight:\*\*|\*\*Bottleneck Warning:\*\*|\*\*Space Bottleneck:\*\*|\*\*Algorithmic Mastery:\*\*|\*\*Local & Global Analysis:\*\*|\*Profiler verified)/;
  const sections = text.split(headerRegex);

  return sections.map((sec, idx) => {
    let trimmedSec = sec.trim();
    if (!trimmedSec) return null;

    const renderBlock = (content, title, variantClass) => {
      const parsedContent = parseMarkdown(content);
      return (
        <div key={idx} className={`nlg-block ${variantClass}`}>
          <strong className="nlg-block-title">{title}</strong>
          <div className="nlg-block-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedContent) }} />
        </div>
      );
    };

    if (trimmedSec.startsWith("**Local & Global Analysis:**")) return renderBlock(trimmedSec.replace("**Local & Global Analysis:**", "").trim(), "Dead Code Analysis", "nlg-deadcode");
    if (trimmedSec.startsWith("**Local Analysis:**")) return renderBlock(trimmedSec.replace("**Local Analysis:**", "").trim(), "Local Analysis", "nlg-local");
    if (trimmedSec.startsWith("**Global Impact:**")) return renderBlock(trimmedSec.replace("**Global Impact:**", "").trim(), "Global Impact", "nlg-global");
    if (trimmedSec.startsWith("**Educational Insight:**")) return renderBlock(trimmedSec.replace("**Educational Insight:**", "").trim(), "Educational Insight", "nlg-educational");
    if (trimmedSec.startsWith("**Bottleneck Warning:**") || trimmedSec.startsWith("**Space Bottleneck:**")) {
      const cleanText = trimmedSec.replace(/\*\*(Bottleneck Warning:|Space Bottleneck:|Space Bottleneck)\*\*/g, "").trim();
      return renderBlock(cleanText, "Performance Bottleneck", "nlg-bottleneck");
    }
    if (trimmedSec.startsWith("**Algorithmic Mastery:**")) return renderBlock(trimmedSec.replace("**Algorithmic Mastery:**", "").trim(), "Algorithmic Mastery", "nlg-mastery");
    if (trimmedSec.startsWith("*Profiler verified")) return renderBlock(trimmedSec.replace(/\*Profiler verified\*/g, "").replace(/\*Profiler verified/g, "").trim(), "Runtime Diagnostic", "nlg-profiler");

    let parsedSec = parseMarkdown(trimmedSec);
    return <div key={idx} className="nlg-paragraph" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedSec) }}></div>;
  }).filter(Boolean);
};

const sanitizePythonCode = (code) => {
  if (!code) return "";
  return code.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, " ");
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
    userId: null, json: null, pythonCode: "# Drag blocks to generate Python code",
    score: 0, passed: 0, testResults: [], actualTime: "O(n^2)", actualSpace: "O(1)",
    status: "draft", type: "activity", targetTime: "O(n)", targetSpace: "O(1)",
    initial_aes: null, final_aes: null
  });

  const [currentAes, setCurrentAes] = useState(0);
  const [currentRog, setCurrentRog] = useState(0);
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
  const [activeComplexityTab, setActiveComplexityTab] = useState("overall");
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  
  // FIX: Include call_graph in the initial state so it doesn't break dependent components
  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", overall_explanation: "", is_recursive: false, call_graph: {} });
  
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", isDanger: false, onConfirmAction: null, onCancelAction: null });
  const [isEditingCode, setIsEditingCode] = useState(false);

  const [syntaxErrors, setSyntaxErrors] = useState([]);
  const [isErrorDropdownOpen, setIsErrorDropdownOpen] = useState(false);
  const [errorPanelSize, setErrorPanelSize] = useState({ width: 400, height: 250 });

  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});
  const [panelHeight, setPanelHeight] = useState(300);
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

  const handleErrorResizeStart = (e, direction) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startY = e.clientY;
    const startWidth = errorPanelSize.width; const startHeight = errorPanelSize.height;

    const onMouseMove = (moveEvent) => {
      let newWidth = startWidth; let newHeight = startHeight;
      if (direction.includes('w')) newWidth = startWidth + (startX - moveEvent.clientX);
      if (direction.includes('n')) newHeight = startHeight + (startY - moveEvent.clientY);
      setErrorPanelSize({
        width: Math.max(300, Math.min(newWidth, window.innerWidth * 0.9)),
        height: Math.max(150, Math.min(newHeight, window.innerHeight * 0.8)),
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default"; document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", onMouseMove); document.addEventListener("mouseup", onMouseUp);
    if (direction === 'n') document.body.style.cursor = 'ns-resize';
    else if (direction === 'w') document.body.style.cursor = 'ew-resize';
    else document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = "none";
  };

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
        
        // FIX: Explicitly include call_graph so the React state doesn't drop it!
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
        setSyntaxErrors([]); setIsErrorDropdownOpen(false);
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
        setConsoleOutput((prev) => prev + flushed + resultData + "\n> Program finished.\n");
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
      if (testRejectRef.current) {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        outputAccumulatorRef.current += flushed;
        testRejectRef.current(new Error(data));
        testResolveRef.current = null; testRejectRef.current = null;
      } else {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput((prev) => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
    }
  };

  useEffect(() => { if (worker) { workerRef.current = worker; workerRef.current.onmessage = workerMessageHandler.current; } }, [worker]);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === "output") consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
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
      document.body.style.cursor = "default"; document.body.style.userSelect = "auto";
    };
    document.addEventListener("mousemove", handleMouseMove); document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  const toggleTest = (index) => setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] }));
  const toggleLine = (index) => setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const handleDragStart = (e) => {
    e.preventDefault(); isDragging.current = true;
    document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none";
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

  const triggerFinalSave = () => {
    const state = latestStateRef.current;
    if (!state.userId || (state.pythonCode === "# Drag blocks to generate Python code" && (!state.json || Object.keys(state.json).length === 0))) return;

    const payload = {
      userId: state.userId, moduleId: moduleId, activityId: activityId, type: state.type || "activity", status: state.status || "draft",
      score: state.score, maxScore: 100,
      initial_aes: state.initial_aes, final_aes: state.final_aes,
      rog: (state.final_aes || 0) - (state.initial_aes || 0),
      passedTestCases: state.passed, totalTestCases: totalTests, passed_tests: state.passed, total_tests: totalTests,
      testCases: state.testResults, target_complexity: state.targetTime || "O(n)", actual_complexity: state.actualTime,
      target_space_complexity: state.targetSpace || "O(1)", actual_space_complexity: state.actualSpace,
      workspace: { blocklyJson: state.json || {} }, pythonCode: state.pythonCode, timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: true,
    };

    const finalSubId = `${state.userId}_${moduleId}_${activityId}`;
    submissionsDB.setItem(finalSubId, { ...payload, isSynced: false });

    if (navigator.onLine && API_BASE) {
      try {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
        fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), keepalive: true });
      } catch (err) { syncQueueDB.setItem(`sync_${finalSubId}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); }
    } else syncQueueDB.setItem(`sync_${finalSubId}`, { type: "SUBMISSION", action: "UPSERT", data: payload });
  };

  useEffect(() => {
    const handleBeforeUnload = () => triggerFinalSave();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    let cancelled = false; isReadyRef.current = false;
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
        if (navigator.onLine && !user.isGuest && API_BASE) {
          try {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const res = await fetch(`${API_BASE}/api/get-submission?activityId=${activityId}&moduleId=${moduleId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); if (data && data.submission) cloudSubmission = data.submission; }
          } catch (e) { }
        }

        let finalSubmissionToLoad = null;
        const localCode = localSubmission?.pythonCode || ""; const cloudCode = cloudSubmission?.pythonCode || "";
        const isLocalBlank = !localCode || localCode === "# Drag blocks to generate Python code"; const isCloudBlank = !cloudCode || cloudCode === "# Drag blocks to generate Python code";

        if (isLocalBlank && !isCloudBlank) { finalSubmissionToLoad = cloudSubmission; await submissionsDB.setItem(submissionId, cloudSubmission); }
        else if (!isLocalBlank && !isCloudBlank) finalSubmissionToLoad = (localSubmission.timestamp || 0) >= (cloudSubmission.timestamp || 0) ? localSubmission : cloudSubmission;
        else if (!isLocalBlank) finalSubmissionToLoad = localSubmission;

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

            setTimeout(() => { if (workspaceRef.current?.loadTemplate && !cancelled) workspaceRef.current.loadTemplate(json || {}, pythonCode); }, 400);
            if (pythonCode && pythonCode !== "# Drag blocks to generate Python code") setGeneratedPython(pythonCode);
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

            setTimeout(() => {
              if (workspaceRef.current?.loadTemplate && !cancelled) {
                workspaceRef.current.loadTemplate(templateBlocks, templatePython);
              }
            }, 400);

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
    return () => { cancelled = true; triggerFinalSave(); if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current); };
  }, []);

  const saveSubmission = async (json, pythonCode, score = null, passed = null, total = totalTests, testResults = null, actualTime = "O(n^2)", actualSpace = "O(1)", isDraft = false) => {
    if (!latestStateRef.current.userId) return;
    const finalScore = score !== null ? score : latestStateRef.current.score;
    const finalPassed = passed !== null ? passed : latestStateRef.current.passed;
    const finalTestResults = testResults !== null ? testResults : latestStateRef.current.testResults;
    const finalStatus = isDraft ? (finalScore >= 50 ? "passed" : "draft") : (finalScore >= 50 ? "passed" : "failed");

    latestStateRef.current.json = json; latestStateRef.current.pythonCode = pythonCode; latestStateRef.current.score = finalScore; latestStateRef.current.passed = finalPassed; latestStateRef.current.testResults = finalTestResults; latestStateRef.current.status = finalStatus;

    const submissionId = `${latestStateRef.current.userId}_${moduleId}_${activityId}`;
    const payload = {
      userId: latestStateRef.current.userId, moduleId: moduleId, activityId: activityId, type: latestStateRef.current.type || "activity", status: finalStatus,
      score: finalScore, maxScore: 100,
      initial_aes: latestStateRef.current.initial_aes, final_aes: latestStateRef.current.final_aes,
      rog: (latestStateRef.current.final_aes || 0) - (latestStateRef.current.initial_aes || 0),
      passedTestCases: finalPassed, totalTestCases: total, passed_tests: finalPassed, total_tests: total, testCases: finalTestResults, target_complexity: latestStateRef.current.targetTime || "O(n)", actual_complexity: actualTime, target_space_complexity: latestStateRef.current.targetSpace || "O(1)", actual_space_complexity: actualSpace, workspace: { blocklyJson: json || {} }, pythonCode: pythonCode || "", timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: false,
    };

    try { await submissionsDB.setItem(submissionId, payload); window.dispatchEvent(new Event("localDataSynced")); } catch (e) { }

    if (!navigator.onLine) { await syncQueueDB.setItem(`sync_${submissionId}_${Date.now()}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); return; }

    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (API_BASE) {
        const response = await fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...payload, isSynced: true }) });
        if (response.ok) await submissionsDB.setItem(submissionId, { ...payload, isSynced: true });
        else throw new Error("Server rejected submission");
      }
    } catch (err) { await syncQueueDB.setItem(`sync_${submissionId}_${Date.now()}`, { type: "SUBMISSION", action: "UPSERT", data: payload }); }
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
    if (!isReadyRef.current) return;
    if (isOnline && isEngineReady && workerRef.current && generatedPython && generatedPython !== "# Drag blocks to generate Python code") {
      const timeoutId = setTimeout(() => {
        workerRef.current.postMessage({ type: "ANALYZE_CODE", code: sanitizePythonCode(generatedPython) });
      }, 800);
      return () => clearTimeout(timeoutId);
    }
  }, [generatedPython, isOnline, isEngineReady]);

  const handleWorkspaceChange = async (json, incomingPythonCode, isUnsynced = false) => {
    if (!isReadyRef.current) return;
    latestBlocksJsonRef.current = json;
    let codeToSave = incomingPythonCode;
    if (isEditingCode && !isUnsynced) codeToSave = generatedPython;

    const oldCode = (generatedPython || "").trim(); const newCode = (codeToSave || "").trim();
    latestStateRef.current.json = json; latestStateRef.current.pythonCode = codeToSave;
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
      try {
        await workspaceRef.current.loadFromPython(sanitizePythonCode(generatedPython));
        setIsEditingCode(false); setViewMode("workspace");
        showToast("Python code successfully converted into blocks!", "success");
      } catch (e) {
        setModalConfig({ isOpen: true, title: "Sync Error", message: "Cannot sync to blocks until syntax errors are fixed.", confirmText: "Close", isDanger: true, onConfirmAction: closeModal });
      }
    }
  };

  const handleActivityRun = async () => {
    if (isEvaluating) return;
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

    await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: false });

    if (navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (res.ok) await progressDB.setItem(lessonId, { score: user.progress[lessonId], isSynced: true });
        else throw new Error("Sync failed with status: " + res.status);
      } catch (error) { await syncQueueDB.setItem(`sync_prog_${lessonId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload }); }
    } else if (!user.isGuest) await syncQueueDB.setItem(`sync_prog_${lessonId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload });
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

    await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: false });

    if (navigator.onLine && !user.isGuest && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/update-progress`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (res.ok) await progressDB.setItem(topicId, { score: 100, completed: true, isSynced: true });
        else throw new Error("Sync failed with status: " + res.status);
      } catch (error) { await syncQueueDB.setItem(`sync_prog_${topicId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload }); }
    } else if (!user.isGuest) await syncQueueDB.setItem(`sync_prog_${topicId}_${Date.now()}`, { type: "PROGRESS", action: "UPSERT", data: payload });
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

  // FIX: Stricter checking logic ensures that loading an optimization activity 
  // (which accidentally passes a single Space Complexity test) doesn't mark the whole activity as passed.
  const checkLessonCompletion = async () => {
    if (!latestStateRef.current.userId || !lessonActivitiesResolved.length) return { passedCount: 0, threshold: 1, isCompleted: false };

    const diffs = lessonActivitiesResolved.map(a => (a.difficulty || 'Easy').toLowerCase());
    const types = lessonActivitiesResolved.map(a => (a.type || 'activity').toLowerCase());

    let threshold = 3;
    if (types.includes('optimization') || lessonActivitiesResolved.some(a => a.id.includes('opt'))) threshold = 2;
    else if (diffs.includes('hard') || diffs.includes('advanced')) threshold = 1;
    else if (diffs.includes('medium') || diffs.includes('intermediate')) threshold = 2;

    threshold = Math.min(threshold, lessonActivitiesResolved.length);

    let passedCount = 0;
    for (const act of lessonActivitiesResolved) {
      const subId = `${latestStateRef.current.userId}_${moduleId}_${act.id}`;
      try {
        const sub = await submissionsDB.getItem(subId);
        // STRICT EVALUATION: Require explicit "passed" status AND score >= 50. Drafts are fully ignored.
        if (sub && sub.status === "passed" && sub.score >= 50) passedCount++;
      } catch (e) { }
    }
    return { passedCount, threshold, isCompleted: passedCount >= threshold };
  };

  const handleSuccess = async (aesScore, funcPassed, funcTotal, currentRog) => {
    const currentIndex = lessonActivitiesResolved.findIndex((a) => a.id === activityId);
    const isLast = currentIndex === lessonActivitiesResolved.length - 1;
    const nextActivity = !isLast ? lessonActivitiesResolved[currentIndex + 1] : null;

    const completionData = await checkLessonCompletion();
    const meetsThreshold = completionData.isCompleted;

    if (meetsThreshold && topicIdResolved) await completeFullTopic(topicIdResolved);

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
      promptMsg += `\n\n📈 Optimization recognized: Your refactoring improved your score by +${currentRog} ROG points!`;
    }

    if (meetsThreshold) promptMsg += `\n\n🎉 Lesson Unlocked! You've successfully passed ${completionData.passedCount}/${completionData.threshold} required activities to advance.`;
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
    if (isEvaluating) return;
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

      if (isFunctionCall && !isIntroLevel) codeToRun = cleanPayload + `\n\ntry:\n    assert ${tc.call} == ${tc.expected}\n    print("TEST_PASSED_FLAG")\nexcept:\n    print("TEST_ERROR_FLAG")`;
      else codeToRun = `${cleanPayload}\n${tc.call || ""}`;

      try {
        const rawOutput = await executeTest(codeToRun); const actualOutput = rawOutput.trim();
        const expected = String(tc.expected).replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();
        let testPassed = false;
        if (isFunctionCall && !isIntroLevel) { if (actualOutput.includes("TEST_PASSED_FLAG")) { passed++; functionalPassed++; testPassed = true; } }
        else { if (actualOutput.trim() === expected) { passed++; functionalPassed++; testPassed = true; } }

        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;
        if (!testPassed) {
          if (tc.isHidden) fullOutput += `  [Hidden Test Case] Expected values and inputs are omitted.\n`;
          else fullOutput += `  Expected: ${expected}\n  Actual: ${actualOutput}\n`;
        }
        fullOutput += "\n";
        setConsoleOutput(fullOutput); setPassedTests(passed);
      } catch (err) { fullOutput += `Test ${i + 1}: ERROR\n  Message: ${err.message}\n\n`; setConsoleOutput(fullOutput); }
    }

    setIsEvaluating(false);

    // =========================================================================
    // MATHEMATICAL MODEL IMPLEMENTATION (Algorithmic Efficiency Score - AES)
    // =========================================================================

    // 1. Task Success Rate (TSR)
    const tsr = functionalTotal > 0 ? (functionalPassed / functionalTotal) : 1.0;

    // 2. Efficiency Ratio
    const targetTimeWeight = getComplexityWeight(activityDataResolved?.targetTimeComplexity || "O(n)");
    const actualTimeWeight = getComplexityWeight(analysisResult.total || "O(n^2)");

    const targetSpaceWeight = getComplexityWeight(activityDataResolved?.targetSpaceComplexity || "O(1)");
    const actualSpaceWeight = getComplexityWeight(analysisResult.space_total || "O(n)");

    // Safe fallback to O(n^2) equivalent penalty
    const safeActualTime = actualTimeWeight > 0 ? actualTimeWeight : 6;
    const safeActualSpace = actualSpaceWeight > 0 ? actualSpaceWeight : 6;

    let timeRatio = targetTimeWeight / safeActualTime;
    if (timeRatio > 1.0) timeRatio = 1.0;

    let spaceRatio = targetSpaceWeight / safeActualSpace;
    if (spaceRatio > 1.0) spaceRatio = 1.0;

    const averageEfficiency = (timeRatio + spaceRatio) / 2;

    // 3. Multiplicative AES
    let aes = Math.floor((tsr * averageEfficiency) * 100);

    setCurrentAes(aes); // Update UI Badge

    // =========================================================================
    // ROG Tracking Logic (Continuous Tracking)
    // =========================================================================
    let initialAes = latestStateRef.current.initial_aes;

    if (initialAes === null || initialAes === undefined) {
      if (activityDataResolved?.type === "optimization") {
        initialAes = 50;
      } else {
        initialAes = aes;
      }
    }

    // Drop initialAes if they break the code and get a lower score, establishing a new floor
    if (aes < initialAes && latestStateRef.current.status !== "passed") {
      initialAes = aes;
    }

    latestStateRef.current.initial_aes = initialAes;
    latestStateRef.current.final_aes = aes;

    const calculatedRog = aes - initialAes;
    setCurrentRog(calculatedRog > 0 ? calculatedRog : 0);

    const testResults = processedTestCases.map((tc, idx) => ({ id: `tc_${idx}`, status: fullOutput.includes(`Test ${idx + 1}: PASSED`) ? "passed" : "failed" }));

    await saveSubmission(latestStateRef.current.json, generatedPython, aes, passed, totalTests, testResults, analysisResult.total || "O(n^2)", analysisResult.space_total || "O(1)", false);
    localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: fullOutput, passedTests: passed, score: aes }));

    const lessonKey = `${moduleId}:${activityId}`;
    await savePartialProgress(lessonKey, aes);

    await handleSuccess(aes, functionalPassed, functionalTotal, calculatedRog);
  };

  const lines = analysisResult?.lines || []; let maxWeight = 0; let bottleneckIndices = [];
  lines.forEach((line, index) => {
    const weight = getComplexityWeight(activeComplexityTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)");
    if (weight > maxWeight) { maxWeight = weight; bottleneckIndices = [index]; }
    else if (weight === maxWeight && weight > 0) bottleneckIndices.push(index);
  });
  const actualBottleneckIndices = maxWeight >= 5 ? bottleneckIndices : [];
  const pythonLines = (generatedPython || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(lineExecutions));

  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = (syntaxErrors || []).map(err => ({
          startLineNumber: err.line || 1, startColumn: 1, endLineNumber: err.line || 1, endColumn: 1000, message: err.message, severity: monacoRef.current.MarkerSeverity.Error,
        }));
        monacoRef.current.editor.setModelMarkers(model, "owner", markers);
      }
    }
  }, [syntaxErrors]);

  const hasSyntaxErrors = syntaxErrors && syntaxErrors.length > 0;

  return (
    <div className="activity-app-container">
      {/* Toast Render with correct classes applied via the imported CSS */}
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
          <button className="wh-btn-save" onClick={handleActivityRun} disabled={isEvaluating} title="Run code without submitting to test cases">
            <FiTerminal size={16} /> {isEvaluating ? "..." : "Run Code"}
          </button>
          <button className={`wh-btn-run ${isEvaluating ? "running" : ""}`} onClick={runTestCases} disabled={isEvaluating}>
            <FiPlay size={16} /> {isEvaluating ? "..." : "Evaluate Efficiency (AES)"}
          </button>
        </div>
      </header>

      <Split className={`workspace-split activity-split ${!isLeftPanelVisible ? "left-hidden" : ""} ${!isRightPanelVisible ? "right-hidden" : ""}`} sizes={[20, 60, 20]} minSize={[isLeftPanelVisible ? 250 : 0, 400, isRightPanelVisible ? 250 : 0]} gutterSize={8}>

        {/* LEFT PANEL */}
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

        {/* CENTER PANEL */}
        <main className="workspace-main activity-center-panel">
          <button className={`sidebar-toggle-btn ${!isLeftPanelVisible ? "closed" : ""}`} onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} title="Toggle Instructions">
            <FiChevronRight className="toggle-icon" />
          </button>
          <button className={`sidebar-toggle-btn right-panel-toggle ${!isRightPanelVisible ? "closed" : ""}`} onClick={() => setIsRightPanelVisible(!isRightPanelVisible)} title="Toggle Test Cases">
            <FiChevronLeft className="toggle-icon" />
          </button>

          <div className="editor-container">
            <div className={viewMode === "workspace" ? "workspace-view d-block" : "workspace-view d-none"}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} syntaxError={null} />
            </div>
            <div className={viewMode === "python" ? "python-view d-flex" : "python-view d-none"}>
              <div className="python-header">
                <span className="python-sync-status">{isEditingCode ? "Unsaved code changes..." : "Code is synced with blocks."}</span>
                <button onClick={handleSyncToBlocks} disabled={!isEditingCode || hasSyntaxErrors} className={`python-sync-btn ${isEditingCode && !hasSyntaxErrors ? "active" : "disabled"}`}>Sync to Blocks</button>
              </div>

              <div className="editor-wrapper">
                <Editor
                  height="100%" language="python" theme="algoblocks-light"
                  beforeMount={handleEditorWillMount} onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
                  value={generatedPython}
                  onChange={(value) => {
                    const newCode = sanitizePythonCode(value);
                    setGeneratedPython(newCode); setIsEditingCode(true); setSyntaxErrors([]);
                    latestStateRef.current.pythonCode = newCode; handleWorkspaceAutoSave(latestStateRef.current.json, newCode);
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 15, fontFamily: "Consolas, 'Courier New', monospace", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 16 } }}
                />

                {hasSyntaxErrors && (
                  <div className="floating-error-container">
                    {isErrorDropdownOpen && (
                      <div className="error-dropdown-menu" style={{ width: `${errorPanelSize.width}px`, height: `${errorPanelSize.height}px` }}>
                        <div className="error-resizer-top" onMouseDown={(e) => handleErrorResizeStart(e, 'n')} />
                        <div className="error-resizer-left" onMouseDown={(e) => handleErrorResizeStart(e, 'w')} />
                        <div className="error-resizer-nw" onMouseDown={(e) => handleErrorResizeStart(e, 'nw')}><FiAlertCircle color="rgba(239, 68, 68, 0.4)" /></div>
                        <div className="error-dropdown-header"><strong>Detected Issues ({syntaxErrors.length})</strong></div>
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
                    <button className={`floating-error-btn ${isErrorDropdownOpen ? "open" : ""}`} onClick={() => setIsErrorDropdownOpen(!isErrorDropdownOpen)}>
                      <FiAlertCircle size={18} /> {syntaxErrors.length} Error{syntaxErrors.length > 1 ? "s" : ""}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM PANEL */}
          {bottomPanel && (
            <div className="bottom-docked-panel" style={{ height: `${panelHeight}px` }}>
              <div className="panel-resizer" onMouseDown={handleDragStart}><div className="panel-resizer-handle"></div></div>
              <div className="panel-header">
                <span className="panel-title">{bottomPanel === "console" ? "Console Panel" : "Complexity Analysis"}</span>
                <button onClick={() => setBottomPanel(null)} className="panel-close-btn"><FiX size={18} /></button>
              </div>
              <div className="panel-body">
                {bottomPanel === "console" ? (
                  <div className="console-content-wrapper">
                    <div className="complexity-tabs">
                      <div className="tab-btn-group">
                        <button onClick={() => setConsoleTab("output")} className={`tab-btn ${consoleTab === "output" ? "active" : ""}`}>Terminal Output</button>
                        <button onClick={() => setConsoleTab("executions")} className={`tab-btn ${consoleTab === "executions" ? "active" : ""}`}>Line Executions</button>
                      </div>
                      {consoleTab === "output" && <button className="clear-console-btn" onClick={() => setConsoleOutput("Ready to run...\n")}>Clear</button>}
                    </div>
                    <div className="console-view-area">
                      {consoleTab === "output" ? (
                        <div className="console-container">
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
                        <div className="complexity-table-wrapper console-table-override">
                          <table className="complexity-table">
                            <thead>
                              <tr>
                                <th className="line-num-th">Line</th>
                                <th>Source Code</th>
                                <th className="hits-th">Hits</th>
                                <th className="freq-th">Frequency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pythonLines.map((lineText, idx) => {
                                const hits = lineExecutions[idx + 1] || 0;
                                return (
                                  <tr key={idx} className={hits > 0 ? "row-has-hits" : ""}>
                                    <td className="line-num-td">{idx + 1}</td>
                                    <td className="source-code-td">{lineText || " "}</td>
                                    <td className={`hits-td ${hits > 0 ? "active-hits" : ""}`}>{hits > 0 ? hits : "-"}</td>
                                    <td className="freq-td">
                                      {hits > 0 && maxExecutions > 0 && <div className={`freq-bar ${hits === maxExecutions ? "max-freq" : ""}`} style={{ width: `${(hits / maxExecutions) * 100}%` }} title={`${Math.round((hits / maxExecutions) * 100)}%`} />}
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
                        <button onClick={() => { setActiveComplexityTab("overall"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "overall" ? "active" : ""}`}>Overall</button>
                        <button onClick={() => { setActiveComplexityTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "local" ? "active" : ""}`}>Local</button>
                        <button onClick={() => { setActiveComplexityTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "global" ? "active" : ""}`}>Global</button>
                        <button onClick={() => { setActiveComplexityTab("memory"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "memory" ? "active" : ""}`}>Memory Map</button>
                        <button onClick={() => { setActiveComplexityTab("callgraph"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === "callgraph" ? "active" : ""}`}>Call Graph</button>
                      </div>

                      <div className="total-badge-group">
                        {/* FIX: Restored the Analysis Process Time MS badge */}
                        <span className="total-badge analysis-time-badge" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                          <span className="total-label" style={{ color: '#64748B' }}>Analyzed In:</span>
                          <span className="total-val" style={{ color: '#0F172A' }}>{analysisTime}ms</span>
                        </span>

                        <span className="total-badge total-time-badge"><span className="total-label">Total Time:</span> <span className="total-val">{formatComplexity(analysisResult.total)}</span></span>
                        <span className="total-badge total-space-badge"><span className="total-label space-label">Total Space:</span> <span className="total-val">{formatComplexity(analysisResult.space_total)}</span></span>

                        {/* THESIS METHODOLOGY: AES BADGE */}
                        {/* FIX: Set positioning on tooltip to pull it downward to avoid header clipping, and enforce high z-index */}
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

                        {/* THESIS METHODOLOGY: ROG BADGE */}
                        {/* FIX: Set positioning on tooltip to pull it downward to avoid header clipping, and enforce high z-index */}
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

                      </div>
                    </div>
                    {activeComplexityTab === "overall" ? (
                      <div className="overall-complexity-wrapper">
                        {analysisResult.overall_explanation ? (
                          <div className="overall-markdown-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseMarkdown(analysisResult.overall_explanation)) }} />
                        ) : (
                          <div className="empty-analysis-state">
                            <p>Run code analysis to see the complete overall complexity report.</p>
                          </div>
                        )}
                      </div>
                    ) : activeComplexityTab === "memory" ? (
                      <div className="memory-wrapper">
                        <MemoryVisualizer analysisData={analysisResult.lines} currentStep={analysisResult.lines.length > 0 ? analysisResult.lines.length - 1 : 0} />
                      </div>
                    ) : activeComplexityTab === "callgraph" ? (
                      <div className="callgraph-wrapper" style={{ height: '100%', overflow: 'hidden' }}>
                        <CallGraphVisualizer analysisData={analysisResult} />
                      </div>
                    ) : (
                      <div className="complexity-table-wrapper">
                        <table className="complexity-table">
                          <thead>
                            <tr>
                              <th>Line of Code</th>
                              <th>Operation</th>
                              <th className="right-align">{activeComplexityTab === "local" ? "Local Time" : "Global Time"}</th>
                              <th className="right-align">{activeComplexityTab === "local" ? "Local Space" : "Global Space"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysisResult.lines.map((line, i) => {
                              const timeComplexity = activeComplexityTab === "local" ? line.local_time || "O(1)" : line.global_time || "O(1)";
                              const spaceComplexity = activeComplexityTab === "local" ? line.local_space || "O(1)" : line.global_space || "O(1)";
                              let timeExp = line.time_explanation ?? line.local_explanation ?? "Not available.";
                              let spaceExp = line.space_explanation ?? line.global_explanation ?? "Not available.";

                              const isBottleneck = actualBottleneckIndices.includes(i);
                              const timeColor = getComplexityColor(timeComplexity); const spaceColor = getComplexityColor(spaceComplexity);
                              const compStripped = timeComplexity.toLowerCase().replace(/\s+/g, "");
                              const isEfficient = !isBottleneck && (compStripped.includes("logn") || compStripped.includes("√n") || compStripped.includes("sqrt") || compStripped.includes("t(n/2)+o(1)")) && !compStripped.includes("nlogn");

                              return (
                                <React.Fragment key={i}>
                                  <tr className={`complexity-row ${expandedLines[i] ? "expanded" : ""} ${isBottleneck ? "bottleneck-active" : ""} ${isEfficient ? "efficient-active" : ""}`} onClick={() => toggleLine(i)} style={{ borderLeftColor: isBottleneck ? "#EF4444" : isEfficient ? "#10B981" : expandedLines[i] ? timeColor : "transparent" }}>
                                    <td className="code-cell" style={{ paddingLeft: line.indent ? `${line.indent * 15 + 20}px` : "20px" }}>{line.lineOfCode || line.code}</td>
                                    <td className="operation-cell">
                                      {line.operation || "-"}
                                      {isBottleneck && <span className="bottleneck-badge">Bottleneck</span>}
                                      {isEfficient && <span className="efficient-badge">Efficient</span>}
                                    </td>
                                    <td className="complexity-cell" style={{ color: timeColor }}>{formatComplexity(timeComplexity)}</td>
                                    <td className="complexity-cell" style={{ color: spaceColor }}>{formatComplexity(spaceComplexity)} <FiChevronDown className={`dropdown-chevron ${expandedLines[i] ? "open" : ""}`} /></td>
                                  </tr>
                                  {expandedLines[i] && (
                                    <tr className="explanation-row">
                                      <td colSpan="4">
                                        <div className="explanation-grid" style={{ borderLeftColor: timeColor }}>
                                          <div className="explanation-section">
                                            <div className="explanation-icon-wrapper" style={{ color: timeColor }}><FiInfo size={20} /></div>
                                            <div className="explanation-text-content">
                                              <strong className="explanation-header" style={{ color: timeColor }}>Time Complexity</strong>
                                              <div className="explanation-body">{formatExplanation(timeExp, isBottleneck, activeComplexityTab === "local")}</div>
                                            </div>
                                          </div>
                                          <div className="explanation-section space-section">
                                            <div className="explanation-icon-wrapper" style={{ color: spaceColor }}><FiInfo size={20} /></div>
                                            <div className="explanation-text-content">
                                              <strong className="explanation-header" style={{ color: spaceColor }}>Space Complexity</strong>
                                              <div className="explanation-body">{formatExplanation(spaceExp, isBottleneck, activeComplexityTab === "local")}</div>
                                            </div>
                                          </div>
                                          <div className="explanation-graph-wrapper"><ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" /></div>
                                          <div className="explanation-graph-wrapper space-graph-wrapper"><ComplexityGraph complexity={spaceComplexity} color={spaceColor} label="Space Curve" /></div>
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
                <FiTerminal size={16} /> Console
              </button>
              <button className={`footer-tab ${bottomPanel === "complexity" ? "active" : ""}`} onClick={() => setBottomPanel(bottomPanel === "complexity" ? null : "complexity")}>
                <FiActivity size={16} /> Complexity
              </button>
              <button className="footer-tab big-o-btn" onClick={() => setIsBigOModalOpen(true)}>
                <FiBookOpen size={16} /> Big O Reference
              </button>
            </div>
            <div className="footer-right">
              <button className="footer-action-icon clear-btn" title="Restart Activity" onClick={() =>
                setModalConfig({
                  isOpen: true, title: "Restart Activity?", message: "Are you sure you want to restart this activity? Your progress will be lost.",
                  confirmText: "Restart", cancelText: "Cancel", isDanger: true,
                  onConfirmAction: async () => {
                    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
                    if (storedUser) { const user = JSON.parse(storedUser); await submissionsDB.removeItem(`${user.email}_${moduleId}_${activityId}`); }
                    localStorage.removeItem(`activity_tests_${moduleId}_${activityId}`);
                    await saveSubmission(null, "# Drag blocks to generate Python code", 0, 0, totalTests, [], "O(1)", "O(1)", true);
                    window.location.reload();
                  }, onCancelAction: closeModal
                })
              }>
                <FiActivity size={16} /> Restart
              </button>
            </div>
          </footer>
        </main>

        {/* RIGHT PANEL */}
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