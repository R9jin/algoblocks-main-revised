// frontend/src/components/BigOModal.jsx
import { useState } from "react";
import useMountTransition from "../hooks/useMountTransition";
import "../styles/BigOModal.css";
import { formatComplexity } from "../utils/formatters";

const BIG_O_DATA = [
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
    complexity: "O(n log² n)",
    name: "Poly-Logarithmic Time",
    color: "fair",
    def: "A pass over n items where each item pays a logarithmic cost that itself contains another logarithmic step (log n x log n). It sits between n log n and n².",
    analogy: "Sorting each of n piles of paper, where every pile is itself sorted by repeatedly splitting it in half.",
    example: "Divide-and-conquer algorithms whose combine step itself sorts, and some geometric algorithms.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
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
    complexity: "O(n² log n)",
    name: "Quadratic-Logarithmic Time",
    color: "bad",
    def: "Two nested loops over the input (n x n) where every pass also pays a logarithmic step, such as a sort or a binary search. The log factor is small (about 10 at n = 1,000) but it multiplies the whole n² cost.",
    analogy: "Comparing every pair of people at a party, and for each pair also looking something up in a sorted phone book.",
    example: "Sorting inside a nested loop, or running a binary search for every pair of items.",
    link: "https://www.geeksforgeeks.org/complete-guide-on-complexity-analysis/"
  },
  {
    complexity: "O(n³)",
    name: "Cubic Time",
    color: "bad",
    def: "The execution time grows with the cube of the input size. The exponent counts the loops stacked inside each other: three nested loops over n make the innermost line run n x n x n times. Doubling the input makes the work 8 times larger.",
    analogy: "Checking every (row, column, layer) cell of a cube whose sides have n cells, or comparing every possible triple of friends.",
    example: "Naive matrix multiplication, Floyd-Warshall all-pairs shortest paths, or brute-force 3Sum with three nested loops.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(n⁴)",
    name: "Quartic Time",
    color: "bad",
    def: "Four loops stacked inside each other, so the innermost line runs n x n x n x n times. Doubling the input makes the work 16 times larger, and at n = 1,000 it already needs about a trillion steps. It usually means a smarter approach (sorting, hashing or dynamic programming) is waiting to be found.",
    analogy: "Visiting every cell of a four-dimensional hypercube with n cells along each side.",
    example: "Brute-force 4Sum with four nested loops, or a 3D dynamic-programming table that is also scanned by one more loop.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
  },
  {
    complexity: "O(nᵏ)",
    name: "Polynomial Time (degree k)",
    color: "bad",
    def: "The general form behind quadratic, cubic and quartic time: k loops stacked inside each other give n to the power k. The bigger k is, the faster the cost explodes: doubling the input multiplies the work by 2ᵏ. Any fixed k is still called polynomial, which is far better than exponential, but k of 5 or more is rarely practical in Python.",
    analogy: "A k-dimensional grid with n cells along every side: you must visit all nᵏ cells.",
    example: "Brute-force search over five or more values at once, or k nested loops that each walk the whole input.",
    link: "https://www.geeksforgeeks.org/analysis-of-algorithms-big-o-analysis/"
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
    complexity: "O(3ⁿ)",
    name: "Exponential Time (base 3)",
    color: "bad",
    def: "Every extra input item multiplies the number of cases by 3 instead of 2, so it becomes unmanageable even sooner than 2ⁿ: a Python loop only copes with n of about 14 in a second.",
    analogy: "A combination lock with n dials and 3 positions per dial: 3ⁿ possible codes to try.",
    example: "A recursion that calls itself 3 times per call, or brute force over every string of length n built from 3 symbols.",
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
  },
  {
    complexity: "O(n·n!)",
    name: "Factorial Time (extra factor of n)",
    color: "bad",
    def: "Like O(n!), the program goes through every possible ordering of the items, but each ordering also costs about n steps to build or check. It grows even faster than plain factorial time.",
    analogy: "Seating n guests in every possible order, then reading out the whole seating chart each time.",
    example: "Generating every permutation of a list and copying or printing each one.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  },
  {
    complexity: "O(nⁿ)",
    name: "Super-Exponential Time",
    color: "bad",
    def: "n choices made n separate times (n x n x ... x n). It is larger than factorial time because factorial shrinks the number of choices at every position while nⁿ never does. It usually signals unrestricted brute force.",
    analogy: "Filling n slots where every slot can hold any of n values, with no restrictions at all.",
    example: "Brute force over every possible mapping of n items onto n positions, repetitions allowed.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  }
];

export default function BigOModal({ isOpen, onClose }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const shouldRender = useMountTransition(isOpen, 220);

  if (!shouldRender) return null;

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

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

        <div className="big-o-accordion">
          <div className="big-o-list-header">
            <span>Complexity</span>
            <span>Name</span>
            <span></span>
          </div>

          {BIG_O_DATA.map((item, idx) => (
            <div key={idx} className={`big-o-row ${expandedRow === idx ? 'expanded' : ''}`}>
              <div className="big-o-row-trigger" onClick={() => toggleRow(idx)}>
                <span className={`o-badge o-${item.color}`}>{formatComplexity(item.complexity)}</span>
                <span className="o-name">{item.name}</span>
                <span className="o-chevron dropdown-chevron">▶</span>
              </div>

              {expandedRow === idx && (
                <div className="big-o-row-details">
                  <p><strong>Definition:</strong> {item.def}</p>
                  <p><strong>Analogy:</strong> {item.analogy}</p>
                  <p><strong>Examples:</strong> {item.example}</p>
                  <p className="verified-resource-container">
                    <strong>Verified Resource:</strong> <a href={item.link} target="_blank" rel="noopener noreferrer" className="verified-resource-link">Explore {item.name} in-depth</a>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}