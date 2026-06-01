// frontend/src/pages/MainApp.jsx
import DOMPurify from "dompurify";
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from '../components/ComplexityGraph.jsx';
import ConfirmModal from "../components/ConfirmModal.jsx";
import MemoryVisualizer from "../components/MemoryVisualizer.jsx";
import WorkspaceHeader from "../components/WorkspaceHeader.jsx";
import { projectsDB, syncQueueDB, templatesDB } from '../db.js';
import "../styles/MainApp.css";
import { formatComplexity } from "../utils/formatters";

import Editor from "@monaco-editor/react";
import { usePyodide } from "../context/PyodideContext.jsx";
import { translatePythonError } from "../utils/errorTranslator.js";

const handleEditorWillMount = (monaco) => {
  monaco.editor.defineTheme('algoblocks-purple', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1C1236',
      'editor.foreground': '#EBE4FF',
      'editorLineNumber.foreground': '#6C5CE7',
      'editor.lineHighlightBackground': '#2D234A',
      'editorCursor.foreground': '#FFFFFF',
      'editor.selectionBackground': '#6C5CE755',
      'editor.inactiveSelectionBackground': '#6C5CE733'
    }
  });
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
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, '');
  if (comp.includes("n!") || comp.includes("n*t(n-1)")) return 9;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("t(n-1)+t(n-2)")) return 8;
  if (comp.includes("n^3") || comp.includes("n³")) return 7;
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("t(n-1)+o(n)")) return 6;
  if (comp.includes("nlogn") || comp.includes("2t(n/2)+o(n)") || comp.includes("t(n-1)+o(logn)")) return 5;
  if (comp.includes("v+e")) return 4.5;
  if (comp.includes("o(n)") || comp.includes("o(m)") || comp.includes("2t(n/2)+o(1)") || comp.includes("t(n/2)+o(n)") || comp.includes("t(n-1)+o(1)")) return 4;
  if (comp.includes("√n") || comp.includes("sqrt")) return 3;
  if (comp.includes("logn") || comp.includes("log") || comp.includes("t(n/2)+o(1)")) return 2;
  if (comp.includes("o(1)")) return 1;
  return 0;
};

const formatExplanation = (text, isBottleneck, isLocalTab) => {
  if (!text) return null;
  const sections = text.split(/\n\n+/);

  return sections.map((sec, idx) => {
    const trimmedSec = sec.trim();
    if (!trimmedSec) return null;

    if (trimmedSec.startsWith("Architectural Insights:")) {
      const lines = trimmedSec.split("\n").slice(1);
      return (
        <div key={idx} style={{ marginTop: '12px', marginBottom: '12px', padding: '10px 14px', backgroundColor: 'rgba(52, 152, 219, 0.08)', borderLeft: '4px solid #3498db', borderRadius: '0 6px 6px 0' }}>
          <strong style={{ display: 'block', color: '#2980b9', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Architectural Insights</strong>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e293b', fontSize: '0.85rem', lineHeight: '1.5' }}>
            {lines.map((l, i) => <li key={i}>{l.replace("- ", "")}</li>)}
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
    return <p key={idx} style={{ color: '#1e293b', margin: '0 0 10px 0', fontSize: '0.9rem', lineHeight: '1.6' }} dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(parsedSec)}}></p>;
  }).filter(Boolean);
};

// HELPER: Centralized Token & User Retrieval
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
const getUser = () => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
};
const getAuthHeaders = () => {
    const token = getToken();
    return token ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } : { "Content-Type": "application/json" };
};

