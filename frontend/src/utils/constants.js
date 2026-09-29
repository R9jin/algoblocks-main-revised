// frontend/src/utils/constants.js

// Single source of truth for the support/admin contact address shown across
// the auth flow (signup confirmation, verification failure, suspended/
// unverified sign-in errors). Keep this in sync with api/services/
// mail_service.py's SUPPORT_EMAIL if it ever changes.
export const SUPPORT_EMAIL = "algoblocks.app@gmail.com";

// UI-only switch: hides every per-module quiz ("Module N Verification Quiz" /
// "Post-Module Assessment") from the interface. Underlying quiz logic, routes,
// stored scores and unlock gating are untouched -- flip to false to show again.
export const HIDE_MODULE_QUIZZES = true;
