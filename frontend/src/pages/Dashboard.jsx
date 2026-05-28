// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { projectsDB, templatesDB } from "../db";
import "../styles/Dashboard.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

const SYSTEM_TEMPLATES = {
  sorting: [
    { name: "Bubble Sort", path: "sort/bubble_sort", desc: "Repeatedly steps through the list, compares adjacent elements, and swaps them if they are in the wrong order.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Selection Sort", path: "sort/selection_sort", desc: "Repeatedly selects the smallest element from the unsorted sublist and swaps it with the leftmost unsorted element.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Insertion Sort", path: "sort/insertion_sort", desc: "Builds the final sorted array one item at a time by comparing the current element to the sorted portion.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Merge Sort", path: "sort/merge_sort", desc: "A highly efficient divide-and-conquer algorithm that recursively splits and merges lists.", icon: "/assets/sort-icon.png", isSystem: true },
    { name: "Quick Sort", path: "sort/quick_sort", desc: "Uses a divide-and-conquer approach by partitioning elements around a pivot.", icon: "/assets/sort-icon.png", isSystem: true }
  ],
  searching: [
    { name: "Linear Search", path: "search/linear_search", desc: "Checks every element in the list sequentially until the desired element is found.", icon: "/assets/search-icon.png", isSystem: true },
    { name: "Binary Search", path: "search/binary_search", desc: "Finds the position of a target value within a sorted array by repeatedly dividing the search interval in half.", icon: "/assets/search-icon.png", isSystem: true },
    { name: "Exponential Search", path: "search/exponential_search", desc: "Locates a range by doubling the index, then performs a binary search within that range.", icon: "/assets/search-icon.png", isSystem: true }
  ],
  recursive: [
    { name: "Factorial", path: "recursive/recursive_factorial", desc: "Calculates the factorial of a non-negative integer using a recursive function.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Fibonacci", path: "recursive/recursive_fibonacci", desc: "Generates the Fibonacci sequence where each number is the sum of the two preceding ones.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Permutation", path: "recursive/recursive_permutation", desc: "Generates all possible arrangements using recursive backtracking.", icon: "/assets/recursive-icon.png", isSystem: true },
    { name: "Tower of Hanoi", path: "recursive/recursive_tower_of_hanoi", desc: "Moves disks between rods following specific recursive rules.", icon: "/assets/recursive-icon.png", isSystem: true }
  ]
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState([]);
  const [userTemplatesGrouped, setUserTemplatesGrouped] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLocalData = async () => {
      const storedUserStr = localStorage.getItem("user");
      if (!storedUserStr) {
        setLoading(false);
        return;
      }
      const storedUser = JSON.parse(storedUserStr);

      // --- 1. PULL CLOUD DATA FIRST ---
      if (navigator.onLine) {
        try {
          // FIXED: Pass explicit userId parameter so backend responds properly
          const pRes = await fetch(`${API_BASE}/api/projects?userId=${storedUser.email}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            
            let cloudProjects = [];
            if (pData && Array.isArray(pData.projects)) cloudProjects = pData.projects;
            else if (Array.isArray(pData)) cloudProjects = pData;

            for (const cp of cloudProjects) {
              // FIXED: CHECK BOTH USER ID TYPES
              if (cp.owner_id === storedUser.email || cp.userId === storedUser.email) {
                await projectsDB.setItem(cp._id, { ...cp, synced: true });
              }
            }
          }

          // FIXED: Pass explicit userId parameter so backend responds properly
          const tRes = await fetch(`${API_BASE}/api/templates?userId=${storedUser.email}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            
            let cloudTemplates = [];
            if (tData && Array.isArray(tData.templates)) cloudTemplates = tData.templates;
            else if (Array.isArray(tData)) cloudTemplates = tData;

            for (const ct of cloudTemplates) {
              // FIXED: CHECK BOTH USER ID TYPES
              if (ct.owner_id === storedUser.email || ct.userId === storedUser.email) {
                await templatesDB.setItem(ct._id, { ...ct, synced: true });
              }
            }
          }
        } catch (fetchErr) {
          console.error("Failed to sync cloud data:", fetchErr);
        }
      }

      // --- 2. FETCH FROM LOCAL DB ---
      
      const userProjects = [];
      await projectsDB.iterate((value) => {
        // FIXED: CHECK BOTH USER ID TYPES
        if (value.owner_id === storedUser.email || value.userId === storedUser.email) {
          userProjects.push(value);
        }
      });

      setRecentProjects(
        userProjects
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .slice(0, 5)
      );

      const userTemplates = [];
      await templatesDB.iterate((value) => {
        // FIXED: CHECK BOTH USER ID TYPES
        if (value.owner_id === storedUser.email || value.userId === storedUser.email) {
          userTemplates.push(value);
        }
      });

      const grouped = {};
      userTemplates.forEach((t) => {
        const category = t.category || "Custom Templates";
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push({
            ...t,
            name: t.title || t.name, 
            desc: t.description || t.desc
        });
      });

      setUserTemplatesGrouped(grouped);
      setLoading(false);
    };

    loadLocalData();
  }, []); 

  const handleItemClick = (item) => {
    const confirmMsg = item.isSystem
      ? `Start a new project using "${item.name}"?`
      : `Load your custom template "${item.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    if (item.isSystem) {
      navigate("/workspace", { state: { templatePath: item.path } });
    } else {
      navigate("/workspace", {
        state: {
          projectToLoad: {
            title: item.name,
            data: item.data,
            _id: item._id
          }
        }
      });
    }
  };

  return (
    <div className="dashboard-container">
      <DashboardHeader />

      <div className="dashboard-body">
        <main className="dashboard-main">
          {/* Learning Path Banner */}
          <div className="learning-path-banner" onClick={() => navigate("/learning-path")}>
            <div className="banner-icon">
              <img src="/assets/learning-icon.png" alt="Learning Path" />
            </div>
            <div className="banner-text">
              <h2>Learning Path</h2>
              <p>Follow a structured curriculum to master algorithms step-by-step.</p>
            </div>
            <div className="banner-arrow">→</div>
          </div>

          <h1 className="section-title">Algorithm Library</h1>

          <div className="algorithm-library-grid">
            {/* SYSTEM TEMPLATES */}
            {Object.entries(SYSTEM_TEMPLATES).map(([catKey, items]) => (
              <div key={catKey} className="algorithm-column">
                <h3 className="column-title">{catKey.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div
                    key={temp.name}
                    className="algorithm-card"
                    onClick={() => handleItemClick(temp)}
                  >
                    <div className="card-header">
                      <img src={temp.icon} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>
                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc}</p>
                      <button className="try-template-btn">Test Template →</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* USER TEMPLATES */}
            {Object.entries(userTemplatesGrouped).map(([category, items]) => (
              <div key={category} className="algorithm-column">
                <h3 className="column-title">{category.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div
                    key={temp._id}
                    className="algorithm-card custom-template-card"
                    onClick={() => handleItemClick(temp)}
                  >
                    <div className="card-header">
                      <img src={temp.icon || "/assets/folder-icon.png"} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>
                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc || "User defined template."}</p>
                      <button className="try-template-btn">Load Template →</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>

        <aside className="dashboard-sidebar">
          <h3 className="sidebar-label">RECENT PROJECTS</h3>
          {loading ? (
            <div className="empty-projects-box">Loading database...</div>
          ) : recentProjects.length === 0 ? (
            <div className="empty-projects-box">No recent projects yet.</div>
          ) : (
            <div className="recent-projects-list">
              {recentProjects.map((proj) => (
                <div
                  key={proj._id}
                  className="recent-project-item"
                  onClick={() =>
                    navigate("/workspace", { state: { projectToLoad: proj } })
                  }
                >
                  <div className="project-item-info">
                    <div className="project-item-title">{proj.title || proj.name}</div>
                    <div className="project-item-meta">
                      Last modified: {new Date(proj.updatedAt || Date.now()).toLocaleDateString()}
                    </div>
                  </div>

                  <div
                    className={`project-item-status ${proj.synced ? "synced" : "local"}`}
                  >
                    {proj.synced ? "Cloud Synced" : "Local Only"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}