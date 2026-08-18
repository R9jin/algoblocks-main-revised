// frontend/src/pages/SignUp.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import PolicyConsent from "../components/PolicyConsent";
import { getErrorMessage } from "../utils/apiError";
import { decodeJwtPayload } from "../utils/auth";
import "../styles/Auth.css";

// SECURITY: signup is Google-OAuth-only now (see api/services/auth_service.py
// AuthService.signup_with_google). This page never lets the user type their
// own email -- "Continue with Google" is the only way in. The Google
// credential (a JWT) is decoded HERE purely so the email can be shown to the
// user, read-only, before they finish the form; that decoded value is never
// what actually gets trusted. The raw credential itself is sent to the
// backend on submit, and the backend independently re-verifies it with
// Google and uses ONLY the email Google returns -- there is no email field
// on the signup request at all, so the frontend has no way to substitute a
// different address even if it wanted to.
export default function SignUp() {
  // Set once "Continue with Google" succeeds. Until then, the page only
  // shows the Google button -- no username/password form yet.
  const [googleToken, setGoogleToken] = useState(null);
  const [googleEmail, setGoogleEmail] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const navigate = useNavigate();

  const rawApiUrl = import.meta.env.VITE_API_URL || "";
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Mirrors the same guard in SignIn.jsx: if the user navigates away (e.g.
  // clicks "Sign in") before this request resolves, this component unmounts
  // but the in-flight request keeps running. Without this check, its
  // eventual response would write a stale session into storage on top of
  // whatever the user has since signed into.
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

  // Step 1: "Continue with Google" -- authenticate with Google, then reveal
  // the completion form with the verified email pre-filled and locked.
  // No account is created yet; that only happens once the form below is
  // submitted with a username and password.
  const handleGoogleSuccess = (credentialResponse) => {
    if (!agreedToPolicies) {
      showToast("Please agree to the Privacy Policy and Terms and Conditions to continue.");
      return;
    }

    const credential = credentialResponse?.credential;
    if (!credential) {
      showToast("Google Sign-Up sequence interrupted.");
      return;
    }

    // Display-only decode -- see the file-level comment above. The backend
    // never sees or trusts this decoded value; it only ever sees the raw
    // `credential` string, which it re-verifies itself.
    const payload = decodeJwtPayload(credential);
    const email = payload?.email;

    if (!email) {
      showToast("Couldn't read an email address from your Google account. Please try again.");
      return;
    }

    setGoogleToken(credential);
    setGoogleEmail(email);
  };

  // Step 2: submit the completion form (username + password) to actually
  // create the account. The email is never sent here -- there's no field
  // for it on the request at all; the backend derives it by independently
  // re-verifying googleToken with Google itself.
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

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_token: googleToken,
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        showToast(getErrorMessage(data, "Registration failed"));
        setIsLoading(false);
        return;
      }

      // Account is created and verified immediately -- log the user
      // straight in, same pattern as every other auth flow in the app.
      localStorage.removeItem("authToken");
      sessionStorage.removeItem("authToken");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");

      sessionStorage.setItem("authToken", data.token);
      sessionStorage.setItem("token", data.token);

      sessionStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: data.isAdmin === true || data.is_admin === true,
        progress: data.progress || {},
        assessments: data.assessments || {},
        onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} }
      }));

      window.dispatchEvent(new Event("localDataSynced"));

      navigate("/dashboard");
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleUseDifferentAccount = () => {
    setGoogleToken(null);
    setGoogleEmail("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className={`custom-toast ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <h2>Sign Up for AlgoBlocks</h2>

          {!googleToken ? (
            // Stage 1: nothing to fill in yet -- Google is the only way to
            // start a signup, so this is just the consent gate + button.
            <div className="signup-google-start">
              <p className="auth-instruction" style={{ textAlign: "center", color: "#59636e", fontSize: "0.95rem", margin: 0 }}>
                Sign up with your Google account. We'll use the email Google
                gives us, already verified -- no separate verification email
                needed.
              </p>

              <PolicyConsent
                checked={agreedToPolicies}
                onChange={setAgreedToPolicies}
                disabled={isLoading}
                id="signup-policy-consent"
              />

              <div
                className="google-auth-wrapper"
                style={!agreedToPolicies ? { opacity: 0.5, pointerEvents: "none" } : undefined}
                title={!agreedToPolicies ? "Agree to the Privacy Policy and Terms and Conditions first" : undefined}
              >
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => showToast("Google Sign-Up sequence interrupted.")}
                  theme="outline"
                  size="large"
                  shape="rectangular"
                  text="signup_with"
                />
              </div>
              {!agreedToPolicies && (
                <p className="policy-consent-hint">
                  Check the box above to enable sign-up.
                </p>
              )}
            </div>
          ) : (
            // Stage 2: Google authentication succeeded -- finish the account
            // with a username and password. Email is read-only and comes
            // straight from Google.
            <form onSubmit={handleSubmit}>
              <button
                type="button"
                className="signup-switch-account"
                onClick={handleUseDifferentAccount}
                disabled={isLoading}
              >
                Use a different Google account
              </button>

              <div className="form-group">
                <label>Email</label>
                <div className="auth-input-wrap">
                  <FiMail className="auth-input-icon" aria-hidden="true" />
                  <input
                    type="email"
                    value={googleEmail}
                    readOnly
                    disabled
                    aria-readonly="true"
                  />
                </div>
                <span className="google-verified-badge">
                  <FiCheckCircle aria-hidden="true" />
                  Verified via Google
                </span>
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
                    minLength={6}
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
                    minLength={6}
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

              <button type="submit" className="auth-button" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Create Account"}
              </button>
            </form>
          )}

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
    </GoogleOAuthProvider>
  );
}
