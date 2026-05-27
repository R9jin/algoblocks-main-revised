import { useEffect, useMemo, useRef, useState } from "react";

import {
  LuFolder,
  LuLayoutDashboard,
  LuLogOut,
  LuUser
} from "react-icons/lu";

import { Link, useNavigate } from "react-router-dom";

import "../styles/DashboardHeader.css";

// CHANGE: Added logout modal import
import LogoutConfirmModal from "./LogoutConfirmModal";

export default function DashboardHeader({
  backTo = "/home",
  backText = "Back to Home",
}) {

  // ================================
  // STATE
  // ================================

  const [user, setUser] = useState(null);

  const [open, setOpen] = useState(false);

  // CHANGE: Added logout modal state
  const [showLogout, setShowLogout] = useState(false);

  const menuRef = useRef(null);

  const navigate = useNavigate();

  // ================================
  // LOAD USER FROM LOCAL STORAGE
  // ================================

  useEffect(() => {

    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

  }, []);

  // ================================
  // USER INITIALS
  // ================================

  const initials = useMemo(() => {

    const parts = (user?.name || "User")
      .trim()
      .split(/\s+/);

    const a = parts[0]?.[0] || "U";

    const b =
      parts.length > 1
        ? parts[parts.length - 1][0]
        : "";

    return (a + b).toUpperCase();

  }, [user?.name]);

  // ================================
  // CLOSE DROPDOWN ON OUTSIDE CLICK
  // ================================

  useEffect(() => {

    const onDocClick = (e) => {

      if (
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    const onEsc = (e) => {

      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      onDocClick
    );

    document.addEventListener(
      "keydown",
      onEsc
    );

    return () => {

      document.removeEventListener(
        "mousedown",
        onDocClick
      );

      document.removeEventListener(
        "keydown",
        onEsc
      );
    };

  }, []);

  // ================================
  // CONFIRMED SIGN OUT
  // ================================

  // CHANGE: Logout now handled only after modal confirmation
  const handleLogout = () => {

    setOpen(false);

    localStorage.removeItem("user");

    sessionStorage.clear();

    navigate("/signin", {
      replace: true,
    });
  };

  return (
    <>
      <header className="dashboard-header">

        {/* ================================ */}
        {/* LEFT SIDE */}
        {/* ================================ */}

        <div className="header-left">

          {/* BACK BUTTON */}
          <Link
            to={backTo}
            className="back-home"
          >

            <img
              src="/assets/back-icon.png"
              alt="Back"
              className="btn-icon-open"
            />

            {backText}
          </Link>

          {/* LOGO */}
          <div className="logo-container">

            <Link
              to="/dashboard"
              className="logo-link"
            >

              <img
                src="/assets/algoblocks_logo.png"
                alt="AlgoBlocks Logo"
                className="logo-img"
              />

              <h1 className="logo-text">
                ALGOBLOCKS
              </h1>

            </Link>
          </div>
        </div>

        {/* ================================ */}
        {/* RIGHT SIDE */}
        {/* ================================ */}

        <div className="header-right">

          {/* PROJECTS BUTTON */}
          <button
            className="btn-open-project"
            onClick={() => navigate("/projects")}
          >

            <LuFolder size={18} />
            {" "}Projects
          </button>

          {/* NEW WORKSPACE BUTTON */}
          <button
            className="btn-new-project"
            onClick={() => navigate("/workspace")}
          >
            + New Workspace
          </button>

          {/* ================================ */}
          {/* USER MENU */}
          {/* ================================ */}

          <div
            className="user-menu"
            ref={menuRef}
          >

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
              <div
                className="user-dropdown"
                role="menu"
              >

                {/* USER INFO */}
                <div className="user-dropdown-head">

                  <div className="dropdown-avatar-img">
                    {initials}
                  </div>

                  <div className="user-name">
                    {user?.name || "User"}
                  </div>

                  <div className="user-email">
                    {user?.email || ""}
                  </div>
                </div>

                {/* PROFILE */}
                <button
                  type="button"
                  className="user-dd-item"
                  onClick={() => {
                    setOpen(false);
                    navigate("/profile");
                  }}
                  role="menuitem"
                >
                  <LuUser size={18} aria-hidden="true" />
                  {" "}My Profile
                </button>

                {/* DASHBOARD */}
                <button
                  type="button"
                  className="user-dd-item"
                  onClick={() => {

                    setOpen(false);

                    navigate("/dashboard");
                  }}
                  role="menuitem"
                >

                  <LuLayoutDashboard size={18} />
                  {" "}Go to Dashboard
                </button>

                {/* PROJECTS */}
                <button
                  type="button"
                  className="user-dd-item"
                  onClick={() => {

                    setOpen(false);

                    navigate("/projects");
                  }}
                  role="menuitem"
                >

                  <LuFolder size={18} />
                  {" "}Projects
                </button>

                <div className="user-dd-divider" />

                {/* SIGN OUT */}
                <button
                  type="button"
                  className="user-dd-item danger"
                  onClick={(e) => {

                    e.stopPropagation();

                    setOpen(false);

                    // CHANGE: Open modal instead of instant logout
                    setShowLogout(true);

                  }}
                  role="menuitem"
                >

                  <LuLogOut size={18} />
                  {" "}Sign Out
                </button>

              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================================ */}
      {/* LOGOUT MODAL */}
      {/* ================================ */}

      <LogoutConfirmModal
        isOpen={showLogout}

        onClose={() =>
          setShowLogout(false)
        }

        // CHANGE: Single logout source
        onLogoutClick={handleLogout}
      />
    </>
  );
}