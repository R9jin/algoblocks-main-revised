// frontend/src/utils/routeWarmup.js
//
// Every page in App.jsx is lazy-loaded, so the first time a signed-in
// user navigates to a page they haven't opened yet this session, React
// has to fetch that page's JS chunk over the network before it can
// render. RouteErrorBoundary.jsx already has to handle the case where
// that fetch fails offline ("this activity hasn't been downloaded to this
// device yet") -- this module shrinks the window in which that can happen
// by kicking off every post-sign-in page's chunk download in the
// background the moment auth succeeds, instead of waiting for the user to
// click into each one.
//
// Each import() specifier here matches the corresponding lazy() call in
// App.jsx exactly, so this resolves to the SAME chunk Vite would load on
// navigation -- calling it early just warms the browser's cache (and, via
// the service worker, its offline cache) rather than creating a duplicate
// download.
let warmed = false;

const POST_AUTH_PAGE_IMPORTS = [
    () => import("../pages/AdminDashboard.jsx"),
    () => import("../pages/AdminUserManagement.jsx"),
    () => import("../pages/AccuracyOverview.jsx"),
    () => import("../pages/Dashboard.jsx"),
    () => import("../pages/EvaluationSuite.jsx"),
    () => import("../pages/LearningPath.jsx"),
    () => import("../pages/Projects.jsx"),
    () => import("../pages/UserHomePage.jsx"),
    () => import("../pages/MainApp.jsx"),
    () => import("../pages/ActivityApp.jsx"),
    () => import("../pages/AssessmentPage.jsx"),
    () => import("../pages/ProfilePage.jsx"),
    () => import("../pages/LessonViewer.jsx"),
];

// Fire-and-forget: kicks off every post-sign-in page chunk download in the
// background. Runs at most once per tab session. Individual failures
// (e.g. a genuinely offline first sign-in) are swallowed -- that page
// simply falls back to its normal on-demand Suspense fetch, with
// RouteErrorBoundary's existing offline message if that also fails.
export function warmupRouteChunks() {
    if (warmed) return Promise.resolve();
    warmed = true;
    return Promise.allSettled(POST_AUTH_PAGE_IMPORTS.map((load) => load().catch(() => {})));
}
