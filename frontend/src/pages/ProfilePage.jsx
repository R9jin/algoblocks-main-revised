// frontend/src/pages/ProfilePage.jsx
import { useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiBookOpen,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronDown,
  FiClock,
  FiCode,
  FiCpu,
  FiDatabase,
  FiInfo,
  FiLock,
  FiMail,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiUnlock,
  FiUsers,
  FiZap
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import curriculumIndex from "../data/curriculumIndex";
import { assessmentsDB, progressDB, submissionsDB } from "../db";
import { isAdminUser } from "../utils/auth";
import "../styles/ProfilePage.css";

export default function ProfilePage() {
  const [user, setUser] = useState({ name: "User", email: "", progress: {}, assessments: {} });
  const [metrics, setMetrics] = useState({
    lessonsCompleted: 0,
    totalLessons: 0,
    overallAes: 0,
    overallRog: 0,
    assessmentsTaken: 0,
  });
  const [moduleMastery, setModuleMastery] = useState([]);
  const [expandedModules, setExpandedModules] = useState({});
  const [userRank, setUserRank] = useState("Novice Coder");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  const profileTour = {
    id: "profile-tour",
    pageId: "profile",
    title: "Profile Tour",
    steps: [
      { target: ".profile-header-card", title: "Your overview", description: "See your rank, avatar, and account details at a glance." },
      { target: ".profile-sidebar", title: "Performance metrics", description: "Track lessons completed, your average AES and ROG, and total evaluations recorded." },
      { target: ".mastery-list", title: "Module mastery", description: "Review how each module is progressing and where you can improve." },
      { target: ".milestone-card-container", title: "Assessments and milestones", description: "Track diagnostic and post-test milestones across the course." },
    ],
  };

  // Global Milestones State
  const [milestones, setMilestones] = useState({
    preTest: null,
    postTest: null
  });
  const [isPostTestUnlocked, setIsPostTestUnlocked] = useState(false);

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const formatMilestoneScore = (data) => {
    if (!data) return "--";
    if (data.score !== undefined && data.score !== null) return `${Math.round(data.score)}%`;
    if (data.correct !== undefined && data.total !== undefined && data.total > 0) {
      return `${Math.round((data.correct / data.total) * 100)}% (${data.correct}/${data.total})`;
    }
    return "Completed";
  };

  const getTestBreakdown = (sub, activity = null) => {
    const results = Array.isArray(sub?.testCases) ? sub.testCases : [];
    const legacyResults = results.some((test) => test.category)
      ? results
      : results.map((test, index) => ({ ...test, category: index >= Math.max(0, results.length - 2) ? "complexity" : "functional" }));
    const count = (category) => legacyResults.filter((test) => test.category === category);
    const score = (category) => {
      const tests = count(category);
      return { passed: tests.filter((test) => test.status === "passed").length, total: tests.length };
    };
    const functional = sub?.functional_total > 0
      ? { passed: sub.functional_passed || 0, total: sub.functional_total }
      : score("functional");
    const complexity = sub?.complexity_total > 0
      ? { passed: sub.complexity_passed || 0, total: sub.complexity_total }
      : score("complexity");
    // The activity's testCasesPool (loaded fresh from the module JSON) is
    // the source of truth for how many hidden tests an activity actually
    // has -- a saved submission's hidden_total can be stale (e.g. content
    // was edited after the student submitted, or an older/corrupted
    // submission carried over a stray count) and shouldn't be able to
    // conjure up a hidden test that doesn't exist. When we know the pool,
    // it wins outright: activities with 0 defined hidden tests always show
    // 0/0, never "0/1", no matter what the submission says.
    const hasKnownPool = Array.isArray(activity?.testCasesPool);
    const definedHiddenTotal = hasKnownPool
      ? activity.testCasesPool.filter((test) => test?.isHidden).length
      : 0;
    let hidden;
    if (hasKnownPool) {
      const legacyHiddenPassed = score("hidden").passed || 0;
      const reportedPassed = sub?.hidden_passed > 0 ? sub.hidden_passed : legacyHiddenPassed;
      hidden = { passed: Math.min(reportedPassed, definedHiddenTotal), total: definedHiddenTotal };
    } else {
      // No activity data available (e.g. module JSON failed to load) --
      // fall back to whatever the submission itself reports.
      hidden = sub?.hidden_total > 0
        ? { passed: sub.hidden_passed || 0, total: sub.hidden_total }
        : score("hidden").total > 0
          ? score("hidden")
          : { passed: sub?.hidden_passed || 0, total: 0 };
    }
    const total = functional.total + complexity.total + hidden.total || sub?.totalTestCases || sub?.total_tests || 0;
    const passed = functional.passed + complexity.passed + hidden.passed || sub?.passedTestCases || sub?.passed_tests || 0;
    return { functional, complexity, hidden, passed, total };
  };

  // Per the paper: ROG = AES_Final - AES_Baseline for that activity, with
  // no additional requirement that the Big-O complexity class itself
  // changed -- a resubmission that only fixed correctness (same class,
  // higher TSR) still raised AES and is still a real refactoring gain.
  // ActivityApp.jsx already stores the correct value in `sub.rog`; this
  // just guards against a negative or missing number reaching the UI.
  const getSafeRog = (sub) => Math.max(0, Number(sub?.rog) || 0);

  // Harder lessons should demand fewer activities to count as "cleared,"
  // not the same fixed majority as an easy one -- a lesson full of Hard
  // activities is doing its job if the learner clears even one or two of
  // them, while an all-Easy lesson can reasonably ask for about half.
  // Ranked so a lesson's overall difficulty is whichever of its activities
  // is hardest (one Hard activity in an otherwise-Easy lesson still makes
  // it a "Hard lesson" for this purpose), since that's the activity that
  // was actually gating completion.
  const DIFFICULTY_RANK = { easy: 0, beginner: 0, medium: 1, intermediate: 1, hard: 2, advanced: 3 };
  const getLessonDifficulty = (acts) => {
    let hardest = "easy";
    let hardestRank = 0;
    for (const act of acts) {
      const d = (act.difficulty || "easy").toLowerCase();
      const rank = DIFFICULTY_RANK[d] ?? 0;
      if (rank > hardestRank) { hardestRank = rank; hardest = d; }
    }
    return hardest;
  };
  const getMinRequiredForDifficulty = (difficulty, actsLength) => {
    if (actsLength <= 0) return 0;
    switch (difficulty) {
      case "advanced":
      case "hard":
        // "Only 1 or 2 activities" -- cap at 2, and never ask for more than
        // there actually are (a 1-activity Hard lesson still just needs 1).
        return Math.min(2, actsLength);
      case "medium":
      case "intermediate":
        return Math.max(1, Math.ceil(actsLength / 3));
      default: // easy / beginner / unrated
        return Math.max(1, Math.ceil(actsLength / 2));
    }
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const API_BASE = import.meta.env.VITE_API_URL || "";
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        let parsed = JSON.parse(stored || "{}");
        if (!parsed.email && !parsed.isGuest) parsed = { name: "User", email: "", progress: {}, assessments: {} };

        const isGuest = parsed.isGuest === true;

        // Admin accounts no longer have Learning Path / Workspace / Project
        // progress at all, so none of the curriculum-mastery data fetching
        // below is relevant (or even meaningful) for them. Load just the
        // basic identity fields and stop there.
        if (isAdminUser(parsed)) {
          setUser(parsed);
          setIsAdmin(true);
          setLoading(false);
          return;
        }

        let initialProg = parsed.progress || {};
        let initialAssm = parsed.assessments || {};

        if (!isGuest) {
          await progressDB.iterate((value, key) => { initialProg[key] = value.score !== undefined ? value.score : value; });
          await assessmentsDB.iterate((value, key) => { initialAssm[key] = value.data || value; });
        }

        if (navigator.onLine && parsed.email && !isGuest) {
          try {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            // PERFORMANCE FIX: these two API calls don't depend on each
            // other, but were previously awaited one after the other --
            // doubling the network wait on every profile-page load. Firing
            // them together with Promise.all cuts that in half.
            const [progRes, assmRes, subsRes] = await Promise.all([
              fetch(`${API_BASE}/api/get-progress`, { headers }),
              fetch(`${API_BASE}/api/get-assessments`, { headers }),
              fetch(`${API_BASE}/api/get-all-submissions`, { headers }),
            ]);

            // PERFORMANCE FIX: these three loops previously did
            // `for (...) { ...; await store.setItem(...) }` -- awaiting
            // each IndexedDB write one at a time before starting the next.
            // Each setItem() is its own independent transaction, so with a
            // learner's full history (progress per lesson, an assessment
            // per module, and a submission per activity across all 7
            // modules -- easily 100+ entries combined) this serialized
            // dozens of round trips to IndexedDB back-to-back, and
            // setLoading(false) couldn't fire until every single one
            // finished. None of these writes depend on each other, so
            // firing them all at once with Promise.all lets the browser
            // run them concurrently instead -- this was the single
            // biggest contributor to a slow-rendering Profile page.
            if (progRes.ok) {
              const data = await progRes.json();
              const entries = Object.entries(data.progress || data);
              for (const [key, val] of entries) initialProg[key] = val;
              await Promise.all(
                entries.map(([key, val]) => progressDB.setItem(key, { score: val, isSynced: true }))
              );
            }

            if (assmRes.ok) {
              const data = await assmRes.json();
              const entries = Object.entries(data.assessments || data);
              for (const [key, val] of entries) initialAssm[key] = val;
              await Promise.all(
                entries.map(([key, val]) => assessmentsDB.setItem(key, { ...val, isSynced: true }))
              );
            }

            if (subsRes.ok) {
              const subData = await subsRes.json();
              const validSubs = (subData.submissions || []).filter(
                (sub) => sub && sub.moduleId && sub.activityId
              );
              await Promise.all(
                validSubs.map((sub) => {
                  const subId = sub.id || `${sub.userId}_${sub.moduleId}_${sub.activityId}`;
                  return submissionsDB.setItem(subId, { ...sub, id: subId, isSynced: true });
                })
              );
            }
          } catch (e) { console.warn("Cloud sync warning:", e); }
        }

        const finalUser = { ...parsed, progress: isGuest ? {} : initialProg, assessments: isGuest ? {} : initialAssm };
        setUser(finalUser);

        const userSubs = {};
        if (!isGuest) {
          await submissionsDB.iterate((val) => {
            if (val.userId === finalUser.email) {
              if (!userSubs[val.moduleId]) userSubs[val.moduleId] = {};
              userSubs[val.moduleId][val.activityId] = val;
            }
          });
        }

        const findMilestoneData = (keywords) => {
          const cleanKws = keywords.map(k => k.toLowerCase().replace(/[-_ ]/g, ''));
          for (const [k, v] of Object.entries(finalUser.assessments || {})) {
            const cleanKey = k.toLowerCase().replace(/[-_ ]/g, '');
            if (cleanKws.some(kw => cleanKey.includes(kw))) {
              if (v !== null && v !== undefined && (v.completed || v.passed || v.score !== undefined || v.correct !== undefined)) {
                return v;
              }
            }
          }
          for (const [k, v] of Object.entries(finalUser.progress || {})) {
            const cleanKey = k.toLowerCase().replace(/[-_ ]/g, '');
            if (cleanKws.some(kw => cleanKey.includes(kw))) {
              if (v !== null && v !== undefined && (v === true || v >= 50 || (typeof v === 'object' && (v.completed || v.score !== undefined)))) {
                return typeof v === 'object' ? v : { score: v, completed: true };
              }
            }
          }
          return null;
        };

        const preTestData = findMilestoneData(['pretest', 'coursepretest']);
        const postTestData = findMilestoneData(['posttest', 'courseposttest']);

        setMilestones({ preTest: preTestData, postTest: postTestData });

        // PERFORMANCE FIX: these 7 module files were being fetched one at a
        // time in a loop -- each `await` inside the loop blocks the next
        // request from even starting, so this paid for 7 sequential round
        // trips where 7 parallel ones would do. Firing them all at once
        // with Promise.all is the single biggest fix for slow profile-page
        // loads.
        const allActivities = {};
        const moduleResults = await Promise.all(
          Array.from({ length: 7 }, (_, i) =>
            fetch(`/data/activities/module_${i}.json`)
              .then(async (res) => (res.ok ? [i, await res.json()] : null))
              .catch(() => { console.warn(`Could not load module_${i}.json`); return null; })
          )
        );
        for (const result of moduleResults) {
          if (result) {
            const [i, json] = result;
            allActivities[`module-${i}`] = json;
          }
        }

        // Any lesson the learner has actually saved work in should stay
        // visibly open on Profile -- not just the single most-recent one.
        // This used to track one "activeLessonId" (whichever lesson, across
        // every module, happened to be the LAST one found with a
        // submission), so if a tester had submissions scattered across
        // several lessons in the same module (e.g. 3.1, 3.2, 3.3, 3.4), only
        // the very last of those got force-unlocked -- every earlier lesson
        // they'd genuinely worked on fell back to `pathUnlocked` and showed
        // as locked, with a padlock next to the lesson title, even though
        // it visibly contained real, submitted activity data. A Set of every
        // touched lesson keeps all of them open.
        const touchedLessonIds = new Set();
        for (const mod of curriculumIndex) {
          for (const lesson of mod.lessons) {
            const lessonNumber = lesson.lessonId.split("-")[2];
            const lessonActivities = allActivities[mod.moduleId]?.[`lesson_${lessonNumber}`] || [];
            if (lessonActivities.some((act) => userSubs[mod.moduleId]?.[act.id])) {
              touchedLessonIds.add(lesson.lessonId);
            }
          }
        }

        let tLessons = 0, cLessons = 0;
        let globalAesSum = 0, globalAesCount = 0;
        let globalRogSum = 0, globalRogCount = 0;
        let pathUnlocked = true; // Tracks continuous curriculum completion status

        const masteryData = curriculumIndex.map((mod) => {
          const modActs = allActivities[mod.moduleId] || {};
          let modCompletedLessons = 0;
          let modAesSum = 0, modAesCount = 0;
          let modRogSum = 0, modRogCount = 0;

          tLessons += mod.lessons.length;

          const mappedLessons = mod.lessons.map((lesson) => {
            // Correctly parse JSON property keys like "lesson_1" from "lesson-0-1"
            const lessonParts = lesson.lessonId.split('-');
            const lessonNum = lessonParts[2];
            const lessonKeyJson = `lesson_${lessonNum}`;
            const acts = modActs[lessonKeyJson] || [];

            let lessonCompletedActs = 0;

            const mappedActs = acts.map((act) => {
              const sub = userSubs[mod.moduleId]?.[act.id];
              let aes = 0; let rog = 0; let isCompleted = false;
              let passedTests = null; let totalTests = null;
              let testBreakdown = null;
              let actualTime = null; let actualSpace = null;
              let baselineTime = null; let baselineSpace = null;
              let latestTime = null; let latestSpace = null;
              let hasSubmission = false;

              if (sub) {
                hasSubmission = true;
                aes = sub.latest_aes ?? sub.final_aes ?? sub.score ?? 0;
                if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100; 
                aes = Math.min(aes, 100);

                rog = getSafeRog(sub);
                isCompleted = aes >= 50 || sub.status === "passed";

                passedTests = sub.passedTestCases ?? sub.passed_tests ?? null;
                totalTests = sub.totalTestCases ?? sub.total_tests ?? null;
                testBreakdown = getTestBreakdown(sub, act);
                actualTime = sub.actual_complexity || null;
                actualSpace = sub.actual_space_complexity || null;
                baselineTime = sub.baseline_actual_complexity || actualTime;
                baselineSpace = sub.baseline_actual_space_complexity || actualSpace;
                latestTime = sub.latest_actual_complexity || actualTime;
                latestSpace = sub.latest_actual_space_complexity || actualSpace;

                if (isCompleted) lessonCompletedActs++;
                
                modAesSum += aes; modAesCount++; globalAesSum += aes; globalAesCount++;
                if (rog > 0) { modRogSum += rog; modRogCount++; globalRogSum += rog; globalRogCount++; }
              }

              return { ...act, aes: Math.round(aes), rog: Math.round(rog), isCompleted, hasSubmission, passedTests, totalTests, testBreakdown, actualTime, actualSpace, baselineTime, baselineSpace, latestTime, latestSpace };
            });

            // `lesson.minimumActivities` is never actually set anywhere in
            // curriculumIndex.js, so this always fell back to acts.length --
            // silently requiring every single activity in a lesson (5/5,
            // not "a passing majority") before the lesson counted as
            // cleared. That's stricter than how an individual activity is
            // judged "done" elsewhere (AES >= 50%, not 100%), and it's what
            // was pinning the module progress bar at 0% and cascading
            // `pathUnlocked = false` through every later lesson/module --
            // skipping or under-scoring even one of five activities meant
            // the lesson (and everything after it) could never unlock,
            // no matter how well the rest were done. `lesson.minimumActivities`
            // still wins outright when the data does specify one; otherwise
            // the requirement now scales down with how hard the lesson's
            // activities actually are, so a lesson full of Hard problems
            // only asks for 1-2 cleared instead of the same flat majority
            // an all-Easy lesson would need.
            const lessonDifficulty = getLessonDifficulty(acts);
            const minRequired = lesson.minimumActivities || getMinRequiredForDifficulty(lessonDifficulty, acts.length);
            let isLessonCompleted = false;
            if (acts.length > 0 && lessonCompletedActs >= minRequired) {
              isLessonCompleted = true;
            } else if (finalUser.progress[lesson.lessonId] >= 50 || finalUser.progress[lesson.lessonId] === true) {
              isLessonCompleted = true;
            }

            const currentUnlockState = pathUnlocked || touchedLessonIds.has(lesson.lessonId);

            if (!isLessonCompleted && acts.length > 0) {
              pathUnlocked = false; // Stop progression if minimum activities aren't completed
            }

            if (isLessonCompleted) {
              modCompletedLessons++;
              cLessons++;
            }

            return { 
              ...lesson, 
              activities: mappedActs, 
              isCompleted: isLessonCompleted, 
              isUnlocked: currentUnlockState,
              completedCount: lessonCompletedActs,
              minRequired: minRequired
            };
          });

          // ADDED: Parse Optimization Challenge Activities
          const rawOptimizations = modActs.optimizations || [];
          let optCompletedCount = 0;
          const isOptUnlocked = pathUnlocked; // Unlocks once standard module lessons are finished

          const mappedOptimizations = rawOptimizations.map((act) => {
            const sub = userSubs[mod.moduleId]?.[act.id];
            let aes = 0; let rog = 0; let isCompleted = false;
            let passedTests = null; let totalTests = null;
            let testBreakdown = null;
            let actualTime = null; let actualSpace = null;
            let baselineTime = null; let baselineSpace = null;
            let latestTime = null; let latestSpace = null;
            let hasSubmission = false;

            if (sub) {
              hasSubmission = true;
              aes = sub.latest_aes ?? sub.final_aes ?? sub.score ?? 0;
              if (sub.maxScore === 5 && aes <= 5) aes = (aes / 5) * 100;
              aes = Math.min(aes, 100);

              rog = getSafeRog(sub);
              isCompleted = aes >= 50 || sub.status === "passed";

              passedTests = sub.passedTestCases ?? sub.passed_tests ?? null;
              totalTests = sub.totalTestCases ?? sub.total_tests ?? null;
              testBreakdown = getTestBreakdown(sub, act);
              actualTime = sub.actual_complexity || null;
              actualSpace = sub.actual_space_complexity || null;
              baselineTime = sub.baseline_actual_complexity || actualTime;
              baselineSpace = sub.baseline_actual_space_complexity || actualSpace;
              latestTime = sub.latest_actual_complexity || actualTime;
              latestSpace = sub.latest_actual_space_complexity || actualSpace;

              if (isCompleted) optCompletedCount++;

              modAesSum += aes; modAesCount++; globalAesSum += aes; globalAesCount++;
              if (rog > 0) { modRogSum += rog; modRogCount++; globalRogSum += rog; globalRogCount++; }
            } else if (finalUser.progress[act.id] >= 50 || finalUser.progress[act.id] === true) {
              isCompleted = true;
              optCompletedCount++;
            }

            return { ...act, aes: Math.round(aes), rog: Math.round(rog), isCompleted, hasSubmission, passedTests, totalTests, testBreakdown, actualTime, actualSpace, baselineTime, baselineSpace, latestTime, latestSpace };
          });

          const modClean = mod.moduleId.toLowerCase().replace(/[-_ ]/g, ''); 
          const targetQuizKeys = [`${modClean}assessment`, `${modClean}quiz`, `${modClean}test`, modClean];
          let quizData = null;

          for (const [k, v] of Object.entries(finalUser.assessments || {})) {
            const kc = k.toLowerCase().replace(/[-_ ]/g, '');
            if (targetQuizKeys.includes(kc)) {
              quizData = v;
              break;
            }
          }

          const isQuizUnlocked = pathUnlocked;
          if (!quizData || (!quizData.passed && quizData.score < 50 && quizData.score !== undefined)) {
            pathUnlocked = false; // Lock next module if quiz isn't done
          }

          return {
            ...mod,
            lessons: mappedLessons,
            optimizations: {
              activities: mappedOptimizations,
              isUnlocked: isOptUnlocked,
              completedCount: optCompletedCount
            },
            quiz: quizData ? { ...quizData, isUnlocked: isQuizUnlocked } : { isUnlocked: isQuizUnlocked },
            completed: modCompletedLessons,
            total: mod.lessons.length,
            percentage: mod.lessons.length > 0 ? Math.round((modCompletedLessons / mod.lessons.length) * 100) : 0,
            avgAes: modAesCount > 0 ? Math.round(modAesSum / modAesCount) : 0,
            avgRog: modRogCount > 0 ? Math.round(modRogSum / modRogCount) : 0
          };
        });

        const checkPostTestUnlock = masteryData.length > 0 && masteryData.every(mod => {
          const lessonsDone = mod.total === 0 ? true : mod.completed >= mod.total;
          const quizDone = mod.quiz !== null && mod.quiz !== undefined && (mod.quiz.completed || mod.quiz.passed || mod.quiz.score !== undefined);
          return lessonsDone && quizDone;
        });
        setIsPostTestUnlocked(checkPostTestUnlock);

        const assessmentsTaken = Object.keys(finalUser.assessments || {}).filter(k => k.includes('_assessment') || k.includes('test') || k.includes('quiz')).length;
        const avgScore = globalAesCount > 0 ? Math.round(globalAesSum / globalAesCount) : 0;
        const avgRog = globalRogCount > 0 ? Math.round(globalRogSum / globalRogCount) : 0;

        setMetrics({
          lessonsCompleted: cLessons,
          totalLessons: tLessons,
          overallAes: avgScore,
          overallRog: avgRog,
          assessmentsTaken: assessmentsTaken
        });

        setModuleMastery(masteryData);

        if (isGuest) {
          setUserRank("Guest Visitor");
        } else {
          const completionRatio = tLessons > 0 ? cLessons / tLessons : 0;
          if (completionRatio === 1 && avgScore > 90) setUserRank("Algorithm Grandmaster");
          else if (completionRatio >= 0.8) setUserRank("Algorithm Scholar");
          else if (completionRatio >= 0.4) setUserRank("Intermediate Architect");
          else if (completionRatio > 0) setUserRank("Syntax Explorer");
          else setUserRank("Novice Coder");
        }

      } catch (e) {
        console.error("Profile data load error:", e);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const initials = user.name ? user.name.charAt(0).toUpperCase() : "U";

  if (loading) {
    return (
      <div className="profile-page-v2">
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="profile-page-v2">
        <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />

        <div className="profile-container-v2">
          <div className="profile-cover">
            <div className="cover-pattern"></div>
          </div>

          <div className="profile-header-card">
            <div className="profile-avatar-wrapper">
              <div className="profile-avatar-v2">{initials}</div>
              <div className="avatar-status-badge" title="Online & Ready"></div>
            </div>

            <div className="profile-user-details">
              <div className="user-title-row">
                <h1>{user.name}</h1>
                <span className="role-badge"><FiShield style={{ marginRight: '6px' }} /> Administrator</span>
              </div>

              <div className="user-email-wrapper">
                <span className="user-email"><FiMail size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />{user.email}</span>
              </div>
            </div>

            <div className="profile-header-actions">
              <button type="button" className="btn-resume-learning" onClick={() => navigate("/dashboard")}>
                <FiShield size={18} /> Open Admin Dashboard
              </button>
            </div>
          </div>

          <div className="profile-content-grid">
            <main className="profile-main-content" style={{ gridColumn: '1 / -1' }}>
              <div className="content-header-row">
                <h2>Administrator Account</h2>
                <span className="mastery-subtitle">
                  Admin accounts do not track Learning Path, Workspace, or Project progress -- those are
                  student-only features. This account is scoped to user management and dataset testing.
                </span>
              </div>

              <div className="mastery-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div className="mastery-card-container">
                  <Link to="/admin/users" className="mastery-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                    <div className="mastery-card-left">
                      <div className="mastery-module-number"><FiUsers /></div>
                      <div className="mastery-details">
                        <h4>User Management</h4>
                        <span className="mastery-fraction">Search, suspend, or delete accounts</span>
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="mastery-card-container">
                  <Link to="/admin/evaluation-suite" className="mastery-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                    <div className="mastery-card-left">
                      <div className="mastery-module-number"><FiActivity /></div>
                      <div className="mastery-details">
                        <h4>Dataset Testing</h4>
                        <span className="mastery-fraction">Run the full complexity analyzer benchmark</span>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page-v2">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={profileTour} tourPageId="profile" />

      <div className="profile-container-v2">
        <div className="profile-cover">
          <div className="cover-pattern"></div>
        </div>

        <div className="profile-header-card">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-v2">{initials}</div>
            <div className="avatar-status-badge" title="Online & Ready"></div>
          </div>

          <div className="profile-user-details">
            <div className="user-title-row">
              <h1>{user.name}</h1>
              <span className="role-badge"><FiCpu style={{ marginRight: '6px' }} /> {userRank}</span>
            </div>
            
            <div className="user-email-wrapper">
              {user.isGuest ? (
                <span className="guest-warning-badge">
                  <FiAlertTriangle className="status-icon warning" />
                  Guest Mode (Local persistence disabled)
                </span>
              ) : (
                <span className="user-email">{user.email}</span>
              )}
            </div>
          </div>

          <div className="profile-header-actions">
            {/* BUG FIX: guests are blocked from the Learning Path (nothing
                would persist for them there anyway) -- point this button at
                Sign Up instead of a link that just bounces them back out. */}
            {user.isGuest ? (
              <Link to="/signup" className="btn-resume-learning">
                <FiCode size={18} /> Sign Up to Start Learning
              </Link>
            ) : (
              <Link to="/learning-path" className="btn-resume-learning">
                <FiCode size={18} /> Continue Learning
              </Link>
            )}
          </div>
        </div>

        {/* BUG FIX: guests have no persisted progress/assessments (isGuest
            wipes progress/assessments to {} above), so the Performance
            Metrics sidebar and the Curriculum Path & Mastery list were just
            rendering hollow, meaningless 0-value cards for them. Guests
            shouldn't see this section at all -- show a sign-up prompt
            instead. */}
        {user.isGuest ? (
          <div className="profile-content-grid guest-content-grid">
            <div className="guest-locked-notice">
              <FiLock size={28} className="guest-locked-icon" />
              <h3>Track Your Progress</h3>
              <p>
                Performance metrics and your curriculum path are only available for
                registered accounts. Sign up to save your progress, AES/ROG scores,
                and assessment history.
              </p>
              <Link to="/signup" className="btn-resume-learning">
                <FiCode size={18} /> Sign Up to Start Learning
              </Link>
            </div>
          </div>
        ) : (
        <div className="profile-content-grid">
          <aside className="profile-sidebar">
            <h3 className="sidebar-title">Performance Metrics</h3>

            <div className="stat-box">
              <div className="stat-icon-wrapper blue"><FiBookOpen /></div>
              <div className="stat-info">
                <h4>Lessons Conquered</h4>
                <p><strong>{metrics.lessonsCompleted}</strong> <span className="text-muted">/ {metrics.totalLessons}</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper purple"><FiTarget /></div>
              <div className="stat-info">
                <h4 style={{ display: 'flex', alignItems: 'center' }}>
                  Efficiency Rate
                  <div className="info-tooltip">
                    <FiInfo size={14} />
                    <span className="tooltip-text">
                      <span className="tooltip-title">Algorithmic Efficiency Score (AES)</span>
                      Measures how close your code's Time and Space complexity is to optimal. 100% represents optimal complexity.
                    </span>
                  </div>
                </h4>
                <p><strong>{metrics.overallAes}%</strong> <span className="text-muted">avg AES</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper orange"><FiTrendingUp /></div>
              <div className="stat-info">
                <h4 style={{ display: 'flex', alignItems: 'center' }}>
                  Optimization Gain
                  <div className="info-tooltip">
                    <FiInfo size={14} />
                    <span className="tooltip-text">
                      <span className="tooltip-title">Refactoring Optimization Gain (ROG)</span>
                      Tracks AES point increases after reading automated complexity analysis and refactoring working code.
                    </span>
                  </div>
                </h4>
                <p><strong>+{metrics.overallRog}</strong> <span className="text-muted">avg ROG</span></p>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon-wrapper green"><FiActivity /></div>
              <div className="stat-info">
                <h4>Assessments</h4>
                <p><strong>{metrics.assessmentsTaken}</strong> <span className="text-muted">evaluations recorded</span></p>
              </div>
            </div>
          </aside>

          <main className="profile-main-content">
            <div className="content-header-row">
              <h2>Curriculum Path & Mastery</h2>
              <span className="mastery-subtitle">Chronological tracking from baseline evaluation to final verification</span>
            </div>

            <div className="mastery-list chronological-curriculum">
              {/* STAGE 0: PRE-TEST */}
              <div className="mastery-card-container milestone-card-container">
                <div className={`mastery-card milestone-card ${milestones.preTest ? 'completed' : ''}`}>
                  <div className="mastery-card-left">
                    <div className="mastery-module-number milestone-badge pre-badge">PRE</div>
                    <div className="mastery-details">
                      <h4>Course Pre-Test Evaluation</h4>
                      <span className="mastery-fraction">
                        {milestones.preTest 
                          ? `Completed • Baseline Recorded: ${formatMilestoneScore(milestones.preTest)}` 
                          : "Pending Initial Baseline Assessment"}
                      </span>
                    </div>
                  </div>
                  <div className="mastery-card-right">
                    {milestones.preTest ? (
                      // BUG FIX: this used to be a static, unclickable badge --
                      // once the pre-test was completed there was no way to
                      // get back to the results screen from the Profile page.
                      // AssessmentPage already renders a locked results view
                      // (score, label, breakdown) once a completed attempt is
                      // detected, so this just links there like the
                      // equivalent "View Results" button on the Learning Path
                      // page already does.
                      <Link to="/assessment/course-pre-test/pre" className="btn-milestone-action violet view-results-link">
                        <FiCheckCircle className="status-inline-icon" /> Baseline Recorded — View Results
                      </Link>
                    ) : (
                      <Link to="/assessment/course-pre-test/pre" className="btn-milestone-action violet">
                        Take Pre-Test
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* STAGES 1-7: REPEATING MODULES -> LESSONS -> OPTIMIZATIONS -> QUIZZES */}
              {moduleMastery.map((mod) => {
                const modNumber = mod.moduleId ? mod.moduleId.replace("module-", "") : "0";
                const isComplete = mod.completed === mod.total && mod.total > 0;
                const isExpanded = expandedModules[mod.moduleId];

                return (
                  <div key={mod.moduleId} className="mastery-card-container">
                    <div className={`mastery-card ${isComplete ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleModule(mod.moduleId)}>
                      <div className="mastery-card-left">
                        <div className="mastery-module-number">M{modNumber}</div>
                        <div className="mastery-details">
                          <h4>{mod.title}</h4>
                          <span className="mastery-fraction">
                            {mod.completed} of {mod.total} lessons cleared
                            {mod.avgAes > 0 && <span className="mod-inline-metric"> • Avg AES: {mod.avgAes}%</span>}
                            {mod.avgRog > 0 && <span className="mod-inline-metric"> • Avg ROG: +{mod.avgRog}</span>}
                          </span>
                        </div>
                      </div>

                      <div className="mastery-card-right">
                        <div className="progress-bar-container">
                          <div className="progress-bar-track">
                            <div className={`progress-bar-fill ${isComplete ? 'gold' : ''}`} style={{ width: `${mod.percentage}%` }}></div>
                          </div>
                          <span className="progress-percentage">{mod.percentage}%</span>
                        </div>
                        <FiChevronDown className={`module-chevron ${isExpanded ? 'rotated' : ''}`} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="module-dropdown-content">
                        {mod.lessons.map((lesson, lIdx) => (
                          <div key={lesson.lessonId} className={`lesson-block ${lesson.isUnlocked ? '' : 'locked-block'}`}>
                            <div className="lesson-header">
                              <span className="lesson-title">Lesson {modNumber}.{lIdx + 1}: {lesson.title}</span>
                              <div className="lesson-status-indicators">
                                {lesson.activities.length > 0 && (
                                  <span className={`activity-count-badge ${lesson.isCompleted ? 'cleared' : ''}`}>
                                    {lesson.completedCount}/{lesson.minRequired} Acts 
                                  </span>
                                )}
                                {!lesson.isUnlocked ? (
                                  <FiLock className="lesson-lock-icon" title="Complete previous activities to unlock" />
                                ) : lesson.isCompleted ? (
                                  <FiCheckCircle className="lesson-check cleared" />
                                ) : null}
                              </div>
                            </div>
                            
                            {lesson.activities.length === 0 ? (
                              <div className="activity-row empty-row">
                                <span className="empty-text">Concept / Interactive Reading Content</span>
                              </div>
                            ) : (
                              <div className="activities-list">
                                {lesson.activities.map((act) => {
                                  const isActUnlocked = lesson.isUnlocked || act.isCompleted || act.hasSubmission;
                                  return (
                                  <div key={act.id} className={`activity-row diff-${act.difficulty?.toLowerCase() || 'easy'} ${act.isCompleted ? 'completed-row' : ''} ${!isActUnlocked ? 'locked-row' : ''}`}>
                                    <div className="activity-row-top">
                                      <div className="act-left">
                                        {act.isCompleted ? <FiCheckCircle className="act-icon success" /> : isActUnlocked ? <FiCode className="act-icon pending" /> : <FiLock className="act-icon locked" />}
                                        <div className="act-info">
                                          <span className="act-title">{act.title}</span>
                                          <span className={`act-difficulty ${act.difficulty?.toLowerCase() || 'easy'}`}>{act.difficulty || 'Easy'}</span>
                                        </div>
                                      </div>
                                      {!isActUnlocked && (
                                        <span className="locked-text"><FiLock /> Locked</span>
                                      )}
                                    </div>
                                    {isActUnlocked && (
                                      <div className="act-metrics-group">
                                        <div className="metric-cluster score-cluster">
                                          <span className="cluster-label"><FiZap /> Score</span>
                                          <div className="cluster-values">
                                            <span className={`metric-badge aes-badge ${act.aes >= 100 ? 'perfect' : act.aes > 0 ? 'good' : 'empty'}`}>
                                              AES {act.aes > 0 ? `${act.aes}%` : '--'}
                                            </span>
                                            <span className={`metric-badge rog-badge ${act.rog > 0 ? 'active' : 'empty'}`}>
                                              <FiTrendingUp className="badge-icon" /> {act.rog > 0 ? `+${act.rog}` : '--'}
                                            </span>
                                          </div>
                                        </div>
                                        {act.testBreakdown && (
                                          <div className="metric-cluster tests-cluster">
                                            <span className="cluster-label"><FiCheckSquare /> Tests</span>
                                            <div className="cluster-values">
                                              <span className="metric-badge tests-badge">
                                                Func {act.testBreakdown.functional.passed}/{act.testBreakdown.functional.total}
                                              </span>
                                              <span className="metric-badge tests-badge">
                                                Complexity {act.testBreakdown.complexity.passed}/{act.testBreakdown.complexity.total}
                                              </span>
                                              <span className="metric-badge tests-badge">
                                                Hidden {act.testBreakdown.hidden.passed}/{act.testBreakdown.hidden.total}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                        {(act.actualTime || act.actualSpace) && (
                                          <div className="metric-cluster complexity-cluster">
                                            <span className="cluster-label"><FiCpu /> Complexity</span>
                                            <div className="cluster-values">
                                              {act.actualTime && (
                                                <span className="metric-badge complexity-badge">
                                                  <FiClock className="badge-icon" /> {act.actualTime}
                                                </span>
                                              )}
                                              {act.actualSpace && (
                                                <span className="metric-badge complexity-badge">
                                                  <FiDatabase className="badge-icon" /> {act.actualSpace}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {act.baselineTime && act.latestTime && (
                                          <div className="metric-cluster trend-cluster">
                                            <span className="cluster-label"><FiTrendingUp /> Improvement</span>
                                            <div className="cluster-values">
                                              <span className="metric-badge trend-badge">
                                                Time {act.baselineTime} &rarr; {act.latestTime}
                                              </span>
                                              <span className="metric-badge trend-badge">
                                                Space {act.baselineSpace || "--"} &rarr; {act.latestSpace || "--"}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* ADDED: Optimization Challenges Section */}
                        {mod.optimizations && mod.optimizations.activities.length > 0 && (
                          <div className={`lesson-block optimization-block ${mod.optimizations.isUnlocked ? '' : 'locked-block'}`}>
                            <div className="lesson-header">
                              <span className="lesson-title" style={{ display: 'flex', alignItems: 'center' }}>
                                <FiTarget style={{ marginRight: '8px', color: '#7c5cff' }} />
                                Module {modNumber} Optimization Challenges
                              </span>
                              <div className="lesson-status-indicators">
                                <span className={`activity-count-badge ${mod.optimizations.completedCount === mod.optimizations.activities.length ? 'cleared' : ''}`}>
                                  {mod.optimizations.completedCount}/{mod.optimizations.activities.length} Acts
                                </span>
                                {!mod.optimizations.isUnlocked ? (
                                  <FiLock className="lesson-lock-icon" title="Complete module lessons to unlock" />
                                ) : mod.optimizations.completedCount === mod.optimizations.activities.length ? (
                                  <FiCheckCircle className="lesson-check cleared" />
                                ) : null}
                              </div>
                            </div>

                            <div className="activities-list">
                              {mod.optimizations.activities.map((act) => {
                                const isActUnlocked = mod.optimizations.isUnlocked || act.isCompleted || act.hasSubmission;
                                return (
                                  <div key={act.id} className={`activity-row diff-${act.difficulty?.toLowerCase() || 'medium'} ${act.isCompleted ? 'completed-row' : ''} ${!isActUnlocked ? 'locked-row' : ''}`}>
                                    <div className="activity-row-top">
                                      <div className="act-left">
                                        {act.isCompleted ? <FiCheckCircle className="act-icon success" /> : isActUnlocked ? <FiCode className="act-icon pending" /> : <FiLock className="act-icon locked" />}
                                        <div className="act-info">
                                          <span className="act-title">{act.title}</span>
                                          <span className={`act-difficulty ${act.difficulty?.toLowerCase() || 'medium'}`}>{act.difficulty || 'Medium'}</span>
                                        </div>
                                      </div>
                                      {!isActUnlocked && (
                                        <span className="locked-text"><FiLock /> Locked</span>
                                      )}
                                    </div>
                                    {isActUnlocked && (
                                      <div className="act-metrics-group">
                                        <div className="metric-cluster score-cluster">
                                          <span className="cluster-label"><FiZap /> Score</span>
                                          <div className="cluster-values">
                                            <span className={`metric-badge aes-badge ${act.aes >= 100 ? 'perfect' : act.aes > 0 ? 'good' : 'empty'}`}>
                                              AES {act.aes > 0 ? `${act.aes}%` : '--'}
                                            </span>
                                            <span className={`metric-badge rog-badge ${act.rog > 0 ? 'active' : 'empty'}`}>
                                              <FiTrendingUp className="badge-icon" /> {act.rog > 0 ? `+${act.rog}` : '--'}
                                            </span>
                                          </div>
                                        </div>
                                        {act.testBreakdown && (
                                          <div className="metric-cluster tests-cluster">
                                            <span className="cluster-label"><FiCheckSquare /> Tests</span>
                                            <div className="cluster-values">
                                              <span className="metric-badge tests-badge">
                                                Func {act.testBreakdown.functional.passed}/{act.testBreakdown.functional.total}
                                              </span>
                                              <span className="metric-badge tests-badge">
                                                Complexity {act.testBreakdown.complexity.passed}/{act.testBreakdown.complexity.total}
                                              </span>
                                              <span className="metric-badge tests-badge">
                                                Hidden {act.testBreakdown.hidden.passed}/{act.testBreakdown.hidden.total}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                        {(act.actualTime || act.actualSpace) && (
                                          <div className="metric-cluster complexity-cluster">
                                            <span className="cluster-label"><FiCpu /> Complexity</span>
                                            <div className="cluster-values">
                                              {act.actualTime && (
                                                <span className="metric-badge complexity-badge">
                                                  <FiClock className="badge-icon" /> {act.actualTime}
                                                </span>
                                              )}
                                              {act.actualSpace && (
                                                <span className="metric-badge complexity-badge">
                                                  <FiDatabase className="badge-icon" /> {act.actualSpace}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {act.baselineTime && act.latestTime && (
                                          <div className="metric-cluster trend-cluster">
                                            <span className="cluster-label"><FiTrendingUp /> Improvement</span>
                                            <div className="cluster-values">
                                              <span className="metric-badge trend-badge">
                                                Time {act.baselineTime} &rarr; {act.latestTime}
                                              </span>
                                              <span className="metric-badge trend-badge">
                                                Space {act.baselineSpace || "--"} &rarr; {act.latestSpace || "--"}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className={`lesson-block module-quiz-block ${mod.quiz && mod.quiz.isUnlocked ? '' : 'locked-block'}`}>
                          <div className="lesson-header">
                            <span className="lesson-title quiz-label">Module {modNumber} Verification Quiz</span>
                            {mod.quiz && (mod.quiz.passed || (mod.quiz.score !== undefined && mod.quiz.score >= 50)) && <FiCheckCircle className="lesson-check passed" />}
                          </div>
                          <div className="activity-row">
                            <div className="act-left">
                              {mod.quiz && mod.quiz.isUnlocked ? <FiActivity className="act-icon quiz-icon" /> : <FiLock className="act-icon locked" />}
                              <div className="act-info">
                                <span className="act-title">Post-Module Assessment</span>
                                <span className="act-difficulty medium">Required</span>
                              </div>
                            </div>
                            <div className="act-right">
                              {mod.quiz && (mod.quiz.passed || mod.quiz.score !== undefined) ? (
                                // BUG FIX: same "no way back to results" issue
                                // as the pre/post-test milestones -- wrap the
                                // score badge in a link to the completed
                                // quiz's results view instead of leaving it
                                // as inert text.
                                <Link to={`/assessment/${mod.moduleId}/post`} className={`metric-badge aes-badge ${mod.quiz.passed || (mod.quiz.score !== undefined && mod.quiz.score >= 50) ? 'perfect' : 'good'}`}>
                                  Score: {formatMilestoneScore(mod.quiz)}
                                </Link>
                              ) : mod.quiz && mod.quiz.isUnlocked ? (
                                <Link to={`/assessment/${mod.moduleId}/post`} className="btn-take-quiz">
                                  Take Quiz
                                </Link>
                              ) : (
                                <span className="btn-take-quiz locked" style={{ backgroundColor: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                                  <FiLock style={{ marginRight: '6px' }} /> Locked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}

              {/* STAGE FINAL: POST-TEST */}
              <div className="mastery-card-container milestone-card-container final-milestone">
                <div className={`mastery-card milestone-card ${milestones.postTest ? 'completed' : !isPostTestUnlocked ? 'locked' : 'ready'}`}>
                  <div className="mastery-card-left">
                    <div className={`mastery-module-number milestone-badge post-badge ${!isPostTestUnlocked && !milestones.postTest ? 'locked' : ''}`}>
                      POST
                    </div>
                    <div className="mastery-details">
                      <h4>Course Post-Test Final Verification</h4>
                      <span className="mastery-fraction">
                        {milestones.postTest 
                          ? `Completed • Final Score: ${formatMilestoneScore(milestones.postTest)}` 
                          : isPostTestUnlocked 
                          ? "Unlocked • Ready for Final Examination" 
                          : (
                            <span className="locked-reason-span">
                              <FiLock className="inline-lock-icon" />
                              Locked (Clear all Modules & Quizzes first)
                            </span>
                          )
                        }
                      </span>
                    </div>
                  </div>
                  <div className="mastery-card-right">
                    {milestones.postTest ? (
                      <Link to="/assessment/course-post-test/post" className="milestone-status validated view-results-link">
                        <FiCheckCircle className="status-inline-icon" /> Completed — View Results
                      </Link>
                    ) : isPostTestUnlocked ? (
                      <Link to="/assessment/course-post-test/post" className="btn-milestone-action gold">
                        <FiUnlock style={{ marginRight: '6px' }}/> Take Final Exam
                      </Link>
                    ) : (
                      <span className="milestone-status disabled">
                        <FiLock className="status-inline-icon" /> Exam Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </main>
        </div>
        )}
      </div>
    </div>
  );
}