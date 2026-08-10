// frontend/src/pages/UserHomePage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuBookOpen,
  LuChartBar,
  LuClock3,
  LuCode,
  LuFolder,
  LuLayoutDashboard,
  LuPlay,
  LuRoute,
} from "react-icons/lu";
import { IoArrowForward } from "react-icons/io5";
import Footer from "../components/Footer";
import UserHeader from "../components/UserHeader";
import curriculumIndex from "../data/curriculumIndex";
import { clearLocalUserData, progressDB } from "../db";
import "../styles/UserHomePage.css";

const allLessons = curriculumIndex.flatMap((module) =>
  module.lessons.map((lesson, lessonIndex) => ({
    ...lesson,
    module,
    lessonNumber: `${module.moduleId.split("-").pop()}.${lessonIndex + 1}`,
  }))
);

const readProgressValue = (value) => {
  if (value === true) return 100;
  if (value && typeof value === "object") {
    return Number(value.score ?? (value.completed ? 100 : 0)) || 0;
  }
  return Number(value) || 0;
};

const getLearningStatus = (progress = {}) => {
  const lessonsWithProgress = allLessons.filter(
    (lesson) => readProgressValue(progress[lesson.lessonId]) > 0
  );

  if (lessonsWithProgress.length === 0) {
    const firstLesson = allLessons[0];
    return {
      hasProgress: false,
      moduleTitle: curriculumIndex[0]?.title || "Welcome to AlgoBlocks",
      lessonTitle: firstLesson?.title || "The AlgoBlocks Workspace",
      lessonNumber: firstLesson?.lessonNumber || "0.1",
      percent: 0,
      estimatedTime: "15 min",
      destination: "/learning-path",
    };
  }

  const inProgressLesson = allLessons.find((lesson) => {
    const value = readProgressValue(progress[lesson.lessonId]);
    return value > 0 && value < 50;
  });
  const nextLesson = allLessons.find(
    (lesson) => readProgressValue(progress[lesson.lessonId]) < 50
  );
  const currentLesson =
    inProgressLesson || nextLesson || allLessons[allLessons.length - 1];
  const currentValue = readProgressValue(progress[currentLesson.lessonId]);

  return {
    hasProgress: true,
    moduleTitle: currentLesson.module.title,
    lessonTitle: currentLesson.title,
    lessonNumber: currentLesson.lessonNumber,
    percent: Math.min(100, Math.max(0, Math.round(currentValue))),
    estimatedTime: "15 min",
    destination: `/learning-path/${currentLesson.module.moduleId}/${currentLesson.lessonId}`,
    lessonPath: currentLesson.path,
  };
};

const quickActions = [
  {
    title: "Continue Learning",
    description: "Resume your latest lesson.",
    route: "/learning-path",
    icon: LuBookOpen,
  },
  {
    title: "Workspace",
    description: "Build and analyze algorithms using Blockly.",
    route: "/workspace",
    icon: LuCode,
  },
  {
    title: "My Projects",
    description: "Continue previously saved algorithm projects.",
    route: "/projects",
    icon: LuFolder,
  },
  {
    title: "Dashboard",
    description: "View assessments, achievements, and learning progress.",
    route: "/dashboard",
    icon: LuLayoutDashboard,
  },
];

const exploreFeatures = [
  {
    title: "Blockly Workspace",
    description:
      "Build algorithms visually using drag-and-drop programming blocks before automatically generating Python code.",
    image: "/assets/blockly-workspace.png",
    alt: "AlgoBlocks Blockly Workspace interface",
    icon: LuCode,
  },
  {
    title: "Complexity Analyzer",
    description:
      "Understand how each line contributes to time and space complexity with focused, educational feedback.",
    image: "/assets/local-complexity-analysis.png",
    alt: "AlgoBlocks line-by-line Complexity Analyzer",
    icon: LuChartBar,
  },
  {
    title: "Learning Path",
    description:
      "Progress through a structured curriculum from Big-O Notation to Backtracking, with lessons and guided activities along the way.",
    image: "/assets/learning-path.png",
    alt: "AlgoBlocks learning progress interface",
    icon: LuRoute,
  },
  {
    title: "Dashboard",
    description:
      "Track completed modules, assessments, saved projects, achievements, and your overall learning progress.",
    image: "/assets/dashboard.png",
    alt: "AlgoBlocks learner Dashboard",
    icon: LuLayoutDashboard,
  },
];

