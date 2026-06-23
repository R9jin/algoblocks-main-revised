// frontend/src/pages/HomePage.jsx
import { FaPython } from "react-icons/fa";
import {
  LuActivity,
  LuBookOpen,
  LuCirclePlay,
  LuFolder,
  LuPuzzle,
  LuTrendingUp
} from "react-icons/lu";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import "../styles/HomePage.css";

export default function LandingPage() {
  const handleGuestLogin = () => {
    // Generate a random guest identity
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
    
    // Store in localStorage to authenticate the session
    localStorage.setItem("user", JSON.stringify(guestUser));
    localStorage.setItem("token", guestToken);
    localStorage.setItem("authToken", guestToken);
    
    // Hard redirect to immediately bypass any lingering React state
    window.location.href = "/dashboard";
  };

  return (
    <div className="saas-container light-mode-theme">
      <Header />
      <main className="saas-main">

        {/* SECTION 1: HERO */}
        <section id="hero" className="saas-section bg-primary hero-layout">
          <div className="hero-content-left">
            <div className="badge">INTERACTIVE ALGORITHM LEARNING</div>
            <h1 className="hero-title">
              Think in <span className="text-accent">Steps</span>.<br/>
              <span className="text-accent">Analyze</span> in Depth.
            </h1>
            <p className="body-text">
              Build algorithms visually and understand how every decision affects performance. Generate Python code, explore complexity analysis, and strengthen your computational thinking skills.
            </p>

            <div className="cta-group">
              <Link to="/signup" className="btn-primary-accent">Start Now</Link>
              {/* NEW WATCH DEMO BUTTON */}
              <a 
                href="https://drive.google.com/file/d/1XW7yzKIJ7YdFg6P29Ru2W6bo_xXmXfWk/view?usp=sharing" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn-secondary-accent"
              >
                <LuCirclePlay size={22} />
                Watch Demo
              </a>
            </div>
          </div>
          <div className="hero-media-right">
            <img src="/assets/hero-image.png" alt="Workspace Preview" />
          </div>
        </section>

        {/* SECTION 2: BENEFITS */}
        <section id="benefits" className="saas-section bg-white">
          <div className="section-header center">
            <span className="section-label">WHY ALGOBLOCKS</span>
            <h2>Learn Visually. Understand Deeply. Improve Faster.</h2>
            <p>AlgoBlocks transforms abstract algorithm concepts into interactive learning experiences that make algorithm design easier to understand.</p>
          </div>
          <div className="benefits-grid">
            <div className="benefit-card">
              <div className="card-icon-wrapper"><LuPuzzle size={24} /></div>
              <h3>Build Visually</h3>
              <p>Create algorithm solutions using intuitive drag-and-drop blocks.</p>
            </div>
            <div className="benefit-card">
              <div className="card-icon-wrapper"><LuActivity size={24} /></div>
              <h3>Analyze Complexity</h3>
              <p>Understand how operations contribute to overall performance.</p>
            </div>
            <div className="benefit-card">
              <div className="card-icon-wrapper"><FaPython size={24} /></div>
              <h3>Generate Python Code</h3>
              <p>Bridge visual learning with real programming concepts.</p>
            </div>
            <div className="benefit-card">
              <div className="card-icon-wrapper"><LuBookOpen size={24} /></div>
              <h3>Continue Learning</h3>
              <p>Save projects and strengthen problem-solving skills through practice.</p>
            </div>
          </div>
        </section>

        {/* SECTION 3: HOW IT WORKS */}
        <section id="how-it-works" className="saas-section bg-primary">
          <div className="section-header center">
            <span className="section-label">3 SIMPLE STEPS</span>
            <h2>Learn and Improve in Three Steps</h2>
            <p>A structured workflow designed to help students understand algorithms from logic construction to performance analysis.</p>
          </div>
          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">1</div>
              <h3>Build with Blocks</h3>
              <p>Design algorithm solutions visually.</p>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <h3>Generate Code</h3>
              <p>Convert visual logic into Python.</p>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <h3>Review Complexity</h3>
              <p>Receive line-by-line analysis and optimization feedback.</p>
            </div>
          </div>
        </section>

        {/* SECTION 4: FEATURES */}
        <section id="features" className="saas-section bg-white">
          <div className="section-header center">
            <span className="section-label">LEARNING HUB</span>
            <h2>Everything You Need to Master Algorithms</h2>
            <p>Tools designed to help students practice, analyze, and improve algorithmic thinking.</p>
          </div>
          <div className="features-grid">
            <div className="feature-item">
              <LuFolder className="feature-icon" size={28} />
              <div>
                <h3>Open Saved Projects</h3>
                <p>Resume previous work and continue refining solutions.</p>
              </div>
            </div>
            <div className="feature-item">
              <LuBookOpen className="feature-icon" size={28} />
              <div>
                <h3>Guided Learning Mode</h3>
                <p>Practice through structured lessons and exercises.</p>
              </div>
            </div>
            <div className="feature-item">
              <LuActivity className="feature-icon" size={28} />
              <div>
                <h3>Performance Feedback</h3>
                <p>Identify inefficiencies through detailed analysis.</p>
              </div>
            </div>
            <div className="feature-item">
              <LuTrendingUp className="feature-icon" size={28} />
              <div>
                <h3>History & Progress</h3>
                <p>Track milestones and review learning growth.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: WORKSPACE PREVIEW */}
        <section id="workspace-preview" className="saas-section bg-alternate">
          <div className="workspace-layout">
            <div className="workspace-text">
              <span className="section-label">POWERFUL ANALYZER</span>
              <h2>See Every Detail.<br/>Improve Every Time.</h2>
              <p>Visualize how your algorithms perform through detailed educational feedback and performance analysis.</p>
              <ul className="workspace-list">
                <li>Blockly Workspace</li>
                <li>Python Output</li>
                <li>Time Complexity</li>
                <li>Space Complexity</li>
                <li>Memory Visualization</li>
              </ul>
            </div>
            <div className="workspace-image">
              <img src="/assets/workspace1.png" alt="Workspace Preview Placeholder" />
            </div>
          </div>
        </section>

        {/* SECTION 6: ABOUT US */}
        <section id="mission" className="saas-section bg-primary">
          <div className="about-layout">
            <div className="about-content">
              <span className="section-label">OUR MISSION</span>
              <h2>Making Algorithm Learning More Accessible</h2>
              <p className="about-description">
                AlgoBlocks helps students understand algorithms through visualization, interaction, and immediate feedback.
              </p>
              <div className="about-points">
                <div className="about-point">
                  <h4>Mission</h4>
                  <p>Make algorithm education easier to understand through interactive learning experiences.</p>
                </div>
                <div className="about-point">
                  <h4>Learning Philosophy</h4>
                  <p>Students learn better when they can visualize, experiment, and receive immediate feedback.</p>
                </div>
                <div className="about-point">
                  <h4>Educational Impact</h4>
                  <p>Bridge the gap between theoretical computer science and practical problem-solving.</p>
                </div>
              </div>
            </div>
            <div className="about-image">
              <img src="/assets/learning.jpg" alt="About Us" />
            </div>
          </div>
        </section>

        {/* SECTION 7: FINAL CTA */}
        <section id="final-cta" className="saas-section bg-white center">
          <div className="cta-box">
            <h2>Ready to Start Your Algorithm Journey?</h2>
            <p>Learn, build, analyze, and improve your algorithmic thinking skills with AlgoBlocks for FREE!</p>
            <div className="cta-group justify-center mt-2">
              <Link to="/signup" className="btn-primary-accent">Start Now</Link>
              <button type="button" className="btn-secondary-accent" onClick={handleGuestLogin}>
                Try as Guest
              </button>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}