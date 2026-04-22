// frontend/src/pages/ActivityApp.jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from '../components/ComplexityGraph.jsx';
import ConfirmModal from "../components/ConfirmModal.jsx";
import MemoryVisualizer from "../components/MemoryVisualizer.jsx";
import "../styles/ActivityApp.css";
import { formatComplexity } from "../utils/formatters";

// --- IMPORT MONACO EDITOR & TRANSLATOR ---
import Editor from "@monaco-editor/react";
import { translatePythonError } from "../utils/errorTranslator.js";

// 1. Import the shared eager-loaded worker
import { sharedAnalyzerWorker } from "../workers/analyzerInstance.js";

// --- Custom Monaco Theme Injection ---
const handleEditorWillMount = (monaco) => {
  monaco.editor.defineTheme('algoblocks-purple', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1C1236', // Match the app's deep purple background
      'editor.foreground': '#EBE4FF', // Match the light purple text
      'editorLineNumber.foreground': '#6C5CE7', // Accent purple for line numbers
      'editor.lineHighlightBackground': '#2D234A', // Subtle highlight for current line
      'editorCursor.foreground': '#FFFFFF', // Bright white cursor
      'editor.selectionBackground': '#6C5CE755', // Purple selection highlighting
      'editor.inactiveSelectionBackground': '#6C5CE733'
    }
  });
};

