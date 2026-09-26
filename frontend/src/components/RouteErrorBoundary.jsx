// frontend/src/components/RouteErrorBoundary.jsx
//
// BUG FIX: pages are all React.lazy()-loaded (see App.jsx), so navigating
// to a route the browser hasn't downloaded the JS chunk for yet triggers a
// network fetch of that chunk. Suspense only covers the *loading* state --
// it has no concept of a *failed* load. If that fetch fails (e.g. the user
// is offline and taps "Start Activity" on a page they haven't opened yet
// this session), the rejected import() throws during render. With nothing
// to catch it, React's default behavior unmounts the entire tree, which is
// exactly the "page suddenly blanks out and goes white" report -- the app
// didn't crash loudly, it just silently disappeared.
//
// This boundary catches that (and any other render-time error) and shows a
// small recoverable message instead of a blank screen. It specifically
// detects the lazy-chunk-load-failure shape (Vite/webpack both throw a
// TypeError mentioning "dynamically imported module" / "Failed to fetch")
// so the offline case gets an accurate, actionable message rather than a
// generic "Something went wrong."

import { Component } from "react";

function isChunkLoadError(error) {
  const msg = String(error?.message || "");
  return (
    /dynamically imported module/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /Loading chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    console.error("RouteErrorBoundary caught an error:", error, info);
  }

  handleRetry = () => {
    // A stale/half-loaded chunk reference can persist in memory, so a full
    // reload (not just resetting local state) is the reliable way to
    // recover -- this also re-checks connectivity naturally.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const offline = this.state.isChunkError && typeof navigator !== "undefined" && !navigator.onLine;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          color: "#e5e7eb",
          background: "#0f1115",
        }}
      >
        <h2 style={{ margin: 0 }}>
          {offline ? "You're offline" : "This page couldn't load"}
        </h2>
        <p style={{ margin: 0, maxWidth: 420, opacity: 0.85 }}>
          {offline
            ? "This activity hasn't been downloaded to this device yet, so it can't open without a connection. Reconnect and try again."
            : this.state.isChunkError
            ? "This part of AlgoBlocks couldn't be downloaded. Check your connection and try again."
            : "Something went wrong loading this page. Trying again usually fixes it."}
        </p>
        <button
          onClick={this.handleRetry}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#4f46e5",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}
