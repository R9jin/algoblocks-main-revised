// frontend/src/components/LogoutConfirmModal.jsx
import { createPortal } from "react-dom";
import "../styles/LogoutConfirmModal.css";

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick }) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onLogoutClick) {
      onLogoutClick();
    } else {
      // Fallback if no specific logout function is passed
      localStorage.clear();
      sessionStorage.clear();
      
      // HARD REDIRECT to landing page immediately
      window.location.replace("/");
    }
  };

  return createPortal(
    <div className="logout-modal-overlay">
      <div className="logout-modal-content">
        <h3 className="logout-modal-title">Sign Out</h3>
        <p className="logout-modal-text">
          Are you sure you want to sign out of AlgoBlocks?
        </p>
        <div className="logout-modal-actions">
          <button onClick={onClose} className="logout-btn-cancel">
            Cancel
          </button>
          <button onClick={handleConfirm} className="logout-btn-confirm">
            Sign Out
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}