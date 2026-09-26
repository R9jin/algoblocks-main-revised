// frontend/src/components/Footer.jsx
import '../styles/Footer.css';

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-brand-name">
            <img src="/assets/algoblocks_logo.png" alt="" className="footer-logo" />
            <strong>ALGOBLOCKS</strong>
          </div>
          <p className="footer-tagline">Learn algorithms visually, one step at a time.</p>
          <p className="footer-description">
            Build with Blockly, generate Python code, and understand time and space
            complexity through guided, interactive lessons.
          </p>
        </div>

        <div className="footer-learning">
          <h2>Learning with AlgoBlocks</h2>
          <ul>
            <li>Guided Lessons</li>
            <li>Blockly Programming</li>
            <li>Python Generation</li>
            <li>Complexity Analysis</li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>AlgoBlocks is an educational platform built for learning and research purposes.</p>
      </div>
    </footer>
  );
}
