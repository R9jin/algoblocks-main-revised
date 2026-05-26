// frontend/src/pages/SignIn.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

// Helper to rebuild user.assessments array safely on login, scoped by email.
const rebuildAssessments = (email) => {
  const assessments = {};
  for (let i = 0; i < localStorage.length; i++) {
     const key = localStorage.key(i);
     if (!key) continue;
     let suffix = null;
     
     if (key.startsWith(`algoblocks_result_${email}_`)) {
         suffix = key.replace(`algoblocks_result_${email}_`, "");
     } else if (key.startsWith(`algoblocks_result_`) && key.split('_').length === 4) {
         // Gracefully ingest old unscoped keys
         suffix = key.replace(`algoblocks_result_`, "");
     }
     
     if (suffix) {
         try {
             assessments[`${suffix}_assessment`] = JSON.parse(localStorage.getItem(key));
         } catch(e) {}
     }
  }
  return assessments;
};

export default function SignIn() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [isLoading, setIsLoading] = useState(false); 
  const navigate = useNavigate(); 

  const API_BASE = import.meta.env.VITE_API_URL || ""; 
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; 

  // Hydrate local IndexedDB from MongoDB Cloud after wiping
  const syncUserCloudData = async (userEmail) => {
    try {
      // ✅ Completely wipe activity tracks when swapping accounts
      await Promise.all([
        projectsDB.clear(),
        templatesDB.clear(),
        syncQueueDB.clear(),
        submissionsDB.clear(),
        progressDB.clear()
      ]); 

      const [projRes, tempRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects`),
        fetch(`${API_BASE}/api/templates`)
      ]); 

      if (projRes.ok) {
        const projData = await projRes.json();
        if (projData.status === 'success') {
          for (let p of projData.projects) {
            if (p.owner_id === userEmail) {
              await projectsDB.setItem(p._id, { ...p, synced: true });
            }
          }
        }
      } 

      if (tempRes.ok) {
        const tempData = await tempRes.json();
        if (tempData.status === 'success') {
          for (let t of tempData.templates) {
            if (t.owner_id === userEmail) {
              await templatesDB.setItem(t._id, { ...t, synced: true });
            }
          }
        }
      } 
    } catch (error) {
      console.warn("Could not pull data from cloud. Proceeding with local data.", error); 
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true); 

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }); 

      const data = await response.json(); 

      if (!response.ok) {
        alert(data.detail || "Invalid email or password"); 
        setIsLoading(false);
        return;
      }

      // ✅ Dynamically rebuild the assessments array so UI doesn't think progress was wiped 
      localStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        progress: data.progress || {},
        assessments: rebuildAssessments(data.email)
      })); 

      await syncUserCloudData(data.email); 

      navigate("/dashboard"); 
    } catch (error) {
      console.error(error); 
      alert("Server not reachable. Check backend connection."); 
    } finally {
      setIsLoading(false); 
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true); 
    try {
      await Promise.all([
        projectsDB.clear(),
        templatesDB.clear(),
        syncQueueDB.clear(),
        submissionsDB.clear(),
        progressDB.clear()
      ]); 
      
      const guestEmail = `guest_${Date.now()}@algoblocks.local`;

      localStorage.setItem("user", JSON.stringify({
        email: guestEmail,
        name: "Guest User",
        isGuest: true,
        progress: {},
        assessments: rebuildAssessments(guestEmail)
      })); 

      navigate("/dashboard"); 
    } catch (error) {
      console.error("Guest login failed:", error); 
    } finally {
      setIsLoading(false); 
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Google authentication failed");
        return;
      }

      // ✅ Rebuild assessment array
      localStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        progress: data.progress || {},
        assessments: rebuildAssessments(data.email)
      }));

      await syncUserCloudData(data.email);

      navigate("/dashboard");
    } catch (error) {
      console.error("Google Authentication error:", error);
      alert("Server not reachable. Check backend connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="auth-container">
        <div className="auth-card">
          <h2>Sign In to AlgoBlocks</h2>
          <form onSubmit={handleSubmit}>
            
            {/* Standard Email/Password Login */}
            <div className="form-group">
              <label>Email</label>
              <div className="auth-input-wrap">
                <FiMail className="auth-input-icon" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  disabled={isLoading}
                /> 
              </div>
            </div>
            
            <div className="form-group">
              <label>Password</label>
              <div className="auth-input-wrap">
                <FiLock className="auth-input-icon" aria-hidden="true" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                /> 
              </div>
            </div>
            
            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? "Signing In..." : "Sign In"}
            </button> 

            {/* ✅ Beautifully Styled Divider matching existing Auth.css */}
            <div className="social-divider">
              <span>OR</span>
            </div> 

            {/* ✅ Google Login Centered via Class */}
            <div className="google-auth-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.error("Google Sign-In Failure Triggered")}
                theme="outline" 
                size="large"
                shape="rectangular"
                text="signin_with"
              />
            </div>

            {/* ✅ Guest Button utilizing native Auth.css structure */}
            <button
              type="button"
              className="auth-button guest-button"
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              {isLoading ? "Preparing..." : "Continue as Guest"}
            </button> 

          </form>

          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
            <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
          </div> 
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}