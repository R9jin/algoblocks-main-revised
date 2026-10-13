// frontend/src/components/FloatingErrorDropdown.jsx
import { useEffect, useRef, useState } from "react";
import { FiAlertCircle } from "react-icons/fi";

const hasLine = (err) => Number.isFinite(Number(err?.line)) && Number(err.line) > 0;

export default function FloatingErrorDropdown({ syntaxErrors = [], onJumpToLine }) {
  const [isErrorDropdownOpen, setIsErrorDropdownOpen] = useState(false);
  const [errorPanelSize, setErrorPanelSize] = useState({ width: 400, height: 250 });
  const cleanupRef = useRef(null);

  // Drop any in-flight drag listeners if the component goes away mid-resize.
  useEffect(() => () => { if (cleanupRef.current) cleanupRef.current(); }, []);

  if (!syntaxErrors || syntaxErrors.length === 0) return null;

  // Non-blocking lint warnings share this list with real errors.
  const warningCount = syntaxErrors.filter((e) => e && e.blocking === false && !e.isRuntimeCrash).length;
  const errorCount = syntaxErrors.length - warningCount;
  const total = syntaxErrors.length;
  let buttonLabel;
  if (warningCount === 0) buttonLabel = `${errorCount} Error${errorCount === 1 ? "" : "s"}`;
  else if (errorCount === 0) buttonLabel = `${warningCount} Warning${warningCount === 1 ? "" : "s"}`;
  else buttonLabel = `${errorCount} Error${errorCount === 1 ? "" : "s"}, ${warningCount} Warning${warningCount === 1 ? "" : "s"}`;

  // Pointer events cover mouse, touch and pen with one code path.
  const handleErrorResizeStart = (e, direction) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startY = e.clientY;
    const startWidth = errorPanelSize.width; const startHeight = errorPanelSize.height;

    const onMove = (moveEvent) => {
      let newWidth = startWidth; let newHeight = startHeight;
      if (direction.includes("w")) newWidth = startWidth + (startX - moveEvent.clientX);
      if (direction.includes("n")) newHeight = startHeight + (startY - moveEvent.clientY);
      setErrorPanelSize({
        width: Math.max(300, Math.min(newWidth, window.innerWidth * 0.9)),
        height: Math.max(150, Math.min(newHeight, window.innerHeight * 0.8)),
      });
    };
    const stop = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      document.body.style.cursor = "default"; document.body.style.userSelect = "auto";
      cleanupRef.current = null;
    };
    cleanupRef.current = stop;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    document.body.style.cursor = direction === "n" ? "ns-resize" : direction === "w" ? "ew-resize" : "nwse-resize";
    document.body.style.userSelect = "none";
  };

  const touchNone = { touchAction: "none" };

  return (
    <div className="floating-error-container">
      {isErrorDropdownOpen && (
        <div
          className="error-dropdown-menu"
          style={{ width: `${errorPanelSize.width}px`, height: `${errorPanelSize.height}px` }}
        >
          <div className="error-resizer-top" style={touchNone} onPointerDown={(e) => handleErrorResizeStart(e, "n")} />
          <div className="error-resizer-left" style={touchNone} onPointerDown={(e) => handleErrorResizeStart(e, "w")} />
          <div className="error-resizer-nw" style={touchNone} onPointerDown={(e) => handleErrorResizeStart(e, "nw")}>
            <FiAlertCircle color="rgba(239, 68, 68, 0.4)" />
          </div>

          <div className="error-dropdown-header">
            <strong>Detected Issues ({total})</strong>
          </div>
          <div className="error-dropdown-list">
            {syntaxErrors.map((err, idx) => {
              const jumpable = typeof onJumpToLine === "function" && hasLine(err);
              return (
                <div
                  key={idx}
                  className="error-dropdown-item"
                  role={jumpable ? "button" : undefined}
                  tabIndex={jumpable ? 0 : undefined}
                  title={jumpable ? "Jump to this line" : undefined}
                  style={jumpable ? { cursor: "pointer" } : undefined}
                  onClick={jumpable ? () => onJumpToLine(Number(err.line)) : undefined}
                  onKeyDown={jumpable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJumpToLine(Number(err.line)); } } : undefined}
                >
                  <span className="error-line-badge">{hasLine(err) ? `Line ${err.line}` : "General"}</span>
                  <div className="error-item-body">
                    <span className="error-message">{err.message}</span>
                    {err.fix && (
                      <span className="error-fix">
                        <strong>Suggested fix: </strong>{err.fix}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button
        className={`floating-error-btn ${isErrorDropdownOpen ? "open" : ""}`}
        onClick={() => setIsErrorDropdownOpen(!isErrorDropdownOpen)}
      >
        <FiAlertCircle size={18} /> {buttonLabel}
      </button>
    </div>
  );
}
