// frontend/src/data/lessonBlockPlaygrounds.js
//
// Tells LessonViewer where to drop an interactive block playground and
// which example(s) to show there. Keyed by lessonId -> sectionId (a
// section's own "id", or one of its subsections' "id") -> an array of
// entries, each either a BLOCK_EXAMPLES key (string) or a
// { key, caption } object. `caption` overrides that example's generic
// "Goal" line with wording grounded in *this* lesson's own scenario, so
// an example reused across lessons still reads as written for the one
// it's embedded in (see LessonViewer.jsx's renderBlockPlaygrounds).
//
// References the *existing*, hand-verified BLOCK_EXAMPLES entries (each
// one already built + Python-generated + executed end to end when it was
// authored for the Block Explorer) rather than inventing new Blockly
// serializations per lesson, so every playground a lesson embeds is
// guaranteed to load and run. The one exception is "controls_for_nested"
// (added alongside this mapping): none of the single-loop glossary
// examples actually demonstrate O(n²) -- a nested loop is the whole
// point -- so a second, equally hand-verified example was added for the
// handful of sections that specifically teach quadratic time.
//
// It's fine -- expected, even -- for the same example to show up in more
// than one lesson; the core building blocks (loops, conditionals,
// functions, lists...) recur throughout the curriculum. The caption is
// what keeps each appearance feeling specific to its own lesson.
//
// Placement is deliberately light-touch: one to a few playgrounds per
// lesson, dropped at the section/subsection that most needs a visual, not
// on every single subsection.

