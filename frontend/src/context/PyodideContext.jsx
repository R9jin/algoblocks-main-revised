// frontend/src/context/PyodideContext.jsx
//
// Thin React wrapper around the app-lifetime Pyodide singleton in
// workers/pyodideEngine.js. This provider itself no longer owns a Worker
// (creating/terminating it on mount/unmount) -- it just subscribes to the
// singleton's state and re-renders when it changes, so mounting this
// provider in multiple places (or having it survive route changes) never
// creates duplicate engines or tears down a warmed-up one.
//
// `active` decides whether THIS mount should be allowed to *trigger* the
// engine to start (e.g. only once the user is actually signed in) -- it
// does not gate whether the engine keeps running. Once started, the
// engine keeps running regardless of what `active` does afterwards,
// including going back to `false` on sign-out.
import { createContext, useContext, useEffect, useState } from "react";
import { getState, restartEngine, startEngine, subscribe } from "../workers/pyodideEngine";

const PyodideContext = createContext(null);

export const PyodideProvider = ({ children, active = true }) => {
    const [engineState, setEngineState] = useState(getState());

    useEffect(() => {
        // Subscribing can race a state change that happened between the
        // initial useState(getState()) call and this effect running, so
        // resync once on mount in addition to subscribing.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEngineState(getState());
        return subscribe(setEngineState);
    }, []);

    useEffect(() => {
        if (active) startEngine();
    }, [active]);

    return (
        <PyodideContext.Provider
            value={{
                worker: engineState.worker,
                isEngineReady: engineState.isEngineReady,
                resetWorker: restartEngine,
                progress: engineState.progress,
                engineError: engineState.engineError,
            }}
        >
            {children}
        </PyodideContext.Provider>
    );
};

export const usePyodide = () => useContext(PyodideContext);
