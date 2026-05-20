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

  // =========================================
  // FETCH MODULES
  // =========================================
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const loadedModules = [];

        for (let i = 0; i <= 6; i++) {
          try {
            const response = await fetch(
              `/data/modules/module_${i}.json`
            );

            const contentType =
              response.headers.get("content-type");

            if (
              response.ok &&
              contentType &&
              contentType.includes("application/json")
            ) {
              const data = await response.json();
              loadedModules.push(data);
            } else {
              console.warn(
                `module_${i}.json missing or invalid`
              );
            }
          } catch (err) {
            console.warn(
              `Failed loading module ${i}:`,
              err
            );
          }
        }

        setModules(loadedModules);
      } catch (err) {
        console.error("Failed loading modules:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, []);

  // =========================================
  // LOAD USER PROGRESS
  // =========================================
  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      navigate("/signin");
      return;
    }

    const parsedUser = JSON.parse(storedUser);

    setUserProgress(parsedUser.progress || {});
  }, [navigate]);

  // =========================================
  // TOGGLE TOPIC
  // =========================================
  const toggleTopic = (topicId) => {
    setExpandedTopic((prev) =>
      prev === topicId ? null : topicId
    );
  };

  // =========================================
  // START LESSON (Dynamic Routing)
  // =========================================
  const handleStartLesson = (topic) => {
    // Determine moduleId by searching modules in current state.
    const moduleId = modules.find((m) => m?.topics?.some((t) => t?.id === topic?.id))?.id;

    if (!moduleId || !topic.activities || topic.activities.length === 0) {
      navigate("/learning-path", { replace: true });
      return;
    }

    // Find the first activity that hasn't been passed yet (score < 1)
    const firstUnpassedActivity = topic.activities.find((act) => {
      const actKey = `${moduleId}:${act.id}`;
      return (userProgress[actKey] || 0) < 1;
    });

    // If all are passed, fallback to the first activity for review
    const activityId = firstUnpassedActivity ? firstUnpassedActivity.id : topic.activities[0].id;

    navigate(`/activity/${moduleId}/${activityId}`);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        Loading Educational Modules...
      </div>
    );
  }

  // =========================================
  // FLATTEN TOPICS FOR SEQUENTIAL UNLOCKING
  // =========================================
  const allTopicsFlattened = modules.flatMap((mod) =>
    mod.topics.map((topic) => ({ ...topic, moduleId: mod.id }))
  );

  // Helper function to check if ALL activities in a topic have a passing score (>= 1)
  const checkTopicCompleted = (topicObj) => {
    if (userProgress[topicObj.id] === true) return true; // Legacy fallback
    if (!topicObj.activities || topicObj.activities.length === 0) return false;

    return topicObj.activities.every((act) => {
      const actKey = `${topicObj.moduleId}:${act.id}`;
      return (userProgress[actKey] || 0) >= 1;
    });
  };

  return (
    <div className="learning-path-page">
      <DashboardHeader
        backTo="/dashboard"
        backText="Back to Dashboard"
      />

      <main className="lp-main">

        {/* HERO */}
        <div className="lp-hero">
          <div className="lp-hero-icon">
            <img
              src="/assets/learning-icon.png"
              alt="Learning"
            />
          </div>

          <div className="lp-hero-text">
            <h2>AlgoBlocks Learning Path</h2>

            <p>
              Master algorithms step-by-step
              through interactive block programming.
            </p>
          </div>
        </div>

        {/* INFO */}
        <div className="lp-info-box">
          Complete all activities in a lesson to unlock the next one.
        </div>

        {/* MODULES */}
        <div className="lp-lessons">

          {modules.map((mod) => (
            <div
              key={mod.id}
              className="lp-lesson-card"
            >

              {/* MODULE HEADER */}
              <div className="lp-lesson-header">

                <img
                  src="/assets/book-icon.png"
                  alt="Book"
                  className="lp-book-icon"
                />

                <div className="lp-lesson-title-group">

                  <span className="lp-lesson-number">
                    {mod.number}
                  </span>

                  <h3 className="lp-lesson-title">
                    {mod.title}
                  </h3>

                </div>
              </div>

              {/* TOPICS */}
              <div className="lp-topics">

                {mod.topics.map((topic) => {

                  const isExpanded =
                    expandedTopic === topic.id;
                  
                  const topicWithModule = { ...topic, moduleId: mod.id };

                  // =====================================
                  // UNLOCK LOGIC
                  // =====================================
                  const flatIndex =
                    allTopicsFlattened.findIndex(
                      (t) => t.id === topic.id
                    );

                  let isUnlocked = true;

                  if (flatIndex > 0) {
                    const prevTopic =
                      allTopicsFlattened[flatIndex - 1];

                    isUnlocked = checkTopicCompleted(prevTopic);
                  }

                  // =====================================
                  // PROGRESS TRACKING
                  // =====================================
                  const completed = checkTopicCompleted(topicWithModule);

                  const totalActivities =
                    topic.activities?.length || 0;
                  
                  const passedActivities = (topic.activities || []).filter((act) => {
                    const actKey = `${mod.id}:${act.id}`;
                    return (userProgress[actKey] || 0) >= 1;
                  }).length;

                  return (
                    <div
                      key={topic.id}
                      className={`lp-topic-container ${
                        isExpanded ? "expanded" : ""
                      } ${!isUnlocked ? "locked" : ""}`}
                    >

                      {/* TOPIC ROW */}
                      <div
                        className="lp-topic-row"
                        onClick={() =>
                          isUnlocked &&
                          toggleTopic(topic.id)
                        }
                      >

                        <div className="lp-topic-row-left">

                          <div className="lp-topic-titles">

                            <span className="lp-topic-number">
                              {topic.number}
                            </span>

                            <h4 className="lp-topic-name">
                              {topic.title}
                            </h4>

                          </div>
                        </div>

                        <div className="lp-topic-right">

                          <div
                            className={`lp-topic-badge ${topic.level}`}
                          >
                            {topic.level}
                          </div>

                          {!isUnlocked ? (
                            <span className="pending-badge">
                              🔒 Locked
                            </span>
                          ) : completed ? (
                            <span className="score-badge perfect">
                              Completed
                            </span>
                          ) : (
                            <span className="pending-badge">
                              {passedActivities}/{totalActivities} Passed
                            </span>
                          )}

                        </div>
                      </div>

                      {/* EXPANDED */}
                      {isExpanded && (
                        <div className="lp-topic-content">

                          <div className="lp-topic-task">

                            <strong className="lp-task-title">
                              Lesson Overview
                            </strong>

                            <p className="lp-task-desc">
                              {topic.content}
                            </p>

                          </div>

                          <div className="lp-topic-footer">

                            <span className="lp-test-cases">
                              {passedActivities} of {totalActivities} Activities Passed
                            </span>

                            <button
                              className={
                                completed
                                  ? "lp-review-btn"
                                  : "lp-start-btn"
                              }
                              onClick={() =>
                                handleStartLesson(topic)
                              }
                            >
                              {completed
                                ? "Review Lesson"
                                : passedActivities > 0 ? "Continue Activity" : "Start Activity"}
                            </button>

                          </div>

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