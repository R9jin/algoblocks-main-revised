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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

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
        
        // FIX: Store as BOTH "token" and "authToken" to satisfy all route guards
        localStorage.setItem("token", loginData.access_token);
        localStorage.setItem("authToken", loginData.access_token);
        sessionStorage.setItem("token", loginData.access_token);
        sessionStorage.setItem("authToken", loginData.access_token);
        localStorage.setItem("user", JSON.stringify({ email: formData.email, name: formData.name }));
        
        navigate("/dashboard");
      } else {
        navigate("/signin");
      }

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
      if (!res.ok) throw new Error(data.detail || "Google signup failed");

      // FIX: Synchronize tokens
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

        <p className="auth-redirect">
          Already have an account? <Link to="/signin">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}