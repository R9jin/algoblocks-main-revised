// frontend\src\components\UserHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolder, LuLayoutDashboard, LuLogOut } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import "../styles/UserHeader.css";

export default function UserHeader({
  /**
   * Default user object used when no user data is provided.
   * In production, this will typically come from authentication state.
   */
  user = { name: "Test User", email: "test@example.com" },

  /**
   * Optional logout handler passed by the parent component.
   * If not provided, the component falls back to redirecting to /signin.
   */
  onLogoutClick
}) {

  /** Controls visibility of the user dropdown menu */
  const [open, setOpen] = useState(false);

  /** Reference to the dropdown container for outside-click detection */
  const menuRef = useRef(null);

  /** React Router navigation helper */
  const navigate = useNavigate();

  /**
   * Generates user avatar initials from the user's name.
   * Example: "John Doe" → "JD"
   *
   * useMemo ensures this calculation only runs when the name changes.
   */
  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

  /**
   * Effect responsible for handling global interactions that should
   * close the dropdown menu.
   *
   * Behaviors handled:
   * - Clicking outside the menu closes it.
   * - Pressing the Escape key closes it.
   */
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

  /**
   * Handles the sign-out process.
   *
   * If a custom logout handler is provided by the parent component,
   * it is executed. Otherwise the user is redirected to the sign-in page.
   */
  const onSignOut = () => {
    setOpen(false);

    if (onLogoutClick) {
      onLogoutClick();
    } else {
      navigate("/signin");
    }
  };

  return (
    /**
     * Main navigation container for authenticated users.
     */
    <nav className="landing-nav">

      {/* -------------------------------------------------------------- */}
      {/* Application Branding                                           */}
      {/* -------------------------------------------------------------- */}

      <div className="logo-container">
        <img
          src="/assets/algoblocks_logo.png"
          alt="AlgoBlocks Logo"
          className="logo-img"
        />
        {/* Added a specific class to target the white text for this header only */}
        <h1 className="logo-text user-header-logo-text">ALGOBLOCKS</h1>
      </div>


      {/* -------------------------------------------------------------- */}
      {/* User Menu Section                                              */}
      {/* -------------------------------------------------------------- */}

      <div className="nav-links">
        <div className="user-menu" ref={menuRef}>

          {/*
            Avatar button that toggles the visibility of the dropdown menu.
            Accessibility attributes help screen readers identify the menu.
          */}
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


          {/* ---------------------------------------------------------- */}
          {/* Dropdown Menu                                              */}
          {/* ---------------------------------------------------------- */}

          {open && (
            <div className="user-dropdown" role="menu">

              {/* User information header inside the dropdown */}
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


              {/* Dashboard navigation option */}
              <button
                type="button"
                className="user-dd-item"
                onClick={() => {
                  setOpen(false);
                  navigate("/dashboard");
                }}
                role="menuitem"
              >
                <LuLayoutDashboard size={18} aria-hidden="true" />
                Go to Dashboard
              </button>


              {/* Projects navigation option */}
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


              {/* Divider separating navigation from account actions */}
              <div className="user-dd-divider" />


              {/* Sign-out action */}
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

    </nav>
  );
}