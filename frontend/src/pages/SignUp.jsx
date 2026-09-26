// frontend/src/pages/SignUp.jsx
import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiEye, FiEyeOff, FiLock, FiMail, FiUser, FiCheck, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import PolicyConsent from "../components/PolicyConsent";
import { getErrorMessage } from "../utils/apiError";
import { PASSWORD_REQUIREMENTS, getPasswordPolicyError } from "../utils/passwordPolicy";
import { SUPPORT_EMAIL } from "../utils/constants";
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
  // Whether the backend actually managed to send the verification email
  // (see api/services/auth_service.py signup_with_email -> emailSent).
  // The account is created either way, so this only changes which
  // instructions we show -- it never blocks the person from proceeding.
  const [emailSent, setEmailSent] = useState(true);
  // Resend cooldown so someone can't hammer the endpoint by mashing the
  // button (the backend also rate-limits this at 3/minute, this is just
  // the friendlier client-side version of the same protection).
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent
  const [resendCooldown, setResendCooldown] = useState(0);
  // Lets someone fix a typo'd address on the confirmation screen instead of
  // silently resending to the wrong inbox forever (resend is intentionally
  // enumeration-safe, so a bad email would otherwise fail with no signal).
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState("");

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

  // Countdown so the "Resend" button re-enables itself without needing the
  // person to refresh the page.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendState === "sending" || resendCooldown > 0) return;
    setResendState("sending");
    try {
      const response = await fetch(`${API_BASE}/api/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!isMountedRef.current) return;

      if (!response.ok) {
        // Most likely the 3/minute rate limit -- treat it the same as a
        // successful send from the user's perspective (don't leak details),
        // just start the cooldown so they know to wait.
        showToast(getErrorMessage(data, "Please wait a moment before trying again."));
        setResendCooldown(30);
        setResendState("idle");
        return;
      }

      setResendState("sent");
      setResendCooldown(30);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
      setResendState("idle");
    }
  };

  const startEditingEmail = () => {
    setEditedEmail(email);
    setIsEditingEmail(true);
  };

  const cancelEditingEmail = () => {
    setIsEditingEmail(false);
  };

  const saveEditedEmail = () => {
    const trimmed = editedEmail.trim();
    // Cheap client-side sanity check -- the backend still validates for
    // real (EmailStr on ResendVerificationRequest). This just avoids an
    // obviously-broken value going out and resets the resend cooldown so
    // switching to the correct address doesn't get stuck behind a
    // cooldown that was really for the old, wrong one.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      showToast("Enter a valid email address");
      return;
    }
    setEmail(trimmed);
    setIsEditingEmail(false);
    setResendState("idle");
    setResendCooldown(0);
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
      // instead of logging the user in. emailSent tells us whether to show
      // the normal instructions or the "we couldn't send it" fallback.
      setEmailSent(data.emailSent !== false);
      setSubmitted(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const emailDisplayBlock = isEditingEmail ? (
    <div style={{ marginBottom: "16px", maxWidth: "320px", marginLeft: "auto", marginRight: "auto" }}>
      <div className="auth-input-wrap">
        <FiMail className="auth-input-icon" aria-hidden="true" />
        <input
          type="email"
          value={editedEmail}
          onChange={(e) => setEditedEmail(e.target.value)}
          placeholder="Enter your email address"
          autoFocus
        />
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "8px", justifyContent: "center" }}>
        <button type="button" className="auth-button" style={{ maxWidth: "140px" }} onClick={saveEditedEmail}>
          Save
        </button>
        <button
          type="button"
          className="auth-button"
          style={{ maxWidth: "140px", background: "transparent", border: "1px solid #475569" }}
          onClick={cancelEditingEmail}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "8px", color: "#94a3b8", fontSize: "0.85rem" }}>
      Typo'd your email?{" "}
      <button
        type="button"
        onClick={startEditingEmail}
        style={{ background: "none", border: "none", padding: 0, color: "#818cf8", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
      >
        Fix it here
      </button>
      {" "}before resending.
    </p>
  );

  if (submitted) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          {emailSent ? (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiCheckCircle className="auth-icon" size={32} style={{ color: "#4ade80", marginBottom: "8px" }} />
                <h2>Check your email to finish signing up</h2>
              </div>
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "12px", color: "#cbd5e1", fontSize: "0.95rem" }}>
                Your account has been created, but it isn't active yet. We've sent
                a verification link to <strong>{email}</strong> — open that email
                and click the link to activate your account. You won't be able to
                sign in until you do.
              </p>
              {emailDisplayBlock}
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#94a3b8", fontSize: "0.85rem" }}>
                Don't see it within a few minutes? Check your spam/junk folder,
                then use the button below to send a new link. Still stuck?{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>Email an administrator</a>.
              </p>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <button
                  type="button"
                  className="auth-button"
                  onClick={handleResend}
                  disabled={resendState === "sending" || resendCooldown > 0 || isEditingEmail}
                  style={{ maxWidth: "260px" }}
                >
                  {resendState === "sending"
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend link (${resendCooldown}s)`
                    : resendState === "sent"
                    ? "Resend link again"
                    : "Resend verification email"}
                </button>
                {resendState === "sent" && resendCooldown > 0 && (
                  <p className="auth-instruction" style={{ marginTop: "10px", color: "#4ade80", fontSize: "0.85rem" }}>
                    If <strong>{email}</strong> needs verifying, a new link is on its way.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
                <FiMail className="auth-icon" size={32} style={{ color: "#facc15", marginBottom: "8px" }} />
                <h2>Account created — but we couldn't send your email</h2>
              </div>
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "12px", color: "#cbd5e1", fontSize: "0.95rem" }}>
                Your account for <strong>{email}</strong> was created, but the
                verification email failed to send. Your account can't be
                activated without it.
              </p>
              {emailDisplayBlock}
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "12px", color: "#94a3b8", fontSize: "0.85rem" }}>
                You can try sending it again, or email an administrator at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and
                mention your account needs to be verified manually.
              </p>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <button
                  type="button"
                  className="auth-button"
                  onClick={handleResend}
                  disabled={resendState === "sending" || resendCooldown > 0 || isEditingEmail}
                  style={{ maxWidth: "260px" }}
                >
                  {resendState === "sending"
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend link (${resendCooldown}s)`
                    : "Try sending again"}
                </button>
              </div>
            </>
          )}
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
