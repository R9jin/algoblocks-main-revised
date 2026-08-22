// frontend/src/pages/VerifyEmail.jsx
import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiMail, FiXCircle } from "react-icons/fi";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "../utils/apiError";
import { SUPPORT_EMAIL } from "../utils/constants";
import "../styles/Auth.css";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [status, setStatus] = useState("checking"); // checking | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent
  const [resendCooldown, setResendCooldown] = useState(0);

  const rawApiUrl = import.meta.env.VITE_API_URL || "";
  const API_BASE = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;

  // Same unmount guard used on SignIn/SignUp -- if the user navigates away
  // before the request resolves, don't write a stale session afterward.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("This verification link is missing its token.");
      return;
    }

    const verify = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!isMountedRef.current) return;

        if (!response.ok || data.status !== "success") {
          setStatus("error");
          setErrorMessage(getErrorMessage(data, "This verification link is invalid or has expired."));
          return;
        }

        // Verifying logs the user in immediately (same pattern as
        // reset-password), so persist the session the same way SignIn does.
        sessionStorage.setItem("authToken", data.token);
        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem(
          "user",
          JSON.stringify({
            email: data.email,
            name: data.name,
            role: data.role || "user",
            isAdmin: data.isAdmin === true,
            progress: data.progress || {},
            assessments: data.assessments || {},
            onboarding_state: data.onboarding_state || { tourSeen: false, completedAt: null, pages: {} },
          })
        );

        window.dispatchEvent(new Event("localDataSynced"));
        setStatus("success");

        setTimeout(() => {
          if (isMountedRef.current) navigate("/dashboard");
        }, 2000);
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error(error);
        setStatus("error");
        setErrorMessage("Server not reachable. Check backend connection.");
      }
    };

    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (resendState === "sending" || resendCooldown > 0 || !resendEmail) return;
    setResendState("sending");
    try {
      const response = await fetch(`${API_BASE}/api/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      if (!isMountedRef.current) return;
      // Backend gives an enumeration-safe generic response either way, so
      // treat any non-error reply as "sent" from the user's perspective.
      setResendState(response.ok ? "sent" : "idle");
      setResendCooldown(30);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error(error);
      setResendState("idle");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {status === "checking" && (
          <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
            <FiMail className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
            <h2>Verifying your email...</h2>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
              <FiCheckCircle className="auth-icon" size={32} style={{ color: "#4ade80", marginBottom: "8px" }} />
              <h2>Email verified!</h2>
            </div>
            <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
              You're all set. Redirecting you to your dashboard...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
              <FiXCircle className="auth-icon" size={32} style={{ color: "#f87171", marginBottom: "8px" }} />
              <h2>Verification failed</h2>
            </div>
            <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "20px", color: "#cbd5e1", fontSize: "0.95rem" }}>
              {errorMessage}
            </p>

            {resendState === "sent" ? (
              <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "20px", color: "#4ade80", fontSize: "0.9rem" }}>
                If that account needs verifying, a new link is on its way --
                check your inbox.
              </p>
            ) : (
              <form onSubmit={handleResend} style={{ marginBottom: "20px" }}>
                <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "10px", color: "#94a3b8", fontSize: "0.85rem" }}>
                  Links expire after 24 hours. Enter your email to get a new one:
                </p>
                <div className="form-group">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    disabled={resendState === "sending"}
                  />
                </div>
                <button
                  type="submit"
                  className="auth-button"
                  disabled={resendState === "sending" || resendCooldown > 0}
                >
                  {resendState === "sending"
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend link (${resendCooldown}s)`
                    : "Resend verification email"}
                </button>
              </form>
            )}

            <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#94a3b8", fontSize: "0.85rem" }}>
              Still stuck? <a href={`mailto:${SUPPORT_EMAIL}`}>Email an administrator</a>.
            </p>

            <div className="auth-links" style={{ textAlign: "center" }}>
              <Link to="/signin">Back to Sign In</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
