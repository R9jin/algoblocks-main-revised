// frontend/src/components/WorkspaceFooterBar.jsx
import { FiActivity, FiBookOpen, FiTerminal } from "react-icons/fi";

export default function WorkspaceFooterBar({
  bottomPanel,
  onTogglePanel,
  onOpenBigOModal,
  children
}) {
  return (
    <footer className="workspace-footer">
      <div className="footer-left">
        <button className={`footer-tab ${bottomPanel === "console" ? "active" : ""}`} onClick={() => onTogglePanel("console")}>
          <FiTerminal size={16} /> Console
        </button>
        <button className={`footer-tab ${bottomPanel === "complexity" ? "active" : ""}`} onClick={() => onTogglePanel("complexity")}>
          <FiActivity size={16} /> Complexity
        </button>
        <button className="footer-tab big-o-btn" onClick={onOpenBigOModal}>
          <FiBookOpen size={16} /> Big O Reference
        </button>
      </div>
      <div className="footer-right">
        {children}
      </div>
    </footer>
  );
}