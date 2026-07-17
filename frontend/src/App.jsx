// frontend/src/App.jsx
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import OfflineIndicator from "./components/OfflineIndicator";
import OnboardingTour from "./components/OnboardingTour";
import { OnboardingProvider } from "./context/OnboardingContext";
import { PyodideProvider } from "./context/PyodideContext";
import { startBackgroundSync, stopBackgroundSync } from "./utils/syncManager";

// Lazy load ALL pages to prevent circular dependency crashes and reduce the initial load payload
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'));
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

function App() {
  const location = useLocation();

  useEffect(() => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    const isValidUser = userStr && userStr !== "null" && userStr !== "undefined";
    const isAuthPage = location.pathname === '/signin' || location.pathname === '/signup';
    
    // Manage background sync lifecycle to prevent memory leaks and unauthenticated pings
    if (isValidUser && !isAuthPage) {
      startBackgroundSync(30000); // 30 seconds interval
    } else {
      stopBackgroundSync();
    }

    return () => stopBackgroundSync();
  }, [location.pathname]);

  return (
    <OnboardingProvider>
      <OfflineIndicator />
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
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/learning-path" element={<ProtectedRoute><LearningPath /></ProtectedRoute>} />
          <Route path="/learning-path/:moduleId/:lessonId" element={<ProtectedRoute><LessonViewer /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          {/*
            Only these four routes actually touch the Pyodide engine, so
            PyodideProvider is scoped here rather than at the app root.
            The worker (and its multi-megabyte wasm download) now only
            spins up when the user actually navigates into a workspace,
            activity, or evaluation-suite page, instead of on every single
            route including sign-in and the dashboard.
          */}
          <Route path="/app" element={<ProtectedRoute><PyodideProvider><MainApp /></PyodideProvider></ProtectedRoute>} />
          <Route path="/workspace" element={<ProtectedRoute><PyodideProvider><MainApp /></PyodideProvider></ProtectedRoute>} />
          <Route path="/activity/:moduleId/:activityId" element={<ProtectedRoute><PyodideProvider><ActivityApp /></PyodideProvider></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute><UserHomePage /></ProtectedRoute>} />
          <Route path="/assessment/:moduleId/:type" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          
          {/* Protected Admin Routes */}
          <Route path="/admin/users" element={<ProtectedRoute><AdminUserManagement /></ProtectedRoute>} />
          <Route path="/admin/evaluation-suite" element={<ProtectedRoute><PyodideProvider><EvaluationSuite /></PyodideProvider></ProtectedRoute>} />

          {/* Catch-all route: prevents a completely blank screen if the user lands on an invalid 404 path */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </OnboardingProvider>
  );
}

export default App;