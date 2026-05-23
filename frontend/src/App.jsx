import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import OfflineIndicator from "./components/OfflineIndicator";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import LandingPage from "./pages/HomePage";
import LearningPath from "./pages/LearningPath";
import LessonViewer from "./pages/LessonViewer";
import Projects from "./pages/Projects";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import UserHomePage from "./pages/UserHomePage";

import { startBackgroundSync } from "./utils/syncManager";
import { sharedAnalyzerWorker } from "./workers/analyzerInstance";

// Protected Route wrapper to kick unauthenticated users to sign-in
const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem("user");
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

// Lazy load heavy workspace/activity pages
const MainApp = lazy(() => import("./pages/MainApp"));
const ActivityApp = lazy(() => import("./pages/ActivityApp"));

function App() {
  useEffect(() => {
    startBackgroundSync();
    // Pre-warm the python analyzer worker
    sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });
  }, []);

  return (
    <>
      <OfflineIndicator />
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#5b5675' }}>Loading AlgoBlocks...</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Protected Routes */}
          <Route path="/home" element={<ProtectedRoute><UserHomePage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          
          {/* Learning Path & Curriculum Routes */}
          <Route path="/learning-path" element={<ProtectedRoute><LearningPath /></ProtectedRoute>} />
          <Route path="/learning-path/:moduleId/:lessonId" element={<ProtectedRoute><LessonViewer /></ProtectedRoute>} />
          <Route path="/activity/:moduleId/:activityId" element={<ProtectedRoute><ActivityApp /></ProtectedRoute>} />
          
          {/* Main IDE / Workspace */}
          <Route path="/workspace" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;