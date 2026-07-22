// frontend/src/components/DashboardHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { LuActivity, LuFolder, LuGauge, LuLayoutDashboard, LuLogOut, LuRefreshCw, LuUser, LuUsers } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import "../styles/DashboardHeader.css";
import { stopBackgroundSync, syncManager } from "../utils/syncManager";
import { isAdminUser } from "../utils/auth";
import LogoutConfirmModal from "./LogoutConfirmModal";
import TourHelpButton from "./TourHelpButton";

export default function DashboardHeader({
  backTo = "/home",
  backText = "Back to Home",
  tour,
  tourPageId,
}) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser || "{}"));
    }
  }, []);

  useEffect(() => {
    const onStart = () => setIsGlobalSyncing(true);
    const onEnd = () => setIsGlobalSyncing(false);
    window.addEventListener("sync-start", onStart);
    window.addEventListener("sync-end", onEnd);
    return () => {
      window.removeEventListener("sync-start", onStart);
      window.removeEventListener("sync-end", onEnd);
    };
  }, []);

  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleLogout = async () => {
    stopBackgroundSync();
    await syncManager.processSyncQueue();

    ["token", "authToken", "user"].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    
    window.location.replace("/");
  };

  // Check multiple admin identifier formats to ensure compatibility with the backend payload
  const isUserAdmin = isAdminUser(user);

  return (
    <>
      <style>{`
        @keyframes dhSpin { 100% { transform: rotate(360deg); } }
        .dh-spin-anim { animation: dhSpin 1s linear infinite; }
      `}</style>

      <header className="dashboard-header">
        <div className="header-left">
          <Link to={backTo} className="back-home">
            <img src="/assets/back-icon.png" alt="Back" className="btn-icon-open" />
            <span className="back-home-text">{backText}</span>
          </Link>
          <div className="logo-container">
            <Link to="/dashboard" className="logo-link">
              <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks Logo" className="logo-img" />
              <h1 className="logo-text">ALGOBLOCKS</h1>
            </Link>
          </div>
        </div>

        <div className="header-right" style={{ display: "flex", alignItems: "center" }}>
          <TourHelpButton pageId={tourPageId} tour={tour} label="Replay this page tour" />
          
          {/* Live Sync Loader Indicator */}
          {isGlobalSyncing && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(96, 165, 250, 0.12)", border: "1px solid rgba(96, 165, 250, 0.35)", color: "#60A5FA", padding: "5px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: "600", marginRight: "14px" }}>
              <LuRefreshCw className="dh-spin-anim" size={15} />
              <span>Syncing</span>
            </div>
          )}

          <div className="user-menu" ref={menuRef}>
            <button
              type="button"
              className="user-menu-btn user-profile-icon"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <div className="user-profile-img">{initials}</div>
            </button>

            {open && (
              <div className="user-dropdown" role="menu">
                <div className="user-dropdown-head">
                  <div className="dropdown-avatar-img">{initials}</div>
                  <div className="user-name">{user?.name || "User"}</div>
                  <div className="user-email">{user?.email || ""}</div>
                </div>

                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/profile"); }} role="menuitem">
                  <LuUser size={18} aria-hidden="true" /> My Profile
                </button>
                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/dashboard"); }} role="menuitem">
                  <LuLayoutDashboard size={18} /> Go to Dashboard
                </button>

                {/* Learning Path / Workspace / Projects are student-only features.
                    Admin accounts no longer track progress there, so these links
                    are hidden entirely rather than just unlocked. */}
                {!isUserAdmin && (
                  <>
                    <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/projects"); }} role="menuitem">
                      <LuFolder size={18} /> Projects
                    </button>
                    <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/accuracy"); }} role="menuitem">
                      <LuGauge size={18} /> System Accuracy
                    </button>
                  </>
                )}

                {/* RESTRICTED: Admin-only features. The dashboard itself now
                    already surfaces a full-version Dataset Testing panel, so
                    this is kept only as a direct/standalone shortcut. */}
                {isUserAdmin && (
                  <>
                    <div className="user-dd-divider" />
                    <button 
                      type="button" 
                      className="user-dd-item" 
                      style={{ color: "#10B981", fontWeight: "bold" }}
                      onClick={() => { setOpen(false); navigate("/admin/evaluation-suite"); }} 
                      role="menuitem"
                    >
                      <LuActivity size={18} aria-hidden="true" /> Dataset Testing
                    </button>
                    <button 
                      type="button" 
                      className="user-dd-item" 
                      style={{ color: "#3b82f6", fontWeight: "bold" }}
                      onClick={() => { setOpen(false); navigate("/admin/users"); }} 
                      role="menuitem"
                    >
                      <LuUsers size={18} aria-hidden="true" /> User Management
                    </button>
                  </>
                )}

                <div className="user-dd-divider" />
                <button type="button" className="user-dd-item danger" onClick={(e) => { e.stopPropagation(); setOpen(false); setShowLogout(true); }} role="menuitem">
                  <LuLogOut size={18} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <LogoutConfirmModal isOpen={showLogout} onClose={() => setShowLogout(false)} onLogoutClick={handleLogout} />
    </>
  );
}