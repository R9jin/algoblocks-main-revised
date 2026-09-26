// frontend/src/components/FloatingErrorDropdown.jsx
import { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";

export default function FloatingErrorDropdown({ syntaxErrors = [] }) {
  const [isErrorDropdownOpen, setIsErrorDropdownOpen] = useState(false);
  const [errorPanelSize, setErrorPanelSize] = useState({ width: 400, height: 250 });

  if (!syntaxErrors || syntaxErrors.length === 0) return null;

  const handleErrorResizeStart = (e, direction) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startY = e.clientY;
    const startWidth = errorPanelSize.width; const startHeight = errorPanelSize.height;

    const onMouseMove = (moveEvent) => {
      let newWidth = startWidth; let newHeight = startHeight;
      if (direction.includes('w')) newWidth = startWidth + (startX - moveEvent.clientX);
      if (direction.includes('n')) newHeight = startHeight + (startY - moveEvent.clientY);
      setErrorPanelSize({
        width: Math.max(300, Math.min(newWidth, window.innerWidth * 0.9)),
        height: Math.max(150, Math.min(newHeight, window.innerHeight * 0.8)),
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default"; document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", onMouseMove); document.addEventListener("mouseup", onMouseUp);
    if (direction === 'n') document.body.style.cursor = 'ns-resize';
    else if (direction === 'w') document.body.style.cursor = 'ew-resize';
    else document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = "none";
  };

  return (
    <div className="floating-error-container">
      {isErrorDropdownOpen && (
        <div
          className="error-dropdown-menu"
          style={{ width: `${errorPanelSize.width}px`, height: `${errorPanelSize.height}px` }}
        >
          <div className="error-resizer-top" onMouseDown={(e) => handleErrorResizeStart(e, 'n')} />
          <div className="error-resizer-left" onMouseDown={(e) => handleErrorResizeStart(e, 'w')} />
          <div className="error-resizer-nw" onMouseDown={(e) => handleErrorResizeStart(e, 'nw')}>
            <FiAlertCircle color="rgba(239, 68, 68, 0.4)" />
          </div>

          <div className="error-dropdown-header">
            <strong>Detected Issues ({syntaxErrors.length})</strong>
          </div>
          <div className="error-dropdown-list">
            {syntaxErrors.map((err, idx) => (
              <div key={idx} className="error-dropdown-item">
                <span className="error-line-badge">Line {err.line}</span>
                <div className="error-item-body">
                  <span className="error-message">{err.message}</span>
                  {err.fix && (
                    <span className="error-fix">
                      <strong>Suggested fix: </strong>{err.fix}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        className={`floating-error-btn ${isErrorDropdownOpen ? "open" : ""}`}
        onClick={() => setIsErrorDropdownOpen(!isErrorDropdownOpen)}
      >
        <FiAlertCircle size={18} /> {syntaxErrors.length} Error{syntaxErrors.length > 1 ? "s" : ""}
      </button>
    </div>
  );
}