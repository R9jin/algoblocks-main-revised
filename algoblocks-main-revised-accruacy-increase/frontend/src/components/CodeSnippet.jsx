// frontend/src/components/CodeSnippet.jsx
import DOMPurify from "dompurify";
import { useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";

export default function CodeSnippet({ snippet }) {
  const { title, language = "text", code = "" } = snippet || {};
  const [copied, setCopied] = useState(false);

  // BUG-19 Fix: Toggle Copied confirmation indicator
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("copy failed", e);
    }
  };

  // BUG-16 Fix: Standardized DOMPurify AST HTML sanitization
  const cleanHtml = DOMPurify.sanitize(code);

  return (
    <div className="code-snippet-wrapper">
      <div className="code-snippet-header">
        <strong>{title || (language + " snippet")}</strong>
        <div className="code-snippet-meta">{language}</div>
        <button className="code-copy-button" onClick={copy} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {copied ? (
            <>
              <FiCheck style={{ color: "#10B981" }} />
              <span style={{ color: "#10B981" }}>Copied!</span>
            </>
          ) : (
            <>
              <FiCopy />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={`code-block language-${language}`}>
        <code dangerouslySetInnerHTML={{ __html: cleanHtml }} />
      </pre>
    </div>
  );
}