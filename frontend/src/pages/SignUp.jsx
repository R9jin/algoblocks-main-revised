import { useState } from "react";
import { FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Auth.css";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  // ADD THIS LINE
  const API_BASE = import.meta.env.VITE_API_URL || "";

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // FIX THE FETCH URL
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Send the name, email, and password states collected from the form
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        const data = await response.json();

        // Save database user to localStorage
        localStorage.setItem("user", JSON.stringify({ email: data.email, name: data.name }));

        // Navigate to /home instead of /dashboard for a consistent entry point
        navigate("/home");
      } else {
        // Handle errors like "Email already registered"
        const errorData = await response.json();
        alert(errorData.detail || "Sign up failed. Please try again.");
      }
    } catch (error) {
      console.error("Error connecting to server:", error);
      alert("Failed to connect to the server.");
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
          <button type="submit" className="auth-button">Sign Up</button>
        </form>

        <div className="auth-links">
          <p>Already have an account?<Link to="/signin">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}