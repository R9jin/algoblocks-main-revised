// frontend/src/pages/SignIn.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignIn() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [isLoading, setIsLoading] = useState(false); 
  const [rememberMe, setRememberMe] = useState(false);
  
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });
  
  const navigate = useNavigate(); 

  const rawApiUrl = import.meta.env.VITE_API_URL || ""; 
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; 

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: "", type: "error" });
    }, 4000);
  };

  const syncUserCloudData = async (userEmail, token) => {
    try {
      await Promise.all([
        projectsDB.clear(),
        templatesDB.clear(),
        syncQueueDB.clear()
      ]); 

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      const [projRes, tempRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects`, { headers }),
        fetch(`${API_BASE}/api/templates`, { headers })
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

      if (!response.ok || data.status !== "success") {
        showToast(data.detail || "Invalid email or password"); 
        setIsLoading(false);
        return;
      }

      const activeStorage = rememberMe ? localStorage : sessionStorage;
      const inactiveStorage = rememberMe ? sessionStorage : localStorage;
      
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("user");

      // FIXED: Adjusted to map the restored backend top-level dictionary
      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        progress: data.progress || {}
      })); 

      await syncUserCloudData(data.email, data.token); 
      navigate("/dashboard"); 
      
    } catch (error) {
      console.error(error); 
      showToast("Server not reachable. Check backend connection."); 
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
        syncQueueDB.clear()
      ]); 

      localStorage.removeItem("authToken");
      sessionStorage.removeItem("authToken");

      sessionStorage.setItem("user", JSON.stringify({
        email: `guest_${Date.now()}@algoblocks.local`,
        name: "Guest User",
        isGuest: true,
        progress: {}
      })); 

      navigate("/dashboard"); 
    } catch (error) {
      console.error("Guest login failed:", error); 
      showToast("Failed to initialize guest session.");
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

      if (!response.ok || data.status !== "success") {
        showToast(data.detail || "Google authentication failed");
        return;
      }

      const activeStorage = rememberMe ? localStorage : sessionStorage;
      const inactiveStorage = rememberMe ? sessionStorage : localStorage;
      
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("user");

      // FIXED: Adjusted to map the restored backend top-level dictionary
      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        progress: data.progress || {}
      }));

      await syncUserCloudData(data.email, data.token);
      navigate("/dashboard");
      
    } catch (error) {
      console.error("Google Authentication error:", error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className={`custom-toast ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <h2>Sign In to AlgoBlocks</h2>
          <form onSubmit={handleSubmit}>
            
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
            
            <div style={{ display: "flex", alignItems: "center", marginBottom: "15px", gap: "8px" }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <label htmlFor="rememberMe" style={{ cursor: "pointer", fontSize: "0.9rem", color: "#ccc", margin: 0 }}>
                Stay signed in
              </label>
            </div>
            
            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? "Signing In..." : "Sign In"}
            </button> 

            <div className="social-divider">
              <span>OR</span>
            </div> 

            <div className="google-auth-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => showToast("Google Sign-In sequence interrupted.")}
                theme="outline" 
                size="large"
                shape="rectangular"
                text="signin_with"
              />
            </div>

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