// frontend/src/components/WorkspaceFooterBar.jsx
import { FiActivity, FiBookOpen, FiTerminal } from "react-icons/fi";
import { LuBlocks } from "react-icons/lu";

export default function WorkspaceFooterBar({
  openPanelIds,
  onTogglePanel,
  onOpenBigOModal,
  onOpenBlockGlossary,
  children
}) {
  const isOpen = (id) => (openPanelIds instanceof Set ? openPanelIds.has(id) : Array.isArray(openPanelIds) && openPanelIds.includes(id));

  return (
    <footer className="workspace-footer">
      <div className="footer-left">
        <button className={`footer-tab ${isOpen("console") ? "active" : ""}`} onClick={() => onTogglePanel("console")} title={isOpen("console") ? "Close console panel" : "Open console panel"}>
          <FiTerminal size={16} /> <span>Console</span>
        </button>
        <button className={`footer-tab ${isOpen("complexity") ? "active" : ""}`} onClick={() => onTogglePanel("complexity")} title={isOpen("complexity") ? "Close complexity panel" : "Open complexity panel"}>
          <FiActivity size={16} /> <span>Complexity</span>
        </button>
        <button className="footer-tab big-o-btn" onClick={onOpenBigOModal} title="Big O Reference">
          <FiBookOpen size={16} /> <span>Big O Reference</span>
        </button>
        <button className="footer-tab block-glossary-btn" onClick={onOpenBlockGlossary} title="Look up what any block does, see it in action, and run a live example">
          <LuBlocks size={16} /> <span>Block Explorer</span>
        </button>
      </div>
      <div className="footer-right">
        {children}
      </div>
    </footer>
  );
}