const ACTIVITY_TASKS = [
  {
    id: "l1-t1",
    templatePath: "activities/what_is_algo",
    title: "1. Hello World",
    difficulty: "Easy",
    task: `Welcome to AlgoBlocks! Every great programmer starts their journey with a simple tradition: greeting the world. Your very first task is to write a program that prints a specific greeting message to the system console. 

**Example 1:**
Input: None
Output: "Hello World"

**Constraints:**
• You must familiarize yourself with the visual block interface.
• Connect a simple sequence of Output blocks to print exactly "Hello" and "World".
• Pay attention to capitalization and spacing.`,
    testCasesList: [
      { call: "", expected: "Hello World" }
    ]
  },
  {
    id: "l1-t2",
    templatePath: "activities/logic_flow_act",
    title: "2. Logic & Flow",
    difficulty: "Easy",
    task: `In programming, computers make decisions using conditional statements. You are given a boolean variable \`condition\` which can either be \`true\` or \`false\`. 

Your task is to evaluate this condition and **return** a specific string based on its truth value. If the condition evaluates to \`true\`, your program must return the string "Yes". If the condition evaluates to \`false\`, your program must return the string "No".

**Example 1:**
Input: condition = true
Output: "Yes"

**Example 2:**
Input: condition = false
Output: "No"

**Constraints:**
• You must use an If-Else conditional block to control the flow of execution.
• The output must match the casing exactly.`,
    testCasesList: [
      { call: "condition_checker(True)", expected: "'Yes'" },
      { call: "condition_checker(False)", expected: "'No'" }
    ]
  },
  {
    id: "l1-t3",
    templatePath: "activities/big_o_act",
    title: "3. Big O Notation",
    difficulty: "Easy",
    task: `Big O notation evaluates how the runtime or space requirements of an algorithm grow as the input size increases. It gives us a high-level understanding of an algorithm's efficiency.

An algorithm with **O(1)** complexity takes the same amount of time regardless of the input size (Constant Time). An algorithm with **O(n)** complexity takes time directly proportional to the input size (Linear Time).

Your task is to build a simple algorithm with **O(n)** time complexity. You are given a non-negative integer \`n\`. Construct a loop that outputs the string "Step" exactly \`n\` times.

**Example 1:**
Input: n = 3
Output: 
"Step"
"Step"
"Step"

**Constraints:**
• 0 <= n <= 10
• You must use a Loop block that executes exactly \`n\` times, demonstrating linear growth.`,
    testCasesList: [
      { call: "print_steps(3)", expected: "Step\\nStep\\nStep" },
      { call: "print_steps(1)", expected: "Step" },
      { call: "print_steps(0)", expected: "" },
      { call: "print_steps(5)", expected: "Step\\nStep\\nStep\\nStep\\nStep" }
    ]
  },
  {
    id: "l2-t1",
    templatePath: "activities/linear_search_act",
    title: "4. Linear Search",
    difficulty: "Easy",
    task: `You are given a 0-indexed array of integers \`arr\` and an integer \`target\`. Your objective is to find the exact position of the \`target\` within the array. 

Write an algorithm that checks each element of the array sequentially from the beginning (index 0) to the end. If the \`target\` is found, return its index. If you reach the end of the array and the \`target\` does not exist in \`arr\`, return \`-1\`.

**Example 1:**
Input: arr = [4, 5, 6, 7, 0, 1, 2], target = 0
Output: 4
Explanation: The number 0 is located at index 4 in the array.

**Example 2:**
Input: arr = [4, 5, 6, 7, 0, 1, 2], target = 3
Output: -1
Explanation: The number 3 is not present in the array, so we return -1.

**Constraints:**
• 1 <= arr.length <= 10^4
• -10^5 <= arr[i], target <= 10^5
• You must build a Linear Search using blocks: Loop through the array, compare each element one by one, and return the index upon finding the match.`
  },
  {
    id: "l2-t2",
    templatePath: "activities/binary_search_act",
    title: "5. Binary Search",
    difficulty: "Easy",
    task: `You are given an array of integers \`arr\` which is strictly sorted in ascending order, and an integer \`target\`. Write a function to search for the \`target\` in \`arr\`. If the \`target\` exists, then return its index. Otherwise, return \`-1\`. 

Because the array is already sorted, you can optimize your search. Instead of checking every element sequentially, you should repeatedly divide the search interval in half.

**Example 1:**
Input: arr = [-1,0,3,5,9,12], target = 9
Output: 4
Explanation: 9 exists in nums and its index is 4.

**Example 2:**
Input: arr = [-1,0,3,5,9,12], target = 2
Output: -1
Explanation: 2 does not exist in nums so return -1.

**Constraints:**
• 1 <= arr.length <= 10^4
• -10^4 < arr[i], target < 10^4
• All the integers in \`arr\` are unique.
• \`arr\` is sorted in ascending order.
• You **must** write an algorithm with $O(\\log n)$ runtime complexity.`
  },
  {
    id: "l3-t1",
    templatePath: "activities/bubble_sort_act",
    title: "6. Bubble Sort",
    difficulty: "Easy",
    task: `You are given an array of integers \`arr\`. Your task is to sort the array in ascending order and return it. You must solve the problem using the **Bubble Sort** algorithm. 

Bubble Sort works by repeatedly swapping adjacent elements if they are in the wrong order. With each full pass through the array, the largest unsorted element "bubbles up" to its correct position at the end of the array. You must continue making passes until no more swaps are needed.

**Example 1:**
Input: arr = [5, 2, 3, 1]
Output: [1, 2, 3, 5]
Explanation: 
Pass 1: [2, 5, 3, 1] -> [2, 3, 5, 1] -> [2, 3, 1, 5] (5 is sorted)
Pass 2: [2, 3, 1, 5] -> [2, 1, 3, 5] (3 is sorted)
Pass 3: [1, 2, 3, 5] (Array is fully sorted)

**Constraints:**
• 1 <= arr.length <= 1000
• -5000 <= arr[i] <= 5000
• Modify the array in-place without using extra memory for another array.`
  },
  {
    id: "l3-t2",
    templatePath: "activities/selection_sort_act",
    title: "7. Selection Sort",
    difficulty: "Easy",
    task: `You are given an array of integers \`arr\`. Your task is to sort the array in ascending order and return it using the **Selection Sort** algorithm.

Selection Sort divides the input array into two parts: a sorted sublist of items which is built up from left to right at the front (left) of the array, and a sublist of the remaining unsorted items that occupy the rest of the array. Initially, the sorted sublist is empty. The algorithm proceeds by finding the smallest element in the unsorted sublist, exchanging (swapping) it with the leftmost unsorted element, and moving the sublist boundaries one element to the right.

**Example 1:**
Input: arr = [64, 25, 12, 22, 11]
Output: [11, 12, 22, 25, 64]

**Constraints:**
• 1 <= arr.length <= 1000
• -10^4 <= arr[i] <= 10^4
• Find the minimum element in the unsorted portion and swap it to the front.`
  },
  {
    id: "l3-t3",
    templatePath: "activities/insertion_sort_act",
    title: "8. Insertion Sort",
    difficulty: "Easy",
    task: `You are given an array of integers \`arr\`. Sort the array in ascending order and return it using the **Insertion Sort** algorithm.

Insertion Sort iterates, consuming one input element each repetition, and growing a sorted output list. At each iteration, it removes one element from the input data, finds the location it belongs within the sorted list, and inserts it there. It repeats until no input elements remain. This is similar to how you might sort playing cards in your hands.

**Example 1:**
Input: arr = [12, 11, 13, 5, 6]
Output: [5, 6, 11, 12, 13]

**Constraints:**
• 1 <= arr.length <= 1000
• -5000 <= arr[i] <= 5000
• Shift larger elements to the right to insert the current element in its correct sequential order.`
  },
  {
    id: "l3-t4",
    templatePath: "activities/merge_sort_act",
    title: "9. Merge Sort",
    difficulty: "Medium",
    task: `You are given an array of integers \`arr\`. Sort the array in ascending order and return it. You must solve the problem using the **Merge Sort** algorithm.

Merge Sort is a divide-and-conquer algorithm. It works by recursively breaking down a problem into two or more sub-problems of the same or related type, until these become simple enough to be solved directly (arrays of size 1 are inherently sorted). The solutions to the sub-problems are then combined (merged) to give a solution to the original problem.

**Example 1:**
Input: arr = [12, 11, 13, 5, 6, 7]
Output: [5, 6, 7, 11, 12, 13]

**Constraints:**
• 1 <= arr.length <= 5 * 10^4
• -50000 <= arr[i] <= 50000
• You must write an algorithm with $O(n \\log n)$ runtime complexity.`
  },
  {
    id: "l4-t1",
    templatePath: "activities/factorial_recursive_act",
    title: "10. Factorial (Recursive)",
    difficulty: "Easy",
    task: `You are given a non-negative integer \`n\`. Your task is to compute and return the factorial of \`n\`, mathematically denoted as \`n!\`. 

The factorial of a non-negative integer \`n\` is the product of all positive integers less than or equal to \`n\`. For example, \`4! = 4 * 3 * 2 * 1 = 24\`. By definition, the value of \`0!\` is \`1\`.

**Example 1:**
Input: n = 4
Output: 24
Explanation: 4 * 3 * 2 * 1 = 24

**Example 2:**
Input: n = 0
Output: 1
Explanation: The base case of 0! is defined as 1.

**Constraints:**
• 0 <= n <= 12
• You **must** solve the problem using a recursive algorithm. Do not use iterative loops (\`for\` or \`while\`). Ensure you have a clear base case to prevent an infinite call stack.`
  },
  {
    id: "l4-t2",
    templatePath: "activities/fibonacci_recursive_act",
    title: "10. Fibonacci Number",
    difficulty: "Easy",
    task: `The Fibonacci numbers, commonly denoted \`F(n)\`, form a sequence called the Fibonacci sequence, such that each number is the sum of the two preceding ones. The sequence starts from \`0\` and \`1\`. 

The sequence is defined mathematically as:
$F(0) = 0, F(1) = 1$
$F(n) = F(n-1) + F(n-2)$, for $n > 1$.

Given an integer \`n\`, calculate and return the \`n\`-th Fibonacci number \`F(n)\`.

**Example 1:**
Input: n = 2
Output: 1
Explanation: F(2) = F(1) + F(0) = 1 + 0 = 1.

**Example 2:**
Input: n = 4
Output: 3
Explanation: F(4) = F(3) + F(2) = 2 + 1 = 3.

**Constraints:**
• 0 <= n <= 30
• You **must** solve the problem using a recursive algorithm.`
  },
  {
    id: "l4-t3",
    templatePath: "activities/permutation_recursive_act",
    title: "11. Permutations",
    difficulty: "Medium",
    task: `You are given an array \`nums\` consisting of distinct integers. A permutation is a mathematical technique that determines the number of possible arrangements in a set when the order of the arrangements matters.

Your task is to compute and return all the possible permutations of the elements in \`nums\`. You can return the final list of permutations in any order.

**Example 1:**
Input: nums = [1,2,3]
Output: [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]
Explanation: There are 3! (6) distinct ways to arrange the 3 unique numbers.

**Example 2:**
Input: nums = [0,1]
Output: [[0,1],[1,0]]

**Constraints:**
• 1 <= nums.length <= 6
• -10 <= nums[i] <= 10
• All the integers of \`nums\` are guaranteed to be unique.
• You must solve the problem using recursion (often referred to as backtracking in this context).`
  }
];