export default function MainApp() {
  const location = useLocation();
  const API_BASE = import.meta.env.VITE_API_URL || "";

  // Hook into the global Pyodide Context
  const { worker, isEngineReady, resetWorker } = usePyodide();

  const createInitialTab = () => ({
    id: `tab-${Date.now()}`, title: 'Untitled Project', viewMode: 'workspace', blocklyJson: null,
    pythonCode: "# Drag blocks to generate Python code", isEditingCode: false, syntaxError: null,
    analysisResult: { lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false },
    lineExecutions: {}, analysisTime: "0.0", currentLoadedId: null, saveType: "project"
  });

  const [tabs, setTabs] = useState([createInitialTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [bottomPanel, setBottomPanel] = useState(null); 
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...\n");
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [consoleTab, setConsoleTab] = useState("output");
  const [activeComplexityTab, setActiveComplexityTab] = useState("local");
  const [expandedLines, setExpandedLines] = useState({});

  const [allTemplates, setAllTemplates] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", isDanger: false, onConfirmAction: null });
  const [saveModal, setSaveModal] = useState({
    isOpen: false, isEditMetadataOnly: false, editingId: null, editingData: null,
    title: "", description: "", category: "Custom Templates", saveType: "project"
  });
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);

  const workspaceRefs = useRef({});
  const consoleEndRef = useRef(null);
  const workerRef = useRef(null);
  const runTimeoutRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const analyzingTabId = useRef(activeTabId);
  const hasLoadedInitRef = useRef(false);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateTab = (id, updates) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });
  const toggleLine = (index) => setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));

  const initWorker = () => {
    if (!workerRef.current) return;

    workerRef.current.onmessage = (event) => {
      const { type, data, counts } = event.data;

      if (type === 'ANALYZE_RESULT') {
        const targetId = analyzingTabId.current;
        if (data.status === "success") {
          const initialCounts = {};
          (data.lines || []).forEach(l => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });

          updateTab(targetId, {
            analysisTime: data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00",
            analysisResult: { total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false },
            lineExecutions: prev => ({...prev, ...initialCounts}),
            syntaxError: null
          });
        } else {
          const hint = translatePythonError(data.message);
          updateTab(targetId, { syntaxError: { line: data.line, message: `${data.message}. ${hint}` } });
        }
      }
      else if (type === 'RUN_RESULT') {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        const resultData = (data !== undefined && data !== null && data !== "") ? `\n${String(data)}` : "";
        setConsoleOutput(prev => prev + flushed + resultData + "\n> Program finished.\n");
        
        if (counts) updateTab(analyzingTabId.current, { lineExecutions: counts });
        
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
      else if (type === 'OUTPUT') {
        outputCountRef.current += 1;
        pendingOutputRef.current += data;
        if (outputCountRef.current > 5000) {
          clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
          resetWorker();
          const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
          setConsoleOutput(prev => prev + flushed + "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n");
          setIsEvaluating(false); setIsWaitingForInput(false); outputCountRef.current = 0;
        }
      }
      else if (type === 'INPUT_REQUEST') {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput(prev => prev + flushed + data.prompt);
        setIsWaitingForInput(true);
      }
      else if (type === 'ERROR') {
        clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        const hint = translatePythonError(data);
        setConsoleOutput(prev => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        setIsEvaluating(false); setIsWaitingForInput(false);
      }
    };
  };

  useEffect(() => {
    if (worker) {
      workerRef.current = worker;
      initWorker(); 
    }
  }, [worker]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); showToast("Connection restored.", "success"); };
    const handleOffline = () => { setIsOnline(false); showToast("Connection lost. Using local Pyodide.", "error"); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline);
      clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (workspaceRefs.current[activeTabId] && activeTab?.viewMode === 'workspace') {
      setTimeout(() => { workspaceRefs.current[activeTabId].resize(); }, 50);
    }
  }, [activeTabId, activeTab?.viewMode]);

  useEffect(() => {
    if (consoleEndRef.current && consoleTab === 'output') consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [consoleOutput, isWaitingForInput, consoleTab]);

  useEffect(() => {
    if (hasLoadedInitRef.current || !workspaceRefs.current[activeTabId]) return;
    if (location.state?.projectToLoad) {
      hasLoadedInitRef.current = true;
      const proj = location.state.projectToLoad;
      updateTab(activeTabId, {
        currentLoadedId: proj._id, title: proj.title || proj.name, saveType: "project"
      });
      setTimeout(() => { workspaceRefs.current[activeTabId].loadTemplate(proj.data || proj.workspace?.blocklyJson); }, 500);
    } else if (location.state?.templatePath) {
      hasLoadedInitRef.current = true;
      setTimeout(async () => {
        try {
          const response = await fetch(`/templates/${location.state.templatePath}.json`);
          if (response.ok) {
            const json = await response.json();
            workspaceRefs.current[activeTabId].loadTemplate(json);
            updateTab(activeTabId, { currentLoadedId: null, saveType: "project" });
          }
        } catch (e) { console.error("Failed to load template", e); }
      }, 500);
    }
  }, [location.state]);

  const fetchTemplates = async () => {
    const baseTemplates = SIDEBAR_TEMPLATES.map(t => ({ ...t, title: t.name, description: t.desc, isSystem: true }));
    try {
      const user = getUser();
      if (!user) { setAllTemplates(baseTemplates); return; }

      if (navigator.onLine && API_BASE) {
        try {
          // FIX: Add auth headers to fetch requests to prevent silent 401s
          const headers = getAuthHeaders();
          
          const pRes = await fetch(`${API_BASE}/api/projects?userId=${user.email}`, { headers });
          if (pRes.ok) {
            const pData = await pRes.json();
            const cloudProjects = pData.projects || pData || [];
            for (const cp of cloudProjects) {
               if (cp.owner_id === user.email || cp.userId === user.email) {
                   await projectsDB.setItem(cp._id, { ...cp, synced: true });
               }
            }
          }
          const tRes = await fetch(`${API_BASE}/api/templates?userId=${user.email}`, { headers });
          if (tRes.ok) {
            const tData = await tRes.json();
            const cloudTemplates = tData.templates || tData || [];
            for (const ct of cloudTemplates) {
                if (ct.owner_id === user.email || ct.userId === user.email) {
                    await templatesDB.setItem(ct._id, { ...ct, synced: true });
                }
            }
          }
        } catch (e) { console.error("MainApp cloud sync failed:", e); }
      }
      
      let customItems = [];
      await projectsDB.iterate((value) => { 
        if (value.owner_id === user.email || value.userId === user.email) {
            customItems.push({ 
                _id: value._id, title: value.title || value.name || "Untitled Project", 
                description: value.description || "Saved Project", category: "My Projects", 
                isSystem: false, saveType: "project", data: value.data || value.workspace?.blocklyJson, 
                synced: value.synced 
            }); 
        }
      });
      await templatesDB.iterate((value) => { 
        if (value.owner_id === user.email || value.userId === user.email) {
            customItems.push({ 
                _id: value._id, title: value.title || value.name || "Untitled Template", 
                description: value.description || "Custom template", category: value.category || "Custom Templates", 
                isSystem: false, saveType: "template", data: value.data || value.workspace?.blocklyJson, 
                synced: value.synced 
            }); 
        }
      });

      const uniqueItemsMap = new Map();
      customItems.forEach(item => uniqueItemsMap.set(item._id, item));
      setAllTemplates([...baseTemplates, ...Array.from(uniqueItemsMap.values())]);
    } catch (e) { setAllTemplates(baseTemplates); }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const createNewTab = () => {
    const newTab = createInitialTab();
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (id) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (filtered.length === 0) {
        const newTab = createInitialTab();
        setActiveTabId(newTab.id);
        return [newTab];
      }
      if (activeTabId === id) setActiveTabId(filtered[filtered.length - 1].id);
      return filtered;
    });
    delete workspaceRefs.current[id];
  };

  const executeLoad = async (item) => {
    try {
      let json;
      if (item.isSystem) {
        const response = await fetch(`/templates/${item.path}.json`);
        if (!response.ok) throw new Error("Template not found");
        json = await response.json();
      } else {
        json = item.data;
      }

      const isClean = activeTab.title === 'Untitled Project' && !activeTab.blocklyJson;
      const targetId = isClean ? activeTab.id : `tab-${Date.now()}`;

      const newTabState = {
        id: targetId, title: item.title, viewMode: 'workspace', blocklyJson: json, pythonCode: "# Drag blocks to generate Python code",
        isEditingCode: false, syntaxError: null, analysisResult: { lines: [], total: "Analyzing...", space_total: "Analyzing...", is_recursive: false },
        lineExecutions: {}, analysisTime: "...", currentLoadedId: item.isSystem ? null : item._id, saveType: item.isSystem ? "project" : (item.saveType || "project")
      };

      if (isClean) setTabs(prev => prev.map(t => t.id === targetId ? newTabState : t));
      else { setTabs(prev => [...prev, newTabState]); setActiveTabId(targetId); }

      setTimeout(() => { if (workspaceRefs.current[targetId]) workspaceRefs.current[targetId].loadTemplate(json); }, 100);

    } catch (error) { showToast("Failed to load template", "error"); }
  };

  const loadConfirm = (item) => {
    setModalConfig({ isOpen: true, title: `Load ${item.title}?`, message: "This will open the template in your workspace.", confirmText: "Load", isDanger: false, onConfirmAction: () => { closeModal(); executeLoad(item); } });
  };

  const analyzeCode = async (tabId, code) => {
    if (!code || code.trim() === "" || code === "# Drag blocks to generate Python code") return;
    analyzingTabId.current = tabId;

    if (isOnline && API_BASE) {
      try {
        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ code })
        });
        if (!response.ok) throw new Error("FastAPI analyze failed");
        const data = await response.json();

        if (data.status === "success") {
          const initialCounts = {};
          (data.lines || []).forEach(l => { if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits; });
          updateTab(tabId, {
            analysisTime: data.analysis_time_ms ? data.analysis_time_ms.toFixed(2) : "0.00",
            analysisResult: { total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false },
            lineExecutions: prev => ({...prev, ...initialCounts}), syntaxError: null
          });
        } else {
          const hint = translatePythonError(data.message);
          updateTab(tabId, { syntaxError: { line: data.line, message: `${data.message}. ${hint}` } });
        }
        return; 
      } catch (error) { console.warn("Online analysis failed, safely falling back locally.", error); }
    }
    if (workerRef.current) workerRef.current.postMessage({ type: 'ANALYZE_CODE', code });
  };

  const handleBlocklyChange = (tabId, json, pythonCode) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const oldCode = (tab.pythonCode || "").trim();
    const newCode = (pythonCode || "").trim();

    if (!tab.isEditingCode && oldCode !== newCode) {
      analyzeCode(tabId, pythonCode);
    }
    updateTab(tabId, { blocklyJson: json, pythonCode: newCode });
  };

  useEffect(() => {
    if (isEngineReady && activeTab.pythonCode !== "# Drag blocks to generate Python code" && activeTab.isEditingCode) {
      const timeoutId = setTimeout(() => analyzeCode(activeTabId, activeTab.pythonCode), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab.pythonCode, activeTab.isEditingCode, isOnline, activeTabId, isEngineReady]);

  const handleSyncToBlocks = async () => {
    if (workspaceRefs.current[activeTabId] && activeTab.pythonCode) {
      try {
        await workspaceRefs.current[activeTabId].loadFromPython(activeTab.pythonCode);
        updateTab(activeTabId, { isEditingCode: false, viewMode: "workspace" });
        showToast("Code successfully synced to Blocks");
      } catch (e) { showToast(`Sync Failed: ${e.message}`, "error"); }
    }
  };

  const handleClear = () => {
    setModalConfig({
      isOpen: true, title: "Clear Workspace?", message: "Are you sure you want to clear? All unsaved progress will be lost.", confirmText: "Clear", isDanger: true,
      onConfirmAction: () => {
        closeModal();
        if (workspaceRefs.current[activeTabId]) {
          workspaceRefs.current[activeTabId].clear();
          updateTab(activeTabId, {
            pythonCode: "# Drag blocks to generate Python code", blocklyJson: null,
            analysisResult: { lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false },
            analysisTime: "0.0", lineExecutions: {}, syntaxError: null,
            currentLoadedId: null, title: "Untitled Project", saveType: "project"
          });
          setBottomPanel(null); setExpandedLines({});
        }
      }
    });
  };

  const handleRunCode = async () => {
    if (isEvaluating) return;
    if (!activeTab.pythonCode || activeTab.pythonCode.trim() === "" || activeTab.pythonCode === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute."); setBottomPanel("console"); setConsoleTab("output"); return;
    }

    clearTimeout(runTimeoutRef.current); clearInterval(renderIntervalRef.current);
    setIsEvaluating(true);
    updateTab(activeTabId, { lineExecutions: {} });
    setBottomPanel("console"); setConsoleTab("output");
    setConsoleOutput(prev => prev + "\n> Running the program...\n");

    outputCountRef.current = 0; pendingOutputRef.current = "";
    renderIntervalRef.current = setInterval(() => {
      if (pendingOutputRef.current) {
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput(prev => prev + flushed);
      }
    }, 100);

    workerRef.current.postMessage({ type: 'RUN_CODE', code: activeTab.pythonCode });
    runTimeoutRef.current = setTimeout(() => {
      resetWorker();
      const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
      setConsoleOutput(prev => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
      setIsEvaluating(false); setIsWaitingForInput(false);
    }, 10000);
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: 'INPUT_RESPONSE', data: userInput });
      outputCountRef.current = 0; setUserInput(""); setIsWaitingForInput(false);

      renderIntervalRef.current = setInterval(() => {
        if (pendingOutputRef.current) {
          const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
          setConsoleOutput(prev => prev + flushed);
        }
      }, 100);
      runTimeoutRef.current = setTimeout(() => {
        resetWorker();
        const flushed = pendingOutputRef.current; pendingOutputRef.current = "";
        setConsoleOutput(prev => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false); setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const openSaveModal = () => {
    if (!activeTab.blocklyJson && (!activeTab.pythonCode || activeTab.pythonCode === "# Drag blocks to generate Python code")) { 
        showToast("The workspace is empty. Nothing to save!", "error"); 
        return; 
    }
    
    // FIX: Pre-check if user is logged in before opening the modal
    if (!getUser()) {
        showToast("You must be logged in to save.", "error");
        return;
    }

    setSaveModal({
      isOpen: true, isEditMetadataOnly: false, editingId: activeTab.currentLoadedId, editingData: null,
      title: activeTab.title !== "Untitled Project" ? activeTab.title : "", description: "", category: "Custom Templates", saveType: activeTab.saveType
    });
  };

  const handleExportJson = () => {
    if (!activeTab.blocklyJson) { showToast("The workspace is empty. Nothing to export!", "error"); return; }
    const jsonString = JSON.stringify(activeTab.blocklyJson, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.href = url;
    downloadAnchorNode.download = `${activeTab.title !== "Untitled Project" ? activeTab.title : "algoblocks_workspace"}.json`;
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
    showToast("Workspace exported as JSON", "success");
  };

  const handleEditItem = (e, item) => {
    e.stopPropagation();
    setSaveModal({
      isOpen: true, isEditMetadataOnly: true, editingId: item._id, editingData: item.data,
      title: item.title, description: item.description || "", category: item.category || "Custom Templates", saveType: item.saveType || "project"
    });
  };

  const submitSave = async () => {
    // FIX: Get user explicitly handling both Session and Local storage
    const user = getUser();
    if (!user) {
        showToast("Error: You must be logged in to save.", "error");
        return;
    }
    
    const id = saveModal.editingId || (saveModal.saveType === 'template' ? `local_tpl_${Date.now()}` : `local_proj_${Date.now()}`);
    
    const payload = { 
        _id: id, title: saveModal.title, name: saveModal.title, description: saveModal.description, 
        category: saveModal.saveType === 'template' ? saveModal.category : undefined, 
        data: saveModal.isEditMetadataOnly ? saveModal.editingData : activeTab.blocklyJson, 
        workspace: { blocklyJson: saveModal.isEditMetadataOnly ? saveModal.editingData : activeTab.blocklyJson },
        owner_id: user.email, userId: user.email, synced: false, updatedAt: Date.now() 
    };

    const db = saveModal.saveType === 'template' ? templatesDB : projectsDB;
    await db.setItem(id, payload);

    if (navigator.onLine && user.email && API_BASE) {
        try {
            const endpoint = saveModal.saveType === 'template' ? '/api/templates/save' : '/api/projects/save';
            const apiPayload = saveModal.saveType === 'template' 
              ? { templateId: id.startsWith('local_') ? null : id, userId: user.email, name: saveModal.title, description: saveModal.description, category: saveModal.category, workspace: { blocklyJson: payload.data } }
              : { projectId: id.startsWith('local_') ? null : id, userId: user.email, name: saveModal.title, workspace: { blocklyJson: payload.data }, pythonCode: activeTab.pythonCode || "" };

            // FIX: Add strictly defined auth headers
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST', 
                headers: getAuthHeaders(), 
                body: JSON.stringify(apiPayload)
            });

            if (res.ok) {
                const responseData = await res.json();
                const realId = responseData.projectId || responseData.templateId || responseData._id || id;
                payload._id = realId; payload.synced = true;

                if (realId !== id) await db.removeItem(id); 
                await db.setItem(realId, payload);
                
                showToast("Saved directly to cloud!", "success");
                setSaveModal({ ...saveModal, isOpen: false });
                if (!saveModal.isEditMetadataOnly) updateTab(activeTabId, { title: saveModal.title, currentLoadedId: realId, saveType: saveModal.saveType });
                fetchTemplates();
                return;
            } else {
                console.warn(`Server returned ${res.status}, falling back to local queue`);
            }
        } catch (err) { console.warn("Direct save failed, gracefully falling back to background queue.", err); }
    }

    await syncQueueDB.setItem(`sync_${id}_${Date.now()}`, { type: saveModal.saveType.toUpperCase(), action: 'UPSERT', data: payload });

    showToast("Saved locally. Background sync queued.");
    setSaveModal({ ...saveModal, isOpen: false });
    if (!saveModal.isEditMetadataOnly) updateTab(activeTabId, { title: saveModal.title, currentLoadedId: id, saveType: saveModal.saveType });
    fetchTemplates();
  };

  const handleDeleteItem = async (e, item) => {
    e.stopPropagation();
    const itemLabel = item.saveType === 'template' ? 'Template' : 'Project';
    if (!window.confirm(`Are you sure you want to delete this ${itemLabel}?`)) return;

    setAllTemplates(prev => prev.filter(t => t._id !== item._id));
    try {
      if (item.saveType === 'template') await templatesDB.removeItem(item._id); else await projectsDB.removeItem(item._id);
      if (item._id.startsWith('local_')) await syncQueueDB.removeItem(item._id); else await syncQueueDB.setItem(`delete_${item._id}`, { type: item.saveType.toUpperCase(), action: 'DELETE', data: { _id: item._id } });

      showToast(`${itemLabel} deleted locally!`, "success");
      tabs.forEach(t => {
        if (t.currentLoadedId === item._id) {
          workspaceRefs.current[t.id]?.clear();
          updateTab(t.id, { currentLoadedId: null, title: "Untitled Project" });
        }
      });
    } catch (err) { showToast("Error deleting item.", "error"); fetchTemplates(); }
  };

  const filteredTemplates = allTemplates.filter(t => String(t.title || "").toLowerCase().includes(String(searchTerm || "").toLowerCase()));
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template); return acc;
  }, {});

  const lines = activeTab.analysisResult?.lines || [];
  let maxWeight = 0; let bottleneckIndices = [];
  lines.forEach((line, index) => {
    const weight = getComplexityWeight(activeComplexityTab === 'local' ? (line.local_time || "O(1)") : (line.global_time || "O(1)"));
    if (weight > maxWeight) { maxWeight = weight; bottleneckIndices = [index]; }
    else if (weight === maxWeight && weight > 0) { bottleneckIndices.push(index); }
  });
  const actualBottleneckIndices = maxWeight >= 5 ? bottleneckIndices : [];
  const pythonLines = (activeTab.pythonCode || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(activeTab.lineExecutions));

  return (
    <div className="workspace-app-container">
      {toast.show && (<div className={`toast-notification ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>{toast.message}</div>)}

      {saveModal.isOpen && (
        <div className="modal-overlay">
          <div className="save-modal-content">
            <h2 className="save-modal-title">{saveModal.isEditMetadataOnly ? "Edit Details" : "Save Workspace"}</h2>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', background: '#f1f5f9', padding: '10px', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saveModal.editingId ? 'not-allowed' : 'pointer', color: saveModal.editingId ? '#94a3b8' : 'black' }}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === 'project'} onChange={() => setSaveModal({ ...saveModal, saveType: 'project' })} /> Project (Dashboard)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saveModal.editingId ? 'not-allowed' : 'pointer', color: saveModal.editingId ? '#94a3b8' : 'black' }}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === 'template'} onChange={() => setSaveModal({ ...saveModal, saveType: 'template' })} /> Template (Sidebar)
              </label>
            </div>
            <div className="save-modal-form">
              <div><label className="save-modal-label">Name</label><input type="text" value={saveModal.title} onChange={e => setSaveModal({ ...saveModal, title: e.target.value })} className="save-modal-input" /></div>
              {saveModal.saveType === 'template' && (
                <div><label className="save-modal-label">Category</label><input type="text" value={saveModal.category} onChange={e => setSaveModal({ ...saveModal, category: e.target.value })} className="save-modal-input" /></div>
              )}
              <div><label className="save-modal-label">Description</label><textarea value={saveModal.description} onChange={e => setSaveModal({ ...saveModal, description: e.target.value })} className="save-modal-textarea" /></div>
            </div>
            <div className="save-modal-actions">
              <button onClick={() => setSaveModal({ ...saveModal, isOpen: false })} className="save-modal-cancel-btn">Cancel</button>
              <button onClick={submitSave} className="save-modal-confirm-btn">Save</button>
            </div>
          </div>
        </div>
      )}

      <WorkspaceHeader
        viewMode={activeTab.viewMode} setViewMode={(mode) => updateTab(activeTabId, { viewMode: mode })}
        runCode={handleRunCode} handleExport={handleExportJson} handleSaveToDB={openSaveModal}
        currentProjectId={activeTab.currentLoadedId} currentProjectTitle={activeTab.title}
        handleUpdateDB={openSaveModal} isEvaluating={isEvaluating}
      />

      <Split className={`workspace-split ${!isSidebarVisible ? 'sidebar-hidden' : ''}`} sizes={[20, 80]} minSize={[250, 400]} gutterSize={8}>
        <aside className="templates-sidebar">
          <div className="sidebar-search">
            <img src="/assets/search-icon.png" alt="Search" className="search-icon" />
            <input type="text" placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="sidebar-list">
            {Object.keys(groupedTemplates).map(category => (
              <div key={category} className="sidebar-category-group">
                <h3 className="sidebar-category-header">{category}</h3>
                {groupedTemplates[category].map((item) => (
                  <div key={item._id || item.title} className={`sidebar-card ${item.isSystem ? 'system-card' : 'custom-card'}`} onClick={() => loadConfirm(item)}>
                    <div className="sidebar-card-header">
                      <div className="title-wrapper"><img src={item.isSystem ? "/assets/algoblocks_logo.png" : "/assets/user-icon.png"} alt="icon" className="card-type-icon" /><h4>{item.title}</h4></div>
                      {item.isSystem ? (<span className="badge-system-polished"><span className="dot"></span> System</span>) : (
                        <div className="badge-custom-group-polished">
                          <span className="badge-custom-polished">{item.saveType === 'project' ? 'Project' : 'Custom'}</span>
                          <button onClick={(e) => handleEditItem(e, item)} className="sidebar-edit-btn-polished" title="Edit" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>Edit</button>
                          <button onClick={(e) => handleDeleteItem(e, item)} className="sidebar-delete-btn-polished" title="Delete">X</button>
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
          <button className={`sidebar-toggle-btn ${!isSidebarVisible ? 'closed' : ''}`} onClick={() => setIsSidebarVisible(!isSidebarVisible)} title="Toggle Sidebar">
            <span className="toggle-icon">❮</span>
          </button>

          <div className="editor-tab-bar">
            {tabs.map(tab => (
              <div key={tab.id} className={`editor-tab ${activeTabId === tab.id ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
                <span className="tab-indicator">
                  <img src={tab.viewMode === 'python' ? "/assets/python-icon.png" : "/assets/blocks-icon.png"} alt={tab.viewMode === 'python' ? "Python" : "Blocks"} className="tab-icon" />
                </span>
                <span className="tab-title">{tab.title} {tab.isEditingCode && '*'}</span>
                <button className="tab-close-btn" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>X</button>
              </div>
            ))}
            <button className="new-tab-btn" onClick={createNewTab}>+</button>
          </div>

          <Split direction="vertical" sizes={bottomPanel ? [65, 35] : [100, 0]} minSize={bottomPanel ? [200, 150] : [200, 0]} gutterSize={bottomPanel ? 8 : 0} className="editor-split-vertical">
            <div className="editor-container" style={{ position: 'relative' }}>
              {tabs.map(tab => (
                <div key={tab.id} className={activeTabId === tab.id && tab.viewMode === 'workspace' ? 'workspace-view d-block' : 'workspace-view d-none'} style={{ height: '100%' }}>
                  <BlocklyWorkspace ref={el => workspaceRefs.current[tab.id] = el} onChange={(json, py) => handleBlocklyChange(tab.id, json, py)} syntaxError={activeTabId === tab.id ? activeTab.syntaxError : null} />
                </div>
              ))}

              <div className={activeTab.viewMode === 'python' ? 'python-view d-flex' : 'python-view d-none'}>
                <div className="python-header">
                  <span className="python-sync-status">{activeTab.isEditingCode ? "Unsaved code changes..." : "Code is synced with blocks."}</span>
                  <button onClick={handleSyncToBlocks} disabled={!activeTab.isEditingCode} className={`python-sync-btn ${activeTab.isEditingCode ? 'active' : 'disabled'}`}> Sync to Blocks </button>
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  {activeTab.syntaxError && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(231, 76, 60, 0.9)', color: 'white', padding: '6px 15px', zIndex: 10, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Syntax Error on line {activeTab.syntaxError.line}: {activeTab.syntaxError.message}</span>
                      <button onClick={() => updateTab(activeTabId, { syntaxError: null })} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                    </div>
                  )}
                  <Editor
                    height="100%" language="python" theme="algoblocks-purple" beforeMount={handleEditorWillMount}
                    value={activeTab.pythonCode}
                    onChange={(value) => { updateTab(activeTabId, { pythonCode: value || "", isEditingCode: true, syntaxError: null }); }}
                    options={{ minimap: { enabled: false }, fontSize: 15, fontFamily: "Consolas, 'Courier New', monospace", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 16 } }}
                  />
                </div>
              </div>
            </div>

            <div className="bottom-docked-panel" style={{ display: bottomPanel ? 'flex' : 'none' }}>
              <div className="panel-header">
                <span className="panel-title">{bottomPanel === 'console' ? 'Console Panel' : 'Complexity Analysis'}</span>
                <button onClick={() => setBottomPanel(null)} className="panel-close-btn">X</button>
              </div>

              <div className="panel-body">
                {bottomPanel === 'console' ? (
                  <div className="console-content-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
                    <div className="complexity-tabs">
                      <div className="tab-btn-group">
                        <button onClick={() => setConsoleTab("output")} className={`tab-btn ${consoleTab === 'output' ? 'active' : ''}`}>Terminal Output</button>
                        <button onClick={() => setConsoleTab("executions")} className={`tab-btn ${consoleTab === 'executions' ? 'active' : ''}`}>Line Executions</button>
                      </div>
                      {consoleTab === 'output' && (<button className="clear-console-btn" onClick={() => setConsoleOutput("Ready to run...\n")}>Clear</button>)}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                      {consoleTab === 'output' ? (
                        <div className="console-container">
                          <pre className="console-output">{consoleOutput}</pre>
                          {isWaitingForInput && (
                            <div className="console-input-line"><span className="console-cursor">❯</span><input autoFocus value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleSendInput} className="console-input-field" placeholder="Type here and press Enter..." /></div>
                          )}
                          <div ref={consoleEndRef} />
                        </div>
                      ) : (
                        <div className="complexity-table-wrapper" style={{ height: '100%', margin: 0, border: 'none' }}>
                          <table className="complexity-table">
                            <thead><tr><th style={{ width: '60px', textAlign: 'center' }}>Line</th><th>Source Code</th><th style={{ width: '100px', textAlign: 'center' }}>Hits</th><th style={{ width: '30%' }}>Frequency</th></tr></thead>
                            <tbody>
                              {pythonLines.map((lineText, idx) => {
                                const hits = activeTab.lineExecutions[idx + 1] || 0;
                                return (
                                  <tr key={idx} style={{ backgroundColor: hits > 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent' }}>
                                    <td style={{ color: '#888', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>{idx + 1}</td>
                                    <td style={{ fontFamily: "'Fira Code', monospace", whiteSpace: 'pre', color: '#000000', paddingLeft: '15px' }}>{lineText || " "}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: hits > 0 ? '#00b8a3' : '#555' }}>{hits > 0 ? hits : '-'}</td>
                                    <td style={{ paddingRight: '20px' }}>
                                      {hits > 0 && maxExecutions > 0 && (
                                        <div style={{ height: '8px', width: `${(hits / maxExecutions) * 100}%`, backgroundColor: hits === maxExecutions ? '#f39c12' : '#00b8a3', borderRadius: '4px' }} title={`${Math.round((hits / maxExecutions) * 100)}%`} />
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
                        <button onClick={() => { setActiveComplexityTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === 'local' ? 'active' : ''}`}>Local</button>
                        <button onClick={() => { setActiveComplexityTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === 'global' ? 'active' : ''}`}>Global</button>
                        <button onClick={() => { setActiveComplexityTab("memory"); setExpandedLines({}); }} className={`tab-btn ${activeComplexityTab === 'memory' ? 'active' : ''}`}>Memory Map</button>
                      </div>
                      <div className="total-badge-group">
                        <span className="total-badge"><span className="total-label">Total Time:</span> <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatComplexity(activeTab.analysisResult.total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(0, 184, 163, 0.15)', color: '#00b8a3', border: '1px solid rgba(0, 184, 163, 0.3)' }}><span className="total-label" style={{ color: '#00b8a3' }}>Total Space:</span> <span style={{ fontSize: "20px", fontWeight: "bold" }}>{formatComplexity(activeTab.analysisResult.space_total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)' }}><span className="total-label" style={{ color: '#9b59b6' }}>Analysis:</span> <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#db7fff" }}>{activeTab.analysisTime} ms</span></span>
                      </div>
                    </div>

                    {activeComplexityTab === 'memory' ? (
                      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 15px' }}>
                        <MemoryVisualizer analysisData={activeTab.analysisResult.lines} currentStep={activeTab.analysisResult.lines.length > 0 ? activeTab.analysisResult.lines.length - 1 : 0} />
                      </div>
                    ) : (
                      <div className="complexity-table-wrapper">
                        <table className="complexity-table">
                          <thead>
                            <tr><th>Line of Code</th><th>Operation</th><th className="right-align">{activeComplexityTab === 'local' ? 'Local Time' : 'Global Time'}</th><th className="right-align">{activeComplexityTab === 'local' ? 'Local Space' : 'Global Space'}</th></tr>
                          </thead>
                          <tbody>
                            {activeTab.analysisResult.lines.map((line, i) => {
                              const timeComplexity = activeComplexityTab === 'local' ? (line.local_time || "O(1)") : (line.global_time || "O(1)");
                              const spaceComplexity = activeComplexityTab === 'local' ? (line.local_space || "O(1)") : (line.global_space || "O(1)");
                              let timeExp = line.time_explanation ?? line.local_explanation ?? "Not available.";
                              let spaceExp = line.space_explanation ?? line.global_explanation ?? "Not available.";
                              const isBottleneck = actualBottleneckIndices.includes(i);
                              const timeColor = getComplexityColor(timeComplexity);
                              const spaceColor = getComplexityColor(spaceComplexity);
                              const compStripped = timeComplexity.toLowerCase().replace(/\s+/g, '');
                              const isEfficient = !isBottleneck && (compStripped.includes("logn") || compStripped.includes("√n") || compStripped.includes("sqrt") || compStripped.includes("t(n/2)+o(1)")) && !compStripped.includes("nlogn");

                              return (
                                <React.Fragment key={i}>
                                  <tr className={`complexity-row ${expandedLines[i] ? 'expanded' : ''} ${isBottleneck ? 'bottleneck-active' : ''} ${isEfficient ? 'efficient-active' : ''}`} onClick={() => toggleLine(i)} style={{ cursor: 'pointer', borderLeft: isBottleneck ? '4px solid #ff375f' : isEfficient ? '4px solid #2ecc71' : (expandedLines[i] ? `3px solid ${timeColor}` : 'none'), backgroundColor: isBottleneck ? 'rgba(255, 55, 95, 0.12)' : isEfficient ? 'rgba(46, 204, 113, 0.12)' : 'transparent' }}>
                                    <td className="code-cell" style={{ color: '#000000', paddingLeft: line.indent ? `${(line.indent * 15) + 20}px` : '20px' }}>{line.lineOfCode || line.code}</td>
                                    <td className="operation-cell" style={{ color: '#000000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {line.operation || '-'}
                                      {isBottleneck && <span className="bottleneck-badge">Bottleneck</span>}
                                      {isEfficient && <span style={{ backgroundColor: '#2ecc71', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>Efficient</span>}
                                    </td>
                                    <td className="complexity-cell" style={{ color: timeColor, fontWeight: 'bold' }}>{formatComplexity(timeComplexity)}</td>
                                    <td className="complexity-cell" style={{ color: spaceColor, fontWeight: 'bold' }}>{formatComplexity(spaceComplexity)} <span className="dropdown-chevron" style={{ transform: expandedLines[i] ? 'rotate(90deg)' : 'rotate(0deg)' }}>v</span></td>
                                  </tr>
                                  {expandedLines[i] && (
                                    <tr className="explanation-row">
                                      <td colSpan="4" style={{ padding: 0, border: 'none' }}>
                                        <div className="explanation-content" style={{ borderLeftColor: timeColor, padding: '16px', background: 'rgba(255, 255, 255, 0.05)', margin: '0 16px 12px 16px', borderRadius: '8px', animation: 'slideDown 0.3s ease forwards', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto 150px', columnGap: '20px', rowGap: '15px' }}>
                                          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: '10px', width: '18px', flexShrink: 0 }} />
                                            <div style={{ width: '100%' }}>
                                              <strong style={{ color: timeColor, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time Complexity</strong>
                                              <div style={{ marginTop: '6px' }}>{formatExplanation(timeExp, isBottleneck, activeComplexityTab === 'local')}</div>
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'flex-start', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
                                            <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: '10px', width: '18px', flexShrink: 0 }} />
                                            <div style={{ width: '100%' }}>
                                              <strong style={{ color: spaceColor, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Space Complexity</strong>
                                              <div style={{ marginTop: '6px' }}>{formatExplanation(spaceExp, isBottleneck, activeComplexityTab === 'local')}</div>
                                            </div>
                                          </div>
                                          <div style={{ position: 'relative', width: '100%', height: '100%' }}><ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" /></div>
                                          <div style={{ position: 'relative', width: '100%', height: '100%', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}><ComplexityGraph complexity={spaceComplexity} color={spaceColor} label="Space Curve" /></div>
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
          </Split>
          <footer className="workspace-footer">
            <div className="footer-left">
              <button className={`footer-tab ${bottomPanel === 'console' ? 'active' : ''}`} onClick={() => setBottomPanel(bottomPanel === 'console' ? null : 'console')}><img src="/assets/console-icon.png" alt="Console" className="tab-icon" /> Console</button>
              <button className={`footer-tab ${bottomPanel === 'complexity' ? 'active' : ''}`} onClick={() => setBottomPanel(bottomPanel === 'complexity' ? null : 'complexity')}><img src="/assets/complexity-icon.png" alt="Complexity" className="tab-icon" /> Complexity</button>
              <button className="footer-tab big-o-btn" onClick={() => setIsBigOModalOpen(true)}><img src="/assets/table-icon.png" alt="Reference" className="tab-icon" /> Big O Reference</button>
            </div>
            <div className="footer-right">
              <button className="footer-action-icon" onClick={handleClear} title="Clear Current Tab Workspace"><img src="/assets/recursive-icon.png" alt="Clear" /></button>
            </div>
          </footer>
        </main>
      </Split>
      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} isDanger={modalConfig.isDanger} onCancel={closeModal} onConfirm={modalConfig.onConfirmAction} />
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
    </div>
  );
}