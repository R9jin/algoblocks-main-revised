import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import "../styles/Dashboard.css";

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
    const fetchData = async () => {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(storedUser);

      try {
        // Fetch Projects and Custom Templates simultaneously
        const [projRes, tempRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/templates")
        ]);

        const projData = await projRes.json();
        const tempData = await tempRes.json();

        if (projRes.ok && projData.status === "success") {
          const userProjects = projData.projects.filter(p => p.owner_id === user.email);
          setRecentProjects(userProjects.reverse().slice(0, 5));
        }

        if (tempRes.ok && tempData.status === "success") {
          // Filter user templates and group by category
          const userTemplates = tempData.templates.filter(t => t.owner_id === user.email);
          const grouped = userTemplates.reduce((acc, t) => {
            const cat = t.category || "Custom Templates";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push({
              name: t.title,
              desc: t.description,
              data: t.data,
              icon: "/assets/user-icon.png", // Use user icon for custom templates
              isSystem: false,
              _id: t._id
            });
            return acc;
          }, {});
          setUserTemplatesGrouped(grouped);
        }
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleItemClick = (item) => {
    const confirmMsg = item.isSystem 
      ? `Start a new project using the "${item.name}" template?` 
      : `Load your custom template "${item.name}"? This will overwrite your workspace.`;
    
    if (window.confirm(confirmMsg)) {
      if (item.isSystem) {
        navigate("/app", { state: { templatePath: item.path } });
      } else {
        // For custom templates, we pass the data directly
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
            <div className="banner-icon">
              <img src="/assets/learning-icon.png" alt="Learning Path" />
            </div>
            <div className="banner-text">
              <h2>Learning Path</h2>
              <p>Structured lessons - master algorithms step-by-step</p>
            </div>
            <div className="banner-arrow">&gt;</div>
          </div>

          <h1 className="section-title">Algorithm Library</h1>

          <div className="algorithm-library-grid">
            {/* 1. Render Built-in Categories */}
            {Object.entries(SYSTEM_TEMPLATES).map(([catKey, items]) => (
              <div key={catKey} className="algorithm-column">
                <h3 className="column-title">{catKey.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div key={temp.name} className="algorithm-card">
                    <div className="card-header">
                      <img src={temp.icon} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>
                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc}</p>
                      <button className="try-template-btn" onClick={() => handleItemClick(temp)}>
                        Test Template →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* 2. Render Custom Categories from User */}
            {Object.entries(userTemplatesGrouped).map(([category, items]) => (
              <div key={category} className="algorithm-column">
                <h3 className="column-title">{category.toUpperCase()}</h3>
                {items.map((temp) => (
                  <div key={temp._id} className="algorithm-card custom-template-card">
                    <div className="card-header">
                      <img src={temp.icon} alt={temp.name} className="card-icon-img" />
                      <h4>{temp.name}</h4>
                    </div>
                    <div className="card-hover-content">
                      <p className="template-card-desc">{temp.desc || "User created template"}</p>
                      <button className="try-template-btn" onClick={() => handleItemClick(temp)}>
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
            <div className="empty-projects-box">Loading...</div>
          ) : recentProjects.length === 0 ? (
            <div className="empty-projects-box">No recent projects yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              {recentProjects.map(proj => (
                <div
                  key={proj._id}
                  className="recent-project-item"
                  style={{
                    backgroundColor: '#2A1F4C',
                    padding: '15px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => navigate('/app', { state: { projectToLoad: proj } })}
                >
                  <div style={{ fontWeight: 'bold', color: '#EBE4FF', marginBottom: '4px' }}>{proj.title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#A594DC' }}>Saved to Cloud</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}