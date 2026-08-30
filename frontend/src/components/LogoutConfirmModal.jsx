// frontend/src/components/LogoutConfirmModal.jsx
import useMountTransition from "../hooks/useMountTransition";
import "../styles/LogoutConfirmModal.css";

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick, isLoggingOut = false }) {
  const shouldRender = useMountTransition(isOpen, 220);
  if (!shouldRender) return null;

  return (
    <div className={`logout-modal-overlay ${isOpen ? "" : "is-closing"}`}>
      <div className={`logout-modal ${isOpen ? "" : "is-closing"}`}>
        <h2>Logout Confirmation</h2>
        <p>Are you sure you want to sign out of AlgoBlocks?</p>
        <div className="logout-modal-actions">
          <button
            className="logout-btn"
            onClick={onLogoutClick}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <>
                <span className="logout-btn-spinner" aria-hidden="true" />
                Signing out...
              </>
            ) : (
              "Confirm"
            )}
          </button>
          <button
            className="logout-btn logout-btn-cancel"
            onClick={onClose}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
