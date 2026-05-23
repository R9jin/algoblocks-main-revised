// frontend\src\pages\SignUp.jsx
import { useState } from "react";
import { FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_URL || "";

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

      if (response.ok) {
        const data = await response.json();

        // Save database user to localStorage
        localStorage.setItem("user", JSON.stringify({ email: data.email, name: data.name }));

        // Navigate to /home instead of /dashboard for a consistent entry point
        navigate("/home");
      } else {
        const errorData = await response.json();
        alert(errorData.detail || "Sign up failed. Please try again.");
      }
    } catch (error) {
      console.error("Error connecting to server:", error);
      alert("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW: Guest Login Handler ---
  const handleGuestLogin = async () => {
    setIsLoading(true);
    try {
      // 1. Wipe previous offline data to give the guest a clean slate
      await Promise.all([
        projectsDB.clear(), 
        templatesDB.clear(), 
        syncQueueDB.clear()
      ]);

      // 2. Set a mock guest user session locally
      localStorage.setItem("user", JSON.stringify({
          email: `guest_${Date.now()}@algoblocks.local`,
          name: "Guest User",
          isGuest: true,
          progress: data.progress || {}
      }));

      // 3. Proceed directly to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error("Guest login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
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
            {isLoading ? "Signing Up..." : "Sign Up"}
          </button>

          {/* --- NEW: Guest Login Button --- */}
          <div style={{ textAlign: "center", margin: "15px 0", color: "#888", fontSize: "0.9rem" }}>
            <span>— OR —</span>
          </div>
          <button 
            type="button" 
            className="auth-button" 
            onClick={handleGuestLogin} 
            disabled={isLoading}
            style={{ backgroundColor: "#6c757d", border: "none" }} // Distinct color for guest
          >
            {isLoading ? "Preparing..." : "Continue as Guest"}
          </button>

        </form>

        <div className="auth-links">
          <p>Already have an account?<Link to="/signin">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}