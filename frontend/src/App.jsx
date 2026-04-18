import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import ActivityApp from "./pages/ActivityApp";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import LandingPage from "./pages/HomePage";
import LearningPath from "./pages/LearningPath";
import MainApp from "./pages/MainApp";
import Projects from "./pages/Projects";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import UserHomePage from "./pages/UserHomePage";
import { startBackgroundSync } from "./utils/syncManager";

// 1. Import the shared worker
import { sharedAnalyzerWorker } from "./workers/analyzerInstance";

function App() {
  useEffect(() => {
    // Start syncing data
    startBackgroundSync();
    
    // 2. Silently boot up Pyodide in the background immediately
    sharedAnalyzerWorker.postMessage({ type: 'INIT_ENGINE' });
    
  }, []);

  return (
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
  );
}

export default App;