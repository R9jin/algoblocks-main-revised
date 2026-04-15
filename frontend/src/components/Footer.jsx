/**
 * Footer Component
 *
 * This component renders the footer section displayed at the bottom
 * of the application pages. The footer provides a simple branding
 * and copyright notice indicating ownership of the AlgoBlocks system.
 *
 * The year is generated dynamically to ensure that the displayed
 * copyright information remains accurate without requiring manual updates.
 */

import "../styles/Footer.css";

export default function Footer() {
  return (
    /**
     * Footer container for the landing interface.
     * Styling and layout are controlled through the associated CSS file.
     */
    <footer className="landing-footer">

      {/* Inner container used to structure footer content */}
      <div className="footer-content">

        {/*
          Displays a dynamic copyright notice.
          The current year is retrieved from the system date at runtime
          to automatically update each year.
        */}
        <p>
          &copy; {new Date().getFullYear()} AlgoBlocks. All rights reserved.
        </p>

      </div>
    </footer>
  );
}