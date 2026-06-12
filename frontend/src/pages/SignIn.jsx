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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

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

      // FIX: Store as BOTH "token" and "authToken" to satisfy all route guards and API calls
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("authToken", data.access_token);
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("authToken", data.access_token);
      localStorage.setItem("user", JSON.stringify({ email: formData.email, name: formData.email.split("@")[0] }));

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google login failed");

      // FIX: Synchronize tokens here as well
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("authToken", data.access_token);
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("authToken", data.access_token);
      localStorage.setItem("user", JSON.stringify({ email: data.email, name: data.name }));

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
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

          <div className="auth-actions">
            <Link to="/forgot-password" className="forgot-password-link">Forgot password?</Link>
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

        <p className="auth-redirect">
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>
    </div>
  );
}