// frontend/src/pages/SignIn.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { getErrorMessage } from "../utils/apiError";
import { clearLocalUserData, projectsDB, syncQueueDB, templatesDB } from "../db";
import "../styles/Auth.css";

export default function SignIn() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false); 
  const [rememberMe, setRememberMe] = useState(true);
  
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent
  
  const navigate = useNavigate(); 

  const rawApiUrl = import.meta.env.VITE_API_URL || ""; 
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; 

  // Guards against a rapid Sign In -> navigate-away-to-Sign-Up race: without
  // this, a login request that's still in flight when the user clicks away
  // keeps running after this component unmounts, and later resolves by
  // writing the OLD account's data into storage/IndexedDB on top of the
  // brand new session the user just created elsewhere. Every storage write
  // and navigate() below is gated on this still being true.
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

  // Wraps fetch with a hard timeout so a slow/hanging backend (cold start,
  // stalled request, etc.) can never freeze the UI indefinitely -- the
  // fetch rejects on its own after `timeoutMs` instead of leaving the
  // caller's await stuck forever.
  const fetchWithTimeout = (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  };

  // Guards the background sync below against a race where the user has
  // already signed out or signed into a *different* account in this tab
  // by the time the cloud fetch resolves -- checked against localStorage
  // directly (not isMountedRef) since this now runs after this component
  // has already navigated away and unmounted.
  const isStillCurrentSession = (token) => {
    const current = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    return current === token;
  };

  // BUG FIX: this used to be awaited before navigate() ran, so the sign-in
  // page sat on "Signing In..." for as long as these two extra requests
  // took -- and if either one hung (slow backend, cold start), the page
  // looked completely frozen even though the login itself had already
  // succeeded. Cloud sync is no longer on the critical path to /dashboard
  // or /home: it's kicked off in the background right after navigation,
  // guarded by isStillCurrentSession() instead of component-mount state.
  const syncUserCloudData = async (userEmail, token) => {
    try {
      // BUG FIX: this already cleared projects/templates/syncQueue on every
      // login (so a previous account's projects don't bleed into this one)
      // but left progress/assessments/submissions untouched -- exactly the
      // learning-path data that was leaking across accounts/guest sessions
      // on a shared browser. clearLocalUserData() clears all of it; the
      // freshly-authenticated user's own progress/assessments get pulled
      // back in by syncDownFromServer() right after login.
      await clearLocalUserData();
      if (!isStillCurrentSession(token)) return;

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      const [projRes, tempRes] = await Promise.all([
        fetchWithTimeout(`${API_BASE}/api/projects`, { headers }),
        fetchWithTimeout(`${API_BASE}/api/templates`, { headers })
      ]);

      if (!isStillCurrentSession(token)) return;

      if (projRes.ok) {
        const projData = await projRes.json();
        const projects = Array.isArray(projData.projects) ? projData.projects : (Array.isArray(projData) ? projData : []);
        for (let p of projects) {
          if (p.owner_id === userEmail || p.userId === userEmail) {
            await projectsDB.save({ ...p, projectId: p.projectId || p._id, isSynced: true });
          }
        }
      } 

      if (tempRes.ok) {
        const tempData = await tempRes.json();
        const templates = Array.isArray(tempData.templates) ? tempData.templates : (Array.isArray(tempData) ? tempData : []);
        for (let t of templates) {
          if (t.owner_id === userEmail || t.userId === userEmail) {
            await templatesDB.save({ ...t, templateId: t.templateId || t._id, isSynced: true });
          }
        }
      } 
      // Data landed after the fact (dashboard/home already mounted from
      // navigate() below) -- let anything reading projectsDB/templatesDB
      // know there's fresh data to pick up.
      window.dispatchEvent(new Event("localDataSynced"));
    } catch (error) {
      console.warn("Could not pull data from cloud. Proceeding with local data.", error); 
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true); 
    setShowResendVerification(false);
    setResendState("idle");

    try {
      const response = await fetchWithTimeout(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }); 

      const data = await response.json(); 

      // The user navigated away (e.g. clicked "Sign up") before this
      // request resolved — do not let this stale response overwrite
      // whatever session now lives in storage.
      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        const message = getErrorMessage(data, "Invalid email or password");
        showToast(message);
        // Backend returns 403 with a message mentioning "verify" for
        // unverified accounts (see AuthService.login) -- surface a resend
        // action instead of leaving the user stuck with no path forward.
        if (response.status === 403 && /verify/i.test(message)) {
          setShowResendVerification(true);
        }
        setIsLoading(false);
        return;
      }

      const activeStorage = rememberMe ? localStorage : sessionStorage;
      const inactiveStorage = rememberMe ? sessionStorage : localStorage;
      
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("token");
      inactiveStorage.removeItem("user");

      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("token", data.token);

      const isAdminAccount = data.isAdmin === true || data.is_admin === true || data.role === "admin" || data.role === "Admin";

      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: isAdminAccount,
        progress: data.progress || {},
        assessments: data.assessments || {},
        onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} }
      })); 

      // OnboardingContext (and a few other pages) only re-read storage on
      // mount or on this event — without it, navigating to /dashboard here
      // is a client-side transition, so OnboardingContext keeps whatever
      // stale state it had *before* this login and re-shows the dashboard
      // tour even though the account we just logged into already finished
      // it server-side.
      window.dispatchEvent(new Event("localDataSynced"));

      // BUG FIX: this always sent every account to /dashboard. Regular
      // students have a dedicated home base at /home (UserHomePage) --
      // /dashboard is meant to be reached from there. Admin accounts have
      // no /home (it's a StudentOnlyRoute) so they still land on /dashboard
      // directly.
      //
      // BUG FIX: navigation used to wait on syncUserCloudData (two more
      // network requests) before firing. If either one was slow or hung,
      // the whole sign-in page appeared to freeze even though the user was
      // already successfully authenticated. Storage has everything a
      // freshly-loaded /home or /dashboard needs, so navigate right away
      // and let cloud sync finish in the background.
      navigate(isAdminAccount ? "/dashboard" : "/home");
      syncUserCloudData(data.email, data.token);

    } catch (error) {
      if (!isMountedRef.current) return;
      if (error?.name === "AbortError") {
        showToast("Sign in is taking too long. Please check your connection and try again.");
      } else {
        console.error(error);
        showToast("Server not reachable. Check backend connection.");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false); 
    }
  };

  const handleResendVerification = async () => {
    setResendState("sending");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/api/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // BUG FIX: this used to ignore the response entirely and always show
      // "Verification email sent", even when the request failed outright
      // (429 rate limit from the 3/minute limiter, a 422 from a malformed
      // email, a 500, etc). That made it look like an email was on its way
      // when nothing was actually sent. The backend's generic-response
      // privacy pattern (same body whether or not the account exists/is
      // already verified) only applies to a successful 200 -- a non-2xx
      // status is a real failure and should be surfaced as one.
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (isMountedRef.current) {
          setResendState("idle");
          const message = response.status === 429
            ? "Too many requests -- please wait a bit before trying again."
            : getErrorMessage(data, "Couldn't send the verification email. Please try again.");
          showToast(message);
        }
        return;
      }

      if (isMountedRef.current) {
        setResendState("sent");
        showToast("If that account exists and isn't verified, a new link has been sent.", "success");
      }
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        setResendState("idle");
        if (error?.name === "AbortError") {
          showToast("Request is taking too long. Please try again.");
        } else {
          showToast("Server not reachable. Check backend connection.");
        }
      }
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true); 
    try {
      // BUG FIX: previously only cleared projects/templates/syncQueue,
      // leaving progress/assessments/submissions from the last logged-in
      // account cached locally -- that's exactly the learning-path data
      // that was leaking into guest sessions. clearLocalUserData() wipes
      // every user-scoped local store so guests always start from zero.
      await clearLocalUserData();

      if (!isMountedRef.current) return;

      localStorage.removeItem("authToken");
      sessionStorage.removeItem("authToken");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");

      sessionStorage.setItem("user", JSON.stringify({
        email: `guest_${Date.now()}@algoblocks.local`,
        name: "Guest User",
        isGuest: true,
        role: "guest",
        isAdmin: false,
        progress: {},
        assessments: {},
        onboarding_state: { tourSeen: true, completedAt: new Date().toISOString(), pages: {} }
      })); 

      window.dispatchEvent(new Event("localDataSynced"));

      navigate("/dashboard"); 
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("Guest login failed:", error); 
      showToast("Failed to initialize guest session.");
    } finally {
      if (isMountedRef.current) setIsLoading(false); 
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        showToast(getErrorMessage(data, "Google authentication failed"));
        return;
      }

      const activeStorage = rememberMe ? localStorage : sessionStorage;
      const inactiveStorage = rememberMe ? sessionStorage : localStorage;
      
      inactiveStorage.removeItem("authToken");
      inactiveStorage.removeItem("token");
      inactiveStorage.removeItem("user");

      activeStorage.setItem("authToken", data.token);
      activeStorage.setItem("token", data.token);

      const isAdminAccount = data.isAdmin === true || data.is_admin === true || data.role === "admin" || data.role === "Admin";

      activeStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: isAdminAccount,
        progress: data.progress || {},
        assessments: data.assessments || {},
        onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} }
      }));

      window.dispatchEvent(new Event("localDataSynced"));

      // Same regular-student-vs-admin destination fix as the email/password flow,
      // and same "don't block navigation on cloud sync" fix -- see handleSubmit.
      navigate(isAdminAccount ? "/dashboard" : "/home");
      syncUserCloudData(data.email, data.token);

    } catch (error) {
      if (!isMountedRef.current) return;
      if (error?.name === "AbortError") {
        showToast("Google sign-in is taking too long. Please try again.");
      } else {
        console.error("Google Authentication error:", error);
        showToast("Server not reachable. Check backend connection.");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className={`custom-toast ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>

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
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
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
            
            <div style={{ display: "flex", alignItems: "center", marginBottom: "15px", gap: "8px" }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <label htmlFor="rememberMe" style={{ cursor: "pointer", fontSize: "0.9rem", color: "#30363d", margin: 0 }}>
                Stay signed in
              </label>
            </div>
            
            <button type="submit" className="auth-button" disabled={isLoading}>
              <span className="auth-button-content">
                {isLoading && <span className="auth-spinner" aria-hidden="true" />}
                {isLoading ? "Signing In..." : "Sign In"}
              </span>
            </button> 

            {showResendVerification && (
              <p style={{ textAlign: "center", fontSize: "0.9rem", color: "#cbd5e1", marginTop: "12px" }}>
                {resendState === "sent" ? (
                  "Verification email sent — check your inbox."
                ) : (
                  <>
                    Didn't get the email?{" "}
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendState === "sending" || !email}
                      style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}
                    >
                      {resendState === "sending" ? "Sending..." : "Resend verification link"}
                    </button>
                  </>
                )}
              </p>
            )}

            <div className="social-divider">
              <span>OR</span>
            </div> 

            <div className="google-auth-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => showToast("Google Sign-In sequence interrupted.")}
                theme="outline" 
                size="large"
                shape="pill"
                width="360"
                text="signin_with"
              />
            </div>

            <button
              type="button"
              className="auth-button guest-button"
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              <span className="auth-button-content">
                {isLoading && <span className="auth-spinner" aria-hidden="true" />}
                {isLoading ? "Preparing..." : "Continue as Guest"}
              </span>
            </button> 

          </form>

          <div className="auth-links">
            {isLoading ? (
              <span className="auth-link-disabled" aria-disabled="true" title="Please wait for sign in to finish">Forgot password?</span>
            ) : (
              <Link to="/forgot-password">Forgot password?</Link>
            )}
            <p>
              Don't have an account?{" "}
              {isLoading ? (
                <span className="auth-link-disabled" aria-disabled="true" title="Please wait for sign in to finish">Sign up</span>
              ) : (
                <Link to="/signup">Sign up</Link>
              )}
            </p>
          </div> 
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}