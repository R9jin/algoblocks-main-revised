// frontend/src/pages/SignUp.jsx
import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiEye, FiEyeOff, FiLock, FiMail, FiUser, FiCheck, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import PolicyConsent from "../components/PolicyConsent";
import { getErrorMessage } from "../utils/apiError";
import { PASSWORD_REQUIREMENTS, getPasswordPolicyError } from "../utils/passwordPolicy";
import "../styles/Auth.css";

// Classic email/password signup. The account is created unverified and a
// verification link is emailed to the address entered here (see
// api/services/auth_service.py AuthService.signup_with_email). The person
// must click that link before they can sign in -- see VerifyEmail.jsx and
// the is_verified gate in AuthService.login.
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const rawApiUrl = import.meta.env.VITE_API_URL || "";
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;

  // If the user navigates away before the request resolves, don't write
  // stale state afterward.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: "", type: "error" });
    }, 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!agreedToPolicies) {
      showToast("Please agree to the Privacy Policy and Terms and Conditions to continue.");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match");
      return;
    }

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      showToast(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        showToast(getErrorMessage(data, "Registration failed"));
        setIsLoading(false);
        return;
      }

      // Account is created but NOT verified yet -- no session token comes
      // back from /api/signup. Show a "check your email" confirmation
      // instead of logging the user in.
      setSubmitted(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
            <FiCheckCircle className="auth-icon" size={32} style={{ color: "#4ade80", marginBottom: "8px" }} />
            <h2>Check your email</h2>
          </div>
          <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
            We've sent a verification link to <strong>{email}</strong>. Click the link
            to activate your account, then sign in.
          </p>
          <div className="auth-links" style={{ textAlign: "center" }}>
            <Link to="/signin">Back to Sign In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`custom-toast ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <h2>Sign Up for AlgoBlocks</h2>

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
              <label>Username</label>
              <div className="auth-input-wrap">
                <FiUser className="auth-input-icon" aria-hidden="true" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  minLength={3}
                  maxLength={50}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="auth-input-wrap">
                <FiLock className="auth-input-icon" aria-hidden="true" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
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
              <label>Confirm Password</label>
              <div className="auth-input-wrap">
                <FiLock className="auth-input-icon" aria-hidden="true" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  minLength={8}
                  disabled={isLoading}
                  className="password-input"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                >
                  {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <PolicyConsent
              checked={agreedToPolicies}
              onChange={setAgreedToPolicies}
              disabled={isLoading}
              id="signup-policy-consent"
            />

            <button type="submit" className="auth-button" disabled={isLoading || !agreedToPolicies}>
              {isLoading ? "Creating Account..." : "Create Account"}
            </button>
            {!agreedToPolicies && (
              <p className="policy-consent-hint">
                Check the box above to enable sign-up.
              </p>
            )}
          </form>

          <div className="auth-links">
            <p>
              Already have an account?{" "}
              {isLoading ? (
                <span className="auth-link-disabled" aria-disabled="true" title="Please wait for sign up to finish">Sign in</span>
              ) : (
                <Link to="/signin">Sign in</Link>
              )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
