// frontend/src/pages/ResetPassword.jsx
import { useEffect, useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiEye, FiEyeOff, FiLock, FiXCircle, FiCheck, FiX } from "react-icons/fi";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "../utils/apiError";
import { PASSWORD_REQUIREMENTS, getPasswordPolicyError } from "../utils/passwordPolicy";
import "../styles/Auth.css";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [tokenStatus, setTokenStatus] = useState("checking"); // checking | valid | invalid
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const rawApiUrl = import.meta.env.VITE_API_URL || "";
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: "", type: "error" });
    }, 4000);
  };

  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/verify-reset-token?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        setTokenStatus(data.valid ? "valid" : "invalid");
      } catch (error) {
        console.error(error);
        setTokenStatus("invalid");
      }
    };

    verifyToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      showToast(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(getErrorMessage(data, "Could not reset your password. The link may have expired."));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate("/signin"), 2500);
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
          {tokenStatus === "checking" && (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiLock className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
                <h2>Checking your link...</h2>
              </div>
            </>
          )}

          {tokenStatus === "invalid" && (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiXCircle className="auth-icon" size={32} style={{ color: "#f87171", marginBottom: "8px" }} />
                <h2>Link expired or invalid</h2>
              </div>
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
                This password reset link is no longer valid. Please request a new one.
              </p>
              <div className="auth-links" style={{ textAlign: "center" }}>
                <Link to="/forgot-password" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  Request a new link
                </Link>
              </div>
            </>
          )}

          {tokenStatus === "valid" && !success && (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiLock className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
                <h2>Set a new password</h2>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>New Password</label>
                  <div className="auth-input-wrap">
                    <FiLock className="auth-input-icon" aria-hidden="true" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter a new password"
                      required
                      minLength={8}
                      disabled={isLoading}
                      className="password-input"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      disabled={isLoading}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <ul className="password-requirements-list" aria-live="polite">
                      {PASSWORD_REQUIREMENTS.map((req) => {
                        const met = req.test(password);
                        return (
                          <li key={req.key} className={met ? "met" : "unmet"}>
                            {met ? <FiCheck aria-hidden="true" /> : <FiX aria-hidden="true" />}
                            {req.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div className="auth-input-wrap">
                    <FiLock className="auth-input-icon" aria-hidden="true" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      required
                      minLength={8}
                      disabled={isLoading}
                      className="password-input"
                    />
                  </div>
                </div>

                <button type="submit" className="auth-button" disabled={isLoading}>
                  {isLoading ? "Resetting..." : "Reset Password"}
                </button>
              </form>

              <div className="auth-links" style={{ textAlign: "center" }}>
                <Link to="/signin" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <FiArrowLeft size={16} /> Back to Sign In
                </Link>
              </div>
            </>
          )}

          {success && (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiCheckCircle className="auth-icon" size={32} style={{ color: "#4ade80", marginBottom: "8px" }} />
                <h2>Password reset!</h2>
              </div>
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
                Your password has been updated. Redirecting you to sign in...
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
