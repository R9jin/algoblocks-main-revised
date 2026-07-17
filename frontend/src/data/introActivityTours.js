// frontend/src/data/introActivityTours.js
//
// Curated, activity-specific onboarding tours — kept deliberately separate
// from the generic `activityTour` defined in ActivityApp.jsx.
//
// The generic tour explains the workspace chrome in the abstract (view
// toggle, run button, console tabs, etc.) the same way for every single
// activity in the curriculum. That's fine once a learner already knows the
// ropes, but it isn't a real introduction: it never says *why* any of that
// matters for the specific thing the learner is about to do.
//
// This file curates one tour per "introductory" activity — the first
// activity of each lesson in Module 0 ("Welcome to AlgoBlocks"), since each
// of those is a learner's first-ever exposure to a distinct part of the
// platform (the workspace itself, Blockly components, the Complexity
// Analyzer, and the Memory Visualizer, respectively). Each tour walks
// through that activity's actual expected workflow end-to-end, using the
// concept the lesson is introducing as the throughline, rather than a
// generic tour of UI chrome.
//
// Every other (non-introductory) activity keeps using the generic
// `activityTour` — see getIntroActivityTour()'s fallback behavior below.

/**
 * Builds the curated tour config for a given introductory activity.
 *
 * @param {string} activityId - e.g. "m0_l1_a1"
 * @param {string} moduleId - e.g. "module-0"
 * @param {object} handlers - component-level state setters this tour's
 *   steps need to reveal the right panel/tab before highlighting it.
 * @param {(open: boolean) => void} handlers.setIsBigOModalOpen
 * @param {(panel: "console"|"complexity"|null) => void} handlers.setBottomPanel
 * @param {(tab: string) => void} handlers.setConsoleTab
 * @param {(tab: string) => void} handlers.setActiveComplexityTab
 * @returns {{ id: string, pageId: string, title: string, steps: object[] } | null}
 *   The curated tour, or null if this activity has no curated tour (the
 *   caller should fall back to the generic activityTour in that case).
 */
export function getIntroActivityTour(activityId, moduleId, handlers) {
  const builder = INTRO_ACTIVITY_TOUR_BUILDERS[activityId];
  if (!builder) return null;

  const { setIsBigOModalOpen, setBottomPanel, setConsoleTab, setActiveComplexityTab } = handlers;

  const bigOStep = {
    target: ".big-o-btn",
    title: "Big-O reference",
    description: "Open the complexity reference modal any time you want a refresher on a notation you see in your results.",
    onEnter: () => setIsBigOModalOpen(true),
    onExit: () => setIsBigOModalOpen(false),
  };

  return {
    id: `intro-${activityId}`,
    pageId: `activity-${moduleId}-${activityId}`,
    title: builder.title,
    steps: builder.steps({ setBottomPanel, setConsoleTab, setActiveComplexityTab, bigOStep }),
  };
}

