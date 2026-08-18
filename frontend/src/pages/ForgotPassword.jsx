// frontend/src/pages/ForgotPassword.jsx
import { useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiLock, FiMail } from "react-icons/fi";
import { Link } from "react-router-dom";
import { getErrorMessage } from "../utils/apiError";
import "../styles/Auth.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

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
      const response = await fetch(`${API_BASE}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // The backend always returns a generic success message here, whether or
      // not the email is registered, so we never reveal account existence.
      if (response.ok) {
        setSubmitted(true);
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(getErrorMessage(data, "Something went wrong. Please try again."));
      }
    } catch (error) {
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={`custom-toast ${toast.type} ${toast.visible ? "visible" : ""}`}>
        {toast.message}
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
            {submitted ? (
              <FiCheckCircle className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
            ) : (
              <FiLock className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
            )}
            <h2>{submitted ? "Request received" : "Forgot your password?"}</h2>
          </div>

          {submitted ? (
            <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
              If an account exists for <strong>{email}</strong>, an admin has been notified and will
              review your request. Once approved, you'll be given a link to reset your password.
            </p>
          ) : (
            <>
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
                Enter the email address associated with your account. An admin will review your
                request and grant you access to reset your password.
              </p>

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

                <button type="submit" className="auth-button" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Request Password Reset"}
                </button>
              </form>
            </>
          )}

          <div className="auth-links" style={{ textAlign: "center" }}>
            <Link to="/signin" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <FiArrowLeft size={16} /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
