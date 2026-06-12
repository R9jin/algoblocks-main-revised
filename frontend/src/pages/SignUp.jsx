// frontend/src/pages/SignUp.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { FiAlertTriangle, FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Auth.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function SignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", email: "", password: "", confirmPassword: "" });
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
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.name, email: formData.email, password: formData.password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Sign up failed");

      // Auto login after successful signup
      const loginRes = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        const userObj = { email: formData.email, name: formData.name };
        saveAuthSession(loginData.access_token, userObj);
        window.location.href = "/dashboard";
      } else {
        navigate("/signin");
      }

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
      if (!res.ok) throw new Error(data.detail || "Google signup failed");

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
            <strong>Participant Protocol</strong>
            <p>
              By creating an account, you agree to participate in an educational system evaluation. 
              <b> Please do not create multiple accounts.</b> Your learning data, assessments, and code executions are monitored strictly for research integrity.
            </p>
          </div>
        </div>

        <div className="auth-header">
          <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks" className="auth-logo" />
          <h2>Create Account</h2>
          <p>Join the study and master algorithms visually.</p>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Full Name</label>
            <div className="input-wrapper">
              <FiUser className="input-icon" />
              <input type="text" name="name" placeholder="John Doe" value={formData.name} onChange={handleChange} required />
            </div>
          </div>

          <div className="input-group">
            <label>Email Address</label>
            <div className="input-wrapper">
              <FiMail className="input-icon" />
              <input type="email" name="email" placeholder="you@student.edu" value={formData.email} onChange={handleChange} required />
            </div>
          </div>

          <div className="input-group split-group">
            <div style={{ flex: 1 }}>
              <label>Password</label>
              <div className="input-wrapper">
                <FiLock className="input-icon" />
                <input type="password" name="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label>Confirm</label>
              <div className="input-wrapper">
                <FiLock className="input-icon" />
                <input type="password" name="confirmPassword" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "-5px" }}>
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

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Registering..." : "Sign Up"}
          </button>
        </form>

        <div className="auth-divider"><span>OR</span></div>

        <div className="google-auth-wrapper">
          <GoogleOAuthProvider clientId={CLIENT_ID}>
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError("Google Registration Failed")} theme="filled_blue" size="large" width="100%" text="signup_with" />
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
          Already have an account? <Link to="/signin">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}