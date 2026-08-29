// frontend/src/pages/LessonViewer.jsx
import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiCircle,
  FiClipboard,
  FiClock,
  FiLock,
  FiTarget,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import BigOChart from "../components/BigOChart";
import CodeSnippet from "../components/CodeSnippet";
import LessonBlockPlayground from "../components/LessonBlockPlayground";
import TourHelpButton from "../components/TourHelpButton";
import { BLOCK_EXAMPLES } from "../data/blockExamples";
import curriculumIndex from "../data/curriculumIndex";
import { LESSON_BLOCK_PLAYGROUNDS } from "../data/lessonBlockPlaygrounds";
import { assessmentsDB, curriculumCacheDB, progressDB, submissionsDB } from "../db";
import { useExampleWorker } from "../hooks/useExampleWorker.js";
import "../styles/LessonViewer.css";
import "../styles/Skeleton.css";
import { syncDownFromServer } from "../utils/syncManager";

// Mirrors the difficulty map in LearningPath.jsx (kept local here since it's
// only used to size the "how many activities count as done" requirement --
// see getMinReq below). If these two ever drift, module-completion state
// will disagree between the Learning Path and the Lesson Viewer again, so
// keep this in sync with LearningPath.jsx's moduleIcons difficulties.
const MODULE_DIFFICULTY = {
  "module-0": "Beginner",
  "module-1": "Beginner",
  "module-2": "Intermediate",
  "module-3": "Intermediate",
  "module-4": "Intermediate",
  "module-5": "Advanced",
  "module-6": "Advanced",
};

// This app never renders LaTeX/MathJax anywhere — Big-O notation is always
// shown as plain styled text (e.g. `O(n log n)`), never `$O(n \log n)$`.
// If lesson content is authored with LaTeX-style math delimiters out of
// habit, strip the delimiters and clean up the handful of LaTeX escapes
// that would otherwise show up as literal backslashes once unwrapped.
function cleanMathToken(raw) {
  return raw
    .replace(/\\log/g, "log")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\sqrt\{([^}]*)\}/g, "√($1)")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\,/g, " ")
    .replace(/\\/g, "")
    .trim();
}

