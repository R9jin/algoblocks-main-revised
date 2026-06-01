// frontend/src/App.jsx
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import OfflineIndicator from "./components/OfflineIndicator";
import { PyodideProvider } from "./context/PyodideContext";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import LandingPage from "./pages/HomePage";
import LearningPath from "./pages/LearningPath";
import Projects from "./pages/Projects";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import UserHomePage from "./pages/UserHomePage";
import { startBackgroundSync } from "./utils/syncManager";

const MainApp = lazy(() => import("./pages/MainApp"));
const ActivityApp = lazy(() => import("./pages/ActivityApp"));
const AssessmentPage = lazy(() => import("./pages/AssessmentPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const LessonViewer = lazy(() => import("./pages/LessonViewer"));

const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  const location = useLocation();

  useEffect(() => {
    // FIX: Only trigger background sync if the user is authenticated and NOT on auth pages.
    // This prevents the sync manager from firing with a null token and triggering a logout interceptor.
    const user = localStorage.getItem("user") || sessionStorage.getItem("user");
    const isAuthPage = location.pathname === '/signin' || location.pathname === '/signup';
    
    if (user && !isAuthPage) {
      startBackgroundSync();
    }
  }, [location.pathname]);

  return (
    <PyodideProvider>
      <OfflineIndicator />
      <Suspense fallback={<div style={{ padding: "20px", color: "white", textAlign: "center", marginTop: "50px" }}>Loading application...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/learning-path" element={<ProtectedRoute><LearningPath /></ProtectedRoute>} />
          <Route path="/learning-path/:moduleId/:lessonId" element={<ProtectedRoute><LessonViewer /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/app" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
          <Route path="/workspace" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute><UserHomePage /></ProtectedRoute>} />
          <Route path="/activity/:moduleId/:activityId" element={<ProtectedRoute><ActivityApp /></ProtectedRoute>} />
          <Route path="/assessment/:moduleId/:type" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </PyodideProvider>
  );
}

export default App;