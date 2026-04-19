import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from '../components/ComplexityGraph.jsx';
import ConfirmModal from "../components/ConfirmModal.jsx";
import WorkspaceHeader from "../components/WorkspaceHeader.jsx";
import { projectsDB, syncQueueDB, templatesDB } from '../db.js';
import "../styles/MainApp.css";
import { formatComplexity } from "../utils/formatters";

// --- IMPORT MONACO EDITOR & TRANSLATOR ---
import Editor from "@monaco-editor/react";
import { translatePythonError } from "../utils/errorTranslator.js"; // <-- NEW IMPORT

// 1. Import the shared eager-loaded worker
import { sharedAnalyzerWorker } from "../workers/analyzerInstance.js";

// --- Custom Monaco Theme Injection ---
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
  { name: "Linear Search", path: "search/linear_search", desc: "Sequentially checks each element until the target is found.", category: "Search" },
  { name: "Binary Search", path: "search/binary_search", desc: "Finds the position of a target value within a sorted array.", category: "Search" },
  { name: "Exponential Search", path: "search/exponential_search", desc: "Finds the range by repeated doubling, then binary search.", category: "Search" },
  { name: "Bubble Sort", path: "sort/bubble_sort", desc: "Repeatedly swaps adjacent elements if they are in the wrong order.", category: "Sort" },
  { name: "Selection Sort", path: "sort/selection_sort", desc: "Finds the minimum element from the unsorted part and places it at the beginning.", category: "Sort" },
  { name: "Insertion Sort", path: "sort/insertion_sort", desc: "Builds the sorted array one element at a time.", category: "Sort" },
  { name: "Merge Sort", path: "sort/merge_sort", desc: "Divides the array into halves, sorts them, and merges them back.", category: "Sort" },
  { name: "Quick Sort", path: "sort/quick_sort", desc: "Partitions elements around a pivot, then recursively sorts.", category: "Sort" },
  { name: "Factorial (Recursive)", path: "recursive/recursive_factorial", desc: "Calculates the factorial of a number using recursion.", category: "Recursive" },
  { name: "Fibonacci (Recursive)", path: "recursive/recursive_fibonacci", desc: "Generates the Fibonacci sequence using recursive calls.", category: "Recursive" },
  { name: "Permutation (Recursive)", path: "recursive/recursive_permutation", desc: "Generates all permutations of a string.", category: "Recursive" },
  { name: "Tower of Hanoi (Recursive)", path: "recursive/recursive_tower_of_hanoi", desc: "Moves disks between rods following rules.", category: "Recursive" },
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
  if (comp.includes("o(1)")) return 1;
  if (comp.includes("logn") && !comp.includes("nlog")) return 2;
  if (comp.includes("o(n)") && !comp.includes("log")) return 3;
  if (comp.includes("nlogn")) return 4;
  if (comp.includes("n^2") || comp.includes("n²")) return 5;
  if (comp.includes("n^3") || comp.includes("n³")) return 6;
  if (comp.includes("2^n") || comp.includes("2ⁿ")) return 7;
  if (comp.includes("n!")) return 8;
  return 0; 
};

