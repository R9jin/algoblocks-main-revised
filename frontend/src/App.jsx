// frontend/src/App.jsx
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import OfflineIndicator from "./components/OfflineIndicator";
import { PyodideProvider } from "./context/PyodideContext";
import Dashboard from "./pages/Dashboard";
import EvaluationSuite from "./pages/EvaluationSuite";
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
    return <Navigate to="/" replace />; 
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const user = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  const location = useLocation();

  useEffect(() => {
    const user = localStorage.getItem("user") || sessionStorage.getItem("user");
    const isAuthPage = location.pathname === '/signin' || location.pathname === '/signup';
    
    if (user && !isAuthPage) {
      startBackgroundSync();
    }
  }, [location.pathname]);

  return (
    <PyodideProvider>
      {/* The singleton logic in OfflineIndicator now ensures this is the ONLY one rendered */}
      <OfflineIndicator />
      
      <Suspense fallback={<div style={{ padding: "20px", color: "white", textAlign: "center", marginTop: "50px" }}>Loading application...</div>}>
        <Routes>
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          
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
          
          <Route path="/admin/evaluation-suite" element={<EvaluationSuite />} />
        </Routes>
      </Suspense>
    </PyodideProvider>
  );
}

export default App;