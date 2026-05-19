import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import "../styles/LearningPath.css";

export default function LearningPath() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [userProgress, setUserProgress] = useState({});
  const [loading, setLoading] = useState(true);

  // 1. Fetch separate module JSONs
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const loadedModules = [];
        // Loop through 0 to 6 based on the curriculum
        for (let i = 0; i <= 6; i++) {
          const response = await fetch(`/data/modules/module_${i}.json`);
          if (response.ok) {
            const data = await response.json();
            loadedModules.push(data);
          }
        }
        setModules(loadedModules);
      } catch (error) {
        console.error("Failed to load modules:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, []);

  // 2. Load User Progress
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUserProgress(parsedUser.progress || {});
    } else {
      navigate("/signin");
    }
  }, [navigate]);

  const toggleTopic = (topicId) => {
    setExpandedTopic(expandedTopic === topicId ? null : topicId);
  };

  const handleStartActivity = (topic) => {
    navigate("/activity", {
      state: {
        templatePath: topic.templatePath,
        activityData: topic
      }
    });
  };

  if (loading) {
    return <div className="loading-screen">Loading Curriculum...</div>;
  }

  const allTopicsFlattened = modules.flatMap((mod) => mod.topics);

  return (
    <div className="learning-path-page">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />

      <main className="lp-main">
        <div className="lp-hero">
          <div className="lp-hero-icon">
            <img src="/assets/learning-icon.png" alt="Learning" />
          </div>
          <div className="lp-hero-text">
            <h2>Learning Path</h2>
            <p>Master algorithms step-by-step</p>
          </div>
        </div>

        <div className="lp-info-box">
          Complete the interactive console-based tasks to advance through the modules!
        </div>

        <div className="lp-lessons">
          {modules.map((mod) => (
            <div key={mod.id} className="lp-lesson-card">

              <div className="lp-lesson-header">
                <img src="/assets/book-icon.png" alt="Book" className="lp-book-icon" />
                <div className="lp-lesson-title-group">
                  <span className="lp-lesson-number">{mod.number}</span>
                  <h3 className="lp-lesson-title">{mod.title}</h3>
                </div>
              </div>

              <div className="lp-topics">
                {mod.topics.map((topic) => {
                  const isExpanded = expandedTopic === topic.id;
                  const activityKey = topic.templatePath
                    ? topic.templatePath.split("/").pop()
                    : null;

                  const score = activityKey ? userProgress[activityKey] : undefined;
                  const isCompleted = score !== undefined;
                  const testCount = topic.testCases ? topic.testCases.length : 0;

                  const flatIndex = allTopicsFlattened.findIndex((t) => t.id === topic.id);
                  let isUnlocked = true;

                  if (flatIndex > 0) {
                    const prevTopic = allTopicsFlattened[flatIndex - 1];
                    const prevKey = prevTopic.templatePath?.split("/").pop();
                    isUnlocked = prevKey && userProgress[prevKey] !== undefined;
                  }

                  return (
                    <div key={topic.id} className={`lp-topic-container ${isExpanded ? "expanded" : ""} ${!isUnlocked ? "locked" : ""}`}>
                      <div className="lp-topic-row" onClick={() => isUnlocked && toggleTopic(topic.id)}>
                        <div className="lp-topic-row-left">
                          <div className="lp-topic-titles">
                            <span className="lp-topic-number">{topic.number}</span>
                            <h4 className="lp-topic-name">{topic.title}</h4>
                          </div>
                        </div>

                        <div className="lp-topic-right">
                          <div className="lp-topic-badge">{topic.level}</div>

                          {!isUnlocked ? (
                            <span className="pending-badge" style={{ opacity: 0.8, cursor: 'not-allowed' }}>
                              🔒 Locked
                            </span>
                          ) : isCompleted ? (
                            <span className={`score-badge ${score === testCount ? 'perfect' : 'partial'}`}>
                              {score}/{testCount} Tests Passed
                            </span>
                          ) : (
                            <span className="pending-badge">Not Started</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="lp-topic-content">
                          <div className="lp-topic-task">
                            <strong className="lp-task-title">Module Overview:</strong>
                            <p className="lp-task-desc">{topic.task}</p>
                          </div>

                          {topic.templatePath && (
                            <div className="lp-topic-footer">
                              {testCount > 0 && (
                                <span className="lp-test-cases">
                                  {testCount} CodeChum standard I/O test cases
                                </span>
                              )}

                              {isCompleted ? (
                                <button
                                  className="lp-review-btn"
                                  onClick={() => handleStartActivity(topic)}
                                >
                                  Review Activity
                                </button>
                              ) : (
                                <button
                                  className="lp-start-btn"
                                  onClick={() => handleStartActivity(topic)}
                                >
                                  Start Activity
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      </main>
    </div>
  );
}