// frontend/src/pages/SignIn.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { FiAlertTriangle, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignIn() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [showPassword, setShowPassword] = useState(false);
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
      
      // FIX: Wipe BOTH key variations from the inactive storage to prevent leakage
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("token");
      inactiveStorage.removeItem("user");

      // FIX: Save BOTH key variations to active storage so ALL pages pass auth checks
      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("token", data.token);
      
      // Save full user object including admin status
      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: data.isAdmin === true || data.is_admin === true || data.role === "admin" || data.role === "Admin",
        progress: data.progress || {},
        assessments: data.assessments || {}
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

      // FIX: Wipe ALL token keys
      localStorage.removeItem("authToken");
      sessionStorage.removeItem("authToken");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");

      sessionStorage.setItem("user", JSON.stringify({
        email: `guest_${Date.now()}@algoblocks.local`,
        name: "Guest User",
        isGuest: true,
        role: "guest",
        isAdmin: false,
        progress: {},
        assessments: {}
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
      
      // FIX: Wipe BOTH key variations from inactive storage
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("token");
      inactiveStorage.removeItem("user");

      // FIX: Save BOTH key variations so ALL pages pass auth checks
      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("token", data.token);
      
      // Save full user object including admin status
      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: data.isAdmin === true || data.is_admin === true || data.role === "admin" || data.role === "Admin",
        progress: data.progress || {},
        assessments: data.assessments || {}
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

          {/* ACADEMIC RESEARCH NOTICE */}
          <div className="auth-research-banner">
            <div className="banner-icon-wrapper">
              <FiAlertTriangle size={18} />
            </div>
            <div className="banner-text">
              <strong>Academic Research Notice</strong>
              <p>
                To ensure data validity for this thesis, please use <b>strictly one account</b> throughout your evaluation. 
                Progress, assessments, and learning analytics are being actively monitored and recorded to a single ID.
              </p>
            </div>
          </div>

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
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                  className="password-input"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
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
              <label htmlFor="rememberMe" style={{ cursor: "pointer", fontSize: "0.9rem", color: "#30363d", margin: 0 }}>
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
                shape="pill"
                width="360"
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
