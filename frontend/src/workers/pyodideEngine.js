// frontend/src/workers/pyodideEngine.js
//
// Single, app-lifetime Pyodide worker/engine.
//
// PREVIOUSLY: <PyodideProvider> created a fresh Worker in a useEffect on
// mount and terminated it in that same effect's cleanup on unmount (see
// git history of context/PyodideContext.jsx). App.jsx then wrapped that
// provider around each *individual* protected route (/app, /workspace,
// /activity/:id, /accuracy, /admin/evaluation-suite, and the admin branch
// of /dashboard) separately. Two consequences:
//
//   1. Navigating between any two of those pages unmounted one
//      <PyodideProvider> and mounted a different one, so the ~13MB
//      Pyodide WASM runtime plus every Python engine module was
//      re-downloaded and Python was re-initialized from scratch on EVERY
//      navigation -- slow on a good connection, and prone to just failing
//      outright on an unstable one.
//   2. Signing out (or any redirect that unmounted the current route)
//      terminated the worker outright, so signing back in -- even
//      straight into the admin Dataset Testing screen -- always started
//      from zero: no engine, no warmed-up WASM, nothing.
//
// This module fixes both by owning exactly one Worker for the whole tab
// session, independent of React's mount/unmount lifecycle entirely.
// startEngine() is safe to call as often as you like (every page that
// needs the analyzer calls it, plus a root-level "the user is signed in"
// effect in App.jsx) -- only the very first call actually creates
// anything. Once started, the worker is never torn down by navigation or
// sign-out; only an explicit restartEngine() call (used for runaway
// user-code recovery in MainApp/ActivityApp) replaces it.

const INITIAL_PROGRESS = { stage: "Preparing Python engine...", percent: 0 };

let started = false;
let state = {
    worker: null,
    isEngineReady: false,
    progress: INITIAL_PROGRESS,
    engineError: null,
};

const listeners = new Set();

function setState(patch) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => {
        try {
            fn(state);
        } catch (e) {
            console.error("pyodideEngine listener error:", e);
        }
    });
}

function attachListeners(instance) {
    instance.addEventListener("message", (event) => {
        const { type } = event.data || {};
        if (type === "ENGINE_READY") {
            setState({ progress: { stage: "Ready", percent: 100 }, isEngineReady: true, engineError: null });
        } else if (type === "ENGINE_PROGRESS") {
            setState({ progress: { stage: event.data.stage, percent: event.data.percent } });
        } else if (type === "ENGINE_ERROR") {
            setState({ engineError: event.data.message || "Failed to load the Python engine." });
        }
    });
}

function createWorker() {
    const instance = new Worker(new URL("./analyzer.worker.js", import.meta.url), { type: "module" });
    attachListeners(instance);
    instance.postMessage({ type: "INIT_ENGINE" });
    return instance;
}

// Kicks off the engine's download/initialization exactly once per tab
// session. Call this as early as possible -- ideally the moment a user
// signs in -- rather than waiting for them to navigate into a page that
// uses it, so the multi-megabyte download has already had a head start by
// the time they actually press "Run" or "Start Evaluation".
export function startEngine() {
    if (started) return state.worker;
    started = true;
    setState({ worker: createWorker() });
    return state.worker;
}

// Only for runaway user-code recovery (an infinite loop / hung execution
// that the worker had to be killed to escape) in MainApp/ActivityApp.
// Deliberately NOT called anywhere in the sign-out path -- signing out
// should never discard a warmed-up engine.
export function restartEngine() {
    if (state.worker) state.worker.terminate();
    setState({ worker: null, isEngineReady: false, engineError: null, progress: INITIAL_PROGRESS });
    started = true;
    setState({ worker: createWorker() });
    return state.worker;
}

export function getState() {
    return state;
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
