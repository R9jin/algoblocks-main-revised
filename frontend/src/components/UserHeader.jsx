// frontend/src/components/UserHeader.jsx

import { useEffect, useMemo, useRef, useState } from "react";

import {
  LuFolder,
  LuLayoutDashboard,
  LuLogOut,
  LuUser
} from "react-icons/lu";

import { useNavigate } from "react-router-dom";

import "../styles/UserHeader.css";

import { startBackgroundSync } from "../utils/syncManager.js";
import LogoutConfirmModal from "./LogoutConfirmModal";

export default function UserHeader({ user }) {

  // ================================
  // STATE
  // ================================

  const [open, setOpen] = useState(false);

  // CHANGE: Modal visibility handled ONLY here
  const [showLogout, setShowLogout] = useState(false);

  const menuRef = useRef(null);

  const navigate = useNavigate();

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
  // CLOSE MENU EVENTS
  // ================================

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
  // LOGOUT HANDLER
  // ================================

  // CHANGE: Single logout flow only with Background Sync Enforcer
  const handleLogout = async () => {

    // FORCE SYNC ON LOGOUT to push localforage data to MongoDB
    if (navigator.onLine) {
      await startBackgroundSync();
    }

    localStorage.removeItem("user");
    sessionStorage.removeItem("user");

    navigate("/signin", {
      replace: true,
    });
  };

  return (
    <>
      <nav className="landing-nav">

        {/* ================================ */}
        {/* LOGO */}
        {/* ================================ */}

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

          <h1 className="logo-text user-header-logo-text">
            ALGOBLOCKS
          </h1>
        </div>

        {/* ================================ */}
        {/* RIGHT NAV */}
        {/* ================================ */}

        <div className="nav-links">

          <div
            className="user-menu"
            ref={menuRef}
          >

            {/* AVATAR BUTTON */}
            <button
              type="button"
              className="user-menu-btn"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >

              <span
                className="user-avatar"
                aria-hidden="true"
              >
                {initials}
              </span>

            </button>

            {/* ================================ */}
            {/* DROPDOWN */}
            {/* ================================ */}

            {open && (
              <div
                className="user-dropdown"
                role="menu"
              >

                {/* USER INFO */}
                <div className="user-dropdown-head">

                  <div
                    className="dropdown-avatar"
                    aria-hidden="true"
                  >
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

                  <LuLayoutDashboard
                    size={18}
                    aria-hidden="true"
                  />

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

                  <LuFolder
                    size={18}
                    aria-hidden="true"
                  />

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

                    // CHANGE: ONLY opens modal
                    setShowLogout(true);

                  }}
                  role="menuitem"
                >

                  <LuLogOut
                    size={18}
                    aria-hidden="true"
                  />

                  {" "}Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

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