export const LESSON_BLOCK_PLAYGROUNDS = {
  // ──── Module 0: Orientation ───────────────────────────────────────────────
  "lesson-0-1": {
    "sequential-execution": [
      { key: "variables_set", caption: "Blocks run top to bottom just like this Set block followed by whatever comes after it -- no jumps unless a loop or conditional says otherwise." },
    ],
    "translate-functions": [
      { key: "procedures_defnoreturn", caption: "This is the block you'd drag from the Functions drawer to define a reusable function." },
    ],
    "translate-loops": [
      { key: "controls_for", caption: "This is the Count With block from the Loops drawer -- reach for it whenever a task says \"repeat\" or \"for each.\"" },
    ],
    "translate-arrays": [
      { key: "list_append", caption: "This is the append-to-list block from the Lists drawer, used to grow an array one item at a time." },
    ],
    "translate-dictionaries": [
      { key: "dict_set", caption: "This is the \"set key in dictionary\" block from the Dictionaries drawer." },
    ],
  },

  "lesson-0-2": {
    variables: [
      { key: "variables_set", caption: "Variables are your program's memory -- this Set block creates one and gives it a starting value." },
      { key: "variables_get", caption: "This Get block reads back whatever value is currently stored -- the \"read\" half of the Set/Get pair." },
    ],
    loops: [
      { key: "controls_repeat_ext", caption: "The Repeat (Counted) loop -- runs a fixed number of times, for when you know the count upfront." },
      { key: "controls_whileUntil", caption: "The While (Conditional) loop -- keeps going until its condition turns False, for when the count is dynamic." },
    ],
    conditions: [
      { key: "controls_if", caption: "The If/Else block is where a program branches -- one path or the other, based on a condition." },
      { key: "logic_compare", caption: "The Compare block builds the True/False condition an If block checks." },
    ],
    arrays: [
      { key: "lists_create_with", caption: "Build an array by listing its starting items directly." },
      { key: "list_append", caption: "Append adds one more item onto the end of that array." },
    ],
    "math-operations": [
      { key: "math_arithmetic", caption: "Math blocks like this one drive score-keeping, loop counters, and array boundary checks." },
    ],
  },

  "lesson-0-3": {
    "time-complexity": [
      { key: "controls_for", caption: "Every pass through a loop like this one is an operation the Analyzer counts as input size grows -- this shape gives you O(n) time." },
    ],
    "space-complexity": [
      { key: "lists_create_with", caption: "Building a list like this is exactly the kind of extra memory the Analyzer tracks as space complexity." },
    ],
  },

  "lesson-0-4": {
    "variables-memory": [
      { key: "variables_set", caption: "The Visualizer tracks this Set block's variable -- its name, value, type, and full history of changes." },
    ],
    "arrays-memory": [
      { key: "list_append", caption: "Appending here is exactly the kind of array change the Visualizer animates cell by cell." },
      { key: "lists_setIndex", caption: "Setting a value at an index is the other array change the Visualizer tracks." },
    ],
    "call-stack": [
      { key: "procedures_defreturn", caption: "Calling this function pushes a new frame onto the Call Stack the Visualizer shows you -- returning pops it back off." },
    ],
  },

  // ──── Module 1: Complexity Analysis ───────────────────────────────────────
  "lesson-1-1": {
    "o-1": [
      { key: "dict_get", caption: "A dictionary lookup like this one takes the same amount of time no matter how many keys the dictionary holds -- that's O(1)." },
    ],
    "o-n": [
      { key: "controls_forEach", caption: "One straightforward pass over every item -- double the list, double the work. That's O(n)." },
    ],
    "o-n-log-n": [
      { key: "list_sort", caption: "Built-in sorting like this runs in O(n log n) -- the best achievable worst case for comparison-based sorting." },
    ],
    "o-n-squared": [
      { key: "controls_for_nested", caption: "A loop nested inside another loop -- the inner loop reruns completely on every pass of the outer one, giving n \u00d7 n work. That's O(n\u00b2)." },
    ],
    "space-complexity": [
      { key: "lists_create_with", caption: "The extra memory this list uses grows with how many items it holds -- that's what space complexity measures." },
    ],
  },

  "lesson-1-2": {
    constant: [
      { key: "dict_get", caption: "Same lookup cost whether the dictionary has 10 keys or 10,000 -- O(1)." },
    ],
    linear: [
      { key: "controls_forEach", caption: "Work scales directly with the list's length -- double the input, double the passes. O(n)." },
    ],
    linearithmic: [
      { key: "list_sort", caption: "Sorting combines a linear pass with logarithmic splitting under the hood -- O(n log n)." },
    ],
    quadratic: [
      { key: "controls_for_nested", caption: "Every pass of the outer loop reruns the entire inner loop -- outer and inner both scale with n, giving n \u00d7 n total work. O(n\u00b2)." },
    ],
  },

  "lesson-1-3": {
    "constant-space": [
      { key: "variables_set", caption: "However big the input gets, this Set block only ever holds one fixed value -- that's O(1) space." },
    ],
    "linear-space": [
      { key: "list_append", caption: "Growing this list by one item per input element means the extra memory scales 1-to-1 with n -- O(n) space." },
    ],
    "recursion-stack": [
      { key: "procedures_callreturn", caption: "Every recursive call like this one adds its own stack frame -- recursion depth is memory, too." },
    ],
  },

  // ──── Module 2: Brute Force & Search ──────────────────────────────────────
  "lesson-2-1": {
    "core-idea": [
      { key: "controls_for", caption: "Sequential, index-by-index checking -- 0 to n-1, no skipping -- is the core of brute force." },
      { key: "controls_for_nested", caption: "For combinatorial problems like finding a pair that sums to a target, brute force means an outer loop plus a nested inner loop generating every pair." },
    ],
    "complexity-analysis": [
      { key: "controls_forEach", caption: "One loop over n items is O(n) time." },
      { key: "controls_for_nested", caption: "A loop nested inside another is O(n\u00b2) -- the \"checking every sub-array\" case this lesson describes." },
    ],
  },

  "lesson-2-2": {
    "core-idea": [
      { key: "controls_forEach", caption: "This is Linear Search itself: compare each element to the target, in order, starting at index 0." },
    ],
    "step-by-step": [
      { key: "logic_compare", caption: "Every step of the search boils down to this comparison -- does the current element equal the target?" },
    ],
    implementation: [
      { key: "controls_flow_statements", caption: "Break out of the loop the moment a match is found -- the \"exit early on success\" half of a correct search function." },
    ],
  },

  "lesson-2-3": {
    "what-is-bubble-sort": [
      { key: "variable_swap", caption: "Bubble Sort's entire job is this: swap two adjacent elements whenever they're in the wrong order." },
    ],
    implementation: [
      { key: "lists_setIndex", caption: "Overwriting a position after a swap decision -- this is how the array actually gets reordered in place." },
      { key: "logic_compare", caption: "The comparison that decides whether a swap is needed -- left > right for ascending order." },
    ],
  },

  // ──── Module 3: Divide & Conquer ──────────────────────────────────────────
  "lesson-3-1": {
    "visual-call-stack": [
      { key: "procedures_defreturn", caption: "Each call to a function like this pushes a new stack frame -- the Call Stack this lesson describes." },
    ],
    implementation: [
      { key: "procedures_callreturn", caption: "Calling the function and using its returned value -- how a recursive case hands off to the next call." },
    ],
  },

  "lesson-3-2": {
    "search-pointers": [
      { key: "variables_set", caption: "Setting up the low/high/mid pointers that drive the whole search." },
      { key: "math_advanced_operators", caption: "Recomputing mid as (low + high) // 2 -- the calculation this lesson calls out by name." },
    ],
    implementation: [
      { key: "controls_whileUntil", caption: "The while low <= high loop is the whole search engine -- it stops once the range collapses." },
      { key: "logic_compare", caption: "Comparing the middle element against the target is what decides which half to search next." },
    ],
  },

  "lesson-3-3": {
    "the-merge-phase": [
      { key: "lists_create_with", caption: "Starting the empty auxiliary array the merge phase fills in." },
      { key: "list_append", caption: "Appending the smaller of the two pointed-at elements -- the core move of merging." },
    ],
    implementation: [
      { key: "list_slice_advanced", caption: "Slicing the array into left and right halves is the \"divide\" step of the Python implementation." },
    ],
  },

  "lesson-3-4": {
    "the-partition-phase": [
      { key: "variable_swap", caption: "Partitioning pushes smaller values left and larger values right by swapping them in place -- no new array needed." },
    ],
    implementation: [
      { key: "lists_setIndex", caption: "Placing the pivot into its final position after partitioning -- the last write of the partition step." },
    ],
  },

  // ──── Module 4: Greedy Algorithms ─────────────────────────────────────────
  "lesson-4-1": {
    "coin-example": [
      { key: "list_sort", caption: "Sorting the coin denominations first is what makes the greedy \"always take the biggest\" rule possible." },
    ],
    implementation: [
      { key: "controls_forEach", caption: "One pass over the sorted coins, committing to each choice immediately -- the greedy shape this lesson describes." },
    ],
  },

  "lesson-4-2": {
    "greedy-selection": [
      { key: "math_advanced_operators", caption: "Computing how many of the current coin fit into what's left -- the floor-division at the heart of greedy coin selection." },
      { key: "controls_whileUntil", caption: "Repeating that selection while any amount remains -- Philippine coins, US coins, whichever system is in play." },
    ],
  },

  "lesson-4-3": {
    "core-greedy-idea": [
      { key: "list_sort", caption: "Sort all activities by finish time first -- the rule \"always pick the one that finishes earliest\" depends on this order." },
    ],
    implementation: [
      { key: "controls_forEach", caption: "One pass over the sorted activities, selecting any whose start is at or after the last one picked." },
    ],
  },

  // ──── Module 5: Dynamic Programming ───────────────────────────────────────
  "lesson-5-1": {
    memoization: [
      { key: "dict_get", caption: "Checking the cache before recomputing -- the \"have I solved this subproblem before?\" check at the heart of memoization." },
      { key: "dict_set", caption: "Storing a subproblem's result the first time it's solved, so later calls can skip straight to it." },
    ],
    tabulation: [
      { key: "lists_repeat", caption: "Building the bottom-up table upfront, before filling it in with a loop -- tabulation's iterative alternative to recursion." },
    ],
  },

  "lesson-5-2": {
    "naive-recursion": [
      { key: "procedures_callreturn", caption: "The naive recursive call fib(n-1) + fib(n-2) -- elegant, but this is exactly what resolves the same subproblems over and over." },
    ],
    memoization: [
      { key: "dict_set", caption: "Caching a Fibonacci result the first time it's computed." },
      { key: "dict_get", caption: "Reading a cached Fibonacci result instead of recomputing it." },
    ],
    "tabulation-implementation": [
      { key: "lists_repeat", caption: "Creating the dp array of size n+1 that the tabulated Fibonacci solution fills in from the bottom up." },
    ],
  },

  "lesson-5-3": {
    "dp-matrix": [
      { key: "lists_repeat", caption: "Building one row of the dp[i][w] matrix this lesson describes -- capacities 0 through the knapsack's limit." },
    ],
    implementation: [
      { key: "lists_getIndex", caption: "Reading a previously-solved cell of the matrix." },
      { key: "lists_setIndex", caption: "Writing this cell's answer based on the cells above and to the left." },
    ],
  },

  "lesson-5-4": {
    "lcs-matrix": [
      { key: "lists_repeat", caption: "Building one row of the dp[i][j] matrix that tracks matches between the two strings." },
    ],
    implementation: [
      { key: "text_charAt", caption: "Comparing a character from each string at a given position -- the check that decides whether a cell's value comes from a diagonal match or the max of its neighbors." },
    ],
  },

  // ──── Module 6: Backtracking ──────────────────────────────────────────────
  "lesson-6-1": {
    workflow: [
      { key: "list_append", caption: "Choose: add a decision onto the current path." },
      { key: "list_pop_statement", caption: "Undo: this is what removes that same decision once a branch has been fully explored." },
    ],
    "rollback-code": [
      { key: "list_pop_statement", caption: "path.pop() -- the rollback step this lesson calls out by name, removing the most recent decision so another branch can be tried." },
    ],
  },

  "lesson-6-2": {
    "step-by-step-permutation": [
      { key: "list_append", caption: "Choosing an element and adding it to the current permutation path." },
      { key: "list_pop_statement", caption: "Removing it again once every permutation starting with that choice has been explored." },
    ],
  },

  "lesson-6-3": {
    "safe-placement": [
      { key: "logic_operation", caption: "Combining the column, row, and diagonal checks with AND is what decides whether a square is actually safe for a queen." },
    ],
    "board-representation": [
      { key: "lists_create_with", caption: "Building one row of the N\u00d7N board -- 0 for empty, 1 for queen, as this lesson describes." },
    ],
  },

  "lesson-6-4": {
    "core-backtracking-idea": [
      { key: "stack_push", caption: "Pushing a cell onto the path as the maze solver moves into it." },
      { key: "stack_pop", caption: "Popping it back off when that path turns out to be a dead end -- the backtrack step." },
    ],
    "valid-movement": [
      { key: "logic_operation", caption: "Combining the boundary check, wall check, and visited check with AND -- all three must hold before a move counts as valid." },
    ],
  },
};

export default LESSON_BLOCK_PLAYGROUNDS;