const INTRO_ACTIVITY_TOUR_BUILDERS = {
  // Lesson 0-1 "The AlgoBlocks Workspace" -> first-ever activity on the
  // whole platform. This one is the flagship: a complete, start-to-finish
  // walkthrough of how any activity is done, since it's the template every
  // later activity (curated or generic) builds on.
  m0_l1_a1: {
    title: "Your First Program — Guided Tour",
    steps: ({ setBottomPanel, setConsoleTab, setActiveComplexityTab, bigOStep }) => [
      {
        target: ".activity-left-panel",
        title: "Read the challenge",
        description: "Every activity starts here: the Description panel lays out exactly what your program needs to do. This first one just asks for a simple program — read it fully before you touch a block.",
      },
      {
        target: ".wh-toggle-btn.active",
        title: "Blocks vs. Python",
        description: "You build with drag-and-drop Blocks by default. Toggle here any time to see the real Python code your blocks generate — useful for connecting what you dragged to what actually runs.",
      },
      {
        target: ".sidebar-toggle-btn",
        title: "Reclaim your space",
        description: "Once you know the goal, collapse the Description panel with this button to give the block canvas more room to work in.",
      },
      {
        target: ".wh-btn-save",
        title: "Run anytime",
        description: "Use Run to quickly execute your current blocks and see what happens — no grading, no submission, just a fast check as you build.",
      },
      {
        target: ".footer-tab:nth-child(1)",
        title: "Check the console",
        description: "Anything your program prints, or any error it raises, shows up here after you run it. Get comfortable checking this every time.",
        onEnter: () => { setBottomPanel("console"); setConsoleTab("output"); },
      },
      {
        target: ".right-panel-toggle",
        title: "Open the test cases",
        description: "This is how you'll know if you're actually done. Toggle the Test Cases panel to see the exact inputs and outputs your solution is checked against.",
      },
      {
        target: ".activity-right-panel",
        title: "What grading checks",
        description: "Each test case shows the input, the expected output, and — once you grade — whether your code matched it. The counter at the top tracks how many you're passing.",
      },
      {
        target: ".wh-btn-run",
        title: "Submit for grading",
        description: "When you're confident, click Evaluate Efficiency (AES). This runs every official test case AND measures your solution's time and space complexity — this is your real submission.",
      },
      {
        target: ".footer-tab:nth-child(2)",
        title: "Review your complexity",
        description: "After grading, switch to this tab to see your algorithm's measured Big-O for time and space, right alongside your test results.",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("overall"); },
      },
      bigOStep,
    ],
  },

  // Lesson 0-2 "Core Blockly Components" -> first activity: introduces
  // storing and reading variables.
  m0_l2_a1: {
    title: "Storing Data in Variables — Guided Tour",
    steps: ({ setBottomPanel, setConsoleTab, bigOStep }) => [
      {
        target: ".activity-left-panel",
        title: "New concept: variables",
        description: "This activity introduces variables — blocks that store a value under a name so you can reuse or update it later. Read the task to see exactly what value you need to store and return.",
      },
      {
        target: ".wh-toggle-btn.active",
        title: "Watch it become Python",
        description: "Switch to the Python view after placing a variable block — you'll see it turn into a plain `name = value` assignment. That mapping is worth internalizing early.",
      },
      {
        target: ".wh-btn-save",
        title: "Run early, run often",
        description: "Run your blocks as soon as you set the variable, before worrying about anything else. Confirm the value is what you expect in the console.",
      },
      {
        target: ".footer-tab:nth-child(1)",
        title: "Confirm the output",
        description: "Your variable's value (or whatever your program prints) shows up here. Compare it against the expected output in the task description.",
        onEnter: () => { setBottomPanel("console"); setConsoleTab("output"); },
      },
      {
        target: ".right-panel-toggle",
        title: "Match the test cases",
        description: "Open the test cases panel to check the exact expected value for each input — this is what your stored variable needs to equal.",
      },
      {
        target: ".wh-btn-run",
        title: "Submit for grading",
        description: "Once your output matches, click Evaluate Efficiency (AES) to grade your solution officially.",
      },
      bigOStep,
    ],
  },

  // Lesson 0-3 "The Complexity Analyzer" -> first activity: introduces
  // measuring how fast code runs (time complexity).
  m0_l3_a1: {
    title: "Checking How Fast Code Runs — Guided Tour",
    steps: ({ setBottomPanel, setActiveComplexityTab, bigOStep }) => [
      {
        target: ".activity-left-panel",
        title: "New concept: time complexity",
        description: "From here on, activities aren't just graded on correct output — they're also measured on speed. Read the task to see what your algorithm needs to do.",
      },
      {
        target: ".wh-btn-save",
        title: "Get it working first",
        description: "Use Run to build and check correctness the same way as before — get a working solution before worrying about its complexity.",
      },
      {
        target: ".wh-btn-run",
        title: "Grade AND analyze",
        description: "Evaluate Efficiency (AES) does double duty here: it checks your test cases and measures your algorithm's Big-O time complexity in the same run.",
      },
      {
        target: ".footer-tab:nth-child(2)",
        title: "Open Complexity Analysis",
        description: "This is the panel this whole lesson is about. After grading, it shows your algorithm's overall measured time complexity, like O(n) or O(n^2).",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("overall"); },
      },
      {
        target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(2)",
        title: "See the cost per line",
        description: "Switch to Local to see how much each individual line contributes — this is where you'll spot exactly which part of your code is the slow one.",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("local"); },
      },
      {
        target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(3)",
        title: "See the combined total",
        description: "Global shows the single Big-O class for the whole algorithm — the number that actually gets graded.",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("global"); },
      },
      bigOStep,
    ],
  },

  // Lesson 0-4 "Memory Visualizer" -> first activity: introduces tracking
  // memory usage.
  m0_l4_a1: {
    title: "Memory Usage — Guided Tour",
    steps: ({ setBottomPanel, setActiveComplexityTab, bigOStep }) => [
      {
        target: ".activity-left-panel",
        title: "New concept: memory",
        description: "This activity introduces space complexity — how much memory your variables and data structures use as your code runs. Read the task before you start.",
      },
      {
        target: ".wh-btn-run",
        title: "Grade to generate the map",
        description: "Just like time complexity, memory data is captured when you click Evaluate Efficiency (AES) — it grades correctness and records a memory snapshot together.",
      },
      {
        target: ".footer-tab:nth-child(2)",
        title: "Open Complexity Analysis",
        description: "Memory data lives inside the same Complexity panel you used for time complexity — after grading, switch here first.",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("overall"); },
      },
      {
        target: ".bottom-docked-panel .tab-btn-group .tab-btn:nth-child(4)",
        title: "Open the Memory Map",
        description: "This tab visualizes how variables and arrays are allocated and change over time as your program executes — the core tool for this lesson.",
        onEnter: () => { setBottomPanel("complexity"); setActiveComplexityTab("memory"); },
      },
      bigOStep,
    ],
  },
};
