// frontend/src/App.jsx
import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import OfflineIndicator from "./components/OfflineIndicator";
import ActivityApp from "./pages/ActivityApp";
import AssessmentPage from "./pages/AssessmentPage";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import LandingPage from "./pages/HomePage";
import LearningPath from "./pages/LearningPath";
import LessonViewer from "./pages/LessonViewer";
import MainApp from "./pages/MainApp";
import ProfilePage from "./pages/ProfilePage";
import Projects from "./pages/Projects";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import UserHomePage from "./pages/UserHomePage";

import "./App.css";
import { startBackgroundSync } from "./utils/syncManager";

// Check if user is authenticated
const PrivateRoute = ({ children }) => {
  const user = localStorage.getItem("user") || sessionStorage.getItem("user");
  // ✅ Redirect to landing page ("/") instead of "/signin"
  return user ? children : <Navigate to="/" />;
};

function App() {
  useEffect(() => {
    // Start the background sync worker for offline capabilities
    startBackgroundSync();

    // ✅ Clear session storage on refresh/unload 
    // This logs the user out on refresh IF they didn't check "Stay Signed In" (localStorage)
    const handleUnload = () => {
      sessionStorage.removeItem("user");
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  return (
    <>
      <OfflineIndicator />
      <Suspense fallback={<div className="loading-spinner">Loading AlgoBlocks...</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Protected Dashboard/App Routes */}
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/home" element={<PrivateRoute><UserHomePage /></PrivateRoute>} />
          <Route path="/learning-path" element={<PrivateRoute><LearningPath /></PrivateRoute>} />
          <Route path="/learning-path/:moduleId/:lessonId" element={<PrivateRoute><LessonViewer /></PrivateRoute>} />
          <Route path="/projects" element={<PrivateRoute><Projects /></PrivateRoute>} />
          <Route path="/workspace" element={<PrivateRoute><MainApp /></PrivateRoute>} />
          <Route path="/workspace/:projectId" element={<PrivateRoute><MainApp /></PrivateRoute>} />
          <Route path="/activity/:moduleId/:activityId" element={<PrivateRoute><ActivityApp /></PrivateRoute>} />
          <Route path="/assessment/:moduleId/:type" element={<PrivateRoute><AssessmentPage /></PrivateRoute>} />
          
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;