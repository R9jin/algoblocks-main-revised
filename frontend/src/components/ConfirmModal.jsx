// frontend/src/components/ConfirmModal.jsx
import '../styles/ConfirmModal.css';

const ConfirmModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  isDanger = false 
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="custom-modal-content">
        <div className="custom-modal-header">
          <h3>{title}</h3>
        </div>
        <div className="custom-modal-body">
          <p>{message}</p>
        </div>
        <div className="custom-modal-footer">
          <button className="btn-modal btn-modal-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={`btn-modal ${isDanger ? 'btn-modal-danger' : 'btn-modal-confirm'}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;