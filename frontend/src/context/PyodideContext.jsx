// frontend/src/context/PyodideContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PyodideContext = createContext(null);

const INITIAL_PROGRESS = { stage: "Preparing Python engine...", percent: 0 };

export const PyodideProvider = ({ children }) => {
    const [worker, setWorker] = useState(null);
    const [isEngineReady, setIsEngineReady] = useState(false);
    const [progress, setProgress] = useState(INITIAL_PROGRESS);
    const [engineError, setEngineError] = useState(null);
    const workerInitialized = useRef(false);

    const attachListeners = (workerInstance) => {
        workerInstance.addEventListener("message", (event) => {
            if (event.data.type === "ENGINE_READY") {
                setProgress({ stage: "Ready", percent: 100 });
                setIsEngineReady(true);
                setEngineError(null);
            } else if (event.data.type === "ENGINE_PROGRESS") {
                setProgress({ stage: event.data.stage, percent: event.data.percent });
            } else if (event.data.type === "ENGINE_ERROR") {
                setEngineError(event.data.message || "Failed to load the Python engine.");
            }
        });
    };

    const initGlobalWorker = () => {
        if (workerInitialized.current) return;
        workerInitialized.current = true;

        const newWorker = new Worker(
            new URL("../workers/analyzer.worker.js", import.meta.url),
            { type: "module" }
        );

        attachListeners(newWorker);
        newWorker.postMessage({ type: "INIT_ENGINE" });
        setWorker(newWorker);
    };

    const resetWorker = () => {
        setWorker((prevWorker) => {
            if (prevWorker) prevWorker.terminate();

            setIsEngineReady(false);
            setEngineError(null);
            setProgress(INITIAL_PROGRESS);

            const newWorker = new Worker(
                new URL("../workers/analyzer.worker.js", import.meta.url),
                { type: "module" }
            );

            attachListeners(newWorker);
            newWorker.postMessage({ type: "INIT_ENGINE" });

            return newWorker;
        });
    };

    useEffect(() => {
        initGlobalWorker();
        return () => {
            setWorker((prevWorker) => {
                if (prevWorker) prevWorker.terminate();
                return null;
            });
            workerInitialized.current = false;
        };
    }, []);

    return (
        <PyodideContext.Provider value={{ worker, isEngineReady, resetWorker, progress, engineError }}>
            {children}
        </PyodideContext.Provider>
    );
};

export const usePyodide = () => useContext(PyodideContext);
