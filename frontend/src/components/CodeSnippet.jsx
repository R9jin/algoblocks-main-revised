import React from "react";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function CodeSnippet({ snippet }) {
  const { title, language = "text", code = "" } = snippet || {};

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      // minimal feedback — could be enhanced
    } catch (e) {
      console.warn("copy failed", e);
    }
  };

  return (
    <div className="code-snippet-wrapper">
      <div className="code-snippet-header">
        <strong>{title || (language + " snippet")}</strong>
        <div className="code-snippet-meta">{language}</div>
        <button className="code-copy-button" onClick={copy}>Copy</button>
      </div>
      <pre className={`code-block language-${language}`}>
        <code dangerouslySetInnerHTML={{ __html: escapeHtml(code) }} />
      </pre>
    </div>
  );
}
