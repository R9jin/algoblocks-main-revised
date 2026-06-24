// frontend/src/components/OfflineIndicator.jsx
import { useEffect, useRef, useState } from 'react';

// Global variable to enforce a Strict Singleton pattern.
// This guarantees only ONE popup can ever exist in the DOM, 
// even if the component is accidentally rendered in multiple files.
let activeInstanceId = null;

export default function OfflineIndicator() {
    const [status, setStatus] = useState('online'); 
    const [isVisible, setIsVisible] = useState(false);
    const [isPrimary, setIsPrimary] = useState(false);
    
    const statusRef = useRef('online');
    const hideTimeoutRef = useRef(null);
    const abortControllerRef = useRef(null);
    const instanceId = useRef(Math.random().toString(36).substring(2, 9));

    useEffect(() => {
        // --- Singleton Logic ---
        if (!activeInstanceId) {
            activeInstanceId = instanceId.current;
            setIsPrimary(true);
        } else if (activeInstanceId !== instanceId.current) {
            return; // A primary instance already exists. Ignore this duplicate.
        }

        // --- Network Logic ---
        const triggerOnline = () => {
            if (statusRef.current === 'offline') {
                statusRef.current = 'restored';
                setStatus('restored');
                setIsVisible(true);

                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

                hideTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                    setTimeout(() => {
                        if (statusRef.current === 'restored') {
                            statusRef.current = 'online';
                            setStatus('online');
                        }
                    }, 400); 
                }, 3000);
            }
        };

        const triggerOffline = () => {
            if (statusRef.current !== 'offline') {
                statusRef.current = 'offline';
                setStatus('offline');
                setIsVisible(true);
                
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

                hideTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                }, 10000); 
            }
        };

        const handleOnline = () => {
            checkRealConnectivity();
        };

        const handleOffline = () => {
            // Instantly cancel any pending background checks to prevent race conditions
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            triggerOffline();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkRealConnectivity = async () => {
            if (!navigator.onLine) {
                triggerOffline();
                return;
            }

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();
            const signal = abortControllerRef.current.signal;

            try {
                // Add a 3 second timeout so the fetch doesn't hang indefinitely on poor networks
                const timeoutId = setTimeout(() => {
                    if (abortControllerRef.current) abortControllerRef.current.abort();
                }, 3000);

                await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: signal
                });
                
                clearTimeout(timeoutId);
                
                if (!signal.aborted) {
                    triggerOnline();
                }
            } catch (error) {
                if (!signal.aborted) {
                    triggerOffline();
                }
            }
        };

        const pollingInterval = setInterval(checkRealConnectivity, 5000);
        checkRealConnectivity();

        return () => {
            if (activeInstanceId === instanceId.current) {
                activeInstanceId = null;
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                clearInterval(pollingInterval);
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                if (abortControllerRef.current) abortControllerRef.current.abort();
            }
        };
    }, []);

    // If this is a duplicate mount, render absolutely nothing!
    if (!isPrimary) return null;

    return (
        <div className={`network-popup ${status} ${isVisible ? 'show' : 'hide'}`}>
            <div className="network-popup-content">
                {status === 'offline' ? (
                    <>
                        <span className="network-icon">⚠️</span>
                        <div>
                            <strong>Connection Lost</strong>
                            <p>You are working offline. Changes will sync later.</p>
                        </div>
                    </>
                ) : (
                    <>
                        <span className="network-icon">✅</span>
                        <div>
                            <strong>Back Online</strong>
                            <p>Your connection has been restored.</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}