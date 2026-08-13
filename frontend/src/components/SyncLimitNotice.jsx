// frontend/src/components/SyncLimitNotice.jsx
import { useEffect, useState } from "react";

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
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const handleLimitReached = (e) => {
      setNotice(e.detail?.message || "A locally saved item could not be synced: limit reached.");
    };
    window.addEventListener("syncLimitReached", handleLimitReached);
    return () => window.removeEventListener("syncLimitReached", handleLimitReached);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="network-popup show offline">
      <div className="network-popup-content">
        <span className="network-icon">⚠️</span>
        <div>
          <strong>Sync limit reached</strong>
          <p>{notice}</p>
        </div>
      </div>
    </div>
  );
}