function formatText(text) {
  if (!text) return null;
  // Tokenizes on **bold**, `code`, and stray $math$ spans in one pass so
  // precedence between them is unambiguous. Backtick- and $-wrapped spans
  // both render as the same styled <code> element — .lesson-section-content
  // code / .lesson-bullet-list code already exist in LessonViewer.css for
  // exactly this, but nothing ever actually produced a <code> element
  // before, so both forms of inline complexity notation just printed
  // literally (backticks and all, or "$O(n log n)$" with visible dollar
  // signs).
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`|\$[^$]+\$)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      return <code key={index}>{cleanMathToken(part.slice(1, -1))}</code>;
    }
    return part;
  });
}

// Matches "1. ", "2)  ", "10. " etc. at the start of a (trimmed) line.
const NUMBERED_LINE_RE = /^(\d+)[.)]\s+(.*)$/;

// Classifies a single line of lesson content so consecutive lines of the
// same kind can be grouped into one list instead of every line being
// dumped into the same paragraph. This is what turns numbered walkthroughs
// like "1. Call fib(5)... 2. Call fib(4)..." -- previously rendered as one
// dense <p> full of <br> tags -- into an actual <ol>/<ul>.
function classifyLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
    return { type: "bullet", text: trimmed.substring(2).trim() };
  }
  const numberedMatch = trimmed.match(NUMBERED_LINE_RE);
  if (numberedMatch) {
    return { type: "numbered", text: numberedMatch[2].trim() };
  }
  return { type: "text", text: line };
}

function renderParagraphs(content, className = "lesson-section-content") {
  if (!content) return null;

  return (
    <div className={className}>
      {content.split("\n\n").map((paragraph, index) => {
        const lines = paragraph.split("\n").filter((l) => l.trim() !== "");
        const classified = lines.map(classifyLine);

        const isPureBulletList =
          classified.length > 0 && classified.every((l) => l.type === "bullet");
        const isPureNumberedList =
          classified.length > 0 && classified.every((l) => l.type === "numbered");

        // Simple case: a plain paragraph with no list markers at all.
        if (classified.every((l) => l.type === "text")) {
          return (
            <p key={index}>
              {lines.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {formatText(line)}
                  {lineIndex !== lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          );
        }

        // Clean case: every line in this paragraph is part of the same
        // kind of list -- render one tidy <ul> or <ol>.
        if (isPureBulletList || isPureNumberedList) {
          const ListTag = isPureNumberedList ? "ol" : "ul";
          const listClass = isPureNumberedList
            ? "lesson-numbered-list"
            : "lesson-bullet-list";
          return (
            <ListTag key={index} className={listClass}>
              {classified.map((l, i) => (
                <li key={i}>{formatText(l.text)}</li>
              ))}
            </ListTag>
          );
        }

        // Mixed case: intro/closing sentences alongside a list. Group
        // consecutive same-type lines together instead of interleaving
        // <br>-separated text with list items.
        const elements = [];
        let currentList = [];
        let currentListType = null;

        const flushList = (key) => {
          if (currentList.length === 0) return;
          const ListTag = currentListType === "numbered" ? "ol" : "ul";
          const listClass =
            currentListType === "numbered"
              ? "lesson-numbered-list"
              : "lesson-bullet-list";
          elements.push(
            <ListTag key={`list-${key}`} className={listClass}>
              {currentList}
            </ListTag>,
          );
          currentList = [];
          currentListType = null;
        };

        classified.forEach((l, i) => {
          if (l.type === "bullet" || l.type === "numbered") {
            if (currentListType && currentListType !== l.type) {
              flushList(i);
            }
            currentListType = l.type;
            currentList.push(<li key={`li-${i}`}>{formatText(l.text)}</li>);
          } else {
            flushList(i);
            elements.push(<p key={`p-${i}`}>{formatText(l.text)}</p>);
          }
        });
        flushList("end");

        return (
          <div key={index} className="lesson-paragraph-group">
            {elements}
          </div>
        );
      })}
    </div>
  );
}

function renderBullets(items) {
  if (!items?.length) return null;
  return (
    <ul className="lesson-bullet-list">
      {items.map((item, index) => (
        <li key={index}>
          {item.split("\n\n").map((paragraph, pIndex, pArray) => (
            <div key={pIndex} style={{ marginBottom: pIndex !== pArray.length - 1 ? "0.5em" : "0" }}>
              {paragraph.split("\n").map((line, lIndex, lArray) => (
                <span key={lIndex}>
                  {formatText(line)}
                  {lIndex !== lArray.length - 1 && <br />}
                </span>
              ))}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function renderCodeSnippets(snippets) {
  if (!snippets?.length) return null;
  return (
    <div className="lesson-code-snippets">
      {snippets.map((snippet, index) => (
        <CodeSnippet
          key={`${snippet.title || "snippet"}-${index}`}
          snippet={snippet}
        />
      ))}
    </div>
  );
}

function renderChart(chart) {
  if (!chart) return null;
  return (
    <figure className="lesson-chart-panel">
      {(chart.title || chart.description) && (
        <figcaption>
          {chart.title && <strong>{chart.title}</strong>}
          {chart.description && <span>{formatText(chart.description)}</span>}
        </figcaption>
      )}
      <BigOChart maxN={chart.maxN} curves={chart.curves} normalize={chart.normalize} />
    </figure>
  );
}

// Renders one or more real product screenshots attached to a section or
// subsection via an `images` array (each entry: { src, alt, caption }).
// `src` is expected to point at /assets/*.png, matching the same public
// asset paths already used elsewhere in the app (e.g. the sidebar icons).
// Silently renders nothing if the section has no images, so this is safe
// to call unconditionally alongside renderChart/renderCodeSnippets.
function renderImages(images) {
  if (!images?.length) return null;
  return (
    <div className="lesson-image-gallery">
      {images.map((image, index) => (
        <figure className="lesson-image-panel" key={image.src || index}>
          <img src={image.src} alt={image.alt || ""} loading="lazy" />
          {image.caption && <figcaption>{formatText(image.caption)}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

// Looks up any interactive block playgrounds mapped to this section/
// subsection id (see data/lessonBlockPlaygrounds.js) and renders one
// collapsed dropdown row per matched example. Silently renders nothing if
// there's no mapping for this id, or if a mapped key doesn't resolve to a
// real BLOCK_EXAMPLES entry -- a lesson should never break because of a
// missing example.
//
// Each entry in the mapping array is either a plain string (the
// BLOCK_EXAMPLES key, using that example's generic goal/role text as-is)
// or a { key, caption } object -- caption overrides the example's generic
// "Goal" line with wording grounded in *this* lesson's own scenario, so a
// glossary example that's reused across lessons still reads as specific
// to the one it's embedded in.
//
// Blockly 10's render manager batches every pending block render on the
// *whole page* into one shared requestAnimationFrame pass, not per
// workspace (core/render_management.ts). Mounting several
// LessonBlockPlayground workspaces at once on a lesson page means their
// renders share that one batch, and in practice only the first ever
// actually draws -- every workspace after it comes up blank. Rather than
// fight that, only one playground is ever mounted at a time: each example
// starts collapsed behind a dropdown button, and the Blockly workspace
// underneath is created fresh (and fully rendered, with nothing else
// competing for the same render batch) only while its dropdown is open.
// Opening a different one closes whichever was open, and closing one
// unmounts its workspace entirely rather than just hiding it, so the next
// open is always a clean, complete mount.
function renderBlockPlaygrounds(lessonId, sectionId, exampleWorker, openPlaygroundId, onTogglePlayground) {
  const entries = LESSON_BLOCK_PLAYGROUNDS[lessonId]?.[sectionId];
  if (!entries?.length) return null;

  return (
    <div className="lesson-block-playgrounds">
      {entries.map((entry) => {
        const key = typeof entry === "string" ? entry : entry.key;
        const caption = typeof entry === "string" ? undefined : entry.caption;
        const example = BLOCK_EXAMPLES[key];
        if (!example) return null;

        const playgroundId = `${sectionId}-${key}`;
        const isOpen = openPlaygroundId === playgroundId;
        const label = caption || example.goal || "Try it yourself";

        return (
          <div
            key={playgroundId}
            className={`lesson-block-playground-dropdown${isOpen ? " open" : ""}`}
          >
            <button
              type="button"
              className="lesson-block-playground-dropdown-toggle"
              onClick={() => onTogglePlayground(isOpen ? null : playgroundId)}
              aria-expanded={isOpen}
            >
              <span className="lesson-block-playground-badge">Try it yourself</span>
              <span className="lesson-block-playground-dropdown-label">{label}</span>
              {isOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
            </button>

            {isOpen && (
              <LessonBlockPlayground
                example={example}
                caption={caption}
                runner={exampleWorker}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LessonViewer() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState(new Set([moduleId]));
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  // Tracks which single block playground dropdown (if any) is expanded
  // across the *entire* lesson page, keyed by its "<sectionId>-<key>" id
  // (see renderBlockPlaygrounds above). Deliberately one piece of state
  // for the whole lesson rather than one per section, so opening a
  // playground anywhere on the page always closes any other open one --
  // guaranteeing at most one Blockly workspace is ever mounted at a time.
  const [openPlaygroundId, setOpenPlaygroundId] = useState(null);

  const [userProgress, setUserProgress] = useState({});
  const [lessonDetails, setLessonDetails] = useState({});
  const [activitiesData, setActivitiesData] = useState({});
  const [assessments, setAssessments] = useState({});
  const [submissions, setSubmissions] = useState({});

  // One shared, isolated example-execution worker for every interactive
  // block playground on this lesson page -- separate from the worker the
  // real workspace/activities use, so running a lesson example never
  // touches (or is touched by) the student's actual project state.
  const exampleWorker = useExampleWorker();

  const lessonTour = {
    id: "lesson-viewer-tour",
    pageId: `lesson-${moduleId}-${lessonId}`,
    title: "Lesson Tour",
    steps: [
      { target: ".lesson-sidebar-toggle-btn", title: "Collapse the curriculum", description: "Hide or show the curriculum rail to stay focused while you read." },
      { target: ".lesson-top-nav", title: "Navigate the lesson", description: "Move back to the learning path or step through the lesson context." },
      { target: ".lesson-chart-panel", title: "Review complexity", description: "See the visual Big-O chart and the lesson's complexity explanation." },
      { target: ".lesson-code-snippets", title: "Inspect examples", description: "Use code snippets to connect the lesson text to real Python output." },
    ],
  };

  const storedUser = JSON.parse(
    localStorage.getItem("user") || sessionStorage.getItem("user") || "{}",
  );
  const isAdmin = storedUser.role === "admin" || storedUser.isAdmin === true;

  // BUG FIX: guests are blocked from the Learning Path listing itself, but
  // this page is reachable directly by URL (e.g. a bookmarked/shared link),
  // which would otherwise bypass that gate entirely. Bounce guests back to
  // /learning-path, which renders its own sign-up prompt instead of module
  // content.
  useEffect(() => {
    if (storedUser.isGuest) {
      navigate("/learning-path", { replace: true });
    }
  }, [storedUser.isGuest, navigate]);

  useEffect(() => {
    const loadOfflineData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "";
        let initialProg = storedUser.progress || {};
        let initialAssm = storedUser.assessments || {};
        const initialSubs = {};

        await progressDB.iterate((value, key) => {
          initialProg[key] = value.score !== undefined ? value.score : value;
        });
        await assessmentsDB.iterate((value, key) => {
          initialAssm[key] = value;
        });
        // BUG FIX: this page previously never read submissionsDB at all, so
        // isModuleComplete()/hasPostAssessment() had no way to see per-
        // activity completions -- only whole-lesson userProgress. That's
        // what let a module (and every module after it, since locking is
        // sequential) show as locked here while Learning Path, which does
        // read submissions, correctly showed it complete.
        await submissionsDB.iterate((val) => {
          if (val && val.userId === storedUser.email) {
            if (!initialSubs[val.moduleId]) initialSubs[val.moduleId] = {};
            initialSubs[val.moduleId][val.activityId] = val;
          }
        });

        setUserProgress(initialProg);
        setAssessments(initialAssm);
        setSubmissions(initialSubs);

        if (navigator.onLine && storedUser.email && !storedUser.isGuest) {
          try {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const progRes = await fetch(`${API_BASE}/api/get-progress`, { headers });
            if (progRes.ok) {
              const data = await progRes.json();
              const progData = data.progress || data;
              for (const [key, val] of Object.entries(progData)) {
                initialProg[key] = val;
                await progressDB.setItem(key, { score: val, isSynced: true });
              }
            }

            const assRes = await fetch(`${API_BASE}/api/get-assessments`, { headers });
            if (assRes.ok) {
              const data = await assRes.json();
              const assData = data.assessments || data;
              for (const [key, val] of Object.entries(assData)) {
                initialAssm[key] = val;
                await assessmentsDB.setItem(key, { ...val, isSynced: true });
              }
            }

            setUserProgress({ ...initialProg });
            setAssessments({ ...initialAssm });

            storedUser.progress = initialProg;
            storedUser.assessments = initialAssm;
            localStorage.setItem("user", JSON.stringify(storedUser));
          } catch (e) {
            console.warn("Could not fetch latest progress from cloud:", e);
          }
        }

        // submissionsDB itself is kept current by syncDownFromServer() (see
        // below) writing straight into IndexedDB, then re-reading it here
        // via the localDataSynced listener -- same pattern LearningPath.jsx
        // uses, so both pages end up looking at the same submission data.
      } catch (e) {
        console.warn("Error loading offline progress:", e);
      }
    };
    loadOfflineData();
    syncDownFromServer();

    const handleSync = () => loadOfflineData();
    window.addEventListener("localDataSynced", handleSync);
    return () => window.removeEventListener("localDataSynced", handleSync);
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      const details = {};
      const acts = {};
      const fetchPromises = [];

      const fetchWithCache = async (url, type, key) => {
        try {
          const cachedData = await curriculumCacheDB.getItem(url);
          if (cachedData) {
            if (type === 'activity') acts[key] = cachedData;
            if (type === 'lesson') details[key] = cachedData;
            return;
          }

          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            await curriculumCacheDB.setItem(url, data);
            if (type === 'activity') acts[key] = data;
            if (type === 'lesson') details[key] = data;
          }
        } catch (e) {
          console.warn(`Failed to load ${url}`, e);
        }
      };

      for (const module of curriculumIndex) {
        const mid = module.moduleId.split("-").pop();
        
        fetchPromises.push(
          fetchWithCache(`/data/activities/module_${mid}.json`, 'activity', module.moduleId)
        );

        for (const lessonMeta of module.lessons) {
          fetchPromises.push(
            fetchWithCache(`/data/curriculum/${module.moduleId}/${lessonMeta.lessonId}.json`, 'lesson', lessonMeta.lessonId)
          );
        }
      }

      // Parallel fetch for the sidebar mapping
      await Promise.all(fetchPromises);

      setLessonDetails(details);
      setActivitiesData(acts);
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    const loadLesson = async () => {
      setLoading(true);
      try {
        const module = curriculumIndex.find((m) => m.moduleId === moduleId);
        if (!module) return;
        const lessonMeta = module.lessons.find((l) => l.lessonId === lessonId);
        if (!lessonMeta) return;

        const fetchPath = `/data/curriculum/${moduleId}/${lessonId}.json`;
        
        // Optimize actual lesson text load with Cache
        const cachedData = await curriculumCacheDB.getItem(fetchPath);
        if (cachedData) {
          setLesson(cachedData);
          setLoading(false);
          return;
        }

        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`Failed to fetch lesson: ${response.status}`);

        const data = await response.json();
        await curriculumCacheDB.setItem(fetchPath, data); // Save for next time
        setLesson(data);
      } catch (error) {
        console.error("Failed to load lesson:", error);
      } finally {
        setLoading(false);
      }
    };
    loadLesson();
    // A new lesson means a whole new set of playground ids -- close
    // whatever was open on the previous lesson rather than carrying a
    // stale (and now meaningless) id across the navigation.
    setOpenPlaygroundId(null);
  }, [moduleId, lessonId]);

  // BUG FIX: the old hasPostAssessment did an EXACT string match --
  // assessments[`${mId}_post_assessment`] !== undefined -- against whatever
  // key format the assessments store happens to use. LearningPath.jsx
  // never relied on that exact format; it normalizes keys (strips
  // -/_/space, lowercases) and matches against several plausible variants.
  // Whenever a module's real key didn't happen to match the strict format
  // here, this page saw the post-test as "not done" even though Learning
  // Path -- and the server -- correctly considered it complete. Because
  // locking is sequential (buildLockMap below), one such mismatch locked
  // every module after it, which is exactly the "modules 3-6 locked"
  // symptom. This now mirrors LearningPath.jsx's getQuizData exactly.
  const checkActivityDone = (mId, actId) => {
    const sub = submissions[mId]?.[actId];
    if (!sub) return false;

    let aes = sub.final_aes !== null && sub.final_aes !== undefined ? sub.final_aes : sub.score || 0;
    if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100;
    aes = Math.min(aes, 100);

    return aes >= 50 || sub.status === "passed";
  };

  const getMinReq = (mId, activities, isOpt = false) => {
    if (!activities || activities.length === 0) return 0;
    if (isOpt) return Math.min(2, activities.length);

    const difficulty = MODULE_DIFFICULTY[mId] || "Beginner";
    if (difficulty === "Beginner") return Math.min(3, activities.length);
    if (difficulty === "Intermediate") return Math.min(2, activities.length);
    if (difficulty === "Advanced") return Math.min(1, activities.length);

    return activities.length;
  };

  const getQuizData = (mId) => {
    const modClean = String(mId).toLowerCase().replace(/[-_ ]/g, "");
    const targetQuizKeys = [`${modClean}assessment`, `${modClean}quiz`, `${modClean}test`, modClean, `${modClean}postassessment`];

    for (const [k, v] of Object.entries(assessments || {})) {
      const kc = String(k).toLowerCase().replace(/[-_ ]/g, "");
      if (targetQuizKeys.includes(kc)) {
        return v;
      }
    }
    return null;
  };

  const findMilestoneData = (keywords) => {
    const cleanKws = keywords.map((k) => String(k).toLowerCase().replace(/[-_ ]/g, ""));
    for (const [k, v] of Object.entries(assessments || {})) {
      const cleanKey = String(k).toLowerCase().replace(/[-_ ]/g, "");
      if (cleanKws.some((kw) => cleanKey.includes(kw))) {
        if (v !== null && v !== undefined && (v.completed || v.passed || v.score !== undefined || v.correct !== undefined)) {
          return v;
        }
      }
    }
    return null;
  };

  const hasPostAssessment = (mId) => {
    const quizData = getQuizData(mId);
    if (!quizData) return false;
    return quizData.passed || quizData.completed || (quizData.score !== undefined && quizData.score >= 50);
  };

  const isModuleComplete = (mId) => {
    const module = curriculumIndex.find((m) => m.moduleId === mId);
    if (!module) return false;

    const modActs = activitiesData[mId] || {};
    if (Object.keys(modActs).length === 0) return false;

    const lessonsDone = module.lessons.every((lesson) => {
      const lessonNum = lesson.lessonId.split("-")[2];
      const activities = modActs[`lesson_${lessonNum}`] || [];
      if (activities.length === 0) return (userProgress[lesson.lessonId] || 0) >= 1;

      const minReq = getMinReq(mId, activities, false);
      const completedCount = activities.filter((a) => checkActivityDone(mId, a.id)).length;
      return completedCount >= minReq;
    });

    if (!lessonsDone) return false;

    const optimizations = modActs.optimizations || [];
    if (optimizations.length > 0) {
      const optMinReq = getMinReq(mId, optimizations, true);
      const completedOptCount = optimizations.filter((o) => checkActivityDone(mId, o.id)).length;
      if (completedOptCount < optMinReq) return false;
    }

    return true;
  };

  const buildLockMap = () => {
    const lockMap = {};
    const isGlobalPreTestDone = findMilestoneData(["pretest", "coursepretest"]) !== null;
    let isNextLocked = isAdmin ? false : !isGlobalPreTestDone;

    for (const module of curriculumIndex) {
      const modActs = activitiesData[module.moduleId] || {};

      for (const l of module.lessons) {
        lockMap[l.lessonId] = isAdmin ? false : isNextLocked;

        if (!isNextLocked) {
          const lessonNum = l.lessonId.split("-")[2];
          const activities = modActs[`lesson_${lessonNum}`] || [];

          if (activities.length > 0) {
            const minReq = getMinReq(module.moduleId, activities, false);
            const completedCount = activities.filter((a) => checkActivityDone(module.moduleId, a.id)).length;
            if (completedCount < minReq) {
              isNextLocked = true;
            }
          } else {
            if ((userProgress[l.lessonId] || 0) < 1) isNextLocked = true;
          }
        }
      }

      const optimizations = modActs.optimizations || [];
      if (optimizations.length > 0 && !isNextLocked) {
        const optMinReq = getMinReq(module.moduleId, optimizations, true);
        const completedOptCount = optimizations.filter((o) => checkActivityDone(module.moduleId, o.id)).length;
        if (completedOptCount < optMinReq) {
          isNextLocked = true;
        }
      }

      const postComplete = hasPostAssessment(module.moduleId);
      if (!postComplete && !isAdmin) isNextLocked = true;
    }
    return lockMap;
  };

  const lockMap = buildLockMap();
  const isCurrentLessonLocked = lockMap[lessonId];

  const toggleModule = (mId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(mId)) newExpanded.delete(mId);
    else newExpanded.add(mId);
    setExpandedModules(newExpanded);
  };

  const currentModule = curriculumIndex.find((m) => m.moduleId === moduleId);
  const moduleNum = moduleId?.split("-").pop();
  const lessonNum = lessonId?.split("-").pop();
  const currentActivityId = lesson?.activities?.[0]?.id;

  if (Object.keys(lessonDetails).length === 0) {
    return (
      <div className="lesson-skeleton-wrapper">
        <aside className="lesson-skeleton-sidebar">
          <div className="skeleton skeleton-line" style={{ width: "70%", height: 16, marginBottom: 24 }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="lesson-skeleton-module">
              <div className="skeleton skeleton-line" style={{ width: "85%", height: 14 }} />
              <div className="skeleton skeleton-line" style={{ width: "65%", marginLeft: 20 }} />
              <div className="skeleton skeleton-line" style={{ width: "65%", marginLeft: 20 }} />
            </div>
          ))}
        </aside>
        <main className="lesson-skeleton-content">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-block lesson-skeleton-codeblock" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </main>
      </div>
    );
  }

  return (
    <div className="lesson-viewer-wrapper">
      <aside className={`lesson-modules-sidebar ${!isSidebarVisible ? "hidden" : ""}`}>
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate("/learning-path")}>
            <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Learning Path
          </button>
        </div>
        <div className="modules-header">
          <h3>Curriculum</h3>
        </div>
        <nav className="modules-nav">
          {curriculumIndex.map((module) => {
            const modNumber = module.moduleId.split("-").pop();
            const isExpanded = expandedModules.has(module.moduleId);
            const modComplete = isModuleComplete(module.moduleId);
            const postComplete = hasPostAssessment(module.moduleId);

            const optimizations = activitiesData[module.moduleId]?.optimizations || [];
            const hasOptimizations = optimizations.length > 0;
            const lastLessonId = module.lessons[module.lessons.length - 1]?.lessonId;

            const optimizationsLocked = isAdmin ? false : lockMap[lastLessonId] || (userProgress[lastLessonId] || 0) < 1;
            const postAssessmentUnlocked = isAdmin || modComplete || postComplete;

            return (
              <div key={module.moduleId} className="module-group">
                <button
                  className={`module-title ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleModule(module.moduleId)}
                >
                  <span className="module-info">
                    <FiBookOpen className="module-icon" />
                    <span>
                      <span className="module-number">Module {modNumber}</span>
                      <span className="module-name" style={{ fontSize: "0.85rem" }}>{module.title}</span>
                    </span>
                  </span>
                  <span className="expand-icon">v</span>
                </button>

                {isExpanded && (
                  <div className="lessons-list" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 0" }}>
                    
                    {module.lessons.map((lessonItem) => {
                      const lesNumber = lessonItem.lessonId.split("-").pop();
                      const isActive = lessonId === lessonItem.lessonId;
                      const isLocked = lockMap[lessonItem.lessonId];
                      const prog = userProgress[lessonItem.lessonId] || 0;

                      return (
                        <a
                          key={lessonItem.lessonId}
                          href={`/learning-path/${module.moduleId}/${lessonItem.lessonId}`}
                          className={`lesson-item ${isActive ? "active" : ""}`}
                          style={{
                            opacity: isLocked ? 0.5 : 1,
                            pointerEvents: isLocked ? "none" : "auto",
                            paddingLeft: "45px",
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!isLocked) navigate(`/learning-path/${module.moduleId}/${lessonItem.lessonId}`);
                          }}
                        >
                          <span className="lesson-number">{modNumber}.{lesNumber}</span>
                          <span className="lesson-title">{lessonItem.title}</span>
                          <span className="lesson-indicator">
                            {isLocked ? <FiLock size={12} /> : prog >= 1 ? <FiCheckCircle size={12} color="#22c55e" /> : isActive ? "●" : "○"}
                          </span>
                        </a>
                      );
                    })}

                    {hasOptimizations && (
                      <div
                        onClick={() => {
                          if (!optimizationsLocked) navigate(`/activity/${module.moduleId}/${optimizations[0].id}`);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px",
                          cursor: optimizationsLocked ? "not-allowed" : "pointer", opacity: optimizationsLocked ? 0.5 : 1,
                          color: "#d35400", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(243, 156, 18, 0.05)",
                        }}
                      >
                        <span style={{ color: "#f39c12", fontSize: "1.1rem" }}>★</span>
                        <span>Optimization Challenges</span>
                        <span style={{ marginLeft: "auto" }}>
                          {optimizationsLocked ? <FiLock size={12} /> : userProgress[`lesson-${modNumber}-optimizations`] ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#f39c12" />}
                        </span>
                      </div>
                    )}

                    <div
                      onClick={() => {
                        if (postAssessmentUnlocked) navigate(`/assessment/${module.moduleId}/post`);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "10px 15px", paddingLeft: "45px",
                        cursor: postAssessmentUnlocked ? "pointer" : "not-allowed", opacity: postAssessmentUnlocked ? 1 : 0.5,
                        color: postComplete ? "#22c55e" : "#2b005c", fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.02)",
                      }}
                    >
                      <FiClipboard size={14} />
                      <span>Post-Assessment Quiz</span>
                      <span style={{ marginLeft: "auto" }}>
                        {!postAssessmentUnlocked ? <FiLock size={14} /> : postComplete ? <FiCheckCircle size={14} color="#22c55e" /> : <FiCircle size={14} color="#7c5cff" />}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="lesson-viewer-container">
        <div style={{ position: 'sticky', top: '50vh', zIndex: 1000, width: 0, height: 0, left: 0 }}>
          <button className="lesson-sidebar-toggle-btn" onClick={() => setIsSidebarVisible(!isSidebarVisible)} title="Toggle Sidebar">
            {isSidebarVisible ? <FiChevronLeft size={16} /> : <FiChevronRight size={16} />}
          </button>
        </div>

        {isCurrentLessonLocked ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
            <FiLock size={64} style={{ marginBottom: "20px", color: "#cbd5e1" }} />
            <h2>Lesson Locked</h2>
            <p>Please complete the Global Course Pre-Test and preceding activities to unlock this lesson.</p>
            <button
              onClick={() => navigate("/learning-path")}
              style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              Return to Path
            </button>
          </div>
        ) : loading ? (
          <div className="lesson-content-skeleton">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-block lesson-skeleton-codeblock" />
            <div className="skeleton skeleton-line" />
          </div>
        ) : (
          <>
            <div className="lesson-top-nav">
              <div className="breadcrumb">
                <a href="/learning-path">Learning Path</a>
                <FiChevronRight className="breadcrumb-icon" />
                <span>Module {moduleNum}: {currentModule?.title}</span>
                <FiChevronRight className="breadcrumb-icon" />
                <span className="breadcrumb-current">Lesson {moduleNum}.{lessonNum}: {lesson?.title}</span>
              </div>
              <TourHelpButton pageId={lessonTour.pageId} tour={lessonTour} label="Replay lesson tour" />
            </div>

            <div className="lesson-content-wrapper">
              <div className="lesson-header">
                <div className="lesson-label">LESSON {moduleNum}.{lessonNum}</div>
                <h1>{lesson?.title}</h1>
                <p>{formatText(lesson?.description)}</p>
                <div className="lesson-meta-grid">
                  <div className="lesson-meta-card"><FiClock className="meta-icon" /><span>Estimated Time</span><strong>{lesson?.estimatedTime}</strong></div>
                  <div className="lesson-meta-card"><FiBarChart2 className="meta-icon" /><span>Difficulty</span><strong>{lesson?.difficulty}</strong></div>
                  <div className="lesson-meta-card"><FiTarget className="meta-icon" /><span>Prerequisites</span><strong>{lesson?.prerequisites}</strong></div>
                </div>
              </div>

              <article className="lesson-article">
                {lesson?.sections?.map((section) => (
                  <section key={section.id} id={section.id} className={`lesson-section ${section.type}`}>
                    <h2>{section.title}</h2>
                    {renderParagraphs(section.content)}
                    {renderBullets(section.bullets)}
                    {renderChart(section.chart)}
                    {renderImages(section.images)}
                    {renderCodeSnippets(section.codeSnippets)}
                    {renderBlockPlaygrounds(lessonId, section.id, exampleWorker, openPlaygroundId, setOpenPlaygroundId)}
                    {section.subsections?.map((subsection) => (
                      <div key={subsection.id || subsection.title} className="lesson-subsection">
                        <h3>{subsection.title}</h3>
                        {renderParagraphs(subsection.content, "lesson-subsection-content")}
                        {renderBullets(subsection.bullets)}
                        {renderChart(subsection.chart)}
                        {renderImages(subsection.images)}
                        {renderCodeSnippets(subsection.codeSnippets)}
                        {renderBlockPlaygrounds(lessonId, subsection.id, exampleWorker, openPlaygroundId, setOpenPlaygroundId)}
                      </div>
                    ))}
                  </section>
                ))}
              </article>

              {lesson?.references?.length > 0 && (
                <div className="lesson-resources">
                  <h2>References</h2>
                  <ul>
                    {lesson.references?.map((reference, index) => (
                      <li key={index}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a></li>
                    ))}
                  </ul>
                </div>
              )}

              {currentActivityId && (
                <div style={{ marginTop: "50px", padding: "30px", backgroundColor: "rgba(124, 92, 255, 0.05)", borderRadius: "12px", border: "1px solid rgba(124, 92, 255, 0.3)", textAlign: "center" }}>
                  <h3 style={{ color: "#2b005c", marginBottom: "10px", fontSize: "1.5rem" }}>Ready to practice?</h3>
                  <p style={{ marginBottom: "25px", color: "#4b5563", fontSize: "1.05rem" }}>Put your knowledge to the test with an interactive coding activity.</p>
                  <button
                    onClick={() => navigate(`/activity/${moduleId}/${currentActivityId}`)}
                    style={{ padding: "14px 28px", backgroundColor: "#7c5cff", color: "white", border: "none", borderRadius: "6px", fontSize: "1.1rem", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px rgba(124, 92, 255, 0.4)", transition: "transform 0.2s" }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    Start Activity
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}