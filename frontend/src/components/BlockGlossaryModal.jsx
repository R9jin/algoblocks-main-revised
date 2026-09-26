// frontend/src/components/BlockGlossaryModal.jsx
import * as Blockly from "blockly";
import "blockly/blocks";
import { useEffect, useRef, useState } from "react";
import { BLOCK_GLOSSARY, CATEGORY_COLOURS, CATEGORY_ORDER } from "../data/blockGlossary";
import { BLOCK_EXAMPLES } from "../data/blockExamples";
import { useExampleWorker } from "../hooks/useExampleWorker.js";
import useMountTransition from "../hooks/useMountTransition";
import BlockExampleRunner from "./BlockExampleRunner.jsx";
import "../styles/BlockGlossaryModal.css";
// Importing BlocklyWorkspace guarantees every custom AlgoBlocks block type
// (customBlocks) and the shared pastelTheme are registered/available, even
// if this modal somehow mounts before the main workspace does. It also
// gives us the exact same theme object used in the real editor, so these
// previews are pixel-for-pixel what the block looks like there.
import { pastelTheme } from "./BlocklyWorkspace.jsx";

// Renders a small, read-only, non-interactive live Blockly workspace
// containing exactly one block. This is a REAL Blockly block (same
// renderer, same theme, same shape/colour/text as the editor) -- not a
// drawn approximation -- so the glossary always reflects however the
// block actually looks, even if its appearance changes later.
function BlockPreview({ type }) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let ws = null;
    try {
      ws = Blockly.inject(containerRef.current, {
        readOnly: true,
        theme: pastelTheme,
        renderer: "geras",
        trashcan: false,
        sounds: false,
        move: { scrollbars: false, drag: false, wheel: false },
        zoom: { controls: false, wheel: false },
      });
      workspaceRef.current = ws;
      Blockly.serialization.blocks.append({ type }, ws, { recordUndo: false });
      Blockly.svgResize(ws);
      // Give the SVG a tick to measure itself before fitting/centering.
      requestAnimationFrame(() => {
        try {
          ws.zoomToFit();
          ws.scrollCenter();
        } catch (e) { /* no-op: best-effort framing only */ }
      });
    } catch (e) {
      console.warn(`Block glossary: couldn't render a live preview for "${type}"`, e);
      window.setTimeout(() => setFailed(true), 0);
    }

    return () => {
      if (ws) ws.dispose();
      workspaceRef.current = null;
    };
  }, [type]);

  return (
    <div className="block-preview-wrapper">
      <div ref={containerRef} className="block-preview-canvas" />
      {failed && <div className="block-preview-fallback">Live preview unavailable for this block right now.</div>}
    </div>
  );
}

export default function BlockGlossaryModal({ isOpen, onClose }) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ORDER[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedType, setExpandedType] = useState(null);
  // One shared, isolated example-execution worker per modal session (not
  // per example) so switching between examples doesn't re-pay Pyodide's
  // startup cost each time; it's still completely separate from the main
  // workspace's own worker/execution.
  const exampleWorker = useExampleWorker();
  const shouldRender = useMountTransition(isOpen, 220);

  if (!shouldRender) return null;

  const term = searchTerm.trim().toLowerCase();
  const isSearching = term.length > 0;

  const visibleBlocks = isSearching
    ? BLOCK_GLOSSARY.filter(
        (b) =>
          b.label.toLowerCase().includes(term) ||
          b.type.toLowerCase().includes(term) ||
          b.description.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term)
      )
    : BLOCK_GLOSSARY.filter((b) => b.category === activeCategory);

  const toggleRow = (type) => setExpandedType(expandedType === type ? null : type);

  return (
    <div className={`block-glossary-modal-overlay ${isOpen ? "" : "is-closing"}`} onClick={onClose}>
      <div className={`block-glossary-modal-content ${isOpen ? "" : "is-closing"}`} onClick={(e) => e.stopPropagation()}>
        <div className="block-glossary-modal-header">
          <h2>
            <img src="/assets/table-icon.png" alt="Reference" className="tab-icon inverted-header-icon" />
            Block Explorer
          </h2>
          <button className="block-glossary-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="block-glossary-search-row">
          <input
            type="text"
            className="block-glossary-search-input"
            placeholder="Search blocks by name, purpose, or category..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setExpandedType(null); }}
          />
        </div>

        {!isSearching && (
          <div className="block-glossary-tabs">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                className={`block-glossary-tab ${activeCategory === cat ? "active" : ""}`}
                style={activeCategory === cat ? { borderColor: CATEGORY_COLOURS[cat], color: CATEGORY_COLOURS[cat] } : undefined}
                onClick={() => { setActiveCategory(cat); setExpandedType(null); }}
              >
                <span className="block-glossary-tab-dot" style={{ background: CATEGORY_COLOURS[cat] }} />
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="block-glossary-accordion">
          {isSearching && (
            <div className="block-glossary-result-count">
              {visibleBlocks.length} block{visibleBlocks.length === 1 ? "" : "s"} match "{searchTerm}"
            </div>
          )}

          {visibleBlocks.length === 0 && (
            <div className="block-glossary-empty">No blocks found. Try a different search term.</div>
          )}

          {visibleBlocks.map((block) => {
            const isExpanded = expandedType === block.type;
            const colour = CATEGORY_COLOURS[block.category] || "#888";
            return (
              <div key={block.type} className={`block-glossary-row ${isExpanded ? "expanded" : ""}`}>
                <div className="block-glossary-row-trigger" onClick={() => toggleRow(block.type)}>
                  <span className="block-glossary-colour-dot" style={{ background: colour }} />
                  <span className="block-glossary-label">{block.label}</span>
                  {isSearching && <span className="block-glossary-category-pill" style={{ color: colour, borderColor: colour }}>{block.category}</span>}
                  <span className="block-glossary-type">{block.type}</span>
                  <span className="block-glossary-chevron dropdown-chevron">▶</span>
                </div>

                {isExpanded && (
                  <div className="block-glossary-row-details">
                    <BlockPreview type={block.type} />
                    <p><strong>What it does:</strong> {block.description}</p>
                    <p><strong>When to use it:</strong> {block.useCase}</p>
                    <p className="block-glossary-python-row">
                      <strong>Roughly like:</strong>
                      <code className="block-glossary-python-code">{block.python}</code>
                    </p>
                    {BLOCK_EXAMPLES[block.type] ? (
                      <BlockExampleRunner example={BLOCK_EXAMPLES[block.type]} runner={exampleWorker} />
                    ) : (
                      <div className="block-example-missing">An interactive example for this block isn't available yet.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
