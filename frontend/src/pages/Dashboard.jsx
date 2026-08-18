// frontend/src/pages/Dashboard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiLock, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { useOnboarding } from "../context/OnboardingContext";
import { progressDB, projectsDB, templatesDB } from "../db";
import "../styles/Dashboard.css";
import "../styles/Skeleton.css";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const SYSTEM_TEMPLATES = {
  sorting: [
    { name: "Bubble Sort", path: "sort/bubble_sort", desc: "Repeatedly steps through the list, compares adjacent elements, and swaps them if they are in the wrong order.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Selection Sort", path: "sort/selection_sort", desc: "Repeatedly selects the smallest element from the unsorted sublist and swaps it with the leftmost unsorted element.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Insertion Sort", path: "sort/insertion_sort", desc: "Builds the final sorted array one item at a time by comparing the current element to the sorted portion.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Merge Sort", path: "sort/merge_sort", desc: "A highly efficient divide-and-conquer algorithm that recursively splits and merges lists.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Quick Sort", path: "sort/quick_sort", desc: "Uses a divide-and-conquer approach by picking a pivot and partitioning the array around it.", icon: "/assets/sort-icon.png", isSystem: true },
  ],
  recursion: [
    { name: "Factorial", path: "recursive/recursive_factorial", desc: "Calculates the product of an integer and all the integers below it.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Fibonacci Sequence", path: "recursive/recursive_fibonacci", desc: "Generates the Fibonacci sequence where each number is the sum of the two preceding ones.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Tower of Hanoi", path: "recursive/recursive_tower_of_hanoi", desc: "A mathematical puzzle where the objective is to move a stack of disks from one peg to another.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Permutations", path: "recursive/recursive_permutation", desc: "Generates all possible arrangements of a given set of elements.", icon: "/assets/recursive-icon.png", isSystem: true },
  ],
  search: [
    { name: "Linear Search", path: "search/linear_search", desc: "Sequentially checks each element of the list until a match is found.", icon: "/assets/search-icon.png", isSystem: true },
    { name: "Binary Search", path: "search/binary_search", desc: "Efficiently searches a sorted array by repeatedly dividing the search interval in half.", icon: "/assets/search-icon.png", isSystem: true },
    { name: "Exponential Search", path: "search/exponential_search", desc: "Finds the range where the element should be, then performs a binary search.", icon: "/assets/search-icon.png", isSystem: true },
  ]
};

const FAQ_ITEMS = [
  {
    question: "What is AlgoBlocks and how do I use the Workspace?",
    answer: "AlgoBlocks is an interactive educational platform designed to teach data structures and algorithm analysis. By clicking 'Blank Workspace', you enter a block-based coding environment where you can drag, drop, and connect logical blocks to build your algorithm visually."
  },
  {
    question: "How does the platform calculate Time Complexity (Big-O)?",
    answer: "The platform analyzes the internal structure of your algorithm (like nested loops and recursive calls) to determine its mathematical Time Complexity. Once it identifies the Big-O classification (e.g., O(N), O(N²)), the Complexity Graph visualizes this by drawing the standard mathematical curve for that specific class, showing you visually how your algorithm will scale."
  },
  {
    question: "Can I visualize memory usage or Space Complexity?",
    answer: "Yes! The platform includes a Stack & Heap Memory Map that shows exactly where each variable lives while your algorithm runs: fixed-size values in the Stack Frame, and dynamically-sized objects like lists and dictionaries in the Heap. This helps you visually differentiate between in-place algorithms and those that consume extra memory."
  },
  {
    question: "What happens when my code has an error?",
    answer: "AlgoBlocks doesn't just tell you something is wrong, it explains why. Whenever your code fails to run, whether that's a syntax mistake, a logic error, or even an infinite loop, an error icon appears at the bottom-right of the Blocks workspace showing how many issues were found. Click it to see the full list, each with a plain-language explanation of the root cause and a suggested fix specific to that error."
  },
  {
    question: "What is the difference between System and Custom Templates?",
    answer: "System Templates are foundational algorithms (like Merge Sort or Binary Search) pre-built by our platform to serve as starting points. Custom Templates are your personal creations that you have built and saved to easily load or modify later."
  },
  {
    question: "How do the Optimization Challenges work in the Learning Path?",
    answer: "In these activities, you are given a functioning but inefficient algorithm. Your task is to apply concepts learned in the module to refactor the blocks and achieve an optimal Time or Space Complexity."
  },
  {
    question: "Can I view the actual code my blocks represent?",
    answer: "Absolutely. The platform features an integrated Code Snippet view. As you manipulate the visual blocks, it dynamically translates your logic into structured programming code."
  },
  {
    question: "What happens if I lose my internet connection?",
    answer: "AlgoBlocks supports offline learning. If your connection drops, your progress and workspace edits are securely saved locally on your device. The system will automatically sync your progress back to the cloud as soon as you are online."
  },
  {
    question: "Do I need to install any external software?",
    answer: "No installation is necessary. All execution, profiling, and complexity calculations happen securely and natively within your web browser."
  }
];

