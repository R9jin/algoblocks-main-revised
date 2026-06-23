// frontend/src/components/Header.jsx
import { Link } from "react-router-dom";

export default function Header() {
  const handleGuestLogin = () => {
    const guestId = `guest_${Math.floor(Math.random() * 1000000)}`;
    const guestUser = {
      _id: guestId,
      name: "Guest Explorer",
      email: `${guestId}@guest.local`,
      isGuest: true,
      progress: {},
      assessments: {}
    };
    const guestToken = `guest_token_${Date.now()}`;
    
    localStorage.setItem("user", JSON.stringify(guestUser));
    localStorage.setItem("token", guestToken);
    localStorage.setItem("authToken", guestToken);
    
    window.location.href = "/dashboard";
  };

  return (
    <nav className="saas-nav premium-nav">
      <div className="saas-logo-container">
        <img src="/assets/Lugu.svg" alt="AlgoBlocks Logo" className="saas-logo-img" />
        <h1 className="saas-logo-text">ALGOBLOCKS</h1>
      </div>

      <div className="nav-center-links">
        <a href="#benefits">Benefits</a>
        <a href="#how-it-works">How It Works</a>
        <a href="#features">Features</a>
        <a href="#workspace-preview">Workspace</a>
        <a href="#about-us">About Us</a>
      </div>

      <div className="nav-actions-right">
        <Link to="/signin" className="nav-link-subtle">Sign In</Link>
        <button onClick={handleGuestLogin} className="btn-accent-outline">
          Try as Guest
        </button>
      </div>
    </nav>
  );
}