export default function UserHomePage() {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [user, setUser] = useState(null);
  const [learningStatus, setLearningStatus] = useState(() => getLearningStatus());
  const navigate = useNavigate();

  const userHomeTour = {
    id: "user-home-tour",
    pageId: "home",
    title: "Home Tour",
    steps: [
      { target: ".user-home-hero", title: "Continue learning", description: "Pick up where you left off or head back into the curriculum." },
      { target: ".user-home-hero-actions", title: "Quick actions", description: "Jump straight to the learning path or the workspace from here." },
      { target: ".user-home-feature-grid, .explore-features-grid", title: "Explore tools", description: "Review the major learning tools and what each one does." },
    ],
  };

  useEffect(() => {
    let cancelled = false;

    const loadUserHome = async () => {
      const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (!storedUser) {
        navigate("/");
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        if (cancelled) return;
        setUser(parsedUser);

        const combinedProgress = { ...(parsedUser.progress || {}) };
        try {
          await progressDB.iterate((value, key) => {
            combinedProgress[key] = readProgressValue(value);
          });
        } catch (error) {
          console.warn("Could not load offline learning progress:", error);
        }

        const nextStatus = getLearningStatus(combinedProgress);

        if (nextStatus.lessonPath) {
          try {
            const response = await fetch(`/data${nextStatus.lessonPath}`);
            if (response.ok) {
              const lesson = await response.json();
              nextStatus.estimatedTime = lesson.estimatedTime || nextStatus.estimatedTime;
            }
          } catch (error) {
            console.warn("Could not load lesson estimate:", error);
          }
        }

        if (!cancelled) setLearningStatus(nextStatus);
      } catch (error) {
        console.error("Could not load the authenticated homepage:", error);
        navigate("/");
      }
    };

    loadUserHome();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const confirmLogout = async () => {
    // BUG FIX: this only cleared localStorage/sessionStorage, never the
    // IndexedDB local cache -- so logging out and either continuing as
    // guest or signing into a different account on the same browser left
    // the previous account's progress/assessments/submissions readable by
    // the next session. See db.js clearLocalUserData() for the full
    // explanation.
    await clearLocalUserData();
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/");
  };

  if (!user) return null;

  return (
    <div className="landing-container user-homepage">
      <UserHeader user={user} onLogoutClick={() => setShowLogoutModal(true)} tour={userHomeTour} tourPageId="home" />

      <main className="user-home-main">
        <section className="user-home-hero" aria-labelledby="welcome-heading">
          <div className="user-home-hero-copy">
            <span className="user-home-eyebrow">Your learning hub</span>
            <h1 id="welcome-heading">Welcome back, {user.name}!</h1>
            <p>
              Continue your algorithm learning journey through guided lessons,
              visual programming, and real-time complexity analysis.
            </p>
            <div className="user-home-hero-actions">
              <button
                className="user-home-btn user-home-btn-primary"
                type="button"
                onClick={() => navigate("/learning-path")}
              >
                Continue Learning
                <IoArrowForward aria-hidden="true" />
              </button>
              <button
                className="user-home-btn user-home-btn-secondary"
                type="button"
                onClick={() => navigate("/workspace")}
              >
                <LuCode aria-hidden="true" />
                Open Workspace
              </button>
            </div>
          </div>

          <div className="user-home-hero-media">
            <div className="user-home-screenshot-frame">
              <div className="user-home-window-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <small>Blockly Workspace</small>
              </div>
              <img
                src="/assets/blockly-workspace.png"
                alt="AlgoBlocks Blockly Workspace"
              />
            </div>
          </div>
        </section>

        <section className="user-home-section resume-section" aria-labelledby="resume-heading">
          <div className="user-home-section-heading left-aligned">
            <span className="user-home-eyebrow">Pick up your progress</span>
            <h2 id="resume-heading">Continue Where You Left Off</h2>
          </div>

          <article className="resume-card">
            <div className="resume-card-icon" aria-hidden="true">
              {learningStatus.hasProgress ? <LuPlay /> : <LuBookOpen />}
            </div>

            <div className="resume-card-content">
              <span className="resume-label">
                {learningStatus.hasProgress ? "Current Module" : "Start Your Learning Journey"}
              </span>
              <h3>
                {learningStatus.hasProgress
                  ? learningStatus.moduleTitle
                  : "Begin with Module 0"}
              </h3>
              <p>
                {learningStatus.hasProgress
                  ? `Lesson ${learningStatus.lessonNumber}: ${learningStatus.lessonTitle}`
                  : "Learn how the AlgoBlocks workspace turns visual logic into executable Python."}
              </p>

              {learningStatus.hasProgress && (
                <div className="resume-progress" aria-label={`${learningStatus.percent}% lesson progress`}>
                  <div className="resume-progress-meta">
                    <span>Lesson Progress</span>
                    <strong>{learningStatus.percent}%</strong>
                  </div>
                  <div className="resume-progress-track">
                    <span style={{ width: `${learningStatus.percent}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="resume-card-action">
              <span className="resume-time">
                <LuClock3 aria-hidden="true" />
                {learningStatus.estimatedTime}
              </span>
              <button
                className="user-home-btn user-home-btn-primary"
                type="button"
                onClick={() => navigate(learningStatus.destination)}
              >
                {learningStatus.hasProgress ? "Continue Learning" : "Start Learning"}
                <IoArrowForward aria-hidden="true" />
              </button>
            </div>
          </article>
        </section>

        <section className="user-home-section" aria-labelledby="quick-actions-heading">
          <div className="user-home-section-heading">
            <span className="user-home-eyebrow">Everything within reach</span>
            <h2 id="quick-actions-heading">Quick Actions</h2>
            <p>Choose the next step that fits your learning session.</p>
          </div>

          <div className="quick-actions-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  className="quick-action-card"
                  type="button"
                  key={action.title}
                  onClick={() => navigate(action.route)}
                >
                  <span className="quick-action-icon"><Icon aria-hidden="true" /></span>
                  <span className="quick-action-copy">
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <IoArrowForward className="quick-action-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="user-home-section explore-section" aria-labelledby="explore-heading">
          <div className="user-home-section-heading">
            <span className="user-home-eyebrow">Learn by doing</span>
            <h2 id="explore-heading">Explore AlgoBlocks</h2>
            <p>See the tools that support every stage of your algorithm learning journey.</p>
          </div>

          <div className="explore-list">
            {exploreFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article
                  className={`explore-feature ${index % 2 === 1 ? "explore-feature-reverse" : ""}`}
                  key={feature.title}
                >
                  <div className="explore-image-wrap">
                    <img src={feature.image} alt={feature.alt} loading="lazy" />
                  </div>
                  <div className="explore-copy">
                    <span className="explore-icon"><Icon aria-hidden="true" /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <Footer />

      {showLogoutModal && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <h2>Logout Confirmation</h2>
            <p>Are you sure you want to logout?</p>
            <div className="logout-modal-actions">
              <button className="logout-btn" onClick={confirmLogout}>Confirm</button>
              <button className="logout-btn logout-btn-cancel" onClick={() => setShowLogoutModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
