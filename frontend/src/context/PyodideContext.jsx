// frontend/src/context/PyodideContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PyodideContext = createContext(null);

export const PyodideProvider = ({ children }) => {
    const workerRef = useRef(null);
    const [isEngineReady, setIsEngineReady] = useState(false);

    const initGlobalWorker = () => {
        if (workerRef.current) return;

        // Initialize the worker once globally
        workerRef.current = new Worker(
            new URL("../workers/analyzer.worker.js", import.meta.url),
            { type: "module" }
        );

        // Boot Pyodide
        workerRef.current.postMessage({ type: "INIT_ENGINE" });

        // Global listeners can be attached here if needed
        const handleGlobalMessage = (event) => {
            if (event.data.type === "ENGINE_READY") {
                setIsEngineReady(true);
            }
        };
        workerRef.current.addEventListener("message", handleGlobalMessage);
    };

    // Re-instantiate worker safely if it needs hard reset due to an unrecoverable crash
    const resetWorker = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
        }
        setIsEngineReady(false);
        workerRef.current = new Worker(
            new URL("../workers/analyzer.worker.js", import.meta.url),
            { type: "module" }
        );
        workerRef.current.postMessage({ type: "INIT_ENGINE" });

        workerRef.current.addEventListener("message", (event) => {
            if (event.data.type === "ENGINE_READY") setIsEngineReady(true);
        });
    };

    useEffect(() => {
        initGlobalWorker();
        return () => {
            // Global cleanup only if app terminates completely
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    return (
        <PyodideContext.Provider value={{ worker: workerRef.current, isEngineReady, resetWorker }}>
            {children}
        </PyodideContext.Provider>
    );
};

export const usePyodide = () => useContext(PyodideContext);