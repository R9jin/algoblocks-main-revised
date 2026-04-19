import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import ComplexityGraph from '../components/ComplexityGraph.jsx';
import ConfirmModal from "../components/ConfirmModal.jsx";
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
  const VERCEL_URL = import.meta.env.VITE_BACKEND_URL || "";

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

  const [isEvaluating, setIsEvaluating] = useState(false);
  const activityData = location.state?.activityData || null;
  const initialTemplate = location.state?.templatePath || location.state?.activityData?.templatePath || "";
  const currentTask = ACTIVITY_TASKS.find((t) => t.templatePath === initialTemplate);
  const totalTests = activityData?.testCasesList?.length || 0;

  const [generatedPython, setGeneratedPython] = useState("# Drag blocks to generate Python code");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);

  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [expandedTests, setExpandedTests] = useState({ 0: true });
  const [bottomPanel, setBottomPanel] = useState(null);
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
        setConsoleOutput(prev => prev + flushed + "\nRuntime Error: " + data + (hint ? `\n${hint}\n` : ""));
        
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
  useEffect(() => { if (consoleEndRef.current) { consoleEndRef.current.scrollIntoView({ behavior: "smooth" }); } }, [consoleOutput, isWaitingForInput]);

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

  useEffect(() => {
    if (!isEditingCode || !workerRef.current) return;
    const timeoutId = setTimeout(() => {
      analysisStartTimeRef.current = performance.now();
      workerRef.current.postMessage({ type: 'ANALYZE_CODE', code: generatedPython });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [generatedPython, isEditingCode]);

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
    } catch (error) {}
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
        } catch (err) {}
      };
      tryLoad();
    } catch (error) {}
  };

  const handleWorkspaceChange = async (json, pythonCode) => {
    if (!isEditingCode) setGeneratedPython(pythonCode);
    setLineExecutions({}); 

    if (workerRef.current && pythonCode.trim() !== "") {
      analysisStartTimeRef.current = performance.now();
      workerRef.current.postMessage({ type: 'ANALYZE_CODE', code: pythonCode });
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

  const handleActivityRun = () => {
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

  const toggleTest = (index) => { setExpandedTests((prev) => ({ ...prev, [index]: !prev[index] })); };

  const runTestCases = async () => {
    if (isEvaluating) return;

    const testCases = currentTask?.testCasesList || activityData?.testCasesList;
    if (!testCases) return;

    if (!generatedPython || generatedPython.trim() === "" || generatedPython === "# Drag blocks to generate Python code") {
      setConsoleOutput("Error: No code to execute.");
      setBottomPanel("console");
      return;
    }

    setIsEvaluating(true);
    setLineExecutions({}); 
    setConsoleOutput("Running pre-flight checks (Detecting infinite loops)...\n");
    setBottomPanel("console");

    try {
      await executeTestOffline(generatedPython);
    } catch (failure) {
      setConsoleOutput(`Test Execution Prevented:\n\n${failure.error || failure.message}`);
      setBottomPanel("console");
      setIsEvaluating(false);
      return;
    }

    setBottomPanel("console");
    setConsoleOutput("> Running Tests...\n");
    setPassedTests(0);

    let passed = 0;
    const total = testCases.length;
    let fullOutput = "> --- Running Test Cases ---\n";

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
        const rawOutput = await executeTestOffline(codeToRun);
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

        setConsoleOutput(