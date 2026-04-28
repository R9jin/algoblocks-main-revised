// frontend/src/components/DashboardHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolder, LuLogOut } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";

export default function DashboardHeader() {
  const navigate = useNavigate();

  // State for user data and dropdown menu
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Fetch the logged-in user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Generate initials for the avatar
  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  // Handle clicking outside to close the dropdown menu
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
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

  // Handle Sign Out
  const onSignOut = () => {
    setOpen(false);
    localStorage.removeItem("user");
    navigate("/signin");
  };

  return (
    <header className="dashboard-header">
      <div className="header-left">
        <div className="logo-container">
          <img
            src="/assets/algoblocks_logo.png"
            alt="Logo"
            className="logo-img"
          />
          <h1 className="logo-text" style={{ color: "#3C2D76" }}>
            ALGOBLOCKS
          </h1>
        </div>
        <Link to="/home" className="back-home">
          <img src="/assets/back-icon.png" alt="Back" className="btn-icon" /> Back to Home
        </Link>
      </div>

      <div className="header-right">
        <button
          className="btn-open-project"
          onClick={() => navigate("/projects")}
        >
          <img
            src="/assets/folder-icon.png"
            alt="Open Project"
            className="btn-icon-open"
          />
          Open Project
        </button>

        <button
          className="btn-new-project"
          onClick={() => navigate("/app")}
        >
          + New Project
        </button>

        {/* Dynamic User Profile Menu (Inline CSS Removed) */}
        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className="user-menu-btn"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <img
              src="/assets/user-icon.png"
              alt="User Profile"
              className="user-profile-img"
            />
          </button>

          {open && (
            <div className="user-dropdown" role="menu">
              {/* Inside frontend/src/components/DashboardHeader.jsx */}
              <div className="user-dropdown-head">
                {/* Replaced the initials with the image */}
                <img
                  src="/assets/user-icon.png"
                  alt="Profile"
                  className="dropdown-avatar-img"
                />
                <div className="user-name">{user?.name || "User"}</div>
                <div className="user-email">{user?.email || ""}</div>
              </div>

              <button
                type="button"
                className="user-dd-item"
                onClick={() => {
                  setOpen(false);
                  navigate("/projects");
                }}
                role="menuitem"
              >
                <LuFolder size={18} aria-hidden="true" />
                Projects
              </button>

              <div className="user-dd-divider" />

              <button
                type="button"
                className="user-dd-item danger"
                onClick={onSignOut}
                role="menuitem"
              >
                <LuLogOut size={18} aria-hidden="true" />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}