// frontend/src/pages/SignUp.jsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import PolicyConsent from "../components/PolicyConsent";
import "../styles/Auth.css";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      // FIX: Changed from /api/register to /api/signup to match FastAPI router
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, 
          email, 
          password,
          role: "user",
          isAdmin: false 
        }),
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        showToast(data.detail || "Registration failed");
        setIsLoading(false);
        return;
      }

      if (data.token) {
        localStorage.removeItem("authToken");
        sessionStorage.removeItem("authToken");
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");

        sessionStorage.setItem("authToken", data.token);
        sessionStorage.setItem("token", data.token);
        
        sessionStorage.setItem("user", JSON.stringify({
          email: data.email || email,
          name: data.name || name,
          role: "user",
          isAdmin: false,
          progress: {},
          assessments: {},
          onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} }
        }));
        
        window.dispatchEvent(new Event("localDataSynced"));

        navigate("/dashboard");
      } else {
        showToast("Registration successful! Redirecting to login...", "success");
        setTimeout(() => {
          if (isMountedRef.current) navigate("/signin");
        }, 2000);
      }
      
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      showToast("Server not reachable. Check backend connection.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (!agreedToPolicies) {
      showToast("Please agree to the Privacy Policy and Terms and Conditions to continue.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token: credentialResponse.credential,
          role: "user", 
          isAdmin: false 
        }),
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (!response.ok || data.status !== "success") {
        showToast(data.detail || "Google Registration failed");
        return;
      }

      sessionStorage.removeItem("authToken");
      localStorage.removeItem("authToken");
      sessionStorage.removeItem("token");
      localStorage.removeItem("token");

      sessionStorage.setItem("authToken", data.token);
      sessionStorage.setItem("token", data.token);
      
      sessionStorage.setItem("user", JSON.stringify({
        email: data.email,
        name: data.name,
        role: data.role || "user",
        isAdmin: data.isAdmin === true || data.is_admin === true || data.role === "admin" || data.role === "Admin",
        progress: data.progress || {},
        assessments: data.assessments || {},
        onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} }
      }));

      window.dispatchEvent(new Event("localDataSynced"));

      navigate("/dashboard");
      
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("Google Authentication error:", error);
      showToast("Server not reachable. Check backend connection.");
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
          <h2>Sign Up for AlgoBlocks</h2>
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
                  disabled={isLoading}
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

            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? "Creating Account..." : "Sign Up"}
            </button> 

            <div className="social-divider">
              <span>OR</span>
            </div> 

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
    </GoogleOAuthProvider>
  );
}