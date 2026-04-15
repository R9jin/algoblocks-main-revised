import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/ActivityApp.css";

import Split from "react-split";
import BigOModal from "../components/BigOModal.jsx";
import ComplexityGraph from '../components/ComplexityGraph.jsx';
import ConfirmModal from "../components/ConfirmModal.jsx";
// ADD THIS IMPORT:
import BlocklyWorkspace from "../components/BlocklyWorkspace.jsx";
import { formatComplexity } from "../utils/formatters";

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
    // ADD THIS TEST CASE ARRAY:
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
    // New Test Cases for Topic 3
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

const ActivityApp = () => {
  const VERCEL_URL = import.meta.env.VITE_BACKEND_URL || "";
  const RENDER_URL = import.meta.env.VITE_RENDER_URL || "";
  // =========================================================
  // 1. ROUTING + REFS
  // =========================================================
  const location = useLocation();
  const navigate = useNavigate();

  const workspaceRef = useRef(null);
  const consoleEndRef = useRef(null);
  const socketRef = useRef(null);
  const isDragging = useRef(false);
  const hasLoadedRef = useRef(false);

  // =========================================================
  // 2. DERIVED DATA
  // =========================================================
  const activityData = location.state?.activityData || null;

  const initialTemplate =
    location.state?.templatePath ||
    location.state?.activityData?.templatePath ||
    "";

  const currentTask = ACTIVITY_TASKS.find(
    (t) => t.templatePath === initialTemplate
  );

  const totalTests = activityData?.testCasesList?.length || 0;

  // =========================================================
  // 3. UI STATE
  // =========================================================
  const [generatedPython, setGeneratedPython] = useState(
    "# Drag blocks to generate Python code"
  );
  const [consoleOutput, setConsoleOutput] = useState("");
  const [viewMode, setViewMode] = useState("workspace");
  const [passedTests, setPassedTests] = useState(0);

  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [expandedTests, setExpandedTests] = useState({ 0: true });
  const [bottomPanel, setBottomPanel] = useState(null);
  const [activeTab, setActiveTab] = useState("local");

  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");

  const [analysisResult, setAnalysisResult] = useState({
    lines: [],
    total: "O(1)",
    space_total: "O(1)",
    is_recursive: false,
  });

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    isDanger: false,
    onConfirmAction: null,
  });

  const [isEditingCode, setIsEditingCode] = useState(false);
  const [syntaxError, setSyntaxError] = useState(null);

  const [isBigOModalOpen, setIsBigOModalOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});

  const [panelHeight, setPanelHeight] = useState(300);

  // =========================================================
  // 4. UI HELPERS
  // =========================================================
  const toggleLine = (index) => {
    setExpandedLines((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const closeModal = () =>
    setModalConfig({ ...modalConfig, isOpen: false });

  const handleDragStart = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  // =========================================================
  // 5. EFFECTS (LIFECYCLE)
  // =========================================================

  // redirect if no data
  useEffect(() => {
    if (!activityData) navigate("/learning-path");
  }, [activityData, navigate]);

  // auto scroll terminal
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleOutput, isWaitingForInput]);

  // resize panel drag logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;

      const newHeight =
        window.innerHeight - e.clientY - 48;

      if (
        newHeight >= 150 &&
        newHeight <= window.innerHeight - 150
      ) {
        setPanelHeight(newHeight);
      }
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

  // analysis effect
  useEffect(() => {
    if (!isEditingCode) return;

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`${VERCEL_URL}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: generatedPython }),
        });

        const data = await response.json();

        if (data.status === "success") {
          setAnalysisResult({
            total: data.total,
            space_total: data.space_total || "O(1)",
            lines: data.lines || [],
            is_recursive: data.is_recursive || false,
          });

          setSyntaxError(null);
        } else if (
          data.status === "error" &&
          data.error_type === "SyntaxError"
        ) {
          setSyntaxError({
            line: data.line,
            message: data.message,
          });

          setAnalysisResult({
            lines: [],
            total: "Syntax Error",
            space_total: "-",
            is_recursive: false,
          });
        }
      } catch (error) {
        console.error("Analysis Error:", error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [generatedPython, isEditingCode]);

  // template loader (single version kept)
  useEffect(() => {
    if (!initialTemplate || !activityData) return;
    if (hasLoadedRef.current) return;

    hasLoadedRef.current = true;

    const timer = setTimeout(() => {
      loadActivityTemplate(initialTemplate, activityData);
    }, 300);

    return () => clearTimeout(timer);
  }, [initialTemplate, activityData]);

  // =========================================================
  // 6. CORE FUNCTIONS
  // =========================================================

  const saveLessonProgress = async (lessonId, score) => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    const user = JSON.parse(storedUser);

    try {
      const response = await fetch(`${VERCEL_URL}/api/update-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          lesson_id: lessonId,
          score,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        user.progress = data.progress;
        localStorage.setItem("user", JSON.stringify(user));
      }
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
  };

  const handleSuccess = (passed, total) => {
    setModalConfig({
      isOpen: true,
      title: "Activity Completed! 🎉",
      message: `Excellent work! You successfully passed all ${passed} out of ${total} test cases.`,
      confirmText: "Return to Dashboard",
      isDanger: false,
      onConfirmAction: () => {
        closeModal();
        navigate("/learning-path");
      },
    });
  };

  const loadActivityTemplate = async (path, dataFromState) => {
    try {
      let json = null;

      // 1. Fetch the JSON data
      if (dataFromState && dataFromState.blocks) {
        json = dataFromState;
      } else if (path) {
        const fetchUrl = path.startsWith("activities/")
          ? `/${path}.json`
          : `/templates/${path}.json`;

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`404: ${fetchUrl}`);
        json = await response.json();
      }

      if (!json) return;

      // 2. Safe Polling: Wait for Blockly to finish mounting before loading
      const tryLoad = (retries = 15) => {
        if (!workspaceRef.current) {
          if (retries > 0) {
            // Workspace not ready yet, wait 100ms and try again
            setTimeout(() => tryLoad(retries - 1), 100);
          } else {
            console.error("❌ Workspace took too long to initialize.");
          }
          return;
        }

        // 3. Workspace is ready! Load the blocks.
        try {
          if (workspaceRef.current.clear) workspaceRef.current.clear();

          // Ensure we pass the correct root object
          const payload = json.data ? json.data : json;
          workspaceRef.current.loadTemplate(payload);

          setViewMode("workspace");
          setIsEditingCode(false);
        } catch (err) {
          console.error("❌ Error applying template:", err);
        }
      };

      tryLoad(); // Start the loading loop

    } catch (error) {
      console.error("Failed to load template:", error);
    }
  };

  const handleWorkspaceChange = async (json, pythonCode) => {
    if (!isEditingCode) {
      setGeneratedPython(pythonCode);
    }

    try {
      const response = await fetch(`${VERCEL_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pythonCode }),
      });

      const data = await response.json();

      if (data.status === "success") {
        setAnalysisResult({
          total: data.total,
          space_total: data.space_total || "O(1)",
          lines: data.lines || [],
          is_recursive: data.is_recursive || false,
        });

        setSyntaxError(null);
      }
    } catch (error) {
      console.error("Analysis Error:", error);
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
          isDanger: true,
          onConfirmAction: closeModal,
        });
      }
    }
  };

  const runStandardCode = async () => {
    setConsoleOutput("> Running on Vercel (Non-interactive mode)...\n");
    setBottomPanel("console");

    try {
      const response = await fetch(`${VERCEL_URL}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: generatedPython }),
      });

      const data = await response.json();
      setConsoleOutput(data.output || "> Program finished with no output.");
    } catch (error) {
      setConsoleOutput("❌ Vercel execution failed. Fallback to local if running locally.");
    }
  };

  const handleActivityRun = () => {
    const hasInput = generatedPython.includes("input(") || generatedPython.includes("input()");
    if (hasInput) {
      runCode(); // Hits Render WebSocket
    } else {
      runStandardCode(); // Hits Vercel standard API
    }
  };

  const runCode = () => {
    // =========================
    // UI RESET (RUN START)
    // =========================
    setConsoleOutput("> Initializing session...\n");
    setBottomPanel("console");
    setIsWaitingForInput(false); // reset input state immediately

    // =========================
    // SOCKET SETUP
    // =========================
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || `wss://algoblocks-main.onrender.com/api/ws/run`;
    const socket = new WebSocket(wsUrl);

    socketRef.current = socket;

    // =========================
    // CONNECTION OPEN
    // =========================
    socket.onopen = () => {
      console.log("✅ Connected");

      // FIX: DO NOT clear console here anymore (prevents race condition)
      socket.send(
        JSON.stringify({
          type: "run",
          code: generatedPython
        })
      );
    };

    // =========================
    // MESSAGE HANDLER
    // =========================
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "output") {
        setConsoleOutput((prev) => prev + msg.data);
      }

      else if (msg.type === "input_request") {
        setConsoleOutput((prev) => prev + msg.prompt);
        setIsWaitingForInput(true);
      }

      else if (msg.type === "error") {
        setConsoleOutput((prev) => prev + "\nRuntime Error: " + msg.data);
        setIsWaitingForInput(false);
      }

      else if (msg.type === "done") {
        setConsoleOutput((prev) => prev + "\n> Program finished.");
        setIsWaitingForInput(false);
        socket.close();
      }
    };

    // =========================
    // ERROR HANDLING
    // =========================
    socket.onerror = (e) => {
      console.error("❌ WebSocket error:", e);
      setConsoleOutput("❌ Failed to connect to backend.");
      setIsWaitingForInput(false);
    };

    socket.onclose = () => {
      console.log("⚠️ Socket closed");
    };
  };

  const toggleTest = (index) => {
    setExpandedTests((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const runTestCases = async () => {
    const testCases =
      currentTask?.testCasesList ||
      activityData?.testCasesList;

    if (!testCases) return;

    setBottomPanel("console");
    setConsoleOutput("> Running Tests...\n");
    setPassedTests(0);

    let passed = 0;
    const total = testCases.length;

    let fullOutput = "> --- Running Test Cases ---\n";
    let newExpanded = { ...expandedTests };

    for (let i = 0; i < total; i++) {
      const tc = testCases[i];

      let codeToRun = "";
      const isFunctionCall =
        tc.call?.includes("(") && tc.call?.includes(")");

      const taskId =
        currentTask?.id || activityData?.id || "";

      const isIntroLevel =
        taskId === "l1-t1" || taskId === "l1-t3";

      // =========================
      // CODE GENERATION LOGIC
      // =========================
      if (isFunctionCall && !isIntroLevel) {
        codeToRun =
          generatedPython +
          `\n\ntry:\n    assert ${tc.call} == ${tc.expected}\n    print("TEST_PASSED_FLAG")\nexcept:\n    print("TEST_ERROR_FLAG")`;
      } else {
        codeToRun = `${generatedPython}\n${tc.call || ""}`;
      }

      // Inside runTestCases() loop:
      try {
        const response = await fetch(`${VERCEL_URL}/api/run`, { // <-- CHANGE THIS from RENDER_URL
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeToRun }),
        });

        const data = await response.json();

        const rawOutput = (data.output || "")
          .replace("> Code ran successfully.", "")
          .trim();

        const actualOutput = rawOutput;

        // =========================
        // EXPECTED VALUE HANDLING
        // =========================
        const expected = String(tc.expected)
          .replace(/^['"]|['"]$/g, "")
          .replace(/\\n/g, "\n")
          .trim();

        let testPassed = false;

        // =========================
        // EVALUATION LOGIC
        // =========================
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

        // =========================
        // OUTPUT LOGGING (NEW FIX)
        // =========================
        fullOutput += `Test ${i + 1}: ${testPassed ? "PASSED" : "FAILED"}\n`;

        if (!testPassed) {
          fullOutput += `   Expected: ${expected}\n`;
          fullOutput += `   Actual: ${actualOutput}\n`;
        }

        fullOutput += `\n`;

        setConsoleOutput(fullOutput);
        setPassedTests(passed);

        // =========================
        // PROGRESS SAVE
        // =========================
        const lessonId =
          initialTemplate?.split("/").pop() || "unknown";

        saveLessonProgress(lessonId, passed);

        // =========================
        // SUCCESS CHECK
        // =========================
        if (passed === total && total > 0) {
          handleSuccess(passed, total);
        }

      } catch (err) {
        fullOutput += `Test ${i + 1}: ERROR\n`;
        fullOutput += `   Message: ${err.message}\n\n`;

        setConsoleOutput(fullOutput);
      }
    }
  };

  return (
    <div className="activity-app-container">

      <header className="activity-topbar">
        <div className="activity-back-btn" onClick={() => navigate('/learning-path')}>
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Dashboard
        </div>

        <div className="activity-toggle-group">
          <button
            className={`activity-toggle-btn ${viewMode === 'workspace' ? 'active' : ''}`}
            onClick={() => setViewMode('workspace')}
          >
            Workspace
          </button>
          <button
            className={`activity-toggle-btn ${viewMode === 'python' ? 'active' : ''}`}
            onClick={() => setViewMode('python')}
          >
            Python Code
          </button>
        </div>

        <div className="activity-actions" style={{ display: 'flex', gap: '10px' }}>
          <button
            className="activity-action-btn"
            onClick={handleActivityRun}
            style={{ backgroundColor: '#2D234A', border: '1px solid #6C5CE7', color: '#EBE4FF' }}
            title="Run code in console without submitting to test cases"
          >
            ▷ Run Code
          </button>
          <button className="activity-action-btn run-btn" onClick={runTestCases}>
            ▶ Run Tests
          </button>
        </div>
      </header>

      <Split
        className={`activity-main-layout ${!isLeftPanelVisible ? 'left-hidden' : ''}`}
        sizes={[25, 50, 25]}
        minSize={[isLeftPanelVisible ? 250 : 0, 400, 250]}
        gutterSize={8}
      >

        <aside className="activity-left-panel">
          <div className="activity-panel-header">
            <h2>
              <img src="/assets/console-icon.png" alt="Icon" style={{ width: '24px' }} />
              Description
            </h2>
          </div>

          <div className="activity-panel-content">
            <div className="activity-task-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', marginTop: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#2b005c', fontWeight: 'bold' }}>
                {currentTask?.title || activityData.title || "Activity"}
              </h2>
              <span style={{
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                backgroundColor: currentTask?.difficulty === 'Easy' ? 'rgba(0, 184, 163, 0.15)' : currentTask?.difficulty === 'Medium' ? 'rgba(255, 192, 30, 0.15)' : 'rgba(255, 55, 95, 0.15)',
                color: currentTask?.difficulty === 'Easy' ? '#00b8a3' : currentTask?.difficulty === 'Medium' ? '#ffc01e' : '#ff375f'
              }}>
                {currentTask?.difficulty || "Easy"}
              </span>
            </div>

            <div className="activity-card" style={{
              lineHeight: '1.7',
              fontSize: '0.95rem',
              backgroundColor: 'transparent',
              border: 'none',
              padding: '0',
              color: '#2f2f2f'
            }}>
              {renderFormattedTask(
                currentTask?.task ||
                (typeof activityData.task === "string" ? activityData.task : "Complete the algorithm requested in the workspace.")
              )}
            </div>
          </div>
        </aside>

        <main className="workspace-main activity-center-panel">

          <button
            className={`sidebar-toggle-btn ${!isLeftPanelVisible ? 'closed' : ''}`}
            onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)}
            title={isLeftPanelVisible ? "Hide Instructions" : "Show Instructions"}
          >
            <span className="toggle-icon">{isLeftPanelVisible ? '❮' : '❯'}</span>
          </button>

          {/* ADD THE EDITOR CONTAINER WRAPPER */}
          <div className="editor-container" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* ADD THIS MISSING WORKSPACE VIEW */}
            <div className={viewMode === 'workspace' ? 'workspace-view d-block' : 'workspace-view d-none'}
              style={{ display: viewMode === 'workspace' ? 'block' : 'none', height: '100%' }}>
              <BlocklyWorkspace
                ref={workspaceRef}
                onChange={handleWorkspaceChange}
                templatePath={initialTemplate}
                syntaxError={syntaxError}
              />
            </div>

            {/* EXISTING PYTHON VIEW */}
            <div className={viewMode === 'python' ? 'python-view d-flex' : 'python-view d-none'}
              style={{ display: viewMode === 'python' ? 'flex' : 'none', flexDirection: 'column', height: '100%', background: '#1C1236' }}>

              <div className="python-header" style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <span className="python-sync-status" style={{ color: '#EBE4FF', fontSize: '0.85rem' }}>
                  {isEditingCode ? "✏️ Unsaved code changes..." : "Code is synced with blocks."}
                </span>
                <button
                  onClick={handleSyncToBlocks}
                  disabled={!isEditingCode}
                  className={`python-sync-btn ${isEditingCode ? 'active' : 'disabled'}`}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '4px',
                    cursor: isEditingCode ? 'pointer' : 'not-allowed',
                    backgroundColor: isEditingCode ? '#6C5CE7' : '#444',
                    color: 'white',
                    border: 'none'
                  }}
                >
                  Sync to Blocks ↻
                </button>
              </div>

              <div style={{ position: 'relative', flex: 1, overflowY: 'auto' }}>
                {syntaxError && (
                  <div style={{
                    position: 'absolute',
                    top: `${(syntaxError.line - 1) * 24 + 20}px`,
                    left: 0, right: 0, height: '24px',
                    backgroundColor: 'rgba(231, 76, 60, 0.15)',
                    borderLeft: '4px solid #E74C3C',
                    pointerEvents: 'none', zIndex: 1
                  }}>
                    <span style={{ color: '#E74C3C', position: 'absolute', right: '20px', fontSize: '0.8rem', fontStyle: 'italic', fontWeight: 'bold' }}>
                      ⚠️ {syntaxError.message}
                    </span>
                  </div>
                )}

                <textarea
                  value={generatedPython}
                  onChange={(e) => {
                    setGeneratedPython(e.target.value);
                    setIsEditingCode(true);
                    if (syntaxError) setSyntaxError(null);
                  }}
                  spellCheck={false}
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: '100%',
                    margin: 0,
                    padding: '20px',
                    fontSize: '15px',
                    fontFamily: "'Fira Code', Consolas, Monaco, monospace",
                    background: 'transparent',
                    color: '#EBE4FF',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    whiteSpace: 'pre',
                    lineHeight: '24px',
                    zIndex: 2,
                    position: 'relative'
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
                  <div className="complexity-content">
                    <div className="complexity-tabs" style={{ justifyContent: 'space-between', padding: '0 15px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => { setActiveTab("local"); setExpandedLines({}); }}
                          className={`tab-btn ${activeTab === 'local' ? 'active' : ''}`}>
                          Local Complexity
                        </button>
                        <button
                          onClick={() => { setActiveTab("global"); setExpandedLines({}); }}
                          className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}>
                          Global Complexity
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <span className="total-badge">
                          <span className="total-label">Total Time:</span>{" "}
                          <span style={{ fontSize: "1.3rem", fontWeight: "bold" }}>
                            {formatComplexity(analysisResult.total)}
                          </span>
                        </span>
                        <span
                          className="total-badge"
                          style={{
                            backgroundColor: 'rgba(0, 184, 163, 0.15)',
                            color: '#00b8a3',
                            border: '1px solid rgba(0, 184, 163, 0.3)'
                          }}
                        >
                          <span className="total-label" style={{ color: '#00b8a3' }}>
                            Total Space:
                          </span>{" "}
                          <span style={{ fontSize: "20px", fontWeight: "bold" }}>
                            {formatComplexity(analysisResult.space_total)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="complexity-table-wrapper" style={{ overflowX: 'auto' }}>
                      <table className="complexity-table" style={{ width: '100%', minWidth: '800px', textAlign: 'left' }}>
                        <thead>
                          <tr>
                            <th>Line of Code</th>
                            <th>Operation</th>
                            <th>{activeTab === 'local' ? 'Local Time' : 'Global Time'}</th>
                            <th>{activeTab === 'local' ? 'Local Space' : 'Global Space'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.lines.map((row, i) => {
                            const explanationText = activeTab === 'local' ? row.local_explanation : row.global_explanation;
                            return (
                              <React.Fragment key={i}>
                                <tr
                                  className={`complexity-row ${expandedLines[i] ? 'expanded' : ''}`}
                                  onClick={() => toggleLine(i)}
                                  style={{ cursor: explanationText ? 'pointer' : 'default' }}
                                  title="Click to view explanation"
                                >
                                  <td className="code-cell" style={{ color: row.color || 'white', paddingLeft: `${((row.indent || 0) * 15) + 20}px` }}>
                                    {row.lineOfCode}
                                  </td>
                                  <td style={{ color: '#000000' }}>{row.operation || '-'}</td>
                                  <td className="complexity-cell" style={{ fontWeight: activeTab === 'global' ? 'bold' : 'normal' }}>
                                    {formatComplexity(activeTab === 'local' ? row.local_time : row.global_time)}
                                  </td>
                                  <td className="complexity-cell" style={{ fontWeight: activeTab === 'global' ? 'bold' : 'normal' }}>
                                    {formatComplexity(activeTab === 'local' ? row.local_space : row.global_space)}
                                    {explanationText && (
                                      <span className="dropdown-chevron" style={{ marginLeft: '10px' }}>
                                        {expandedLines[i] ? '▼' : '▶'}
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                {expandedLines[i] && explanationText && (
                                  <tr className="explanation-row">
                                    <td colSpan="4">
                                      <div className="explanation-content">
                                        <img src="/assets/lightbulb-icon.png" alt="Lightbulb" className="tab-icon" />
                                        <p>{explanationText}</p>
                                        <ComplexityGraph
                                          complexity={row.global_time}
                                          color={row.color}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
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
                className="footer-tab"
                onClick={() => setIsBigOModalOpen(true)}
                style={{ color: '#ffffff', fontWeight: 'bold' }}
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
              const isPassing = consoleOutput.includes(`${testIdentifier} Passed`);
              const isFailing = consoleOutput.includes(`${testIdentifier} Failed`);
              const isError = consoleOutput.includes(`${testIdentifier} Error`);

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