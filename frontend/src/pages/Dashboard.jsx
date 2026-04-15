import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import { projectsDB } from "../db"; // ✅ using localforage instance correctly
import "../styles/Dashboard.css";
import { pushOfflineChangesToCloud } from "../utils/syncManager";

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
    // =========================
    // ONLINE SYNC HANDLER
    // =========================
    const handleOnline = async () => {
      console.log("Internet restored! Syncing offline changes...");
      await pushOfflineChangesToCloud();
    };

    window.addEventListener("online", handleOnline);

    // =========================
    // LOAD LOCAL DATA (FIXED FOR LOCALFORAGE)
    // =========================
    const loadLocalData = async () => {
      const storedUser = JSON.parse(localStorage.getItem("user"));
      if (!storedUser) return;

      if (navigator.onLine) {
        pushOfflineChangesToCloud();
      }

      const allProjects = [];

      // FIX: localforage has no query API → must iterate
      await projectsDB.iterate((value) => {
        allProjects.push(value);
      });

      // =========================
      // FILTER USER PROJECTS
      // =========================
      const userProjects = allProjects.filter(
        (p) => p.owner_id === storedUser.email && !p.isTemplate
      );

      setRecentProjects(
        userProjects
          .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified))
          .slice(0, 5)
      );

      // =========================
      // GROUP USER TEMPLATES
      // =========================
      const templates = allProjects.filter(
        (p) => p.owner_id === storedUser.email && p.isTemplate
      );

      const grouped = {};

      templates.forEach((t) => {
        const category = t.category || "custom";
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(t);
      });

      setUserTemplatesGrouped(grouped);

      setLoading(false);
    };

    loadLocalData();

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const handleItemClick = (item) => {
    const confirmMsg = item.isSystem
      ? `Start a new project using "${item.name}"?`
      : `Load your custom template "${item.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    if (item.isSystem) {
      navigate("/app", { state: { templatePath: item.path } });
    } else {
      navigate("/app", {
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
                      <button className="try-template-btn">
                        Test Template →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* USER TEMPLATES (FIXED DB LOADING) */}
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
                      <img src={temp.icon} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>

                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc}</p>
                      <button className="try-template-btn">
                        Load Template →
                      </button>
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
            <div className="empty-projects-box">Loading local database...</div>
          ) : recentProjects.length === 0 ? (
            <div className="empty-projects-box">No recent projects yet.</div>
          ) : (
            <div className="recent-projects-list">
              {recentProjects.map((proj) => (
                <div
                  key={proj._id}
                  className="recent-project-item"
                  onClick={() =>
                    navigate("/app", { state: { projectToLoad: proj } })
                  }
                >
                  <div className="project-item-title">{proj.title}</div>

                  <div
                    className={`project-item-status ${
                      proj.synced ? "synced" : "local"
                    }`}
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