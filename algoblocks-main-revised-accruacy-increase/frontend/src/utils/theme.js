// frontend/src/utils/theme.js
//
// App-wide colour theme. The choice ("light" | "dark" | "system") is stored in
// localStorage and applied as `data-theme="light|dark"` on <html>; the dark
// palette lives in styles/DarkTheme.css. A tiny inline script in index.html
// applies the stored theme before first paint so there is no light flash.

export const THEME_KEY = "algoblocks-theme";
export const THEME_CHANGE_EVENT = "algoblocks-theme-change";
export const THEME_OPTIONS = ["light", "dark", "system"];

export function getThemePreference() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_OPTIONS.includes(v) ? v : "light";
  } catch {
    return "light";
  }
}

const prefersDark = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export function resolveTheme(pref = getThemePreference()) {
  return pref === "system" ? (prefersDark() ? "dark" : "light") : pref;
}

export function applyTheme(pref = getThemePreference()) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  return resolved;
}

export function setThemePreference(pref) {
  if (!THEME_OPTIONS.includes(pref)) return;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage unavailable (private mode): the choice just won't persist */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: pref }));
}

// Call once at startup: applies the saved theme and keeps "system" and other
// tabs in sync.
export function initTheme() {
  applyTheme();
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getThemePreference() === "system") applyTheme("system"); };
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
  }
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) {
      applyTheme();
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: getThemePreference() }));
    }
  });
}
