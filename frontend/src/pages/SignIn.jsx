// frontend/src/pages/SignIn.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { FiAlertTriangle, FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Auth.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function SignIn() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const saveAuthSession = (token, userObj) => {
    if (rememberMe) {
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("user", JSON.stringify(userObj));
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("authToken");
      sessionStorage.removeItem("user");
    } else {
      sessionStorage.setItem("token", token);
      sessionStorage.setItem("authToken", token);
      sessionStorage.setItem("user", JSON.stringify(userObj));
      localStorage.removeItem("token");
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
    }
  };

  const handleGuestLogin = () => {
    setLoading(true);
    const guestId = `guest_${Math.floor(Math.random() * 1000000)}`;
    const guestUser = {
      _id: guestId,
      name: "Guest Explorer",
      email: `${guestId}@guest.local`,
      isGuest: true,
      progress: {},
      assessments: {}
    };
    const guestToken = `guest_token_${Date.now()}`;
    
    // Guest always uses localStorage to persist across refreshes reliably
    localStorage.setItem("user", JSON.stringify(guestUser));
    localStorage.setItem("token", guestToken);
    localStorage.setItem("authToken", guestToken);
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("authToken");
    
    // Hard redirect to clear React Router cache
    window.location.href = "/dashboard";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      const userObj = { email: formData.email, name: formData.email.split("@")[0] };
      saveAuthSession(data.access_token, userObj);

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google login failed");

      const userObj = { email: data.email, name: data.name };
      saveAuthSession(data.access_token, userObj);

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
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

        <div className="auth-header">
          <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks" className="auth-logo" />
          <h2>Welcome Back</h2>
          <p>Sign in to continue your algorithmic journey.</p>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Email Address</label>
            <div className="input-wrapper">
              <FiMail className="input-icon" />
              <input type="email" name="email" placeholder="you@student.edu" value={formData.email} onChange={handleChange} required />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="input-wrapper">
              <FiLock className="input-icon" />
              <input type="password" name="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "-5px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input 
                type="checkbox" 
                id="rememberMe" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
                style={{ cursor: "pointer", width: "15px", height: "15px", accentColor: "var(--auth-purple)" }}
              />
              <label htmlFor="rememberMe" style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--auth-text-muted)", fontWeight: "600", margin: 0 }}>
                Stay signed in
              </label>
            </div>
            <Link to="/forgot-password" style={{ color: "var(--auth-purple)", fontSize: "0.85rem", fontWeight: "600", textDecoration: "none" }}>Forgot password?</Link>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <div className="auth-divider"><span>OR</span></div>

        <div className="google-auth-wrapper">
          <GoogleOAuthProvider clientId={CLIENT_ID}>
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError("Google Login Failed")} theme="filled_blue" size="large" width="100%" text="signin_with" />
          </GoogleOAuthProvider>
        </div>

        <button 
          type="button" 
          className="auth-submit-btn" 
          onClick={handleGuestLogin} 
          disabled={loading}
          style={{ backgroundColor: "var(--auth-border)", color: "var(--auth-text-main)", width: "100%", marginTop: "15px", boxShadow: "none" }}
        >
          {loading ? "Preparing..." : "Continue as Guest"}
        </button>

        <p className="auth-redirect" style={{ marginTop: "20px" }}>
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>
    </div>
  );
}