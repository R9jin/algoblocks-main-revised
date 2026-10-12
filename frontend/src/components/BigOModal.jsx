// frontend/src/components/BigOModal.jsx
import { Fragment, useState } from "react";
import useMountTransition from "../hooks/useMountTransition";
import "../styles/BigOModal.css";
import { formatComplexity } from "../utils/formatters";
import ComplexityGraph from "./ComplexityGraph.jsx";

// Curve colours for the growth graph; they match the .o-excel/.o-good/.o-fair/.o-bad badge colours.
const GRAPH_COLORS = { excel: "#27ae60", good: "#2980b9", fair: "#f39c12", bad: "#e74c3c" };

// First tab: the nine complexity classes the analyzer is built around, ordered from
// fastest to slowest growth. O(V + E) is a graph result, drawn with V and E growing together.
const COMMON_BIG_O = [
  {
    complexity: "O(1)",
    name: "Constant Time",
    color: "excel",
    def: "The execution time remains exactly the same regardless of the size of the input data set. It takes a single step, or a fixed number of steps, to complete. This is the holy grail of algorithm efficiency.",
    analogy: "Knowing exactly where a book is on a shelf and grabbing it immediately.",
    example: "Accessing a specific index in an array (e.g., arr[5]), pushing/popping a value to a stack, or looking up a key in a hash map.",
    link: "https://www.geeksforgeeks.org/analysis-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(log n)",
    name: "Logarithmic Time",
    color: "excel",
    def: "The algorithm systematically divides the data set in half with each step. As the data grows exponentially, the time it takes only grows linearly. Highly efficient for massive datasets.",
    analogy: "Looking up a word in a physical dictionary by opening it to the middle, deciding which half the word is in, and repeating.",
    example: "Binary Search on a sorted array, or finding an item in a balanced Binary Search Tree (BST).",
    link: "https://www.khanacademy.org/computing/computer-science/algorithms/binary-search/a/running-time-of-binary-search"
  },
  {
    complexity: "O(√n)",
    name: "Square Root Time",
    color: "good",
    def: "The execution time grows in proportion to the square root of the input size. It is much slower than logarithmic time but significantly faster than linear time for large datasets.",
    analogy: "Walking exactly halfway across a square room instead of walking along the entire perimeter.",
    example: "Checking if a number is prime by looping only up to its square root, or Grover's quantum search algorithm.",
    link: "https://www.geeksforgeeks.org/understanding-time-complexity-simple-examples/"
  },
  {
    complexity: "O(n)",
    name: "Linear Time",
    color: "good",
    def: "The execution time grows directly and proportionally with the size of the input data set. If you have 10 items, it takes up to 10 operations. You must look at every single element at least once.",
    analogy: "Reading a book page by page from start to finish.",
    example: "Linear Search, counting elements, or traversing an array to find the maximum/minimum value.",
    link: "https://www.geeksforgeeks.org/linear-search/"
  },
  {
    complexity: "O(V + E)",
    name: "Graph Traversal Time",
    color: "fair",
    graphNote: "V and E grow together with the graph, so it is drawn as one straight line.",
    def: "The execution time scales linearly with the size of a graph, depending on both the number of Vertices (nodes) and Edges (connections).",
    analogy: "Visiting every city on a road map (Vertices) and driving down every connecting highway between them (Edges).",
    example: "Breadth-First Search (BFS) and Depth-First Search (DFS) algorithms on an adjacency list representation of a graph.",
    link: "https://www.khanacademy.org/computing/computer-science/algorithms/graph-representation/a/analyzing-graph-algorithms"
  },
  {
    complexity: "O(n log n)",
    name: "Linearithmic Time",
    color: "fair",
    def: "A combination of linear and logarithmic complexity. It performs an O(log n) operation for each of the 'n' items in the data set. This is the gold standard limit for efficient, general-purpose sorting.",
    analogy: "Organizing a messy room by grouping similar items into piles (dividing), sorting the piles, and then putting them all together (merging).",
    example: "Merge Sort, Heap Sort, and the average case of Quick Sort.",
    link: "https://www.khanacademy.org/computing/computer-science/algorithms/merge-sort/a/analysis-of-merge-sort"
  },
  {
    complexity: "O(n²)",
    name: "Quadratic Time",
    color: "bad",
    def: "The execution time grows proportionally to the square of the input size. This typically involves a loop inside of another loop (nested iterations). Performance degrades rapidly as the dataset grows.",
    analogy: "A networking event where every single person in the room must individually shake hands with every other person in the room.",
    example: "Bubble Sort, Insertion Sort, Selection Sort, or finding duplicate values using brute-force nested loops.",
    link: "https://www.geeksforgeeks.org/bubble-sort/"
  },
  {
    complexity: "O(2ⁿ)",
    name: "Exponential Time",
    color: "bad",
    def: "The execution time doubles with each new element added to the input. Extremely inefficient and grows astronomically fast. Usually the result of algorithms that blindly explore all possible branches.",
    analogy: "Trying to crack a binary combination lock by blindly guessing every single possible combination sequence one by one.",
    example: "Naive recursive calculation of Fibonacci numbers, or solving the Tower of Hanoi problem.",
    link: "https://www.geeksforgeeks.org/exponential-time-complexity/"
  },
  {
    complexity: "O(n!)",
    name: "Factorial Time",
    color: "bad",
    def: "The execution time grows factorially based on the input size. Even with extremely small inputs (like n=15), a modern computer could take years to compute it.",
    analogy: "Trying to find the best seating arrangement for your friends at a dinner table by making them physically sit in every possible permutation of chairs.",
    example: "Generating all possible permutations of a given string/array, or the brute-force solution to the Traveling Salesperson Problem.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  }
];

// Second tab: the less common forms -- extra log factors, higher polynomial degrees,
// exponential variants, results over several input sizes and the list-queue graph case. `group` draws a small
// section label above the first row of each group.
const NICHE_BIG_O = [
  {
    complexity: "O(n log² n)",
    name: "Poly-Logarithmic Time",
    group: "Roots and logs",
    color: "fair",
    def: "A pass over n items where each item pays a logarithmic cost that itself contains another logarithmic step (log n x log n). It sits between n log n and n².",
    analogy: "Sorting each of n piles of paper, where every pile is itself sorted by repeatedly splitting it in half.",
    example: "Divide-and-conquer algorithms whose combine step itself sorts, and some geometric algorithms.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
  },
  {
    complexity: "O(n² log n)",
    name: "Quadratic-Logarithmic Time",
    group: "Polynomial",
    color: "bad",
    def: "Two nested loops over the input (n x n) where every pass also pays a logarithmic step, such as a sort or a binary search. The log factor is small (about 10 at n = 1,000) but it multiplies the whole n² cost.",
    analogy: "Comparing every pair of people at a party, and for each pair also looking something up in a sorted phone book.",
    example: "Sorting inside a nested loop, or running a binary search for every pair of items.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
  },
  {
    complexity: "O(n³)",
    name: "Cubic Time",
    group: "Polynomial",
    color: "bad",
    def: "The execution time grows with the cube of the input size. The exponent counts the loops stacked inside each other: three nested loops over n make the innermost line run n x n x n times. Doubling the input makes the work 8 times larger.",
    analogy: "Checking every (row, column, layer) cell of a cube whose sides have n cells, or comparing every possible triple of friends.",
    example: "Naive matrix multiplication, Floyd-Warshall all-pairs shortest paths, or brute-force 3Sum with three nested loops.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(n⁴)",
    name: "Quartic Time",
    group: "Polynomial",
    color: "bad",
    def: "Four loops stacked inside each other, so the innermost line runs n x n x n x n times. Doubling the input makes the work 16 times larger, and at n = 1,000 it already needs about a trillion steps. It usually means a smarter approach (sorting, hashing or dynamic programming) is waiting to be found.",
    analogy: "Visiting every cell of a four-dimensional hypercube with n cells along each side.",
    example: "Brute-force 4Sum with four nested loops, or a 3D dynamic-programming table that is also scanned by one more loop.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(nᵏ)",
    name: "Polynomial Time (degree k)",
    group: "Polynomial",
    color: "bad",
    graphNote: "k is any fixed exponent, so the graph uses an illustrative k = 5.",
    def: "The general form behind quadratic, cubic and quartic time: k loops stacked inside each other give n to the power k. The bigger k is, the faster the cost explodes: doubling the input multiplies the work by 2ᵏ. Any fixed k is still called polynomial, which is far better than exponential, but k of 5 or more is rarely practical in Python.",
    analogy: "A k-dimensional grid with n cells along every side: you must visit all nᵏ cells.",
    example: "Brute-force search over five or more values at once, or k nested loops that each walk the whole input.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(3ⁿ)",
    name: "Exponential Time (base 3)",
    group: "Exponential and beyond",
    color: "bad",
    def: "Every extra input item multiplies the number of cases by 3 instead of 2, so it becomes unmanageable even sooner than 2ⁿ: a Python loop only copes with n of about 14 in a second.",
    analogy: "A combination lock with n dials and 3 positions per dial: 3ⁿ possible codes to try.",
    example: "A recursion that calls itself 3 times per call, or brute force over every string of length n built from 3 symbols.",
    link: "https://www.geeksforgeeks.org/exponential-time-complexity/"
  },
  {
    complexity: "O(n·n!)",
    name: "Factorial Time (extra factor of n)",
    group: "Exponential and beyond",
    color: "bad",
    def: "Like O(n!), the program goes through every possible ordering of the items, but each ordering also costs about n steps to build or check. It grows even faster than plain factorial time.",
    analogy: "Seating n guests in every possible order, then reading out the whole seating chart each time.",
    example: "Generating every permutation of a list and copying or printing each one.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  },
  {
    complexity: "O(nⁿ)",
    name: "Super-Exponential Time",
    group: "Exponential and beyond",
    color: "bad",
    def: "n choices made n separate times (n x n x ... x n). It is larger than factorial time because factorial shrinks the number of choices at every position while nⁿ never does. It usually signals unrestricted brute force.",
    analogy: "Filling n slots where every slot can hold any of n values, with no restrictions at all.",
    example: "Brute force over every possible mapping of n items onto n positions, repetitions allowed.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  },
  {
    complexity: "O(n·m)",
    name: "Two Input Sizes (Product)",
    group: "Several input sizes",
    color: "bad",
    graphNote: "Drawn with n = m, where it matches O(n²). With a small m the real curve is much flatter.",
    def: "Used when the code works with two different inputs whose sizes are independent, so each gets its own letter. A loop over n items with a loop over m items inside it runs the innermost line n x m times. It only counts as quadratic when n and m happen to be the same size, so both letters stay in the answer.",
    analogy: "Checking every seat in a theatre that has n rows with m seats in each row.",
    example: "Filling an n x m dynamic-programming table (such as Longest Common Subsequence on two strings), or comparing every item of one list against every item of another.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
  },
  {
    complexity: "O(n + m)",
    name: "Two Input Sizes (Sum)",
    group: "Several input sizes",
    color: "good",
    graphNote: "Drawn with n = m, so the two sizes together grow like a straight line.",
    def: "Two loops that run one after the other, one over n items and one over m items, add their costs instead of multiplying them. Neither letter can be dropped because the inputs are independent: the total grows with whichever one is larger.",
    analogy: "Reading one book of n pages and then a second book of m pages: you read n + m pages in total, not n x m.",
    example: "Merging two sorted lists, or a loop over one array followed by a separate loop over a different array.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
  },
  {
    complexity: "O(V² + E)",
    name: "Graph Traversal with a List Queue",
    group: "Graphs",
    color: "bad",
    graphNote: "Drawn against V: the V² term dominates, so it curves like O(n²).",
    def: "A breadth-first search should cost O(V + E), but when the queue is a plain Python list and items are removed with pop(0), every removal shifts all the remaining items one place left. That costs O(V) per removal across V removals, so the traversal grows to V² + E. Switching to collections.deque and popleft() brings it back to O(V + E).",
    analogy: "A checkout line where everyone must shuffle one step forward each time the first person leaves, instead of the line simply moving its front marker.",
    example: "BFS written with queue = [start] and queue.pop(0) instead of a collections.deque.",
    link: "https://www.khanacademy.org/computing/computer-science/algorithms/graph-representation/a/analyzing-graph-algorithms"
  }
];


// Third tab: the recurrence T(n) behind each class. `complexity` is the solved bound
// (it also drives the growth graph); `recurrence` is what the row shows in the name column.
const RECURRENCES = [
  {
    complexity: "O(1)",
    recurrence: "T(n) = 1",
    name: "No recursion",
    group: "The nine classes",
    color: "excel",
    def: "The work does not depend on n and there is no recursive call, so the cost is a fixed number of steps.",
    method: "Nothing to solve. T(n) = c, which is O(1).",
    example: "Reading arr[i], pushing onto a stack, or a hash map lookup."
  },
  {
    complexity: "O(log n)",
    recurrence: "T(n) = T(n/2) + 1",
    name: "Halve the input",
    group: "The nine classes",
    color: "excel",
    def: "One recursive call on half of the input, plus a constant amount of work to decide which half to keep.",
    method: "Master Theorem with a = 1, b = 2, f(n) = 1. Since log_b(a) = 0 matches the degree of f(n), case 2 gives O(log n). Unrolling gives the same answer: n halves to 1 after log₂ n steps, each costing 1.",
    example: "Recursive binary search."
  },
  {
    complexity: "O(√n)",
    recurrence: "T(n) = 2T(n/4) + 1",
    name: "Two calls on a quarter of the input",
    group: "The nine classes",
    color: "good",
    def: "Two subproblems, each a quarter of the size, with constant work to split them. The number of leaves grows like the square root of n.",
    method: "Master Theorem with a = 2, b = 4, f(n) = 1. log_b(a) = log₄ 2 = 0.5 is bigger than the degree of f(n), which is 0, so case 1 applies and the leaves dominate: O(n^0.5) = O(√n). Loop-based square root code, like trial division up to √n, has no recurrence at all: it is just a loop that runs √n times.",
    example: "Trial division up to the square root of n, or a recursion that splits into two quarter-size halves."
  },
  {
    complexity: "O(n)",
    recurrence: "T(n) = T(n - 1) + 1",
    name: "Shrink by one",
    group: "The nine classes",
    color: "good",
    def: "One recursive call on an input that is one smaller, plus a constant amount of work in each call.",
    method: "Unroll: T(n) = 1 + 1 + ... + 1 with n terms, which is n. The call chain is n levels deep and each level costs 1.",
    example: "Recursive sum of a list, recursive linear search, or a recursive factorial that only multiplies."
  },
  {
    complexity: "O(V + E)",
    recurrence: "T(V, E) = T(V - 1, E - deg(v)) + 1 + deg(v)",
    name: "Visit a vertex and scan its edges",
    group: "The nine classes",
    color: "fair",
    graphNote: "V and E grow together with the graph, so it is drawn as one straight line.",
    def: "Each recursive step visits one new vertex and scans the edges leaving it. A visited vertex is never expanded again.",
    method: "Add up the work over all steps: 1 per vertex gives V, and deg(v) per vertex adds up to E for a directed graph (2E for an undirected graph, which is still O(E)). The total is O(V + E).",
    example: "DFS and BFS on an adjacency list."
  },
  {
    complexity: "O(n log n)",
    recurrence: "T(n) = 2T(n/2) + n",
    name: "Split in half, combine in linear time",
    group: "The nine classes",
    color: "fair",
    def: "Two recursive calls on halves of the input, plus a linear amount of work to split or merge the results.",
    method: "Master Theorem with a = 2, b = 2, f(n) = n. log_b(a) = 1 matches the degree of f(n), so case 2 gives O(n log n). Unrolling: there are log₂ n levels and every level does n work in total.",
    example: "Merge Sort."
  },
  {
    complexity: "O(n²)",
    recurrence: "T(n) = T(n - 1) + n",
    name: "Shrink by one, linear work each call",
    group: "The nine classes",
    color: "bad",
    def: "One recursive call on an input that is one smaller, but every call also scans the whole current input.",
    method: "Unroll: T(n) = n + (n - 1) + ... + 1 = n(n + 1) / 2, which is O(n²).",
    example: "Recursive Selection Sort, or Quick Sort when the pivot is always the smallest or largest item (worst case)."
  },
  {
    complexity: "O(2ⁿ)",
    recurrence: "T(n) = 2T(n - 1) + 1",
    name: "Two calls on an input one smaller",
    group: "The nine classes",
    color: "bad",
    def: "Every call makes two recursive calls, each on an input that is only one smaller, so the number of calls doubles at every level.",
    method: "Unroll: T(n) = 1 + 2 + 4 + ... + 2ⁿ⁻¹ = 2ⁿ - 1, which is O(2ⁿ). The Fibonacci recurrence T(n) = T(n - 1) + T(n - 2) + 1 also solves to O(2ⁿ), with base about 1.618 instead of 2.",
    example: "Tower of Hanoi, or naive recursive Fibonacci."
  },
  {
    complexity: "O(n!)",
    recurrence: "T(n) = n · T(n - 1) + 1",
    name: "n calls on an input one smaller",
    group: "The nine classes",
    color: "bad",
    def: "Every call loops over its n remaining choices and makes one recursive call for each, on an input that is one smaller.",
    method: "Unroll: the number of calls is n × (n - 1) × ... × 1 = n!, so the cost is O(n!). If each finished ordering is also copied or printed at about n steps, the cost becomes O(n · n!).",
    example: "Generating every permutation of a list, or brute-force Traveling Salesperson."
  },
  {
    complexity: "O(n)",
    recurrence: "T(n) = 2T(n/2) + 1",
    name: "Split in half, constant combine",
    group: "Other Master Theorem cases",
    color: "good",
    def: "Two recursive calls on halves, but only a constant amount of work to combine them. The leaves outnumber the levels, so they dominate.",
    method: "Master Theorem with a = 2, b = 2, f(n) = 1. log_b(a) = 1 is bigger than the degree of f(n), so case 1 gives O(n).",
    example: "Finding the maximum of an array by comparing the maxima of its two halves."
  },
  {
    complexity: "O(n)",
    recurrence: "T(n) = T(n/2) + n",
    name: "Halve the input, linear work each call",
    group: "Other Master Theorem cases",
    color: "good",
    def: "One recursive call on half of the input, but each call does linear work. The work shrinks geometrically (n + n/2 + n/4 + ...), so the first call dominates.",
    method: "Master Theorem with a = 1, b = 2, f(n) = n. log_b(a) = 0 is smaller than the degree of f(n), so case 3 gives O(n). Unrolling: n + n/2 + n/4 + ... is less than 2n.",
    example: "Quickselect with a good pivot, finding the median in average linear time."
  }
];

const TABS = [
  {
    id: "common",
    label: "Common Classes",
    note: "The nine classes the analyzer reports, ordered from fastest to slowest growth.",
    data: COMMON_BIG_O
  },
  {
    id: "niche",
    label: "Uncommon Classes",
    note: "Rarer forms you may still run into: extra log factors, higher polynomials, exponential variants, several input sizes and the list-queue graph case.",
    data: NICHE_BIG_O
  },
  {
    id: "recurrence",
    label: "Recurrence Relations",
    note: "The recurrence T(n) behind each class. Read the recurrence in the middle column, expand a row to see how it solves to the bound on the left. For T(n) = a T(n/b) + f(n), compare f(n) with n to the power log_b(a): if f(n) is smaller the leaves win, if equal you get an extra log n, if larger f(n) wins.",
    data: RECURRENCES
  }
];

export default function BigOModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("common");
  const [expandedRow, setExpandedRow] = useState(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const shouldRender = useMountTransition(isOpen, 220);

  // Every time the modal opens it starts on the Common tab with all rows collapsed.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setActiveTab("common");
      setExpandedRow(null);
    }
  }

  if (!shouldRender) return null;

  const currentTab = TABS.find((tab) => tab.id === activeTab) || TABS[0];

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    setExpandedRow(null);
  };

  const toggleRow = (complexity) => {
    setExpandedRow(expandedRow === complexity ? null : complexity);
  };

  let lastGroup = null;

  return (
    <div className={`big-o-modal-overlay ${isOpen ? "" : "is-closing"}`} onClick={onClose}>
      <div className={`big-o-modal-content ${isOpen ? "" : "is-closing"}`} onClick={(e) => e.stopPropagation()}>
        <div className="big-o-modal-header">
          <h2>
            <img
              src="/assets/table-icon.png"
              alt="Reference"
              className="tab-icon inverted-header-icon" 
            /> Big O Complexity Reference
          </h2>
          <button className="big-o-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="big-o-tabs" role="tablist" aria-label="Big O reference sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`big-o-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls="big-o-tabpanel"
              className={`big-o-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* key remounts the list on a tab switch so it always starts scrolled to the top */}
        <div
          className="big-o-accordion"
          key={currentTab.id}
          role="tabpanel"
          id="big-o-tabpanel"
          aria-labelledby={`big-o-tab-${currentTab.id}`}
        >
          <p className="big-o-tab-note">{currentTab.note}</p>

          <div className="big-o-list-header">
            <span>{currentTab.id === "recurrence" ? "Solves to" : "Complexity"}</span>
            <span>{currentTab.id === "recurrence" ? "Recurrence" : "Name"}</span>
            <span></span>
          </div>

          {currentTab.data.map((item) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group;
            const rowId = item.recurrence || item.complexity;
            const isExpanded = expandedRow === rowId;

            return (
              <Fragment key={rowId}>
                {showGroup && <div className="big-o-group-label">{item.group}</div>}
                <div className={`big-o-row ${isExpanded ? 'expanded' : ''}`}>
                  <div className="big-o-row-trigger" onClick={() => toggleRow(rowId)}>
                    <span className={`o-badge o-${item.color}`}>{formatComplexity(item.complexity)}</span>
                    <span className="o-name">
                      {item.recurrence ? <span className="o-recurrence">{item.recurrence}</span> : null}
                      {item.recurrence ? <span className="o-name-sub">{item.name}</span> : item.name}
                    </span>
                    <span className="o-chevron dropdown-chevron">▶</span>
                  </div>

                  {isExpanded && (
                    <div className="big-o-row-details">
                      {item.recurrence && <p><strong>Recurrence:</strong> <code>{item.recurrence}</code></p>}
                      <p><strong>{item.recurrence ? "How it arises:" : "Definition:"}</strong> {item.def}</p>
                      {item.method && <p><strong>Solving it:</strong> {item.method}</p>}
                      {item.analogy && <p><strong>Analogy:</strong> {item.analogy}</p>}
                      <p><strong>Examples:</strong> {item.example}</p>
                      <p><strong>Growth Graph:</strong></p>
                      <div className="big-o-graph-wrapper">
                        <ComplexityGraph
                          complexity={item.complexity}
                          color={GRAPH_COLORS[item.color]}
                          label="Time Curve"
                          note={item.graphNote}
                        />
                      </div>
                      {item.link && (
                        <p className="verified-resource-container">
                          <strong>Verified Resource:</strong> <a href={item.link} target="_blank" rel="noopener noreferrer" className="verified-resource-link">Explore {item.name} in-depth</a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
