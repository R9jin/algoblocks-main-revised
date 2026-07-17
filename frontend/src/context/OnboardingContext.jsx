import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_PREFIX = "algoblocks_onboarding";
const OnboardingContext = createContext(null);

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
  const pendingSyncRef = useRef(false);
  const hydrateRequestIdRef = useRef(0);

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

    const syncRemote = async () => {
      if (!user?.email || user.isGuest || pendingSyncRef.current) return;
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      if (!token || !apiBase) return;
      pendingSyncRef.current = true;
      try {
        await fetch(`${apiBase}/api/update-onboarding`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ onboarding_state: state }),
        });
      } catch {
        // Ignore sync failures; local persistence still keeps the user experience consistent.
      } finally {
        pendingSyncRef.current = false;
      }
    };

    syncRemote();
  }, [state, user, userKey]);

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

  // Records that a tour was actually completed — the user reached the final
  // step and clicked Finish. This is the ONLY thing that should ever set a
  // page's `seen` flag, since `seen` is what pages check before deciding
  // whether to auto-show a tour again.
  const markPageCompleted = (pageId, completedAt = new Date().toISOString()) => {
    if (!pageId) return;
    setState((prev) => ({
      ...normalizeState(prev),
      tourSeen: true,
      completedAt: prev.completedAt || completedAt,
      pages: {
        ...normalizeState(prev).pages,
        [pageId]: {
          ...(normalizeState(prev).pages?.[pageId] || {}),
          seen: true,
          replayCount: Number(normalizeState(prev).pages?.[pageId]?.replayCount || 0),
          lastSeenAt: completedAt,
          lastCompletedAt: completedAt,
        },
      },
    }));
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
