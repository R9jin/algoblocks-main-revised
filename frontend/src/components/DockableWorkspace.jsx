// frontend/src/components/DockableWorkspace.jsx
//
// A small, self-contained docking layout engine in the spirit of VS Code /
// Eclipse: a fixed set of five border regions (top, left, center, right,
// bottom) around a Blockly-workspace-sized "center". Any panel can be
// dragged by its tab onto another region — dropping near the middle of a
// region merges the panel into that region as a tab; dropping near an edge
// re-docks it into the corresponding top-level region (left/right/top/
// bottom). Each side region is resizable via a drag splitter, and the
// whole arrangement is persisted to localStorage per `layoutKey` so it
// survives reloads and future sessions. Reset support is exposed via ref.
//
// IMPORTANT for Blockly: panels docked together in the same region are all
// kept mounted simultaneously and only toggled with CSS (display: none),
// never unmounted — this mirrors the pattern the codebase already used for
// the Blocks/Python toggle, and it's what lets BlocklyWorkspace's own
// internal ResizeObserver (see BlocklyWorkspace.jsx) keep the canvas
// correctly sized without ever losing the live workspace instance when
// merely switching tabs within a region. Moving a panel to a *different*
// region does remount it (React can't reparent a live instance without a
// portal), but MainApp/ActivityApp already persist the Blockly JSON on
// every change, so BlocklyWorkspace faithfully restores from `initialJson`
// immediately on remount — visually and functionally seamless.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import "../styles/DockableWorkspace.css";

const REGION_KEYS = ["top", "left", "center", "right", "bottom"];
const DEFAULT_SIZES = { top: 200, left: 280, right: 340, bottom: 260 };
const MIN_SIZE = 120;
const EDGE_RATIO = 0.28; // fraction of a region's width/height treated as an edge drop-zone

const storageKey = (layoutKey) => `algoblocks_dock_layout_${layoutKey}`;

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

// Filters a saved/default layout down to only the panel ids that are
// currently valid, drops duplicates, guarantees every region object exists,
// and makes sure every known panel appears exactly once somewhere (falling
// back to "center") — so a stale localStorage entry, or a future change to
// the panel list, can never leave a panel undockable or duplicated.
function reconcileLayout(rawLayout, panels) {
  const validIds = panels.map((p) => p.id);
  const validSet = new Set(validIds);
  const seen = new Set();
  const regions = {};

  for (const key of REGION_KEYS) {
    const savedRegion = rawLayout?.regions?.[key];
    const incomingIds = Array.isArray(savedRegion?.panelIds) ? savedRegion.panelIds : [];
    const panelIds = incomingIds.filter((id) => validSet.has(id) && !seen.has(id));
    panelIds.forEach((id) => seen.add(id));
    const fallbackSize = DEFAULT_SIZES[key] || 260;
    const size = Number.isFinite(savedRegion?.size) && savedRegion.size > 0 ? savedRegion.size : fallbackSize;
    regions[key] = { panelIds, size };
  }

  const missing = validIds.filter((id) => !seen.has(id));
  if (missing.length) {
    regions.center.panelIds = [...regions.center.panelIds, ...missing];
  }

  const activeTab = {};
  for (const key of REGION_KEYS) {
    const ids = regions[key].panelIds;
    const savedActive = rawLayout?.activeTab?.[key];
    activeTab[key] = ids.includes(savedActive) ? savedActive : (ids[0] || null);
  }

  return { regions, activeTab };
}

function loadLayout(layoutKey, defaultLayout, panels) {
  try {
    const raw = localStorage.getItem(storageKey(layoutKey));
    if (raw) {
      const parsed = JSON.parse(raw);
      return reconcileLayout(parsed, panels);
    }
  } catch {
    // Fall through to default on any parse/storage error.
  }
  return reconcileLayout(defaultLayout, panels);
}

function DockSplitter({ axis, onDelta, title }) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    lastPosRef.current = axis === "x" ? e.clientX : e.clientY;
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev) => {
      if (!draggingRef.current) return;
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      const delta = pos - lastPosRef.current;
      lastPosRef.current = pos;
      if (delta !== 0) onDelta(delta);
    };
    const onMouseUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return <div className={`dock-splitter dock-splitter-${axis}`} onMouseDown={onMouseDown} title={title} />;
}

