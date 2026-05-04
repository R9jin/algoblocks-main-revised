// frontend/src/components/OfflineIndicator.jsx
import { useEffect, useRef, useState } from 'react';

export default function OfflineIndicator() {
    const [status, setStatus] = useState('online'); 
    const [isVisible, setIsVisible] = useState(false);
    
    // We no longer need the isFaded state since it's going to disappear completely
    
    const statusRef = useRef('online');
    
    // Use refs for the timeouts so they persist across renders
    const hideTimeoutRef = useRef(null);

    useEffect(() => {
        const triggerOnline = () => {
            if (statusRef.current === 'offline') {
                statusRef.current = 'restored';
                setStatus('restored');
                setIsVisible(true);

                // Clear any existing timeout so it doesn't hide prematurely
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

                // Hide the "Back Online" banner after 3 seconds
                hideTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                    // Give the CSS slide-up animation time to finish (400ms) before resetting status
                    setTimeout(() => {
                        statusRef.current = 'online';
                        setStatus('online');
                    }, 400); 
                }, 3000);
            }
        };

        const triggerOffline = () => {
            if (statusRef.current !== 'offline') {
                statusRef.current = 'offline';
                setStatus('offline');
                setIsVisible(true);
                
                // Clear any existing timeout
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

                // Hide the "Connection Lost" banner completely after 10 seconds
                hideTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                }, 10000); 
            }
        };

        window.addEventListener('online', triggerOnline);
        window.addEventListener('offline', triggerOffline);

        const checkRealConnectivity = async () => {
            if (!navigator.onLine) {
                triggerOffline();
                return;
            }
            try {
                await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
                    mode: 'no-cors',
                    cache: 'no-store',
                });
                triggerOnline();
            } catch (error) {
                triggerOffline();
            }
        };

        const pollingInterval = setInterval(checkRealConnectivity, 5000);
        checkRealConnectivity();

        return () => {
            window.removeEventListener('online', triggerOnline);
            window.removeEventListener('offline', triggerOffline);
            clearInterval(pollingInterval);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, []);

    // DO NOT ADD THE EARLY RETURN BACK IN!
    // if (!isVisible && status === 'online') return null;

    return (
        // Removed the faded class logic
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