// frontend/src/components/PanelErrorBoundary.jsx
//
// Per-panel error boundary. A render error inside one panel (Complexity chart,
// Memory map, Monaco editor, Blockly) now shows a small themed message in that
// panel only, and "Try again" re-renders just the panel -- the rest of the page
// and all in-memory work stay put (no full reload).
import { Component, forwardRef } from "react";
import { resolveTheme } from "../utils/theme";

export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, attempt: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`PanelErrorBoundary (${this.props.name || "panel"}) caught an error:`, error, info);
  }

  handleRetry = () => {
    this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (!this.state.hasError) {
      return <PanelFragment key={this.state.attempt}>{this.props.children}</PanelFragment>;
    }
    const dark = resolveTheme() === "dark";
    return (
      <div
        role="alert"
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 10, padding: 16, height: "100%", minHeight: 120, textAlign: "center", boxSizing: "border-box",
          color: dark ? "#e5e7eb" : "#1f2937", background: dark ? "#161a22" : "#f9fafb",
          border: `1px solid ${dark ? "#2b3140" : "#e5e7eb"}`, borderRadius: 8,
        }}
      >
        <strong>{this.props.name || "This panel"} hit a problem</strong>
        <span style={{ fontSize: 13, opacity: 0.8, maxWidth: 360 }}>
          The rest of your workspace is fine and your work has not been lost.
        </span>
        <button
          onClick={this.handleRetry}
          style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    );
  }
}

// Keyed wrapper so "Try again" fully remounts the failed subtree.
function PanelFragment({ children }) {
  return children;
}

// HOC that keeps ref forwarding intact (BlocklyWorkspace exposes an imperative handle).
export function withPanelBoundary(Wrapped, name) {
  const Bounded = forwardRef(function Bounded(props, ref) {
    return (
      <PanelErrorBoundary name={name}>
        <Wrapped {...props} ref={ref} />
      </PanelErrorBoundary>
    );
  });
  Bounded.displayName = `withPanelBoundary(${name})`;
  return Bounded;
}