const renderFormattedTask = (text) => {
  if (!text || typeof text !== "string") return null;
  const formattedHtml = text
    .replace(/\n/g, '<br/>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #26004a;">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #4400ff;">$1</code>');

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

const ActivityApp = () => {
  const VERCEL_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

  const location = useLocation();
  const navigate = useNavigate();
  const workspaceRef = useRef(null);
  const consoleEndRef = useRef(null);
  const workerRef = useRef(null);
  const runTimeoutRef = useRef(null);
  const outputCountRef = useRef(0);
  const pendingOutputRef = useRef("");
  const renderIntervalRef = useRef(null);
  const isDragging = useRef(false);
  const hasLoadedRef = useRef(false);
  const analysisStartTimeRef = useRef(0);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const [isEvaluating, setIsEvaluating] = useState(false);
  const activityData = location.state?.activityData || null;
  const initialTemplate = location.state?.templatePath || location.state?.activityData?.templatePath || "";
  const currentTask = ACTIVITY_TASKS.find((t) => t.templatePath === initialTemplate);
  const totalTests = activityData?.testCasesList?.length || 0;

  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("Ready to run...");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);

  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [expandedTests, setExpandedTests] = useState({ 0: true });
  const [bottomPanel, setBottomPanel] = useState(null);
  const [consoleTab, setConsoleTab] = useState("output"); // NEW: Console Sub-tabs
  const [activeTab, setActiveTab] = useState("local");

  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");

  const [analysisResult, setAnalysisResult] = useState({ lines: [], total: "O(1)", space_total: "O(1)", is_recursive: false });
  const [analysisTime, setAnalysisTime] = useState("0.0");
  const [lineExecutions, setLineExecutions] = useState({});

  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", confirmText: "Confirm", isDanger: false, onConfirmAction: null });
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [syntaxError, setSyntaxError] = useState(null);
  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});
  const [panelHeight, setPanelHeight] = useState(300);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); showToast("Connection restored. Using online FastAPI backend.", "success"); };
    const handleOffline = () => { setIsOnline(false); showToast("Connection lost. Falling back to local Pyodide.", "error"); };

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

      if (type === 'ANALYZE_RESULT') {
        const duration = (performance.now() - analysisStartTimeRef.current).toFixed(1);
        setAnalysisTime(duration);

        if (data.status === "success") {
          setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });

          const initialCounts = {};
          (data.lines || []).forEach(l => {
            if (l.lineno && l.hits) initialCounts[l.lineno] = l.hits;
          });
          setLineExecutions(initialCounts);

          setSyntaxError(null);
        } else {
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

          setConsoleOutput(prev => prev + flushed + "\n\n Execution Prevented: \nRoot Cause: Output Flood detected (5000+ lines).\nSuggestion: Check your loop conditions.\n");
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

        const hint = translatePythonError(data);
        setConsoleOutput(prev => prev + flushed + "\n Runtime Error:\n" + data + (hint ? `\n${hint}\n` : ""));
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

  const toggleLine = (index) => { setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] })); };
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });
  const handleDragStart = (e) => { e.preventDefault(); isDragging.current = true; document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; };

  useEffect(() => { if (!activityData) navigate("/learning-path"); }, [activityData, navigate]);
  
  useEffect(() => { 
    if (consoleEndRef.current && consoleTab === 'output') { 
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" }); 
    } 
  }, [consoleOutput, isWaitingForInput, consoleTab]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const newHeight = window.innerHeight - e.clientY - 48;
      if (newHeight >= 150 && newHeight <= window.innerHeight - 150) { setPanelHeight(newHeight); }
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  const analyzeCode = async (code) => {
    if (!code || code.trim() === "") return;

    analysisStartTimeRef.current = performance.now();

    if (isOnline) {
      try {
        const response = await fetch(`${VERCEL_URL}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });

        if (!response.ok) throw new Error("FastAPI analyze endpoint failed");

        const data = await response.json();
        const duration = (performance.now() - analysisStartTimeRef.current).toFixed(1);
        setAnalysisTime(duration);

        if (data.status === "success") {
          setAnalysisResult({ total: data.total, space_total: data.space_total || "O(1)", lines: data.lines || [], is_recursive: data.is_recursive || false });
          
          const initialCounts = {};
          (data.lines || []).forEach(l => {
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
        console.warn("Online analysis failed or unreachable, falling back to local worker.", error);
      }
    }

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'ANALYZE_CODE', code });
    }
  };

  useEffect(() => {
    if (!isEditingCode) return;
    const timeoutId = setTimeout(() => {
      analyzeCode(generatedPython);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [generatedPython, isEditingCode, isOnline]);

  useEffect(() => {
    if (!initialTemplate || !activityData) return;
    if (hasLoadedRef.current) return;

    hasLoadedRef.current = true;
    const timer = setTimeout(() => { loadActivityTemplate(initialTemplate, activityData); }, 300);
    return () => clearTimeout(timer);
  }, [initialTemplate, activityData]);

  const saveLessonProgress = async (lessonId, score) => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);

    if (!user.progress) user.progress = {};
    user.progress[lessonId] = Math.max(user.progress[lessonId] || 0, score);
    localStorage.setItem("user", JSON.stringify(user));

    try {
      fetch(`${VERCEL_URL}/api/update-progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, lesson_id: lessonId, score }) });
    } catch (error) { }
  };

  const handleSuccess = (passed, total) => {
    setModalConfig({ isOpen: true, title: "Activity Completed! 🎉", message: `Excellent work! You successfully passed all ${passed} out of ${total} test cases.`, confirmText: "Return to Dashboard", isDanger: false, onConfirmAction: () => { closeModal(); navigate("/learning-path"); } });
  };

  const loadActivityTemplate = async (path, dataFromState) => {
    try {
      let json = null;
      if (dataFromState && dataFromState.blocks) {
        json = dataFromState;
      } else if (path) {
        const fetchUrl = path.startsWith("activities/") ? `/${path}.json` : `/templates/${path}.json`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`404: ${fetchUrl}`);
        json = await response.json();
      }

      if (!json) return;

      const tryLoad = (retries = 15) => {
        if (!workspaceRef.current) {
          if (retries > 0) setTimeout(() => tryLoad(retries - 1), 100);
          return;
        }
        try {
          if (workspaceRef.current.clear) workspaceRef.current.clear();
          workspaceRef.current.loadTemplate(json.data ? json.data : json);
          setViewMode("workspace");
          setIsEditingCode(false);
        } catch (err) { }
      };
      tryLoad();
    } catch (error) { }
  };

  const handleWorkspaceChange = async (json, pythonCode) => {
    const oldCode = (generatedPython || "").trim();
    const newCode = (pythonCode || "").trim();

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
        setModalConfig({ isOpen: true, title: "Sync Error", message: "Cannot sync to blocks until syntax errors are fixed.", confirmText: "Close", isDanger: true, onConfirmAction: closeModal });
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

    if (isOnline) {
      setConsoleOutput("\n> Running online via FastAPI...\n");
      try {
        const response = await fetch(`${VERCEL_URL}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: generatedPython })
        });

        if (!response.ok) throw new Error("FastAPI execution failed");

        const data = await response.json();
        const resultData = (data.output !== undefined && data.output !== null) ? `\n${String(data.output)}` : "";
        setConsoleOutput(prev => prev + resultData + "\n> Program finished.");

        if (data.counts) setLineExecutions(data.counts);

        setIsEvaluating(false);
        return;
      } catch (error) {
        setConsoleOutput(prev => prev + " Online execution failed or unreachable. Falling back to local Pyodide...\n\n");
      }
    }

    setConsoleOutput(prev => prev + "\n> Running locally via Pyodide (WebAssembly)...\n");

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

      setConsoleOutput(prev => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected. \nSuggestion: Check your loop conditions to ensure they eventually evaluate to False.\n");

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

        setConsoleOutput(prev => prev + flushed + "\n Execution Prevented: \nRoot Cause: Infinite Loop detected.\n");
        setIsEvaluating(false);
        setIsWaitingForInput(false);
      }, 10000);
    }
  };

  const toggleTest = (index) => { setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] })); };

  const executeTest = async (codeToRun) => {
    if (isOnline) {
      try {
        const response = await fetch(`${VERCEL_URL}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeToRun })
        });
        if (!response.ok) throw new Error("FastAPI execution failed");

        const data = await response.json();

        if (data.counts) {
          setLineExecutions(prev => {
            const next = { ...prev };
            for (const [key, val] of Object.entries(data.counts)) { next[key] = (next[key] || 0) + val; }
            return next;
          });
        }

        if (data.error) {
          const hint = translatePythonError(data.error);
          throw new Error(data.error + (hint ? `\n${hint}` : ""));
        }

        return (data.output !== undefined && data.output !== null) ? String(data.output) : "";
      } catch (error) {
        console.warn("Online test execution failed, falling back to local...", error);
      }
    }

    return new Promise((resolve, reject) => {
      let outputAccumulator = "";
      const timeout = setTimeout(() => {
        workerRef.current.terminate();
        workerRef.current = new Worker(new URL('../workers/analyzer.worker.js', import.meta.url), { type: 'module' });
        workerRef.current.postMessage({ type: 'INIT_ENGINE' });
        initWorker();
        reject(new Error("Infinite Loop detected. Execution timed out after 10 seconds."));
      }, 10000);

      workerRef.current.onmessage = (event) => {
        const { type, data, counts } = event.data;
        if (type === 'OUTPUT') {
          outputAccumulator += data;
        } else if (type === 'RUN_RESULT') {
          clearTimeout(timeout);
          outputAccumulator += (data !== undefined && data !== null) ? data : "";
          if (counts) {
            setLineExecutions(prev => {
              const next = { ...prev };
              for (const [key, val] of Object.entries(counts)) { next[key] = (next[key] || 0) + val; }
              return next;
            });
          }
          initWorker();
          resolve(outputAccumulator);
        } else if (type === 'ERROR') {
          clearTimeout(timeout);
          initWorker();

          const hint = translatePythonError(data);
          const errorMsg = data + (hint ? `\n${hint}` : "");
          reject(new Error(errorMsg));
        }
      };
      workerRef.current.postMessage({ type: 'RUN_CODE', code: codeToRun });
    });
  };

  const runTestCases = async () => {
    if (isEvaluating) return;

    const testCases = currentTask?.testCasesList || activityData?.testCasesList;
    if (!testCases) return;

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
      setConsoleOutput(`Test Execution Prevented:\n\n${failure.error || failure.message}`);
      setBottomPanel("console");
      setIsEvaluating(false);
      return;
    }

    setBottomPanel("console");
    setConsoleOutput("\n> Running Tests...\n");
    setPassedTests(0);

    let passed = 0;
    const total = testCases.length;
    let fullOutput = "\n> --- Running Test Cases ---\n";

    for (let i = 0; i < total; i++) {
      const tc = testCases[i];
      let codeToRun = "";
      const isFunctionCall = tc.call?.includes("(") && tc.call?.includes(")");
      const taskId = currentTask?.id || activityData?.id || "";
      const isIntroLevel = taskId === "l1-t1" || taskId === "l1-t3";

      if (isFunctionCall && !isIntroLevel) {
        codeToRun = generatedPython + `\n\ntry:\n    assert ${tc.call} == ${tc.expected}\n    print("TEST_PASSED_FLAG")\nexcept:\n    print("TEST_ERROR_FLAG")`;
      } else {
        codeToRun = `${generatedPython}\n${tc.call || ""}`;
      }

      try {
        const rawOutput = await executeTest(codeToRun);
        const actualOutput = rawOutput.trim();
        const expected = String(tc.expected).replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();
        let testPassed = false;

        if (isFunctionCall && !isIntroLevel) {
          if (actualOutput.includes("TEST_PASSED_FLAG")) { passed++; testPassed = true; }
        } else {
          if (actualOutput.trim() === expected) { passed++; testPassed = true; }
        }

        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;
        if (!testPassed) { fullOutput += `   Expected: ${expected}\n   Actual: ${actualOutput}\n`; }
        fullOutput += `\n`;

        setConsoleOutput(fullOutput);
        setPassedTests(passed);

        const lessonId = initialTemplate?.split("/").pop() || "unknown";
        saveLessonProgress(lessonId, passed);

        if (passed === total && total > 0) handleSuccess(passed, total);
      } catch (err) {
        fullOutput += `Test ${i + 1}: ERROR\n   Message: ${err.message}\n\n`;
        setConsoleOutput(fullOutput);
      }
    }
    setIsEvaluating(false);
  };

  const lines = analysisResult?.lines || [];
  let maxWeight = 0;
  let bottleneckIndices = [];

  lines.forEach((line, index) => {
    const timeToEvaluate = activeTab === 'local' ? line.local_time : line.global_time;
    const weight = getComplexityWeight(timeToEvaluate);
    if (weight > maxWeight) { maxWeight = weight; bottleneckIndices = [index]; }
    else if (weight === maxWeight && weight > 0) { bottleneckIndices.push(index); }
  });

  const actualBottleneckIndices = maxWeight > 1 ? bottleneckIndices : [];
  const pythonLines = (generatedPython || "").split("\n");
  const maxExecutions = Math.max(0, ...Object.values(lineExecutions));

  return (
    <div className="activity-app-container">
      {toast.show && (<div className={`toast-notification ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`} style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>{toast.message}</div>)}

      <header className="activity-topbar">
        <div className="activity-back-btn" onClick={() => navigate('/learning-path')}>
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Dashboard
        </div>

        <div className="activity-toggle-group">
          <button className={`activity-toggle-btn ${viewMode === 'workspace' ? 'active' : ''}`} onClick={() => setViewMode('workspace')}>Workspace</button>
          <button className={`activity-toggle-btn ${viewMode === 'python' ? 'active' : ''}`} onClick={() => setViewMode('python')}>Python Code</button>
        </div>

        <div className="activity-actions" style={{ display: 'flex', gap: '10px' }}>
          <button className="activity-action-btn" onClick={handleActivityRun} style={{ backgroundColor: '#2D234A', border: '1px solid #6C5CE7', color: '#EBE4FF', opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? 'not-allowed' : 'pointer' }} title="Run code in console without submitting to test cases">
            {isEvaluating ? "..." : "▷ Run Code"}
          </button>
          <button className="activity-action-btn run-btn" onClick={runTestCases} style={{ opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? 'not-allowed' : 'pointer' }}>
            {isEvaluating ? "..." : "▶ Run Tests"}
          </button>
        </div>
      </header>

      <Split className={`activity-main-layout ${!isLeftPanelVisible ? 'left-hidden' : ''}`} sizes={[25, 50, 25]} minSize={[isLeftPanelVisible ? 250 : 0, 400, 250]} gutterSize={8}>
        <aside className="activity-left-panel">
          <div className="activity-panel-header">
            <h2><img src="/assets/console-icon.png" alt="Icon" style={{ width: '24px' }} /> Description</h2>
          </div>

          <div className="activity-panel-content">
            <div className="activity-task-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', marginTop: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#2b005c', fontWeight: 'bold' }}>{currentTask?.title || activityData.title || "Activity"}</h2>
              <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: currentTask?.difficulty === 'Easy' ? 'rgba(0, 184, 163, 0.15)' : currentTask?.difficulty === 'Medium' ? 'rgba(255, 192, 30, 0.15)' : 'rgba(255, 55, 95, 0.15)', color: currentTask?.difficulty === 'Easy' ? '#00b8a3' : currentTask?.difficulty === 'Medium' ? '#ffc01e' : '#ff375f' }}>
                {currentTask?.difficulty || "Easy"}
              </span>
            </div>

            <div className="activity-card" style={{ lineHeight: '1.7', fontSize: '0.95rem', backgroundColor: 'transparent', border: 'none', padding: '0', color: '#2f2f2f' }}>
              {renderFormattedTask(currentTask?.task || (typeof activityData.task === "string" ? activityData.task : "Complete the algorithm requested in the workspace."))}
            </div>
          </div>
        </aside>

        <main className="workspace-main activity-center-panel">
          <button className={`sidebar-toggle-btn ${!isLeftPanelVisible ? 'closed' : ''}`} onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} title={isLeftPanelVisible ? "Hide Instructions" : "Show Instructions"}>
            <span className="toggle-icon">{isLeftPanelVisible ? '❮' : '❯'}</span>
          </button>

          <div className="editor-container" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className={viewMode === 'workspace' ? 'workspace-view d-block' : 'workspace-view d-none'} style={{ display: viewMode === 'workspace' ? 'block' : 'none', height: '100%' }}>
              <BlocklyWorkspace ref={workspaceRef} onChange={handleWorkspaceChange} templatePath={initialTemplate} syntaxError={syntaxError} />
            </div>

            <div className={viewMode === 'python' ? 'python-view d-flex' : 'python-view d-none'} style={{ display: viewMode === 'python' ? 'flex' : 'none', flexDirection: 'column', height: '100%', background: '#1C1236' }}>
              <div className="python-header" style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <span className="python-sync-status" style={{ color: '#EBE4FF', fontSize: '0.85rem' }}>{isEditingCode ? "✏️ Unsaved code changes..." : "Code is synced with blocks."}</span>
                <button onClick={handleSyncToBlocks} disabled={!isEditingCode} className={`python-sync-btn ${isEditingCode ? 'active' : 'disabled'}`} style={{ padding: '5px 12px', borderRadius: '4px', cursor: isEditingCode ? 'pointer' : 'not-allowed', backgroundColor: isEditingCode ? '#6C5CE7' : '#444', color: 'white', border: 'none' }}>
                  Sync to Blocks ↻
                </button>
              </div>

              {/* --- MONACTO VSCODE EDITOR INTEGRATION --- */}
              <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                {syntaxError && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(231, 76, 60, 0.9)', color: 'white', padding: '6px 15px', zIndex: 10, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Syntax Error on line {syntaxError.line}: {syntaxError.message}</span>
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
              <div className="panel-resizer" onMouseDown={handleDragStart}>
                <div className="resizer-dash"></div>
              </div>

              <div className="panel-header">
                <span className="panel-title">{bottomPanel === 'console' ? 'Console Panel' : 'Complexity Analysis'}</span>
                <button onClick={() => setBottomPanel(null)} className="panel-close-btn">✕</button>
              </div>

              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                
                {/* === CONSOLE PANEL === */}
                {bottomPanel === 'console' ? (
                  <div className="console-content-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    
                    <div className="complexity-tabs" style={{ padding: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '10px', flexShrink: 0 }}>
                      <div className="tab-btn-group">
                        <button onClick={() => setConsoleTab("output")} className={`tab-btn ${consoleTab === 'output' ? 'active' : ''}`}>Terminal Output</button>
                        <button onClick={() => setConsoleTab("executions")} className={`tab-btn ${consoleTab === 'executions' ? 'active' : ''}`}>Line Executions</button>
                      </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                      {consoleTab === 'output' ? (
                        <div className="console-container" style={{ height: '100%' }}>
                          <pre className="console-output">{consoleOutput}</pre>
                          {isWaitingForInput && (
                            <div className="console-input-line">
                              <span className="console-cursor">❯</span>
                              <input
                                autoFocus
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyDown={handleSendInput}
                                className="console-input-field"
                                placeholder="Type here and press Enter..."
                              />
                            </div>
                          )}
                          <div ref={consoleEndRef} />
                        </div>
                      ) : (
                        <div className="complexity-table-wrapper" style={{ height: '100%', margin: 0, border: 'none' }}>
                          <table className="complexity-table">
                            <thead>
                              <tr>
                                <th style={{ width: '60px', textAlign: 'center' }}>Line</th>
                                <th>Source Code</th>
                                <th style={{ width: '100px', textAlign: 'center' }}>Hits</th>
                                <th style={{ width: '30%' }}>Frequency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pythonLines.map((lineText, idx) => {
                                const lineNum = idx + 1;
                                const hits = lineExecutions[lineNum] || 0;
                                return (
                                  <tr key={idx} style={{ backgroundColor: hits > 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent' }}>
                                    <td style={{ color: '#888', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>{lineNum}</td>
                                    <td style={{ fontFamily: "'Fira Code', monospace", whiteSpace: 'pre', color: '#000000', paddingLeft: '15px' }}>
                                      {lineText || " "}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: hits > 0 ? '#00b8a3' : '#555' }}>
                                      {hits > 0 ? hits : '-'}
                                    </td>
                                    <td style={{ paddingRight: '20px' }}>
                                      {hits > 0 && maxExecutions > 0 && (
                                        <div style={{
                                          height: '8px',
                                          width: `${(hits / maxExecutions) * 100}%`,
                                          backgroundColor: hits === maxExecutions ? '#ff375f' : '#00b8a3',
                                          borderRadius: '4px',
                                          transition: 'width 0.5s ease-out',
                                          boxShadow: hits === maxExecutions ? '0 0 8px rgba(255, 55, 95, 0.5)' : 'none'
                                        }} title={`${Math.round((hits / maxExecutions) * 100)}% of max execution load`} />
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  
                  /* === COMPLEXITY PANEL === */
                  <div className="complexity-content">
                    <div className="complexity-tabs">
                      <div className="tab-btn-group">
                        <button onClick={() => { setActiveTab("local"); setExpandedLines({}); }} className={`tab-btn ${activeTab === 'local' ? 'active' : ''}`}>Local Complexity</button>
                        <button onClick={() => { setActiveTab("global"); setExpandedLines({}); }} className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}>Global Complexity</button>
                        <button onClick={() => { setActiveTab("memory"); setExpandedLines({}); }} className={`tab-btn ${activeTab === 'memory' ? 'active' : ''}`}>Memory Map</button>
                      </div>
                      <div className="total-badge-group">
                        <span className="total-badge"><span className="total-label">Total Time:</span> <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatComplexity(analysisResult.total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(0, 184, 163, 0.15)', color: '#00b8a3', border: '1px solid rgba(0, 184, 163, 0.3)' }}><span className="total-label" style={{ color: '#00b8a3' }}>Total Space:</span> <span style={{ fontSize: "20px", fontWeight: "bold" }}>{formatComplexity(analysisResult.space_total)}</span></span>
                        <span className="total-badge" style={{ backgroundColor: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)' }}><span className="total-label" style={{ color: '#c275e0' }}>Analysis:</span> <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#db7fff"}}>{analysisTime} ms</span></span>
                      </div>
                    </div>
                    
                    {activeTab === 'memory' ? (
                      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 15px' }}>
                        <MemoryVisualizer
                          analysisData={analysisResult.lines}
                          currentStep={analysisResult.lines.length > 0 ? analysisResult.lines.length - 1 : 0}
                        />
                      </div>
                    ) : (
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
                              const timeExp = line.time_explanation ?? line.local_explanation ?? "Time complexity analysis not available.";
                              const spaceExp = line.space_explanation ?? line.global_explanation ?? "Space complexity analysis not available.";
                              const timeColor = getComplexityColor(timeComplexity);
                              const spaceColor = getComplexityColor(spaceComplexity);
                              const isBottleneck = actualBottleneckIndices.includes(i);

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
                                    </td>
                                    <td className="operation-cell" style={{ color: '#000000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {line.operation || '-'}

                                      {isBottleneck && (
                                        <span style={{
                                          backgroundColor: '#ff375f', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '3px 8px',
                                          borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '10px',
                                          boxShadow: '0 0 8px rgba(255, 55, 95, 0.6)', animation: 'pulse 1.5s infinite'
                                        }} title="Highest computational weight detected">
                                          🔥 Bottleneck
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
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <footer className="workspace-footer">
            <div className="footer-left">
              <button
                className={`footer-tab ${bottomPanel === 'console' ? 'active' : ''}`}
                onClick={() => setBottomPanel(bottomPanel === 'console' ? null : 'console')}
              >
                <img src="/assets/console-icon.png" alt="Console" className="tab-icon" /> Console
              </button>
              <button
                className={`footer-tab ${bottomPanel === 'complexity' ? 'active' : ''}`}
                onClick={() => setBottomPanel(bottomPanel === 'complexity' ? null : 'complexity')}
              >
                <img src="/assets/complexity-icon.png" alt="Complexity" className="tab-icon" /> Complexity
              </button>
              <button
                className="footer-tab big-o-btn"
                onClick={() => setIsBigOModalOpen(true)}
              >
                <img src="/assets/table-icon.png" alt="Reference" className="tab-icon" /> Big O Reference
              </button>
            </div>

            <div className="footer-right">
              <button className="footer-action-icon" onClick={() => {
                setModalConfig({
                  isOpen: true,
                  title: "Restart Activity?",
                  message: "Are you sure you want to restart this activity? Your progress will be lost.",
                  confirmText: "Restart",
                  isDanger: true,
                  onConfirmAction: () => {
                    window.location.reload();
                  }
                });
              }} title="Restart Activity">
                <img src="/assets/recursive-icon.png" alt="Restart" />
              </button>
            </div>
          </footer>
        </main>

        <aside className="activity-right-panel">
          <div className="activity-panel-header">
            <h3>Test Cases</h3>
            <span className="test-cases-counter">{passedTests}/{totalTests} passed</span>
          </div>

          <div className="activity-panel-content">
            {activityData.testCasesList?.map((tc, i) => {
              const testIdentifier = `Test ${i + 1}`;
              const isPassing = consoleOutput.includes(`${testIdentifier}: PASSED`);
              const isFailing = consoleOutput.includes(`${testIdentifier}: FAILED`);
              const isError = consoleOutput.includes(`${testIdentifier}: ERROR`);

              const isExpanded = expandedTests[i];
              const statusClass = isPassing ? 'passing' : (isFailing || isError) ? 'failing' : '';

              return (
                <div key={i} className={`test-case-card ${statusClass}`}>

                  <div className="test-case-header" onClick={() => toggleTest(i)}>
                    <div className="test-case-header-left">
                      <div className={`test-case-indicator ${statusClass}`}></div>
                      <strong className="test-case-title">Test {i + 1}</strong>
                    </div>
                    <span className={`test-case-chevron ${isExpanded ? 'open' : ''}`}>❯</span>
                  </div>

                  {isExpanded && (
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
                          <span style={{ fontWeight: 'bold', color: isPassing ? '#27AE60' : '#e74c3c' }}>
                            {isPassing ? 'Passed' : isFailing ? 'Failed (Incorrect Output)' : 'Failed (Syntax Error)'}
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
        isDanger={modalConfig.isDanger}
        onCancel={closeModal}
        onConfirm={modalConfig.onConfirmAction}
      />

      <BigOModal
        isOpen={isBigOModalOpen}
        onClose={() => setIsBigOModalOpen(false)}
      />

    </div>
  );
};

export default ActivityApp;