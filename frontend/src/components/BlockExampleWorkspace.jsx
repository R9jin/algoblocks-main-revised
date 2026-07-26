// frontend/src/components/BlockExampleWorkspace.jsx
import * as Blockly from "blockly";
import "blockly/blocks";
import { useEffect, useRef } from "react";
import { pastelTheme } from "./BlocklyWorkspace.jsx";

// Locks every block in the workspace down to "movable for exploration only":
// no deleting, no field/mutation edits, no right-click menu (which is where
// Duplicate/Delete/Add Comment would otherwise come from). Recursed over
// every block, including ones nested inside statement/value inputs.
//
// NOTE: an earlier version of this component also added a "self-healing"
// change listener that reloaded the pristine state if a structural edit
// slipped through. That turned out to be dangerous: Blockly fires block
// events asynchronously (via its own internal queue), so the reload's own
// clear()+load() could re-trigger the very listener that started it,
// before the synchronous re-entry guard had a chance to protect against
// it -- causing a tight reload loop that froze the tab. The per-block
// locks below are the standard, well-tested way to do this and don't have
// that failure mode, so that mechanism was removed rather than patched.
function lockBlocks(workspace) {
  workspace.getAllBlocks(false).forEach((block) => {
    block.setDeletable(false);
    block.setEditable(false);
    block.contextMenu = false;
  });
}

export default function BlockExampleWorkspace({ workspaceState, onWorkspaceReady, height = 170 }) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const pristineStateRef = useRef(workspaceState);

  useEffect(() => {
    if (!containerRef.current) return;
    let ws = null;
    try {
      // No `toolbox` key at all -- there is nothing to drag new blocks in
      // from. No trashcan -- nothing to drag existing blocks into to
      // delete them. Blocks stay fully movable (that part is intentional).
      // wheel:false (both move and zoom) is deliberate: otherwise every
      // mouse-wheel tick over this small canvas gets captured by Blockly to
      // pan/zoom the mini workspace instead of scrolling the modal/page
      // underneath it, which feels like the page is stuck/lagging.
      ws = Blockly.inject(containerRef.current, {
        theme: pastelTheme,
        renderer: "geras",
        trashcan: false,
        sounds: false,
        move: { scrollbars: true, drag: true, wheel: false },
        zoom: { controls: false, wheel: false, startScale: 0.85 },
      });
      workspaceRef.current = ws;

      // Suppress change events entirely while loading the pristine example.
      // This is the standard, correct way to do a bulk/programmatic load in
      // Blockly, and guarantees loading never fires a flood of per-block
      // create events to anything that might be listening.
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load(pristineStateRef.current, ws, { recordUndo: false });
        lockBlocks(ws);
      } finally {
        Blockly.Events.enable();
      }

      onWorkspaceReady?.(ws);
      requestAnimationFrame(() => {
        try { ws.zoomToFit(); ws.scrollCenter(); Blockly.svgResize(ws); } catch (e) { /* best-effort framing */ }
      });
    } catch (e) {
      console.warn("Block glossary: couldn't render the example workspace.", e);
    }

    return () => {
      if (ws) ws.dispose();
      workspaceRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="block-example-canvas" style={{ height }} />;
}
