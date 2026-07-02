// frontend/src/pages/SignUp.jsx
import { useState } from "react";
import { FiAlertTriangle, FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });
  
  const navigate = useNavigate();
  const rawApiUrl = import.meta.env.VITE_API_URL || ""; 
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: "", type: "error" });
    }, 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        const activeStorage = rememberMe ? localStorage : sessionStorage;
        const inactiveStorage = rememberMe ? sessionStorage : localStorage;
        
        inactiveStorage.removeItem("authToken");
        inactiveStorage.removeItem("token");
        inactiveStorage.removeItem("user");

        // BUG-06 Fix: Mirror both authToken and token keys
        activeStorage.setItem("authToken", data.token);
        activeStorage.setItem("token", data.token);
        
        // BUG-08 Fix: Initialize complete user schema
        activeStorage.setItem("user", JSON.stringify({ 
          email: data.email, 
          name: data.name,
          progress: {},
          assessments: {}
        }));

        navigate("/home");
      } else {
        let errorMessage = "Sign up failed. Please try again.";
        if (typeof data.detail === "string") {
            errorMessage = data.detail;
        } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map(err => err.msg).join(" | ");
        }
        
        showToast(errorMessage);
      }
    } catch (error) {
      console.error("Error connecting to server:", error);
      showToast("Failed to connect to the server.");
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
      localStorage.removeItem("token");
      sessionStorage.removeItem("authToken");
      sessionStorage.removeItem("token");

      const guestToken = `guest_token_${Date.now()}`;
      sessionStorage.setItem("authToken", guestToken);
      sessionStorage.setItem("token", guestToken);

      sessionStorage.setItem("user", JSON.stringify({
          email: `guest_${Date.now()}@algoblocks.local`,
          name: "Guest User",
          isGuest: true,
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

  return (
    <>
      <div className={`custom-toast ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>

      <div className="auth-container">
        <div className="auth-card">
          
          <div className="auth-research-banner">
            <div className="banner-icon-wrapper">
              <FiAlertTriangle size={18} />
            </div>
            <div className="banner-text">
              <strong>Participant Protocol</strong>
              <p>
                By creating an account, you agree to participate in an educational system evaluation. 
                <b> Please do not create multiple accounts.</b> Your learning data, assessments, and code executions are monitored strictly for research integrity.
              </p>
            </div>
          </div>

          <h2>Create Account</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <div className="auth-input-wrap">
                <FiUser className="auth-input-icon" aria-hidden="true" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
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
                {/* BUG-11 Fix: Enforce HTML5 minLength={6} */}
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
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
              <label htmlFor="rememberMe" style={{ cursor: "pointer", fontSize: "0.9rem", color: "#ccc", margin: 0 }}>
                Stay signed in
              </label>
            </div>
            
            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? "Signing Up..." : "Sign Up"}
            </button>

            <div style={{ textAlign: "center", margin: "15px 0", color: "#888", fontSize: "0.9rem" }}>
              <span>— OR —</span>
            </div>
            <button 
              type="button" 
              className="auth-button" 
              onClick={handleGuestLogin} 
              disabled={isLoading}
              style={{ backgroundColor: "#6c757d", border: "none" }}
            >
              {isLoading ? "Preparing..." : "Continue as Guest"}
            </button>

          </form>

          <div className="auth-links">
            <p>Already have an account?<Link to="/signin">Sign in</Link></p>
          </div>
        </div>
      </div>
    </>
  );
}