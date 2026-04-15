import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { db } from "../db"; //
import "../styles/Dashboard.css"; //
import { syncProjectsToCloud } from "../utils/syncManager"; //

const SYSTEM_TEMPLATES = {
  sorting: [
    {
      name: "Bubble Sort",
      path: "sort/bubble_sort",
      desc: "Repeatedly steps through the list, compares adjacent elements, and swaps them if they are in the wrong order.",
      icon: "/assets/sort-icon.png",
      isSystem: true
    },
    {
      name: "Selection Sort",
      path: "sort/selection_sort",
      desc: "Repeatedly selects the smallest element from the unsorted sublist and swaps it with the leftmost unsorted element.",
      icon: "/assets/sort-icon.png",
      isSystem: true
    },
    {
      name: "Insertion Sort",
      path: "sort/insertion_sort",
      desc: "Builds the final sorted array one item at a time by comparing the current element to the sorted portion.",
      icon: "/assets/sort-icon.png",
      isSystem: true
    },
    {
      name: "Merge Sort",
      path: "sort/merge_sort",
      desc: "A highly efficient divide-and-conquer algorithm that recursively splits and merges lists.",
      icon: "/assets/sort-icon.png",
      isSystem: true
    },
    {
      name: "Quick Sort",
      path: "sort/quick_sort",
      desc: "Uses a divide-and-conquer approach by partitioning elements around a pivot.",
      icon: "/assets/sort-icon.png",
      isSystem: true
    }
  ],
  searching: [
    {
      name: "Linear Search",
      path: "search/linear_search",
      desc: "Checks every element in the list sequentially until the desired element is found.",
      icon: "/assets/search-icon.png",
      isSystem: true
    },
    {
      name: "Binary Search",
      path: "search/binary_search",
      desc: "Finds the position of a target value within a sorted array by repeatedly dividing the search interval in half.",
      icon: "/assets/search-icon.png",
      isSystem: true
    },
    {
      name: "Exponential Search",
      path: "search/exponential_search",
      desc: "Locates a range by doubling the index, then performs a binary search within that range.",
      icon: "/assets/search-icon.png",
      isSystem: true
    }
  ],
  recursive: [
    {
      name: "Factorial",
      path: "recursive/recursive_factorial",
      desc: "Calculates the factorial of a non-negative integer using a recursive function.",
      icon: "/assets/recursive-icon.png",
      isSystem: true
    },
    {
      name: "Fibonacci",
      path: "recursive/recursive_fibonacci",
      desc: "Generates the Fibonacci sequence where each number is the sum of the two preceding ones.",
      icon: "/assets/recursive-icon.png",
      isSystem: true
    },
    {
      name: "Permutation",
      path: "recursive/recursive_permutation",
      desc: "Generates all possible arrangements using recursive backtracking.",
      icon: "/assets/recursive-icon.png",
      isSystem: true
    },
    {
      name: "Tower of Hanoi",
      path: "recursive/recursive_tower_of_hanoi",
      desc: "Moves disks between rods following specific recursive rules.",
      icon: "/assets/recursive-icon.png",
      isSystem: true
    }
  ]
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState([]);
  const [userTemplatesGrouped, setUserTemplatesGrouped] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(storedUser);

      try {
        // Trigger background sync to MongoDB if online
        if (navigator.onLine) {
          syncProjectsToCloud(); 
        }

        // 1. Load ALL projects from IndexedDB for this user
        const allLocalData = await db.projects
          .where("owner_id")
          .equals(user.email)
          .toArray();

        // 2. Filter for regular projects (Recent Projects)
        const projects = allLocalData.filter(p => !p.isTemplate);
        setRecentProjects(
          projects.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified)).slice(0, 5)
        );

        // 3. Filter and group Custom User Templates
        const customTemplates = allLocalData.filter(p => p.isTemplate);
        const grouped = customTemplates.reduce((acc, t) => {
          const cat = t.category || "Custom Templates";
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push({
            name: t.title,
            desc: t.description || "User created template",
            data: t.data,
            icon: "/assets/user-icon.png",
            isSystem: false,
            _id: t._id || t.id // Use MongoDB _id if it exists, otherwise local ID
          });
          return acc;
        }, {});
        setUserTemplatesGrouped(grouped);

      } catch (error) {
        console.error("Dashboard data load error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const handleItemClick = (item) => {
    const confirmMsg = item.isSystem 
      ? `Start a new project using the "${item.name}" template?` 
      : `Load your custom template "${item.name}"?`;
    
    if (window.confirm(confirmMsg)) {
      if (item.isSystem) {
        navigate("/app", { state: { templatePath: item.path } });
      } else {
        navigate("/app", { state: { projectToLoad: { title: item.name, data: item.data, _id: item._id } } });
      }
    }
  };

  return (
    <div className="dashboard-container">
      <DashboardHeader />
      <div className="dashboard-body">
        <main className="dashboard-main">
          <div className="learning-path-banner" onClick={() => navigate('/learning-path')}>
            <div className="banner-icon"><img src="/assets/learning-icon.png" alt="Learning" /></div>
            <div className="banner-text">
              <h2>Learning Path</h2>
              <p>Structured lessons - master algorithms step-by-step</p>
            </div>
            <div className="banner-arrow">&gt;</div>
          </div>

          <h1 className="section-title">Algorithm Library</h1>

          <div className="algorithm-library-grid">
            {/* System Templates */}
            {Object.entries(SYSTEM_TEMPLATES).map(([catKey, items]) => (
              <div key={catKey} className="algorithm-column">
                <h3 className="column-title">{catKey.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div key={temp.name} className="algorithm-card" onClick={() => handleItemClick(temp)}>
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

            {/* Custom User Templates from IndexedDB */}
            {Object.entries(userTemplatesGrouped).map(([category, items]) => (
              <div key={category} className="algorithm-column">
                <h3 className="column-title">{category.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div key={temp.name} className="algorithm-card custom-template-card" onClick={() => handleItemClick(temp)}>
                    <div className="card-header">
                      <img src={temp.icon} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>
                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc}</p>
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
            <div className="empty-projects-box">Loading local storage...</div>
          ) : recentProjects.length === 0 ? (
            <div className="empty-projects-box">No recent projects yet.</div>
          ) : (
            <div className="recent-projects-list">
              {recentProjects.map(proj => (
                <div
                  key={proj.id}
                  className="recent-project-item"
                  onClick={() => navigate('/app', { state: { projectToLoad: proj } })}
                >
                  <div className="project-item-title">{proj.title}</div>
                  <div className={`project-item-status ${proj.isSynced ? 'synced' : 'local'}`}>
                    {proj.isSynced ? "Cloud Synced" : "Local Only"}
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