// Real, navigable destinations elsewhere in the app - this is the actual
// "Resources" half of the section header, distinct from the FAQ accordion
// below it (previously the section only ever rendered the FAQ, despite its
// heading promising both). Defined further down, after the icon components
// it references.

const PlusIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const CodeIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ChevronDownIcon = ({ expanded }) => (
  <svg 
    width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const BookIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const FolderIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

const UserIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const RESOURCE_LINKS = [
  {
    title: "Blank Workspace",
    desc: "Jump straight into the block editor and start building an algorithm from scratch.",
    path: "/workspace",
    icon: <CodeIcon />,
  },
  {
    title: "Learning Path",
    desc: "Work through structured lessons and optimization challenges in order.",
    path: "/learning-path",
    icon: <BookIcon />,
  },
  {
    title: "My Projects",
    desc: "Pick back up on anything you've previously built and saved.",
    path: "/projects",
    icon: <FolderIcon />,
  },
  {
    title: "Profile & Settings",
    desc: "Review your account details and learning progress.",
    path: "/profile",
    icon: <UserIcon />,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { state: onboardingState, isHydrated, startTour } = useOnboarding();
  const [recentProjects, setRecentProjects] = useState([]);
  const [systemTemplates, setSystemTemplates] = useState(SYSTEM_TEMPLATES);
  const [userTemplates, setUserTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);

  const storedUserStr = localStorage.getItem("user") || sessionStorage.getItem("user");
  
  const currentUser = useMemo(() => {
    return storedUserStr ? JSON.parse(storedUserStr) : null;
  }, [storedUserStr]);

  const isGuest = currentUser?.isGuest === true;

  const [progressData, setProgressData] = useState({
    percent: 0,
    moduleTitle: "Welcome",
    moduleBadge: "Up Next • Module 0",
    moduleDesc: "Start your journey into algorithm visualization and complexity analysis."
  });

  const dashboardTour = {
    id: "dashboard-tour",
    pageId: "dashboard",
    title: "Dashboard Tour",
    steps: [
      { target: ".bento-hero-card", title: "Start here", description: "Launch a blank workspace or continue from the main entry point for the app." },
      { target: ".bento-learning-card", title: "Track learning progress", description: "See your next module, lesson progress, and what is currently unlocked." },
      { target: ".view-all-projects-btn", title: "Open saved work", description: "Jump back into saved projects and templates from one place." },
      { target: ".bento-help-section", title: "Help and references", description: "Use the built-in FAQs when you want a refresher without leaving the page." },
    ],
  };

  // Guards the one-time auto-show attempt for this mount. Without this,
  // every state update while the tour is open (e.g. markPageOpened
  // recording that it started) changes `onboardingState`'s reference,
  // re-running this effect — and since completion is only recorded on a
  // genuine Finish, re-evaluating mid-tour (or right after Skip/X) would
  // just schedule startTour() again, snapping the tour back open. Once
  // we've attempted an auto-show this mount, we leave it alone; a fresh
  // attempt only happens on the next real visit (new mount) to this page.
  const dashboardTourAttemptedRef = useRef(false);

  useEffect(() => {
    if (!currentUser || currentUser.isGuest) return;
    if (dashboardTourAttemptedRef.current) return;
    // Don't decide anything until the authoritative server fetch has
    // resolved (or given up) — otherwise a fresh sign-in (especially right
    // after clearing local storage) can momentarily read "not seen" and
    // auto-show a tour the account already completed on another device.
    if (!isHydrated) return;
    const completed = Boolean(onboardingState?.pages?.dashboard?.seen);
    if (completed) return;
    const timer = setTimeout(() => {
      dashboardTourAttemptedRef.current = true;
      startTour(dashboardTour);
    }, 350);
    return () => clearTimeout(timer);
  }, [currentUser, onboardingState, isHydrated, startTour]);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const user = currentUser ? { ...currentUser } : null;

      // Ensure user progress is heavily merged from local IndexedDB 
      if (user) {
        if (!user.progress) user.progress = {};
        try {
          const allLocalProgress = await progressDB.getAll();
          allLocalProgress.forEach(p => {
            const key = p.lesson_id || p.id;
            if (key) {
              if (p.completed) user.progress[key] = true;
              else if (p.score !== undefined) user.progress[key] = Math.max(user.progress[key] || 0, p.score);
            }
          });
        } catch (e) {
          console.warn("Could not read local progressDB", e);
        }
      }

      if (navigator.onLine && user && !user.isGuest && API_BASE) {
        try {
          const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
          const headers = {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          };

          // These three endpoints are independent of each other, so fire them
          // concurrently instead of one-after-another -- on a slow connection,
          // awaiting them serially was adding up to 3x the round-trip latency
          // before the dashboard could finish loading.
          const [progResult, pResult, tResult] = await Promise.allSettled([
            fetch(`${API_BASE}/api/get-progress`, { headers }),
            fetch(`${API_BASE}/api/projects?userId=${encodeURIComponent(user.email)}`, { headers }),
            fetch(`${API_BASE}/api/templates?userId=${encodeURIComponent(user.email)}`, { headers }),
          ]);

          if (progResult.status === "fulfilled") {
            const progRes = progResult.value;
            if (progRes.ok && progRes.headers.get("content-type")?.includes("application/json")) {
              const progData = await progRes.json();
              if (progData.progress) {
                user.progress = { ...user.progress, ...progData.progress };
                localStorage.setItem("user", JSON.stringify(user));
              }
            }
          }

          if (pResult.status === "fulfilled") {
            const pRes = pResult.value;
            if (pRes.ok && pRes.headers.get("content-type")?.includes("application/json")) {
              const pData = await pRes.json();
              const cloudProjects = Array.isArray(pData.projects) ? pData.projects : (Array.isArray(pData) ? pData : []);
              await Promise.all(cloudProjects
                .filter(cp => cp.owner_id === user.email || cp.userId === user.email)
                .map(cp => projectsDB.save({ ...cp, projectId: cp.projectId || cp._id, isSynced: true }))
              );
            }
          }

          if (tResult.status === "fulfilled") {
            const tRes = tResult.value;
            if (tRes.ok && tRes.headers.get("content-type")?.includes("application/json")) {
              const tData = await tRes.json();
              const cloudTemplates = Array.isArray(tData.templates) ? tData.templates : (Array.isArray(tData) ? tData : []);
              await Promise.all(cloudTemplates
                .filter(ct => ct.owner_id === user.email || ct.userId === user.email)
                .map(ct => templatesDB.save({ ...ct, templateId: ct.templateId || ct._id, isSynced: true }))
              );
            }
          }

        } catch (fetchErr) {
          console.warn("Cloud sync check dropped to local cache:", fetchErr);
        }
      }

      let totalLessons = 0;
      let completedLessons = 0;
      let nextMod = curriculumIndex[0];
      let foundNext = false;

      // Track individual activities inside lessons to provide partial UI bumps
      let activityCount = 0;
      if (user && user.progress) {
        Object.entries(user.progress).forEach(([k, v]) => {
          if (k.includes(':') && typeof v === 'number' && v >= 50) activityCount++;
        });
      }

      for (const mod of curriculumIndex) {
        let modCompleted = 0;
        for (const les of mod.lessons) {
          totalLessons++;
          if (user && user.progress && user.progress[les.lessonId]) {
            completedLessons++;
            modCompleted++;
          }
        }
        if (modCompleted < mod.lessons.length && !foundNext) {
          nextMod = mod;
          foundNext = true;
        }
      }

      if (!foundNext && curriculumIndex.length > 0) {
        nextMod = curriculumIndex[curriculumIndex.length - 1]; 
      }

      let percent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

      // UX FIX: If they only did 1-2 activities and haven't fully passed a lesson yet, give them a visual fractional bump so the progress bar doesn't look dead.
      if (percent === 0 && activityCount > 0) {
        percent = Math.min(5, activityCount * 2);
      }

      const modDescriptions = {
        "module-0": "Start your journey into algorithm visualization and complexity analysis.",
        "module-1": "Understand Big-O notation, Time, and Space Complexity boundaries.",
        "module-2": "Explore Brute Force strategies and basic searching & sorting.",
        "module-3": "Master recursive decomposition and logarithmic time complexity boundaries.",
        "module-4": "Learn how to make locally optimal choices to solve global problems.",
        "module-5": "Solve complex problems by breaking them down into overlapping subproblems.",
        "module-6": "Explore all possible solutions efficiently using backtracking techniques."
      };

      setProgressData({
        percent,
        moduleTitle: nextMod?.title || "Algorithms",
        moduleBadge: `Up Next • ${nextMod?.moduleId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) || "Module"}`,
        moduleDesc: nextMod ? modDescriptions[nextMod.moduleId] || "Continue your algorithm learning journey." : "Continue your algorithm learning journey."
      });

      const allProjects = await projectsDB.getAll();
      const userProjects = allProjects.filter((value) => !user || value.owner_id === user.email || value.userId === user.email);
      const sortedProjects = userProjects.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
      setRecentProjects(sortedProjects.slice(0, 5));

      const allTemplates = await templatesDB.getAll();
      const userTpls = allTemplates.filter((value) => !user || value.owner_id === user.email || value.userId === user.email).map(value => ({
        ...value,
        isSystem: false,
        icon: "/assets/blocks-icon.png", 
        desc: value.description || "User-created template",
        name: value.title || value.name || "Untitled Template"
      }));
      const sortedTemplates = userTpls.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
      setUserTemplates(sortedTemplates);

    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadDashboardData();

    const onSyncTrigger = () => loadDashboardData();
    const onStart = () => setIsSyncingLive(true);
    const onEnd = () => { setIsSyncingLive(false); loadDashboardData(); };

    window.addEventListener("localDataSynced", onSyncTrigger);
    window.addEventListener("online", onSyncTrigger);
    window.addEventListener("sync-start", onStart);
    window.addEventListener("sync-end", onEnd);
    return () => {
      window.removeEventListener("localDataSynced", onSyncTrigger);
      window.removeEventListener("online", onSyncTrigger);
      window.removeEventListener("sync-start", onStart);
      window.removeEventListener("sync-end", onEnd);
    };
  }, [loadDashboardData]);

  const handleTryTemplate = async (template) => {
    try {
      if (template.isSystem) {
        const response = await fetch(`/templates/${template.path}.json`);
        if (!response.ok) throw new Error("Template file not found");
        const data = await response.json();
        
        const proj = { 
          data: data, 
          isTemplate: true, 
          templateId: template.path, 
          name: template.name,
          title: template.name 
        };
        navigate("/workspace", { state: { projectToLoad: proj } });
      } else {
        const proj = { 
          data: template.blocks || template.data || template.workspace?.blocklyJson, 
          isTemplate: true, 
          templateId: template.templateId || template._id, 
          name: template.name || template.title,
          title: template.name || template.title 
        };
        navigate("/workspace", { state: { projectToLoad: proj } });
      }
    } catch (err) {
      console.error("Error loading template:", err);
      alert("Failed to load template.");
    }
  };

  const toggleFaq = (index) => {
    if (expandedFaq === index) {
      setExpandedFaq(null);
    } else {
      setExpandedFaq(index);
    }
  };

  return (
    <div className="bento-dashboard-layout">
      <style>{`
        @keyframes dashSpin { 100% { transform: rotate(360deg); } }
        .dash-spin-anim { animation: dashSpin 1s linear infinite; }
      `}</style>

      {/* BUG FIX: DashboardHeader's default backTo="/" sent signed-in
          students to the marketing landing page, which immediately bounces
          them right back to /dashboard (PublicRoute redirects any
          authenticated session away from "/") -- the button looked broken
          because nothing visibly happened. /home (UserHomePage) is the
          actual signed-in "home base" for students, so point it there
          instead. Dashboard.jsx only ever renders for non-admin accounts
          (see App.jsx), so /home is always reachable here. */}
      <DashboardHeader backTo="/home" backText="Back to Home" tour={dashboardTour} tourPageId="dashboard" />
      
      <main className="bento-dashboard-content">
        <div className="bento-grid-container">
          
          <div className="bento-main-column">
            
            <section className="bento-hero-card">
              <div className="hero-text">
                <h1 className="hero-title">Welcome to AlgoBlocks!</h1>
                <p className="hero-subtitle">
                  An interactive platform to build, visualize, and analyze algorithms with real-time Big-O feedback.
                </p>
              </div>
              <button className="hero-primary-btn" onClick={() => navigate("/workspace")}>
                <PlusIcon />
                <span>Blank Workspace</span>
              </button>
            </section>

            <section className="bento-learning-card">
              <div className="learning-content">
                <span className="module-badge">
                  {isGuest ? "Locked • Guest Explorer" : progressData.moduleBadge}
                </span>
                <h3 className="learning-title">
                  {isGuest ? "Curriculum Locked" : progressData.moduleTitle}
                </h3>
                <p className="learning-desc">
                  {isGuest 
                    ? "The structured learning path and assessments are disabled in Guest Mode. Please create a full account to track your progress and access the curriculum." 
                    : progressData.moduleDesc}
                </p>
                {!isGuest && (
                  <div className="progress-container">
                    <div className="progress-header">
                      <span>Course Progress</span>
                      <span>{progressData.percent}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${progressData.percent}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="learning-action">
                <button 
                  className="banner-icon-btn" 
                  onClick={() => { if (!isGuest) navigate("/learning-path"); }}
                  style={isGuest ? { backgroundColor: '#F1F5F9', cursor: 'not-allowed', boxShadow: 'none', border: '1px solid #E2E8F0' } : {}}
                  disabled={isGuest}
                >
                  {isGuest ? (
                    <FiLock size={32} color="#94A3B8" />
                  ) : (
                    <img src="/assets/learning-icon.png" alt="Learning Path" className="learning-path-img" />
                  )}
                </button>
              </div>
            </section>

            <section className="bento-library-section" style={{ marginTop: "20px" }}>
              <div className="section-header">
                <h2>Your Custom Templates</h2>
                <p>Templates you have designed and saved for reuse.</p>
              </div>

              {userTemplates.length === 0 ? (
                <div className="bento-empty-state" style={{ padding: "30px", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.05)" }}>
                  <p>You haven't saved any custom templates yet.</p>
                  <span style={{ fontSize: "0.85rem", color: "#888" }}>Build an algorithm in the workspace and save it as a template!</span>
                </div>
              ) : (
                <div className="bento-category-group">
                  <div className="bento-template-grid">
                    {userTemplates.map((tpl, i) => (
                      <div key={tpl.templateId || i} className="bento-template-card custom-template-card" onClick={() => handleTryTemplate(tpl)} style={{ borderTop: "3px solid #db7fff" }}>
                        <div className="template-card-header">
                          <div className="template-icon-wrapper" style={{ background: "rgba(108, 92, 231, 0.2)" }}>
                            <img src={tpl.icon} alt="icon" className="template-icon" />
                          </div>
                          <h4 className="template-name">{tpl.name}</h4>
                        </div>
                        <p className="template-desc">{tpl.desc}</p>
                        <div className="template-card-footer">
                          <span className="template-action-text" style={{ color: "#db7fff" }}>Load Custom</span>
                          <ArrowRightIcon />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="bento-library-section" style={{ marginTop: "20px" }}>
              <div className="section-header">
                <h2>System Algorithm Library</h2>
                <p>Start with a pre-built structure and explore its complexity.</p>
              </div>

              {Object.entries(systemTemplates).map(([category, items]) => (
                <div key={category} className="bento-category-group">
                  <h3 className="category-title">{category.toUpperCase()}</h3>
                  <div className="bento-template-grid">
                    {items.map((tpl, i) => (
                      <div key={i} className="bento-template-card" onClick={() => handleTryTemplate(tpl)}>
                        <div className="template-card-header">
                          <div className="template-icon-wrapper">
                            <img src={tpl.icon} alt="icon" className="template-icon" />
                          </div>
                          <h4 className="template-name">{tpl.name}</h4>
                        </div>
                        <p className="template-desc">{tpl.desc}</p>
                        <div className="template-card-footer">
                          <span className="template-action-text">Load Template</span>
                          <ArrowRightIcon />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="bento-help-section" style={{ marginTop: "20px", marginBottom: "40px" }}>
              <div className="section-header">
                <h2>Help & Resources</h2>
                <p>Quick links to get where you're going, plus answers to common questions.</p>
              </div>

              <div className="bento-resource-grid">
                {RESOURCE_LINKS.map((res, index) => (
                  <div key={index} className="bento-resource-card" onClick={() => navigate(res.path)}>
                    <div className="resource-icon-wrapper">{res.icon}</div>
                    <div className="resource-card-body">
                      <h4 className="resource-title">{res.title}</h4>
                      <p className="resource-desc">{res.desc}</p>
                    </div>
                    <ArrowRightIcon />
                  </div>
                ))}
              </div>

              <div className="bento-faq-container">
                {FAQ_ITEMS.map((faq, index) => (
                  <div key={index} className={`bento-faq-item ${expandedFaq === index ? "expanded" : ""}`}>
                    <button className="bento-faq-question" onClick={() => toggleFaq(index)}>
                      <span>{faq.question}</span>
                      <ChevronDownIcon expanded={expandedFaq === index} />
                    </button>
                    <div className="bento-faq-answer" style={{ maxHeight: expandedFaq === index ? "500px" : "0", opacity: expandedFaq === index ? 1 : 0, padding: expandedFaq === index ? "0 20px 20px 20px" : "0 20px" }}>
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          <aside className="bento-sidebar-column">
            <div className="bento-recent-card">
              
              <div className="recent-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3>Recent Projects</h3>
                  {(loading || isSyncingLive) && (
                    <FiRefreshCw className="dash-spin-anim" size={14} style={{ color: "#60A5FA" }} title="Synchronizing cloud..." />
                  )}
                </div>
                <span className="recent-badge">{recentProjects.length}</span>
              </div>

              {recentProjects.length > 0 && (
                <button className="view-all-projects-btn" onClick={() => navigate("/projects")}>
                  View All Projects
                </button>
              )}

              <div className="recent-projects-container">
                {loading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="dash-skeleton-item">
                        <div className="skeleton skeleton-circle" />
                        <div className="dash-skeleton-item-body">
                          <div className="skeleton skeleton-line" />
                          <div className="skeleton skeleton-line" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : recentProjects.length === 0 ? (
                  <div className="bento-empty-state">
                    <div className="empty-icon"><CodeIcon /></div>
                    <p>No recent projects.</p>
                    <span>Your saved work will appear here.</span>
                  </div>
                ) : (
                  <div className="bento-recent-list">
                    {recentProjects.map((proj) => (
                      <div key={proj.projectId || proj._id} className="bento-recent-item" onClick={() => navigate("/workspace", { state: { projectToLoad: proj } })}>
                        <div className="recent-item-icon">
                          <CodeIcon />
                        </div>
                        <div className="recent-item-content">
                          <h4 className="recent-item-title">{proj.title || proj.name}</h4>
                          <div className="recent-item-meta">
                            <ClockIcon />
                            <span>{new Date(proj.updatedAt || proj.timestamp || Date.now()).toLocaleDateString()}</span>
                            <span className="dot-separator">•</span>
                            <span className={`sync-status ${proj.synced || proj.isSynced ? "synced" : "local"}`}>
                              {proj.synced || proj.isSynced ? "Cloud" : "Local"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}
