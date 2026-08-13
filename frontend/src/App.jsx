// frontend/src/App.jsx
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import OfflineIndicator from "./components/OfflineIndicator";
import SyncLimitNotice from "./components/SyncLimitNotice";
import OnboardingTour from "./components/OnboardingTour";
import { OnboardingProvider } from "./context/OnboardingContext";
import { PyodideProvider } from "./context/PyodideContext";
import { startBackgroundSync, stopBackgroundSync } from "./utils/syncManager";
import { isAdminUser } from "./utils/auth";

// Lazy load ALL pages to prevent circular dependency crashes and reduce the initial load payload
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'));
const AccuracyOverview = lazy(() => import('./pages/AccuracyOverview'));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const EvaluationSuite = lazy(() => import("./pages/EvaluationSuite"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const LandingPage = lazy(() => import("./pages/HomePage"));
const LearningPath = lazy(() => import("./pages/LearningPath"));
const Projects = lazy(() => import("./pages/Projects"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const UserHomePage = lazy(() => import("./pages/UserHomePage"));
const MainApp = lazy(() => import("./pages/MainApp"));
const ActivityApp = lazy(() => import("./pages/ActivityApp"));
const AssessmentPage = lazy(() => import("./pages/AssessmentPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const LessonViewer = lazy(() => import("./pages/LessonViewer"));

const ProtectedRoute = ({ children }) => {
  const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
  // Prevent JS type coercion bugs where the string "null" evaluates to true
  const isValidUser = userStr && userStr !== "null" && userStr !== "undefined";
  
  if (!isValidUser) {
    return <Navigate to="/" replace />; 
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
  const isValidUser = userStr && userStr !== "null" && userStr !== "undefined";
  
  if (isValidUser) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

// Admin accounts no longer have Learning Path / Workspace / Project progress.
// Wrap those routes so an admin session is bounced back to its own
// dashboard instead of picking up student progress.
const StudentOnlyRoute = ({ children }) => (
  <ProtectedRoute>
    {isAdminUser() ? <Navigate to="/dashboard" replace /> : children}
  </ProtectedRoute>
);

// Admin-only pages (full User Management, standalone Dataset Testing) --
// a signed-in student account should never land here.
const AdminOnlyRoute = ({ children }) => (
  <ProtectedRoute>
    {isAdminUser() ? children : <Navigate to="/dashboard" replace />}
  </ProtectedRoute>
);

function App() {
  const location = useLocation();

  const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
  const isValidUser = userStr && userStr !== "null" && userStr !== "undefined";
  const isAuthPage = location.pathname === '/signin' || location.pathname === '/signup';

  useEffect(() => {
    // Manage background sync lifecycle to prevent memory leaks and unauthenticated pings.
    //
    // COST NOTE: this used to depend on [location.pathname], which meant every
    // in-app navigation (Dashboard -> MainApp -> ActivityApp -> ...) tore down
    // and re-created the sync loop, and startBackgroundSync() fires an
    // immediate sync burst on every call. A student just clicking around the
    // app could trigger far more than one sync cycle per 30s. Depending on
    // [isValidUser, isAuthPage] instead means the effect only re-fires when
    // auth actually changes (login/logout, or entering/leaving /signin
    // /signup) -- ordinary navigation between authenticated pages no longer
    // restarts the sync loop.
    if (isValidUser && !isAuthPage) {
      startBackgroundSync(30000); // 30 seconds interval
    } else {
      stopBackgroundSync();
    }

    return () => stopBackgroundSync();
  }, [isValidUser, isAuthPage]);

  return (
    <OnboardingProvider>
      <OfflineIndicator />
      <SyncLimitNotice />
      <OnboardingTour />
      
      <Suspense fallback={<div style={{ padding: "20px", color: "white", textAlign: "center", marginTop: "50px" }}>Loading application...</div>}>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
          
          {/* Protected Application Routes */}
          {/*
            /dashboard is now role-branched. Admin accounts get their own
            dashboard (User Management overview + full Dataset Testing) and
            never see the student dashboard's Learning Path / Workspace /
            Project content. It needs PyodideProvider since the embedded
            Dataset Testing panel runs the analyzer in-browser.
          */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              {isAdminUser() ? <PyodideProvider><AdminDashboard /></PyodideProvider> : <Dashboard />}
            </ProtectedRoute>
          } />
          <Route path="/learning-path" element={<StudentOnlyRoute><LearningPath /></StudentOnlyRoute>} />
          <Route path="/learning-path/:moduleId/:lessonId" element={<StudentOnlyRoute><LessonViewer /></StudentOnlyRoute>} />
          <Route path="/projects" element={<StudentOnlyRoute><Projects /></StudentOnlyRoute>} />
          {/*
            Only these four routes actually touch the Pyodide engine, so
            PyodideProvider is scoped here rather than at the app root.
            The worker (and its multi-megabyte wasm download) now only
            spins up when the user actually navigates into a workspace,
            activity, or evaluation-suite page, instead of on every single
            route including sign-in and the dashboard.
          */}
          <Route path="/app" element={<StudentOnlyRoute><PyodideProvider><MainApp /></PyodideProvider></StudentOnlyRoute>} />
          <Route path="/workspace" element={<StudentOnlyRoute><PyodideProvider><MainApp /></PyodideProvider></StudentOnlyRoute>} />
          <Route path="/activity/:moduleId/:activityId" element={<StudentOnlyRoute><PyodideProvider><ActivityApp /></PyodideProvider></StudentOnlyRoute>} />
          <Route path="/home" element={<StudentOnlyRoute><UserHomePage /></StudentOnlyRoute>} />
          <Route path="/assessment/:moduleId/:type" element={<StudentOnlyRoute><AssessmentPage /></StudentOnlyRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          {/*
            Simplified, student-friendly accuracy overview -- open to every
            signed-in student. It reuses the same Pyodide worker as the admin
            evaluation suite below, so it needs the same provider, but the
            page itself only ever shows two headline percentages plus plain
            language -- no tables, no per-class breakdowns.
          */}
          <Route path="/accuracy" element={<StudentOnlyRoute><PyodideProvider><AccuracyOverview /></PyodideProvider></StudentOnlyRoute>} />
          
          {/*
            Protected Admin Routes -- these remain as standalone/direct-link
            pages (reachable from the profile icon's User Management link,
            or by direct URL) in addition to being surfaced on the admin
            dashboard itself. Restricted to admin accounts only.
          */}
          <Route path="/admin/users" element={<AdminOnlyRoute><AdminUserManagement /></AdminOnlyRoute>} />
          <Route path="/admin/evaluation-suite" element={<AdminOnlyRoute><PyodideProvider><EvaluationSuite /></PyodideProvider></AdminOnlyRoute>} />

          {/* Catch-all route: prevents a completely blank screen if the user lands on an invalid 404 path */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </OnboardingProvider>
  );
}

export default App;