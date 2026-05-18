// frontend/src/pages/SignIn.jsx
import { useState } from "react";
import { FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_URL || "";
  // Fetch the Client ID securely from the environment
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Hydrate local IndexedDB from MongoDB Cloud after wiping
  const syncUserCloudData = async (userEmail) => {
    try {
      // 1. Wipe previous offline data to ensure a clean slate
      await Promise.all([
        projectsDB.clear(),
        templatesDB.clear(),
        syncQueueDB.clear()
      ]);

      // 2. Fetch user's data from MongoDB
      const [projRes, tempRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects`),
        fetch(`${API_BASE}/api/templates`)
      ]);

      // 3. Populate Local Projects DB
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

      // 4. Populate Local Templates DB
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

      // 1. Save user session locally
      localStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
      }));

      // 2. Hydrate local IndexedDB databases with Cloud state
      await syncUserCloudData(data.email);

      // 3. Proceed to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Server not reachable. Check backend connection.");
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
        email: `guest_${Date.now()}@algoblocks.local`, // unique local email
        name: "Guest User",
        isGuest: true
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
          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? "Signing In..." : "Sign In"}
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
          <Link to="/forgot-password">Forgot password?</Link>
          <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}