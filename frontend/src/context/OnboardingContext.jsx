import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_PREFIX = "algoblocks_onboarding";
const OnboardingContext = createContext(null);

// The four curated per-activity intro tours (see introActivityTours.js) each
// walk through the SAME generic workspace chrome (Run button, console,
// test cases, Evaluate Efficiency) as part of teaching their specific
// concept -- they're a superset of the generic fallback `activityTour`
// defined in ActivityApp.jsx, not a separate thing. But each curated tour
// is stored under its own unique pageId ("activity-{moduleId}-{activityId}"),
// while the fallback always uses one shared pageId
// ("activity-workspace-tour"). Without this link, finishing or skipping a
// curated tour on a lesson's first activity never marked the fallback's
// pageId as seen, so the very next activity in the same lesson (which has
// no curated tour of its own and falls back to the generic one) auto-showed
// the tour again -- even though the learner had just gone through
// (or explicitly skipped) essentially the same walkthrough seconds earlier.
const GENERIC_ACTIVITY_TOUR_PAGE_ID = "activity-workspace-tour";
const isCuratedActivityTourPageId = (pageId) =>
  typeof pageId === "string" && pageId.startsWith("activity-") && pageId !== GENERIC_ACTIVITY_TOUR_PAGE_ID;

const getUserKey = (user) => {
  const email = user?.email || user?.name || "anonymous";
  return `${STORAGE_PREFIX}_${email}`;
};

const normalizeState = (state = {}) => ({
  tourSeen: state.tourSeen === true,
  completedAt: state.completedAt || null,
  pages: state.pages && typeof state.pages === "object" ? state.pages : {},
});

const readStoredState = (userKey) => {
  try {
    const raw = localStorage.getItem(userKey);
    if (!raw) return normalizeState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState();
  }
};

const writeStoredState = (userKey, state) => {
  try {
    localStorage.setItem(userKey, JSON.stringify(normalizeState(state)));
  } catch {
    // Ignore storage failures; the in-memory state still works for the session.
  }
};

// Combines the onboarding state that came back from the backend (the source of
// truth, tied to the user's account) with whatever is cached locally in this
// browser. This must be a non-destructive UNION, never a plain overwrite:
// logging out clears localStorage (see UserHeader/UserHomePage/index.jsx logout
// handlers), which would otherwise wipe the local cache back to "not seen" and,
// on the next login, stomp on the correct "already seen" flag that the backend
// just supplied. By OR-ing/merging fields instead of letting one side blindly
// replace the other, a tour that was ever marked seen (locally OR remotely)
// stays marked seen no matter how many times the user logs out and back in.
const mergeOnboardingStates = (remoteState, localState) => {
  const remote = normalizeState(remoteState);
  const local = normalizeState(localState);

  const pageIds = new Set([...Object.keys(remote.pages), ...Object.keys(local.pages)]);
  const pages = {};
  pageIds.forEach((pageId) => {
    const r = remote.pages[pageId] || {};
    const l = local.pages[pageId] || {};
    pages[pageId] = {
      seen: r.seen === true || l.seen === true,
      replayCount: Math.max(Number(r.replayCount || 0), Number(l.replayCount || 0)),
      lastSeenAt: r.lastSeenAt || l.lastSeenAt || null,
      lastOpenedAt: r.lastOpenedAt || l.lastOpenedAt || null,
      lastCompletedAt: r.lastCompletedAt || l.lastCompletedAt || null,
      lastSkippedAt: r.lastSkippedAt || l.lastSkippedAt || null,
    };
  });

  return normalizeState({
    tourSeen: remote.tourSeen === true || local.tourSeen === true,
    completedAt: remote.completedAt || local.completedAt || null,
    pages,
  });
};

