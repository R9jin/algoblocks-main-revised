// frontend/src/components/BlockPlaygroundWorkspace.jsx
//
// The editable sibling of BlockExampleWorkspace.jsx. That component locks
// every block down (movable-only) so the read-only Block Explorer glossary
// can't be broken. This one is the opposite: it hands the learner the same
// toolbox as the real workspace (imported straight from BlocklyWorkspace.jsx
// so the two never drift apart) plus a trashcan, so blocks can be dragged
// in, edited, rearranged, and deleted freely -- while still starting from a
// verified, hand-built example every time it mounts.
//
// A "Reset" affordance is exposed imperatively (via ref) rather than as a
// self-healing change listener. An earlier attempt at self-healing inside
// BlockExampleWorkspace caused a reload loop (see the comment in that
// file) because Blockly's events fire asynchronously and a reload can
// re-trigger the very listener that started it. Reset here is instead a
// single, explicit, user-initiated action: clear the workspace and reload
// the pristine serialization, once, on click.
import * as Blockly from "blockly";
import "blockly/blocks";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { pastelTheme, toolbox } from "./BlocklyWorkspace.jsx";

function loadPristine(ws, state) {
  Blockly.Events.disable();
  try {
    ws.clear();
    Blockly.serialization.workspaces.load(state, ws, { recordUndo: false });
  } finally {
    Blockly.Events.enable();
  }
}

function frameWorkspace(ws) {
  requestAnimationFrame(() => {
    try {
      ws.zoomToFit();
      ws.scrollCenter();
      Blockly.svgResize(ws);
    } catch (e) {
      /* best-effort framing only */
    }
  });
}

const BlockPlaygroundWorkspace = forwardRef(function BlockPlaygroundWorkspace(
  { workspaceState, onWorkspaceChange, height = 260 },
  ref,
) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let ws = null;
    let cancelled = false;

    // React 18 StrictMode double-invokes every effect in development:
    // mount -> cleanup -> mount again, all synchronously in the same tick,
    // before the browser paints or flushes microtasks. Calling
    // Blockly.inject() directly here would let that first "throwaway"
    // pass create a real workspace, load blocks into it, and then
    // immediately dispose() it -- before Blockly ever got a chance to
    // actually draw those blocks.
    //
    // That matters because Blockly 10+'s render manager doesn't render
    // per-workspace: every pending block render on the *whole page* is
    // batched into one shared requestAnimationFrame pass
    // (core/render_management.ts). If the disposed workspace's blocks are
    // still sitting in that shared queue when the frame flushes, trying to
    // render them throws (their SVG groups are already gone) -- and since
    // it's one shared batch, that throw can take down every *other*
    // workspace's still-pending render in the same frame with it. On a
    // lesson page with several of these playgrounds mounting together,
    // that's exactly the "first one renders fine, every one after it is
    // blank" pattern this was causing.
    //
    // Deferring the real work to a microtask sidesteps it: by the time it
    // runs, StrictMode's synchronous mount/cleanup/remount dance has
    // already finished, so the throwaway first pass's `cancelled` flag is
    // already true and it skips creating a workspace entirely -- only the
    // surviving second pass ever calls Blockly.inject.
    queueMicrotask(() => {
      if (cancelled || !containerRef.current) return;
      try {
        ws = Blockly.inject(containerRef.current, {
          theme: pastelTheme,
          renderer: "geras",
          toolbox,
          trashcan: true,
          sounds: false,
          move: { scrollbars: true, drag: true, wheel: true },
          zoom: { controls: true, wheel: true, startScale: 0.85 },
          grid: { spacing: 25, length: 3, colour: "#e6e2f5", snap: true },
        });
        workspaceRef.current = ws;
        // Same explicit registration as the real Activity workspace (see
        // BlocklyWorkspace.jsx) -- without this, this playground's Functions
        // and Variables categories render without procedure_return_value /
        // variable_swap when clicked manually, even though search finds them.
        ws.registerToolboxCategoryCallback("VARIABLE", Blockly.Variables.flyoutCategory);
        ws.registerToolboxCategoryCallback("PROCEDURE", Blockly.Procedures.flyoutCategory);
        loadPristine(ws, workspaceState);

        const notifyChange = () => onWorkspaceChange?.(ws);
        // Fire once immediately so the Python panel reflects the pristine
        // example as soon as the workspace is up, same as the read-only
        // glossary version does on ready.
        notifyChange();

        // Debounced so a drag or a multi-character field edit doesn't
        // regenerate Python on every intermediate frame -- only after things
        // settle for a moment. UI-only events (selection, clicks, viewport
        // changes) are skipped entirely since they never change the code.
        ws.addChangeListener((event) => {
          if (event instanceof Blockly.Events.UiBase) return;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(notifyChange, 200);
        });

        frameWorkspace(ws);
      } catch (e) {
        console.warn("Lesson block playground: couldn't render the workspace.", e);
      }
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (ws) ws.dispose();
      workspaceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        const ws = workspaceRef.current;
        if (!ws) return;
        loadPristine(ws, workspaceState);
        frameWorkspace(ws);
        onWorkspaceChange?.(ws);
      },
      getWorkspace: () => workspaceRef.current,
    }),
    [workspaceState, onWorkspaceChange],
  );

  return <div ref={containerRef} className="block-playground-canvas" style={{ height }} />;
});

export default BlockPlaygroundWorkspace;
