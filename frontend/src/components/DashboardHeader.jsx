// frontend/src/components/DashboardHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { FiLogOut } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../styles/DashboardHeader.css";
import LogoutConfirmModal from "./LogoutConfirmModal";

export default function DashboardHeader({ user, onLogoutClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const menuRef = useRef(null);

  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <Link to="/" className="brand-logo">
            <img src="/assets/algoblocks_logo.png" alt="Logo" className="header-logo-img" />
            <span>ALGOBLOCKS</span>
          </Link>
        </div>

        <div className="header-right">
          <div className="user-profile" ref={menuRef}>
            <button className="avatar-btn" onClick={() => setMenuOpen(!menuOpen)}>
              {initials}
            </button>

            {menuOpen && (
              <div className="profile-dropdown">
                <div className="dropdown-header">
                  <strong>{user?.name || "User"}</strong>
                  <span className="user-email">{user?.email || ""}</span>
                </div>
                <div className="dropdown-divider"></div>
                <button
                  className="dropdown-item logout-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowLogout(true);
                  }}
                >
                  <FiLogOut className="item-icon" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Renders safely outside the header layout */}
      <LogoutConfirmModal
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        onLogoutClick={onLogoutClick}
      />
    </>
  );
}