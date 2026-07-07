// frontend/src/pages/ForgotPassword.jsx
import { FiAlertCircle, FiArrowLeft, FiLock } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../styles/Auth.css";

export default function ForgotPassword() {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header" style={{ textAlign: "center", marginBottom: "16px" }}>
          <FiLock className="auth-icon" size={32} style={{ color: "#818cf8", marginBottom: "8px" }} />
          <h2>Credential Reset Notice</h2>
        </div>
        
        {/* BUG-04 Fix: Replaced deceptive email reset with thesis study instructions */}
        <div className="notice-banner" style={{ display: "flex", gap: "12px", padding: "16px", background: "#332e49", border: "1px solid #6366f1", borderRadius: "8px", margin: "20px 0", color: "#e0e7ff" }}>
          <FiAlertCircle size={24} style={{ flexShrink: 0, color: "#818cf8" }} />
          <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5" }}>
            AlgoBlocks operates under active academic thesis research protocols. Automated email credential resets are disabled to preserve participant identity tracking.
          </p>
        </div>

        <p className="auth-instruction" style={{ textAlign: "center", marginBottom: "24px", color: "#cbd5e1", fontSize: "0.95rem" }}>
          Please contact your research facilitator or lab supervisor directly to request a manual credential reset.
        </p>

        <div className="auth-links" style={{ textAlign: "center" }}>
          <Link to="/signin" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <FiArrowLeft size={16} /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}