// frontend/src/hooks/useResolvedTheme.js
//
// Returns "light" | "dark" -- the theme that is actually applied to <html>
// (so "system" is already resolved) -- and re-renders when it changes.
//
// CSS-only dark mode covers most of the app, but a few surfaces are painted
// by JavaScript (the Monaco editor theme, the SVG call graph). Those read
// this hook instead of duplicating the matchMedia / storage logic from
// utils/theme.js: it just watches the `data-theme` attribute that
// applyTheme() writes, which also covers OS-level changes and other tabs.
import { useSyncExternalStore } from "react";

const read = () =>
  typeof document !== "undefined" &&
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

const subscribe = (onChange) => {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
};

export default function useResolvedTheme() {
  return useSyncExternalStore(subscribe, read, () => "light");
}
