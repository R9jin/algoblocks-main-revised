// frontend/src/components/PolicyConsent.jsx
//
// Reusable consent checkbox for account creation. Used on SignUp.jsx (for
// the main form) and on SignIn.jsx (for its Google button only -- see the
// comment there: Google sign-in silently creates a new account on first
// use, so it needs the same gate, not just SignUp's form).
import { useState } from "react";
import PolicyModal from "./PolicyModal";
import "../styles/PolicyModal.css";

export default function PolicyConsent({ checked, onChange, disabled, id = "policy-consent" }) {
  const [openModal, setOpenModal] = useState(null); // "privacy" | "terms" | null

  return (
    <div className="policy-consent-row">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="policy-consent-checkbox"
        required
      />
      <label htmlFor={id} className="policy-consent-label">
        I agree to the{" "}
        <button
          type="button"
          className="policy-consent-link"
          onClick={(e) => { e.preventDefault(); setOpenModal("privacy"); }}
        >
          Privacy Policy
        </button>{" "}
        and{" "}
        <button
          type="button"
          className="policy-consent-link"
          onClick={(e) => { e.preventDefault(); setOpenModal("terms"); }}
        >
          Terms and Conditions
        </button>
        , and consent to the processing of my personal data in accordance with the Data Privacy Act of 2012 (RA 10173).
      </label>

      <PolicyModal isOpen={openModal === "privacy"} type="privacy" onClose={() => setOpenModal(null)} />
      <PolicyModal isOpen={openModal === "terms"} type="terms" onClose={() => setOpenModal(null)} />
    </div>
  );
}
