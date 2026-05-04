// frontend/src/pages/LearningPath.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import "../styles/LearningPath.css";

// --- 1. TEST CASE GENERATORS ---

const generateFactorialTest = (testCount) => {
  const tests = [];
  const usedNumbers = new Set();

  while (tests.length < testCount) {
    const n = Math.floor(Math.random() * 7) + 1;
    if (!usedNumbers.has(n)) {
      usedNumbers.add(n);
      let expected = 1;
      for (let i = 1; i <= n; i++) expected *= i;
      tests.push({ call: `factorial(${n})`, expected: `${expected}` });
    }
  }
  return tests;
};

const generateFibonacciTest = (testCount) => {
  const tests = [];
  const usedNumbers = new Set();
  const fib = (x) => (x <= 1 ? x : fib(x - 1) + fib(x - 2));

  while (tests.length < testCount) {
    const n = Math.floor(Math.random() * 10) + 1;
    if (!usedNumbers.has(n)) {
      usedNumbers.add(n);
      tests.push({ call: `fibonacci(${n})`, expected: `${fib(n)}` });
    }
  }
  return tests;
};

const generateSortTest = (testCount, funcName) => {
  const tests = [];
  for (let i = 0; i < testCount; i++) {
    const len = Math.floor(Math.random() * 6) + 3;
    const arr = Array.from({ length: len }, () => Math.floor(Math.random() * 50));
    const sortedArr = [...arr].sort((a, b) => a - b);

    tests.push({
      call: `${funcName}([${arr.join(", ")}])`,
      expected: `[${sortedArr.join(", ")}]`
    });
  }
  return tests;
};

const generateSearchTest = (testCount, funcName) => {
  const tests = [];
  for (let i = 0; i < testCount; i++) {
    const len = Math.floor(Math.random() * 6) + 4;
    const arr = Array.from({ length: len }, () => Math.floor(Math.random() * 50)).sort((a, b) => a - b);

    let exists = Math.random() > 0.3;
    if (i === 0) exists = true;
    if (i === 1) exists = false;

    let target;
    let expected;

    if (exists) {
      const randomIndex = Math.floor(Math.random() * len);
      target = arr[randomIndex];
      expected = randomIndex;
    } else {
      target = 999;
      expected = -1;
    }

    tests.push({
      call: `${funcName}([${arr.join(", ")}], ${target})`,
      expected: `${expected}`
    });
  }
  return tests;
};

// --- 2. ELONGATED LESSONS DATA ---

