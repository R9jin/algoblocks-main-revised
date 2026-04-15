import { useEffect, useState } from "react"; // Added missing import
import { FaPython } from "react-icons/fa";
import { IoArrowForward } from "react-icons/io5";
import { LuChartBar, LuCirclePlay, LuPuzzle } from "react-icons/lu";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import "../styles/HomePage.css";

export default function LandingPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  return (
    <div className="landing-container">
      <Header />
      <main className="landing-main">
        <section className="hero home-hero">
          <div className="home-hero-copy">
            <h1 className="slogan-text">
              Think in <span className="accent">Steps</span>.<br />
              <span className="accent">Analyze</span> in Depth.
            </h1>
            <p className="hero-subtitle">
              Build algorithms with interactive blocks and<br />
              get line-by-line feedback on time and space<br />
              performance in real-time.
            </p>
            <div className="hero-buttons">
              {/* Dynamic Call-To-Action based on DB Auth Status */}
              <Link to={user ? "/home" : "/signup"} className="btn-primary">
                {user ? "Continue Learning" : "Start for Free"}
                <IoArrowForward className="btn-icon-inline" aria-hidden="true" />
              </Link>
              <button className="btn-secondary">
                <LuCirclePlay className="btn-icon-inline" aria-hidden="true" />
                Watch Demo
              </button>
            </div>
          </div>
          <div className="home-hero-media" aria-hidden="true">
            <img
              src="/assets/programming-code-editor-illustration-design-vector-removebg-preview.png"
              alt=""
              className="home-hero-image"
            />
          </div>
        </section>

        {/* Feature Cards Section */}
        <section className="feature-cards">
          <h2>Built for Granular Learning</h2>
          <p className="section-subtitle">
            AlgoBlocks bridges the gap between abstract computer science concepts and tangible coding experience.
          </p>
          <div className="cards-grid">
            <div className="card">
              <div className="card-icon">
                <span className="card-icon-badge">
                  <LuPuzzle size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Block-Based Logic</h3>
              <p>Construct complex algorithms using our intuitive drag-and-drop interface. Perfect for beginners and advanced visual learners.</p>
            </div>
            <div className="card">
              <div className="card-icon">
                <span className="card-icon-badge">
                  <LuChartBar size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Line-by-Line Feedback</h3>
              <p>Get instant time and space complexity metrics for every block you place. Understand the why behind the performance.</p>
            </div>
            <div className="card">
              <div className="card-icon">
                <span className="card-icon-badge">
                  <FaPython size={24} color="#7F57F9" aria-hidden="true" />
                </span>
              </div>
              <h3>Python Conversion</h3>
              <p>Automatically convert your visual blocks into clean, production-ready Python source code with a single toggle.</p>
            </div>
          </div>
        </section>

        {/* Everything You Need Section */}
        <section className="features-list">
          <div className="features-content">
            <h2>Everything You Need to Learn Algorithms</h2>
            <ul>
              <li>Built-in algorithm templates with real Python code</li>
              <li>Instant code generation from your block arrangements</li>
              <li>Line-by-line complexity analysis with O-notation</li>
              <li>Save and manage your projects</li>
            </ul>
          </div>
          <div className="code-snippet">
            <pre>
              <code>
                {`def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]: # O(1) compare
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr # Overall: O(n²)`}
              </code>
            </pre>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}