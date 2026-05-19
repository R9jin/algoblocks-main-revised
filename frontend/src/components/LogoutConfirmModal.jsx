// frontend/src/components/LogoutConfirmModal.jsx
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "../styles/LogoutConfirmModal.css"; // Import the clean CSS

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleConfirm = () => {
    onClose();
    
    if (onLogoutClick) {
      onLogoutClick();
    } else {
      localStorage.removeItem("user");
      sessionStorage.clear();
      navigate("/signin", { replace: true }); // Secure redirect
    }
  };

  // createPortal forces the modal to render outside the parent's HTML structure
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