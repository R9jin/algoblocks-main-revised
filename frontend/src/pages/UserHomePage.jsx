import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import UserHeader from "../components/UserHeader";
import "../styles/UserHomePage.css";

import { IoArrowForward } from "react-icons/io5";
import { LuBookOpen, LuChartBar, LuCirclePlay, LuFolder } from "react-icons/lu";

export default function UserHomePage() {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false); // <-- New state for the prompt
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // Load the user from the database session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate("/signin"); // Protect the route
    }
  }, [navigate]);

  const confirmLogout = () => {
    setShowLogoutModal(false);
    navigate("/signin");
  };

  const handleModeSelect = (mode) => {
    setShowModeModal(false);
    // Navigate to the app and pass the selected mode in the state
    navigate("/app", { state: { initialCodingMode: mode } });
  };

  if (!user) return null;

  return (
    <div className="landing-container user-homepage">
      <UserHeader user={user} onLogoutClick={() => setShowLogoutModal(true)} />
      <main className="landing-main">
        {/* Hero Section */}
        <section className="hero home-hero">
          <div className="home-hero-copy">
            <p className="welcome-text">Welcome Back, {user.name}!</p>

            <h1 className="slogan-text">
              Think in <span className="accent">Steps</span>.<br />
              <span className="accent">Analyze</span> in Depth.
            </h1>

            <p className="hero-subtitle">
              Continue where you left off, open a saved project, or start a new workspace
              with line-by-line time and space complexity feedback.
            </p>

            <div className="hero-buttons">
              {/* Changed from Link to a button that triggers the prompt */}
              <button 
                className="btn-primary" 
                onClick={() => setShowModeModal(true)}
              >
                Continue to Playground
                <IoArrowForward className="btn-icon-inline" aria-hidden="true" />
              </button>

              <button className="btn-secondary" type="button">
                <LuCirclePlay className="btn-icon-inline" aria-hidden="true" />
                Watch Demo
              </button>
            </div>
          </div>

          <div className="home-hero-media" aria-hidden="true">
            <img
              src="/assets/programming-code-editor-illustration-design-vector-removebg-preview.png"
              alt="Programming code editor illustration"
              className="home-hero-image"
            />
          </div>
        </section>

        {/* Feature Cards Section */}
        <section className="feature-cards">
          <h2>Your Learning Hub</h2>
          <p className="section-subtitle">
            Quick actions to practice, review projects, and improve your algorithm solutions.
          </p>

          <div className="cards-grid">
            <div
              className="card"
              onClick={() => navigate("/projects")}
              style={{ cursor: "pointer" }}
            >
              <div className="card-icon">
                <span className="card-icon-badge">
                  <LuFolder size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Open Saved Projects</h3>
              <p>
                Resume previous sessions and refine your logic with line-by-line complexity insights.
              </p>
            </div>

            <div
              className="card"
              onClick={() => navigate("/learning-path")}
              style={{ cursor: "pointer" }}
            >
              <div className="card-icon">
                <span className="card-icon-badge">
                  <LuBookOpen size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Learning Mode</h3>
              <p>
                Practice guided tasks with structured hints to strengthen your step-by-step understanding.
              </p>
            </div>

            <div
              className="card"
              onClick={() => setShowModeModal(true)} // <-- Also trigger prompt here
              style={{ cursor: "pointer" }}
            >
              <div className="card-icon">
                <span className="card-icon-badge">
                  <LuChartBar size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Performance Feedback</h3>
              <p>
                See how edits change Big-O and identify where inefficiencies appear in your solution.
              </p>
            </div>
          </div>
        </section>

        {/* Everything You Need Section */}
        <section className="features-list">
          <div className="features-content">
            <h2>Everything You Need, in One Place</h2>
            <ul>
              <li>Continue learning with saved sessions and templates</li>
              <li>Line-by-line time and space complexity feedback</li>
              <li>Python code output for review and submission</li>
              <li>Access dashboard, history, and settings anytime</li>
            </ul>
          </div>

          <div className="feature-image-container">
            <img
              src="/assets/example.png"
              alt="AlgoBlocks Interface Example"
              className="feature-example-image"
            />
          </div>
        </section>
      </main>

      <Footer />

      {/* THE WORKSPACE MODE MODAL */}
      {showModeModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: '#1C1236', padding: '40px', borderRadius: '12px',
            textAlign: 'center', border: '1px solid #6C5CE7', maxWidth: '500px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', position: 'relative'
          }}>
            <button 
              onClick={() => setShowModeModal(false)} 
              style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: '#A096B9', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              ✕
            </button>
            <h2 style={{ color: '#EBE4FF', marginBottom: '15px' }}>Choose Workspace Mode</h2>
            <p style={{ color: '#A096B9', marginBottom: '30px', lineHeight: '1.5' }}>
              Select how you want to build your algorithm. You can use our visual block builder or jump straight into writing Python code.
            </p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button onClick={() => handleModeSelect('blocks')} style={{
                padding: '12px 24px', background: '#6C5CE7', color: 'white', fontWeight: 'bold',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <img src="/assets/blocks-icon.png" alt="Blocks" style={{width: '20px', filter: 'brightness(0) invert(1)'}}/> 
                Block Workspace
              </button>
              <button onClick={() => handleModeSelect('manual')} style={{
                padding: '12px 24px', background: 'transparent', color: '#6C5CE7', fontWeight: 'bold',
                border: '2px solid #6C5CE7', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <img src="/assets/python-icon.png" alt="Python" style={{width: '20px'}}/> 
                Manual Coding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THE LOGOUT POPUP MODAL */}
      {showLogoutModal && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <h2>Logout Confirmation</h2>
            <p>Are you sure you want to logout?</p>
            <div className="logout-modal-actions">
              <button className="logout-btn" onClick={confirmLogout}>Confirm</button>
              <button className="logout-btn" onClick={() => setShowLogoutModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}