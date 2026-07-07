// frontend/src/components/UserHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuActivity,
  LuFolder,
  LuLayoutDashboard,
  LuLogOut,
  LuUser
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import "../styles/UserHeader.css";
import { startBackgroundSync } from "../utils/syncManager.js";
import LogoutConfirmModal from "./LogoutConfirmModal";

// FIX: Added onLogoutClick to the component props
export default function UserHeader({ user, onLogoutClick }) {
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const isAdmin = user?.isAdmin === true || user?.role === "admin";

  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    const onEsc = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleLogout = () => {
    if (navigator.onLine) {
      startBackgroundSync().catch(console.error);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/");
  };

  return (
    <>
      <nav className="landing-nav">
        <div
          className="logo-container"
          onClick={() => navigate("/")}
          style={{ cursor: "pointer" }}
        >
          <img
            src="/assets/algoblocks_logo.png"
            alt="AlgoBlocks Logo"
            className="logo-img"
          />
          <h1 className="logo-text user-header-logo-text" style={{ color: "#222222" }}>
            ALGOBLOCKS
          </h1>
        </div>

        <div className="nav-links">
          <div className="user-menu" ref={menuRef}>
            <button
              type="button"
              className="user-menu-btn"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="user-avatar" aria-hidden="true">
                {initials}
              </span>
            </button>

            {open && (
              <div className="user-dropdown" role="menu">
                <div className="user-dropdown-head">
                  <div className="dropdown-avatar" aria-hidden="true">
                    {initials}
                  </div>
                  <div className="user-name">
                    {user?.name || "User"}
                  </div>
                  <div className="user-email">
                    {user?.email || ""}
                  </div>
                </div>

                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/profile"); }} role="menuitem">
                  <LuUser size={18} aria-hidden="true" /> My Profile
                </button>
                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/dashboard"); }} role="menuitem">
                  <LuLayoutDashboard size={18} aria-hidden="true" /> Go to Dashboard
                </button>
                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/projects"); }} role="menuitem">
                  <LuFolder size={18} aria-hidden="true" /> Projects
                </button>
                
                {isAdmin && (
                  <>
                    <div className="user-dd-divider" />
                    <button 
                      type="button" 
                      className="user-dd-item" 
                      style={{ color: "#10B981", fontWeight: "bold" }}
                      onClick={() => { setOpen(false); navigate("/admin/evaluation-suite"); }} 
                      role="menuitem"
                    >
                      <LuActivity size={18} aria-hidden="true" /> System AST Evaluation
                    </button>
                  </>
                )}

                <div className="user-dd-divider" />
                
                {/* FIX: Trigger the parent prop if it exists, otherwise use fallback */}
                <button 
                  type="button" 
                  className="user-dd-item danger" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setOpen(false); 
                    if (onLogoutClick) {
                      onLogoutClick(); 
                    } else {
                      setShowLogout(true);
                    }
                  }} 
                  role="menuitem"
                >
                  <LuLogOut size={18} aria-hidden="true" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Fallback modal for pages that don't pass onLogoutClick */}
      <LogoutConfirmModal isOpen={showLogout} onClose={() => setShowLogout(false)} onLogoutClick={handleLogout} />
    </>
  );
}
