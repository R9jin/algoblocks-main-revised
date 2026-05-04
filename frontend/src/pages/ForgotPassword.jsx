// frontend\src\pages\ForgotPassword.jsx
import { useState } from "react";
import { FiCheckCircle, FiMail } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../styles/Auth.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Reset password for", email);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title-with-icon">
            <FiCheckCircle aria-hidden="true" />
            Check Your Email
          </h2>
          <p>We've sent a password reset link to {email}.</p>
          <Link to="/signin" className="auth-link">Back to Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Reset Password</h2>
        <p>Enter your email address and we'll send you a link to reset your password.</p>
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
          <button type="submit" className="auth-button">Send Reset Link</button>
        </form>
        <div className="auth-links">
          <Link to="/signin">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
