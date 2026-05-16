import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolder, LuLayoutDashboard, LuLogOut } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import "../styles/DashboardHeader.css";

export default function DashboardHeader({ backTo = "/home", backText = "Back to Home" }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Load user data from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // Generate initials for the avatar (e.g., "John Doe" -> "JD")
  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  // Handle clicking outside the dropdown to close it
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
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

  // Handle user logout
  const onSignOut = () => {
    setOpen(false);
    localStorage.removeItem("user");
    navigate("/signin");
  };

  return (
    <header className="dashboard-header">
      
      {/* LEFT SIDE: Back Link & Logo */}
      <div className="header-left">
        {/* Dynamic Back Navigation */}
        <Link to={backTo} className="back-home">
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon-open" />
          {backText}
        </Link>

        {/* AlgoBlocks Logo */}
        <div className="logo-container">
          <Link to="/dashboard" className="logo-link">
            <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks Logo" className="logo-img" />
            <h1 className="logo-text">ALGOBLOCKS</h1>
          </Link>
        </div>
      </div>

      {/* RIGHT SIDE: Action Buttons & User Menu */}
      <div className="header-right">
        <button className="btn-open-project" onClick={() => navigate('/projects')}>
          <LuFolder size={18} /> Projects
        </button>

        <button className="btn-new-project" onClick={() => navigate('/app')}>
          + New Workspace
        </button>

        {/* User Dropdown Menu */}
        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className="user-menu-btn user-profile-icon"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="user-profile-img">
              {initials}
            </div>
          </button>

          {open && (
            <div className="user-dropdown" role="menu">
              
              <div className="user-dropdown-head">
                <div className="dropdown-avatar-img">
                  {initials}
                </div>
                <div className="user-name">{user?.name || "User"}</div>
                <div className="user-email">{user?.email || ""}</div>
              </div>

              <button
                type="button"
                className="user-dd-item"
                onClick={() => { setOpen(false); navigate("/dashboard"); }}
                role="menuitem"
              >
                <LuLayoutDashboard size={18} /> Go to Dashboard
              </button>

              <button
                type="button"
                className="user-dd-item"
                onClick={() => { setOpen(false); navigate("/projects"); }}
                role="menuitem"
              >
                <LuFolder size={18} /> Projects
              </button>

              <div className="user-dd-divider" />

              <button
                type="button"
                className="user-dd-item danger"
                onClick={onSignOut}
                role="menuitem"
              >
                <LuLogOut size={18} /> Sign Out
              </button>
              
            </div>
          )}
        </div>
      </div>
    </header>
  );
}