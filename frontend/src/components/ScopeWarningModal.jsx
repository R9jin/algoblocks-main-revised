/*frontend\src\components\ScopeWarningModal.jsx*/
import useMountTransition from "../hooks/useMountTransition";
import "../styles/ConfirmModal.css";
import "../styles/ScopeWarningModal.css";

// severity -> { label, className } for the small pill shown next to each module
const SEVERITY_META = {
  unsupported: { label: "Unsupported", className: "scope-pill scope-pill-unsupported" },
  partial: { label: "Partial", className: "scope-pill scope-pill-partial" },
  collision: { label: "Miscosted", className: "scope-pill scope-pill-collision" },
};

const ScopeWarningModal = ({
  isOpen,
  warnings = [],
  onProceed,
  onCancel,
  title = "Some libraries here aren't fully supported",
  proceedText = "Proceed anyway",
  cancelText = "Cancel",
  hideCancel = false,
}) => {
  const shouldRender = useMountTransition(isOpen, 220);
  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isOpen ? "" : "is-closing"}`}>
      <div className={`custom-modal-content scope-warning-modal ${isOpen ? "" : "is-closing"}`}>
        <div className="custom-modal-header">
          <h3>{title}</h3>
        </div>
        <div className="custom-modal-body">
          <p>
            The complexity analyzer doesn't have cost rules for everything below.
            Where it doesn't, it silently assumes O(1) instead of flagging the
            call as unknown -- so the Big-O badge you see afterward may be wrong
            for the lines that use these.
          </p>
          <ul className="scope-warning-list">
            {warnings.map((w, i) => {
              const meta = SEVERITY_META[w.severity] || SEVERITY_META.unsupported;
              return (
                <li key={`${w.module}-${i}`} className="scope-warning-item">
                  <div className="scope-warning-item-head">
                    <span className={meta.className}>{meta.label}</span>
                    <code className="scope-warning-module">{w.module}</code>
                  </div>
                  <p className="scope-warning-message">{w.message}</p>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="custom-modal-footer">
          {!hideCancel && (
            <button className="btn-modal btn-modal-cancel" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button className="btn-modal btn-modal-confirm" onClick={onProceed}>
            {proceedText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScopeWarningModal;