export function OnboardingProvider({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState(() => normalizeState());
  const [tour, setTour] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const hydrateRequestIdRef = useRef(0);

  // Always holds the latest state, read inside the sync loop below so a
  // request that starts mid-loop never sends a stale snapshot.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // dirtyRef tracks whether state has changed since the sync loop's last
  // request went out; syncLoopPromiseRef tracks whether a loop is
  // currently in flight. Together these guarantee the backend eventually
  // receives the *latest* state no matter how many times it changes in
  // quick succession. The previous implementation used a simple boolean
  // guard that silently dropped any state change arriving while a request
  // was already in flight — e.g. markPageOpened's write racing the
  // markPageCompleted write moments later when a user blows through
  // Skip/Finish quickly — which is exactly the race condition that let a
  // completed/skipped tour "come back" on the next activity because the
  // completion never actually reached Postgres.
  const dirtyRef = useRef(false);
  const syncLoopPromiseRef = useRef(null);

  const userKey = useMemo(() => getUserKey(user), [user]);

  // Explicitly re-fetches onboarding progress from Postgres and reconciles it
  // into state. This is the authoritative source: the onboarding_state
  // embedded in the login/signup response can go stale (e.g. a previous
  // sync from another tab/device landed after that response was generated),
  // so every auth-change re-confirms against the server rather than trusting
  // only what was cached at login time or in localStorage.
  const hydrateFromServer = (parsedUser) => {
    const requestId = ++hydrateRequestIdRef.current;
    if (!parsedUser?.email || parsedUser.isGuest) {
      setIsHydrated(true);
      return;
    }
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    if (!token || !apiBase) {
      setIsHydrated(true);
      return;
    }

    fetch(`${apiBase}/api/get-onboarding`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // A newer auth-change (e.g. a second, faster login) started after
        // this request went out — drop this stale response instead of
        // clobbering whatever the newer request already resolved.
        if (requestId !== hydrateRequestIdRef.current) return;
        if (data?.onboarding_state) {
          setState((prev) => {
            const merged = mergeOnboardingStates(data.onboarding_state, prev);
            writeStoredState(getUserKey(parsedUser), merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // Offline or the request failed: fall back to whatever was already
        // merged from the login payload + local cache. Don't block forever.
      })
      .finally(() => {
        if (requestId === hydrateRequestIdRef.current) setIsHydrated(true);
      });
  };

  useEffect(() => {
    const handleAuthChange = () => {
      try {
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!stored || stored === "undefined" || stored === "null") {
          setUser(null);
          setState(normalizeState());
          setIsHydrated(true);
          return;
        }
        const parsed = JSON.parse(stored);
        setUser(parsed);
        const localState = readStoredState(getUserKey(parsed));
        // Union, don't overwrite: a wiped-out local cache (e.g. right after a
        // fresh login post-logout) must never downgrade a tour that the
        // backend already knows was seen.
        const merged = mergeOnboardingStates(parsed.onboarding_state, localState);
        setState(merged);
        // Immediately re-persist the merged/reconciled result locally so this
        // device's cache reflects the union rather than staying stale.
        writeStoredState(getUserKey(parsed), merged);
        setIsHydrated(false);
        hydrateFromServer(parsed);
      } catch {
        setUser(null);
        setState(normalizeState());
        setIsHydrated(true);
      }
    };

    handleAuthChange();
    window.addEventListener("storage", handleAuthChange);
    window.addEventListener("focus", handleAuthChange);
    window.addEventListener("localDataSynced", handleAuthChange);
    return () => {
      window.removeEventListener("storage", handleAuthChange);
      window.removeEventListener("focus", handleAuthChange);
      window.removeEventListener("localDataSynced", handleAuthChange);
    };
  }, []);

  // Sends whatever is currently in stateRef to Postgres. Loops instead of
  // sending once: if `state` changes again while this request is in flight
  // (dirtyRef gets set by the effect below, or by a concurrent caller), it
  // immediately goes around again with the newer snapshot rather than
  // dropping it. Returns the in-flight promise if a loop is already
  // running, so callers that need to know the *latest* state has actually
  // reached the backend (e.g. right after Skip/Finish, before the user can
  // navigate away) can genuinely await it instead of firing-and-forgetting.
  const runSyncLoop = () => {
    dirtyRef.current = true;

    if (syncLoopPromiseRef.current) {
      return syncLoopPromiseRef.current;
    }

    const currentUser = userRef.current;
    if (!currentUser?.email || currentUser.isGuest) return Promise.resolve();

    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    if (!token || !apiBase) return Promise.resolve();

    const loopPromise = (async () => {
      try {
        while (dirtyRef.current) {
          dirtyRef.current = false;
          const payload = stateRef.current;
          try {
            await fetch(`${apiBase}/api/update-onboarding`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ onboarding_state: payload }),
            });
          } catch {
            // Network hiccup — if nothing newer came in while this was in
            // flight, give up for now; the next state change (or the next
            // flushOnboardingSync() call) will retry with fresh data.
            break;
          }
        }
      } finally {
        syncLoopPromiseRef.current = null;
      }
    })();

    syncLoopPromiseRef.current = loopPromise;
    return loopPromise;
  };

  useEffect(() => {
    if (!user) return;
    writeStoredState(userKey, state);

    try {
      const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (stored && stored !== "undefined" && stored !== "null") {
        const parsed = JSON.parse(stored);
        const nextUser = { ...parsed, onboarding_state: state };
        const activeStorage = localStorage.getItem("user") ? localStorage : sessionStorage;
        activeStorage.setItem("user", JSON.stringify(nextUser));
      }
    } catch {
      // Best-effort only.
    }

    runSyncLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user, userKey]);

  // Lets a caller (e.g. the tour's Skip/Finish handlers) explicitly wait
  // for the current onboarding state to actually reach Postgres, instead
  // of relying on the debounced background effect above. This is what
  // guarantees "the onboarding status is saved immediately after Skip or
  // Finish" rather than racing whatever the user does next.
  const flushOnboardingSync = () => runSyncLoop();

  // Last-resort safety net for an actual page unload (closing the tab,
  // hard refresh, or a full-page navigation like the sign-out buttons)
  // happening before the in-flight request above resolves. `keepalive`
  // lets the browser complete a fetch that outlives the page, and unlike
  // navigator.sendBeacon it still supports the Authorization header this
  // endpoint requires.
  useEffect(() => {
    const flushOnUnload = () => {
      const currentUser = userRef.current;
      if (!currentUser?.email || currentUser.isGuest) return;
      if (!dirtyRef.current) return;
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      if (!token || !apiBase) return;
      try {
        fetch(`${apiBase}/api/update-onboarding`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ onboarding_state: stateRef.current }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Best-effort only.
      }
    };
    window.addEventListener("pagehide", flushOnUnload);
    window.addEventListener("beforeunload", flushOnUnload);
    return () => {
      window.removeEventListener("pagehide", flushOnUnload);
      window.removeEventListener("beforeunload", flushOnUnload);
    };
  }, []);

  const startTour = (tourConfig) => setTour(tourConfig);
  const closeTour = () => setTour(null);

  // Records that a tour was opened (auto-shown or manually replayed), purely
  // for bookkeeping (replayCount / lastOpenedAt). This must NEVER set
  // `seen: true` — "seen" means the tour was actually completed, and is the
  // only flag anything should gate auto-showing on. Getting this backwards
  // (marking seen the moment a tour merely starts) is what previously let
  // people dismiss/skip/refresh past a tour and never see it again even
  // though they'd never finished it.
  const markPageOpened = (pageId) => {
    if (!pageId) return;
    setState((prev) => {
      const currentPage = normalizeState(prev).pages?.[pageId] || {};
      return {
        ...normalizeState(prev),
        pages: {
          ...normalizeState(prev).pages,
          [pageId]: {
            ...currentPage,
            replayCount: Number(currentPage.replayCount || 0) + 1,
            lastOpenedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  // When a curated per-activity intro tour is finished or skipped, its
  // content has effectively already covered the generic fallback tour too
  // (see the GENERIC_ACTIVITY_TOUR_PAGE_ID comment above) -- mark the
  // fallback seen at the same time, unless it's already been individually
  // seen/opened before (in which case leave its own bookkeeping alone).
  const withLinkedGenericTour = (pages, pageId, timestamp) => {
    if (!isCuratedActivityTourPageId(pageId)) return pages;
    const existingGeneric = pages[GENERIC_ACTIVITY_TOUR_PAGE_ID] || {};
    if (existingGeneric.seen) return pages;
    return {
      ...pages,
      [GENERIC_ACTIVITY_TOUR_PAGE_ID]: {
        ...existingGeneric,
        seen: true,
        replayCount: Number(existingGeneric.replayCount || 0),
        lastSeenAt: timestamp,
        lastCompletedAt: existingGeneric.lastCompletedAt || null,
        lastSkippedAt: existingGeneric.lastSkippedAt || timestamp,
      },
    };
  };

  // Records that a tour was actually completed — the user reached the final
  // step and clicked Finish. Sets `seen: true` (the flag pages check before
  // auto-showing a tour again) and records lastCompletedAt for analytics.
  const markPageCompleted = (pageId, completedAt = new Date().toISOString()) => {
    if (!pageId) return;
    setState((prev) => {
      const normalized = normalizeState(prev);
      const pagesWithPrimary = {
        ...normalized.pages,
        [pageId]: {
          ...(normalized.pages?.[pageId] || {}),
          seen: true,
          replayCount: Number(normalized.pages?.[pageId]?.replayCount || 0),
          lastSeenAt: completedAt,
          lastCompletedAt: completedAt,
        },
      };
      return {
        ...normalized,
        tourSeen: true,
        completedAt: normalized.completedAt || completedAt,
        pages: withLinkedGenericTour(pagesWithPrimary, pageId, completedAt),
      };
    });
  };

  // Records that a tour was explicitly dismissed via "Skip Tour". Per the
  // current requirements this ALSO permanently stops it from auto-showing
  // again (seen: true) — the distinction from markPageCompleted is only
  // that lastSkippedAt is set instead of lastCompletedAt, so it's still
  // possible to tell "finished" apart from "skipped" for analytics without
  // affecting the auto-show gate, which checks `seen` either way.
  const markPageDismissed = (pageId, dismissedAt = new Date().toISOString()) => {
    if (!pageId) return;
    setState((prev) => {
      const normalized = normalizeState(prev);
      const pagesWithPrimary = {
        ...normalized.pages,
        [pageId]: {
          ...(normalized.pages?.[pageId] || {}),
          seen: true,
          replayCount: Number(normalized.pages?.[pageId]?.replayCount || 0),
          lastSeenAt: dismissedAt,
          lastSkippedAt: dismissedAt,
        },
      };
      return {
        ...normalized,
        pages: withLinkedGenericTour(pagesWithPrimary, pageId, dismissedAt),
      };
    });
  };

  const api = useMemo(() => ({
    user,
    setUser,
    state,
    isHydrated,
    tour,
    startTour,
    closeTour,
    markPageOpened,
    markPageCompleted,
    markPageDismissed,
    flushOnboardingSync,
    setState,
  }), [user, state, isHydrated, tour]);

  return <OnboardingContext.Provider value={api}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return value;
}
