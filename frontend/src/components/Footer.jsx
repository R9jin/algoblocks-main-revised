import "../styles/Footer.css";

export default function Footer() {
  return (
    <footer className="edu-footer">
      <div className="edu-footer-content">
        {/* Left Column: Brand & Thesis Info */}
        <div className="footer-brand">
          <div className="footer-logo">
            <img src="/assets/Lugu.svg" alt="AlgoBlocks Logo" />
            <h3>AlgoBlocks</h3>
          </div>
          <p className="thesis-title">
            An Interactive System for Learning Algorithms Using Line-by-Line Complexity Feedback
          </p>
          <p className="university-text">
            Developed for academic research at the <strong>University of Cabuyao (Pamantasan ng Cabuyao)</strong>.
          </p>
        </div>

        {/* Middle Column: Quick Links */}
        <div className="footer-links">
          <h4>Explore</h4>
          <a href="#benefits">Benefits</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#workspace-preview">The Analyzer</a>
          <a href="#mission">Our Mission</a>
        </div>

        {/* Right Column: The Team */}
        <div className="footer-team">
          <h4>The Project</h4>
          <p>
            Created by a dedicated Computer Science research team to bridge the gap between theoretical computer science and practical, interactive problem-solving.
          </p>
        </div>
      </div>

      {/* Bottom Bar: Copyright & Accessibility */}
      <div className="edu-footer-bottom">
        <p>&copy; 2026 AlgoBlocks Research Team. Built for educational purposes.</p>
        <span className="free-badge">100% Free & Open Access</span>
      </div>
    </footer>
  );
}