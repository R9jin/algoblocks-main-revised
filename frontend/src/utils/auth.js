// frontend/src/utils/auth.js
// Central place for reading the locally-stored session and checking role.
// Both localStorage (Remember Me) and sessionStorage (session-only) are
// checked, matching the pattern already used across the app.

export function getCurrentUser() {
  const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (!stored || stored === "null" || stored === "undefined") return null;
  try {
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
}

// Check every admin identifier format the backend/frontend have historically
// used, so this stays compatible with whatever payload shape signed the
// user in.
export function isAdminUser(user) {
  const u = user || getCurrentUser();
  if (!u) return false;
  return u.role === "admin" || u.role === "Admin" || u.isAdmin === true || u.is_admin === true;
}
