// frontend\src\components\Header.jsx
import { useEffect, useState } from "react";
import { IoArrowForward } from 'react-icons/io5';
import { Link } from "react-router-dom";

export default function Header() {
  const [user, setUser] = useState(null);

  // Check if a user is logged in from the database session
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <nav className="landing-nav">
      <div className="logo-container">
        <img src="./assets/algoblocks_logo.png" alt="AlgoBlocks Logo" className="logo-img" />
        <h1 className="logo-text">ALGOBLOCKS</h1>
      </div>

      <div className="nav-links">
        {user ? (
          <Link to={user ? "/dashboard" : "/signup"} className="btn-primary">
            {user ? "Continue Learning" : "Start Now"}
            <IoArrowForward className="btn-icon-inline" aria-hidden="true" />
          </Link>
        ) : (
          <>
            <Link to="/signin" className="nav-btn signin">Sign In</Link>
            <Link to="/signup" className="nav-btn signup">Start Learning</Link>
          </>
        )}
      </div>
    </nav>
  );
}