const LESSONS = [
  {
    id: "l1",
    number: "LESSON 1",
    title: "Introduction to Algorithms",
    topics: [
      {
        id: "l1-t1",
        number: "TOPIC 1",
        title: "What is an Algorithm?",
        level: "beginner",
        teaching: `Welcome to the world of algorithms! Before writing any code, programmers must master the logic behind it.\n\nAn algorithm is essentially a set of step-by-step instructions for solving a problem or completing a task. You can think of an algorithm exactly like a recipe for preparing a meal—it lists the ingredients (inputs) and gives you exact steps to achieve the desired result (output). Algorithms are fundamental because they tell computers exactly what actions to take to complete a task.\n\nFor a sequence of instructions to truly be considered a formal algorithm, it must possess these five key characteristics:\n\n1. Input: It should have clearly defined inputs (or zero inputs).\n2. Output: It must produce at least one expected output.\n3. Definiteness (Clear and Unambiguous): Every step must be precisely defined, leaving no room for confusion.\n4. Finiteness: The algorithm must eventually end after a finite number of steps; it cannot run forever.\n5. Effectiveness: Each step must be basic enough that it can be carried out practically and within a finite amount of time.`,
        algorithmSteps: `The 5-Step Problem-Solving Process:\n\nStep 1: Understand the Problem\n        -> Identify knowns, unknowns, and edge cases.\nStep 2: Analyze the Problem\n        -> Break the problem into smaller components.\nStep 3: Design the Algorithm\n        -> Create a step-by-step plan (pseudocode or flowchart).\nStep 4: Implement the Solution\n        -> Convert your logic into an actual programming language.\nStep 5: Test and Evaluate\n        -> Check for correctness, efficiency, and robustness.`,
        references: [
          { text: "Introduction to Algorithms, Fourth Edition, Thomas H. Cormen, et al.", url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/" },
          { text: "Simplilearn: What is An Algorithm? Definition, Working, and Types", url: "https://www.simplilearn.com/tutorials/data-structure-tutorial/what-is-an-algorithm" },
          { text: "GeeksforGeeks: What is an Algorithm | Introduction to Algorithms", url: "https://www.geeksforgeeks.org/introduction-to-algorithms/" }
        ],
        task: "Familiarize yourself with the visual blocks. Connect a simple sequence of Output blocks to print 'Hello' and 'World'.",
        testCount: 1,
        templatePath: "activities/what_is_algo"
      },
      {
        id: "l1-t2",
        number: "TOPIC 2",
        title: "Logic & Flow",
        level: "beginner",
        teaching: `Now that we know what an algorithm is, how do we structure its logic? No matter how complex a computer program might seem, its flow is ultimately built on three fundamental concepts called control structures:\n\n1. Sequence: This is the most basic control structure. It simply means that programming instructions are executed line-by-line, in the exact order they are written. The code runs straight from top to bottom.\n2. Selection (Conditional): In programming, we often need to make decisions based on certain conditions. Selection lets the program choose different paths of execution, evaluating whether a condition is true or false (using keywords like 'if' and 'else').\n3. Iteration (Looping): Iteration refers to repeating a set of actions multiple times as long as a certain condition holds true. We use loops like 'for' or 'while' to efficiently execute repeated tasks.\n\nBy mastering sequence, selection, and iteration, you hold the building blocks to solve almost any logical challenge!`,
        algorithmSteps: `Translating Pseudocode to Execution\nProblem: Check if a number is Even or Odd.\n\nSTART\n  Input N\n  if (N modulo 2 == 0) then\n    Output "The number is Even" (Selection)\n  else\n    Output "The number is Odd" (Selection)\n  end if\nEND`,
        references: [
          { text: "Study.com: Basic Constructs in Programming", url: "https://study.com/academy/lesson/basic-constructs-in-programming-sequence-selection-iteration.html" },
          { text: "GeeksforGeeks: Control Structures in Programming Languages", url: "https://www.geeksforgeeks.org/control-structures-in-programming-languages/" }
        ],
        task: "Use an If-Else block to check a condition. If the condition is true, output 'Yes', otherwise output 'No'.",
        testCount: 2,
        templatePath: "activities/logic_flow_act"
      },
      {
        id: "l1-t3",
        number: "TOPIC 3",
        title: "Big O Notation",
        level: "beginner",
        teaching: `In computer science, we need a standardized way to compare the efficiency of different algorithms. This is where Big O notation comes in! Big O describes the worst-case scenario of an algorithm's execution time (Time Complexity) or memory usage (Space Complexity) as the input size grows.\n\nHere are the most common time complexities from fastest to slowest:\n\n1. O(1) - Constant Time: The algorithm takes the exact same amount of time regardless of the input size (e.g., accessing an array element by its index).\n2. O(log n) - Logarithmic Time: The algorithm's execution time grows very slowly as the input size increases, typically by repeatedly dividing the search area in half (e.g., Binary Search).\n3. O(n) - Linear Time: The execution time grows directly in proportion to the input size (e.g., checking every item in a list one by one).\n4. O(n²) - Quadratic Time: The execution time grows exponentially, usually seen when you have nested loops (e.g., checking every item against every other item).\n\nUnderstanding Big O helps us write code that scales effectively!`,
        algorithmSteps: `Analyzing an O(n) Algorithm:\n\nProblem: Print a string 'n' times.\n\nSTART\n  Input n\n  Set counter i = 0\n  WHILE i < n DO\n    Output "Step"\n    i = i + 1\n  END WHILE\nEND\n\nBecause the loop runs exactly 'n' times, the time complexity is strictly O(n).`,
        references: [
          { text: "FreeCodeCamp: Big O Notation - A Beginner's Guide", url: "https://www.freecodecamp.org/news/big-o-notation-why-it-matters-and-why-it-doesnt-1674cfa8a23c/" },
          { text: "GeeksforGeeks: Analysis of Algorithms | Big-O analysis", url: "https://www.geeksforgeeks.org/analysis-of-algorithms-set-3asymptotic-notations/" }
        ],
        task: `Build a simple algorithm with O(n) time complexity.\n\nGiven a number 'n', construct a loop that outputs the string "Step" exactly 'n' times.`,
        testCount: 4,
        templatePath: "activities/big_o_act"
      }
    ]
  },
  {
    id: "l2",
    number: "LESSON 2",
    title: "Brute Force Algorithms",
    topics: [
      {
        id: "l2-t1",
        number: "TOPIC 1",
        title: "Linear Search",
        level: "beginner",
        teaching: `Brute force (also called exhaustive search) is a straightforward problem-solving paradigm. Algorithms in this category systematically enumerate and check all possible candidate solutions until they find one that satisfies the problem. They rely on sheer computing power rather than clever shortcuts.\n\nLinear search (or sequential search) is a classic brute-force method used to find a value in an array or list. It simply checks each element one by one from the beginning until it finds the target. \n\nWhile it is perfectly simple and guaranteed to find a solution if one exists, it is highly inefficient for massive datasets. In the worst-case scenario (if the item is at the very end or doesn't exist), the algorithm must scan all 'n' elements, giving it a time complexity of O(n). However, it requires virtually no extra memory, resulting in an excellent space complexity of O(1).`,
        algorithmSteps: `Linear Search Procedure:\n\n1. Start at the first element (index i = 0) of the array A.\n2. Compare the current element A[i] with the target key.\n3. If they match, return the index i (Found!).\n4. If they do not match, move to the next element (i = i + 1).\n5. Repeat steps 2-4 until the end of the array is reached.\n6. If the array ends and the target is not found, return -1.`,
        references: [
          { text: "Khan Academy: Linear Search", url: "https://www.khanacademy.org/computing/computer-science/algorithms/intro-to-algorithms/a/linear-search" },
          { text: "Programiz: Linear Search Algorithm", url: "https://www.programiz.com/dsa/linear-search" }
        ],
        task: "Build a Linear Search using blocks: Use a Loop to iterate the array, Compare to check each element, and return the index if found.",
        testCount: 3,
        templatePath: "activities/linear_search_act",
        funcName: "linear_search",
        generator: generateSearchTest
      },
      {
        id: "l2-t2",
        number: "TOPIC 2",
        title: "Bubble Sort",
        level: "beginner",
        teaching: `Bubble sort is a simple, brute-force comparison-based sorting algorithm. It repeatedly steps through a list, compares adjacent elements, and swaps them if they are in the wrong order. \n\nIt gets its name because with each pass, the largest remaining value "bubbles up" to its correct position at the end of the list. Because it exhausts all possibilities without optimization, Bubble Sort is typically used as an educational stepping stone rather than in practical, real-world applications.\n\nPerformance Analysis:\n• Worst/Average Case Time Complexity: O(n²). For an array of size n, it makes roughly n² comparisons, making it incredibly slow for large lists.\n• Best Case Time Complexity: O(n). If the list is already sorted, an optimized version can stop early.\n• Space Complexity: O(1). It sorts the array "in-place", requiring no additional memory arrays.`,
        algorithmSteps: `Bubble Sort Procedure:\n\n1. Make multiple passes over the array from start to end.\n2. On each pass, iterate through the unsorted portion of the array.\n3. Compare adjacent elements A[j] and A[j+1].\n4. If A[j] > A[j+1], swap their positions.\n5. After one full pass, the largest element is locked in place at the end.\n6. Repeat the process for the remaining elements.\n7. (Optimization) If a full pass occurs with ZERO swaps, the array is sorted. Stop early!`,
        references: [
          { text: "GeeksforGeeks: Bubble Sort Algorithm", url: "https://www.geeksforgeeks.org/bubble-sort/" },
          { text: "HackerEarth: Sorting Algorithms - Bubble Sort", url: "https://www.hackerearth.com/practice/algorithms/sorting/bubble-sort/tutorial/" }
        ],
        task: "Build a Bubble Sort using nested loops and an if-condition to swap elements that are out of order.",
        testCount: 3,
        templatePath: "activities/bubble_sort_act",
        funcName: "bubble_sort",
        generator: generateSortTest
      },
      {
        id: "l2-t3",
        number: "TOPIC 3",
        title: "Selection Sort",
        level: "beginner",
        teaching: `Selection sort is a straightforward brute-force sorting algorithm that works by dividing the input array into two parts: a sorted subarray built up from left to right at the front, and an unsorted subarray taking up the rest of the space. It repeatedly finds the absolute minimum element from the unsorted part and swaps it with the leftmost unsorted element.\n\nPerformance Analysis:\n• Worst/Average/Best Case Time Complexity: O(n²). It always scans the entire remaining array to find the minimum, regardless of whether the array is already sorted.\n• Space Complexity: O(1). It sorts in-place.`,
        algorithmSteps: `Selection Sort Procedure:\n\n1. Iterate through the array from index 0 to n-1.\n2. Treat the current index 'i' as the location of the minimum value (MIN = i).\n3. Scan the remaining unsorted elements (from i+1 to end).\n4. If a smaller element is found, update MIN to that new index.\n5. After scanning, swap the element at index 'i' with the element at index 'MIN'.\n6. Repeat until the entire array is sorted.`,
        references: [
          { text: "GeeksforGeeks: Selection Sort", url: "https://www.geeksforgeeks.org/selection-sort/" },
          { text: "Programiz: Selection Sort Algorithm", url: "https://www.programiz.com/dsa/selection-sort" }
        ],
        task: "Implement Selection Sort by finding the minimum value in the unsorted portion and swapping it to the front.",
        testCount: 3,
        templatePath: "activities/selection_sort_act",
        funcName: "selection_sort",
        generator: generateSortTest
      },
      {
        id: "l2-t4",
        number: "TOPIC 4",
        title: "Insertion Sort",
        level: "beginner",
        teaching: `Insertion Sort is an intuitive brute-force sorting algorithm that builds the final sorted array one item at a time. It behaves much like how you might sort a hand of playing cards: you pick up an unsorted card, compare it to the cards in your hand, and insert it into its correct sequential position.\n\nPerformance Analysis:\n• Worst/Average Case Time Complexity: O(n²). Occurs when the array is in reverse order.\n• Best Case Time Complexity: O(n). If the array is already sorted, it only makes one comparison per element.\n• Space Complexity: O(1). In-place sorting.`,
        algorithmSteps: `Insertion Sort Procedure:\n\n1. Assume the first element (index 0) is already sorted.\n2. Pick the next element (key) at index 1.\n3. Compare the key with the elements in the sorted portion (moving right to left).\n4. If the sorted element is greater than the key, shift the sorted element one position to the right.\n5. Repeat step 4 until you find a smaller element or reach the beginning.\n6. Insert the key into this newly opened position.\n7. Repeat for all elements.`,
        references: [
          { text: "Khan Academy: Insertion Sort", url: "https://www.khanacademy.org/computing/computer-science/algorithms/insertion-sort/a/insertion-sort" },
          { text: "GeeksforGeeks: Insertion Sort", url: "https://www.geeksforgeeks.org/insertion-sort/" }
        ],
        task: "Implement Insertion Sort by shifting larger elements to the right to insert the current element in its correct order.",
        testCount: 3,
        templatePath: "activities/insertion_sort_act",
        funcName: "insertion_sort",
        generator: generateSortTest
      }
    ]
  },
  {
    id: "l3",
    number: "LESSON 3",
    title: "Recursion & Recurrence",
    topics: [
      {
        id: "l3-t1",
        number: "TOPIC 1",
        title: "Factorial (Recursive)",
        level: "intermediate",
        teaching: `In computer science, we often encounter problems that can be broken down into smaller, identical subproblems. Recursion is a programming technique where a function calls itself to solve these smaller instances.\n\nWhen analyzing the time complexity of recursive algorithms, we use "Recurrence Relations." A recurrence relation is a mathematical equation that expresses the running time of a problem in terms of its smaller inputs.\n\nEvery properly designed recursive algorithm MUST contain two distinct parts:\n1. Base Case: The condition where the recursion terminates. It specifies the result for the smallest, simplest input size without calling itself again. Without a base case, recursion leads to infinite loops and stack overflows!\n2. Recursive Step: The part where the function calls itself with a smaller input, moving closer to the base case.\n\nA classic example is finding the Factorial of a number (n!), which mathematically translates to n * (n-1)!.`,
        algorithmSteps: `Recursive Procedure (Factorial Example):\n\nFunction Factorial(n):\n  1. Check the Base Case:\n     If n == 0 or n == 1, return 1.\n  2. Execute the Recursive Step:\n     Return n multiplied by the result of Factorial(n - 1).\n  \nExample Execution Trace for Factorial(4):\n  Factorial(4) returns 4 * Factorial(3)\n  Factorial(3) returns 3 * Factorial(2)\n  Factorial(2) returns 2 * Factorial(1)\n  Factorial(1) returns 1 (Base Case reached!)\n  Result propagates back up: 1 * 2 * 3 * 4 = 24.`,
        references: [
          { text: "GeeksforGeeks: Introduction to Recursion", url: "https://www.geeksforgeeks.org/introduction-to-recursion-data-structure-and-algorithm-tutorials/" },
          { text: "FreeCodeCamp: Understanding Recursion in Programming", url: "https://www.freecodecamp.org/news/understanding-recursion-in-programming/" }
        ],
        task: "Complete the recursive algorithm structure to calculate a factorial.",
        testCount: 3,
        templatePath: "activities/factorial_recursive_act",
        funcName: "factorial",
        generator: generateFactorialTest
      },
      {
        id: "l3-t2",
        number: "TOPIC 2",
        title: "Fibonacci Sequence",
        level: "intermediate",
        teaching: `The Fibonacci sequence is a famous mathematical series where each number is the sum of the two preceding ones, typically starting with 0 and 1 (0, 1, 1, 2, 3, 5, 8...). It appears frequently in nature and computer science.\n\nRecursion is a natural fit for generating this sequence because the mathematical definition is itself a recurrence relation: F(n) = F(n-1) + F(n-2). However, a naive recursive implementation is highly inefficient (O(2^n)) because it redundantly recalculates the same subproblems multiple times, resulting in an exponential time complexity.`,
        algorithmSteps: `Recursive Procedure (Fibonacci Example):\n\nFunction Fibonacci(n):\n  1. Check Base Cases:\n     If n == 0, return 0.\n     If n == 1, return 1.\n  2. Execute Recursive Step:\n     Calculate Fibonacci(n - 1) and Fibonacci(n - 2).\n  3. Return the sum of the two recursive calls.\n\nExample Execution Trace for Fibonacci(3):\n  Fibonacci(3) branches into Fibonacci(2) + Fibonacci(1)\n  Fibonacci(2) branches into Fibonacci(1) + Fibonacci(0)\n  Base cases resolve: 1 + 0 = 1 (for Fib(2))\n  Result propagates up: 1 + 1 = 2.`,
        references: [
          { text: "Math is Fun: Fibonacci Sequence", url: "https://www.mathsisfun.com/numbers/fibonacci-sequence.html" },
          { text: "Programiz: Fibonacci Series", url: "https://www.programiz.com/dsa/fibonacci-series" }
        ],
        task: "Implement the two base cases and the dual recursive calls for the Fibonacci sequence.",
        testCount: 3,
        templatePath: "activities/fibonacci_recursive_act",
        funcName: "fibonacci",
        generator: generateFibonacciTest
      }
    ]
  },
  {
    id: "l4",
    number: "LESSON 4",
    title: "Divide and Conquer",
    topics: [
      {
        id: "l4-t1",
        number: "TOPIC 1",
        title: "Binary Search",
        level: "intermediate",
        teaching: `Divide and Conquer is a highly efficient problem-solving paradigm where a large problem is broken down into smaller subproblems, solved recursively, and combined to form the final solution.\n\nBinary Search is a classic Divide and Conquer algorithm used exclusively on sorted arrays. Instead of checking every single element (like Linear Search does), Binary Search repeatedly divides the search space in half. \n\nIt follows the core paradigm steps:\n1. Divide: Find the middle element.\n2. Conquer: If the middle element is the target, you're done! Otherwise, if the target is smaller, search only the left half. If larger, search only the right half.\n3. Combine: No explicit combination is needed for searching.\n\nBecause it halves the remaining elements with every single step, its worst-case time complexity is incredibly fast: O(log n).`,
        algorithmSteps: `Binary Search Procedure:\n\n1. Set 'low' index to 0 and 'high' index to n-1.\n2. While 'low' is less than or equal to 'high':\n   a. Calculate the 'mid' index: (low + high) / 2.\n   b. Compare A[mid] with the target key.\n   c. If A[mid] == target, return 'mid' (Found!).\n   d. If target < A[mid], set 'high' to mid - 1 (Discard right half).\n   e. If target > A[mid], set 'low' to mid + 1 (Discard left half).\n3. If the loop ends naturally, the target is not in the array. Return -1.`,
        references: [
          { text: "Khan Academy: Binary Search", url: "https://www.khanacademy.org/computing/computer-science/algorithms/binary-search/a/binary-search" },
          { text: "GeeksforGeeks: Binary Search Algorithm", url: "https://www.geeksforgeeks.org/binary-search/" }
        ],
        task: "Calculate the middle index, and iteratively search the left or right half based on whether the target is greater or smaller.",
        testCount: 3,
        templatePath: "activities/binary_search_act",
        funcName: "binary_search",
        generator: generateSearchTest
      },
      {
        id: "l4-t2",
        number: "TOPIC 2",
        title: "Merge Sort",
        level: "advanced",
        teaching: `Merge Sort is a stable, comparison-based sorting algorithm that fully utilizes the Divide and Conquer strategy. Rather than sorting a large list blindly, it systematically fragments the problem and builds it back up.\n\nMerge Sort guarantees a phenomenal time complexity of O(n log n) in its best, average, and worst cases, making it vastly superior to Bubble Sort for large datasets.\n\nHow it applies Divide and Conquer:\n1. Divide: Split the array exactly into two halves down to single-element sub-arrays.\n2. Conquer: Recursively sort the two halves. (Note: An array of 1 element is already naturally sorted!).\n3. Combine: Meticulously merge the two sorted halves back together into a single sorted array.\n\nOne trade-off is its space complexity: Merge Sort requires O(n) auxiliary memory to hold the arrays while merging them together.`,
        algorithmSteps: `Merge Sort Procedure:\n\nFunction MergeSort(Array):\n  1. If the Array has 1 or 0 elements, it is already sorted. Return the Array.\n  2. Divide: Find the midpoint and split the Array into LeftHalf and RightHalf.\n  3. Conquer: Recursively call MergeSort(LeftHalf) and MergeSort(RightHalf).\n  4. Combine: Call a Merge() function to compare elements from both halves one by one, \n     placing the smaller element sequentially into a new sorted array.\n  5. Return the fully merged and sorted array.\n\nExample Execution: [8,3,5,2]\nSplit -> [8,3] and [5,2]\nSplit -> [8], [3], [5], [2]\nMerge -> [3,8] and [2,5]\nMerge -> [2,3,5,8]`,
        references: [
          { text: "GeeksforGeeks: Merge Sort Algorithm", url: "https://www.geeksforgeeks.org/merge-sort/" },
          { text: "Programiz: Merge Sort", url: "https://www.programiz.com/dsa/merge-sort" }
        ],
        task: "Implement the divide step by splitting the array in half, and the combine step to merge two sorted arrays into one.",
        testCount: 3,
        templatePath: "activities/merge_sort_act",
        funcName: "merge_sort",
        generator: generateSortTest
      }
    ]
  }
];

// --- 3. MAIN COMPONENT ---

export default function LearningPath() {
  const navigate = useNavigate();
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [userProgress, setUserProgress] = useState({});

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUserProgress(parsedUser.progress || {});
    } else {
      navigate("/signin");
    }
  }, [navigate]);

  const toggleTopic = (topicId) => {
    setExpandedTopic(expandedTopic === topicId ? null : topicId);
  };

  const handleStartActivity = (topic) => {
    let generatedTests = [];

    if (topic.generator && topic.testCount) {
      generatedTests = topic.generator(topic.testCount, topic.funcName);
    }

    const { generator, ...safeTopicData } = topic;

    const activityDataWithTests = {
      ...safeTopicData,
      testCasesList: generatedTests
    };

    navigate("/activity", {
      state: {
        templatePath: safeTopicData.templatePath,
        activityData: activityDataWithTests
      }
    });
  };

  // --- NEW: Flatten topics to easily check previous topic completion ---
  const allTopicsFlattened = LESSONS.flatMap((lesson) => lesson.topics);

  return (
    <div className="learning-path-page">
      <DashboardHeader />

      <main className="lp-main">

        <div className="lp-hero">
          <div className="lp-hero-icon">
            <img src="/assets/learning-icon.png" alt="Learning" />
          </div>
          <div className="lp-hero-text">
            <h2>Learning Path</h2>
            <p>Master algorithms step-by-step</p>
          </div>
        </div>

        <div className="lp-info-box">
          Read the module teachings, study the algorithm scripts, and complete the interactive tasks to advance!
        </div>

        <div className="lp-lessons">
          {LESSONS.map((lesson) => (
            <div key={lesson.id} className="lp-lesson-card">

              <div className="lp-lesson-header">
                <img src="/assets/book-icon.png" alt="Book" className="lp-book-icon" />
                <div className="lp-lesson-title-group">
                  <span className="lp-lesson-number">{lesson.number}</span>
                  <h3 className="lp-lesson-title">{lesson.title}</h3>
                </div>
              </div>

              <div className="lp-topics">
                {lesson.topics.map((topic) => {

                  const isExpanded = expandedTopic === topic.id;

                  // Extract activity key dynamically
                  const activityKey = topic.templatePath
                    ? topic.templatePath.split("/").pop()
                    : null;

                  const score = activityKey ? userProgress[activityKey] : undefined;
                  const isCompleted = score !== undefined;

                  // --- NEW: Calculate Lock Status ---
                  // Find where this topic is in the global sequence
                  const flatIndex = allTopicsFlattened.findIndex((t) => t.id === topic.id);
                  let isUnlocked = true; // First topic is always unlocked

                  if (flatIndex > 0) {
                    // Check if the immediately preceding topic has been completed
                    const prevTopic = allTopicsFlattened[flatIndex - 1];
                    const prevKey = prevTopic.templatePath?.split("/").pop();
                    isUnlocked = prevKey && userProgress[prevKey] !== undefined;
                  }

                  return (
                    <div key={topic.id} className={`lp-topic-container ${isExpanded ? "expanded" : ""} ${!isUnlocked ? "locked" : ""}`}>

                      {/* Only allow toggling if it is unlocked */}
                      <div className="lp-topic-row" onClick={() => isUnlocked && toggleTopic(topic.id)}>

                        <div className="lp-topic-row-left">
                          <div className="lp-topic-titles">
                            <span className="lp-topic-number">{topic.number}</span>
                            <h4 className="lp-topic-name">{topic.title}</h4>
                          </div>
                        </div>

                        {/* UPDATED RIGHT PANEL WITH NEW SCORE BADGE */}
                        <div className="lp-topic-right">
                          <div className="lp-topic-badge">{topic.level}</div>

                          {/* Display Lock, Pending, or Completed Badges */}
                          {!isUnlocked ? (
                            <span className="pending-badge" style={{ opacity: 0.8, cursor: 'not-allowed' }}>
                              🔒 Locked
                            </span>
                          ) : isCompleted ? (
                            <span className={`score-badge ${score == topic.testCount ? 'perfect' : 'partial'}`}>
                              {score}/{topic.testCount} Tests Passed
                            </span>
                          ) : (
                            <span className="pending-badge">Not Started</span>
                          )}
                        </div>

                      </div>

                      {isExpanded && (
                        <div className="lp-topic-content">

                          <div className="lp-teaching-section">
                            <strong className="lp-teaching-title">Module Lesson:</strong>
                            <p className="lp-topic-teaching">{topic.teaching}</p>
                          </div>

                          <div className="lp-algorithm-steps">
                            <strong className="lp-steps-title">Algorithm Procedure:</strong>
                            <div className="lp-code-block">
                              <pre>
                                <code>{topic.algorithmSteps}</code>
                              </pre>
                            </div>
                          </div>

                          <div className="lp-topic-task">
                            <strong className="lp-task-title">Your Mission:</strong>
                            <p className="lp-task-desc">{topic.task}</p>
                          </div>

                          {topic.references && (
                            <div className="lp-references-section">
                              <strong className="lp-references-title">References:</strong>
                              <ul className="lp-references-list">
                                {topic.references.map((ref, idx) => (
                                  <li key={idx}>
                                    <a
                                      href={ref.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="lp-reference-link"
                                    >
                                      {ref.text}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="lp-topic-footer">
                            <span className="lp-test-cases">
                              {topic.testCount} test cases
                            </span>

                            {isCompleted ? (
                              <button
                                className="lp-review-btn"
                                onClick={() => handleStartActivity(topic)}
                              >
                                Review Activity
                              </button>
                            ) : (
                              <button
                                className="lp-start-btn"
                                onClick={() => handleStartActivity(topic)}
                              >
                                Start Activity
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>

      </main>
    </div>
  );
}