// frontend/src/components/Header.jsx
import { Link } from "react-router-dom";

export default function Header() {

  const handleGuestLogin = () => {
    // Generate a random guest identity
    const guestId = `guest_${Math.floor(Math.random() * 1000000)}`;
    const guestUser = {
      _id: guestId,
      name: "Guest Explorer",
      email: `${guestId}@guest.local`,
      isGuest: true, // Flag to identify guest users across the app
      progress: {},
      assessments: {}
    };
    
    const guestToken = `guest_token_${Date.now()}`;
    
    // Store in localStorage to authenticate the session
    localStorage.setItem("user", JSON.stringify(guestUser));
    localStorage.setItem("token", guestToken);
    localStorage.setItem("authToken", guestToken);
    
    // Hard redirect to immediately bypass any lingering React state
    window.location.href = "/dashboard";
  };

  return (
    <nav className="landing-nav">
      <div className="logo-container">
        <img src="/assets/algoblocks_logo.png" alt="AlgoBlocks Logo" className="logo-img" />
        <h1 className="logo-text" style={{ color: "#EBE4FF" }}>ALGOBLOCKS</h1>
      </div>

      <div className="nav-links">
        <Link to="/signin" className="nav-btn signin">Sign In</Link>
        <button 
          onClick={handleGuestLogin} 
          className="nav-btn signup" 
          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem' }}
        >
          Try as Guest
        </button>
      </div>
    </nav>
  );
}