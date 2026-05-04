// frontend/src/components/Footer.jsx
import '../styles/Footer.css';

export default function Footer() {
  return (
    <footer className="landing-footer" style={{ padding: '24px', fontSize: '0.9rem', lineHeight: '1.6' }}>
      <p style={{ margin: '0 0 8px 0', color: '#EBE4FF' }}>
        <strong>AlgoBlocks</strong>
      </p>
      <p style={{ margin: '0', color: '#BCA1FC', fontSize: '0.85rem' }}>
        A Computer Science Thesis Project
      </p>
      <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', opacity: 0.8, color: '#A096B9' }}>
        Built strictly for educational and research purposes.
      </p>
    </footer>
  );
}