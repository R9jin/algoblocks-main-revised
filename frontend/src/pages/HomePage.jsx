// frontend/src/pages/HomePage.jsx
import { FaPython, FaUserCircle } from "react-icons/fa";
import { IoArrowForward } from "react-icons/io5";
import { LuChartBar, LuPuzzle } from "react-icons/lu";
import { Link } from "react-router-dom";
import { clearLocalUserData } from "../db";
import Footer from "../components/Footer";
import Header from "../components/Header";
import "../styles/HomePage.css";

export default function LandingPage() {
  const handleGuestLogin = async () => {
    // BUG FIX: this never cleared the local IndexedDB cache before starting
    // a guest session, so a previous account's cached progress, assessment
    // scores, and activity submissions (all stored globally, not per-user --
    // see db.js) were still sitting in IndexedDB and got read straight into
    // the new guest's learning path. Clear it first so guests always start
    // from a clean slate.
    await clearLocalUserData();

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
    <div className="landing-container public-homepage">
      <Header />
      <main className="landing-main">
        {/* Hero Section */}
        <section className="hero home-hero">
          <div className="home-hero-copy">
            <div className="hero-badge">Welcome to AlgoBlocks</div>
            <h1 className="slogan-text">
              Think in <span className="accent">Steps</span>.<br />
              <span className="accent">Analyze</span> in Depth.
            </h1>
            <p className="hero-subtitle">
              Learn algorithms through guided lessons, build solutions with Blockly, generate readable Python, and see how every choice affects time and space complexity.
            </p>
            <div className="hero-buttons">
              <Link to="/signup" className="btn-primary">
                Start Now
                <IoArrowForward className="btn-icon-inline" aria-hidden="true" />
              </Link>
              <button 
                type="button" 
                className="btn-secondary guest-btn" 
                onClick={handleGuestLogin}
              >
                <FaUserCircle className="btn-icon-inline" aria-hidden="true" />
                Try as Guest
              </button>
            </div>
          </div>
          <div className="home-hero-media" aria-hidden="true">
            <div className="hero-glow"></div>
            <img
              src="/assets/blockly-workspace.png"
              alt="Programming code editor illustration"
              className="home-hero-image"
            />
          </div>
        </section>

        {/* What You'll Learn Section */}
        <section className="feature-cards homepage-section" id="what-youll-learn">
          <div className="section-header">
            <span className="section-eyebrow">Build strong foundations</span>
            <h2>What You&apos;ll Learn</h2>
            <p className="section-subtitle">
              Work through the essential ideas and problem-solving patterns behind efficient algorithms.
            </p>
          </div>
          <div className="cards-grid learning-topics-grid">
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">O(n)</span></div>
              <h3>Big-O Notation</h3>
              <p>Understand how running time and memory use grow as input sizes increase.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">S</span></div>
              <h3>Searching &amp; Sorting</h3>
              <p>Explore foundational techniques for finding and organizing data efficiently.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">D&amp;C</span></div>
              <h3>Divide and Conquer</h3>
              <p>Break large problems into smaller pieces, solve them, and combine the results.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">G</span></div>
              <h3>Greedy Algorithms</h3>
              <p>Learn when locally optimal choices can lead to an efficient overall solution.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">DP</span></div>
              <h3>Dynamic Programming</h3>
              <p>Reuse solutions to overlapping subproblems to avoid repeated work.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">BT</span></div>
              <h3>Backtracking</h3>
              <p>Explore possible choices systematically and recover when a path does not work.</p>
            </div>
          </div>
        </section>

        {/* Learning Journey Section */}
        <section className="homepage-section journey-section" id="learning-journey">
          <div className="section-header">
            <span className="section-eyebrow">Learn by doing</span>
            <h2>Your Learning Journey</h2>
            <p className="section-subtitle">
              Move from a new concept to a stronger solution through one connected, repeatable workflow.
            </p>
          </div>
          <ol className="journey-steps">
            <li className="glass-panel"><span>1</span><h3>Study the lesson</h3><p>Learn the concept with clear explanations and examples.</p></li>
            <li className="glass-panel"><span>2</span><h3>Build using Blockly</h3><p>Turn your reasoning into a visual, working algorithm.</p></li>
            <li className="glass-panel"><span>3</span><h3>Generate Python code</h3><p>Connect each block to readable, executable Python.</p></li>
            <li className="glass-panel"><span>4</span><h3>Analyze complexity</h3><p>Inspect the time and space cost of your approach.</p></li>
            <li className="glass-panel"><span>5</span><h3>Improve your solution</h3><p>Refine your logic and compare more efficient strategies.</p></li>
          </ol>
        </section>

        {/* Interactive Learning Tools Section */}
        <section className="feature-cards homepage-section" id="learning-tools">
          <div className="section-header">
            <span className="section-eyebrow">Everything works together</span>
            <h2>Interactive Learning Tools</h2>
            <p className="section-subtitle">
              See abstract algorithm ideas become concrete as you build, run, and analyze them.
            </p>
          </div>
          <div className="cards-grid tools-grid">
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge"><LuPuzzle size={28} color="#6541D8" aria-hidden="true" /></span></div>
              <h3>Blockly Workspace</h3><p>Build algorithms visually with an approachable drag-and-drop workspace.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge"><FaPython size={28} color="#6541D8" aria-hidden="true" /></span></div>
              <h3>Python Code Generation</h3><p>Translate your blocks into Python and connect visual logic with code.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge"><LuChartBar size={28} color="#6541D8" aria-hidden="true" /></span></div>
              <h3>Complexity Analyzer</h3><p>Examine line-by-line time and space complexity with Big-O feedback.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">MB</span></div>
              <h3>Memory Visualization</h3><p>Watch values and data structures change as your algorithm runs.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">GO</span></div>
              <h3>Guided Learning</h3><p>Follow structured lessons that build understanding one concept at a time.</p>
            </div>
            <div className="card glass-panel">
              <div className="card-icon"><span className="card-icon-badge topic-symbol" aria-hidden="true">%</span></div>
              <h3>Progress Tracking</h3><p>Keep your learning momentum visible as you complete each module.</p>
            </div>
          </div>
        </section>

        {/* Learning Path Section */}
        <section className="homepage-section learning-path-section" id="learning-path">
          <div className="section-header">
            <span className="section-eyebrow">A clear route forward</span>
            <h2>Learning Path Preview</h2>
            <p className="section-subtitle">
              Progress from algorithm basics to powerful problem-solving techniques in seven focused modules.
            </p>
          </div>
          <div className="module-grid">
            <div className="module-card glass-panel"><span>Module 0</span><h3>Getting Started</h3></div>
            <div className="module-card glass-panel"><span>Module 1</span><h3>Big-O Notation</h3></div>
            <div className="module-card glass-panel"><span>Module 2</span><h3>Brute Force</h3></div>
            <div className="module-card glass-panel"><span>Module 3</span><h3>Divide &amp; Conquer</h3></div>
            <div className="module-card glass-panel"><span>Module 4</span><h3>Greedy</h3></div>
            <div className="module-card glass-panel"><span>Module 5</span><h3>Dynamic Programming</h3></div>
            <div className="module-card glass-panel"><span>Module 6</span><h3>Backtracking</h3></div>
          </div>
        </section>

        {/* Final Call to Action */}
        <section className="final-cta glass-panel" aria-labelledby="final-cta-heading">
          <span className="section-eyebrow">Start for free</span>
          <h2 id="final-cta-heading">Ready to think like an algorithm designer?</h2>
          <p>Learn at your own pace, build solutions visually, and understand the performance behind your code.</p>
          <div className="hero-buttons">
            <Link to="/signup" className="btn-primary">Create Account<IoArrowForward className="btn-icon-inline" aria-hidden="true" /></Link>
            <button type="button" className="btn-secondary guest-btn" onClick={handleGuestLogin}>
              <FaUserCircle className="btn-icon-inline" aria-hidden="true" />Try as Guest
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
