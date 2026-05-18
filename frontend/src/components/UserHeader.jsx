// frontend/src/components/UserHeader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolder, LuLayoutDashboard, LuLogOut } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
// 1. Import your ConfirmModal component
import ConfirmModal from "./ConfirmModal";

export default function UserHeader({
  user = { name: "Test User", email: "test@example.com" },
  onLogoutClick
}) {
  const [open, setOpen] = useState(false);
  
  // 2. Add state for the logout confirmation modal
  const [showLogoutModal, setShowLogoutModal] = useState(false); 
  
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const initials = useMemo(() => {
    const parts = (user?.name || "User").trim().split(/\s+/);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [user?.name]);

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

  // 3. Trigger the modal instead of logging out immediately
  const handleSignOutClick = () => {
    setOpen(false); // Close the dropdown menu
    setShowLogoutModal(true); // Open the popup
  };

  // 4. The actual function that runs when the user hits "Confirm"
  const confirmSignOut = () => {
    setShowLogoutModal(false);

    if (onLogoutClick) {
      onLogoutClick();
    } else {
      localStorage.removeItem("user");
      // Replace history to prevent using the browser "back" button to re-enter
      navigate("/signin", { replace: true });
    }
  };

  return (
    <>
      <nav className="landing-nav">
        <div className="logo-container">
          <img
            src="/assets/algoblocks_logo.png"
            alt="AlgoBlocks Logo"
            className="logo-img"
          />
          <h1 className="logo-text">ALGOBLOCKS</h1>
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
                  <div className="user-name">{user?.name || "User"}</div>
                  <div className="user-email">{user?.email || ""}</div>
                </div>

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

                {/* 5. Update this button to open the modal */}
                <button
                  type="button"
                  className="user-dd-item danger"
                  onClick={handleSignOutClick}
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

      {/* 6. Render the Confirm Modal conditionally */}
      {showLogoutModal && (
        <ConfirmModal
          title="Sign Out"
          message="Are you sure you want to sign out?"
          onConfirm={confirmSignOut}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}
    </>
  );
}