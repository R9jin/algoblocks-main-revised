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

export function OnboardingProvider({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState(() => normalizeState());
  const [tour, setTour] = useState(null);
  const pendingSyncRef = useRef(false);

  const userKey = useMemo(() => getUserKey(user), [user]);

  useEffect(() => {
    const handleAuthChange = () => {
      try {
        const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!stored || stored === "undefined" || stored === "null") {
          setUser(null);
          setState(normalizeState());
          return;
        }
        const parsed = JSON.parse(stored);
        setUser(parsed);
        const localState = readStoredState(getUserKey(parsed));
        const merged = normalizeState({ ...(parsed.onboarding_state || {}), ...localState });
        setState(merged);
      } catch {
        setUser(null);
        setState(normalizeState());
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

  const markSystemSeen = (completedAt = new Date().toISOString()) => {
    setState((prev) => ({ ...normalizeState(prev), tourSeen: true, completedAt }));
  };

  const markPageSeen = (pageId, completedAt = new Date().toISOString()) => {
    if (!pageId) return;
    setState((prev) => ({
      ...normalizeState(prev),
      tourSeen: true,
      completedAt: prev.completedAt || completedAt,
      pages: {
        ...normalizeState(prev).pages,
        [pageId]: {
          seen: true,
          replayCount: Number(normalizeState(prev).pages?.[pageId]?.replayCount || 0),
          lastSeenAt: completedAt,
        },
      },
    }));
  };

  const markPageReplay = (pageId, completed = false) => {
    if (!pageId) return;
    setState((prev) => {
      const currentPage = normalizeState(prev).pages?.[pageId] || {};
      return {
        ...normalizeState(prev),
        pages: {
          ...normalizeState(prev).pages,
          [pageId]: {
            ...currentPage,
            seen: true,
            replayCount: Number(currentPage.replayCount || 0) + 1,
            lastOpenedAt: new Date().toISOString(),
            lastCompletedAt: completed ? new Date().toISOString() : currentPage.lastCompletedAt || null,
          },
        },
      };
    });
  };

  const api = useMemo(() => ({
    user,
    setUser,
    state,
    tour,
    startTour,
    closeTour,
    markSystemSeen,
    markPageSeen,
    markPageReplay,
    setState,
  }), [user, state, tour]);

  return <OnboardingContext.Provider value={api}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return value;
}
