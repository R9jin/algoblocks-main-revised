// frontend/src/components/SyncLimitNotice.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Background sync (syncManager.js) periodically pushes any locally-saved,
// not-yet-synced projects/templates up to the backend. If the account is
// already at its 20-project/20-template cap, that push gets a permanent
// 403 rather than a transient network failure -- but that happens on a
// timer in the background, not in response to a button click, so there's
// no local page-level toast state to show it in. syncManager dispatches a
// "syncLimitReached" window event when this happens; this component is
// mounted once at the app root (see App.jsx) so the notice surfaces no
// matter which page the person is on when a queued save finally fails.
export default function SyncLimitNotice() {
  const location = useLocation();
  const [notice, setNotice] = useState(null);
  const [title, setTitle] = useState("Sync limit reached");
  // Kept mounted at all times (like OfflineIndicator's .network-popup) and
  // just toggles the show/hide CSS transition class -- this used to
  // conditionally unmount instead, which meant the CSS's own transition
  // never got a chance to run and the toast just vanished mid-air the
  // moment the 6s timer fired.
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeoutRef = useRef(null);
  const clearTimeoutRef = useRef(null);

  useEffect(() => {
    const handleLimitReached = (e) => {
      const kind = e.detail?.kind || "";
      if (kind.startsWith("template") && location.pathname.startsWith("/activity/")) return;
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      setTitle(e.detail?.title || "Sync limit reached");
      setNotice(e.detail?.message || "A locally saved item could not be synced: limit reached.");
      setIsVisible(true);
    };
    window.addEventListener("syncLimitReached", handleLimitReached);
    return () => window.removeEventListener("syncLimitReached", handleLimitReached);
  }, [location.pathname]);

  useEffect(() => {
    if (!isVisible) return;
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      // Let the hide transition (see .network-popup.hide) finish playing
      // before dropping the content, so it doesn't blank out mid-slide.
      clearTimeoutRef.current = setTimeout(() => setNotice(null), 400);
    }, 6000);
    return () => clearTimeout(hideTimeoutRef.current);
  }, [isVisible]);

  if (!notice) return null;

  return (
    <div className={`network-popup offline ${isVisible ? "show" : "hide"}`}>
      <div className="network-popup-content">
        <span className="network-icon">⚠️</span>
        <div>
          <strong>{title}</strong>
          <p>{notice}</p>
        </div>
      </div>
    </div>
  );
}
