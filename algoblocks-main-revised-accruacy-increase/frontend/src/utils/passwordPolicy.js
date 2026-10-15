// frontend/src/utils/passwordPolicy.js
//
// Mirrors the server-side rule in api/models.py (_validate_password_strength).
// This is a UX convenience only -- catching an obviously-too-weak password
// before the user hits submit -- NOT the real enforcement. The backend
// validator is what actually matters, since anyone can bypass this file
// entirely by calling the API directly. Keep both in sync if the rule ever
// changes.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS = [
  { key: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { key: "letter", label: "At least one letter", test: (pw) => /[a-zA-Z]/.test(pw) },
  { key: "number", label: "At least one number", test: (pw) => /[0-9]/.test(pw) },
];

/**
 * Returns the first unmet requirement's label, or null if the password
 * satisfies all of them.
 */
export function getPasswordPolicyError(password) {
  const failed = PASSWORD_REQUIREMENTS.find((req) => !req.test(password || ""));
  if (!failed) return null;
  if (failed.key === "length") return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  if (failed.key === "letter") return "Password must include at least one letter.";
  if (failed.key === "number") return "Password must include at least one number.";
  return "Password doesn't meet the requirements.";
}
