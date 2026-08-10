// frontend/src/components/LogoutConfirmModal.jsx
import "../styles/LogoutConfirmModal.css";

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick, isLoggingOut = false }) {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay">
      <div className="logout-modal">
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
