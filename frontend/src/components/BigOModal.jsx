/* frontend\src\components\BigOModal.jsx */
import { useState } from "react";
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
    complexity: "O(n)",
    name: "Linear Time",
    color: "good",
    def: "The execution time grows directly and proportionally with the size of the input data set. If you have 10 items, it takes up to 10 operations. You must look at every single element at least once.",
    analogy: "Reading a book page by page from start to finish.",
    example: "Linear Search, counting elements, or traversing an array to find the maximum/minimum value.",
    link: "https://www.geeksforgeeks.org/linear-search/"
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
    analogy: "A networking event where every single person in the room must shake hands with every other person in the room.",
    example: "Bubble Sort, Insertion Sort, Selection Sort, or traversing a 2D matrix/grid.",
    link: "https://www.geeksforgeeks.org/bubble-sort/"
  },
  {
    complexity: "O(2ⁿ)",
    name: "Exponential Time",
    color: "bad",
    def: "The execution time doubles with each new element added to the input. Extremely inefficient and grows astronomically fast. Usually the result of algorithms that blindly explore all possible branches.",
    analogy: "Trying to crack a combination lock by guessing every single possible combination one by one.",
    example: "Naive recursive calculation of Fibonacci numbers, or solving the Tower of Hanoi problem.",
    link: "https://www.geeksforgeeks.org/exponential-time-complexity/"
  },
  {
    complexity: "O(n!)",
    name: "Factorial Time",
    color: "bad",
    def: "The execution time grows factorially based on the input size. This is the absolute slowest common complexity. Even with small inputs (like n=15), a modern computer could take years to compute it.",
    analogy: "Trying to find the best seating arrangement for your friends at a dinner table by making them physically sit in every possible order.",
    example: "Generating all possible permutations of a given string/array, or the brute-force solution to the Traveling Salesperson Problem.",
    link: "https://www.geeksforgeeks.org/factorial-time-complexity/"
  }
];

export default function BigOModal({ isOpen, onClose }) {
  const [expandedRow, setExpandedRow] = useState(null);

  if (!isOpen) return null;

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  return (
    <div className="big-o-modal-overlay" onClick={onClose}>
      <div className="big-o-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="big-o-modal-header">
          <h2>
            <img
              src="/assets/table-icon.png"
              alt="Reference"
              className="tab-icon"
              style={{filter: "brightness(0) invert(1)"}} /> Big O Complexity Reference
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
                {/* Updated chevron to work with the CSS rotation animation */}
                <span className="o-chevron dropdown-chevron">▶</span>
              </div>

              {expandedRow === idx && (
                <div className="big-o-row-details">
                  <p><strong>Definition:</strong> {item.def}</p>
                  <p><strong>Analogy:</strong> {item.analogy}</p>
                  <p><strong>Examples:</strong> {item.example}</p>
                  <p style={{ marginTop: '10px' }}>
                    <strong>Verified Resource:</strong> <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: '#6C5CE7', textDecoration: 'underline' }}>Explore {item.name} in-depth</a>
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