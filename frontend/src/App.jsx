// frontend/src/App.jsx
import { lazy, Suspense, useEffect } from "react";
// IMPORT Navigate alongside Route and Routes
import { Navigate, Route, Routes } from "react-router-dom";
import OfflineIndicator from "./components/OfflineIndicator";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import LandingPage from "./pages/HomePage";
import LearningPath from "./pages/LearningPath";
import Projects from "./pages/Projects";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import UserHomePage from "./pages/UserHomePage";
import { startBackgroundSync } from "./utils/syncManager";
import { sharedAnalyzerWorker } from "./workers/analyzerInstance";

// --- NEW: Create a ProtectedRoute component ---
// This checks if the user is in localStorage. If not, it kicks them to /signin.
const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem("user");
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  useEffect(() => {
    startBackgroundSync();
    sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });
  }, []);

  const MainApp = lazy(() => import("./pages/MainApp"));
  const ActivityApp = lazy(() => import("./pages/ActivityApp"));

  return (
    <>
      <OfflineIndicator />

      {/* FIXED: Added Suspense boundary for lazy-loaded components */}
      <Suspense fallback={<div style={{ padding: "20px", color: "white", textAlign: "center", marginTop: "50px" }}>Loading application...</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* --- NEW: Wrap private routes with ProtectedRoute --- */}
          <Route
            path="/dashboard"
            element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
          />
          <Route
            path="/learning-path"
            element={<ProtectedRoute><LearningPath /></ProtectedRoute>}
          />
          <Route
            path="/projects"
            element={<ProtectedRoute><Projects /></ProtectedRoute>}
          />
          <Route
            path="/app"
            element={<ProtectedRoute><MainApp /></ProtectedRoute>}
          />
          <Route
            path="/home"
            element={<ProtectedRoute><UserHomePage /></ProtectedRoute>}
          />
          <Route
            path="/activity/:moduleId/:activityId"
            element={<ProtectedRoute><ActivityApp /></ProtectedRoute>}
          />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;