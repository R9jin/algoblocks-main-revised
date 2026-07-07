// frontend/src/components/LogoutConfirmModal.jsx
import "../styles/LogoutConfirmModal.css";

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick }) {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay">
      <div className="logout-modal">
        <h2>Logout Confirmation</h2>
        <p>Are you sure you want to sign out of AlgoBlocks?</p>
        <div className="logout-modal-actions">
          <button className="logout-btn" onClick={onLogoutClick}>Confirm</button>
          <button className="logout-btn logout-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
