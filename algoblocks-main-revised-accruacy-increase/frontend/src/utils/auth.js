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

// Decodes the payload of a Google Identity Services credential (a JWT)
// purely for DISPLAY purposes -- e.g. showing the verified Google email on
// the signup form. This does NOT verify the token's signature, expiry, or
// audience; it's just reading the already-base64 payload the browser
// already has. It must never be trusted for anything security-relevant --
// the backend independently re-verifies the raw token itself (see
// AuthService.signup_with_google / google_login) and derives the account's
// real email from that, not from anything decoded here.
export function decodeJwtPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
