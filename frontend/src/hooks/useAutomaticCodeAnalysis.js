import { useEffect, useRef } from "react";

// Shared by the scratch, activity, and pipeline workspaces. Editor syncing
// and connection status must not cancel analysis of the current source.
export default function useAutomaticCodeAnalysis({ code, sourceId, worker, enabled, onAnalyze }) {
  const analyzeRef = useRef(onAnalyze);
  useEffect(() => {
    analyzeRef.current = onAnalyze;
  }, [onAnalyze]);

  useEffect(() => {
    if (!enabled || !worker || !code?.trim() || code === "# Drag blocks to generate Python code") return;
    const timeoutId = setTimeout(() => analyzeRef.current(code, sourceId), 800);
    return () => clearTimeout(timeoutId);
  }, [code, sourceId, worker, enabled]);
}
