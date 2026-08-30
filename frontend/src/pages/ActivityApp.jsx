import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiBookOpen, FiChevronLeft, FiChevronRight, FiGrid, FiInfo, FiLayers, FiPlay, FiTerminal } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlockGlossaryModal from "../components/BlockGlossaryModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DockableWorkspace from "../components/DockableWorkspace.jsx";
import RewardModal from "../components/RewardModal.jsx";
import ComplexityPanelContent from "../components/panelContent/ComplexityPanelContent.jsx";
import ConsolePanelContent from "../components/panelContent/ConsolePanelContent.jsx";
import PythonCodeEditor from "../components/PythonCodeEditor.jsx";
import TourHelpButton from "../components/TourHelpButton";
import WorkspaceFooterBar from "../components/WorkspaceFooterBar.jsx";
import { useOnboarding, GENERIC_ACTIVITY_TOUR_PAGE_ID } from "../context/OnboardingContext";
import { usePyodide } from "../context/PyodideContext.jsx";
import { getIntroActivityTour } from "../data/introActivityTours.js";
import curriculumIndex from "../data/curriculumIndex.js";
import { curriculumCacheDB, progressDB, submissionsDB, syncQueueDB, templatesDB } from "../db.js";
import "../styles/ActivityApp.css";
import { getComplexityWeight, sanitizePythonCode } from "../utils/asymptoticParser.jsx";
import { extractErrorSummaryLine, translatePythonError } from "../utils/errorTranslator.js";
import { formatComplexity } from "../utils/formatters";

// Default docking arrangement, mirrored from MainApp.jsx: Blocks and Python
// tabbed together in the center (mirrors the old toggle button), Console
// and Complexity tabbed together at the bottom. Any panel can be dragged to
// any other region at runtime; "Reset Workspace Layout" restores this.
const DEFAULT_DOCK_LAYOUT = {
  regions: {
    top: { panelIds: [], size: 200 },
    left: { panelIds: [], size: 280 },
    center: { panelIds: ["blockly", "python"], size: 0 },
    right: { panelIds: [], size: 340 },
    bottom: { panelIds: ["console", "complexity"], size: 280 },
  },
  activeTab: { top: null, left: null, center: "blockly", right: null, bottom: "console" },
};

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

