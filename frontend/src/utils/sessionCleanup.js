// Shared sign-out cleanup.
//
// Tries a short, bounded sync first, then wipes the per-user IndexedDB stores
// ONLY if nothing unsynced is left, so signing out never discards work that
// hasn't reached the server yet. Always removes the auth keys.
import { projectsDB, templatesDB, progressDB, assessmentsDB, submissionsDB, syncQueueDB, clearLocalUserData } from "../db";
import { syncManager, stopBackgroundSync } from "./syncManager";

const AUTH_KEYS = ["token", "authToken", "user"];

export function removeAuthKeys() {
  AUTH_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
    try { sessionStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
  });
}

async function hasUnsyncedLocalData() {
  try {
    const [progress, assessments, submissions, projects, templates, queue] = await Promise.all([
      progressDB.getAll(), assessmentsDB.getAll(), submissionsDB.getAll(),
      projectsDB.getAll(), templatesDB.getAll(), syncQueueDB.getAll(),
    ]);
    const unsynced = (list) => (list || []).some((item) => item && item.isSynced === false);
    return (queue || []).length > 0 || [progress, assessments, submissions, projects, templates].some(unsynced);
  } catch (e) {
    return true; // can't tell: keep the data rather than risk losing it
  }
}

export async function endSession({ syncBudgetMs = 2000, canSync = true } = {}) {
  try { stopBackgroundSync(); } catch (e) { /* not running */ }
  if (canSync && typeof navigator !== "undefined" && navigator.onLine) {
    await Promise.race([
      Promise.resolve().then(() => syncManager.processSyncQueue()).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, syncBudgetMs)),
    ]);
  }
  let cleared = false;
  try {
    if (!(await hasUnsyncedLocalData())) { await clearLocalUserData(); cleared = true; }
  } catch (e) { console.warn("Could not clear local user data:", e); }
  removeAuthKeys();
  return { cleared };
}