export default function MainApp() {
  const location = useLocation();
  const workspaceRef = useRef(null);
  const consoleEndRef = useRef(null);
  const workerRef = useRef(null);
  const runTimeoutRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const renderIntervalRef = useRef(null);
  const isDragging = useRef(false);
  const analysisStartTimeRef = useRef(0);

  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...");
  const [blocklyJson, setBlocklyJson] = useState(null);
  const [viewMode, setViewMode] = useState("workspace");
  const [bottomPanel, setBottomPanel] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [syntaxError, setSyntaxError] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({}); 
  const [allTemplates, setAllTemplates] = useState([]);
  const [currentLoadedId, setCurrentLoadedId] = useState(null);
  const [currentProjectTitle, setCurrentProjectTitle] = useState("Untitled Project");
  const [currentSaveType, setCurrentSaveType] = useState("project");
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [saveModal, setSaveModal] = useState({
    isOpen: false, isEditMetadataOnly: false, editingId: null, editingData: null,
    title: "", description: "", category: "Custom Templates", saveType: "project"
  });
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", isDanger: false, onConfirmAction: null });
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("local");
  const [expandedLines, setExpandedLines] = useState({});
  const [panelHeight, setPanelHeight] = useState(450);
  const [isEditingCode, setIsEditingCode] = useState(false);

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
        const duration = (performance.now() - analysisStartTimeRef.current).toFixed(1);
        setAnalysisTime(duration);

        if (data.status === "success") {
          setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });
          setSyntaxError(null);
        } else {
          // --- SYNTAX ERROR TRANSLATION ---
          const hint = translatePythonError(data.message);
          setSyntaxError({ line: data.line, message: `${data.message}. ${hint}` });
        }
      }
      else if (type === 'RUN_RESULT') {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current); 

        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = ""; 

        const resultData = (data !== undefined && data !== null && data !== "") ? `\n${String(data)}` : "";
        setConsoleOutput(prev => prev + flushed + resultData + "\n> Program finished.");
        
        if (counts) setLineExecutions(counts);

        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }
      else if (type === 'OUTPUT') {
        outputCountRef.current += 1;
        pendingOutputRef.current += data;

        if (outputCountRef.current > 5000) {
          clearTimeout(runTimeoutRef.current);
          clearInterval(renderIntervalRef.current);
          workerRef.current.terminate();

          workerRef.current = new Worker(new URL('../workers/analyzer.worker.js', import.meta.url), { type: 'module' });
          workerRef.current.postMessage({ type: 'INIT_ENGINE' });
          initWorker();

          const flushed = pendingOutputRef.current;
          pendingOutputRef.current = "";

          setConsoleOutput(prev => prev + flushed + "\n\n❌ Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n");
          setIsEvaluating(false);
          setIsWaitingForInput(false);
          outputCountRef.current = 0;
          return;
        }
      }
      else if (type === 'INPUT_REQUEST') {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current); 

        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";

        setConsoleOutput(prev => prev + flushed + data.prompt);
        setIsWaitingForInput(true);
      }
      else if (type === 'ERROR') {
        clearTimeout(runTimeoutRef.current);
        clearInterval(renderIntervalRef.current);

        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";

        // --- RUNTIME ERROR TRANSLATION ---
        const hint = translatePythonError(data);
        setConsoleOutput(prev => prev + flushed + "\n❌ Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
        
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
    if (consoleEndRef.current) consoleEndRef.current.scrollIntoView({ behavior: "smooth" }); 
  }, [consoleOutput, isWaitingForInput]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const newHeight = window.innerHeight - e.clientY - 48;
      if (newHeight >= 150 && newHeight <= window.innerHeight - 150) setPanelHeight(newHeight);
    };
    const handleMouseUp = () => { if (isDragging.current) { isDragging.current = false; document.body.style.cursor = "default"; document.body.style.userSelect = "auto"; } };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  const handleDragStart = (e) => { e.preventDefault(); isDragging.current = true; document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; };

  useEffect(() => {
    if (location.state?.projectToLoad && workspaceRef.current) {
      const proj = location.state.projectToLoad;
      setCurrentLoadedId(proj._id);
      setCurrentProjectTitle(proj.title);
      setCurrentSaveType("project");
      setTimeout(() => { workspaceRef.current.loadTemplate(proj.data); }, 500);
      window.history.replaceState({}, document.title)
    }
  }, [location.state]);

  const fetchTemplates = async () => {
    const baseTemplates = SIDEBAR_TEMPLATES.map(t => ({ ...t, title: t.name, description: t.desc, isSystem: true }));
    try {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) { setAllTemplates(baseTemplates); return; }

      const user = JSON.parse(storedUser);
      let customItems = [];

      await projectsDB.iterate((value) => {
        if (value.owner_id === user.email) {
          customItems.push({ _id: value._id, title: value.title, description: value.description || "Saved Project", category: "My Projects", isSystem: false, saveType: "project", data: value.data, synced: value.synced });
        }
      });

      await templatesDB.iterate((value) => {
        if (value.owner_id === user.email) {
          customItems.push({ _id: value._id, title: value.title, description: value.description || "Custom template", category: value.category || "Custom Templates", isSystem: false, saveType: "template", data: value.data, synced: value.synced });
        }
      });

      const uniqueItemsMap = new Map();
      customItems.forEach(item => uniqueItemsMap.set(item._id, item));

      setAllTemplates([...baseTemplates, ...Array.from(uniqueItemsMap.values())]);
    } catch (e) {
      setAllTemplates(baseTemplates);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const executeLoad = async (item) => {
    try {
      setAnalysisResult({ lines: [], total: "Analyzing...", space_total: "Analyzing...", is_recursive: false });
      setAnalysisTime("...");
      setLineExecutions({});
      let json;
      if (item.isSystem) {
        const response = await fetch(`/templates/${item.path}.json`);
        if (!response.ok) throw new Error("Template not found");
        json = await response.json();
        setCurrentLoadedId(null);
        setCurrentSaveType("project");
      } else {
        json = item.data;
        setCurrentLoadedId(item._id);
        setCurrentSaveType(item.saveType || "project");
      }

      setCurrentProjectTitle(item.title);
      if (workspaceRef.current) {
        workspaceRef.current.loadTemplate(json);
        setViewMode("workspace");
      }
    } catch (error) {
      showToast("Failed to load template", "error");
    }
  };

  const loadConfirm = (item) => {
    setModalConfig({ isOpen: true, title: `Load ${item.title}?`, message: "This will overwrite your current workspace. Continue?", confirmText: "Load Template", isDanger: false, onConfirmAction: () => { closeModal(); executeLoad(item); } });
  };

  const handleBlocklyChange = (json, pythonCode) => {
    if (!isEditingCode) setGeneratedPython(pythonCode);
    setBlocklyJson(json);
    setLineExecutions({});

    if (workerRef.current && pythonCode.trim() !== "") {
      analysisStartTimeRef.current = performance.now();
      workerRef.current.postMessage({ type: 'ANALYZE_CODE', code: pythonCode });
    }
  };

  useEffect(() => {
    if (!isEditingCode || !workerRef.current) return;
    const timeoutId = setTimeout(() => {
      analysisStartTimeRef.current = performance.now();
      workerRef.current.postMessage({ type: 'ANALYZE_CODE', code: generatedPython });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [generatedPython, isEditingCode]);

  const handleSyncToBlocks = async () => {
    if (workspaceRef.current && generatedPython) {
      try {
        await workspaceRef.current.loadFromPython(generatedPython);
        setIsEditingCode(false); setViewMode("workspace"); showToast("Code successfully synced to Blocks");
      } catch (e) { showToast(`Sync Failed: ${e.message}`, "error"); }
    }
  };

  const handleClear = () => {
    setModalConfig({
      isOpen: true, title: "Clear Workspace?", message: "Are you sure you want to clear? All unsaved progress will be lost.", confirmText: "Clear", isDanger: true,
      onConfirmAction: () => {
        closeModal();
        if (workspaceRef.current) {
          workspaceRef.current.clear();
          setGeneratedPython("# Drag blocks to generate Python code");
          setBlocklyJson(null); setAnalysisResult({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
          setAnalysisTime("0.0");
          setLineExecutions({});
          setBottomPanel(null); setExpandedLines({}); setSyntaxError(null);
          setCurrentLoadedId(null); setCurrentProjectTitle("Untitled Project");
          setCurrentSaveType("project");
        }
      }
    });
  };

  const openSaveModal = () => {
    if (!blocklyJson) { showToast("The workspace is empty. Nothing to save!", "error"); return; }
    setSaveModal({
      isOpen: true, isEditMetadataOnly: false, editingId: currentLoadedId, editingData: null,
      title: currentProjectTitle !== "Untitled Project" ? currentProjectTitle : "", description: "", category: "Custom Templates", saveType: currentSaveType
    });
  };

  const handleEditItem = (e, item) => {
    e.stopPropagation();
    setSaveModal({
      isOpen: true, isEditMetadataOnly: true, editingId: item._id, editingData: item.data,
      title: item.title, description: item.description || "", category: item.category || "Custom Templates", saveType: item.saveType || "project"
    });
  };

  const submitSave = async () => {
    const user = JSON.parse(localStorage.getItem("user"));
    const id = saveModal.editingId || `local_${Date.now()}`;
    const payload = { _id: id, title: saveModal.title, description: saveModal.description, category: saveModal.saveType === 'template' ? saveModal.category : undefined, data: blocklyJson, owner_id: user.email, synced: false, updatedAt: Date.now() };

    const db = saveModal.saveType === 'template' ? templatesDB : projectsDB;
    await db.setItem(id, payload);
    await syncQueueDB.setItem(id, { type: saveModal.saveType.toUpperCase(), action: 'UPSERT', data: payload });

    showToast("Saved locally. Background sync queued.");
    setSaveModal({ ...saveModal, isOpen: false });
    fetchTemplates(); 
  };

  const handleDeleteItem = async (e, item) => {
    e.stopPropagation();
    const itemLabel = item.saveType === 'template' ? 'Template' : 'Project';
    if (!window.confirm(`Are you sure you want to delete this ${itemLabel}?`)) return;

    setAllTemplates(prev => prev.filter(t => t._id !== item._id));

    try {
      if (item.saveType === 'template') await templatesDB.removeItem(item._id);
      else await projectsDB.removeItem(item._id);

      if (item._id.startsWith('local_')) {
        await syncQueueDB.removeItem(item._id);
      } else {
        await syncQueueDB.setItem(`delete_${item._id}`, { type: item.saveType.toUpperCase(), action: 'DELETE', data: { _id: item._id } });
      }

      showToast(`${itemLabel} deleted locally!`, "success");
      if (currentLoadedId === item._id) {
        workspaceRef.current?.clear();
        setCurrentLoadedId(null);
        setCurrentProjectTitle("Untitled Project");
      }
    } catch (err) {
      showToast("Error deleting item.", "error");
      fetchTemplates(); 
    }
  };

  const handleRunCode = () => {
    if (isEvaluating) return;

    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute.");
      setBottomPanel("console");
      return;
    }

    clearTimeout(runTimeoutRef.current);
    clearInterval(renderIntervalRef.current);

    setIsEvaluating(true);
    setLineExecutions({}); 
    setConsoleOutput("> Running locally via Pyodide (WebAssembly)...\n");
    setBottomPanel("console");

    outputCountRef.current = 0;
    pendingOutputRef.current = "";

    renderIntervalRef.current = setInterval(() => {
      if (pendingOutputRef.current) {
        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";
        setConsoleOutput(prev => prev + flushed);
      }
    }, 100);

    workerRef.current.postMessage({ type: 'RUN_CODE', code: generatedPython });

    runTimeoutRef.current = setTimeout(() => {
      workerRef.current.terminate();
      clearInterval(renderIntervalRef.current);

      workerRef.current = new Worker(new URL('../workers/analyzer.worker.js', import.meta.url), { type: 'module' });
      workerRef.current.postMessage({ type: 'INIT_ENGINE' });
      initWorker();

      const flushed = pendingOutputRef.current;
      pendingOutputRef.current = "";

      setConsoleOutput(prev => prev + flushed + "\n❌ Execution Prevented: \nRoot Cause: Infinite Loop detected. \nSuggestion: Check your loop conditions to ensure they eventually evaluate to False.\n");

      setIsEvaluating(false);
      setIsWaitingForInput(false);
    }, 10000);
  };

  const handleSendInput = (e) => {
    if (e.key === "Enter" && isWaitingForInput && workerRef.current) {
      setConsoleOutput((prev) => prev + userInput + "\n");
      workerRef.current.postMessage({ type: 'INPUT_RESPONSE', data: userInput });

      outputCountRef.current = 0;
      setUserInput("");
      setIsWaitingForInput(false);

      renderIntervalRef.current = setInterval(() => {
        if (pendingOutputRef.current) {
          const flushed = pendingOutputRef.current;
          pendingOutputRef.current = "";
          setConsoleOutput(prev => prev + flushed);
        }
      }, 100);

      runTimeoutRef.current = setTimeout(() => {
        workerRef.current.terminate();
        clearInterval(renderIntervalRef.current); 

        workerRef.current = new Worker(new URL('../workers/analyzer.worker.js', import.meta.url), { type: 'module' });
        workerRef.current.postMessage({ type: 'INIT_ENGINE' });
        initWorker();

        const flushed = pendingOutputRef.current;
        pendingOutputRef.current = "";

        setConsoleOutput(prev => prev + flushed + "\n❌ Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const filteredTemplates = allTemplates.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {});

  const lines = analysisResult?.lines || [];
  let maxWeight = 0;
  let bottleneckIndices = [];

  lines.forEach((line, index) => {
    const targetComplexity = activeTab === 'local' ? (line.local_time || "O(1)") : (line.global_time || "O(1)");
    const weight = getComplexityWeight(targetComplexity);
    
    if (weight > maxWeight) {
      maxWeight = weight;
      bottleneckIndices = [index];
    } else if (weight === maxWeight && weight > 0) {
      bottleneckIndices.push(index);
    }
  });

  const actualBottleneckIndices = maxWeight > 1 ? bottleneckIndices : [];
  let searchStartIndex = 0;
  const pythonLines = (generatedPython || "").split("\n");

  return (
    <div className="workspace-app-container">
      {toast.show && (<div className={`toast-notification ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>{toast.message}</div>)}

      {saveModal.isOpen && (
        <div className="modal-overlay">
          <div className="save-modal-content">
            <h2 className="save-modal-title">
              {saveModal.isEditMetadataOnly ? "Edit Details" : "Save Workspace"}
            </h2>

            <div className="save-type-toggle" style={{ display: 'flex', gap: '20px', marginBottom: '20px', background: '#f1f5f9', padding: '10px', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saveModal.editingId ? 'not-allowed' : 'pointer', color: saveModal.editingId ? '#94a3b8' : 'black' }}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === 'project'} onChange={() => setSaveModal({ ...saveModal, saveType: 'project' })} />
                Save as Project (Dashboard)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saveModal.editingId ? 'not-allowed' : 'pointer', color: saveModal.editingId ? '#94a3b8' : 'black' }}>
                <input type="radio" name="saveType" disabled={!!saveModal.editingId} checked={saveModal.saveType === 'template'} onChange={() => setSaveModal({ ...saveModal, saveType: 'template' })} />
                Save as Template (Sidebar)
              </label>
            </div>

            <div className="save-modal-form">
              <div>
                <label className="save-modal-label">Name</label>
                <input type="text" value={saveModal.title} onChange={e => setSaveModal({ ...saveModal, title: e.target.value })} placeholder="e.g. Optimized Merge Sort" className="save-modal-input" />
              </div>

              {saveModal.saveType === 'template' && (
                <div>
                  <label className="save-modal-label">Category</label>
                  <input type="text" value={saveModal.category} onChange={e => setSaveModal({ ...saveModal, category: e.target.value })} placeholder="e.g. Graph Algorithms" className="save-modal-input" />
                </div>
              )}

              <div>
                <label className="save-modal-label">Description</label>
                <textarea value={saveModal.description} onChange={e => setSaveModal({ ...saveModal, description: e.target.value })} placeholder="What does this do?" className="save-modal-textarea" />
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
        viewMode={viewMode}
        setViewMode={setViewMode}
        runCode={handleRunCode}
        handleExport={openSaveModal}
        handleSaveToDB={openSaveModal}
        currentProjectId={currentLoadedId}
        currentProjectTitle={currentProjectTitle}
        handleUpdateDB={openSaveModal}
        isEvaluating={isEvaluating}
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
                      <div className="title-wrapper">
                        <img src={item.isSystem ? "/assets/algoblocks_logo.png" : "/assets/user-icon.png"} alt="icon" className="card-type-icon" />
                        <h4>{item.title}</h4>
                      </div>

                      {item.isSystem ? (
                        <span className="badge-system-polished"><span className="dot"></span> System</span>
                      ) : (
                        <div className="badge-custom-group-polished">
                          <span className="badge-custom-polished">{item.saveType === 'project' ? 'Project' : 'Custom'}</span>
                          <button onClick={(e) => handleEditItem(e, item)} className="sidebar-edit-btn-polished" title="Edit Details" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px', marginLeft: '5px' }}>✎</button>
                          <button onClick={(e) => handleDeleteItem(e, item)} className="sidebar-delete-btn-polished" title="Delete" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', marginLeft: '5px' }}>✕</button>
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
          <button className={`sidebar-toggle-btn ${!isSidebarVisible ? 'closed' : ''}`} onClick={() => setIsSidebarVisible(!isSidebarVisible)} title={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}>
            <span className="toggle-icon">❮</span>
          </button>

          <div className="editor-container">
            <div className={viewMode === 'workspace' ? 'workspace-view d-block' : 'workspace-view d-none'}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleBlocklyChange} syntaxError={syntaxError} />
            </div>

            <div className={viewMode === 'python' ? 'python-view d-flex' : 'python-view d-none'} style={{ flexDirection: 'column' }}>
              <div className="python-header">
                <span className="python-sync-status">{isEditingCode ? "✏️ Unsaved code changes..." : "Code is synced with blocks."}</span>
                <button onClick={handleSyncToBlocks} disabled={!isEditingCode} className={`python-sync-btn ${isEditingCode ? 'active' : 'disabled'}`}> Sync to Blocks ↻ </button>
              </div>

              {/* --- MONACO VSCODE EDITOR INTEGRATION --- */}
              <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                {syntaxError && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(231, 76, 60, 0.9)', color: 'white', padding: '6px 15px', zIndex: 10, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>⚠️ Syntax Error on line {syntaxError.line}: {syntaxError.message}</span>
                    <button onClick={() => setSyntaxError(null)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </div>
                )}
                <Editor
                  height="100%"
                  language="python"
                  theme="algoblocks-purple"
                  beforeMount={handleEditorWillMount}
                  value={generatedPython}
                  onChange={(value) => {
                    setGeneratedPython(value || "");
                    setIsEditingCode(true);
                    if (syntaxError) setSyntaxError(null);
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 15,
                    fontFamily: "'Fira Code', Consolas, Monaco, monospace",
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    formatOnPaste: true,
                    suggestOnTriggerCharacters: true,
                    wordWrap: "on",
                    padding: { top: 16 }
                  }}
                />
              </div>
            </div>
          </div>

          {bottomPanel && (
            <div className="bottom-hover-panel" style={{ height: `${panelHeight}px` }}>
              <div className="panel-resizer" onMouseDown={handleDragStart}><div className="resizer-dash"></div></div>
              <div className="panel-header">
                <span className="panel-title">{bottomPanel === 'console' ? 'Console Output' : 'Complexity Analysis'}</span>
                <button onClick={() => setBottomPanel(null)} className="panel-close-btn">✕</button>
              </div>
              <div className="panel-body">
                {bottomPanel === 'console' ? (
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
                  <div className="complexity-content">
                    <div className="complexity-tabs">
                      <div className="tab-btn-group">
                        <button onClick={() => { setActiveTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeTab === 'local' ? 'active' : ''}`}>Local Complexity</button>
                        <button onClick={() => { setActiveTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}>Global Complexity</button>
                      </div>
                      <div className="total-badge-group">
                        <span className="total-badge"><span className="total-label">Total Time:</span> <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatComplexity(analysisResult.total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(0, 184, 163, 0.15)', color: '#00b8a3', border: '1px solid rgba(0, 184, 163, 0.3)' }}><span className="total-label" style={{ color: '#00b8a3' }}>Total Space:</span> <span style={{ fontSize: "20px", fontWeight: "bold" }}>{formatComplexity(analysisResult.space_total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)' }}><span className="total-label" style={{ color: '#9b59b6' }}>Analysis:</span> <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{analysisTime} ms</span></span>
                      </div>
                    </div>
                    <div className="complexity-table-wrapper">
                      <table className="complexity-table">
                        <thead>
                          <tr>
                            <th>Line of Code</th>
                            <th>Operation</th>
                            <th className="right-align">{activeTab === 'local' ? 'Local Time' : 'Global Time'}</th>
                            <th className="right-align">{activeTab === 'local' ? 'Local Space' : 'Global Space'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.lines.map((line, i) => {
                            const timeComplexity = activeTab === 'local' ? (line.local_time || "O(1)") : (line.global_time || "O(1)");
                            const spaceComplexity = activeTab === 'local' ? (line.local_space || "O(1)") : (line.global_space || "O(1)");
                            const timeExp = line.time_explanation || line.local_explanation || "Time complexity analysis not available.";
                            const spaceExp = line.space_explanation || line.global_explanation || "Space complexity analysis not available.";
                            const timeColor = getComplexityColor(timeComplexity);
                            const spaceColor = getComplexityColor(spaceComplexity);
                            const isBottleneck = actualBottleneckIndices.includes(i);

                            let execCount = 0;
                            const lineTextStr = (line.lineOfCode || line.code || "").trim();
                            let matchedIdx = pythonLines.findIndex((pLine, idx) => idx >= searchStartIndex && pLine.trim() === lineTextStr);
                            if (matchedIdx !== -1) {
                                execCount = lineExecutions[matchedIdx + 1] || 0;
                                searchStartIndex = matchedIdx + 1; 
                            } else {
                                matchedIdx = pythonLines.findIndex(pLine => pLine.trim() === lineTextStr);
                                if (matchedIdx !== -1) execCount = lineExecutions[matchedIdx + 1] || 0;
                            }

                            return (
                              <React.Fragment key={i}>
                                <tr
                                  className={`complexity-row ${expandedLines[i] ? 'expanded' : ''} ${isBottleneck ? 'bottleneck-active' : ''}`}
                                  onClick={() => toggleLine(i)}
                                  style={{
                                    cursor: 'pointer',
                                    borderLeft: isBottleneck ? '4px solid #ff375f' : (expandedLines[i] ? `3px solid ${timeColor}` : 'none'),
                                    backgroundColor: isBottleneck ? 'rgba(255, 55, 95, 0.12)' : 'transparent'
                                  }}
                                  title="Click to view explanation"
                                >
                                  <td className="code-cell" style={{ color: '#000000', paddingLeft: line.indent ? `${(line.indent * 15) + 20}px` : '20px' }}>
                                    {line.lineOfCode || line.code}
                                    
                                    {execCount > 0 && (
                                      <span style={{
                                        marginLeft: '12px', backgroundColor: '#8e44ad', color: '#fff', fontSize: '0.65rem', padding: '3px 8px',
                                        borderRadius: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 2px 4px rgba(142, 68, 173, 0.3)', verticalAlign: 'middle'
                                      }} title={`Executed ${execCount} times during the last run`}>
                                        <span style={{fontSize: '0.75rem'}}>⚡</span> {execCount} {execCount === 1 ? 'hit' : 'hits'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="operation-cell" style={{ color: '#000000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {line.operation || '-'}

                                    {isBottleneck && (
                                      <span style={{
                                        backgroundColor: '#ff375f', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '3px 8px',
                                        borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '10px',
                                        boxShadow: '0 0 8px rgba(255, 55, 95, 0.6)', animation: 'pulse 1.5s infinite'
                                      }} title={`Highest ${activeTab} computational weight detected`}>
                                        Bottleneck
                                      </span>
                                    )}
                                  </td>
                                  <td className="complexity-cell" style={{ color: timeColor, fontWeight: 'bold' }}>
                                    {formatComplexity(timeComplexity)}
                                  </td>
                                  <td className="complexity-cell" style={{ color: spaceColor, fontWeight: 'bold' }}>
                                    {formatComplexity(spaceComplexity)}
                                    <span className="dropdown-chevron" style={{ display: 'inline-block', marginLeft: '10px', transform: expandedLines[i] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                                      ▶
                                    </span>
                                  </td>
                                </tr>

                                {expandedLines[i] && (
                                  <tr className="explanation-row">
                                    <td colSpan="4" style={{ padding: 0, border: 'none' }}>
                                      <div
                                        className="explanation-content"
                                        style={{
                                          borderLeftColor: timeColor, display: 'flex', gap: '20px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)',
                                          margin: '0 16px 12px 16px', borderRadius: '8px', animation: 'slideDown 0.3s ease forwards',
                                        }}
                                      >
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                          <div className="explanation-text" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: '10px', width: '18px' }} />
                                            <div>
                                              <strong style={{ color: timeColor, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time Complexity</strong>
                                              <p style={{ color: '#000000', marginTop: '6px', fontSize: '0.9rem', lineHeight: '1.5' }}>{timeExp}</p>
                                            </div>
                                          </div>
                                          <div className="explanation-graph" style={{ marginTop: '15px', height: '120px' }}>
                                            <ComplexityGraph complexity={timeComplexity} color={timeColor} label="Time Curve" />
                                          </div>
                                        </div>

                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
                                          <div className="explanation-text" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon explanation-icon" style={{ marginLeft: 0, marginRight: '10px', width: '18px' }} />
                                            <div>
                                              <strong style={{ color: spaceColor, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Space Complexity</strong>
                                              <p style={{ color: '#000000', marginTop: '6px', fontSize: '0.9rem', lineHeight: '1.5' }}>{spaceExp}</p>
                                            </div>
                                          </div>
                                          <div className="explanation-graph" style={{ marginTop: '15px', height: '120px' }}>
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
                  </div>
                )}
              </div>
            </div>
          )}

          <footer className="workspace-footer">
            <div className="footer-left">
              <button className={`footer-tab ${bottomPanel === 'console' ? 'active' : ''}`} onClick={() => setBottomPanel(bottomPanel === 'console' ? null : 'console')}><img src="/assets/console-icon.png" alt="Console" className="tab-icon" /> Console</button>
              <button className={`footer-tab ${bottomPanel === 'complexity' ? 'active' : ''}`} onClick={() => setBottomPanel(bottomPanel === 'complexity' ? null : 'complexity')}><img src="/assets/complexity-icon.png" alt="Complexity" className="tab-icon" /> Complexity</button>
              <button className="footer-tab big-o-btn" onClick={() => setIsBigOModalOpen(true)}><img src="/assets/table-icon.png" alt="Reference" className="tab-icon" /> Big O Reference</button>
            </div>
            <div className="footer-right">
              <button className="footer-action-icon" onClick={handleClear} title="Clear Workspace"><img src="/assets/recursive-icon.png" alt="Refresh" /></button>
            </div>
          </footer>
        </main>
      </Split>

      <ConfirmModal isOpen={modalConfig.isOpen} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} isDanger={modalConfig.isDanger} onCancel={closeModal} onConfirm={modalConfig.onConfirmAction} />
      <BigOModal isOpen={isBigOModalOpen} onClose={() => setIsBigOModalOpen(false)} />
    </div>
  );
}