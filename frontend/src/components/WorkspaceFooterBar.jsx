// frontend/src/components/WorkspaceFooterBar.jsx
import { FiActivity, FiBookOpen, FiTerminal } from "react-icons/fi";

export default function WorkspaceFooterBar({
  openPanelIds,
  onTogglePanel,
  onOpenBigOModal,
  children
}) {
  const isOpen = (id) => (openPanelIds instanceof Set ? openPanelIds.has(id) : Array.isArray(openPanelIds) && openPanelIds.includes(id));

  return (
    <footer className="workspace-footer">
      <div className="footer-left">
        <button className={`footer-tab ${isOpen("console") ? "active" : ""}`} onClick={() => onTogglePanel("console")} title={isOpen("console") ? "Close console panel" : "Open console panel"}>
          <FiTerminal size={16} /> Console
        </button>
        <button className={`footer-tab ${isOpen("complexity") ? "active" : ""}`} onClick={() => onTogglePanel("complexity")} title={isOpen("complexity") ? "Close complexity panel" : "Open complexity panel"}>
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