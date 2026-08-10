// frontend/src/components/PolicyModal.jsx
//
// Shared read-the-policy modal used by PolicyConsent.jsx. Renders either
// the Privacy Policy or Terms & Conditions body depending on `type`, so
// there's one place to update this copy rather than two.
//
// Rendered via createPortal into document.body -- NOT inline where it's
// used. This modal is opened from inside .auth-card (SignUp/SignIn), and
// .auth-card h2 applies a gradient text-clip effect (transparent fill)
// meant for the page's own "Sign Up for AlgoBlocks" heading. Rendered
// inline, this modal's <h2>Privacy Policy</h2> would inherit that same
// rule -- transparent gradient text on a gradient header background is
// how you get text that's nearly invisible. A portal makes this modal a
// sibling of the page root instead of a descendant of .auth-card, so it's
// immune to that (and any other) page-specific CSS bleed-through.
import { createPortal } from "react-dom";
import { FiShield, FiFileText, FiX } from "react-icons/fi";
import "../styles/PolicyModal.css";

const PRIVACY_SECTIONS = [
  {
    heading: "1. Who we are and what this covers",
    body: `AlgoBlocks is an academic learning platform developed as part of an undergraduate thesis project. This Privacy Policy explains what personal information we collect when you create an account and use the platform, why we collect it, and your rights over it under the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines.`,
    links: [
      { label: "Read RA 10173 (Official Gazette)", href: "https://www.officialgazette.gov.ph/2012/08/15/republic-act-no-10173/" },
      { label: "National Privacy Commission", href: "https://privacy.gov.ph/data-privacy-act/" },
    ],
  },
  {
    heading: "2. Information we collect",
    body: `When you register, we collect your full name, email address, and a securely hashed password (we never store your password in plain text). As you use the platform, we also collect: your learning progress and lesson completion status; assessment answers, scores, and time spent; the visual-block programs and generated code you build and choose to save; and basic account metadata such as onboarding status and account role.`,
  },
  {
    heading: "3. Why we collect it",
    body: `Your information is used to operate your account (authentication, saving and restoring your progress and projects), to generate the learning-progress and complexity-accuracy feedback the platform shows you, and \u2014 in aggregate, de-identified form \u2014 to evaluate learning outcomes as part of the thesis research this platform was built for. We do not use your data for advertising, and we do not sell your personal information to third parties.`,
  },
  {
    heading: "4. Who we share it with",
    body: `We do not share your personal information with third parties for their own marketing purposes. Limited technical processors are used to run the platform itself: our hosting provider (Vercel), our database provider (Neon/PostgreSQL), our transactional email provider (MailerSend, used only for password-reset emails), and, if you choose to sign in with Google, Google's OAuth service to verify your identity. Each only receives the minimum data needed to perform its function.`,
  },
  {
    heading: "5. Data retention",
    body: `We retain your account and learning data for as long as your account remains active, or as needed to support the academic evaluation this platform was built for. You may request deletion of your account and associated data at any time (see Section 7).`,
  },
  {
    heading: "6. Security",
    body: `Passwords are hashed with bcrypt and never stored or transmitted in plain text. Password-reset tokens are single-use, time-limited, and stored as hashes. Access to administrative functions is restricted to authorized accounts only.`,
  },
  {
    heading: "7. Your rights under the Data Privacy Act",
    body: `Under RA 10173, you have the right to be informed, to access your personal data, to correct inaccurate data, to object to processing, to erasure or blocking of your data, to data portability, and to file a complaint with the National Privacy Commission (NPC). To exercise any of these rights for your AlgoBlocks account, contact the platform administrator through your institution.`,
    links: [
      { label: "File a complaint with the NPC", href: "https://privacy.gov.ph/" },
    ],
  },
  {
    heading: "8. Changes to this policy",
    body: `As this is an active academic project, this policy may be updated as the platform evolves. Continued use of AlgoBlocks after an update constitutes acknowledgment of the revised policy.`,
  },
];

const TERMS_SECTIONS = [
  {
    heading: "1. Acceptance of terms",
    body: `By creating an account, you agree to these Terms and Conditions and to the accompanying Privacy Policy. If you do not agree, please do not register for or use AlgoBlocks.`,
  },
  {
    heading: "2. Nature of the platform",
    body: `AlgoBlocks is an academic, thesis-scope educational tool for learning algorithm complexity analysis through visual block-based programming. It is not a commercial product: it does not carry commercial-grade uptime, support, or data-backup guarantees, and features may change as the underlying research project develops.`,
  },
  {
    heading: "3. Account responsibilities",
    body: `You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate registration information and promptly notify an administrator of any unauthorized use of your account.`,
  },
  {
    heading: "4. Acceptable use",
    body: `You agree to use AlgoBlocks only for its intended educational purpose. You may not attempt to disrupt the platform, probe or bypass its security controls without authorization, submit malicious code intended to harm the system or other users, or use another person's account without permission.`,
  },
  {
    heading: "5. Your content",
    body: `Programs, code, and projects you create and save on AlgoBlocks remain yours. By saving them, you grant the platform the limited right to store and process them so the platform can function (e.g., running your code for complexity analysis, displaying it back to you) and, in de-identified/aggregate form, to support the academic evaluation of the system.`,
  },
  {
    heading: "6. No warranty",
    body: `AlgoBlocks is provided "as is" as an academic prototype, without warranties of any kind, express or implied, including but not limited to fitness for a particular purpose or uninterrupted availability.`,
  },
  {
    heading: "7. Changes and termination",
    body: `Access may be suspended for accounts found to violate these terms. These Terms and Conditions may be updated as the project develops; continued use after a change constitutes acceptance of the update.`,
  },
];

export default function PolicyModal({ isOpen, onClose, type = "privacy" }) {
  if (!isOpen) return null;

  const isPrivacy = type === "privacy";
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return createPortal(
    <div className="policy-modal-overlay" onClick={onClose}>
      <div className="policy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="policy-modal-header">
          <div className="policy-modal-title">
            {isPrivacy ? <FiShield size={19} /> : <FiFileText size={19} />}
            <h2>{isPrivacy ? "Privacy Policy" : "Terms and Conditions"}</h2>
          </div>
          <button className="policy-modal-close" onClick={onClose} aria-label="Close">
            <FiX size={20} />
          </button>
        </div>

        {isPrivacy && (
          <a
            className="policy-modal-badge policy-modal-badge-link"
            href="https://privacy.gov.ph/data-privacy-act/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Compliant with the Data Privacy Act of 2012 (Republic Act No. 10173) — learn more ↗
          </a>
        )}

        <div className="policy-modal-body">
          {sections.map((s) => (
            <div key={s.heading} className="policy-section">
              <h3>{s.heading}</h3>
              <p>{s.body}</p>
              {s.links && s.links.length > 0 && (
                <div className="policy-section-links">
                  {s.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="policy-section-link"
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="policy-modal-footer">
          <button className="policy-modal-done-btn" onClick={onClose}>
            I've read this
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
