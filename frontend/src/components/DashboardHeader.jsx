import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolder, LuLayoutDashboard, LuLogOut, LuUser } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import "../styles/DashboardHeader.css";
import LogoutConfirmModal from "./LogoutConfirmModal";

export default function DashboardHeader({
  backTo = "/home",
  backText = "Back to Home",
}) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser || "{}"));
    }
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

  const handleLogout = () => {
    setOpen(false);
    
    // Clear user data
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    
    // FIXED: Clear ALL token variations from BOTH storages to prevent leakage
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    localStorage.removeItem("authToken");
    sessionStorage.removeItem("authToken");

    navigate("/signin", { replace: true });
  };

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <Link to={backTo} className="back-home">
            <img src="/assets/back-icon.png" alt="Back" className="btn-icon-open" />
            {backText}
          </Link>
          <div className="logo-container">
            <Link to="/dashboard" className="logo-link">
              <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks Logo" className="logo-img" />
              <h1 className="logo-text">ALGOBLOCKS</h1>
            </Link>
          </div>
        </div>

        <div className="header-right">
          <button className="btn-open-project" onClick={() => navigate("/projects")}>
            <LuFolder size={18} /> Projects
          </button>
          <button className="btn-new-project" onClick={() => navigate("/workspace")}>
            + New Workspace
          </button>

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
                <button type="button" className="user-dd-item" onClick={() => { setOpen(false); navigate("/projects"); }} role="menuitem">
                  <LuFolder size={18} /> Projects
                </button>
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