// frontend/src/pages/HomePage.jsx
import { FaPython, FaUserCircle } from "react-icons/fa";
import { IoArrowForward, IoCheckmarkCircle } from "react-icons/io5";
import { LuChartBar, LuPuzzle } from "react-icons/lu";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import "../styles/HomePage.css";

export default function LandingPage() {
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
    <div className="landing-container">
      {/* Dynamic Ambient Background Elements */}
      <div className="ambient-background">
        <div className="ambient-orb orb-1"></div>
        <div className="ambient-orb orb-2"></div>
        <div className="ambient-orb orb-3"></div>
      </div>
      
      <Header />
      
      <main className="landing-main">
        {/* COMPLETELY NEW HERO LAYOUT: Centered, Massive, Cinematic */}
        <section className="hero-cinematic">
          <div className="hero-content-wrapper">
            <div className="badge-pill">Interactive Educational Tool</div>
            <h1 className="slogan-text-massive">
              Think in <span className="text-glow">Steps</span>.<br />
              Analyze in <span className="text-glow">Depth</span>.
            </h1>
            <p className="hero-subtitle-centered">
              Build algorithms with interactive blocks and get line-by-line feedback<br />
              on time and space performance in real-time.
            </p>
            <div className="hero-action-row">
              <Link to="/signup" className="btn-mega-primary">
                Start Now
                <IoArrowForward className="icon-pulse" aria-hidden="true" />
              </Link>
              <button 
                type="button" 
                className="btn-mega-secondary" 
                onClick={handleGuestLogin}
              >
                <FaUserCircle aria-hidden="true" />
                Try as Guest
              </button>
            </div>
          </div>
          
          <div className="hero-dashboard-showcase">
            <div className="browser-mockup">
              <div className="browser-header">
                <span className="dot dot-r"></span>
                <span className="dot dot-y"></span>
                <span className="dot dot-g"></span>
              </div>
              <img
                src="/assets/programming-code-editor-illustration-design-vector-removebg-preview.png"
                alt="Programming code editor illustration"
                className="dashboard-mockup-img"
              />
            </div>
          </div>
        </section>

        {/* BENTO BOX GRID FOR FEATURES */}
        <section className="bento-features">
          <div className="bento-header">
            <h2 className="bento-title">Built for Granular Learning</h2>
            <p className="bento-subtitle">
              AlgoBlocks bridges the gap between abstract computer science concepts and tangible coding experience.
            </p>
          </div>
          
          <div className="bento-grid">
            <div className="bento-item item-large">
              <div className="bento-icon logic-icon">
                <LuPuzzle size={36} />
              </div>
              <div className="bento-text">
                <h3>Block-Based Logic</h3>
                <p>Construct complex algorithms using our intuitive drag-and-drop interface. Perfect for beginners and advanced visual learners.</p>
              </div>
            </div>
            
            <div className="bento-item item-tall">
              <div className="bento-icon feedback-icon">
                <LuChartBar size={36} />
              </div>
              <div className="bento-text">
                <h3>Line-by-Line Feedback</h3>
                <p>Get instant time and space complexity metrics for every block you place. Understand the why behind the performance.</p>
              </div>
            </div>
            
            <div className="bento-item item-wide">
              <div className="bento-icon python-icon">
                <FaPython size={36} />
              </div>
              <div className="bento-text">
                <h3>Python Conversion</h3>
                <p>Automatically convert your visual blocks into clean, production-ready Python source code with a single toggle.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ASYMMETRICAL SPLIT SECTION */}
        <section className="split-learning-section">
          <div className="split-text-pane">
            <div className="decorative-line"></div>
            <h2>Everything You Need to Learn Algorithms</h2>
            <ul className="impact-list">
              <li>
                <div className="impact-icon"><IoCheckmarkCircle /></div>
                <span>Built-in algorithm templates with real Python code</span>
              </li>
              <li>
                <div className="impact-icon"><IoCheckmarkCircle /></div>
                <span>Instant code generation from your block arrangements</span>
              </li>
              <li>
                <div className="impact-icon"><IoCheckmarkCircle /></div>
                <span>Line-by-line complexity analysis with O-notation</span>
              </li>
              <li>
                <div className="impact-icon"><IoCheckmarkCircle /></div>
                <span>Save and manage your projects</span>
              </li>
            </ul>
          </div>
          <div className="split-image-pane">
            <div className="perspective-wrapper">
              <img
                src="/assets/example.png"
                alt="AlgoBlocks Interface Example"
                className="perspective-img"
              />
              <div className="img-glow-layer"></div>
            </div>
          </div>
        </section>

      </main>
      
      {/* Footer has been completely removed from here */}
    </div>
  );
}