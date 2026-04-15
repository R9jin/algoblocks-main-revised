import { useState } from "react";
import { FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../db";
import "../styles/Auth.css";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_URL || "";

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Invalid email or password");
        return;
      }

      // 1. Save user session
      localStorage.setItem("user", JSON.stringify({
          email: data.email,
          name: data.name,
      }));

      // 2. DUMP CURRENT PROJECTS (Wipe previous user's offline data)
      await db.projects.clear();

      // 3. FETCH NEW USER'S PROJECTS (Download from MongoDB)
      await pullProjectsFromCloud(data.email);

      // 4. Proceed to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Server not reachable. Check backend connection.");
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
              />
            </div>
          </div>
          <button type="submit" className="auth-button">Sign In</button>
        </form>

        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <p>Don't have an account?<Link to="/signup">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}