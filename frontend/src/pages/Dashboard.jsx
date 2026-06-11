// frontend/src/pages/Dashboard.jsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { projectsDB } from "../db"; // Fully restored original imports
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
  graph: [
    { name: "Breadth-First Search", path: "graph/bfs", desc: "Explores a graph level by level using a queue.", icon: "/assets/complexity-icon.png", isSystem: true },
    { name: "Depth-First Search", path: "graph/dfs", desc: "Explores a graph by going as deep as possible using a stack or recursion.", icon: "/assets/complexity-icon.png", isSystem: true },
  ],
  trees: [
    { name: "Binary Search Tree", path: "tree/bst_insert", desc: "Inserts elements into a BST while maintaining the left-child right-child property.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Inorder Traversal", path: "tree/inorder", desc: "Visits the left subtree, the root, and then the right subtree.", icon: "/assets/recursive-icon.png", isSystem: true },
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
  ],
  dp: [
    { name: "0/1 Knapsack", path: "dp/knapsack", desc: "Finds the maximum value that can be put in a knapsack of a given capacity.", icon: "/assets/book-icon.png", isSystem: true },
    { name: "Longest Common Subsequence", path: "dp/lcs", desc: "Finds the longest subsequence present in given sequences.", icon: "/assets/book-icon.png", isSystem: true },
  ]
};

// SVG Icons
const PlusIcon = () => <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const CodeIcon = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
const ClockIcon = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ArrowRightIcon = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;
const PlayIcon = () => <svg width="36" height="36" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>;

export default function Dashboard() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState([]);
  const [templates, setTemplates] = useState(SYSTEM_TEMPLATES);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Robust Dexie fetching fallback
      let allProjects = [];
      if (projectsDB && typeof projectsDB.toArray === 'function') {
        allProjects = await projectsDB.toArray();
      } else if (projectsDB && typeof projectsDB.getAll === 'function') {
        allProjects = await projectsDB.getAll();
      }

      const sorted = allProjects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setRecentProjects(sorted.slice(0, 5));

      // Custom Templates fetch
      try {
        const token = localStorage.getItem("token");
        if (token) {
          const res = await fetch(`${API_BASE}/api/templates/all`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const customTemplates = await res.json();
            if (customTemplates.length > 0) {
              setTemplates((prev) => ({
                ...prev,
                custom: customTemplates.map(t => ({
                  ...t,
                  isSystem: false,
                  icon: "/assets/blocks-icon.png", 
                  desc: t.description || "User-created template"
                }))
              }));
            }
          }
        }
      } catch (templateError) {
        console.warn("Could not fetch custom templates, using default system templates.", templateError);
      }

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
        const proj = { ...data, isTemplate: true, templateId: template.path, name: template.name };
        navigate("/workspace", { state: { projectToLoad: proj } });
      } else {
        const proj = { 
          blocks: template.blocks, 
          variables: template.variables || [], 
          isTemplate: true, 
          templateId: template._id, 
          name: template.name 
        };
        navigate("/workspace", { state: { projectToLoad: proj } });
      }
    } catch (err) {
      console.error("Error loading template:", err);
      alert("Failed to load template.");
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
                <h1 className="hero-title">Welcome to AlgoBlocks</h1>
                <p className="hero-subtitle">
                  Build, visualize, and analyze algorithms with real-time Big-O feedback.
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

            {/* Restored Learning Path Card */}
            <section className="bento-learning-card">
              <div className="learning-content">
                <span className="module-badge">Up Next • Module 3</span>
                <h3 className="learning-title">Divide and Conquer Strategies</h3>
                <p className="learning-desc">Master recursive decomposition and logarithmic time complexity boundaries.</p>
                <div className="progress-container">
                  <div className="progress-header">
                    <span>Course Progress</span>
                    <span>60%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: "60%" }}></div>
                  </div>
                </div>
              </div>
              <div className="learning-action">
                <button className="play-btn" onClick={() => navigate("/learning-path")}>
                  <PlayIcon />
                </button>
              </div>
            </section>

            {/* Template Library Grid */}
            <section className="bento-library-section">
              <div className="section-header">
                <h2>Algorithm Templates</h2>
                <p>Start with a pre-built structure and explore its complexity.</p>
              </div>

              {Object.entries(templates).map(([category, items]) => (
                <div key={category} className="bento-category-group">
                  <h3 className="category-title">{category.toUpperCase()}</h3>
                  <div className="bento-template-grid">
                    {items.map((tpl, i) => (
                      <div 
                        key={i} 
                        className={`bento-template-card ${!tpl.isSystem ? "custom-template-card" : ""}`}
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
          </div>

          {/* Sidebar Column */}
          <aside className="bento-sidebar-column">
            <div className="bento-recent-card">
              <div className="recent-header">
                <h3>Recent Projects</h3>
                <span className="recent-badge">{recentProjects.length}</span>
              </div>

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
              
              {recentProjects.length > 0 && (
                <button 
                  className="view-all-projects-btn"
                  onClick={() => navigate("/projects")}
                >
                  View All Projects
                </button>
              )}
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}