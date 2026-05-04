// frontend\src\App.jsx
import { lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
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

// 1. Import the new indicator
import OfflineIndicator from "./components/OfflineIndicator";


function App() {
  useEffect(() => {
    // Start syncing data
    startBackgroundSync();

    // Silently boot up Pyodide in the background immediately
    sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });

  }, []);

  const MainApp = lazy(() => import("./pages/MainApp"));
  const ActivityApp = lazy(() => import("./pages/ActivityApp"));

  return (
    <>
      {/* 2. Place the indicator outside the Routes */}
      <OfflineIndicator />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/learning-path" element={<LearningPath />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/app" element={<MainApp />} />
        <Route path="/home" element={<UserHomePage />} />
        <Route path="/activity" element={<ActivityApp />} />
      </Routes>
    </>
  );
}

export default App;