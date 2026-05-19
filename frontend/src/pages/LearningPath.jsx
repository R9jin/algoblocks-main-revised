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

  // Fetch separate module JSONs dynamically
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const loadedModules = [];

        // Loop through modules 0 to 6 based on the curriculum
        for (let i = 0; i <= 6; i++) {
          try {
            const response = await fetch(`/data/modules/module_${i}.json`);

            // Check if the response is actually JSON, not an HTML fallback page
            const contentType = response.headers.get("content-type");
            if (response.ok && contentType && contentType.includes("application/json")) {
              const data = await response.json();
              loadedModules.push(data);
            } else {
              console.warn(`Module ${i} was not found or returned HTML instead of JSON. Ensure '/public/data/modules/module_${i}.json' exists.`);
            }
          } catch (fileError) {
            console.warn(`Error fetching module ${i}:`, fileError);
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

  // Load User Progress from localStorage
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
        activityData: topic // Passes the task and CodeChum testCases to the editor
      }
    });
  };

  if (loading) {
    return <div className="loading-screen">Loading Educational Modules...</div>;
  }

  // Flatten topics to calculate strictly sequential unlocking
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
            <h2>AlgoBlocks Learning Path</h2>
            <p>Master algorithms step-by-step through interactive block programming.</p>
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

                  // Use the unique topic ID to track progress
                  const activityKey = topic.id;
                  const score = userProgress[activityKey];
                  const isCompleted = score !== undefined;
                  const testCount = topic.testCases ? topic.testCases.length : 0;

                  // Lock mechanism: Topic is unlocked if it's the first one, or if the previous one is completed
                  const flatIndex = allTopicsFlattened.findIndex((t) => t.id === topic.id);
                  let isUnlocked = true;

                  if (flatIndex > 0) {
                    const prevTopic = allTopicsFlattened[flatIndex - 1];
                    isUnlocked = userProgress[prevTopic.id] !== undefined;
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
                            <strong className="lp-task-title">Module Task:</strong>
                            <p className="lp-task-desc">{topic.task}</p>
                          </div>

                          {topic.templatePath && (
                            <div className="lp-topic-footer">
                              {testCount > 0 && (
                                <span className="lp-test-cases">
                                  {testCount} Standard I/O Test Cases
                                </span>
                              )}

                              {isCompleted ? (
                                <button
                                  className="lp-review-btn"
                                  onClick={() => handleStartActivity(topic)}
                                >
                                  Review Code
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