// frontend/src/pages/MainApp.jsx
import React, { useEffect, useRef, useState } from "react";
import {
  UNSAFE_NavigationContext as NavigationContext,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlockGlossaryModal from "../components/BlockGlossaryModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DockableWorkspace from "../components/DockableWorkspace.jsx";
import ComplexityPanelContent from "../components/panelContent/ComplexityPanelContent.jsx";
import ConsolePanelContent from "../components/panelContent/ConsolePanelContent.jsx";
import PythonCodeEditor from "../components/PythonCodeEditor.jsx";
import WorkspaceFooterBar from "../components/WorkspaceFooterBar.jsx";
import WorkspaceHeader from "../components/WorkspaceHeader.jsx";
import { projectsDB, templatesDB } from "../db.js";
import "../styles/MainApp.css";

import { FiActivity, FiChevronRight, FiEdit2, FiFolder, FiGrid, FiLayers, FiPlus, FiSearch, FiTerminal, FiTrash2, FiX } from "react-icons/fi";
import { usePyodide } from "../context/PyodideContext.jsx";
import { sanitizePythonCode } from "../utils/asymptoticParser.jsx";
import { translatePythonError } from "../utils/errorTranslator.js";
import { syncManager } from "../utils/syncManager.js";

// Default docking arrangement: Blocks and Python are tabbed together in the
// main center region (mirroring the old toggle button), Console and
// Complexity are tabbed together docked at the bottom. Any panel can be
// dragged to any other region at runtime; "Reset Workspace Layout" restores
// exactly this.
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

const SIDEBAR_TEMPLATES = [
  { name: "Linear Search", path: "search/linear_search", desc: "Sequentially checks each element.", category: "Search" },
  { name: "Binary Search", path: "search/binary_search", desc: "Finds the position of a target value.", category: "Search" },
  { name: "Exponential Search", path: "search/exponential_search", desc: "Repeated doubling, then binary search.", category: "Search" },
  { name: "Bubble Sort", path: "sort/bubble_sort", desc: "Repeatedly swaps adjacent elements.", category: "Sort" },
  { name: "Selection Sort", path: "sort/selection_sort", desc: "Finds minimum element from unsorted part.", category: "Sort" },
  { name: "Insertion Sort", path: "sort/insertion_sort", desc: "Builds sorted array one element at a time.", category: "Sort" },
  { name: "Merge Sort", path: "sort/merge_sort", desc: "Divides array into halves, sorts, and merges.", category: "Sort" },
  { name: "Quick Sort", path: "sort/quick_sort", desc: "Partitions elements around a pivot.", category: "Sort" },
  { name: "Factorial (Recursive)", path: "recursive/recursive_factorial", desc: "Calculates factorial using recursion.", category: "Recursive" },
  { name: "Fibonacci (Recursive)", path: "recursive/recursive_fibonacci", desc: "Generates Fibonacci sequence recursively.", category: "Recursive" },
  { name: "Permutation (Recursive)", path: "recursive/recursive_permutation", desc: "Generates all permutations of a string.", category: "Recursive" },
  { name: "Tower of Hanoi (Recursive)", path: "recursive/recursive_tower_of_hanoi", desc: "Moves disks following rules.", category: "Recursive" },
];

const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
const getUser = () => { const userStr = localStorage.getItem("user") || sessionStorage.getItem("user"); return userStr ? JSON.parse(userStr) : null; };
const getAuthHeaders = () => { const token = getToken(); return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" }; };

const createInitialTab = (locState = null) => {
  const base = {
    id: `tab-${Date.now()}`, title: "Untitled Project", viewMode: "workspace", blocklyJson: null,
    pythonCode: "# Drag blocks to generate Python code", isEditingCode: false, syntaxErrors: [],
    analysisResult: { lines: [], total: "O(1)", space_total: "O(1)", overall_explanation: "", is_recursive: false, call_graph: {} },
    lineExecutions: {}, analysisTime: "0.0", currentLoadedId: null, saveType: "project",
    isDirty: false,
    ignoreDirtyUntil: Date.now() + 1200
  };

  if (locState?.projectToLoad) {
    const proj = locState.projectToLoad;
    base.blocklyJson = proj.data || proj.workspace?.blocklyJson || proj.blocks || proj;
    base.title = proj.title || proj.name || "Untitled Project";
    base.saveType = proj.isTemplate ? "template" : "project";
    base.pythonCode = proj.pythonCode || "# Drag blocks to generate Python code";
    base.currentLoadedId = proj._id || proj.templateId;
    base.isEditingCode = !!(proj.pythonCode && proj.pythonCode !== "# Drag blocks to generate Python code");
  }
  return base;
};

export default function MainApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationContext = React.useContext(NavigationContext);
  const navigator = navigationContext?.navigator;
  
  const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

  const { worker, isEngineReady, resetWorker, progress: engineProgress, engineError } = usePyodide();

  const [tabs, setTabs] = useState([createInitialTab(location.state)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);
  const [openPanelIds, setOpenPanelIds] = useState(() => new Set(["blockly", "python", "console", "complexity"]));
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...\n");
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => typeof window === "undefined" || window.innerWidth >= 700);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeComplexityTab, setActiveComplexityTab] = useState("overall");

  const [allTemplates, setAllTemplates] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", isDanger: false, onConfirmAction: null });

  const dockRef = useRef(null);
  // Brings a panel's tab to the front in whichever region it's currently
  // docked in — and re-opens it first if the user had closed it. Used by
  // the footer buttons, the guided tour, and "Run Code" (which needs to
  // reveal the console even if it's been closed or moved elsewhere).
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

  const [leaveModal, setLeaveModal] = useState({ isOpen: false, tx: null, targetPath: null });
  const isNavigatingAwayRef = useRef(false);

  const [saveModal, setSaveModal] = useState({
    isOpen: false, isEditMetadataOnly: false, editingId: null, editingData: null,
    title: "", description: "", category: "Custom Templates", saveType: "project",
  });
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [isBlockGlossaryOpen, setIsBlockGlossaryOpen] = useState(false);

  const workspaceRefs = useRef({});
  const workerRef = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const analyzingTabId = useRef(activeTabId);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const updateTab = (id, updates) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));

  const workspaceTour = {
    id: "workspace-tour",
    pageId: "workspace",
    title: "Workspace Tour",
    steps: [
      { target: ".wh-toggle-btn.active", title: "Switch views", description: "Move between Blockly blocks and generated Python code." },
      { target: ".sidebar-search input", title: "Find templates", description: "Search built-in templates and your saved work from the sidebar." },
      { target: ".editor-tab-bar", title: "Manage tabs", description: "Open multiple projects and keep them organized side by side." },
      { target: ".footer-tab:nth-child(1)", title: "Open the console", description: "Bring up the console panel to inspect output from your code.", onEnter: () => { focusDockPanel("console"); setConsoleTab("output"); } },
      { target: ".console-content-wrapper .clear-console-btn", title: "Clear console output", description: "Use the clear button when you want to reset the output area.", onEnter: () => { focusDockPanel("console"); setConsoleTab("output"); } },
      { target: ".console-content-wrapper .tab-btn-group .tab-btn:nth-child(2)", title: "View line executions", description: "See frequency counts for each generated line of code.", onEnter: () => { focusDockPanel("console"); setConsoleTab("executions"); } },
      { target: ".footer-tab:nth-child(2)", title: "Open complexity analysis", description: "Switch to the complexity panel to review time, space, and recursion feedback.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("overall"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(2)", title: "Inspect local complexity", description: "Compare the local cost of each line to the rest of the workspace.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("local"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(3)", title: "Inspect global complexity", description: "Review the full algorithm cost as the analysis flows through the code.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("global"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(4)", title: "Inspect memory map", description: "See how memory changes while the code executes.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("memory"); } },
      { target: ".complexity-content .tab-btn-group .tab-btn:nth-child(5)", title: "Inspect the call graph", description: "Trace recursive calls and control flow through the call graph.", onEnter: () => { focusDockPanel("complexity"); setActiveComplexityTab("callgraph"); } },
      { target: ".big-o-btn", title: "Big-O reference", description: "Open the complexity reference modal when you want a quick concept refresher.", onEnter: () => setIsBigOModalOpen(true), onExit: () => setIsBigOModalOpen(false) },
      { target: ".big-o-modal-content", title: "Reference library", description: "Browse the complexity definitions and examples inside the modal." },
      { target: ".big-o-accordion .big-o-row-trigger", title: "Expandable complexity rows", description: "Open any row to read the definition, analogy, and examples for a specific Big-O class." },
      { target: ".block-glossary-btn", title: "Block Explorer", description: "Not sure what a block does? Open the Block Explorer to look up every block's purpose, see it in a real example, and run it.", onEnter: () => setIsBlockGlossaryOpen(true), onExit: () => setIsBlockGlossaryOpen(false) },
      { target: ".block-glossary-tabs", title: "Browse by category", description: "Jump straight to Logic, Loops, Lists, and every other category of blocks." },
      { target: ".block-glossary-row-trigger", title: "Look up any block", description: "Expand a block to see a live preview, what it does, when to use it, and a runnable example showing it in action." },
    ],
  };

  const currentUser = getUser();
  const isAdmin = !!currentUser?.isAdmin;
  const isGuest = currentUser?.isGuest === true;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const latestTabsRef = useRef(tabs);
  useEffect(() => { latestTabsRef.current = tabs; }, [tabs]);

  useEffect(() => {
    if (!navigator || !navigator.block) return;
    const unblock = navigator.block((tx) => {
      const hasUnsavedChanges = latestTabsRef.current.some((t) => t.isDirty === true);
      if (hasUnsavedChanges && !isNavigatingAwayRef.current) setLeaveModal({ isOpen: true, tx, targetPath: null });
      else tx.retry();
    });
    return unblock;
  }, [navigator]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const hasUnsavedChanges = latestTabsRef.current.some((t) => t.isDirty === true);
      if (hasUnsavedChanges && !isNavigatingAwayRef.current) { e.preventDefault(); e.returnValue = "You have unsaved changes. Are you sure you want to leave?"; }
    };
    const handleGlobalClick = (e) => {
      if (isNavigatingAwayRef.current) return;
      const el = e.target.closest("a, [class*='wh-back-btn']");
      if (!el) return;
      const isDownloadLink = el.hasAttribute("download") || (el.href && typeof el.href === "string" && el.href.startsWith("blob:"));
      if (isDownloadLink) return;
      const isInternalNav = el.tagName === "A" && el.origin === window.location.origin;
      const isBackButton = el.className && typeof el.className === "string" && el.className.includes("wh-back-btn");

      if (isInternalNav || isBackButton) {
        const hasUnsavedChanges = latestTabsRef.current.some((t) => t.isDirty === true);
        if (hasUnsavedChanges) {
          e.preventDefault(); e.stopPropagation();
          let targetUrl = "/dashboard";
          if (el.tagName === "A") targetUrl = el.getAttribute("href");
          setLeaveModal({ isOpen: true, tx: null, targetPath: targetUrl });
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload); document.addEventListener("click", handleGlobalClick, { capture: true });
    return () => { window.removeEventListener("beforeunload", handleBeforeUnload); document.removeEventListener("click", handleGlobalClick, { capture: true }); };
  }, []);

  const confirmLeaveSite = () => {
    isNavigatingAwayRef.current = true;
    if (leaveModal.tx) leaveModal.tx.retry();
    else navigate(leaveModal.targetPath || "/dashboard");
    setLeaveModal({ isOpen: false, tx: null, targetPath: null });
  };
  const cancelLeaveSite = () => setLeaveModal({ isOpen: false, tx: null, targetPath: null });

  const initWorker = () => {
    if (!workerRef.current) return;
    workerRef.current.onmessage = (event) => {
      const { type, data, counts } = event.data;
      if (type === "ANALYZE_RESULT") {
        const targetId = analyzingTabId.current;
        if (data.status === "success") {
          const initialCounts = {};
          (data.lines || []).forEach((l) => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
          updateTab(targetId, {
            analysisTime: data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00",
            analysisResult: {
              total: data.total,
              space_total: data.space_total || "O(1)",
              overall_explanation: data.overall_explanation || "",
              lines: data.lines || [],
              call_graph: data.call_graph || {},
              is_recursive: data.is_recursive || false
            },
            lineExecutions: (prev) => ({ ...prev, ...initialCounts }),
            syntaxErrors: [],
          });
        } else {
          if (data.multiple_errors && data.multiple_errors.length > 0) {
            const mappedErrors = data.multiple_errors.map((err) => ({ line: err.line, message: `${err.message}. ${translatePythonError(err.message)}` }));
            updateTab(targetId, { syntaxErrors: mappedErrors });
          } else {
            updateTab(targetId, { syntaxErrors: [{ line: data.line, message: `${data.message}. ${translatePythonError(data.message)}` }] });
          }
        }
      } else if (type === "RUN_RESULT") {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const resultData = data !== undefined && data !== null && data !== "" ? `\n${String(data)}` : "";
        setConsoleOutput((prev) => prev + flushed + resultData + "\n> Program finished.\n");
        if (counts) updateTab(analyzingTabId.current, { lineExecutions: counts });
        setIsEvaluating(false); setIsWaitingForInput(false);
      } else if (type === "OUTPUT") {
        outputCountRef.current += 1; pendingOutputRef.current += data;
        if (outputCountRef.current > 5000) {
          clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current); resetWorker();
          const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
          setConsoleOutput((prev) => prev + flushed + "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n");
          setIsEvaluating(false); setIsWaitingForInput(false); outputCountRef.current = 0;
        }
      } else if (type === "INPUT_REQUEST") {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + data.prompt);
        setIsWaitingForInput(true);
      } else if (type === "ERROR") {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput((prev) => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
    };
  };

  useEffect(() => { if (worker) { workerRef.current = worker; initWorker(); } }, [worker]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); showToast("Connection restored.", "success"); };
    const handleOffline = () => { setIsOnline(false); showToast("Connection lost. Using local Pyodide.", "error"); };
    window.addEventListener("online", handleOnline); window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current); };
  }, []);

  useEffect(() => {
    if (workspaceRefs.current[activeTabId]) {
      setTimeout(() => workspaceRefs.current[activeTabId].resize(), 50);
      setTimeout(() => workspaceRefs.current[activeTabId].resize(), 300);
    }
  }, [activeTabId, isSidebarVisible]);

  const fetchTemplates = async () => {
    const baseTemplates = SIDEBAR_TEMPLATES.map((t) => ({ ...t, title: t.name, description: t.desc, isSystem: true }));
    try {
      const user = getUser();
      if (!user) { setAllTemplates(baseTemplates); return; }

      if (navigator && navigator.onLine && API_BASE) {
        try {
          const headers = getAuthHeaders();
          const pRes = await fetch(`${API_BASE}/api/projects?userId=${encodeURIComponent(user.email)}`, { headers });
          if (pRes.ok) {
            const pData = await pRes.json().catch(()=>({}));
            for (const cp of pData.projects || pData || []) {
              if (cp.owner_id === user.email || cp.userId === user.email) await projectsDB.setItem(cp._id, { ...cp, synced: true, isSynced: true });
            }
          }
          const tRes = await fetch(`${API_BASE}/api/templates?userId=${encodeURIComponent(user.email)}`, { headers });
          if (tRes.ok) {
            const tData = await tRes.json().catch(()=>({}));
            for (const ct of tData.templates || tData || []) {
              if (ct.owner_id === user.email || ct.userId === user.email) await templatesDB.setItem(ct._id, { ...ct, synced: true, isSynced: true });
            }
          }
        } catch (e) { console.warn("MainApp templates cloud sync degraded offline:", e); }
      }

      let customItems = [];
      await projectsDB.iterate((value) => {
        if (value.owner_id === user.email || value.userId === user.email) {
          customItems.push({
            _id: value._id, title: value.title || value.name || "Untitled Project",
            description: value.description || "Saved Project", category: "My Projects",
            isSystem: false, saveType: "project", data: value.data || value.workspace?.blocklyJson, synced: value.synced || value.isSynced,
          });
        }
      });
      await templatesDB.iterate((value) => {
        if (value.owner_id === user.email || value.userId === user.email) {
          customItems.push({
            _id: value._id, title: value.title || value.name || "Untitled Template",
            description: value.description || "Custom template", category: value.category || "Custom Templates",
            isSystem: false, saveType: "template", data: value.data || value.workspace?.blocklyJson, synced: value.synced || value.isSynced,
          });
        }
      });
      const uniqueItemsMap = new Map();
      customItems.forEach((item) => uniqueItemsMap.set(String(item._id), item));
      setAllTemplates([...baseTemplates, ...Array.from(uniqueItemsMap.values())]);
    } catch (e) { setAllTemplates(baseTemplates); }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const createNewTab = () => {
    const newTab = createInitialTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (id) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        const newTab = createInitialTab(); setActiveTabId(newTab.id); return [newTab];
      }
      if (activeTabId === id) setActiveTabId(filtered[filtered.length - 1].id);
      return filtered;
    });
    delete workspaceRefs.current[id];
  };

  const executeSidebarLoad = async (item) => {
    try {
      let json;
      if (item.isSystem) {
        const response = await fetch(`/templates/${item.path}.json`);
        if (!response.ok) throw new Error("Template not found");
        json = await response.json();
      } else { json = item.data; }

      const isClean = activeTab.title === "Untitled Project" && !activeTab.blocklyJson;
      const targetId = isClean ? activeTab.id : `tab-${Date.now()}`;

      const loadedState = {
        title: item.title, blocklyJson: json, pythonCode: "# Drag blocks to generate Python code",
        isEditingCode: false, syntaxErrors: [], 
        analysisResult: { lines: [], total: "Analyzing...", space_total: "Analyzing...", overall_explanation: "", is_recursive: false, call_graph: {} },
        lineExecutions: {}, analysisTime: "...", currentLoadedId: item.isSystem ? null : item._id, saveType: item.isSystem ? "project" : item.saveType || "project",
        isDirty: false,
        ignoreDirtyUntil: Date.now() + 1200
      };

      if (isClean) {
        updateTab(targetId, loadedState);
        if (workspaceRefs.current[targetId]) workspaceRefs.current[targetId].loadTemplate(json);
      } else {
        setTabs((prev) => [...prev, { id: targetId, viewMode: "workspace", ...loadedState }]);
        setActiveTabId(targetId);
      }
    } catch (error) { showToast("Failed to load template", "error"); }
  };

  const loadConfirm = (item) => {
    setModalConfig({
      isOpen: true, title: `Load ${item.title}?`, message: "This will open the template in your workspace.",
      confirmText: "Load", isDanger: false, onConfirmAction: () => { closeModal(); executeSidebarLoad(item); },
    });
  };

  const analyzeCode = async (tabId, code) => {
    if (!code || code.trim() === "" || code === "# Drag blocks to generate Python code") return;
    analyzingTabId.current = tabId;
    const cleanCode = sanitizePythonCode(code);

    if (isOnline && API_BASE) {
      try {
        const response = await fetch(`${API_BASE}/api/analyze`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ code: cleanCode }) });
        if (!response.ok) throw new Error("FastAPI analyze failed");
        const data = await response.json();
        if (data.status === "success") {
          const initialCounts = {};
          (data.lines || []).forEach((l) => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
          updateTab(tabId, {
            analysisTime: data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00",
            analysisResult: {
              total: data.total,
              space_total: data.space_total || "O(1)",
              overall_explanation: data.overall_explanation || "",
              lines: data.lines || [],
              call_graph: data.call_graph || {},
              is_recursive: data.is_recursive || false
            },
            lineExecutions: (prev) => ({ ...prev, ...initialCounts }), syntaxErrors: [],
          });
        } else {
          updateTab(tabId, { syntaxErrors: [{ line: data.line, message: `${data.message}. ${translatePythonError(data.message)}` }] });
        }
        return;
      } catch (error) { console.warn("Online analysis failed, safely falling back locally.", error); }
    }
    if (workerRef.current) workerRef.current.postMessage({ type: "ANALYZE_CODE", code: cleanCode });
  };

  const handleBlocklyChange = (tabId, json, pythonCode) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const oldCode = (tab.pythonCode || "").trim();
    const newCode = (pythonCode || "").trim();

    const canMarkDirty = Date.now() > (tab.ignoreDirtyUntil || 0);

    if (!tab.isEditingCode) {
      if (oldCode !== newCode) analyzeCode(tabId, newCode);
      updateTab(tabId, { 
        blocklyJson: json, 
        pythonCode: newCode,
        ...(canMarkDirty ? { isDirty: true } : {})
      });
    } else {
      updateTab(tabId, { 
        blocklyJson: json,
        ...(canMarkDirty ? { isDirty: true } : {})
      });
    }
  };

  useEffect(() => {
    if (isEngineReady && activeTab.pythonCode !== "# Drag blocks to generate Python code" && activeTab.isEditingCode) {
      const timeoutId = setTimeout(() => analyzeCode(activeTabId, activeTab.pythonCode), 800);
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab.pythonCode, activeTab.isEditingCode, isOnline, activeTabId, isEngineReady]);

  const handleSyncToBlocks = async () => {
    const hasErrors = activeTab.syntaxErrors && activeTab.syntaxErrors.length > 0;
    if (hasErrors) { showToast("Cannot sync to blocks. Please fix Python syntax errors first.", "error"); return; }
    if (workspaceRefs.current[activeTabId] && activeTab.pythonCode) {
      try {
        const cleanCode = sanitizePythonCode(activeTab.pythonCode);
        await workspaceRefs.current[activeTabId].loadFromPython(cleanCode);
        updateTab(activeTabId, { isEditingCode: false, viewMode: "workspace" });
        showToast("Code successfully synced to Blocks", "success");
      } catch (e) { showToast(`Sync Failed: ${e.message}`, "error"); }
    }
  };

  const handleClear = () => {
    setModalConfig({
      isOpen: true, title: "Clear Workspace?", message: "Are you sure you want to clear? All unsaved progress will be lost.",
      confirmText: "Clear", isDanger: true, onConfirmAction: () => {
        closeModal();
        if (workspaceRefs.current[activeTabId]) {
          workspaceRefs.current[activeTabId].clear();
          updateTab(activeTabId, {
            pythonCode: "# Drag blocks to generate Python code", blocklyJson: null,
            analysisResult: { lines: [], total: "O(1)", space_total: "O(1)", overall_explanation: "", is_recursive: false, call_graph: {} },
            analysisTime: "0.0", lineExecutions: {}, syntaxErrors: [],
            currentLoadedId: null, title: "Untitled Project", saveType: "project",
            isDirty: false,
            ignoreDirtyUntil: Date.now() + 1200
          });
        }
      },
    });
  };

  const handleRunCode = async () => {
    if (isEvaluating) return;
    if (!isEngineReady) {
      showToast(engineProgress?.stage ? `Still preparing the Python engine (${engineProgress.stage})` : "The Python engine is still loading. Please wait a moment.", "error");
      return;
    }
    if (!activeTab.pythonCode || activeTab.pythonCode.trim() === "" || activeTab.pythonCode === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); focusDockPanel("console"); setConsoleTab("output"); return;
    }
    clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
    setIsEvaluating(true); updateTab(activeTabId, { lineExecutions: {} });
    focusDockPanel("console"); setConsoleTab("output"); setConsoleOutput((prev) => prev + "\n> Running the program...\n");

    outputCountRef.current = 0; pendingOutputRef.current = "";
    renderIntervalRef.current = setInterval(() => {
      if (pendingOutputRef.current) { setConsoleOutput((prev) => prev + pendingOutputRef.current); pendingOutputRef.current = ""; }
    }, 100);

    const safePayload = sanitizePythonCode(activeTab.pythonCode);
    workerRef.current.postMessage({ type: "RUN_CODE", code: safePayload });

    runTimeoutRef.current = setTimeout(() => {
      resetWorker();
      const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
      setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
      setIsEvaluating(false); setIsWaitingForInput(false);
    }, 10000);
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: "INPUT_RESPONSE", data: userInput });
      outputCountRef.current = 0; setUserInput(""); setIsWaitingForInput(false);
      renderIntervalRef.current = setInterval(() => {
        if (pendingOutputRef.current) { setConsoleOutput((prev) => prev + pendingOutputRef.current); pendingOutputRef.current = ""; }
      }, 100);
      runTimeoutRef.current = setTimeout(() => {
        resetWorker();
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput((prev) => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false); setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const openSaveModal = () => {
    if (!activeTab.blocklyJson && (!activeTab.pythonCode || activeTab.pythonCode === "# Drag blocks to generate Python code")) {
      showToast("The workspace is empty. Nothing to save!", "error"); return;
    }
    if (!getUser()) { showToast("You must be logged in to save.", "error"); return; }
    if (isGuest) { showToast("Guest accounts cannot save projects or templates.", "error"); return; }
    setSaveModal({
      isOpen: true, isEditMetadataOnly: false, editingId: activeTab.currentLoadedId, editingData: null,
      title: activeTab.title !== "Untitled Project" ? activeTab.title : "",
      description: "", category: "Custom Templates", saveType: activeTab.saveType || "project",
    });
  };

  const openSaveModalRef = useRef(openSaveModal);
  useEffect(() => { openSaveModalRef.current = openSaveModal; }, [openSaveModal]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); openSaveModalRef.current(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExportJson = () => {
    const hasBlocks = activeTab.blocklyJson && Object.keys(activeTab.blocklyJson).length > 0;
    const hasCode = activeTab.pythonCode && activeTab.pythonCode !== "# Drag blocks to generate Python code";
    if (!hasBlocks && !hasCode) { showToast("The workspace is empty. Nothing to export!", "error"); return; }

    const exportPayload = {
      type: "algoblocks_project", version: "1.0",
      title: activeTab.title !== "Untitled Project" ? activeTab.title : "algoblocks_workspace",
      blocklyJson: activeTab.blocklyJson || {}, pythonCode: activeTab.pythonCode || "",
    };
    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.href = url; downloadAnchorNode.download = `${exportPayload.title}.json`;
    document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); document.body.removeChild(downloadAnchorNode);

    setTimeout(() => { URL.revokeObjectURL(url); }, 150);
    showToast("Workspace exported as JSON", "success");
  };

  const handleImportJson = (event) => {
    if (isGuest) {
      showToast("Guest accounts cannot import workspace files.", "error");
      event.target.value = "";
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        let blocks = json; let pythonCode = "# Drag blocks to generate Python code"; let title = file.name.replace(".json", "");
        if (json.type === "algoblocks_project") { blocks = json.blocklyJson; pythonCode = json.pythonCode; title = json.title || title; }
        else if (json.workspace && json.workspace.blocklyJson) { blocks = json.workspace.blocklyJson; pythonCode = json.pythonCode || pythonCode; }

        if (workspaceRefs.current[activeTabId]) {
          workspaceRefs.current[activeTabId].loadTemplate(blocks);
          updateTab(activeTabId, { 
            title: title, 
            saveType: "project", 
            pythonCode: pythonCode, 
            isEditingCode: pythonCode !== "# Drag blocks to generate Python code",
            isDirty: false,
            ignoreDirtyUntil: Date.now() + 1200
          });
          showToast("Workspace imported successfully", "success");
        }
      } catch (err) { showToast("Invalid JSON file format", "error"); }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleEditItem = (e, item) => {
    e.stopPropagation();
    if (isGuest) {
      showToast("Guest accounts cannot edit projects or templates.", "error");
      return;
    }
    setSaveModal({
      isOpen: true, isEditMetadataOnly: true, editingId: item._id, editingData: item.data,
      title: item.title, description: item.description || "", category: item.category || "Custom Templates",
      saveType: item.saveType || "project",
    });
  };

  const submitSave = async () => {
    const user = getUser();
    if (!user) { showToast("Error: You must be logged in to save.", "error"); return; }
    if (user.isGuest) { showToast("Error: Guest accounts cannot save.", "error"); return; }

    const id = saveModal.editingId || (saveModal.saveType === "template" ? `local_tpl_${Date.now()}` : `local_proj_${Date.now()}`);
    const nowMs = Date.now();
    const payload = {
      _id: id, title: saveModal.title, name: saveModal.title, description: saveModal.description,
      category: saveModal.saveType === "template" ? saveModal.category : undefined,
      data: saveModal.isEditMetadataOnly ? saveModal.editingData : activeTab.blocklyJson,
      workspace: { blocklyJson: saveModal.isEditMetadataOnly ? saveModal.editingData : activeTab.blocklyJson },
      pythonCode: activeTab.pythonCode || "",
      owner_id: user.email, userId: user.email, synced: false, isSynced: false, updatedAt: nowMs,
    };

    const db = saveModal.saveType === "template" ? templatesDB : projectsDB;
    await db.setItem(id, payload);

    if (navigator && navigator.onLine && user.email && API_BASE) {
      try {
        const endpoint = saveModal.saveType === "template" ? "/api/templates/save" : "/api/projects/save";
        const fallbackEndpoint = saveModal.saveType === "template" ? "/api/templates" : "/api/projects";
        
        // Strip string IDs before sending to Postgres to prevent 500 errors
        const apiPayload = saveModal.saveType === "template"
          ? { templateId: String(id).startsWith("local_") ? null : id, userId: user.email, name: saveModal.title, description: saveModal.description, category: saveModal.category, workspace: { blocklyJson: payload.data } }
          : { projectId: String(id).startsWith("local_") ? null : id, userId: user.email, name: saveModal.title, workspace: { blocklyJson: payload.data }, pythonCode: activeTab.pythonCode || "" };
        
        let res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(apiPayload) });
        if (res.status === 404) {
           res = await fetch(`${API_BASE}${fallbackEndpoint}`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(apiPayload) });
        }

        if (res.status === 403) {
          // Account has hit its project/template limit -- this is a real,
          // final rejection, not a connectivity issue, so don't fall back
          // to an offline save+retry (that would just keep failing forever
          // and give the false impression the save succeeded). Also remove
          // the local copy written above so it doesn't linger as an
          // orphaned item that some later background sync keeps retrying.
          let limitMessage = `You've reached the maximum number of ${saveModal.saveType === "template" ? "templates" : "projects"} allowed per account.`;
          try {
            const errData = await res.json();
            if (errData?.detail) limitMessage = errData.detail;
          } catch (e) {}
          await db.removeItem(id);
          showToast(limitMessage, "error");
          return;
        }

        if (res.ok) {
          let responseData = {};
          try { responseData = await res.json(); } catch(e) {}
          
          const realId = responseData.projectId || responseData.templateId || responseData._id || id;
          payload._id = realId; payload.synced = true; payload.isSynced = true;
          if (String(realId) !== String(id)) await db.removeItem(id);
          await db.setItem(realId, payload);
          
          showToast(saveModal.isEditMetadataOnly ? "Details updated successfully!" : "Saved directly to cloud!", "success");
          setSaveModal((prev) => ({ ...prev, isOpen: false }));
          
          if (!saveModal.isEditMetadataOnly) {
            updateTab(activeTabId, { title: saveModal.title, currentLoadedId: realId, saveType: saveModal.saveType, isDirty: false, ignoreDirtyUntil: Date.now() + 1200 });
          }
          
          window.dispatchEvent(new Event("localDataSynced"));
          fetchTemplates(); 
          return;
        } else {
           console.warn("API direct save returned non-OK. Queuing offline mode.");
        }
      } catch (err) { console.warn("Direct save degraded offline:", err); }
    }

    // Safely fallback and close the modal even if offline
    showToast(saveModal.isEditMetadataOnly ? "Details updated locally. Background sync queued." : "Saved locally. Background sync queued.", "success");
    setSaveModal((prev) => ({ ...prev, isOpen: false }));
    
    if (!saveModal.isEditMetadataOnly) {
      updateTab(activeTabId, { title: saveModal.title, currentLoadedId: id, saveType: saveModal.saveType, isDirty: false, ignoreDirtyUntil: Date.now() + 1200 });
    }
    
    window.dispatchEvent(new Event("localDataSynced"));
    if (syncManager?.processSyncQueue) {
       syncManager.processSyncQueue();
    }
    
    fetchTemplates();
  };

  const handleDeleteItem = async (e, item) => {
    e.stopPropagation();
    if (isGuest) {
      showToast("Guest accounts cannot delete projects or templates.", "error");
      return;
    }
    const itemLabel = item.saveType === "template" ? "Template" : "Project";
    if (!window.confirm(`Are you sure you want to delete this ${itemLabel}?`)) return;

    setAllTemplates((prev) => prev.filter((t) => String(t._id) !== String(item._id)));
    try {
      if (item.saveType === "template") {
          await syncManager.queueTemplateDeletion(item._id);
      } else {
          await syncManager.queueProjectDeletion(item._id);
      }

      showToast(`${itemLabel} deleted locally!`, "success");
      tabs.forEach((t) => {
        if (String(t.currentLoadedId) === String(item._id)) {
          workspaceRefs.current[t.id]?.clear();
          updateTab(t.id, { currentLoadedId: null, title: "Untitled Project", isDirty: false });
        }
      });
      window.dispatchEvent(new Event("localDataSynced"));
      if (syncManager?.processSyncQueue) syncManager.processSyncQueue();
    } catch (err) { 
      showToast("Error deleting item.", "error"); 
      fetchTemplates(); 
    }
  };

  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model && activeTab?.syntaxErrors) {
        const errors = activeTab.syntaxErrors || [];
        const markers = errors.map(err => ({
          startLineNumber: err.line || 1, startColumn: 1, endLineNumber: err.line || 1, endColumn: 1000,
          message: err.message, severity: monacoRef.current.MarkerSeverity.Error,
        }));
        monacoRef.current.editor.setModelMarkers(model, "owner", markers);
      }
    }
  }, [activeTab?.syntaxErrors, activeTabId]);

  const filteredTemplates = allTemplates.filter((t) => String(t.title || "").toLowerCase().includes(String(searchTerm || "").toLowerCase()));
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {});

  // Every panel that DockableWorkspace can dock/redock. Blockly stays
  // mounted for every tab (not just the active one) exactly as before —
  // BlocklyWorkspace's own ResizeObserver keeps it correctly sized no
  // matter which region it ends up docked in.
  const dockPanels = [
    {
      id: "blockly",
      title: "Blocks",
      icon: <FiGrid size={14} />,
      content: (
        <div className="workspace-view" style={{ width: "100%", height: "100%" }}>
          {tabs.map((tab) => (
            <div key={tab.id} className={activeTabId === tab.id ? "d-block" : "d-none"} style={{ width: "100%", height: "100%" }}>
              <BlocklyWorkspace
                initialJson={tab.blocklyJson}
                ref={(el) => (workspaceRefs.current[tab.id] = el)}
                onChange={(json, py) => handleBlocklyChange(tab.id, json, py)}
              />
            </div>
          ))}
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
          pythonCode={activeTab.pythonCode}
          isEditingCode={activeTab.isEditingCode}
          syntaxErrors={activeTab.syntaxErrors || []}
          onSyncToBlocks={handleSyncToBlocks}
          onChangeCode={(value) => {
            const cleanValue = sanitizePythonCode(value);
            updateTab(activeTabId, { pythonCode: cleanValue, isEditingCode: true, syntaxErrors: [], isDirty: true });
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
          pythonCode={activeTab.pythonCode}
          lineExecutions={activeTab.lineExecutions}
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
          analysisResult={activeTab.analysisResult}
          analysisTime={activeTab.analysisTime}
          defaultWeight={0}
        />
      ),
    },
  ];

  return (
    <div className="workspace-app-container">
      <ConfirmModal isOpen={leaveModal.isOpen} title="Unsaved Changes" message="You have unsaved changes in your workspace. Are you sure you want to leave? All unsaved progress will be lost." confirmText="Leave Workspace" cancelText="Stay" isDanger={true} onCancel={cancelLeaveSite} onConfirm={confirmLeaveSite} />
      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} isDanger={modalConfig.isDanger} onCancel={closeModal} onConfirm={modalConfig.onConfirmAction} />

      {toast.show && <div className={`toast-notification ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.message}</div>}

      {saveModal.isOpen && (
        <div className="modal-overlay">
          <div className="save-modal-content">
            <h2 className="save-modal-title">{saveModal.isEditMetadataOnly ? "Edit Details" : "Save Workspace"}</h2>
            <div className="save-type-selector">
              <label className={saveModal.editingId ? "disabled" : ""}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === "project"} onChange={() => setSaveModal({ ...saveModal, saveType: "project" })} /> Project (Dashboard)
              </label>
              <label className={saveModal.editingId ? "disabled" : ""}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === "template"} onChange={() => setSaveModal({ ...saveModal, saveType: "template" })} /> Template (Sidebar)
              </label>
            </div>
            <div className="save-modal-form">
              <div>
                <label className="save-modal-label">Name</label>
                <input type="text" value={saveModal.title} onChange={(e) => setSaveModal({ ...saveModal, title: e.target.value })} className="save-modal-input" />
              </div>
              {saveModal.saveType === "template" && (
                <div>
                  <label className="save-modal-label">Category</label>
                  <input type="text" value={saveModal.category} onChange={(e) => setSaveModal({ ...saveModal, category: e.target.value })} className="save-modal-input" />
                </div>
              )}
              <div>
                <label className="save-modal-label">Description</label>
                <textarea value={saveModal.description} onChange={(e) => setSaveModal({ ...saveModal, description: e.target.value })} className="save-modal-textarea" />
              </div>
            </div>
            <div className="save-modal-actions">
              <button onClick={() => setSaveModal({ ...saveModal, isOpen: false })} className="save-modal-cancel-btn">Cancel</button>
              <button onClick={submitSave} className="save-modal-confirm-btn">Save</button>
            </div>
          </div>
        </div>
      )}

      <WorkspaceHeader 
        viewMode={activeTab.viewMode} 
        setViewMode={(mode) => { updateTab(activeTabId, { viewMode: mode }); focusDockPanel(mode === "python" ? "python" : "blockly"); }} 
        runCode={handleRunCode} 
        handleExport={handleExportJson} 
        handleImport={handleImportJson} 
        handleSaveToDB={openSaveModal} 
        currentProjectId={activeTab.currentLoadedId} 
        currentProjectTitle={activeTab.title} 
        isEngineReady={isEngineReady}
        engineProgress={engineProgress}
        handleUpdateDB={openSaveModal} 
        isEvaluating={isEvaluating} 
        isAdmin={isAdmin}
        isGuest={isGuest}
        tour={workspaceTour}
        tourPageId="workspace"
      />

      <Split className={`workspace-split ${!isSidebarVisible ? "sidebar-hidden" : ""}`} sizes={[20, 80]} minSize={[isSidebarVisible ? 250 : 0, 400]} gutterSize={8}>
        <aside className="templates-sidebar">
          <div className="sidebar-search">
            <FiSearch className="search-icon" size={18} />
            <input type="text" placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="sidebar-list">
            {Object.keys(groupedTemplates).map((category) => (
              <div key={category} className="sidebar-category-group">
                <h3 className="sidebar-category-header">{category}</h3>
                {groupedTemplates[category].map((item) => (
                  <div key={item._id || item.title} className={`sidebar-card ${item.isSystem ? "system-card" : "custom-card"}`} onClick={() => loadConfirm(item)}>
                    <div className="sidebar-card-header">
                      <div className="title-wrapper">
                        {item.isSystem ? <FiLayers className="card-type-icon" /> : <FiFolder className="card-type-icon" />}
                        <h4>{item.title}</h4>
                      </div>
                      {item.isSystem ? (
                        <span className="badge-system-polished"><span className="dot"></span> System</span>
                      ) : (
                        <div className="badge-custom-group-polished">
                          <span className="badge-custom-polished">{item.saveType === "project" ? "Project" : "Custom"}</span>
                          <button onClick={(e) => handleEditItem(e, item)} className="sidebar-edit-btn-polished" title="Edit"><FiEdit2 size={14} /></button>
                          <button onClick={(e) => handleDeleteItem(e, item)} className="sidebar-delete-btn-polished" title="Delete"><FiTrash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            ))}
            {filteredTemplates.length === 0 && <p className="no-results">No templates found.</p>}
          </div>
        </aside>

        <main className="workspace-main">
          <button className={`sidebar-toggle-btn ${!isSidebarVisible ? "closed" : ""}`} onClick={() => setIsSidebarVisible(!isSidebarVisible)} title="Toggle Sidebar">
            <FiChevronRight className="toggle-icon" size={16} />
          </button>

          <div className="editor-tab-bar">
            {tabs.map((tab) => (
              <div key={tab.id} className={`editor-tab ${activeTabId === tab.id ? "active" : ""}`} onClick={() => setActiveTabId(tab.id)}>
                <span className="tab-indicator">
                  {tab.viewMode === "python" ? <FiTerminal size={14} /> : <FiGrid size={14} />}
                </span>
                <span className="tab-title">{tab.title} {tab.isDirty && "*"}</span>
                <button className="tab-close-btn" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}><FiX size={12} /></button>
              </div>
            ))}
            <button className="new-tab-btn" onClick={createNewTab}><FiPlus size={18} /></button>
          </div>

          <div className="editor-split-vertical">
            <div className="editor-container">
              <DockableWorkspace
                ref={dockRef}
                layoutKey="mainapp-workspace"
                panels={dockPanels}
                defaultLayout={DEFAULT_DOCK_LAYOUT}
                onLayoutChange={({ openPanelIds: ids }) => setOpenPanelIds(ids)}
              />
            </div>
          </div>

          <WorkspaceFooterBar
            openPanelIds={openPanelIds}
            onTogglePanel={toggleDockPanel}
            onOpenBigOModal={() => setIsBigOModalOpen(true)}
            onOpenBlockGlossary={() => setIsBlockGlossaryOpen(true)}
          >
            <button className="footer-action-icon reset-layout-btn" onClick={() => dockRef.current?.reset()} title="Restore the default panel layout and sizes">
              <FiLayers size={16} /> Reset Workspace Layout
            </button>
            <button className="footer-action-icon clear-btn" onClick={handleClear} title="Clear Current Tab Workspace">
              <FiTrash2 size={16} /> Clear Workspace
            </button>
          </WorkspaceFooterBar>
        </main>
      </Split>
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
      <BlockGlossaryModal isOpen={isBlockGlossaryOpen} onClose={() => setIsBlockGlossaryOpen(false)} />
    </div>
  );
}