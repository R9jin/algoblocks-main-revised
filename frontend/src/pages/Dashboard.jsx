// frontend/src/pages/Dashboard.jsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { projectsDB, templatesDB } from "../db";
import "../styles/Dashboard.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

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

// FAQ Data accurately aligned with the system's static structural analysis 
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
    answer: "Yes! The platform includes a Memory Visualizer that actively tracks the allocation of variables, arrays, and recursive call stacks as your algorithm runs. This helps you visually differentiate between in-place algorithms and those that consume extra memory."
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

// SVG Icons for modern UI
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState([]);
  const [systemTemplates, setSystemTemplates] = useState(SYSTEM_TEMPLATES);
  const [userTemplates, setUserTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState(null);

  // Dynamic progress state
  const [progressData, setProgressData] = useState({
    percent: 0,
    moduleTitle: "Welcome",
    moduleBadge: "Up Next • Module 0",
    moduleDesc: "Start your journey into algorithm visualization and complexity analysis."
  });

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
      const user = storedUser ? JSON.parse(storedUser) : null;

      // 1. Compute User Learning Progress
      let total = 0;
      let completed = 0;
      let nextMod = curriculumIndex[0];
      let foundNext = false;

      for (const mod of curriculumIndex) {
        let modCompleted = 0;
        for (const les of mod.lessons) {
          total++;
          if (user && user.progress && user.progress[les.lessonId]) {
            completed++;
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

      const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

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

      // 2. Fetch and Sync Projects and Templates from Cloud
      if (navigator.onLine && user) {
        try {
          const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
          const headers = {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          };

          // Fetch Projects
          const pRes = await fetch(`${API_BASE}/api/projects?userId=${user.email}`, { headers });
          if (pRes.ok) {
            const pData = await pRes.json();
            const cloudProjects = Array.isArray(pData.projects) ? pData.projects : (Array.isArray(pData) ? pData : []);
            for (const cp of cloudProjects) {
              if (cp.owner_id === user.email || cp.userId === user.email) {
                await projectsDB.setItem(cp._id, { ...cp, synced: true });
              }
            }
          }

          // Fetch Custom Templates
          const tRes = await fetch(`${API_BASE}/api/templates?userId=${user.email}`, { headers });
          if (tRes.ok) {
            const tData = await tRes.json();
            const cloudTemplates = Array.isArray(tData.templates) ? tData.templates : (Array.isArray(tData) ? tData : []);
            for (const ct of cloudTemplates) {
              if (ct.owner_id === user.email || ct.userId === user.email) {
                await templatesDB.setItem(ct._id, { ...ct, synced: true });
              }
            }
          }

        } catch (fetchErr) {
          console.error("Failed to fetch cloud projects or templates:", fetchErr);
        }
      }

      // 3. Load from local IndexedDB (handles offline or newly synced data)
      const loadedProjects = [];
      await projectsDB.iterate((value) => {
        if (!user || value.owner_id === user.email || value.userId === user.email) {
          loadedProjects.push(value);
        }
      });
      const sortedProjects = loadedProjects.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setRecentProjects(sortedProjects.slice(0, 5));

      const loadedTemplates = [];
      await templatesDB.iterate((value) => {
        if (!user || value.owner_id === user.email || value.userId === user.email) {
          loadedTemplates.push({
            ...value,
            isSystem: false,
            icon: "/assets/blocks-icon.png", 
            desc: value.description || "User-created template",
            name: value.title || value.name || "Untitled Template"
          });
        }
      });
      const sortedTemplates = loadedTemplates.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setUserTemplates(sortedTemplates);

    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleTryTemplate = async (template) => {
    try {
      if (template.isSystem) {
        const response = await fetch(`/templates/${template.path}.json`);
        if (!response.ok) throw new Error("Template file not found");
        const data = await response.json();
        
        // Wrap system template securely inside `data` property
        const proj = { 
          data: data, 
          isTemplate: true, 
          templateId: template.path, 
          name: template.name,
          title: template.name 
        };
        navigate("/workspace", { state: { projectToLoad: proj } });
      } else {
        // Extract dynamically located blocks securely into `data` property
        const proj = { 
          data: template.blocks || template.data || template.workspace?.blocklyJson, 
          isTemplate: true, 
          templateId: template._id, 
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
      <DashboardHeader />
      
      <main className="bento-dashboard-content">
        <div className="bento-grid-container">
          
          {/* Main Content Column */}
          <div className="bento-main-column">
            
            {/* Hero Card */}
            <section className="bento-hero-card">
              <div className="hero-text">
                <h1 className="hero-title">Welcome to AlgoBlocks!</h1>
                <p className="hero-subtitle">
                  An interactive thesis platform to build, visualize, and analyze algorithms with real-time Big-O feedback.
                </p>
              </div>
              <button 
                className="hero-primary-btn" 
                onClick={() => navigate("/workspace")}
              >
                <PlusIcon />
                <span>Blank Workspace</span>
              </button>
            </section>

            {/* Learning Path Card */}
            <section className="bento-learning-card">
              <div className="learning-content">
                <span className="module-badge">{progressData.moduleBadge}</span>
                <h3 className="learning-title">{progressData.moduleTitle}</h3>
                <p className="learning-desc">{progressData.moduleDesc}</p>
                <div className="progress-container">
                  <div className="progress-header">
                    <span>Course Progress</span>
                    <span>{progressData.percent}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${progressData.percent}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="learning-action">
                <button className="banner-icon-btn" onClick={() => navigate("/learning-path")}>
                  <img 
                    src="/assets/learning-icon.png" 
                    alt="Learning Path" 
                    className="learning-path-img"
                  />
                </button>
              </div>
            </section>

            {/* Custom User Templates Section */}
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
                      <div 
                        key={tpl._id || i} 
                        className="bento-template-card custom-template-card"
                        onClick={() => handleTryTemplate(tpl)}
                        style={{ borderTop: "3px solid #db7fff" }}
                      >
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

            {/* System Template Library Grid */}
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
                      <div 
                        key={i} 
                        className="bento-template-card"
                        onClick={() => handleTryTemplate(tpl)}
                      >
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

            {/* Help / FAQ Section */}
            <section className="bento-help-section" style={{ marginTop: "20px", marginBottom: "40px" }}>
              <div className="section-header">
                <h2>Help & Resources</h2>
                <p>Frequently asked questions and guides to get you started.</p>
              </div>
              <div className="bento-faq-container">
                {FAQ_ITEMS.map((faq, index) => (
                  <div 
                    key={index} 
                    className={`bento-faq-item ${expandedFaq === index ? "expanded" : ""}`}
                  >
                    <button 
                      className="bento-faq-question" 
                      onClick={() => toggleFaq(index)}
                    >
                      <span>{faq.question}</span>
                      <ChevronDownIcon expanded={expandedFaq === index} />
                    </button>
                    <div 
                      className="bento-faq-answer"
                      style={{
                        maxHeight: expandedFaq === index ? "500px" : "0",
                        opacity: expandedFaq === index ? 1 : 0,
                        padding: expandedFaq === index ? "0 20px 20px 20px" : "0 20px"
                      }}
                    >
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Sidebar Column */}
          <aside className="bento-sidebar-column">
            <div className="bento-recent-card">
              <div className="recent-header">
                <h3>Recent Projects</h3>
                <span className="recent-badge">{recentProjects.length}</span>
              </div>

              {/* View All Projects Moved to Top */}
              {recentProjects.length > 0 && (
                <button 
                  className="view-all-projects-btn"
                  onClick={() => navigate("/projects")}
                >
                  View All Projects
                </button>
              )}

              <div className="recent-projects-container">
                {loading ? (
                  <div className="bento-empty-state">Loading workspace data...</div>
                ) : recentProjects.length === 0 ? (
                  <div className="bento-empty-state">
                    <div className="empty-icon"><CodeIcon /></div>
                    <p>No recent projects.</p>
                    <span>Your saved work will appear here.</span>
                  </div>
                ) : (
                  <div className="bento-recent-list">
                    {recentProjects.map((proj) => (
                      <div 
                        key={proj._id || proj.id} 
                        className="bento-recent-item" 
                        onClick={() => navigate("/workspace", { state: { projectToLoad: proj } })}
                      >
                        <div className="recent-item-icon">
                          <CodeIcon />
                        </div>
                        <div className="recent-item-content">
                          <h4 className="recent-item-title">{proj.title || proj.name}</h4>
                          <div className="recent-item-meta">
                            <ClockIcon />
                            <span>{new Date(proj.updatedAt || Date.now()).toLocaleDateString()}</span>
                            <span className="dot-separator">•</span>
                            <span className={`sync-status ${proj.synced ? "synced" : "local"}`}>
                              {proj.synced ? "Cloud" : "Local"}
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