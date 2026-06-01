// frontend/src/context/PyodideContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PyodideContext = createContext(null);

export const PyodideProvider = ({ children }) => {
    const [worker, setWorker] = useState(null);
    const [isEngineReady, setIsEngineReady] = useState(false);
    const workerInitialized = useRef(false);

    const initGlobalWorker = () => {
        if (workerInitialized.current) return;
        workerInitialized.current = true;

        const newWorker = new Worker(
            new URL("../workers/analyzer.worker.js", import.meta.url),
            { type: "module" }
        );

        newWorker.postMessage({ type: "INIT_ENGINE" });

        newWorker.addEventListener("message", (event) => {
            if (event.data.type === "ENGINE_READY") {
                setIsEngineReady(true);
            }
        });

        setWorker(newWorker);
    };

    const resetWorker = () => {
        setWorker((prevWorker) => {
            if (prevWorker) prevWorker.terminate();

            setIsEngineReady(false);
            const newWorker = new Worker(
                new URL("../workers/analyzer.worker.js", import.meta.url),
                { type: "module" }
            );

            newWorker.postMessage({ type: "INIT_ENGINE" });

            newWorker.addEventListener("message", (event) => {
                if (event.data.type === "ENGINE_READY") setIsEngineReady(true);
            });

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
        <PyodideContext.Provider value={{ worker, isEngineReady, resetWorker }}>
            {children}
        </PyodideContext.Provider>
    );
};

export const usePyodide = () => useContext(PyodideContext);