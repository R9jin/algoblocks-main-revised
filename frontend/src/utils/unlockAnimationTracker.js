// frontend/src/utils/unlockAnimationTracker.js
//
// Shared between LearningPath.jsx and LessonViewer.jsx. Both pages
// recompute a "gate state" every render (a flat map of gateKey -> locked
// boolean, covering lessons, per-module optimizations, per-module quizzes,
// and the global final post-test). This module's only job is deciding
// which of those keys have *genuinely just* flipped from locked to
// unlocked, so the UI can play a one-time unlock animation for exactly
// those and never again.
//
// Persistence lives in localStorage, namespaced per user, because:
//  - a fresh mount (e.g. navigating away and back) loses any in-memory
//    "previous lock state", so an in-memory ref alone can't tell
//    "just unlocked this session" from "was already unlocked".
//  - the very first time this ships, everyone's *existing* progress
//    would otherwise look like one giant burst of new unlocks. The first
//    ever read for a user silently snapshots their current unlocked set
//    as "already seen" instead of animating it.

const STORAGE_PREFIX = "algoblocks_seenUnlocks_";

function loadSeen(userKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userKey);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : null;
  } catch (e) {
    return null;
  }
}

function saveSeen(userKey, set) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userKey, JSON.stringify(Array.from(set)));
  } catch (e) {
    // Storage unavailable/full: worst case is a re-shown animation later,
    // not a crash, so fail silently.
  }
}

/**
 * @param {string} userKey - stable per-user identifier (email works; falls
 *   back to "guest" so guests still get a consistent, if session-scoped,
 *   baseline instead of colliding with a signed-in user's key).
 * @param {Record<string, boolean>} gateState - key -> locked boolean.
 * @returns {string[]} keys that just transitioned from locked to unlocked
 *   and have never been shown as unlocked before for this user.
 */
export function detectNewlyUnlocked(userKey, gateState) {
  const key = userKey || "guest";
  const unlockedKeys = Object.keys(gateState).filter((k) => gateState[k] === false);
  const seen = loadSeen(key);

  if (seen === null) {
    // First time we've ever tracked this user: baseline silently.
    saveSeen(key, new Set(unlockedKeys));
    return [];
  }

  const fresh = unlockedKeys.filter((k) => !seen.has(k));
  if (fresh.length > 0) {
    const merged = new Set(seen);
    unlockedKeys.forEach((k) => merged.add(k));
    saveSeen(key, merged);
  }
  return fresh;
}