// Prefix used by the per-activity "which blocks do I need" hint (see
// annotate_blocks.py / the activity JSON's task arrays). Matched here so it
// can render with a real FiGrid icon + chip styling instead of a plain-text
// emoji glyph.
const BLOCKS_HINT_PREFIX = "Blocks you'll need:";

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

  // Renders the "Blocks you'll need: Category: Label | Category: Label"
  // line as an icon + a row of chips, one per block, instead of a plain
  // paragraph -- keeps it visually distinct from the rest of the
  // instructions without resorting to a text emoji.
  const renderBlocksHint = (line, idx) => {
    const rest = line.slice(BLOCKS_HINT_PREFIX.length).trim();
    const chips = rest.split("|").map((s) => s.trim()).filter(Boolean);
    return (
      <div key={idx} className="activity-blocks-hint">
        <FiGrid size={14} className="activity-blocks-hint-icon" aria-hidden="true" />
        <span className="activity-blocks-hint-label">Blocks you'll need:</span>
        <span className="activity-blocks-hint-chips">
          {chips.map((chip, i) => (
            <span key={i} className="activity-blocks-hint-chip">{chip}</span>
          ))}
        </span>
      </div>
    );
  };

  if (Array.isArray(text)) {
    return (
      <div className="activity-task-description">
        {text.map((line, idx) => (
          typeof line === "string" && line.startsWith(BLOCKS_HINT_PREFIX)
            ? renderBlocksHint(line, idx)
            : <p key={idx} style={{ minHeight: line === "" ? "1rem" : "auto", margin: "4px 0", color: "var(--text-main)", fontSize: "0.9rem", lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseStr(line)) }} />
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
  const isUnmountingRef = useRef(false); 
  const loadTimeRef = useRef(0); 
  
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const workerMessageHandler = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  // See runtimeErrorTextRef in MainApp.jsx for the full rationale: Pyodide
  // splits a multi-line traceback into several separate stderr messages, so
  // this buffers all of them for the run in flight and defers hint
  // generation to RUN_RESULT, once the real "SomeError: detail" summary
  // line has actually arrived.
  const runtimeErrorTextRef = useRef("");
  const saveDraftTimeoutRef = useRef(null);
  const latestBlocksJsonRef = useRef(null);
  const testResolveRef = useRef(null);
  const testRejectRef = useRef(null);
  const outputAccumulatorRef = useRef("");

  const latestStateRef = useRef({
    userId: null, json: null, pythonCode: "# Drag blocks to generate Python code",
    score: 0, passed: 0, testResults: [], actualTime: "O(n^2)", actualSpace: "O(1)",
    status: "draft", type: "activity", targetTime: "O(n)", targetSpace: "O(1)",
    initial_aes: null, final_aes: null, latest_aes: null, rog: 0,
    functional_passed: 0, functional_total: 0, complexity_passed: 0, complexity_total: 0, hidden_passed: 0, hidden_total: 0,
    baseline_actualTime: null, baseline_actualSpace: null,
    latest_actualTime: null, latest_actualSpace: null
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
  const [openPanelIds, setOpenPanelIds] = useState(() => new Set(["blockly", "python"]));
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeComplexityTab, setActiveComplexityTab] = useState("overall");
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  
  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", overall_explanation: "", is_recursive: false, call_graph: {} });
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", isDanger: false, onConfirmAction: null, onCancelAction: null });
  // Celebratory result modal shown after an activity is evaluated (replaces
  // the old plain-text ConfirmModal for these specific outcomes).
  const [rewardConfig, setRewardConfig] = useState({ isOpen: false, result: null, confirmText: "Continue", cancelText: "Stay Here", secondaryText: null, onConfirmAction: null, onCancelAction: null, onSecondaryAction: null });
  const [isEditingCode, setIsEditingCode] = useState(false);

  const activityTour = {
    id: "activity-tour",
    pageId: "activity-workspace-tour",
    title: "Activity Tour",
    steps: [
      { target: ".wh-toggle-btn.active", title: "Change the view", description: "Switch between the visual Blockly workspace and generated Python code." },
      { target: ".wh-btn-save", title: "Run the code", description: "Quickly execute your current code without submitting it to the activity grader." },
      { target: ".wh-btn-run", title: "Grade the activity", description: "Run the full evaluation when you are ready to submit your solution." },
      { target: ".footer-tab:nth-child(1)", title: "Open the console", description: "Inspect output, prompts, and execution traces in the console panel.", onEnter: () => { focusDockPanel("console"); setConsoleTab("output"); } },
      { target: ".console-content-wrapper .clear-console-btn", title: "Clear the console", description: "Clear output before rerunning a test or experiment.", onEnter: () => { focusDockPanel("console"); setConsoleTab("output"); } },
      { target: ".console-content-wrapper .tab-btn-group .tab-btn:nth-child(2)", title: "Line executions", description: "Check the frequency count for each line in the current solution.", onEnter: () => { focusDockPanel("console"); setConsoleTab("executions"); } },
      { target: ".footer-tab:nth-child(2)", title: "Open complexity analysis", description: "Switch to the complexity panel for time and space analysis.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("overall"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(2)", title: "Local complexity", description: "Inspect local cost per line and see how each step contributes.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("local"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(3)", title: "Global complexity", description: "Switch to the global analysis view for the whole algorithm.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("global"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(4)", title: "Memory map", description: "Open the memory map to visualize how state changes over time.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("memory"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(5)", title: "Call graph", description: "Follow recursion and call flow in the call graph view.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("callgraph"); } },
      { target: ".big-o-btn", title: "Big-O reference", description: "Open the complexity reference modal when you need a reminder of the notation.", onEnter: () => setIsBigOModalOpen(true), onExit: () => setIsBigOModalOpen(false) },
      { target: ".big-o-modal-content", title: "Reference library", description: "Browse the reference table and expand entries for deeper details." },
      { target: ".big-o-accordion .big-o-row-trigger", title: "Expandable complexity rows", description: "Open any row to inspect the definition, analogy, and examples behind a complexity class." },
      { target: ".block-glossary-btn", title: "Block Explorer", description: "Stuck on what a block does? Open the Block Explorer to look up every block's purpose, see it in a real example, and run it.", onEnter: () => setIsBlockGlossaryOpen(true), onExit: () => setIsBlockGlossaryOpen(false) },
      { target: ".block-glossary-tabs", title: "Browse by category", description: "Jump straight to Logic, Loops, Lists, and every other category of blocks." },
      { target: ".block-glossary-row-trigger", title: "Look up any block", description: "Expand a block to see a live preview, what it does, when to use it, and a runnable example showing it in action." },
    ],
  };

  const [syntaxErrors, setSyntaxErrors] = useState([]);
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [isBlockGlossaryOpen, setIsBlockGlossaryOpen] = useState(false);

  const dockRef = useRef(null);
  // Brings a panel's tab to the front in whichever region it's currently
  // docked in — and re-opens it first if the user had closed it.
  const focusDockPanel = (panelId) => dockRef.current?.openPanel?.(panelId);
  // Console/Complexity footer buttons: close the panel if it's currently
  // open, or open+focus it if it's closed — restoring the original
  // show/hide toggle behavior on top of the new docking system.
  const toggleDockPanel = (panelId) => {
    if (dockRef.current?.isPanelOpen?.(panelId)) {
      dockRef.current.closePanel(panelId);
    } else {
      dockRef.current?.openPanel?.(panelId);
    }
  };

  // A curated tour (see introActivityTours.js) exists only for the first
  // activity of each Module 0 lesson. Every other activity falls back to
  // the generic activityTour defined above.
  const introTour = getIntroActivityTour(activityId, moduleId, {
    setIsBigOModalOpen, focusDockPanel, setConsoleTab, setActiveComplexityTab,
  });
  const resolvedActivityTour = introTour || activityTour;

  // Auto-show an activity tour ONLY the very first time a fresh account
  // opens the Activity App -- not once per lesson. ActivityAppInner is
  // remounted (via a `key={moduleId-activityId}` on the outer component)
  // every time the user switches activities, so this ref is naturally
  // scoped per-activity and won't by itself prevent a re-show on the next
  // activity/lesson.
  //
  // The actual "only once, ever" guarantee comes from what we check here:
  // GENERIC_ACTIVITY_TOUR_PAGE_ID's `seen` flag, NOT
  // resolvedActivityTour.pageId's. Each of the 4 curated Module-0 intro
  // tours (see introActivityTours.js) has its own unique pageId
  // ("activity-{moduleId}-{activityId}"), so gating on that per-tour id
  // meant finishing/skipping lesson 1's tour never stopped lesson 2, 3, or
  // 4's first activity from popping its own "never seen" curated tour --
  // one auto-show per lesson instead of one for the whole account. Gating
  // on the single shared generic pageId instead means: whichever tour
  // happens to be the first one this account ever opens (curated or
  // generic) is the only one that ever auto-shows. markPageCompleted/
  // markPageDismissed already mark this shared pageId seen whenever a
  // curated tour finishes (see withLinkedGenericTour in
  // OnboardingContext.jsx), so this stays in sync automatically.
  //
  // Manual replay (the "Replay activity tour" button) is untouched -- it
  // still opens resolvedActivityTour, the tour actually relevant to *this*
  // specific activity, and still records its own pageId's bookkeeping.
  const activityTourAttemptedRef = useRef(false);
  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);
    if (user.isGuest) return;
    if (activityTourAttemptedRef.current) return;
    if (!isHydrated) return;
    const alreadySeenAnyActivityTour = Boolean(onboardingState?.pages?.[GENERIC_ACTIVITY_TOUR_PAGE_ID]?.seen);
    if (alreadySeenAnyActivityTour) return;
    const timer = setTimeout(() => {
      activityTourAttemptedRef.current = true;
      startTour(resolvedActivityTour);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingState, isHydrated, startTour, resolvedActivityTour.pageId]);

  const [activityDataResolved, setActivityDataResolved] = useState(null);
  const [topicIdResolved, setTopicIdResolved] = useState(null);
  const [lessonActivitiesResolved, setLessonActivitiesResolved] = useState([]);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  useEffect(() => {
    if (workspaceRef.current) {
      setTimeout(() => workspaceRef.current.resize(), 50);
      setTimeout(() => workspaceRef.current.resize(), 300);
    }
  }, [isLeftPanelVisible, isRightPanelVisible]);

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
    const spaceTarget = activityDataResolved.targetSpaceComplexity || "O(1)";
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
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Connection restored. Syncing drafts...", "success");
      // FIX: Flush in-memory workspace state to IndexedDB immediately on
      // reconnect, before the global syncManager 'online' burst runs.
      // The autosave debouncer has a 1.5 s delay, so if the user was
      // editing while offline the latest latestStateRef values may not
      // yet be persisted when the sync kicks off -- triggering a save
      // here closes that window so the upcoming push cycle includes the
      // freshest state rather than whatever was last debounced.
      triggerFinalSave();
    };
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
          is_recursive: data.is_recursive || false,
          scope_warnings: data.scope_warnings || [],
          logic_warnings: data.logic_warnings || []
        });
        
        latestStateRef.current.actualTime = data.total; latestStateRef.current.actualSpace = data.space_total || "O(1)";
        const initialCounts = {};
        (data.lines || []).forEach((l) => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
        setLineExecutions((prev) => ({ ...prev, ...initialCounts }));
        const runtimeErrors = (data.multiple_errors || []).map((err) => ({ line: err.line, message: err.message, fix: translatePythonError(err.message) }));
        setSyntaxErrors(runtimeErrors);
      } else {
        if (data.multiple_errors && data.multiple_errors.length > 0) {
          const mappedErrors = data.multiple_errors.map((err) => ({ line: err.line, message: err.message, fix: translatePythonError(err.message) }));
          setSyntaxErrors(mappedErrors);
        } else {
          setSyntaxErrors([{ line: data.line, message: data.message, fix: translatePythonError(data.message) }]);
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

        // The run is genuinely over now -- translate the real "SomeError:
        // detail" summary line (the last line of whatever traceback text
        // was buffered), instead of generating a hint per stderr fragment
        // as they streamed in.
        let hintBlock = "";
        if (runtimeErrorTextRef.current.trim()) {
          const hint = translatePythonError(extractErrorSummaryLine(runtimeErrorTextRef.current));
          if (hint) hintBlock = `\n${hint}\n`;
          runtimeErrorTextRef.current = "";
        }

        setConsoleOutput((prev) => prev + finalOutput + hintBlock + "\n> Program finished." + notice + "\n");
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
      if (testResolveRef.current) {
        pendingOutputRef.current += data;
      } else {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        // Note: deliberately NOT clearing runTimeoutRef/renderIntervalRef
        // here -- RUN_RESULT is what actually marks the run as finished, so
        // the safety-net timeout stays armed in case the worker crashes
        // before ever sending it.
        //
        // Stream the raw traceback text through as it arrives, but only
        // translate a hint from it once RUN_RESULT confirms the traceback
        // is complete (see there) -- a lone fragment like "Traceback (most
        // recent call last):" isn't the "SomeError: detail" summary line
        // translatePythonError() is built to recognize.
        const isFirstErrorChunk = runtimeErrorTextRef.current === "";
        runtimeErrorTextRef.current += data;
        setConsoleOutput((prev) => prev + flushed + (isFirstErrorChunk ? "\n Runtime Error:\n" : "") + data);
        setIsWaitingForInput(false);
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
  const closeReward = () => setRewardConfig((prev) => ({ ...prev, isOpen: false }));

  const fetchJsonWithCache = async (cacheKey, url) => {
    try {
      const res = await fetch(`${url}?t=${new Date().getTime()}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await res.json();
          try { await templatesDB.setItem(cacheKey, json); } catch (e) { }
          return json;
        }
      }
    } catch (e) { console.warn(`Network fetch failed for ${url}, falling back to Service Worker / local cache.`, e); }
    
    // Offline Service Worker Precache Fallback
    try {
      const swRes = await fetch(url);
      if (swRes.ok) {
        const contentType = swRes.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await swRes.json();
          try { await templatesDB.setItem(cacheKey, json); } catch (e) { }
          return json;
        }
      }
    } catch (e) { }

    try {
      const cached = await templatesDB.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { }
    // BUG FIX: LearningPath.jsx pre-fetches this exact same activities/lesson
    // JSON while the learner is browsing the Learning Path online, but it
    // caches into a different IndexedDB store (curriculumCacheDB, keyed by
    // the raw URL) than this function checks (templatesDB, keyed by a
    // "activities:module_X" cacheKey). That mismatch meant the offline
    // fallback here reported "no cache available" -- and threw -- even when
    // the data had already been fetched and cached moments earlier. Check
    // curriculumCacheDB under its own key scheme before giving up.
    try {
      const sharedCached = await curriculumCacheDB.getItem(url);
      if (sharedCached) return sharedCached;
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
      targetSpaceComplexity: foundActivity.targetSpace || foundActivity.targetSpaceComplexity || "O(1)",
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

    // ANTI-CORRUPTION GUARD: if the boot effect hasn't finished loading the
    // existing submission yet (e.g. the user opened this activity and
    // navigated away again before the local/cloud fetch resolved),
    // latestStateRef.current is still sitting at its initial defaults
    // (functional_total: 0, complexity_total: 0, hidden_total: 0,
    // actualTime: "O(n^2)", etc). Saving here would upsert those defaults
    // over a previously correct submission, wiping out real AES/test-case/
    // complexity data -- which is exactly what was showing up as
    // "Functional: 0/0 | Complexity: 0/0" and a stale "O(n^2)" complexity
    // on the Profile page for activities that were actually completed.
    // Every other autosave path in this file (handleWorkspaceChange, the
    // analyzer-trigger effect) already guards on isReadyRef for the same
    // reason -- triggerFinalSave was the one path that didn't.
    if (!isReadyRef.current) return;

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
      initial_aes: state.initial_aes, final_aes: state.final_aes, latest_aes: state.latest_aes,
      baseline_actual_complexity: state.baseline_actualTime, baseline_actual_space_complexity: state.baseline_actualSpace,
      latest_actual_complexity: state.latest_actualTime, latest_actual_space_complexity: state.latest_actualSpace,
      // BUG FIX: previously Math.max(0, (state.final_aes || 0) - (state.initial_aes || 0))
      // -- for a workspace that was opened/auto-saved but never actually
      // evaluated (state.final_aes/initial_aes both null), the `|| 0`
      // fallback silently turned "no evaluation happened" into a real
      // rog=0 that synced to the server and got averaged into the cohort
      // ROG metric as a phantom "no gain" attempt. Only compute a real
      // rog once an evaluation has actually produced a final_aes; leave
      // it null otherwise so the admin dashboard can tell "never
      // attempted" apart from "attempted, no gain."
      rog: state.final_aes != null ? Math.max(0, state.final_aes - (state.initial_aes || 0)) : null,
      code_unchanged: state.code_unchanged ?? false,
      passedTestCases: state.passed, totalTestCases: totalTests, passed_tests: state.passed, total_tests: totalTests,
      functional_passed: state.functional_passed, functional_total: state.functional_total,
      complexity_passed: state.complexity_passed, complexity_total: state.complexity_total,
      hidden_passed: state.hidden_passed, hidden_total: state.hidden_total,
      testCases: state.testResults, target_complexity: state.targetTime || "O(n)", actual_complexity: state.actualTime,
      target_space_complexity: state.targetSpace || "O(1)", actual_space_complexity: state.actualSpace,
      workspace: { blocklyJson: currentJson || {} }, pythonCode: state.pythonCode, timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: true,
    };

    const finalSubId = `${state.userId}_${moduleId}_${activityId}`;
    // BUG FIX: this composite id was never included in the payload sent to
    // the server, only used as the local IndexedDB key. get-all-submissions
    // echoes back exactly the JSON blob it was given, so every synced
    // submission came back from the server with no "id" -- which broke
    // matching it against the local record on the next pull (see
    // syncManager.js pullRemoteState) and made merging fail outright.
    payload.id = finalSubId;
    try { submissionsDB.setItem(finalSubId, { ...payload, isSynced: false }); } catch (e) {}

    if (navigator && navigator.onLine && API_BASE) {
      try {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
        fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), keepalive: true });
      } catch (err) { pushToSyncQueue(`sync_${finalSubId}`, { url: `${API_BASE}/api/sync-submission`, method: "POST", payload: payload }); }
    } else pushToSyncQueue(`sync_${finalSubId}`, { url: `${API_BASE}/api/sync-submission`, method: "POST", payload: payload });
  };

  // EMERGENCY SAVE: reliable, synchronous fallback for refresh/close.
  // ROOT CAUSE (evaluator-reported bug, Part 3.4): triggerFinalSave() writes
  // to IndexedDB (submissionsDB.setItem, async) and fires a fetch(). A
  // `beforeunload` listener cannot delay navigation for that work to
  // finish -- on an actual page refresh the browser tears down the JS
  // context before the IndexedDB transaction (and often the fetch) has
  // committed, so any edits made since the last successful 1.5s autosave
  // were silently lost. localStorage.setItem is synchronous and completes
  // in effectively zero time, so it reliably survives the brief window
  // before unload. We use it purely as a same-tab safety net: write the
  // in-memory workspace state there on every unload-type signal, then
  // reconcile it back into IndexedDB/the server the next time this
  // activity boots (see boot() below).
  const emergencySaveKey = () => {
    const uid = latestStateRef.current.userId;
    return uid ? `algoblocks_emergency_${uid}_${moduleId}_${activityId}` : null;
  };

  const emergencySaveNow = () => {
    try {
      const key = emergencySaveKey();
      if (!key) return;
      const state = latestStateRef.current;
      const json = latestBlocksJsonRef.current || state.json;
      const isJsonEmpty = !json || Object.keys(json).length === 0 || (json.blocks && json.blocks.blocks && json.blocks.blocks.length === 0);
      const hasValidPython = state.pythonCode && state.pythonCode !== "# Drag blocks to generate Python code" && state.pythonCode.trim() !== "";
      // Nothing meaningful to protect yet -- don't overwrite a real
      // snapshot from a previous visit with an empty one.
      if (isJsonEmpty && !hasValidPython) return;
      localStorage.setItem(key, JSON.stringify({ blocklyJson: json || {}, pythonCode: state.pythonCode, timestamp: Date.now() }));
    } catch (e) { /* localStorage full/unavailable -- triggerFinalSave is still attempted below */ }
  };

  useEffect(() => {
    const handleBeforeUnload = () => { emergencySaveNow(); triggerFinalSave(); };
    // `pagehide` and `visibilitychange` cover cases beforeunload misses or
    // fires unreliably for (mobile browsers backgrounding/closing the tab,
    // iOS Safari's bfcache behavior) -- any of these can precede a refresh
    // or close without a guaranteed beforeunload.
    const handlePageHide = () => emergencySaveNow();
    const handleVisibilityChange = () => { if (document.visibilityState === "hidden") emergencySaveNow(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // SPREAD-OUT AUTOSAVE: the unload listeners above only cover a clean
  // exit. Someone typing continuously in the Python editor can keep the
  // existing 1.5s autosave debounce (handleWorkspaceAutoSave below)
  // perpetually reset, so it may never actually fire during a long,
  // uninterrupted editing streak -- and a hard crash, tab kill, or lost
  // connection never fires beforeunload/pagehide at all. This interval is
  // a periodic, debounce-independent flush of the same synchronous
  // localStorage snapshot, so the recoverable copy is never more than a
  // few seconds stale regardless of how the session ends.
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isReadyRef.current && !isUnmountingRef.current) emergencySaveNow();
    }, 4000);
    return () => clearInterval(intervalId);
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

        // Recover the synchronous emergency-save snapshot (see
        // emergencySaveNow above) written on the previous unload, if any.
        // This is what actually survives a refresh -- IndexedDB/the server
        // may still be holding whatever was last durably synced, which can
        // be older than what the user had on screen right before refreshing.
        const emergencyKey = `algoblocks_emergency_${user.email}_${moduleId}_${activityId}`;
        let emergencySnapshot = null;
        try {
          const raw = localStorage.getItem(emergencyKey);
          if (raw) emergencySnapshot = JSON.parse(raw);
        } catch (e) { }

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

        // If the emergency snapshot is at least as new as whatever we just
        // picked (it almost always will be, since it's written on every
        // unload), it wins -- it's the last thing the user actually saw
        // before refreshing/closing, and may be newer than the last
        // successful IndexedDB/server sync.
        let recoveredFromEmergencySave = false;
        if (emergencySnapshot && emergencySnapshot.timestamp >= (finalSubmissionToLoad?.timestamp || 0)) {
          finalSubmissionToLoad = {
            ...(finalSubmissionToLoad || {}),
            activityId, moduleId,
            workspace: { blocklyJson: emergencySnapshot.blocklyJson },
            pythonCode: emergencySnapshot.pythonCode,
            timestamp: emergencySnapshot.timestamp,
          };
          recoveredFromEmergencySave = true;
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
            latestStateRef.current.latest_aes = finalSubmissionToLoad.latest_aes ?? finalSubmissionToLoad.final_aes ?? null;
            latestStateRef.current.baseline_actualTime = finalSubmissionToLoad.baseline_actual_complexity ?? null;
            latestStateRef.current.baseline_actualSpace = finalSubmissionToLoad.baseline_actual_space_complexity ?? null;
            latestStateRef.current.latest_actualTime = finalSubmissionToLoad.latest_actual_complexity ?? finalSubmissionToLoad.actual_complexity ?? null;
            latestStateRef.current.latest_actualSpace = finalSubmissionToLoad.latest_actual_space_complexity ?? finalSubmissionToLoad.actual_space_complexity ?? null;
            latestStateRef.current.rog = finalSubmissionToLoad.rog ?? 0;
            latestStateRef.current.lastSubmittedCode = (finalSubmissionToLoad.pythonCode || "").trim();
            latestStateRef.current.functional_passed = finalSubmissionToLoad.functional_passed ?? 0;
            latestStateRef.current.functional_total = finalSubmissionToLoad.functional_total ?? 0;
            latestStateRef.current.complexity_passed = finalSubmissionToLoad.complexity_passed ?? 0;
            latestStateRef.current.complexity_total = finalSubmissionToLoad.complexity_total ?? 0;
            latestStateRef.current.hidden_passed = finalSubmissionToLoad.hidden_passed ?? 0;
            latestStateRef.current.hidden_total = finalSubmissionToLoad.hidden_total ?? 0;
            latestStateRef.current.passed = finalSubmissionToLoad.passedTestCases || finalSubmissionToLoad.passed_tests || 0;
            latestStateRef.current.status = finalSubmissionToLoad.status || "draft";

            let loadedScore = finalSubmissionToLoad.latest_aes ?? finalSubmissionToLoad.final_aes ?? finalSubmissionToLoad.score ?? 0;
            if (finalSubmissionToLoad.maxScore === 5 && loadedScore <= 5) loadedScore = (loadedScore / 5) * 100;

            const computedAes = Math.min(loadedScore, 100);
            setCurrentAes(computedAes);

            const loadedInitAes = finalSubmissionToLoad.initial_aes ?? null;
            if (loadedInitAes !== null) {
              // Per the paper: ROG = AES_Final - AES_Baseline, no
              // "complexity class must have changed" condition.
              const calcRog = computedAes - loadedInitAes;
              setCurrentRog(calcRog > 0 ? calcRog : 0);
            }

            applyWorkspaceData(json, pythonCode);
            if (pythonCode && pythonCode !== "# Drag blocks to generate Python code") {
                setGeneratedPython(pythonCode);
                
                const isJsonEmpty = !json || Object.keys(json).length === 0 || (json.blocks && json.blocks.blocks && json.blocks.blocks.length === 0);
                if (isJsonEmpty) {
                    setViewMode("python");
                    focusDockPanel("python");
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

        // Now that we're fully loaded (and have time to let async work
        // actually finish, unlike during unload), persist the recovered
        // snapshot properly and clear it so a stale copy never gets
        // replayed over newer data on a later visit.
        if (recoveredFromEmergencySave && !cancelled) {
          try { await triggerFinalSave(); } catch (e) { }
          try { localStorage.removeItem(emergencyKey); } catch (e) { }
        }
      } catch (e) { console.error("Activity bootstrap failed:", e); if (!cancelled) navigate("/learning-path", { replace: true }); }
    };
    boot();
    return () => { 
        isUnmountingRef.current = true; 
        cancelled = true; 
        emergencySaveNow();
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
      initial_aes: latestStateRef.current.initial_aes, final_aes: latestStateRef.current.final_aes, latest_aes: latestStateRef.current.latest_aes,
      baseline_actual_complexity: latestStateRef.current.baseline_actualTime, baseline_actual_space_complexity: latestStateRef.current.baseline_actualSpace,
      latest_actual_complexity: latestStateRef.current.latest_actualTime, latest_actual_space_complexity: latestStateRef.current.latest_actualSpace,
      // BUG FIX: see triggerFinalSave's identical comment -- without this,
      // a draft-save that happens before any evaluation has run (e.g. the
      // isDraft=true calls below) synced the ref's untouched default
      // rog=0 alongside a null final_aes, which the admin dashboard's ROG
      // average then counted as a real (phantom) zero-gain attempt.
      rog: latestStateRef.current.final_aes != null ? (latestStateRef.current.rog || 0) : null,
      // Lets analytics see (and exclude, if needed) submissions where the
      // code was byte-for-byte identical to the learner's previous
      // submission for this activity -- see the ROG-freeze comment above
      // triggerEvaluation's bestAes calculation.
      code_unchanged: latestStateRef.current.code_unchanged ?? false,
      passedTestCases: finalPassed, totalTestCases: total, passed_tests: finalPassed, total_tests: total,
      functional_passed: latestStateRef.current.functional_passed, functional_total: latestStateRef.current.functional_total,
      complexity_passed: latestStateRef.current.complexity_passed, complexity_total: latestStateRef.current.complexity_total,
      hidden_passed: latestStateRef.current.hidden_passed, hidden_total: latestStateRef.current.hidden_total,
      testCases: finalTestResults, target_complexity: latestStateRef.current.targetTime || "O(n)", actual_complexity: actualTime, target_space_complexity: latestStateRef.current.targetSpace || "O(1)", actual_space_complexity: actualSpace, workspace: { blocklyJson: safeJson || {} }, pythonCode: pythonCode || "", timestamp: Date.now(), submittedAt: new Date().toISOString(), isSynced: false,
      // BUG FIX: see triggerFinalSave's identical comment -- without this,
      // the server round-trips this submission with no "id", which is what
      // broke matching it back against the local IndexedDB record (keyed
      // by this same composite string) on the next pull from the server.
      id: submissionId,
    };

    try { await submissionsDB.setItem(submissionId, payload); window.dispatchEvent(new Event("localDataSynced")); } catch (e) { }

    if (navigator && !navigator.onLine) { pushToSyncQueue(`sync_${submissionId}_${Date.now()}`, { url: `${API_BASE}/api/sync-submission`, method: "POST", payload: { ...payload, isSynced: true } }); return; }

    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (API_BASE) {
        const response = await fetch(`${API_BASE}/api/sync-submission`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...payload, isSynced: true }) });
        if (response.ok) {
           try { await submissionsDB.setItem(submissionId, { ...payload, isSynced: true }); } catch(e) {}
        } else throw new Error("Server rejected submission");
      }
    } catch (err) { pushToSyncQueue(`sync_${submissionId}_${Date.now()}`, { url: `${API_BASE}/api/sync-submission`, method: "POST", payload: { ...payload, isSynced: true } }); }
  };

  const handleWorkspaceAutoSave = (json, pythonCode) => {
    if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    saveDraftTimeoutRef.current = setTimeout(async () => {
      // Flush the synchronous localStorage snapshot in the same breath as
      // the IndexedDB/server draft save, so both stay in lockstep on every
      // settled edit -- not just at unload or on the 4s interval.
      emergencySaveNow();
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
      if (isSyncingBlocks) return;
      if (!isEngineReady) {
        setConsoleOutput(`Still preparing the Python engine${engineProgress?.stage ? ` (${engineProgress.stage})` : ""}. Please wait a moment and try again.`);
        focusDockPanel("console"); setConsoleTab("output");
        return;
      }
      // Bring the Blocks panel into view *before* the conversion starts.
      // loadFromPython() below may pop open the ScopeWarningModal
      // (rendered inside BlocklyWorkspace) when it detects unsupported or
      // partially-supported libraries, and pause for the user's decision --
      // if that dock panel isn't visible/focused when it appears, the
      // whole sync looks permanently stuck even though it's just waiting
      // on a confirmation the user can't see.
      focusDockPanel("blockly");
      setIsSyncingBlocks(true);
      try {
        await workspaceRef.current.loadFromPython(sanitizePythonCode(generatedPython));
        loadTimeRef.current = Date.now(); // Reset protection timer
        setIsEditingCode(false); 
        setViewMode("workspace");
        focusDockPanel("blockly");
        showToast("Python code successfully converted into blocks!", "success");
      } catch (e) {
        setModalConfig({ isOpen: true, title: "Sync Error", message: e?.message || "Cannot sync to blocks until syntax errors are fixed.", confirmText: "Close", isDanger: true, onConfirmAction: closeModal });
      } finally {
        setIsSyncingBlocks(false);
      }
    }
  };

  const handleActivityRun = async () => {
    if (isEvaluating) return;
    if (!isEngineReady) {
      setConsoleOutput(`Still preparing the Python engine${engineProgress?.stage ? ` (${engineProgress.stage})` : ""}. Please wait a moment and try again.`);
      focusDockPanel("console"); setConsoleTab("output");
      return;
    }
    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); focusDockPanel("console"); setConsoleTab("output"); return;
    }
    clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current); setIsEvaluating(true); setLineExecutions({});
    focusDockPanel("console"); setConsoleTab("output"); setConsoleOutput((prev) => prev + "\n> Running the program...\n");

    outputCountRef.current = 0; pendingOutputRef.current = ""; runtimeErrorTextRef.current = "";
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
      } catch (error) { pushToSyncQueue(`sync_prog_${lessonId}_${Date.now()}`, { url: `${API_BASE}/api/update-progress`, method: "POST", payload: payload }); }
    } else if (!user.isGuest) pushToSyncQueue(`sync_prog_${lessonId}_${Date.now()}`, { url: `${API_BASE}/api/update-progress`, method: "POST", payload: payload });
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
      } catch (error) { pushToSyncQueue(`sync_prog_${topicId}_${Date.now()}`, { url: `${API_BASE}/api/update-progress`, method: "POST", payload: payload }); }
    } else if (!user.isGuest) pushToSyncQueue(`sync_prog_${topicId}_${Date.now()}`, { url: `${API_BASE}/api/update-progress`, method: "POST", payload: payload });
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

    // BUG FIX (threshold inconsistency): Previously used per-activity difficulty
    // (Easy/Medium/Hard) from the activity JSON, which disagreed with LearningPath.jsx
    // which uses module-level difficulty from the moduleIcons config. Now both use
    // the same module-level difficulty mapping so displayed "Min. X" matches the
    // actual unlock gate.
    const isOptimizationLesson = lessonActivitiesResolved.some(
      (a) => (a.type || "").toLowerCase() === "optimization" || (a.id || "").includes("opt")
    );

    let threshold;
    if (isOptimizationLesson) {
      threshold = 2;
    } else {
      // Map module difficulty (Beginner/Intermediate/Advanced) → min activities needed.
      // This must stay in sync with LearningPath.jsx::getMinReq().
      const modNum = String(moduleId).replace(/[^0-9]/g, "");
      const moduleKey = `module-${modNum}`;
      // Inline the same difficulty lookup used in LearningPath moduleIcons
      const moduleDifficulty = {
        "module-0": "Beginner",
        "module-1": "Beginner",
        "module-2": "Intermediate",
        "module-3": "Intermediate",
        "module-4": "Intermediate",
        "module-5": "Advanced",
        "module-6": "Advanced",
      }[moduleKey] || "Beginner";

      if (moduleDifficulty === "Beginner") threshold = 3;
      else if (moduleDifficulty === "Intermediate") threshold = 2;
      else threshold = 1; // Advanced
    }

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
          // BUG FIX (progress desync): previously checked `sub.score >= 50`.
          // `score` is the latest-attempt AES, which may be lower than a prior
          // passing attempt. LearningPath.jsx::checkActivityDone uses `final_aes`
          // (the best-ever AES). Now both use the same field so an activity that
          // was once passed is never incorrectly un-marked after a lower re-attempt.
          const subId = `${user.email}_${moduleId}_${act.id}`;
          try {
            const sub = await submissionsDB.getItem(subId);
            if (sub) {
              let bestAes = sub.final_aes !== undefined && sub.final_aes !== null
                ? sub.final_aes
                : sub.score || 0;
              if (sub.maxScore === 5 && bestAes <= 5) bestAes = (bestAes / 5) * 100;
              if (bestAes >= 50 || sub.status === "passed") passedCount++;
            }
          } catch (e) { }
      }
    }
    return { passedCount, threshold, isCompleted: passedCount >= threshold };
  };

  // "Next Lesson" in the completion modal is supposed to open the reading
  // content for the lesson that comes right after this one -- not just drop
  // the learner back on the generic /learning-path listing. topicIdResolved
  // is already in the exact "lesson-{moduleNum}-{lessonNum}" form used as
  // lessonId in curriculumIndex, so we can look the current lesson up there,
  // grab whichever one is next in that module's lessons array, and route
  // straight to it. If this was the last lesson in the module (no next
  // lesson to open), fall back to the learning path listing.
  const resolveNextLessonPath = () => {
    if (!topicIdResolved) return "/learning-path";
    const module = curriculumIndex.find((m) => Array.isArray(m.lessons) && m.lessons.some((l) => l.lessonId === topicIdResolved));
    if (!module) return "/learning-path";
    const lessonIndex = module.lessons.findIndex((l) => l.lessonId === topicIdResolved);
    const nextLesson = lessonIndex >= 0 ? module.lessons[lessonIndex + 1] : null;
    if (!nextLesson) return "/learning-path";
    return `/learning-path/${module.moduleId}/${nextLesson.lessonId}`;
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

    // Build the structured result data the RewardModal renders as icons,
    // an animated score, and chips instead of a plain paragraph.
    const isRetry = funcPassed < funcTotal;
    let tier; let description; let scoreForDisplay;
    if (isRetry) {
      tier = "retry";
      description = `Your logic is incomplete. Focus on fixing your syntax and logic before worrying about complexity.`;
      scoreForDisplay = null; // AES isn't meaningful until functional tests pass
    } else if (aesScore === 100) {
      tier = "perfect";
      description = "You passed all functional tests and completely mastered both the target Time and Space complexity!";
      scoreForDisplay = aesScore;
    } else if (aesScore >= 75) {
      tier = "great";
      description = "You passed all functional tests, but your algorithm is slightly suboptimal in Time or Space complexity. Can you optimize it further to reach 100%?";
      scoreForDisplay = aesScore;
    } else {
      tier = "good";
      description = "Your code works and passed all functional tests! However, it requires a lot more execution time or memory than the optimal solution.";
      scoreForDisplay = aesScore;
    }

    const baseResult = {
      tier,
      aesScore: scoreForDisplay,
      funcPassed,
      funcTotal,
      rogGain: currentRog > 0 ? currentRog : 0,
      passedCount: completionData.passedCount,
      threshold: completionData.threshold,
      description,
      milestone: null,
      milestoneNote: null,
    };

    if (!isLast && nextActivity) {
      if (meetsThreshold) {
        setRewardConfig({
          isOpen: true,
          result: { ...baseResult, milestone: "lessonUnlocked" },
          confirmText: "Next Lesson", cancelText: "Stay Here", secondaryText: "Next Activity",
          onConfirmAction: () => { closeReward(); navigate(resolveNextLessonPath()); },
          onSecondaryAction: () => { closeReward(); navigate(`/activity/${moduleId}/${nextActivity.id}`); },
          onCancelAction: closeReward,
        });
      } else {
        setRewardConfig({
          isOpen: true,
          result: baseResult,
          confirmText: "Next Activity", cancelText: "Stay Here", secondaryText: null,
          onConfirmAction: () => { closeReward(); navigate(`/activity/${moduleId}/${nextActivity.id}`); },
          onCancelAction: closeReward,
        });
      }
    } else {
      setRewardConfig({
        isOpen: true,
        result: { ...baseResult, milestone: "sectionCompleted", milestoneNote: "You've finished every activity here — return to the learning path to explore the next topic." },
        confirmText: "Finish", cancelText: "Stay Here", secondaryText: null,
        onConfirmAction: async () => { closeReward(); navigate("/learning-path"); },
        onCancelAction: closeReward,
      });
    }
  };

  const runTestCases = async () => {
    if (isEvaluating || isSyncingBlocks) return;
    if (!isEngineReady) {
      setConsoleOutput(`Still preparing the Python engine${engineProgress?.stage ? ` (${engineProgress.stage})` : ""}. Please wait a moment and try again.`);
      focusDockPanel("console"); setConsoleTab("output");
      return;
    }
    if (!processedTestCases.length) return;
    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); focusDockPanel("console"); setConsoleTab("output"); return;
    }

    setIsEvaluating(true); setLineExecutions({});
    setConsoleOutput("Running pre-flight checks (Detecting infinite loops)...\n");
    focusDockPanel("console"); setConsoleTab("output");

    const cleanPayload = sanitizePythonCode(generatedPython);
    try { await executeTest(cleanPayload); } catch (failure) {
      const errorMsg = `Test Execution Prevented:\n\n${failure.error || failure.message}`;
      setConsoleOutput(errorMsg); focusDockPanel("console"); setIsEvaluating(false);
      localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: errorMsg, passedTests: 0 })); return;
    }

    focusDockPanel("console"); setConsoleOutput("\n> --- Running Test Cases ---\n\n"); setPassedTests(0);

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
    const targetTimeWeight = getComplexityWeight(activityDataResolved?.targetTimeComplexity, 6) || 6;
    const actualTimeWeight = getComplexityWeight(analysisResult.total, 6) || 6;

    const targetSpaceWeight = getComplexityWeight(activityDataResolved?.targetSpaceComplexity, 6) || 6;
    const actualSpaceWeight = getComplexityWeight(analysisResult.space_total, 6) || 6;

    const safeActualTime = actualTimeWeight > 0 ? actualTimeWeight : 6;
    const safeActualSpace = actualSpaceWeight > 0 ? actualSpaceWeight : 6;

    let timeRatio = targetTimeWeight / safeActualTime;
    if (timeRatio > 1.0) timeRatio = 1.0;

    let spaceRatio = targetSpaceWeight / safeActualSpace;
    if (spaceRatio > 1.0) spaceRatio = 1.0;

    const averageEfficiency = (timeRatio + spaceRatio) / 2;
    let aes = Math.floor((tsr * averageEfficiency) * 100);

    setCurrentAes(aes);

    const initialAes = latestStateRef.current.initial_aes ?? aes;

    // DATA INTEGRITY FIX: resubmitting the exact same code (no edits at
    // all since the last submission) was previously re-run through the
    // same AES/ROG math as a genuine resubmission. In practice the math
    // itself can't manufacture a *higher* bestAes from identical code
    // (aes is deterministic for the same source), but nothing distinguished
    // "resubmitted unchanged" from "resubmitted after real edits" in the
    // stored record -- so a batch of no-op resubmits was indistinguishable
    // from real refactoring passes when reviewing the data later, and any
    // future nondeterminism in the analyzer (timing-sensitive complexity
    // classification, engine version drift, etc.) would have gone straight
    // into the ROG average unguarded. Compare against the code from the
    // last submission and, when it's byte-for-byte the same, freeze
    // initial/final AES and ROG at their existing values instead of
    // recomputing them, and flag the submission so analytics can see (and
    // exclude, if needed) unchanged-code resubmissions going forward.
    const previousSubmittedCode = (latestStateRef.current.lastSubmittedCode || "").trim();
    const currentSubmittedCode = (generatedPython || "").trim();
    const isDuplicateCodeResubmission =
      previousSubmittedCode.length > 0 && previousSubmittedCode === currentSubmittedCode;

    const bestAes = isDuplicateCodeResubmission
      ? (latestStateRef.current.final_aes ?? aes)
      : Math.max(latestStateRef.current.final_aes ?? aes, aes);

    latestStateRef.current.initial_aes = initialAes;
    latestStateRef.current.final_aes = bestAes;
    latestStateRef.current.latest_aes = aes;
    latestStateRef.current.code_unchanged = isDuplicateCodeResubmission;
    latestStateRef.current.lastSubmittedCode = currentSubmittedCode;
    latestStateRef.current.latest_actualTime = analysisResult.total || "O(1)";
    latestStateRef.current.latest_actualSpace = analysisResult.space_total || "O(1)";
    if (latestStateRef.current.baseline_actualTime === null) {
      latestStateRef.current.baseline_actualTime = analysisResult.total || "O(1)";
      latestStateRef.current.baseline_actualSpace = analysisResult.space_total || "O(1)";
    }

    // Per the paper's definition: ROG = AES_Final − AES_Baseline, where
    // Baseline is the AES of the learner's very first evaluation (pass or
    // fail) and Final is the highest AES recorded for this activity since.
    // No extra "did the Big-O class change" condition -- a resubmission
    // that only fixes correctness (same complexity class, higher TSR)
    // still raised AES and is still a real refactoring gain. (An
    // unchanged-code resubmission is excluded above, before this line
    // ever runs, by freezing bestAes at its prior value.)
    const calculatedRog = Math.max(0, bestAes - initialAes);
    latestStateRef.current.rog = calculatedRog;
    latestStateRef.current.functional_passed = functionalPassed;
    latestStateRef.current.functional_total = functionalTotal;
    latestStateRef.current.complexity_passed = processedTestCases.filter((tc, index) => tc.isComplexityTest && fullOutput.includes(`Test ${index + 1}: PASSED`)).length;
    latestStateRef.current.complexity_total = processedTestCases.filter((tc) => tc.isComplexityTest).length;
    latestStateRef.current.hidden_passed = processedTestCases.filter((tc, index) => tc.isHidden && fullOutput.includes(`Test ${index + 1}: PASSED`)).length;
    latestStateRef.current.hidden_total = processedTestCases.filter((tc) => tc.isHidden).length;
    setCurrentRog(calculatedRog > 0 ? calculatedRog : 0);

    const testResults = processedTestCases.map((tc, idx) => ({
      id: `tc_${idx}`,
      category: tc.isComplexityTest ? "complexity" : tc.isHidden ? "hidden" : "functional",
      status: fullOutput.includes(`Test ${idx + 1}: PASSED`) ? "passed" : "failed"
    }));

    const trueFinalJsonToSave = getFailsafeWorkspaceJson() || latestStateRef.current.json;

    try { await saveSubmission(trueFinalJsonToSave, generatedPython, aes, passed, totalTests, testResults, analysisResult.total || "O(n^2)", analysisResult.space_total || "O(1)", false); } catch(e) { console.error(e) }
    try { localStorage.setItem(`activity_tests_${moduleId}_${activityId}`, JSON.stringify({ consoleOutput: fullOutput, passedTests: passed, score: aes })); } catch(e) {}

    const lessonKey = `${moduleId}:${activityId}`;
    // BUG FIX (progress desync): previously saved raw `aes` (current attempt score).
    // If the user re-attempts and scores lower, this would overwrite the stored progress
    // with a lower value and un-mark an already-passed activity on reload.
    // Fix: save the best-ever AES (latestStateRef.current.final_aes = Math.max(prev, current))
    // so a lower re-attempt never reduces the stored progress.
    const bestAesForProgress = latestStateRef.current.final_aes ?? aes;
    try { await savePartialProgress(lessonKey, bestAesForProgress); } catch(e) { console.error(e) }

    await handleSuccess(aes, functionalPassed, functionalTotal, calculatedRog);
  };

  // Every panel DockableWorkspace can dock/redock. BlocklyWorkspace stays
  // mounted regardless of which region currently hosts it (its own
  // ResizeObserver — see BlocklyWorkspace.jsx — keeps it correctly sized).
  const dockPanels = [
    {
      id: "blockly",
      title: "Blocks",
      icon: <FiGrid size={14} />,
      content: (
        <div className="workspace-view" style={{ width: "100%", height: "100%" }}>
          <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} syntaxErrors={syntaxErrors || []} />
        </div>
      ),
    },
    {
      id: "python",
      title: "Python",
      icon: <FiTerminal size={14} />,
      content: (
        <PythonCodeEditor
          viewMode="python"
          pythonCode={generatedPython}
          isEditingCode={isEditingCode}
          syntaxErrors={syntaxErrors || []}
          onSyncToBlocks={handleSyncToBlocks}
          isSyncingToBlocks={isSyncingBlocks}
          onChangeCode={(value) => {
            if (isUnmountingRef.current) return;
            const newCode = sanitizePythonCode(value);
            setGeneratedPython(newCode); setIsEditingCode(true); setSyntaxErrors([]);
            latestStateRef.current.pythonCode = newCode; handleWorkspaceAutoSave(getFailsafeWorkspaceJson() || latestStateRef.current.json, newCode);
          }}
          onMountEditor={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
        />
      ),
    },
    {
      id: "console",
      title: "Console",
      icon: <FiTerminal size={14} />,
      closable: true,
      content: (
        <ConsolePanelContent
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
        />
      ),
    },
    {
      id: "complexity",
      title: "Complexity",
      icon: <FiActivity size={14} />,
      closable: true,
      content: (
        <ComplexityPanelContent
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
      ),
    },
  ];

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
            <button className={`wh-toggle-btn ${viewMode === "workspace" ? "active" : ""}`} onClick={() => { setViewMode("workspace"); focusDockPanel("blockly"); }}><FiGrid size={14} /> Workspace</button>
            <button className={`wh-toggle-btn ${viewMode === "python" ? "active" : ""}`} onClick={() => { setViewMode("python"); focusDockPanel("python"); }}><FiTerminal size={14} /> Python Code</button>
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
            <FiChevronLeft className="toggle-icon" />
          </button>
          <button className={`sidebar-toggle-btn right-panel-toggle ${!isRightPanelVisible ? "closed" : ""}`} onClick={() => setIsRightPanelVisible(!isRightPanelVisible)} title="Toggle Test Cases">
            <FiChevronLeft className="toggle-icon" />
          </button>

          <div className="editor-container">
            <DockableWorkspace
              ref={dockRef}
              layoutKey={`activity-workspace-${moduleId}-${activityId}`}
              panels={dockPanels}
              defaultLayout={DEFAULT_DOCK_LAYOUT}
              onLayoutChange={({ openPanelIds: ids }) => setOpenPanelIds(ids)}
            />
          </div>

          <WorkspaceFooterBar
            openPanelIds={openPanelIds}
            onTogglePanel={toggleDockPanel}
            onOpenBigOModal={() => setIsBigOModalOpen(true)}
            onOpenBlockGlossary={() => setIsBlockGlossaryOpen(true)}
          >
            <button className="footer-action-icon reset-layout-btn" onClick={() => dockRef.current?.reset()} title="Restore the default panel layout and sizes">
              <FiLayers size={16} /> <span>Reset Workspace Layout</span>
            </button>
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
              <FiActivity size={16} /> <span>Restart</span>
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

      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} cancelText={modalConfig.cancelText} secondaryText={modalConfig.secondaryText} isDanger={modalConfig.isDanger} onCancel={modalConfig.onCancelAction || closeModal} onSecondary={modalConfig.onSecondaryAction} onConfirm={modalConfig.onConfirmAction} />
      <RewardModal isOpen={rewardConfig.isOpen} result={rewardConfig.result} confirmText={rewardConfig.confirmText} cancelText={rewardConfig.cancelText} secondaryText={rewardConfig.secondaryText} onCancel={rewardConfig.onCancelAction || closeReward} onSecondary={rewardConfig.onSecondaryAction} onConfirm={rewardConfig.onConfirmAction} />
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
      <BlockGlossaryModal isOpen={isBlockGlossaryOpen} onClose={() => setIsBlockGlossaryOpen(false)} />
    </div>
  );
};

const ActivityApp = () => {
  const { moduleId, activityId } = useParams();
  const navigate = useNavigate();

  // BUG FIX: activities are Learning Path content, and guests are gated out
  // of the Learning Path listing (see LearningPath.jsx) -- but this route
  // is reachable directly by URL, which would otherwise let a guest open a
  // module's activity anyway. Bounce back to /learning-path, which shows
  // the sign-up prompt instead of module content.
  // Also gate out non-guests who haven't completed the pre-test yet --
  // the pre-test is the entry gate for the entire curriculum, and bypassing
  // it via direct URL defeats the lock system entirely.
  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : {};
    if (user.isGuest) {
      navigate("/learning-path", { replace: true });
      return;
    }
    // Admin users bypass all locks
    if (user.role === "admin" || user.isAdmin === true) return;

    // Check pre-test gate asynchronously
    const checkPreTest = async () => {
      try {
        const { assessmentsDB: aDB } = await import("../db.js");
        const preTestResult = await aDB.getItem("course-pre-test_pre_assessment");
        if (!preTestResult) {
          navigate("/learning-path", { replace: true });
        }
      } catch (e) {
        // If we can't check, allow access (don't block on DB errors)
      }
    };
    checkPreTest();
  }, [navigate]);

  return <ActivityAppInner key={`${moduleId}-${activityId}`} moduleId={moduleId} activityId={activityId} />;
};

export default ActivityApp;