function DropOverlay({ quadrant }) {
  return (
    <div className="dock-drop-overlay">
      <div className={`dock-drop-indicator dock-drop-${quadrant}`} />
    </div>
  );
}

const DockableWorkspace = forwardRef(function DockableWorkspace(
  { layoutKey, panels, defaultLayout, className = "" },
  ref
) {
  const panelsById = useMemo(() => {
    const map = {};
    panels.forEach((p) => { map[p.id] = p; });
    return map;
  }, [panels]);

  const [layout, setLayout] = useState(() => loadLayout(layoutKey, defaultLayout, panels));
  const [dragState, setDragState] = useState(null); // { panelId, fromRegion }
  const [dragOver, setDragOver] = useState(null); // { region, quadrant }

  // If the panel set genuinely changes shape (e.g. a future panel gets
  // added), reconcile so the new panel appears somewhere instead of being
  // silently dropped.
  const panelIdsKey = panels.map((p) => p.id).join(",");
  useEffect(() => {
    setLayout((prev) => reconcileLayout(prev, panels));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelIdsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(layoutKey), JSON.stringify(layout));
    } catch {
      // Persistence is best-effort; layout still works for this session.
    }
  }, [layout, layoutKey]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      try {
        localStorage.removeItem(storageKey(layoutKey));
      } catch {
        // Ignore storage errors — resetting in-memory state is what matters.
      }
      setLayout(reconcileLayout(defaultLayout, panels));
    },
    // Brings panelId's tab to the front of whichever region currently
    // hosts it, without changing where anything is docked. Lets callers
    // (footer shortcuts, guided tours, "run code" revealing the console)
    // keep working correctly no matter how the user has rearranged panels.
    focusPanel: (panelId) => {
      setLayout((prev) => {
        for (const key of REGION_KEYS) {
          if (prev.regions[key].panelIds.includes(panelId)) {
            if (prev.activeTab[key] === panelId) return prev;
            return { ...prev, activeTab: { ...prev.activeTab, [key]: panelId } };
          }
        }
        return prev;
      });
    },
  }));

  const setActiveTab = (regionKey, panelId) => {
    setLayout((prev) => ({ ...prev, activeTab: { ...prev.activeTab, [regionKey]: panelId } }));
  };

  const handleTabDragStart = (e, panelId, fromRegion) => {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", panelId); } catch {
      // Some browsers are picky about setData in certain contexts; the
      // in-memory dragState is the real source of truth anyway.
    }
    setDragState({ panelId, fromRegion });
  };

  const handleTabDragEnd = () => {
    setDragState(null);
    setDragOver(null);
  };

  const handleRegionDragOver = (e, regionKey) => {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    let quadrant = "center";
    if (x < EDGE_RATIO) quadrant = "left";
    else if (x > 1 - EDGE_RATIO) quadrant = "right";
    else if (y < EDGE_RATIO) quadrant = "top";
    else if (y > 1 - EDGE_RATIO) quadrant = "bottom";

    setDragOver((prev) => (prev && prev.region === regionKey && prev.quadrant === quadrant ? prev : { region: regionKey, quadrant }));
  };

  const handleRegionDragLeave = (e, regionKey) => {
    // Only clear if we're actually leaving the region (not just moving
    // between its own child elements, which also fire dragleave).
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver((prev) => (prev && prev.region === regionKey ? null : prev));
  };

  const handleRegionDrop = (e, regionKey) => {
    e.preventDefault();
    if (!dragState) return;
    const quadrant = dragOver && dragOver.region === regionKey ? dragOver.quadrant : "center";
    const targetRegion = quadrant === "center" ? regionKey : quadrant;

    setLayout((prev) => {
      const { panelId, fromRegion } = dragState;
      if (fromRegion === targetRegion) {
        return { ...prev, activeTab: { ...prev.activeTab, [targetRegion]: panelId } };
      }
      const next = cloneLayout(prev);
      next.regions[fromRegion].panelIds = next.regions[fromRegion].panelIds.filter((id) => id !== panelId);
      if (next.activeTab[fromRegion] === panelId) {
        next.activeTab[fromRegion] = next.regions[fromRegion].panelIds[0] || null;
      }
      if (!next.regions[targetRegion].panelIds.includes(panelId)) {
        next.regions[targetRegion].panelIds.push(panelId);
      }
      next.activeTab[targetRegion] = panelId;
      return next;
    });

    setDragState(null);
    setDragOver(null);
  };

  const handleSplitterDelta = (regionKey, signedDelta, axis) => {
    setLayout((prev) => {
      const region = prev.regions[regionKey];
      const maxSize = axis === "x" ? window.innerWidth * 0.7 : window.innerHeight * 0.7;
      const nextSize = Math.max(MIN_SIZE, Math.min(maxSize, region.size + signedDelta));
      if (nextSize === region.size) return prev;
      return { ...prev, regions: { ...prev.regions, [regionKey]: { ...region, size: nextSize } } };
    });
  };

  const renderRegion = (key) => {
    const region = layout.regions[key];
    const isCenter = key === "center";
    if (!isCenter && region.panelIds.length === 0) return null;

    const isHorizontal = key === "left" || key === "right";
    const style = isCenter
      ? { flex: 1, minWidth: 0, minHeight: 0 }
      : isHorizontal
        ? { width: region.size, minWidth: MIN_SIZE }
        : { height: region.size, minHeight: MIN_SIZE };

    const isDropTarget = dragOver?.region === key;

    return (
      <div
        key={key}
        className={`dock-region dock-region-${key}${isDropTarget ? " dock-region-drag-over" : ""}`}
        style={style}
        onDragOver={(e) => handleRegionDragOver(e, key)}
        onDragLeave={(e) => handleRegionDragLeave(e, key)}
        onDrop={(e) => handleRegionDrop(e, key)}
      >
        {region.panelIds.length > 0 && (
          <div className="dock-tab-bar">
            {region.panelIds.map((pid) => {
              const panel = panelsById[pid];
              if (!panel) return null;
              return (
                <div
                  key={pid}
                  className={`dock-tab ${layout.activeTab[key] === pid ? "active" : ""}`}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, pid, key)}
                  onDragEnd={handleTabDragEnd}
                  onClick={() => setActiveTab(key, pid)}
                  title={`Drag to redock ${panel.title}`}
                >
                  {panel.icon}
                  <span className="dock-tab-title">{panel.title}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="dock-region-body">
          {region.panelIds.map((pid) => {
            const panel = panelsById[pid];
            if (!panel) return null;
            const isActive = layout.activeTab[key] === pid;
            return (
              <div key={pid} className="dock-panel-slot" style={{ display: isActive ? "flex" : "none" }}>
                {panel.content}
              </div>
            );
          })}
          {isCenter && region.panelIds.length === 0 && (
            <div className="dock-empty-center">Drag a panel tab here to dock it in the main workspace.</div>
          )}
        </div>

        {isDropTarget && <DropOverlay quadrant={dragOver.quadrant} />}
      </div>
    );
  };

  const topVisible = layout.regions.top.panelIds.length > 0;
  const leftVisible = layout.regions.left.panelIds.length > 0;
  const rightVisible = layout.regions.right.panelIds.length > 0;
  const bottomVisible = layout.regions.bottom.panelIds.length > 0;

  return (
    <div className={`dock-root ${className}`}>
      {renderRegion("top")}
      {topVisible && <DockSplitter axis="y" title="Resize top panel" onDelta={(d) => handleSplitterDelta("top", d, "y")} />}

      <div className="dock-middle-row">
        {renderRegion("left")}
        {leftVisible && <DockSplitter axis="x" title="Resize left panel" onDelta={(d) => handleSplitterDelta("left", d, "x")} />}
        {renderRegion("center")}
        {rightVisible && <DockSplitter axis="x" title="Resize right panel" onDelta={(d) => handleSplitterDelta("right", -d, "x")} />}
        {renderRegion("right")}
      </div>

      {bottomVisible && <DockSplitter axis="y" title="Resize bottom panel" onDelta={(d) => handleSplitterDelta("bottom", -d, "y")} />}
      {renderRegion("bottom")}
    </div>
  );
});

export default DockableWorkspace;
